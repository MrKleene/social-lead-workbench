package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"github.com/xpzouying/xiaohongshu-mcp/xiaohongshu"
	"os"
)

func registerRestrictionInspectionTool(server *mcp.Server) {
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_account_restriction_inspect", Description: exactreply.RestrictionProtocol + " " + exactreply.ProfileRestrictionProtocol + " same saved session; visible notice and bounded screenshot; no writes", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, func(ctx context.Context, req *mcp.CallToolRequest, t exactreply.RestrictionTarget) (*mcp.CallToolResult, any, error) {
		r := exactreply.InspectRestriction(ctx, t, func() (exactreply.RestrictionInspector, error) {
			b := newBrowser()
			complete := false
			defer func() {
				if !complete {
					b.Close()
				}
			}()
			p := b.NewPage()
			inspector := xiaohongshu.NewRestrictionInspectionDriver(p, func() { b.Close() })
			complete = true
			return inspector, nil
		})
		return nil, r, nil
	})
}

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
		return nil, map[string]any{"protocol": exactreply.Protocol, "enabled": os.Getenv("CRM_EXACT_REPLY_ENABLED") == "1", "exactTarget": true, "cancellation": "context-and-owned-stop", "receiptMode": "FAIL_CLOSED", "confirmedResponseMapping": true, "receiptCapture": exactreply.ReceiptCaptureProtocol, "stageJournal": exactreply.JournalProtocol, "channels": []string{"COMMENT"}, "sendTool": "workbench_reply_exact", "statusTool": "workbench_reply_status"}, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_reply_exact", Description: exactreply.Protocol + " no author fallback; no unverified success", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(true)}}, func(ctx context.Context, req *mcp.CallToolRequest, c exactreply.Command) (*mcp.CallToolResult, any, error) {
		if os.Getenv("CRM_EXACT_REPLY_ENABLED") != "1" {
			return nil, exactreply.Result{Protocol: exactreply.Protocol, AttemptID: c.AttemptID, RequestKey: c.RequestKey, AccountID: c.AccountID, Kind: "NOT_SENT", Phase: "BEFORE_SUBMIT", Reason: "CANCELLED", Stopped: true}, nil
		}
		// Fixed file in the already-private owned session directory. Never use a
		// path supplied by the command, and never start a browser without durability.
		directory, err := os.Getwd()
		if err != nil {
			return nil, exactreply.Result{Protocol: exactreply.Protocol, AttemptID: c.AttemptID, RequestKey: c.RequestKey, AccountID: c.AccountID, Kind: "UNKNOWN", Reason: "JOURNAL_UNAVAILABLE", Stopped: true}, nil
		}
		journal, err := exactreply.OpenJournal(directory, c.AttemptID)
		if err != nil {
			return nil, exactreply.Result{Protocol: exactreply.Protocol, AttemptID: c.AttemptID, RequestKey: c.RequestKey, AccountID: c.AccountID, Kind: "UNKNOWN", Reason: "JOURNAL_UNAVAILABLE", Stopped: true}, nil
		}
		defer journal.Close()
		ctx = exactreply.WithJournal(ctx, journal)
		r := engine.Execute(ctx, c, func() (exactreply.Driver, error) {
			b := newBrowser()
			complete := false
			defer func() {
				if !complete {
					b.Close()
				}
			}()
			p := b.NewPage()
			driver := xiaohongshu.NewExactReplyDriver(p, func() { b.Close() })
			complete = true
			return driver, nil
		})
		return nil, r, nil
	})
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_reply_status", Description: exactreply.Protocol + " memory-only receipt; no browser, no retry", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, func(ctx context.Context, req *mcp.CallToolRequest, c exactreply.Command) (*mcp.CallToolResult, any, error) {
		return nil, engine.Status(c), nil
	})
}

// Diagnostic mode is exclusive. The process exposes no sender or legacy HTTP actions.
func registerSelectionDiagnosticTool(server *mcp.Server) {
	registerSelectionDiagnosticFactory(server, func() (exactreply.SelectionInspector, error) {
		b := newBrowser()
		complete := false
		defer func() {
			if !complete {
				b.Close()
			}
		}()
		p := b.NewPage()
		d := xiaohongshu.NewSelectionDiagnosticDriver(p, func() { b.Close() })
		complete = true
		return d, nil
	})
}
func registerSelectionDiagnosticFactory(server *mcp.Server, factory func() (exactreply.SelectionInspector, error)) {
	engine := &exactreply.SelectionDiagnosticEngine{}
	mcp.AddTool(server, &mcp.Tool{Name: "workbench_reply_selection_diagnostic", Description: exactreply.SelectionDiagnosticProtocol + " one reply-control click; observe and close; no input or submit", InputSchema: json.RawMessage(selectionDiagnosticSchema), Annotations: &mcp.ToolAnnotations{ReadOnlyHint: false, DestructiveHint: boolPtr(false)}}, func(ctx context.Context, req *mcp.CallToolRequest, t exactreply.SelectionTarget) (*mcp.CallToolResult, any, error) {
		directory, err := os.Getwd()
		if err != nil {
			return nil, nil, err
		}
		if !t.Valid() {
			return nil, nil, fmtSelectionInvalid()
		}
		journal, err := exactreply.OpenJournal(directory, t.InspectionID)
		if err != nil {
			return nil, nil, fmtSelectionInvalid()
		}
		defer journal.Close()
		return nil, engine.Execute(exactreply.WithJournal(ctx, journal), t, factory), nil
	})
}
func fmtSelectionInvalid() error { return errors.New("SELECTION_DIAGNOSTIC_UNAVAILABLE") }

const selectionDiagnosticSchema = `{"type":"object","additionalProperties":false,"required":["protocol","inspectionId","accountId","senderId","postId","targetCommentId","recipientId","postReference","maxReplySelections","maxInputs","maxSubmissions"],"properties":{"protocol":{"type":"string","const":"workbench.xhs.reply-selection-diagnostic.v1"},"inspectionId":{"type":"string","pattern":"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"},"accountId":{"type":"string","pattern":"^[A-Za-z0-9:_-]{1,200}$"},"senderId":{"type":"string","pattern":"^[a-f0-9]{24}$"},"postId":{"type":"string","pattern":"^[a-f0-9]{24}$"},"targetCommentId":{"type":"string","pattern":"^[a-f0-9]{24}$"},"recipientId":{"type":"string","pattern":"^[a-f0-9]{24}$"},"postReference":{"type":"object","additionalProperties":false,"required":["postId","token","source"],"properties":{"postId":{"type":"string","pattern":"^[a-f0-9]{24}$"},"token":{"type":"string","minLength":1,"maxLength":4096,"pattern":"^[A-Za-z0-9_+/=-]+$"},"source":{"type":"string","enum":["pc_feed","pc_search"]}}},"maxReplySelections":{"type":"integer","const":1},"maxInputs":{"type":"integer","const":0},"maxSubmissions":{"type":"integer","const":0}}}`
