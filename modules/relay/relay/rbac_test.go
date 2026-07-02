// Ported from modules/collab/test/integration/rbac.test.mjs.
package relay

import "testing"

func TestRBACGrantsFullAccessToUnauthenticatedUser(t *testing.T) {
	authorizeRoom := NewClaimsRoleResolver("")
	if got := authorizeRoom(nil, "playground"); got != RoleEditor {
		t.Errorf("got %q, want editor", got)
	}
}

func TestRBACFailsClosedByDefault(t *testing.T) {
	authorizeRoom := NewClaimsRoleResolver("")
	user := &User{Sub: "u"}
	if got := authorizeRoom(user, "anything"); got != "" {
		t.Errorf("got %q, want no access", got)
	}
}

func TestRBACDevPostureDefaultEditor(t *testing.T) {
	devResolver := NewClaimsRoleResolver(RoleEditor)
	user := &User{Sub: "u"}
	if got := devResolver(user, "anything"); got != RoleEditor {
		t.Errorf("got %q, want editor", got)
	}
	explicit := &User{Sub: "u", Roles: map[string]Role{"x": RoleOwner}}
	if got := devResolver(explicit, "x"); got != RoleOwner {
		t.Errorf("got %q, want owner (explicit grant under dev default)", got)
	}
}

func TestRBACCanFailClosedButHonoursExplicitGrants(t *testing.T) {
	denyByDefault := NewClaimsRoleResolver("")
	user := &User{Sub: "u"}
	if got := denyByDefault(user, "anything"); got != "" {
		t.Errorf("got %q, want no access", got)
	}
	explicit := &User{Sub: "u", Roles: map[string]Role{"x": RoleEditor}}
	if got := denyByDefault(explicit, "x"); got != RoleEditor {
		t.Errorf("got %q, want editor", got)
	}
}

func TestRBACPerRoomRoleByFullOrBareID(t *testing.T) {
	authorizeRoom := NewClaimsRoleResolver("")
	user := &User{Sub: "u", Roles: map[string]Role{"acme/board1": RoleViewer, "board2": RoleOwner}}
	if got := authorizeRoom(user, "acme/board1"); got != RoleViewer {
		t.Errorf("got %q, want viewer", got)
	}
	if got := authorizeRoom(user, "board2"); got != RoleOwner {
		t.Errorf("got %q, want owner", got)
	}
}

func TestRBACDeniesUnlistedRoom(t *testing.T) {
	authorizeRoom := NewClaimsRoleResolver("")
	user := &User{Sub: "u", Roles: map[string]Role{"board1": RoleEditor}}
	if got := authorizeRoom(user, "board9"); got != "" {
		t.Errorf("got %q, want no access", got)
	}
}

func TestRBACRejectsUnknownRoleValue(t *testing.T) {
	authorizeRoom := NewClaimsRoleResolver("")
	user := &User{Sub: "u", Roles: map[string]Role{"board1": Role("superadmin")}}
	if got := authorizeRoom(user, "board1"); got != "" {
		t.Errorf("got %q, want no access", got)
	}
}

func TestRBACTenantIsolationAdmitsMatchingTenant(t *testing.T) {
	authorizeRoom := NewClaimsRoleResolver("")
	user := &User{Sub: "u", Tenant: "org_acme", Roles: map[string]Role{"org_acme/board1": RoleEditor}}
	if got := authorizeRoom(user, "org_acme/board1"); got != RoleEditor {
		t.Errorf("got %q, want editor", got)
	}
}

func TestRBACTenantIsolationDeniesOtherTenant(t *testing.T) {
	authorizeRoom := NewClaimsRoleResolver("")
	user := &User{Sub: "u", Tenant: "org_acme", Roles: map[string]Role{"org_evil/board1": RoleOwner}}
	if got := authorizeRoom(user, "org_evil/board1"); got != "" {
		t.Errorf("got %q, want no access despite a matching role key", got)
	}
}

func TestCanWrite(t *testing.T) {
	if !CanWrite(RoleOwner) {
		t.Error("owner should write")
	}
	if !CanWrite(RoleEditor) {
		t.Error("editor should write")
	}
	if CanWrite(RoleViewer) {
		t.Error("viewer should not write")
	}
	if CanWrite("") {
		t.Error("no role should not write")
	}
}
