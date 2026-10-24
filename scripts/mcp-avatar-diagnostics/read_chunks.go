package main

import (
	"context"
	"crypto/sha256"
	"errors"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
	"time"
)

// Uses the same per-account lease mutex as v1, so the two protocols cannot own
// competing pages. Exact duplicate ACKs return a cached response, never click twice.
func (s *XiaohongshuService) chunkedDetail(ctx context.Context, id, ref string, c xiaohongshu.CommentLoadConfig) (*FeedDetailResponse, error) {
	m := &s.reads
	if !m.mu.TryLock() {
		return nil, errors.New("CONTINUATION_BUSY")
	}
	defer m.mu.Unlock()
	req := c.ReadChunks
	if req == nil || !req.Valid() || c.ReadWindow == nil || ctx.Err() != nil {
		return nil, errors.New("INVALID_CHECKPOINT")
	}
	binding := sha256.Sum256([]byte(id + "\x00" + ref))
	var result *xiaohongshu.FeedDetailResponse
	var err error
	if req.Mode == "START" {
		if m.lease != nil {
			return nil, errors.New("CONTINUATION_BUSY")
		}
		chunk, e := xiaohongshu.NewCommentChunkSession(req.Checkpoint)
		if e != nil {
			return nil, e
		}
		b := newBrowser()
		p := b.NewPage()
		m.lease = &readLease{binding: binding, feed: id, created: time.Now(), chunk: chunk, page: p, close: func() { p.Close(); b.Close() }}
		c.ChunkSession = chunk
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
		if l.binding != binding || l.feed != id || l.chunk == nil {
			return nil, errors.New("CONTINUATION_MISMATCH")
		}
		if l.lastToken == req.Token && l.lastAck == req.Ack && l.lastChunk != nil {
			return &FeedDetailResponse{FeedID: id, Data: l.lastChunk}, nil
		}
		if l.handle != req.Token {
			return nil, errors.New("CONTINUATION_MISMATCH")
		}
		if err = l.chunk.Ack(req.Ack); err != nil {
			return nil, err
		}
		if req.Mode == "FINISH" {
			m.clear()
			return &FeedDetailResponse{FeedID: id, Data: &xiaohongshu.FeedDetailResponse{ChunkAck: true}}, nil
		}
		l.handle = ""
		l.lastToken = req.Token
		l.lastAck = req.Ack
		l.lastChunk = nil
		result, err = l.chunk.ReadPage(ctx, l.page, id, *c.ReadWindow)
	}
	if err != nil || ctx.Err() != nil {
		m.clear()
		if err == nil {
			err = errors.New("CANCELLED")
		}
		return nil, err
	}
	l := m.lease
	l.lastChunk = result
	token, e := handle()
	if e != nil {
		m.clear()
		return nil, errors.New("CONTINUATION_UNAVAILABLE")
	}
	l.handle = token
	result.Chunk.Token = token
	if time.Since(l.created) >= 2*time.Minute {
		result.Chunk.CanContinue = false
	}
	if l.timer != nil {
		l.timer.Stop()
	}
	expected := l
	l.timer = time.AfterFunc(45*time.Second, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		if m.lease == expected && m.lease.handle == token {
			m.clear()
		}
	})
	return &FeedDetailResponse{FeedID: id, Data: result}, nil
}
