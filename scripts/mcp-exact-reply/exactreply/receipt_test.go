package exactreply

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func receiptFixture(c Command) (string, []byte, []byte, *ReceiptMapping) {
	endpoint := "https://edith.xiaohongshu.com/api/synthetic/comment" // fixture, NOT a platform schema
	request, _ := json.Marshal(map[string]any{"note_id": c.PostID, "target_comment_id": c.TargetID, "content": c.Content, "token": "secret"})
	response := []byte(`{"success":true,"data":{"id":"eeeeeeeeeeeeeeeeeeeeeeee"},"token":"SECRET","msg":"private text"}`)
	mapping := &ReceiptMapping{Endpoint: endpoint, PostPath: "/note_id", TargetPath: "/target_comment_id", ContentPath: "/content", SuccessPath: "/success", SuccessValue: true, ReplyIDPath: "/data/id"}
	return endpoint, request, response, mapping
}
func TestReceiptRequestCorrelation(t *testing.T) {
	c := command()
	endpoint, req, _, _ := receiptFixture(c)
	if !ReceiptRequestMatches(c, endpoint, "POST", req) {
		t.Fatal("exact request not matched")
	}
	for _, tc := range []struct {
		url, method string
		body        []byte
	}{{"https://xiaohongshu.com.evil.invalid/api", "POST", req}, {endpoint, "GET", req}, {endpoint, "POST", []byte(`{"content":"synthetic-only"}`)}, {endpoint, "POST", []byte(`{"token":["` + c.PostID + `","` + c.TargetID + `","` + c.Content + `"]}`)}, {endpoint, "POST", []byte(strings.Repeat("a", 32769))}} {
		if ReceiptRequestMatches(c, tc.url, tc.method, tc.body) {
			t.Fatal("unsafe correlation")
		}
	}
}
func TestReceiptProjectionDoesNotLeak(t *testing.T) {
	c := command()
	_, req, res, _ := receiptFixture(c)
	for _, body := range [][]byte{req, res, []byte(`{"credential":{"id":"eeeeeeeeeeeeeeeeeeeeeeee"},"unexpected-secret-key":"secret","msg":"SECRET"}`)} {
		fields, err := ReceiptProjection(c, body)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := json.Marshal(fields)
		for _, secret := range []string{"SECRET", "secret", "private text", c.Content, "unexpected-secret-key", "credential"} {
			if strings.Contains(string(b), secret) {
				t.Fatalf("leak %s", secret)
			}
		}
	}
	if _, err := ReceiptProjection(c, []byte(strings.Repeat("[", 14)+"0"+strings.Repeat("]", 14))); err == nil {
		t.Fatal("depth")
	}
	if _, err := ReceiptProjection(c, []byte(`{} {}`)); err == nil {
		t.Fatal("trailing data")
	}
}
func TestReceiptMappingRequiresReviewedDescriptorAndExactRequest(t *testing.T) {
	c := command()
	ep, req, res, m := receiptFixture(c)
	if o, a := ParseMappedReceipt(c, nil, ep, 200, req, res); o != nil || a {
		t.Fatal("unreviewed mapped")
	}
	o, a := ParseMappedReceipt(c, m, ep, 200, req, res)
	if !a || o == nil || !Matches(*o, c) {
		t.Fatal("fixture mapping")
	}
	for _, tc := range []struct {
		ep       string
		status   int
		req, res []byte
	}{{ep, 403, req, res}, {ep, 429, req, res}, {ep + "/other", 200, req, res}, {ep, 200, []byte(`{}`), res}, {ep, 200, req, []byte(`{"success":false}`)}, {ep, 200, req, []byte(`{"success":true,"data":{"id":"` + c.TargetID + `"}}`)}} {
		if o, _ := ParseMappedReceipt(c, m, tc.ep, tc.status, tc.req, tc.res); o != nil {
			t.Fatal("false confirmation")
		}
	}
}
func TestReceiptParserAndIndependentReadback(t *testing.T) {
	c := command()
	ep, req, res, m := receiptFixture(c)
	o, a := ParseMappedReceipt(c, m, ep, 200, req, res)
	f := &fake{response: o, accepted: a}
	r := Run(context.Background(), c, f)
	if r.Kind != "CONFIRMED" {
		t.Fatal(r)
	}
	f = &fake{response: o, accepted: a, readFail: true}
	r = Run(context.Background(), c, f)
	if r.Kind == "CONFIRMED" {
		t.Fatal("hidden/pending response claimed delivered")
	}
	f = &fake{response: o, accepted: a, existing: true}
	r = Run(context.Background(), c, f)
	if r.Kind == "CONFIRMED" {
		t.Fatal("old duplicate claimed delivered")
	}
	f = &fake{noResponse: true}
	r = Run(context.Background(), c, f)
	if r.Kind != "UNKNOWN" {
		t.Fatal(r)
	}
}
func TestReceiptJournalDurability(t *testing.T) {
	c := command()
	dir := t.TempDir()
	os.Chmod(dir, 0700)
	j, err := OpenJournal(dir, c.AttemptID)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithJournal(context.Background(), j)
	if RecordReceipt(ctx, ReceiptEvidence{State: "ARMED"}) != nil {
		t.Fatal("arm")
	}
	j.Close()
	b, err := os.ReadFile(filepath.Join(dir, "reply-stage-"+c.AttemptID+".jsonl"))
	if err != nil || !strings.Contains(string(b), `"state":"ARMED"`) {
		t.Fatal("missing evidence")
	}
	if RecordReceipt(ctx, ReceiptEvidence{State: "REQUEST_MATCHED"}) == nil {
		t.Fatal("closed journal succeeded")
	}
	if RecordReceipt(context.Background(), ReceiptEvidence{State: "ARMED"}) == nil {
		t.Fatal("capture without journal")
	}
}

