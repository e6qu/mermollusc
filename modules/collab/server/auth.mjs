// OIDC token verification for the collaborative relay's `authorize` seam. A connection carries its
// access token in the first auth frame after the WebSocket opens; the verifier checks the JWT signature
// against the issuer's JWKS and the issuer/audience/expiry
// claims. Configured for Auth0 (decisions §10.4), but `createVerifier` works against any JWKS endpoint
// — which is how the test points it at a local key.
//
// Plain ESM (server-side, outside src/), using `jose` for JWKS fetch + RS256 verification.

import { createRemoteJWKSet, jwtVerify } from "jose";

// Namespaced custom claim (Auth0 requires a namespace) mapping room id → role for this user. Per-room
// roles ride in the token; the tenant is the standard Auth0 Organizations `org_id` claim.
const ROLES_CLAIM = "https://mermollusc.dev/roles";

const tokenFrom = (req) => {
  return typeof req.authToken === "string" ? req.authToken : null;
};

const userFrom = (payload) => ({
  sub: payload.sub ?? null,
  name: payload.name ?? null,
  email: payload.email ?? null,
  tenant: payload.org_id ?? null,
  roles: payload[ROLES_CLAIM] ?? null,
});

// Returns an async `authorize(req) -> { ok: true, user } | { ok: false, reason }`. A missing token, or
// any verification failure (bad signature, wrong issuer/audience, expired), is a definitive rejection —
// the relay closes the connection and logs the reason. `jose` caches the JWKS and rotates with it.
export const createVerifier = ({ jwksUri, issuer, audience }) => {
  const jwks = createRemoteJWKSet(new URL(jwksUri));
  return async (req) => {
    const token = tokenFrom(req);
    if (token === null) return { ok: false, reason: "no token" };
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      return { ok: true, user: userFrom(payload) };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "invalid token" };
    }
  };
};

// Auth0 sugar: derive the JWKS endpoint and issuer from the tenant domain.
export const createAuth0Authorizer = ({ domain, audience }) =>
  createVerifier({
    jwksUri: `https://${domain}/.well-known/jwks.json`,
    issuer: `https://${domain}/`,
    audience,
  });
