package main

import (
	"context"
	"encoding/json"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"os"
	"testing"
)

type diagnosticToolFixture struct{ opens int }

func (f *diagnosticToolFixture) Inspect(ctx context.Context, t exactreply.SelectionTarget) (exactreply.Snapshot, error) {
	return exactreply.Snapshot{PostID: t.PostID, SenderID: t.SenderID, TargetID: t.TargetID, TargetAuthor: t.RecipientID}, nil
}
func (f *diagnosticToolFixture) OpenOnce(context.Context, exactreply.SelectionTarget) error {
	f.opens++
	return nil
}
func (f *diagnosticToolFixture) Trace() exactreply.SelectionTrace {
	return exactreply.SelectionTrace{ClickEvent: "NOT_OBSERVED"}
}
func (f *diagnosticToolFixture) Close(context.Context) error { return nil }
func diagnosticSession(t *testing.T, server *mcp.Server) *mcp.ClientSession {
	t.Helper()
	ct, st := mcp.NewInMemoryTransports()
	ctx := context.Background()
	ss, e := server.Connect(ctx, st, nil)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { ss.Close() })
	client := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	cs, e := client.Connect(ctx, ct, nil)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { cs.Close() })
	return cs
}
func TestSelectionDiagnosticExclusiveRegistrationAndRoutes(t *testing.T) {
	t.Setenv("CRM_REPLY_SELECTION_DIAGNOSTIC_ONLY", "1")
	t.Setenv("CRM_EXACT_REPLY_ENABLED", "1")
	server := mcp.NewServer(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	registerTools(server, &AppServer{})
	cs := diagnosticSession(t, server)
	list, e := cs.ListTools(context.Background(), nil)
	if e != nil || len(list.Tools) != 1 || list.Tools[0].Name != "workbench_reply_selection_diagnostic" || list.Tools[0].Annotations.ReadOnlyHint {
		t.Fatal(list, e)
	}
	for _, r := range setupRoutes(&AppServer{}).Routes() {
		if r.Path != "/health" && r.Path != "/mcp" && r.Path != "/mcp/*path" {
			t.Fatal(r.Path)
		}
	}
	raw, _ := json.Marshal(list.Tools[0].InputSchema)
	var schema map[string]any
	json.Unmarshal(raw, &schema)
	if schema["additionalProperties"] != false {
		t.Fatal(string(raw))
	}
	props := schema["properties"].(map[string]any)
	for key, want := range map[string]float64{"maxReplySelections": 1, "maxInputs": 0, "maxSubmissions": 0} {
		if props[key].(map[string]any)["const"] != want {
			t.Fatal(string(raw))
		}
	}
	t.Logf("registered exclusive tool=%s inputSchema=%s", list.Tools[0].Name, raw)
	if _, ok := props["content"]; ok {
		t.Fatal("body accepted")
	}
}
func TestSelectionDiagnosticMCPCallsSelectionAndRejectsUnboundedInput(t *testing.T) {
	dir := t.TempDir()
	os.Chmod(dir, 0700)
	old, _ := os.Getwd()
	os.Chdir(dir)
	defer os.Chdir(old)
	server := mcp.NewServer(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	f := &diagnosticToolFixture{}
	factories := 0
	registerSelectionDiagnosticFactory(server, func() (exactreply.SelectionInspector, error) { factories++; return f, nil })
	cs := diagnosticSession(t, server)
	args := map[string]any{"protocol": exactreply.SelectionDiagnosticProtocol, "inspectionId": "11111111-1111-1111-1111-111111111111", "accountId": "test", "senderId": "aaaaaaaaaaaaaaaaaaaaaaaa", "postId": "bbbbbbbbbbbbbbbbbbbbbbbb", "targetCommentId": "cccccccccccccccccccccccc", "recipientId": "dddddddddddddddddddddddd", "postReference": map[string]any{"postId": "bbbbbbbbbbbbbbbbbbbbbbbb", "token": "synthetic", "source": "pc_feed"}, "maxReplySelections": 1, "maxInputs": 0, "maxSubmissions": 0}
	for key, value := range map[string]any{"content": "must never type", "maxInputs": 1, "maxSubmissions": 1, "maxReplySelections": 2} {
		bad := map[string]any{}
		for k, v := range args {
			bad[k] = v
		}
		bad[key] = value
		r, e := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "workbench_reply_selection_diagnostic", Arguments: bad})
		if e == nil && !r.IsError {
			t.Fatal("accepted", key)
		}
		if factories != 0 {
			t.Fatal("invalid input reached factory")
		}
	}
	r, e := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "workbench_reply_selection_diagnostic", Arguments: args})
	if e != nil || r.IsError || f.opens != 1 || factories != 1 {
		t.Fatal(r, e, f, factories)
	}
	r, e = cs.CallTool(context.Background(), &mcp.CallToolParams{Name: "workbench_reply_selection_diagnostic", Arguments: args})
	if e == nil && !r.IsError {
		t.Fatal("replayed inspection")
	}
	if f.opens != 1 {
		t.Fatal("repeat click")
	}
}
