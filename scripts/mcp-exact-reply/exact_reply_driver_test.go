package xiaohongshu

import (
	"encoding/json"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
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
