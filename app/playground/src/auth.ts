export interface BrowserAuthConfig {
  readonly domain: string;
  readonly clientId: string;
  readonly audience: string;
  readonly redirectUri: string;
  readonly scope: string;
}

export interface AuthUser {
  readonly subject: string;
  readonly name: string;
  readonly color: string;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly user: AuthUser;
}

export interface AuthLocation {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

interface StoredLogin {
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
}

interface StoredToken {
  readonly accessToken: string;
  readonly idToken: string | null;
  readonly expiresAt: number;
}

interface AuthCrypto {
  getRandomValues<T extends Exclude<BufferSource, ArrayBuffer>>(array: T): T;
  readonly subtle: {
    digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer>;
  };
}

interface AuthDeps {
  readonly crypto: AuthCrypto;
  readonly fetch: typeof fetch;
  readonly location: AuthLocation;
  readonly navigate: (url: string) => void;
  readonly now: () => number;
  readonly replaceUrl: (url: string) => void;
  readonly storage: Pick<Storage, "getItem" | "removeItem" | "setItem">;
}

const LOGIN_KEY = "mermollusc:auth0:login";
const TOKEN_KEY = "mermollusc:auth0:token";
const DEFAULT_SCOPE = "openid profile email";

const isObject = (value: unknown): value is { readonly [key: string]: unknown } =>
  typeof value === "object" && value !== null;

const storageKey = (config: BrowserAuthConfig, suffix: string): string =>
  `${suffix}:${config.domain}:${config.clientId}:${config.audience}`;

const issuerOrigin = (domain: string): string => {
  const raw = domain.startsWith("https://") ? domain : `https://${domain}`;
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("Auth0 domain must use https");
  return url.origin;
};

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const decodeBase64Url = (value: string): string => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
};

const randomString = (crypto: AuthCrypto): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
};

const challengeFor = async (crypto: AuthCrypto, verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
};

const parseJsonObject = (text: string): { readonly [key: string]: unknown } => {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed)) throw new Error("Auth0 response was not an object");
  return parsed;
};

const valueAt = (object: { readonly [key: string]: unknown }, key: string): unknown => object[key];

const stringAt = (object: { readonly [key: string]: unknown }, key: string): string | null => {
  const value = valueAt(object, key);
  return typeof value === "string" ? value : null;
};

const numberAt = (object: { readonly [key: string]: unknown }, key: string): number | null => {
  const value = valueAt(object, key);
  return typeof value === "number" ? value : null;
};

const parseStoredLogin = (raw: string | null): StoredLogin | null => {
  if (raw === null) return null;
  const parsed = parseJsonObject(raw);
  const state = stringAt(parsed, "state");
  const verifier = stringAt(parsed, "verifier");
  const redirectUri = stringAt(parsed, "redirectUri");
  if (state === null || verifier === null || redirectUri === null) {
    throw new Error("stored Auth0 login state is invalid");
  }
  return { state, verifier, redirectUri };
};

const parseStoredToken = (raw: string | null): StoredToken | null => {
  if (raw === null) return null;
  const parsed = parseJsonObject(raw);
  const accessToken = stringAt(parsed, "accessToken");
  const idTokenValue = valueAt(parsed, "idToken");
  const idToken = typeof idTokenValue === "string" ? idTokenValue : null;
  const expiresAt = numberAt(parsed, "expiresAt");
  if (accessToken === null || (idTokenValue !== null && idToken === null) || expiresAt === null) {
    throw new Error("stored Auth0 token is invalid");
  }
  return { accessToken, idToken, expiresAt };
};

const jwtPayload = (token: string): { readonly [key: string]: unknown } => {
  const parts = token.split(".");
  const payload = parts[1];
  if (payload === undefined || payload === "") throw new Error("Auth0 token is not a JWT");
  return parseJsonObject(decodeBase64Url(payload));
};

const colorFor = (subject: string): string => {
  const palette = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#008080"];
  let hash = 0;
  for (const ch of subject) hash = (hash * 31 + ch.charCodeAt(0)) % 65536;
  return palette[hash % palette.length] ?? "#4363d8";
};

export const authConfigFromEnv = (
  env: {
    readonly VITE_AUTH0_DOMAIN: string | undefined;
    readonly VITE_AUTH0_CLIENT_ID: string | undefined;
    readonly VITE_AUTH0_AUDIENCE: string | undefined;
  },
  location: AuthLocation,
): BrowserAuthConfig | null => {
  if (
    env.VITE_AUTH0_DOMAIN === undefined ||
    env.VITE_AUTH0_CLIENT_ID === undefined ||
    env.VITE_AUTH0_AUDIENCE === undefined
  ) {
    return null;
  }
  return {
    domain: env.VITE_AUTH0_DOMAIN,
    clientId: env.VITE_AUTH0_CLIENT_ID,
    audience: env.VITE_AUTH0_AUDIENCE,
    redirectUri: `${location.origin}${location.pathname}`,
    scope: DEFAULT_SCOPE,
  };
};

