package xiaohongshu

import (
	"context"
	"encoding/json"
	"testing"
)

func TestStoppedInboxDrainsEmptyArrayNotNull(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s := &InboxSession{ctx: ctx, cancel: cancel, wake: make(chan struct{}, 1)}
	r := s.Drain(ctx)
	data, e := json.Marshal(r)
	if e != nil {
		t.Fatal(e)
	}
	var out struct {
		Frames      []string `json:"frames"`
		Stopped     bool     `json:"stopped"`
		Submissions int      `json:"submissions"`
	}
	if e = json.Unmarshal(data, &out); e != nil {
		t.Fatal(e)
	}
	if out.Frames == nil || !out.Stopped || out.Submissions != 0 {
		t.Fatal("unsafe or null drain")
	}
}
