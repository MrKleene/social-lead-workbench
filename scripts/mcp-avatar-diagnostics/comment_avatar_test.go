package xiaohongshu

import (
	"encoding/json"
	"strings"
	"testing"
)

// All fixtures are synthetic. These tests never contact a platform or read sessions.
const syntheticImage = "https://sns-avatar-qc.xhscdn.com/avatar/synthetic-image.jpg"

func decodeSyntheticUser(t *testing.T, fields map[string]any) CommentUser {
	t.Helper()
	raw, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	var got CommentUser
	if err = json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	return got
}
func TestCommentAvatarPriority(t *testing.T) {
	for _, original := range []string{syntheticImage + "-original", "legacy-opaque", "https://untrusted.invalid/?token=FAKE"} {
		got := decodeSyntheticUser(t, map[string]any{"avatar": original, "image": syntheticImage, "userId": "synthetic-id"})
		if got.Avatar != original || got.AvatarSource != "avatar" || got.UserID != "synthetic-id" {
			t.Fatal("original string must not be overwritten; receiver still validates it")
		}
	}
	for _, empty := range []any{nil, "", " \t\n", 42, true, []any{}, map[string]any{}} {
		got := decodeSyntheticUser(t, map[string]any{"avatar": empty, "image": syntheticImage})
		if got.Avatar != syntheticImage || got.AvatarSource != "image" {
			t.Fatal("optional invalid/empty avatar fallback")
		}
	}
	if got := decodeSyntheticUser(t, map[string]any{"image": syntheticImage}); got.Avatar != syntheticImage {
		t.Fatal("missing avatar fallback")
	}
	for _, alias := range []string{"Image", "IMAGE", "images", "avatarUrl", "imageb"} {
		if got := decodeSyntheticUser(t, map[string]any{alias: syntheticImage}); got.Avatar != "" || got.AvatarSource != "" {
			t.Fatal("guessed alias mapped")
		}
	}
}
func TestCommentImageStrictBoundary(t *testing.T) {
	values := []any{nil, "", " ", 42, true, []any{syntheticImage}, map[string]any{"url": syntheticImage},
		"http://sns-avatar-qc.xhscdn.com/avatar/a", "//sns-avatar-qc.xhscdn.com/avatar/a", "javascript:alert(1)",
		"https://sns-avatar-qc.xhscdn.com.evil.invalid/avatar/a", "https://evil.invalid/avatar/a",
		"https://user:FAKE@sns-avatar-qc.xhscdn.com/avatar/a", "https://sns-avatar-qc.xhscdn.com:443/avatar/a",
		syntheticImage + "?", syntheticImage + "?imageView2/2/w/80", syntheticImage + "?signature=FAKE", syntheticImage + "#", syntheticImage + "#FAKE",
		"https://sns-avatar-qc.xhscdn.com/avatar/%61", "https://sns-avatar-qc.xhscdn.com/avatar/../a", "https://sns-avatar-qc.xhscdn.com/avatar/./a",
		"https://sns-avatar-qc.xhscdn.com/other/a", "https://sns-avatar-qc.xhscdn.com/avatar/", syntheticImage + "\\", syntheticImage + "\n",
		syntheticImage + strings.Repeat("a", 2049), "https://SNS-AVATAR-QC.XHSCDN.COM/avatar/a"}
	for i, value := range values {
		got := decodeSyntheticUser(t, map[string]any{"image": value})
		if got.Avatar != "" || got.AvatarSource != "" {
			t.Fatalf("unsafe or unsupported synthetic URL mapped at %d", i)
		}
	}
	for _, value := range []string{syntheticImage, "https://sns-avatar-qc.xhscdn.com/avatar/synthetic/a!size=80"} {
		got := decodeSyntheticUser(t, map[string]any{"image": value})
		if got.Avatar != value {
			t.Fatal("clean value must be retained without rewriting")
		}
	}
}
func TestCommentIdentityAndReuse(t *testing.T) {
	for _, field := range []string{"userId", "nickname", "nickName"} {
		raw, _ := json.Marshal(map[string]any{field: 42, "image": syntheticImage})
		var user CommentUser
		if json.Unmarshal(raw, &user) == nil {
			t.Fatal("identity/name type validation weakened")
		}
	}
	user := CommentUser{UserID: "old", Avatar: syntheticImage, AvatarSource: "image"}
	if err := json.Unmarshal([]byte(`{}`), &user); err != nil || user.Avatar != "" || user.AvatarSource != "" || user.UserID != "" {
		t.Fatal("stale user fields retained")
	}
}
func TestCommentRootReplyMappingAndSafeEvidence(t *testing.T) {
	raw := []byte(`{"id":"synthetic-root","content":"合成正文 👩🏽‍🎓","userInfo":{"userId":"PRIVATE_ID","image":"` + syntheticImage + `"},"subComments":[{"id":"synthetic-reply","content":"合成回复","userInfo":{"nickname":"PRIVATE_NAME","avatar":"` + syntheticImage + `","image":"https://evil.invalid/?token=FAKE_TOKEN"}}]}`)
	var comment Comment
	if err := json.Unmarshal(raw, &comment); err != nil {
		t.Fatal(err)
	}
	if comment.ID != "synthetic-root" || comment.UserInfo.AvatarSource != "image" || len(comment.SubComments) != 1 || comment.SubComments[0].UserInfo.AvatarSource != "avatar" {
		t.Fatal("root/reply identity or source lost")
	}
	wire, err := json.Marshal(comment)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(wire), `"image":`) || strings.Contains(string(wire), "FAKE_TOKEN") {
		t.Fatal("raw fallback URL leaked into response")
	}
	diagnostic := inspectRawAvatarSource([]byte(`{"requested":{"comments":{"list":[`+string(raw)+`]}}}`), "requested")
	safe, _ := json.Marshal(diagnostic)
	for _, value := range []string{"PRIVATE_ID", "PRIVATE_NAME", "FAKE_TOKEN", syntheticImage, "https:", "合成"} {
		if strings.Contains(string(safe), value) {
			t.Fatal("diagnostic leaked a value")
		}
	}
	if diagnostic.Roots != 1 || diagnostic.Replies != 1 || conversionCount(diagnostic, "NONEMPTY_PRESERVED") != 2 {
		t.Fatal("diagnostic must use actual comment conversion")
	}
	rejected := decodeSyntheticUser(t, map[string]any{"image": syntheticImage + "?signature=FAKE_TOKEN"})
	out, _ := json.Marshal(rejected)
	if strings.Contains(string(out), "FAKE_TOKEN") || strings.Contains(string(out), syntheticImage) {
		t.Fatal("rejected image persisted")
	}
}
