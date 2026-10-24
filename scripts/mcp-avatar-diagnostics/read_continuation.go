package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
	"sync"
	"time"
)

// Per-account MCP child: a single in-memory browser lease, never a persistent
// cookie/token store. Rotation makes uncertain requests non-replayable.
type readContinuations struct {
	mu    sync.Mutex
	lease *readLease
}
type readLease struct {
	handle  string
	binding [32]byte
	feed    string
	created time.Time
	timer   *time.Timer
	session *xiaohongshu.BoundedSession
	close   func()
}

func (m *readContinuations) clear() {
	if m.lease != nil {
		if m.lease.timer != nil {
			m.lease.timer.Stop()
		}
		m.lease.close()
		m.lease = nil
	}
}
func handle() (string, error) {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return hex.EncodeToString(b), nil
}
func (s *XiaohongshuService) continuedDetail(ctx context.Context, id, ref string, c xiaohongshu.CommentLoadConfig) (*FeedDetailResponse, error) {
	if ctx.Err() != nil {
		return nil, errors.New("CANCELLED")
	}
	m := &s.reads
	if !m.mu.TryLock() {
		return nil, errors.New("CONTINUATION_BUSY")
	}
	defer m.mu.Unlock()
	req := c.ReadContinuation
	if req == nil || c.ReadWindow == nil || !req.Valid() {
		return nil, errors.New("INVALID_CONTINUATION")
	}
	binding := sha256.Sum256([]byte(id + "\x00" + ref))
	var result *xiaohongshu.FeedDetailResponse
	var err error
	if req.Mode == "START" {
		if m.lease != nil {
			return nil, errors.New("CONTINUATION_BUSY")
		}
		b := newBrowser()
		p := b.NewPage()
		m.lease = &readLease{binding: binding, feed: id, created: time.Now(), session: &xiaohongshu.BoundedSession{}, close: func() { p.Close(); b.Close() }}
		c.ReadSession = m.lease.session
		result, err = xiaohongshu.NewFeedDetailAction(p).GetFeedDetailWithConfig(ctx, id, ref, false, c)
	} else {
		l := m.lease
		if l == nil {
			return nil, errors.New("CONTINUATION_EXPIRED")
		}
		if time.Since(l.created) > 2*time.Minute {
			m.clear()
			return nil, errors.New("CONTINUATION_EXPIRED")
		}
		if req.Token != l.handle || binding != l.binding || id != l.feed {
			return nil, errors.New("CONTINUATION_MISMATCH")
		}
		l.handle = "" // Consume before execution; no blind retry after an uncertain result.
		result, err = l.session.Read(ctx, nil, id, *c.ReadWindow)
	}
	if err != nil || ctx.Err() != nil {
		m.clear()
		if err == nil {
			err = errors.New("CANCELLED")
		}
		return nil, err
	}
	if xiaohongshu.CanContinueBounded(result.BoundedRead) && time.Since(m.lease.created) < 2*time.Minute {
		token, e := handle()
		if e != nil {
			m.clear()
			return nil, errors.New("CONTINUATION_UNAVAILABLE")
		}
		m.lease.handle = token
		if m.lease.timer != nil {
			m.lease.timer.Stop()
		}
		expected := m.lease
		expectedHandle := token
		m.lease.timer = time.AfterFunc(45*time.Second, func() {
			m.mu.Lock()
			defer m.mu.Unlock()
			if m.lease == expected && m.lease.handle == expectedHandle {
				m.clear()
			}
		})
		result.Continuation = &xiaohongshu.BoundedContinuation{Token: token, State: "AVAILABLE"}
	} else {
		m.clear()
		result.Continuation = &xiaohongshu.BoundedContinuation{State: "ENDED"}
	}
	return &FeedDetailResponse{FeedID: id, Data: result}, nil
}
