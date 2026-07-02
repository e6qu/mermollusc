package relay

import "sync"

// newDefaultMemoryStore is the zero-config fallback used when Options.Store is left nil — matching the
// JS relay's `store = createMemoryRoomStore()` default. Callers who want the real named memory/file
// implementations (for explicit construction, e.g. in cmd/relay-server) use the sibling `store` package;
// this one exists purely so New(Options{}) works with zero configuration, without relay importing store
// (which would be a needless dependency for a package that otherwise has none).
type defaultMemoryStore struct {
	mu   sync.Mutex
	data map[string][]byte
}

func newDefaultMemoryStore() *defaultMemoryStore {
	return &defaultMemoryStore{data: make(map[string][]byte)}
}

func (s *defaultMemoryStore) Load(room string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	snapshot, ok := s.data[room]
	if !ok {
		return nil, nil
	}
	return append([]byte(nil), snapshot...), nil
}

func (s *defaultMemoryStore) Save(room string, snapshot []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[room] = append([]byte(nil), snapshot...)
	return nil
}
