package xiaohongshu

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestReplyRelationsDiscoveryIsNotMapping(t *testing.T) {
	raw := coverageFixture(`{"list":[{"id":"private-root","userInfo":{"userId":"private-u1"},"subComments":[{"id":"private-a","userInfo":{"userId":"private-u2"},"targetComment":{"id":"private-b","userInfo":{"userId":"private-u3","nickname":"PRIVATE_NAME"}},"target_secret":"PRIVATE_SECRET","replyToUserId":null},{"id":"private-b","userInfo":{"userId":"private-u3"},"reply_to":"","replyToUser":false}]}]}`)
	s := inspectCoverage(raw, "synthetic", readyCoverage)
	d := s.Relations
	if d == nil || d.Scanned != 3 || d.Limited {
		t.Fatal("missing safe relation evidence")
	}
	found := false
	for _, f := range d.Fields {
		if f.Path == "targetComment.id" {
			found = f.Ordinal == 2 && f.Shape == "STRING" && len(f.CommentOrdinals) == 1 && f.CommentOrdinals[0] == 3
		}
		if f.Path == "targetComment.userInfo.userId" && f.UserMatches != 1 {
			t.Fatal("user match count")
		}
	}
	if !found {
		t.Fatal("known loaded equality lost")
	}
	b, _ := json.Marshal(d)
	for _, secret := range []string{"private-", "PRIVATE_", "target_secret", "nickname"} {
		if strings.Contains(string(b), secret) {
			t.Fatal("source leaked")
		}
	}
}
func TestReplyRelationsBoundedAndUnknownNotMapped(t *testing.T) {
	rows := []map[string]json.RawMessage{}
	for i := 0; i < 200; i++ {
		r := map[string]json.RawMessage{}
		for _, k := range relationFields {
			r[k] = json.RawMessage(`"not-loaded-private"`)
		}
		rows = append(rows, r)
	}
	d := inspectReplyRelations(rows)
	if !d.Limited || len(d.Fields) != 256 {
		t.Fatal("unbounded evidence")
	}
	for _, f := range d.Fields {
		if len(f.CommentOrdinals) != 0 || f.UserMatches != 0 {
			t.Fatal("guessed target")
		}
	}
}
