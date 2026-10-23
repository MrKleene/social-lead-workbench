package xiaohongshu

import (
	"encoding/json"
	"strings"
	"testing"
)

func avatarFixture(users ...string) []byte {
	comments := []string{}
	for _, user := range users {
		comments = append(comments, `{"userInfo":`+user+`}`)
	}
	return []byte(`{"requested":{"comments":{"list":[` + strings.Join(comments, ",") + `]}}}`)
}
func fieldCount(d *AvatarSourceDiagnostic, group, shape string) int {
	for _, c := range d.Fields {
		if c.Group == group && c.Shape == shape {
			return c.Count
		}
	}
	return 0
}
func conversionCount(d *AvatarSourceDiagnostic, state string) int {
	for _, c := range d.Conversion {
		if c.State == state {
			return c.Count
		}
	}
	return 0
}
func TestAvatarSourceTypes(t *testing.T) {
	cases := []struct{ input, shape, state string }{
		{`{}`, "MISSING", "EMPTY_AFTER_DECODE"}, {`{"avatar":null}`, "NULL", "EMPTY_AFTER_DECODE"},
		{`{"avatar":""}`, "EMPTY_STRING", "EMPTY_AFTER_DECODE"}, {`{"avatar":"  "}`, "WHITESPACE_STRING", "NONEMPTY_PRESERVED"},
		{`{"avatar":"https://example.invalid/fake?token=NEVER_LOG"}`, "NONEMPTY_STRING", "NONEMPTY_PRESERVED"},
		{`{"avatar":42}`, "NUMBER", "USER_DECODE_FAILED"}, {`{"avatar":true}`, "BOOLEAN", "USER_DECODE_FAILED"},
		{`{"avatar":[]}`, "ARRAY", "USER_DECODE_FAILED"}, {`{"avatar":{}}`, "OBJECT", "USER_DECODE_FAILED"},
	}
	for _, tc := range cases {
		t.Run(tc.shape, func(t *testing.T) {
			d := inspectRawAvatarSource(avatarFixture(tc.input), "requested")
			if fieldCount(d, "FIXED_AVATAR", tc.shape) != 1 || conversionCount(d, tc.state) != 1 {
				t.Fatalf("unexpected diagnostic: %+v", d)
			}
		})
	}
}
func TestAvatarNoAliasMappingOrSecrets(t *testing.T) {
	raw := avatarFixture(`{"userId":"PRIVATE_ID","nickname":"PRIVATE_NAME","opaqueImageSecret":"https://secret.invalid/?token=TOKEN_SECRET","Avatar":"https://example.invalid/case","unknownKeySecret":{"cookie":"COOKIE_SECRET"}}`)
	before := string(raw)
	d := inspectRawAvatarSource(raw, "requested")
	encoded, _ := json.Marshal(d)
	for _, secret := range []string{"PRIVATE_ID", "PRIVATE_NAME", "opaqueImageSecret", "unknownKeySecret", "TOKEN_SECRET", "COOKIE_SECRET", "https:", "example.invalid", "secret.invalid"} {
		if strings.Contains(string(encoded), secret) {
			t.Fatalf("diagnostic leaked input")
		}
	}
	if fieldCount(d, "IMAGE_NAMED_MEMBER", "NONEMPTY_STRING") != 1 || fieldCount(d, "AVATAR_CASE_VARIANT", "NONEMPTY_STRING") != 1 || conversionCount(d, "NONEMPTY_PRESERVED") != 1 {
		t.Fatal("classification/actual Go case folding mismatch")
	}
	if string(raw) != before {
		t.Fatal("input mutated")
	}
	d = inspectRawAvatarSource(avatarFixture(`{"image":"https://example.invalid/not-an-approved-alias"}`), "requested")
	if conversionCount(d, "EMPTY_AFTER_DECODE") != 1 {
		t.Fatal("must not map guessed aliases")
	}
}
func TestAvatarSelectedFeedAndReplies(t *testing.T) {
	d := inspectRawAvatarSource([]byte(`{"other":{"comments":{"list":[{"userInfo":{"avatar":"secret"}}]}},"requested":{"comments":{"list":[{"userInfo":{"avatar":""},"subComments":[{"userInfo":{"avatar":"fixture"}}]}]}}}`), "requested")
	if d.Roots != 1 || d.Replies != 1 || conversionCount(d, "NONEMPTY_PRESERVED") != 1 {
		t.Fatalf("scope mismatch: %+v", d)
	}
}
func TestAvatarMalformedAndUnavailable(t *testing.T) {
	for _, tc := range []struct{ raw, status string }{{`{`, "INVALID_JSON"}, {`{}`, "FEED_MISSING"}, {`{"requested":{"comments":{"list":5}}}`, "INVALID_SHAPE"}} {
		if d := inspectRawAvatarSource([]byte(tc.raw), "requested"); d.Status != tc.status {
			t.Fatal(d.Status)
		}
	}
	d := inspectRawAvatarSource(avatarFixture(`null`, `[]`, `"secret"`), "requested")
	if conversionCount(d, "USER_UNAVAILABLE") != 3 {
		t.Fatal("unavailable users")
	}
}
func TestAvatarBoundsAndDeterminism(t *testing.T) {
	d := inspectRawAvatarSource(make([]byte, avatarDiagnosticBytes+1), "requested")
	if !d.Truncated || d.Status != "BYTE_LIMIT" {
		t.Fatal("byte bound")
	}
	users := make([]string, avatarDiagnosticUsers+2)
	for i := range users {
		users[i] = `{}`
	}
	d = inspectRawAvatarSource(avatarFixture(users...), "requested")
	if !d.Truncated || d.Roots != avatarDiagnosticUsers {
		t.Fatal("user bound")
	}
	child := `{"userInfo":{}}`
	for i := 0; i < avatarDiagnosticDepth+2; i++ {
		child = `{"userInfo":{},"subComments":[` + child + `]}`
	}
	d = inspectRawAvatarSource([]byte(`{"requested":{"comments":{"list":[`+child+`]}}}`), "requested")
	if !d.Truncated || d.Replies != avatarDiagnosticDepth {
		t.Fatal("depth bound")
	}
	fields := map[string]any{}
	for i := 0; i < avatarDiagnosticFields+1; i++ {
		fields[strings.Repeat("x", i+1)] = true
	}
	u, _ := json.Marshal(fields)
	d = inspectRawAvatarSource(avatarFixture(string(u)), "requested")
	if !d.Truncated {
		t.Fatal("field bound")
	}
	raw := avatarFixture(`{"avatar":"","imageUnknown":null,"secretOther":5}`)
	a, _ := json.Marshal(inspectRawAvatarSource(raw, "requested"))
	for i := 0; i < 20; i++ {
		b, _ := json.Marshal(inspectRawAvatarSource(raw, "requested"))
		if string(a) != string(b) {
			t.Fatal("unstable diagnostic")
		}
	}
}
func TestAvatarResponseRoundTrip(t *testing.T) {
	d := inspectRawAvatarSource(avatarFixture(`{"avatar":""}`), "requested")
	response := FeedDetailResponse{AvatarSourceDiagnostic: d}
	wire, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	var decoded FeedDetailResponse
	if err = json.Unmarshal(wire, &decoded); err != nil || decoded.AvatarSourceDiagnostic == nil {
		t.Fatal("diagnostic not delivered")
	}
}
