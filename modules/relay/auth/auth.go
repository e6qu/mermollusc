// Package auth ports the JS relay's Auth0 OIDC token verification (server/auth.mjs) to Go using
// lestrrat-go/jwx — the closest Go equivalent to `jose`: RS256 verification against an auto-refreshing
// remote JWKS.
package auth

import (
	"context"
	"fmt"

	"github.com/lestrrat-go/httprc/v3"
	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"

	"github.com/e6qu/mermollusc/modules/relay/relay"
)

// rolesClaim is the namespaced custom claim (Auth0 requires a namespace) mapping room id -> role.
const rolesClaim = "https://mermollusc.dev/roles"

// NewVerifier returns a relay.Authorizer that verifies the request's auth token against jwksURI, checking
// issuer and audience. A missing token, or any verification failure (bad signature, wrong issuer/audience,
// expired), is a definitive rejection (AuthResult.OK == false) — never an error, since a bad token is
// expected traffic, not a system fault. A failure to even fetch the JWKS is an error (a system fault).
func NewVerifier(jwksURI, issuer, audience string) (relay.Authorizer, error) {
	cache, err := jwk.NewCache(context.Background(), httprc.NewClient())
	if err != nil {
		return nil, fmt.Errorf("creating JWKS cache: %w", err)
	}
	if err := cache.Register(context.Background(), jwksURI); err != nil {
		return nil, fmt.Errorf("registering JWKS %q: %w", jwksURI, err)
	}

	return func(ctx context.Context, req *relay.Request) (relay.AuthResult, error) {
		if req.AuthToken == "" {
			return relay.AuthResult{OK: false, Reason: "no token"}, nil
		}
		keyset, err := cache.Lookup(ctx, jwksURI)
		if err != nil {
			return relay.AuthResult{}, fmt.Errorf("fetching JWKS: %w", err)
		}
		pinned, err := pinRS256(keyset)
		if err != nil {
			return relay.AuthResult{}, fmt.Errorf("pinning JWKS to RS256: %w", err)
		}
		token, err := jwt.Parse([]byte(req.AuthToken), jwt.WithKeySet(pinned))
		if err != nil {
			return relay.AuthResult{OK: false, Reason: err.Error()}, nil
		}
		if err := jwt.Validate(token, jwt.WithIssuer(issuer), jwt.WithAudience(audience)); err != nil {
			return relay.AuthResult{OK: false, Reason: err.Error()}, nil
		}
		return relay.AuthResult{OK: true, User: userFrom(token)}, nil
	}, nil
}

// pinRS256 filters a JWKS down to the keys explicitly declared RS256. jwt.Parse with a key set accepts
// whatever algorithm each key advertises (or, with inference, whatever fits the key type) — so a new
// JWKS entry could silently widen the accepted-algorithm set. This relay accepts exactly one signing
// algorithm; every other key is excluded before verification ever sees it.
func pinRS256(keyset jwk.Set) (jwk.Set, error) {
	pinned := jwk.NewSet()
	for i := 0; i < keyset.Len(); i++ {
		key, ok := keyset.Key(i)
		if !ok {
			return nil, fmt.Errorf("JWKS key %d is unreadable", i)
		}
		alg, ok := key.Algorithm()
		if !ok || alg.String() != jwa.RS256().String() {
			continue
		}
		if err := pinned.AddKey(key); err != nil {
			return nil, fmt.Errorf("adding JWKS key %d to the pinned set: %w", i, err)
		}
	}
	return pinned, nil
}

// NewAuth0Verifier derives the JWKS endpoint and issuer from an Auth0 tenant domain.
func NewAuth0Verifier(domain, audience string) (relay.Authorizer, error) {
	return NewVerifier(
		fmt.Sprintf("https://%s/.well-known/jwks.json", domain),
		fmt.Sprintf("https://%s/", domain),
		audience,
	)
}

func userFrom(token jwt.Token) *relay.User {
	u := &relay.User{}
	if sub, ok := token.Subject(); ok {
		u.Sub = sub
	}
	var name string
	if err := token.Get("name", &name); err == nil {
		u.Name = name
	}
	var email string
	if err := token.Get("email", &email); err == nil {
		u.Email = email
	}
	var orgID string
	if err := token.Get("org_id", &orgID); err == nil {
		u.Tenant = orgID
	}
	// Get(dst) does a compatible type assignment, not a recursive JSON-shape conversion — a
	// map[string]string destination fails to bind against the decoded map[string]interface{}, so we
	// take the generic form and convert each value ourselves.
	var rawRoles map[string]interface{}
	if err := token.Get(rolesClaim, &rawRoles); err == nil {
		roles := make(map[string]relay.Role, len(rawRoles))
		for room, role := range rawRoles {
			if s, ok := role.(string); ok {
				roles[room] = relay.Role(s)
			}
		}
		u.Roles = roles
	}
	return u
}
