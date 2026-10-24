package main

import (
	"context"
	"crypto/sha256"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
	"strings"
	"testing"
	"time"
)

func continuationConfig(mode, token string) xiaohongshu.CommentLoadConfig {
	return xiaohongshu.CommentLoadConfig{ReadWindow: &xiaohongshu.BoundedReadConfig{Version: 1, RootPages: 3, ReplyClicks: 12, MaxRoots: 40, MaxComments: 100, MaxRepliesPerRoot: 30, TimeoutMs: 15000}, ReadContinuation: &xiaohongshu.BoundedContinuationRequest{Mode: mode, Token: token}}
}
func TestContinuationRejectsCrossTargetAndExpired(t *testing.T) {
	s := NewXiaohongshuService()
	closed := 0
	s.reads.lease = &readLease{feed: "synthetic", binding: sha256.Sum256([]byte("synthetic\x00reference")), handle: strings.Repeat("a", 64), created: time.Now(), close: func() { closed++ }}
	for _, test := range []struct{ id, ref, token string }{{"other", "reference", strings.Repeat("a", 64)}, {"synthetic", "different", strings.Repeat("a", 64)}, {"synthetic", "reference", strings.Repeat("b", 64)}} {
		_, e := s.continuedDetail(context.Background(), test.id, test.ref, continuationConfig("RESUME", test.token))
		if e == nil || e.Error() != "CONTINUATION_MISMATCH" {
			t.Fatal(e)
		}
	}
	if closed != 0 {
		t.Fatal("wrong target destroyed valid lease")
	}
	s.reads.lease.created = time.Now().Add(-3 * time.Minute)
	_, e := s.continuedDetail(context.Background(), "synthetic", "reference", continuationConfig("RESUME", strings.Repeat("a", 64)))
	if e == nil || e.Error() != "CONTINUATION_EXPIRED" || closed != 1 || s.reads.lease != nil {
		t.Fatal(e, closed)
	}
}
func TestContinuationBusyAndCancelledDoNotOpenBrowser(t *testing.T) {
	s := NewXiaohongshuService()
	s.reads.mu.Lock()
	_, e := s.continuedDetail(context.Background(), "synthetic", "reference", continuationConfig("START", ""))
	s.reads.mu.Unlock()
	if e == nil || e.Error() != "CONTINUATION_BUSY" {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, e = s.continuedDetail(ctx, "synthetic", "reference", continuationConfig("START", ""))
	if e == nil || e.Error() != "CANCELLED" {
		t.Fatal(e)
	}
}
func TestContinuationInputAndRandomHandle(t *testing.T) {
	for _, v := range []xiaohongshu.BoundedContinuationRequest{{Mode: "START", Token: "secret"}, {Mode: "RESUME", Token: "short"}, {Mode: "unknown"}, {Mode: "RESUME", Token: strings.Repeat("A", 64)}} {
		if v.Valid() {
			t.Fatal("invalid request accepted")
		}
	}
	a, e := handle()
	if e != nil {
		t.Fatal(e)
	}
	b, e := handle()
	if e != nil || a == b || !(xiaohongshu.BoundedContinuationRequest{Mode: "RESUME", Token: a}).Valid() {
		t.Fatal("bad handle")
	}
}
