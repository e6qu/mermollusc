package relay

// Store is the room durability seam: the core loads a room's last snapshot on first join and saves it as
// the room changes, so rooms survive a restart. Load returns (nil, nil) for a room with no snapshot yet
// — distinct from an I/O error.
type Store interface {
	Load(room string) ([]byte, error)
	Save(room string, snapshot []byte) error
}
