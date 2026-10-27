package main

import (
	"context"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
	"os"
)

func registerExactPreflightTool(server *mcp.Server) {
	// Independent read-only tool: does not enable or invoke the send engine.
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_reply_preflight", Description: exactreply.PreflightProtocol + " inspect exact target only; never select/type/submit", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, func(ctx context.Context, req *mcp.CallToolRequest, t exactreply.PreflightTarget) (*mcp.CallToolResult, any, error) {
		r := exactreply.Preflight(ctx, t, func() (exactreply.ReadOnlyInspector, error) {
			b := newBrowser()
			complete := false
			defer func() {
				if !complete {
					b.Close()
				}
			}()
			p := b.NewPage()
			inspector := xiaohongshu.NewExactPreflightDriver(p, func() { b.Close() })
			complete = true
			return inspector, nil
		})
		return nil, r, nil
	})

}

func registerExactReplyTools(server *mcp.Server) {
	registerExactPreflightTool(server)
	engine := &exactreply.Engine{}
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_reply_capabilities", Description: exactreply.Protocol + " finite exact-target reply, default OFF", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, func(ctx context.Context, req *mcp.CallToolRequest, args struct{}) (*mcp.CallToolResult, any, error) {
		return nil, map[string]any{"protocol": exactreply.Protocol, "enabled": os.Getenv("CRM_EXACT_REPLY_ENABLED") == "1", "exactTarget": true, "cancellation": "context-and-owned-stop", "receiptMode": "FAIL_CLOSED", "confirmedResponseMapping": false, "channels": []string{"COMMENT"}, "sendTool": "workbench_reply_exact", "statusTool": "workbench_reply_status"}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_reply_exact", Description: exactreply.Protocol + " no author fallback; no unverified success", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(true)}}, func(ctx context.Context, req *mcp.CallToolRequest, c exactreply.Command) (*mcp.CallToolResult, any, error) {
		if os.Getenv("CRM_EXACT_REPLY_ENABLED") != "1" {
			return nil, exactreply.Result{Protocol: exactreply.Protocol, AttemptID: c.AttemptID, RequestKey: c.RequestKey, AccountID: c.AccountID, Kind: "NOT_SENT", Phase: "BEFORE_SUBMIT", Reason: "CANCELLED", Stopped: true}, nil
		}
		r := engine.Execute(ctx, c, func() (exactreply.Driver, error) {
			b := newBrowser()
			p := b.NewPage()
			return xiaohongshu.NewExactReplyDriver(p, func() { b.Close() }), nil
		})
		return nil, r, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_reply_status", Description: exactreply.Protocol + " memory-only receipt; no browser, no retry", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, func(ctx context.Context, req *mcp.CallToolRequest, c exactreply.Command) (*mcp.CallToolResult, any, error) {
		return nil, engine.Status(c), nil
	})
}
