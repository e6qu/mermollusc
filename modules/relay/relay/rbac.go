package relay

import "strings"

// Role is a per-document access level. The zero value "" means no access — distinct from any real role,
// mirroring the JS relay's `null` role.
type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

func (r Role) valid() bool {
	return r == RoleOwner || r == RoleEditor || r == RoleViewer
}

// CanWrite reports whether role may submit document edits (viewers are read-only).
func CanWrite(role Role) bool {
	return role == RoleOwner || role == RoleEditor
}

// User is the verified identity `Authorizer` produces. Tenant "" means no tenant (unscoped); Roles nil
// means the token carried no per-room roles claim.
type User struct {
	Sub    string
	Name   string
	Email  string
	Tenant string
	Roles  map[string]Role
}

// RoomAuthorizer resolves the role `user` holds in `room`, or "" for no access. `user` nil means
// authentication is disabled for this connection.
type RoomAuthorizer func(user *User, room string) Role

// NewClaimsRoleResolver reads per-room roles from the user's token claims and isolates tenants by a
// room-name prefix (`<tenant>/<id>`). `defaultRole` is granted to an authenticated user whose token
// carries no per-room roles claim; "" means FAIL CLOSED (a verified token lacking a per-room role is
// denied). An unauthenticated connection (auth disabled / local dev) always gets RoleEditor — RBAC only
// bites when auth is on.
func NewClaimsRoleResolver(defaultRole Role) RoomAuthorizer {
	return func(user *User, room string) Role {
		if user == nil {
			return RoleEditor
		}
		if user.Tenant != "" && !strings.HasPrefix(room, user.Tenant+"/") {
			return ""
		}
		if user.Roles == nil {
			return defaultRole
		}
		role, ok := user.Roles[room]
		if !ok {
			role, ok = user.Roles[bareRoomID(room)]
		}
		if !ok || !role.valid() {
			return ""
		}
		return role
	}
}

func bareRoomID(room string) string {
	if idx := strings.IndexByte(room, '/'); idx != -1 {
		return room[idx+1:]
	}
	return room
}
