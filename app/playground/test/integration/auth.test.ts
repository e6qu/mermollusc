import {
  authConfigFromEnv,
  clearAuth0Session,
  resumeAuth0Session,
  startAuth0Login,
  userFromToken,
  type AuthLocation,
} from "../../src/auth.js";
import { describe, expect, it } from "vitest";

class MemoryStorage implements Pick<Storage, "getItem" | "removeItem" | "setItem"> {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const locationOf = (search = "?collab&room=claims"): AuthLocation => ({
  origin: "https://app.example",
  pathname: "/demo/",
  search,
  hash: "#src=x",
});

const b64 = (text: string): string =>
  btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");

const jwt = (payload: object): string => `${b64("{}")}.${b64(JSON.stringify(payload))}.sig`;

const cryptoStub = () => ({
  getRandomValues: <T extends Exclude<BufferSource, ArrayBuffer>>(array: T): T => {
    if (array instanceof Uint8Array) array.fill(7);
    return array;
  },
  subtle: {
    digest: async () => new Uint8Array([1, 2, 3]).buffer,
  },
});

const fetchToken = (body: object): typeof fetch => {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
};

describe("browser Auth0 helper", () => {
  it("builds config only when every Auth0 env value is present", () => {
    const missing = authConfigFromEnv(
      {
        VITE_AUTH0_DOMAIN: "tenant.auth0.com",
        VITE_AUTH0_CLIENT_ID: undefined,
        VITE_AUTH0_AUDIENCE: "https://api.example",
      },
      locationOf(),
    );
    expect(missing).toBeNull();

    const config = authConfigFromEnv(
      {
        VITE_AUTH0_DOMAIN: "tenant.auth0.com",
        VITE_AUTH0_CLIENT_ID: "client",
        VITE_AUTH0_AUDIENCE: "https://api.example",
      },
      locationOf(),
    );
    expect(config).toEqual({
      domain: "tenant.auth0.com",
      clientId: "client",
      audience: "https://api.example",
      redirectUri: "https://app.example/demo/",
      scope: "openid profile email",
    });
  });

  it("starts a PKCE login without putting tokens in the app URL", async () => {
    const storage = new MemoryStorage();
    let navigated = "";
    await startAuth0Login(
      {
        domain: "tenant.auth0.com",
        clientId: "client",
        audience: "https://api.example",
        redirectUri: "https://app.example/demo/",
        scope: "openid profile email",
      },
      {
        crypto: cryptoStub(),
        fetch,
        location: locationOf(),
        navigate: (url) => {
          navigated = url;
        },
        now: () => 10,
        replaceUrl: () => {},
        storage,
      },
    );

    const authorize = new URL(navigated);
    expect(authorize.origin).toBe("https://tenant.auth0.com");
    expect(authorize.pathname).toBe("/authorize");
    expect(authorize.searchParams.get("response_type")).toBe("code");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.has("token")).toBe(false);
    expect(storage.values.size).toBe(1);
  });

  it("exchanges an Auth0 callback code, stores the access token, and cleans the callback URL", async () => {
    const storage = new MemoryStorage();
    const config = {
      domain: "tenant.auth0.com",
      clientId: "client",
      audience: "https://api.example",
      redirectUri: "https://app.example/demo/",
      scope: "openid profile email",
    };
    storage.setItem(
      "mermollusc:auth0:login:tenant.auth0.com:client:https://api.example",
      JSON.stringify({ state: "abc", verifier: "verifier", redirectUri: config.redirectUri }),
    );
    let replaced = "";
    const session = await resumeAuth0Session(config, {
      crypto: cryptoStub(),
      fetch: fetchToken({
        access_token: jwt({ sub: "auth0|user-1", scope: "read" }),
        id_token: jwt({ sub: "auth0|user-1", name: "Ada Claims" }),
        expires_in: 60,
      }),
      location: locationOf("?collab&room=claims&code=code-1&state=abc"),
      navigate: () => {},
      now: () => 1000,
      replaceUrl: (url) => {
        replaced = url;
      },
      storage,
    });

    expect(session?.accessToken).toContain(".");
    expect(session?.user.name).toBe("Ada Claims");
    expect(replaced).toBe("/demo/?collab=&room=claims#src=x");
  });

  it("derives presence identity from token claims and clears stored sessions", () => {
    const user = userFromToken(jwt({ sub: "auth0|user-2", email: "ada@example.test" }), null);
    expect(user).toEqual({
      subject: "auth0|user-2",
      name: "ada@example.test",
      color: expect.stringMatching(/^#/u),
    });

    const storage = new MemoryStorage();
    storage.setItem("mermollusc:auth0:login:tenant:client:aud", "x");
    storage.setItem("mermollusc:auth0:token:tenant:client:aud", "x");
    clearAuth0Session(
      {
        domain: "tenant",
        clientId: "client",
        audience: "aud",
        redirectUri: "https://app.example/demo/",
        scope: "openid profile email",
      },
      storage,
    );
    expect(storage.values.size).toBe(0);
  });
});
