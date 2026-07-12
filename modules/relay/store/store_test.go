// Ported from modules/collab/test/integration/store.test.mjs.
package store

import (
	"bytes"
	"sync"
	"testing"
)

// TestFileConcurrentSavesDoNotCorrupt hammers concurrent saves of the SAME room — the exact debounce-vs-
// flush race — each writing a distinct constant-byte snapshot of equal length. With a shared "<room>.tmp"
// the writes interleave (a torn, mixed-byte file) or the second rename ENOENTs; with a per-save unique temp
// every rename lands a complete snapshot, so the survivor is one whole write. Run with -race.
func TestFileConcurrentSavesDoNotCorrupt(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFile(dir)
	if err != nil {
		t.Fatalf("NewFile: %v", err)
	}
	const writers = 24
	const size = 8192
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for k := 0; k < writers; k++ {
		wg.Add(1)
		go func(b byte) {
			defer wg.Done()
			if err := s.Save("room", bytes.Repeat([]byte{b}, size)); err != nil {
				errs <- err
			}
		}(byte(k + 1))
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		t.Fatalf("concurrent Save failed: %v", e)
	}
	got, err := s.Load("room")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(got) != size {
		t.Fatalf("Load length = %d, want %d — a torn write", len(got), size)
	}
	for i, b := range got {
		if b != got[0] {
			t.Fatalf("byte %d = %d but byte 0 = %d — the file is an interleaved mix of concurrent saves", i, b, got[0])
		}
	}
}

func TestMemoryReturnsNilForUnknownRoomThenSavedSnapshot(t *testing.T) {
	s := NewMemory()
	got, err := s.Load("r")
	if err != nil || got != nil {
		t.Fatalf("Load unknown = (%v, %v), want (nil, nil)", got, err)
	}
	if err := s.Save("r", []byte{1, 2, 3}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err = s.Load("r")
	if err != nil || !bytes.Equal(got, []byte{1, 2, 3}) {
		t.Fatalf("Load = (%v, %v), want ([1 2 3], nil)", got, err)
	}
}

func TestMemoryKeepsRoomsIndependent(t *testing.T) {
	s := NewMemory()
	_ = s.Save("a", []byte{1})
	_ = s.Save("b", []byte{2})
	a, _ := s.Load("a")
	b, _ := s.Load("b")
	if !bytes.Equal(a, []byte{1}) || !bytes.Equal(b, []byte{2}) {
		t.Errorf("a=%v b=%v, want [1] and [2]", a, b)
	}
}

func TestMemoryCopiesSnapshotsOnSaveAndLoad(t *testing.T) {
	s := NewMemory()
	original := []byte{1, 2, 3}
	if err := s.Save("copy", original); err != nil {
		t.Fatalf("Save: %v", err)
	}
	original[0] = 9 // mutate the caller's slice after save

	loaded, err := s.Load("copy")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !bytes.Equal(loaded, []byte{1, 2, 3}) {
		t.Fatalf("loaded = %v, want [1 2 3] (unaffected by post-save mutation)", loaded)
	}
	loaded[1] = 8 // mutate the returned slice
	again, _ := s.Load("copy")
	if !bytes.Equal(again, []byte{1, 2, 3}) {
		t.Errorf("second load = %v, want [1 2 3] (unaffected by mutating the first load's result)", again)
	}
}

func TestFilePersistsAcrossFreshInstanceOverSameDir(t *testing.T) {
	dir := t.TempDir()
	first, err := NewFile(dir)
	if err != nil {
		t.Fatalf("NewFile: %v", err)
	}
	got, err := first.Load("durable")
	if err != nil || got != nil {
		t.Fatalf("Load unknown = (%v, %v), want (nil, nil)", got, err)
	}
	if err := first.Save("durable", []byte{9, 8, 7, 6}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	// A fresh store instance over the same directory ≈ what the relay sees after a restart.
	second, err := NewFile(dir)
	if err != nil {
		t.Fatalf("NewFile: %v", err)
	}
	got, err = second.Load("durable")
	if err != nil || !bytes.Equal(got, []byte{9, 8, 7, 6}) {
		t.Fatalf("Load = (%v, %v), want ([9 8 7 6], nil)", got, err)
	}
}

func TestFileIsolatesRoomsByPathSafeFilename(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFile(dir)
	if err != nil {
		t.Fatalf("NewFile: %v", err)
	}
	if err := s.Save("a/../b", []byte{5}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := s.Load("a/../b")
	if err != nil || !bytes.Equal(got, []byte{5}) {
		t.Fatalf("Load(a/../b) = (%v, %v), want ([5], nil)", got, err)
	}
	got, err = s.Load("b")
	if err != nil || got != nil {
		t.Fatalf("Load(b) = (%v, %v), want (nil, nil) — the slash must not escape into a separate file", got, err)
	}
}
