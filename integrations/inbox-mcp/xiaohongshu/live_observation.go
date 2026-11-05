package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"net/url"
	"regexp"
	"sort"
	"sync"
	"time"
)

// Persist field names/types and small numeric protocol discriminators only.
// Never retain frame text, string values, credentials, message contents or IDs.
func frameSchema(raw string, opcode float64) map[string]any {
	out := map[string]any{"length": len(raw), "opcode": opcode}
	if opcode != 1 || len(raw) > 65536 {
		return out
	}
	var v any
	if json.Unmarshal([]byte(raw), &v) != nil {
		out["format"] = "non_json"
		return out
	}
	out["format"] = "json"
	fields := map[string]string{}
	numbers := map[string]float64{}
	safe := regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,39}$`)
	var walk func(any, string, int)
	walk = func(x any, path string, depth int) {
		if depth > 3 || len(fields) > 60 {
			return
		}
		switch z := x.(type) {
		case map[string]any:
			fields[path] = "object"
			for k, val := range z {
				if safe.MatchString(k) {
					walk(val, path+"."+k, depth+1)
				}
			}
		case []any:
			fields[path] = "array"
		case string:
			fields[path] = "string"
		case float64:
			fields[path] = "number"
			if z >= 0 && z < 1000 && ((path == "$.t" || path == "$.v" || path == "$.type") || path == "$.cmd" || path == "$.op" || path == "$.code" || path == "$.b.a.c" || path == "$.msgType" || path == "$.messageType") {
				numbers[path] = z
			}
		case bool:
			fields[path] = "boolean"
		default:
			fields[path] = "null"
		}
	}
	walk(v, "$", 0)
	out["fields"] = fields
	out["protocolNumbers"] = numbers
	return out
}
func ObserveLiveComment(ctx context.Context, page *rod.Page, sender string) (map[string]any, error) {
	p := page.Context(ctx)
	var mu sync.Mutex
	hosts := map[proto.NetworkRequestID]string{}
	frames := []map[string]any{}
	sockets := []map[string]any{}
	responses := []map[string]any{}
	ev, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	wait := p.Context(ev).EachEvent(func(e *proto.NetworkWebSocketCreated) {
		u, er := url.Parse(e.URL)
		if er != nil {
			return
		}
		h, _ := socketEndpoint(e.URL)
		if h == "OTHER" {
			return
		}
		mu.Lock()
		defer mu.Unlock()
		if len(hosts) < 8 {
			hosts[e.RequestID] = h
			sockets = append(sockets, map[string]any{"host": h, "path": u.Path})
		}
	}, func(e *proto.NetworkWebSocketHandshakeResponseReceived) {
		mu.Lock()
		defer mu.Unlock()
		if hosts[e.RequestID] != "" && e.Response != nil {
			sockets = append(sockets, map[string]any{"host": hosts[e.RequestID], "handshakeStatus": e.Response.Status})
		}
	}, func(e *proto.NetworkWebSocketFrameReceived) {
		mu.Lock()
		defer mu.Unlock()
		if hosts[e.RequestID] != "" && e.Response != nil && len(frames) < 30 {
			v := frameSchema(e.Response.PayloadData, e.Response.Opcode)
			v["host"] = hosts[e.RequestID]
			v["observedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
			frames = append(frames, v)
		}
	}, func(e *proto.NetworkResponseReceived) {
		if e.Response == nil {
			return
		}
		u, er := url.Parse(e.Response.URL)
		if er != nil {
			return
		}
		// Only API path categories, no query/body/headers or user-specific IDs.
		if e.Type == proto.NetworkResourceTypeXHR || e.Type == proto.NetworkResourceTypeFetch {
			path := u.Path
			if len(path) > 160 {
				return
			}
			if regexp.MustCompile(`(?i)(notify|notification|unread|im/|chat/)`).MatchString(path) && !regexp.MustCompile(`[a-f0-9]{20,}`).MatchString(path) {
				mu.Lock()
				defer mu.Unlock()
				if len(responses) < 40 {
					responses = append(responses, map[string]any{"host": u.Hostname(), "path": path, "status": e.Response.Status, "observedAt": time.Now().UTC().Format(time.RFC3339Nano)})
				}
			}
		}
	})
	go func() { defer close(done); defer func() { _ = recover() }(); wait() }()
	defer func() { cancel(); <-done }()
	entry := NewDMEntryDriver(p, func() {})
	o, e := entry.Inspect(ctx, exactreply.DMEntryTarget{Protocol: exactreply.DMEntryProtocol, AccountID: "ws-schema-only", SenderID: sender})
	if e != nil || o.Identity != "MATCH" || o.Risk || o.LoginChallenge {
		return nil, errors.New("IDENTITY_UNVERIFIED")
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(35 * time.Second):
	}
	v, e := p.Eval(`()=>({scripts:[...new Set([...document.scripts].map(s=>s.src).concat(performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script'||/\.js(?:\?|$)/.test(e.name)).map(e=>e.name)))].map(x=>{try{let u=new URL(x);if(!/\.(xhscdn|xiaohongshu)\.com$/.test(u.hostname))return null;return u.origin+u.pathname}catch{return null}}).filter(Boolean).slice(0,100),notificationKeys:Object.keys(window.__INITIAL_STATE__?.notification||{}),commentLonglinkFlag:(()=>{let roots=[document.querySelector("#app"),...document.querySelectorAll("[data-v-app]")];for(let root of roots){let v=root?.__vue_app__?._context?.provides?.webExp?.flags?.enableLonglink;if(v!==undefined)return v==="enable"?"enable":v==="disable"?"disable":"OTHER"}return "UNAVAILABLE"})(),page:location.pathname})`)
	if e != nil {
		return nil, e
	}
	var inventory map[string]any
	if json.Unmarshal([]byte(v.Value.JSON("", "")), &inventory) != nil {
		return nil, errors.New("INVENTORY_INVALID")
	}
	mu.Lock()
	defer mu.Unlock()
	sort.Slice(responses, func(i, j int) bool { return responses[i]["path"].(string) < responses[j]["path"].(string) })
	return map[string]any{"identity": "MATCH", "sockets": sockets, "receivedFrameSchemas": frames, "publicInventory": inventory, "nativeReadRequestPaths": responses, "submissions": 0, "inputs": 0, "finishedAt": time.Now().UTC().Format(time.RFC3339Nano)}, nil
}
