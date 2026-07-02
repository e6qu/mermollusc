package relay

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// Memberships is a decoded static room/member role source: room id -> subject -> role.
type Memberships map[string]map[string]Role

// DecodeMemberships validates the strict wire shape `{"rooms": {"<room>": {"<sub>": "<role>"}}}`.
// Malformed input is a definitive, loud error — this is ops config, not untrusted request data.
//
// Decodes into `any` first and validates the shape by hand, rather than unmarshalling straight into a
// typed map: a typed unmarshal fails on a shape mismatch (e.g. a room's members given as an array) with a
// generic encoding/json type error instead of a specific, actionable one — the loud-failure contract here
// wants the latter.
func DecodeMemberships(input []byte) (Memberships, error) {
	var raw any
	if err := json.Unmarshal(input, &raw); err != nil {
		return nil, fmt.Errorf("membership file must be valid JSON: %w", err)
	}
	top, ok := raw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("membership file must be a JSON object")
	}
	roomsRaw, ok := top["rooms"]
	if !ok {
		return nil, fmt.Errorf("membership file must contain a rooms object")
	}
	rooms, ok := roomsRaw.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("membership file must contain a rooms object")
	}

	out := make(Memberships, len(rooms))
	for room, membersRaw := range rooms {
		if room == "" {
			return nil, fmt.Errorf("membership room id must not be empty")
		}
		members, ok := membersRaw.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("membership room %q must be an object", room)
		}
		roomMembers := make(map[string]Role, len(members))
		for sub, roleRaw := range members {
			if sub == "" {
				return nil, fmt.Errorf("membership room %q has an empty subject", room)
			}
			role, ok := roleRaw.(string)
			r := Role(role)
			if !ok || !r.valid() {
				return nil, fmt.Errorf("membership rooms.%s.%s has invalid role %v", room, sub, roleRaw)
			}
			roomMembers[sub] = r
		}
		out[room] = roomMembers
	}
	return out, nil
}

// NewMembershipRoleResolver resolves a room's role from a static membership source instead of requiring
// every per-room role to ride inside token claims. Unlike NewClaimsRoleResolver, an unauthenticated
// connection (user == nil) gets `defaultRole`, not an automatic RoleEditor — membership is a room-level
// access list, so "no identity" carries no special privilege here.
func NewMembershipRoleResolver(memberships Memberships, defaultRole Role) RoomAuthorizer {
	return func(user *User, room string) Role {
		if user == nil {
			return defaultRole
		}
		if user.Tenant != "" && !strings.HasPrefix(room, user.Tenant+"/") {
			return ""
		}
		roomMembers, ok := memberships[room]
		if !ok {
			return defaultRole
		}
		role, ok := roomMembers[user.Sub]
		if !ok {
			return defaultRole
		}
		return role
	}
}

// LoadMembershipRoleResolver reads and decodes a membership file from disk. Fails loudly (returns an
// error) on a missing/malformed file — the caller should treat this as a fatal startup error.
func LoadMembershipRoleResolver(path string, defaultRole Role) (RoomAuthorizer, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading membership file %q: %w", path, err)
	}
	memberships, err := DecodeMemberships(raw)
	if err != nil {
		return nil, fmt.Errorf("decoding membership file %q: %w", path, err)
	}
	return NewMembershipRoleResolver(memberships, defaultRole), nil
}
