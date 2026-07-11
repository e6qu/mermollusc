package relay

import (
	"sync"
	"time"
)

// RateLimit caps a single connection's post-auth frame rate on BOTH dimensions — a token bucket over
// frames/sec and bytes/sec.
type RateLimit struct {
	FramesPerSec float64
	BytesPerSec  float64
}

// DefaultRateLimit matches the JS relay's default.
var DefaultRateLimit = RateLimit{FramesPerSec: 200, BytesPerSec: 4 * 1024 * 1024}

// rateBucket is guarded by its own mutex: with auth off, the pending-frame replay in `admit` runs on the
// Connect goroutine while the socket's read loop can dispatch fresh frames concurrently — both paths call
// allow() on the same bucket.
type rateBucket struct {
	mu          sync.Mutex
	limit       RateLimit
	frameTokens float64
	byteTokens  float64
	last        time.Time
	now         func() time.Time
}

func newRateBucket(limit RateLimit, now func() time.Time) *rateBucket {
	return &rateBucket{
		limit:       limit,
		frameTokens: limit.FramesPerSec,
		byteTokens:  limit.BytesPerSec,
		last:        now(),
		now:         now,
	}
}

// allow refills both buckets by elapsed time, then debits one frame + its bytes; false = breach.
func (b *rateBucket) allow(byteLength int) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	t := b.now()
	elapsed := t.Sub(b.last).Seconds()
	if elapsed < 0 {
		elapsed = 0
	}
	b.last = t
	b.frameTokens = min(b.limit.FramesPerSec, b.frameTokens+elapsed*b.limit.FramesPerSec)
	b.byteTokens = min(b.limit.BytesPerSec, b.byteTokens+elapsed*b.limit.BytesPerSec)
	if b.frameTokens < 1 || b.byteTokens < float64(byteLength) {
		return false
	}
	b.frameTokens -= 1
	b.byteTokens -= float64(byteLength)
	return true
}
