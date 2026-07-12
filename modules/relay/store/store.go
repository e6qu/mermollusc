// Package store provides concrete room-snapshot durability implementations satisfying relay.Store
// (structurally — this package deliberately does not import relay, so relay never depends on it; only
// cmd/relay-server, which wires the two together, imports both).
package store

import (
	"net/url"
	"os"
	"path/filepath"
	"sync"
)

// encodeRoomFilename mirrors the JS relay's `encodeURIComponent(room)` — room names are already
// restricted to `[A-Za-z0-9._~-]+(/[A-Za-z0-9._~-]+)?` by relay.validRoomName, so the only character this
// ever needs to escape is the tenant/id separator `/`, keeping a two-segment room name as one filename
// component (no path traversal, no accidental subdirectories).
func encodeRoomFilename(room string) string {
	return url.QueryEscape(room)
}

// Memory is a process-lifetime-only RoomStore — the zero-config default equivalent, provided here as a
// named type for callers who want it explicitly (e.g. tests asserting on a fresh store per case).
type Memory struct {
	mu   sync.Mutex
	data map[string][]byte
}

func NewMemory() *Memory {
	return &Memory{data: make(map[string][]byte)}
}

func (s *Memory) Load(room string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snapshot, ok := s.data[room]
	if !ok {
		return nil, nil
	}
	return append([]byte(nil), snapshot...), nil
}

func (s *Memory) Save(room string, snapshot []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[room] = append([]byte(nil), snapshot...)
	return nil
}

// File persists snapshots to disk — one file per room, named by its URL-encoded room id. Writes go to a
// PER-SAVE unique temp file then rename into place, so a crash mid-write leaves the old snapshot intact
// rather than a truncated/corrupt one (rename is atomic on the same filesystem), and two concurrent saves
// for the same room (a fired debounce racing a last-leave/shutdown flush) can't clobber each other's temp
// — last complete rename wins instead of a torn file or a rename ENOENT.
type File struct {
	dir string
}

// NewFile creates (if needed) dir and returns a File store rooted there.
func NewFile(dir string) (*File, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &File{dir: dir}, nil
}

func (s *File) fileFor(room string) string {
	return filepath.Join(s.dir, encodeRoomFilename(room)+".bin")
}

func (s *File) Load(room string) ([]byte, error) {
	data, err := os.ReadFile(s.fileFor(room))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return data, nil
}

func (s *File) Save(room string, snapshot []byte) error {
	file := s.fileFor(room)
	// A per-save unique temp (not a fixed "<room>.tmp") so concurrent saves for one room don't share it.
	tmp, err := os.CreateTemp(s.dir, encodeRoomFilename(room)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	renamed := false
	defer func() {
		if !renamed {
			_ = os.Remove(tmpName) // best-effort cleanup of the abandoned temp
		}
	}()
	if _, err := tmp.Write(snapshot); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o644); err != nil { // CreateTemp makes it 0600; keep the old world-readable mode
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, file); err != nil {
		return err
	}
	renamed = true
	return nil
}