export const userFromToken = (accessToken: string, idToken: string | null): AuthUser => {
  const payload = idToken === null ? jwtPayload(accessToken) : jwtPayload(idToken);
  const sub = stringAt(payload, "sub");
  if (sub === null || sub.length === 0) throw new Error("Auth0 token missing subject");
  const named =
    stringAt(payload, "name") ?? stringAt(payload, "email") ?? stringAt(payload, "nickname") ?? sub;
  return { subject: sub, name: named, color: colorFor(sub) };
};

export const startAuth0Login = async (config: BrowserAuthConfig, deps: AuthDeps): Promise<void> => {
  const state = randomString(deps.crypto);
  const verifier = randomString(deps.crypto);
  const challenge = await challengeFor(deps.crypto, verifier);
  const login: StoredLogin = { state, verifier, redirectUri: config.redirectUri };
  deps.storage.setItem(storageKey(config, LOGIN_KEY), JSON.stringify(login));

  const authorize = new URL(`${issuerOrigin(config.domain)}/authorize`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("audience", config.audience);
  authorize.searchParams.set("scope", config.scope);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  deps.navigate(authorize.toString());
};

const cleanCallbackUrl = (location: AuthLocation): string => {
  const params = new URLSearchParams(location.search);
  params.delete("code");
  params.delete("state");
  params.delete("error");
  params.delete("error_description");
  const query = params.toString();
  return `${location.pathname}${query.length === 0 ? "" : `?${query}`}${location.hash}`;
};

const tokenFromCode = async (
  config: BrowserAuthConfig,
  deps: AuthDeps,
  code: string,
  login: StoredLogin,
): Promise<StoredToken> => {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", config.clientId);
  body.set("code", code);
  body.set("code_verifier", login.verifier);
  body.set("redirect_uri", login.redirectUri);
  body.set("audience", config.audience);
  const response = await deps.fetch(`${issuerOrigin(config.domain)}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Auth0 token exchange failed: ${response.status} ${text}`);
  const payload = parseJsonObject(text);
  const accessToken = stringAt(payload, "access_token");
  if (accessToken === null) throw new Error("Auth0 token response missing access token");
  const idToken = stringAt(payload, "id_token");
  const expiresIn = numberAt(payload, "expires_in") ?? 3600;
  return {
    accessToken,
    idToken,
    expiresAt: deps.now() + expiresIn * 1000,
  };
};

export const resumeAuth0Session = async (
  config: BrowserAuthConfig,
  deps: AuthDeps,
): Promise<AuthSession | null> => {
  const params = new URLSearchParams(deps.location.search);
  const error = params.get("error");
  if (error !== null) {
    deps.storage.removeItem(storageKey(config, LOGIN_KEY));
    deps.replaceUrl(cleanCallbackUrl(deps.location));
    throw new Error(`Auth0 login failed: ${error}`);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (code !== null || state !== null) {
    if (code === null || state === null) throw new Error("Auth0 callback missing code or state");
    const login = parseStoredLogin(deps.storage.getItem(storageKey(config, LOGIN_KEY)));
    deps.storage.removeItem(storageKey(config, LOGIN_KEY));
    if (login === null || login.state !== state) throw new Error("Auth0 callback state mismatch");
    const token = await tokenFromCode(config, deps, code, login);
    deps.storage.setItem(storageKey(config, TOKEN_KEY), JSON.stringify(token));
    deps.replaceUrl(cleanCallbackUrl(deps.location));
    return {
      accessToken: token.accessToken,
      user: userFromToken(token.accessToken, token.idToken),
    };
  }

  const stored = parseStoredToken(deps.storage.getItem(storageKey(config, TOKEN_KEY)));
  if (stored === null) return null;
  if (stored.expiresAt <= deps.now()) {
    deps.storage.removeItem(storageKey(config, TOKEN_KEY));
    return null;
  }
  return {
    accessToken: stored.accessToken,
    user: userFromToken(stored.accessToken, stored.idToken),
  };
};

export const clearAuth0Session = (
  config: BrowserAuthConfig,
  storage: Pick<Storage, "removeItem">,
): void => {
  storage.removeItem(storageKey(config, LOGIN_KEY));
  storage.removeItem(storageKey(config, TOKEN_KEY));
};
