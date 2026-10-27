package xiaohongshu

import (
	"context"
	"encoding/json"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExactReplyReceiptEventCorrelation(t *testing.T) {
	for _, scenario := range []string{"normal", "duplicate", "lost", "redirect", "cached", "foreign", "before-click", "journal-failure", "rate", "refused"} {
		t.Run(scenario, func(t *testing.T) {
			c := exactreply.Command{AttemptID: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", PostID: strings.Repeat("b", 24), TargetID: strings.Repeat("c", 24), SenderID: strings.Repeat("a", 24), RecipientID: strings.Repeat("d", 24), Content: "synthetic-only"}
			c.ContentHash = exactreply.Hash(c.Content)
			dir := t.TempDir()
			dir, _ = filepath.EvalSymlinks(dir)
			os.Chmod(dir, 0700)
			j, err := exactreply.OpenJournal(dir, c.AttemptID)
			if err != nil {
				t.Fatal(err)
			}
			defer j.Close()
			ctx := exactreply.WithJournal(context.Background(), j)
			cap := &exactReceiptCapture{}
			if scenario != "before-click" {
				if cap.activate(ctx) != nil {
					t.Fatal("activate")
				}
			}
			request, _ := json.Marshal(map[string]any{"note_id": c.PostID, "target_comment_id": c.TargetID, "content": c.Content, "token": "PRIVATE_TOKEN"})
			endpoint := "https://edith.xiaohongshu.com/api/synthetic/comment?token=PRIVATE_TOKEN"
			e := &proto.NetworkRequestWillBeSent{RequestID: "r1", Request: &proto.NetworkRequest{URL: endpoint, Method: "POST", PostData: string(request)}}
			if scenario == "foreign" {
				e.Request.URL = "https://evil.invalid/comment"
			}
			if scenario == "journal-failure" {
				j.Close()
			}
			cap.onRequest(ctx, c, e)
			if scenario == "duplicate" {
				e.RequestID = "r2"
				cap.onRequest(ctx, c, e)
			}
			if scenario == "redirect" {
				e.RedirectResponse = &proto.NetworkResponse{}
				cap.onRequest(ctx, c, e)
			}
			status := 200
			if scenario == "rate" {
				status = 429
			}
			if scenario == "refused" {
				status = 403
			}
			cap.onResponse(&proto.NetworkResponseReceived{RequestID: "r1", Response: &proto.NetworkResponse{URL: endpoint, Status: status, FromDiskCache: scenario == "cached"}})
			reads := 0
			if scenario != "lost" {
				cap.onFinished(ctx, c, &proto.NetworkLoadingFinished{RequestID: "r1", EncodedDataLength: 100}, func(id proto.NetworkRequestID) (*proto.NetworkGetResponseBodyResult, error) {
					reads++
					if id != "r1" {
						t.Fatal("unrelated response")
					}
					return &proto.NetworkGetResponseBodyResult{Body: `{"success":true,"data":{"id":"eeeeeeeeeeeeeeeeeeeeeeee"},"token":"PRIVATE_TOKEN","msg":"PRIVATE_TEXT"}`}, nil
				})
			}
			o, a, err := cap.finish(ctx, c)
			if o != nil || a {
				t.Fatal("unreviewed confirmed")
			}
			if scenario == "rate" && err != exactreply.RiskError("RATE_LIMITED") {
				t.Fatal(err)
			}
			if scenario == "refused" && err != exactreply.RiskError("PLATFORM_REFUSED") {
				t.Fatal(err)
			}
			if scenario == "journal-failure" && err == nil {
				t.Fatal("journal failure ignored")
			}
			if (scenario == "foreign" || scenario == "before-click" || scenario == "duplicate" || scenario == "cached" || scenario == "redirect") && reads != 0 {
				t.Fatal("read unbound body")
			}
			bytes, _ := os.ReadFile(filepath.Join(dir, "reply-stage-"+c.AttemptID+".jsonl"))
			if strings.Contains(string(bytes), "PRIVATE_") || strings.Contains(string(bytes), "?token") {
				t.Fatal("private data leaked")
			}
			if scenario == "normal" && !strings.Contains(string(bytes), "RESPONSE_CAPTURED") {
				t.Fatal("no evidence")
			}
		})
	}
}
