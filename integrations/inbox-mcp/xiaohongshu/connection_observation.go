package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"net/url"
	"strings"
	"sync"
	"time"
)

type socketSummary struct {
	Host                 string         `json:"host"`
	PathClass            string         `json:"pathClass"`
	Received             int            `json:"received"`
	Sent                 int            `json:"sent"`
	ReceivedPayloadChars int            `json:"receivedPayloadChars"`
	SentPayloadChars     int            `json:"sentPayloadChars"`
	TextFrames           int            `json:"textFrames"`
	BinaryFrames         int            `json:"binaryFrames"`
	FrameClasses         map[string]int `json:"frameClasses"`
	Closed               bool           `json:"closed"`
}

func socketEndpoint(raw string) (string, string) {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "wss" {
		return "OTHER", "OTHER"
	}
	h := u.Hostname()
	if h != "xiaohongshu.com" && !strings.HasSuffix(h, ".xiaohongshu.com") && h != "xhscdn.com" && !strings.HasSuffix(h, ".xhscdn.com") {
		return "OTHER", "OTHER"
	}
	p := "OTHER"
	if u.Path == "/websocketV2" {
		p = "websocketV2"
	} else if strings.Contains(strings.ToLower(u.Path), "websocket") {
		p = "WEBSOCKET_PATH"
	}
	return h, p
}
func safeMetrics(p *rod.Page) map[string]float64 {
	r, e := (proto.PerformanceGetMetrics{}).Call(p)
	out := map[string]float64{}
	if e != nil {
		return out
	}
	for _, m := range r.Metrics {
		switch m.Name {
		case "TaskDuration", "ScriptDuration", "JSHeapUsedSize", "JSHeapTotalSize", "Nodes", "Documents":
			out[m.Name] = m.Value
		}
	}
	return out
}
func metricPhase(start, end map[string]float64, seconds float64) map[string]any {
	return map[string]any{"seconds": seconds, "rendererTaskSeconds": end["TaskDuration"] - start["TaskDuration"], "rendererScriptSeconds": end["ScriptDuration"] - start["ScriptDuration"], "heapUsedStart": start["JSHeapUsedSize"], "heapUsedEnd": end["JSHeapUsedSize"], "nodesEnd": end["Nodes"]}
}
func ObserveNaturalConnections(ctx context.Context, page *rod.Page, sender string) (map[string]any, error) {
	p := page.Context(ctx)
	if err := (proto.PerformanceEnable{}).Call(p); err != nil {
		return nil, err
	}
	var mu sync.Mutex
	connections := map[proto.NetworkRequestID]*socketSummary{}
	observing := false
	overflow := false
	frames := 0
	eventCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	done := make(chan struct{})
	wait := p.Context(eventCtx).EachEvent(func(e *proto.NetworkWebSocketCreated) {
		mu.Lock()
		defer mu.Unlock()
		if len(connections) >= 8 {
			overflow = true
			return
		}
		host, path := socketEndpoint(e.URL)
		connections[e.RequestID] = &socketSummary{Host: host, PathClass: path, FrameClasses: map[string]int{}}
	}, func(e *proto.NetworkWebSocketFrameReceived) {
		mu.Lock()
		defer mu.Unlock()
		if !observing || e.Response == nil {
			return
		}
		frames++
		if frames > 10000 {
			overflow = true
			return
		}
		s := connections[e.RequestID]
		if s == nil {
			return
		}
		s.Received++
		s.FrameClasses[frameClass(e.Response.PayloadData)]++
		s.ReceivedPayloadChars += len(e.Response.PayloadData)
		if e.Response.Opcode == 1 {
			s.TextFrames++
		} else if e.Response.Opcode == 2 {
			s.BinaryFrames++
		}
	}, func(e *proto.NetworkWebSocketFrameSent) {
		mu.Lock()
		defer mu.Unlock()
		if !observing || e.Response == nil {
			return
		}
		frames++
		if frames > 10000 {
			overflow = true
			return
		}
		s := connections[e.RequestID]
		if s == nil {
			return
		}
		s.Sent++
		s.SentPayloadChars += len(e.Response.PayloadData)
	}, func(e *proto.NetworkWebSocketClosed) {
		mu.Lock()
		defer mu.Unlock()
		if s := connections[e.RequestID]; s != nil {
			s.Closed = true
		}
	})
	go func() { defer close(done); defer func() { _ = recover() }(); wait() }()
	defer func() { cancel(); <-done }()
	entry := NewDMEntryDriver(p, func() {})
	o, e := entry.Inspect(ctx, exactreply.DMEntryTarget{Protocol: exactreply.DMEntryProtocol, AccountID: "natural-connection-observation", SenderID: sender})
	if e != nil || o.Identity != "MATCH" || o.Risk || o.LoginChallenge {
		return nil, errors.New("IDENTITY_UNVERIFIED")
	}
	pause := func(d time.Duration) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(d):
			return nil
		}
	}
	if e = pause(5 * time.Second); e != nil {
		return nil, e
	}
	mu.Lock()
	exploreSockets := len(connections)
	mu.Unlock()
	if e = p.Navigate("https://www.xiaohongshu.com/chat"); e != nil {
		return nil, e
	}
	if e = p.WaitLoad(); e != nil {
		return nil, e
	}
	if e = pause(5 * time.Second); e != nil {
		return nil, e
	}
	check := func() bool {
		v, er := p.Eval(InboxMetadataDOM, sender)
		if er != nil {
			return false
		}
		var s inboxSnapshot
		if json.Unmarshal([]byte(v.Value.Str()), &s) != nil {
			return false
		}
		return s.Identity == "MATCH" && s.Route == "CHAT" && !s.Risk && !s.LoginChallenge
	}
	if !check() {
		return nil, errors.New("CHAT_UNVERIFIED")
	}
	a := safeMetrics(p)
	if e = pause(15 * time.Second); e != nil {
		return nil, e
	}
	b := safeMetrics(p)
	if !check() {
		return nil, errors.New("CHAT_CHANGED")
	}
	mu.Lock()
	observing = true
	mu.Unlock()
	if e = pause(40 * time.Second); e != nil {
		return nil, e
	}
	c := safeMetrics(p)
	if !check() {
		return nil, errors.New("CHAT_CHANGED")
	}
	mu.Lock()
	list := []socketSummary{}
	for _, s := range connections {
		list = append(list, *s)
	}
	mu.Unlock()
	notification := map[string]any{"attempted": true, "submissions": 0}
	n := NewNotificationAction(p)
	before, err := n.UnreadCount(ctx)
	if err != nil {
		notification["code"] = "COUNT_UNAVAILABLE"
	} else {
		notification["before"] = before
		rows, readErr := n.List(ctx, TabMentions, 5)
		if readErr != nil {
			notification["code"] = "LIST_UNAVAILABLE"
		} else {
			notification["code"] = "BOUNDED_LIST_RETURNED"
			notification["items"] = len(rows.Items)
			notification["filtered"] = rows.Filtered
			meta := []map[string]bool{}
			for _, row := range rows.Items {
				meta = append(meta, map[string]bool{"stableId": row.ID != "", "senderId": row.From.UserID != "", "nickname": row.From.Nickname != "", "commentText": row.CommentText != "", "commentId": row.CommentID != "", "postId": row.FeedID != "", "time": row.Time > 0})
			}
			notification["fields"] = meta
			after, afterErr := n.UnreadCount(ctx)
			if afterErr == nil {
				notification["after"] = after
			} else {
				notification["afterUnavailable"] = true
			}
		}
	}
	return map[string]any{"notification": notification, "code": "NATURAL_CONNECTION_OBSERVED", "identityMatched": true, "exploreSocketCount": exploreSockets, "sockets": list, "baseline": metricPhase(a, b, 15), "observing": metricPhase(b, c, 40), "overflow": overflow, "inputs": 0, "submissions": 0, "chatClicks": 0, "messageBodiesRecorded": false, "headersRecorded": false, "createdSocketsByObserver": 0, "note": "idle sequential sample, not controlled causal benchmark; natural website auth/heartbeat frames may be sent"}, nil
}

// Whitelist protocol classification only. Never return arbitrary payload values.
func frameClass(raw string) string {
	if raw == "ping" || raw == "pong" {
		return "PLAIN_KEEPALIVE"
	}
	if len(raw) > 65536 {
		return "OVERSIZED_UNCLASSIFIED"
	}
	var m map[string]json.RawMessage
	if json.Unmarshal([]byte(raw), &m) != nil {
		return "NON_JSON_UNCLASSIFIED"
	}
	var n int
	if json.Unmarshal(m["type"], &n) == nil {
		switch n {
		case 4, 132:
			return "NUMERIC_TYPE_4_OR_132"
		case 1, 129, 130, 138, 140:
			return "NUMERIC_TYPE_CONTROL_CANDIDATE"
		case 2:
			return "NUMERIC_TYPE_2_UNCLASSIFIED"
		}
	}
	return "JSON_UNCLASSIFIED"
}
