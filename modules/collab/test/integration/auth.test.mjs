// Local JWKS harness for the OIDC verifier: generate an RSA keypair, serve its public JWK from a tiny
// local endpoint, sign tokens with the private key, and assert the relay's `authorize` accepts a valid
// token (surfacing the user) and rejects every malformed/expired/wrong-claim one. No real Auth0 tenant,
// no socket — `authorize(req)` is exercised directly with request-shaped objects. Plain ESM (the server
// is .mjs), run by vitest.

import { createServer } from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createVerifier } from "../../server/auth.mjs";

const ISSUER = "https://test-tenant.example/";
const AUDIENCE = "https://api.mermollusc.test";
const KID = "test-key-1";

let server;
let privateKey;
let authorize;

beforeAll(async () => {
  const { publicKey, privateKey: sk } = await generateKeyPair("RS256");
  privateKey = sk;
  const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "RS256", use: "sig" };

  server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  const port = await new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });
  authorize = createVerifier({
    jwksUri: `http://localhost:${port}/.well-known/jwks.json`,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
});

afterAll(() => {
  server.close();
});

const sign = (claims, { issuer = ISSUER, audience = AUDIENCE, expSeconds = 3600 } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expSeconds)
    .sign(privateKey);

const req = (token) => (token === null ? { url: "/room" } : { url: "/room", authToken: token });

describe("collab OIDC authorize", () => {
  it("accepts a valid token and surfaces the user (incl. tenant + roles claims)", async () => {
    const token = await sign({
      sub: "auth0|user-123",
      name: "Ada",
      email: "ada@example.com",
      org_id: "org_acme",
      "https://mermollusc.dev/roles": { "org_acme/board1": "editor" },
    });
    const result = await authorize(req(token));
    expect(result.ok).toBe(true);
    expect(result.user).toEqual({
      sub: "auth0|user-123",
      name: "Ada",
      email: "ada@example.com",
      tenant: "org_acme",
      roles: { "org_acme/board1": "editor" },
    });
  });

  it("rejects a missing token", async () => {
    expect((await authorize(req(null))).ok).toBe(false);
  });

  it("rejects a malformed token", async () => {
    expect((await authorize(req("not.a.jwt"))).ok).toBe(false);
  });

  it("rejects a token with the wrong audience", async () => {
    const token = await sign({ sub: "u" }, { audience: "https://some.other.api" });
    expect((await authorize(req(token))).ok).toBe(false);
  });

  it("rejects a token from the wrong issuer", async () => {
    const token = await sign({ sub: "u" }, { issuer: "https://evil.example/" });
    expect((await authorize(req(token))).ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await sign({ sub: "u" }, { expSeconds: -60 });
    expect((await authorize(req(token))).ok).toBe(false);
  });
});