func TestReceiptRouteProjectionCannotExposeQueryOrOpaquePath(t *testing.T) {
	h, p := ReceiptSafeRoute("https://edith.xiaohongshu.com/api/sns/web/v1/comment/post?token=SECRET")
	if h != "edith.xiaohongshu.com" || p != "/api/sns/web/v1/comment/post" {
		t.Fatal(h, p)
	}
	for _, u := range []string{"https://edith.xiaohongshu.com/api/abcdefghijklmnopqrstuvwx", "https://unreviewed.xiaohongshu.com/api/comment/post", "https://edith.xiaohongshu.com/api/comment/eeeeeeeeeeeeeeeeeeeeeeee"} {
		h, p := ReceiptSafeRoute(u)
		if h != "" || p != "" {
			t.Fatal("opaque route exposed")
		}
	}
}

func TestReceiptFailureDiagnosticNeverChangesAcceptanceOrLeaks(t *testing.T) {
	c := command()
	ep, req, _, m := receiptFixture(c)
	for _, message := range []string{"token=SECRET user@example.invalid", "操作频繁，请稍后再试 SECRET", "未知私密内容"} {
		b, _ := json.Marshal(map[string]any{"success": false, "code": -9131, "msg": message, "data": nil})
		f := ReceiptFailureProjection(b)
		if f == nil || f.Code == nil || *f.Code != -9131 || f.MessageClass != "UNSPECIFIED" {
			t.Fatal(f)
		}
		out, _ := json.Marshal(f)
		if strings.Contains(string(out), message) || strings.Contains(string(out), "SECRET") {
			t.Fatal("leak")
		}
		if o, a := ParseMappedReceipt(c, m, ep, 200, req, b); o != nil || a {
			t.Fatal("rejection became acceptance")
		}
	}
	for message, class := range map[string]string{"操作频繁，请稍后再试": "RATE_LIMITED", "请先登录": "LOGIN_REQUIRED", "请完成验证": "VERIFICATION_REQUIRED", "发送失败": "GENERIC_REJECTION"} {
		b, _ := json.Marshal(map[string]any{"success": false, "msg": message})
		f := ReceiptFailureProjection(b)
		if f == nil || f.MessageClass != class {
			t.Fatal(f)
		}
	}
	for _, body := range []string{`{"success":true,"code":-9131}`, `{"code":-9131}`, `{"success":"false"}`, `{} {}`} {
		if ReceiptFailureProjection([]byte(body)) != nil {
			t.Fatal(body)
		}
	}
}
