// Ported from modules/collab/test/integration/membership.test.mjs.
package relay

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDecodeMembershipsStrictRoomSubjectRole(t *testing.T) {
	m, err := DecodeMemberships([]byte(`{"rooms":{"org_acme/claims":{"auth0|adjuster":"editor","auth0|auditor":"viewer"}}}`))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if m["org_acme/claims"]["auth0|adjuster"] != RoleEditor {
		t.Errorf("adjuster role = %q, want editor", m["org_acme/claims"]["auth0|adjuster"])
	}
	if m["org_acme/claims"]["auth0|auditor"] != RoleViewer {
		t.Errorf("auditor role = %q, want viewer", m["org_acme/claims"]["auth0|auditor"])
	}
}

func TestDecodeMembershipsRejectsMalformedData(t *testing.T) {
	cases := []struct {
		name, input, wantErrSubstr string
	}{
		{"invalid role", `{"rooms":{"claims":{"auth0|u":"admin"}}}`, "invalid role"},
		{"members not object", `{"rooms":{"claims":["auth0|u"]}}`, "must be an object"},
		{"no rooms key", `{}`, "rooms object"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := DecodeMemberships([]byte(c.input))
			if err == nil || !strings.Contains(err.Error(), c.wantErrSubstr) {
				t.Errorf("err = %v, want containing %q", err, c.wantErrSubstr)
			}
		})
	}
}

func TestMembershipGrantsRoleForVerifiedSubject(t *testing.T) {
	m, err := DecodeMemberships([]byte(`{"rooms":{"org_acme/claims":{"auth0|adjuster":"editor","auth0|auditor":"viewer"}}}`))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	authorizeRoom := NewMembershipRoleResolver(m, "")
	adjuster := &User{Sub: "auth0|adjuster", Tenant: "org_acme"}
	if got := authorizeRoom(adjuster, "org_acme/claims"); got != RoleEditor {
		t.Errorf("got %q, want editor", got)
	}
	auditor := &User{Sub: "auth0|auditor", Tenant: "org_acme"}
	if got := authorizeRoom(auditor, "org_acme/claims"); got != RoleViewer {
		t.Errorf("got %q, want viewer", got)
	}
}

func TestMembershipFailsClosedForMissingRoomsOrSubjects(t *testing.T) {
	m, err := DecodeMemberships([]byte(`{"rooms":{"claims":{"auth0|u":"owner"}}}`))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	authorizeRoom := NewMembershipRoleResolver(m, "")
	if got := authorizeRoom(&User{Sub: "auth0|other"}, "claims"); got != "" {
		t.Errorf("unlisted subject: got %q, want no access", got)
	}
	if got := authorizeRoom(&User{Sub: "auth0|u"}, "other"); got != "" {
		t.Errorf("unlisted room: got %q, want no access", got)
	}
}

func TestMembershipKeepsTenantIsolation(t *testing.T) {
	m, err := DecodeMemberships([]byte(`{"rooms":{"org_evil/claims":{"auth0|adjuster":"owner"}}}`))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	authorizeRoom := NewMembershipRoleResolver(m, "")
	user := &User{Sub: "auth0|adjuster", Tenant: "org_acme"}
	if got := authorizeRoom(user, "org_evil/claims"); got != "" {
		t.Errorf("cross-tenant membership: got %q, want no access", got)
	}
}

func TestMembershipPreservesZeroAuthDevAccess(t *testing.T) {
	m, err := DecodeMemberships([]byte(`{"rooms":{}}`))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	authorizeRoom := NewMembershipRoleResolver(m, RoleEditor)
	if got := authorizeRoom(nil, "playground"); got != RoleEditor {
		t.Errorf("got %q, want editor", got)
	}
}

func TestLoadMembershipRoleResolverFromFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "members.json")
	if err := os.WriteFile(file, []byte(`{"rooms":{"board":{"auth0|owner":"owner"}}}`), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	authorizeRoom, err := LoadMembershipRoleResolver(file, "")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if got := authorizeRoom(&User{Sub: "auth0|owner"}, "board"); got != RoleOwner {
		t.Errorf("got %q, want owner", got)
	}
}
