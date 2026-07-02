// Ported from modules/collab/test/integration/auth.test.mjs — a local JWKS harness (generate an RSA
// keypair, serve its public JWK from a tiny local endpoint, sign tokens with the private key) instead of
// a real Auth0 tenant, so the OIDC verification logic is exercised end-to-end without network access.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/e6qu/mermollusc/modules/relay/relay"
)

const (
	testIssuer   = "https://test-tenant.example/"
	testAudience = "https://api.mermollusc.test"
	testKID      = "test-key-1"
)

// signingKey bundles the raw RSA private key (unused directly — kept for clarity) with the jwk.Key form
// jwt.Sign needs: signature_builder.go reads the kid to stamp into the JWS header only when the signing
// key itself is a jwk.Key with KeyID set, not a raw *rsa.PrivateKey.
func newTestVerifier(t *testing.T) (relay.Authorizer, jwk.Key) {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	privJWK, err := jwk.Import(priv)
	if err != nil {
		t.Fatalf("import private jwk: %v", err)
	}
	if err := privJWK.Set(jwk.KeyIDKey, testKID); err != nil {
		t.Fatalf("set kid: %v", err)
	}
	if err := privJWK.Set(jwk.AlgorithmKey, jwa.RS256()); err != nil {
		t.Fatalf("set alg: %v", err)
	}

	pub, err := jwk.PublicKeyOf(privJWK)
	if err != nil {
		t.Fatalf("public jwk: %v", err)
	}
	set := jwk.NewSet()
	if err := set.AddKey(pub); err != nil {
		t.Fatalf("add key: %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(set)
	}))
	t.Cleanup(srv.Close)

	verifier, err := NewVerifier(srv.URL+"/.well-known/jwks.json", testIssuer, testAudience)
	if err != nil {
		t.Fatalf("NewVerifier: %v", err)
	}
	return verifier, privJWK
}

type signOpts struct {
	issuer, audience string
	expIn            time.Duration
}

func sign(t *testing.T, priv jwk.Key, claims map[string]any, opts signOpts) string {
	t.Helper()
	if opts.issuer == "" {
		opts.issuer = testIssuer
	}
	if opts.audience == "" {
		opts.audience = testAudience
	}
	if opts.expIn == 0 {
		opts.expIn = time.Hour
	}
	tok := jwt.New()
	for k, v := range claims {
		if err := tok.Set(k, v); err != nil {
			t.Fatalf("set claim %q: %v", k, err)
		}
	}
	_ = tok.Set(jwt.IssuerKey, opts.issuer)
	_ = tok.Set(jwt.AudienceKey, []string{opts.audience})
	_ = tok.Set(jwt.IssuedAtKey, time.Now())
	_ = tok.Set(jwt.ExpirationKey, time.Now().Add(opts.expIn))

	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.RS256(), priv))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return string(signed)
}

func req(t *testing.T, token string) *relay.Request {
	t.Helper()
	return &relay.Request{URL: "/room", AuthToken: token}
}

func TestAcceptsValidTokenAndSurfacesUser(t *testing.T) {
	verifier, priv := newTestVerifier(t)
	token := sign(t, priv, map[string]any{
		"sub":                          "auth0|user-123",
		"name":                         "Ada",
		"email":                        "ada@example.com",
		"org_id":                       "org_acme",
		"https://mermollusc.dev/roles": map[string]any{"org_acme/board1": "editor"},
	}, signOpts{})
	result, err := verifier(context.Background(), req(t, token))
	if err != nil {
		t.Fatalf("verifier error: %v", err)
	}
	if !result.OK {
		t.Fatalf("result.OK = false, reason=%q", result.Reason)
	}
	want := &relay.User{
		Sub: "auth0|user-123", Name: "Ada", Email: "ada@example.com", Tenant: "org_acme",
		Roles: map[string]relay.Role{"org_acme/board1": relay.RoleEditor},
	}
	if result.User.Sub != want.Sub || result.User.Name != want.Name || result.User.Email != want.Email ||
		result.User.Tenant != want.Tenant || len(result.User.Roles) != 1 ||
		result.User.Roles["org_acme/board1"] != relay.RoleEditor {
		t.Errorf("user = %+v, want %+v", result.User, want)
	}
}

func TestRejectsMissingToken(t *testing.T) {
	verifier, _ := newTestVerifier(t)
	result, err := verifier(context.Background(), req(t, ""))
	if err != nil {
		t.Fatalf("verifier error: %v", err)
	}
	if result.OK {
		t.Errorf("expected rejection for missing token")
	}
}

func TestRejectsMalformedToken(t *testing.T) {
	verifier, _ := newTestVerifier(t)
	result, err := verifier(context.Background(), req(t, "not.a.jwt"))
	if err != nil {
		t.Fatalf("verifier error: %v", err)
	}
	if result.OK {
		t.Errorf("expected rejection for malformed token")
	}
}

func TestRejectsWrongAudience(t *testing.T) {
	verifier, priv := newTestVerifier(t)
	token := sign(t, priv, map[string]any{"sub": "u"}, signOpts{audience: "https://some.other.api"})
	result, err := verifier(context.Background(), req(t, token))
	if err != nil {
		t.Fatalf("verifier error: %v", err)
	}
	if result.OK {
		t.Errorf("expected rejection for wrong audience")
	}
}

func TestRejectsWrongIssuer(t *testing.T) {
	verifier, priv := newTestVerifier(t)
	token := sign(t, priv, map[string]any{"sub": "u"}, signOpts{issuer: "https://evil.example/"})
	result, err := verifier(context.Background(), req(t, token))
	if err != nil {
		t.Fatalf("verifier error: %v", err)
	}
	if result.OK {
		t.Errorf("expected rejection for wrong issuer")
	}
}

func TestRejectsExpiredToken(t *testing.T) {
	verifier, priv := newTestVerifier(t)
	token := sign(t, priv, map[string]any{"sub": "u"}, signOpts{expIn: -60 * time.Second})
	result, err := verifier(context.Background(), req(t, token))
	if err != nil {
		t.Fatalf("verifier error: %v", err)
	}
	if result.OK {
		t.Errorf("expected rejection for expired token")
	}
}
