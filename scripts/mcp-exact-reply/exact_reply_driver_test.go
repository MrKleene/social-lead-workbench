package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"net/url"
	"testing"
)

func TestExactReplyObservationDoesNotInventTarget(t *testing.T) {
	var r Comment
	if err := json.Unmarshal([]byte(`{"id":"eeeeeeeeeeeeeeeeeeeeeeee","noteId":"bbbbbbbbbbbbbbbbbbbbbbbb","content":"synthetic","userInfo":{"userId":"aaaaaaaaaaaaaaaaaaaaaaaa"},"targetComment":{"id":"cccccccccccccccccccccccc","userInfo":{"userId":"dddddddddddddddddddddddd"}}}`), &r); err != nil {
		t.Fatal(err)
	}
	o, ok := exactObservation(r, r.NoteID)
	if !ok || o.ParentID != r.TargetComment.ID || o.SenderID != r.UserInfo.UserID || o.ContentHash != exactreply.Hash("synthetic") {
		t.Fatal(o, ok)
	}
	r.TargetComment = nil
	if _, ok = exactObservation(r, r.NoteID); ok {
		t.Fatal("invented target")
	}
}
func TestExactReplyFlattenPreservesNestedIdentity(t *testing.T) {
	rows, err := exactComments([]Comment{{ID: "root", SubComments: []Comment{{ID: "child"}}}})
	if err != nil || len(rows) != 2 || rows[1].ID != "child" {
		t.Fatal(rows, err)
	}
}

func TestExactReplyURLPreservesExactPostAndSavedReference(t *testing.T) {
	for _, source := range []string{"pc_feed", "pc_search"} {
		c := exactreply.Command{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Reference: exactreply.Reference{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Token: "synthetic+/==", Source: source}}
		u, err := url.Parse(exactURL(c))
		if err != nil || u.Scheme != "https" || u.Host != "www.xiaohongshu.com" || u.Path != "/explore/"+c.PostID || u.Query().Get("xsec_token") != c.Reference.Token || u.Query().Get("xsec_source") != source || len(u.Query()) != 2 {
			t.Fatal("reference round trip failed")
		}
	}
}

func TestExactReplyCancelledSelectDoesNotTouchPage(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	d := &ExactReplyDriver{}
	if err := d.Select(ctx, exactreply.Command{}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
func TestExactReplyNoSelectionNeverEntersSubmit(t *testing.T) {
	d := &ExactReplyDriver{}
	result, err := d.Submit(context.Background(), exactreply.Command{})
	if err == nil || err.Error() != "NOT_SUBMITTED" || result.Attempted {
		t.Fatal(result, err)
	}
}
