package main

import (
	"context"
	"errors"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
	"regexp"
	"sync"
	"time"
)

type inboxInspectionInput struct {
	Channel          string `json:"channel,omitempty"`
	Protocol         string `json:"protocol"`
	SenderID         string `json:"senderId"`
	MaxSubmissions   int    `json:"maxSubmissions"`
	MaxConversations int    `json:"maxConversations,omitempty"`
	MaxMessages      int    `json:"maxMessages,omitempty"`
}

func validInboxInput(t inboxInspectionInput) bool {
	return t.Protocol == "workbench.inbox.v1" && regexp.MustCompile(`^[a-f0-9]{24}$`).MatchString(t.SenderID) && t.MaxSubmissions == 0
}
func registerInboxInspection(server *mcp.Server) {
	var mu sync.Mutex
	var session *xiaohongshu.InboxSession
	var shutdown func()
	used := false
	add := func(name string, handler func(context.Context, inboxInspectionInput) (any, error)) {
		mcp.AddTool(server, &mcp.Tool{Name: name, Description: "Owned receive-only inbox; never sends or types", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false}}, func(ctx context.Context, req *mcp.CallToolRequest, in inboxInspectionInput) (*mcp.CallToolResult, any, error) {
			if !validInboxInput(in) {
				return nil, nil, errors.New("INVALID_SCOPE")
			}
			out, err := handler(ctx, in)
			if err != nil {
				return nil, nil, errors.New("INBOX_OPERATION_FAILED")
			}
			return nil, out, nil
		})
	}
	add("inbox_start", func(ctx context.Context, in inboxInspectionInput) (any, error) {
		mu.Lock()
		defer mu.Unlock()
		if used {
			return nil, errors.New("USED")
		}
		used = true
		life, cancel := context.WithTimeout(context.Background(), 210*time.Second)
		b := newBrowser()
		p := b.NewPage()
		s, err := xiaohongshu.StartInbox(life, p, in.SenderID)
		if err != nil {
			cancel()
			p.Close()
			b.Close()
			return nil, err
		}
		session = s
		var once sync.Once
		shutdown = func() { once.Do(func() { cancel(); s.Close(); p.Close(); b.Close() }) }
		go func() { <-life.Done(); shutdown() }()
		return map[string]any{"identity": "MATCH", "protocol": "workbench.inbox.v1", "state": "CONNECTED", "expiresInSeconds": 210, "submissions": 0}, nil
	})
	add("inbox_drain", func(ctx context.Context, in inboxInspectionInput) (any, error) {
		mu.Lock()
		s := session
		mu.Unlock()
		if s == nil || s.Sender != in.SenderID {
			return nil, errors.New("NO_SESSION")
		}
		return s.Drain(ctx), nil
	})
	add("inbox_snapshot", func(ctx context.Context, in inboxInspectionInput) (any, error) {
		mu.Lock()
		s := session
		mu.Unlock()
		if s == nil || s.Sender != in.SenderID {
			return nil, errors.New("NO_SESSION")
		}
		if in.Channel == "DM" {
			return s.SnapshotDM(ctx)
		}
		if in.Channel != "COMMENT" {
			return nil, errors.New("CHANNEL")
		}
		return s.Snapshot(ctx)
	})
	add("inbox_stop", func(ctx context.Context, in inboxInspectionInput) (any, error) {
		mu.Lock()
		stop := shutdown
		s := session
		mu.Unlock()
		if s != nil && s.Sender != in.SenderID {
			return nil, errors.New("IDENTITY")
		}
		if stop != nil {
			stop()
		}
		return map[string]any{"stopped": true, "submissions": 0}, nil
	})
}
