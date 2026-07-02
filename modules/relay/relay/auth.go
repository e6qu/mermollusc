package relay

import "context"

// AuthResult is an admission verdict. OK false with no error means a definitive, expected rejection
// (closes 1008); a non-nil error means the check itself failed (closes 1011).
type AuthResult struct {
	OK     bool
	User   *User
	Reason string
}

// Authorizer gates a connection before any room is resolved. AllowAll (the zero-config default) accepts
// everyone with no identity — RBAC then grants RoleEditor to every nil user (see NewClaimsRoleResolver).
type Authorizer func(ctx context.Context, req *Request) (AuthResult, error)

// AllowAll is the default Authorizer: every connection is admitted with no verified identity.
func AllowAll(context.Context, *Request) (AuthResult, error) {
	return AuthResult{OK: true}, nil
}
