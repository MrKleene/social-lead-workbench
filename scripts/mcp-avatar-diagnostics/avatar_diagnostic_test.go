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
		{`{"avatar":""}`, "EMPTY_STRING", "EMPTY_AFTER_DECODE"}, {`{"avatar":"  "}`, "WHITESPACE_STRING", "EMPTY_AFTER_DECODE"},
		{`{"avatar":"https://example.invalid/fake?token=NEVER_LOG"}`, "NONEMPTY_STRING", "NONEMPTY_PRESERVED"},
		{`{"avatar":42}`, "NUMBER", "EMPTY_AFTER_DECODE"}, {`{"avatar":true}`, "BOOLEAN", "EMPTY_AFTER_DECODE"},
		{`{"avatar":[]}`, "ARRAY", "EMPTY_AFTER_DECODE"}, {`{"avatar":{}}`, "OBJECT", "EMPTY_AFTER_DECODE"},
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

// All data below is synthetic. No captured page, network or login session is used.
func TestV2CandidateRolesAndSafeClasses(t *testing.T) {
	raw := []byte(`{"requested":{"comments":{"list":[{"userInfo":{"image":"https://sns-avatar-qc.xhscdn.com/avatar/FAKE_ID.jpg","userId":"PRIVATE_PERSON"},"subComments":[{"userInfo":{"images":"http://other.invalid/p?token=PRIVATE_TOKEN","nickname":"PRIVATE_NAME"}}]}]}}}`)
	d := inspectRawAvatarSource(raw, "requested")
	wire, _ := json.Marshal(d)
	if d.Version != 2 || d.Roots != 1 || d.Replies != 1 || len(d.Transitions) != 2 {
		t.Fatal("v2 role coverage")
	}
	seen := map[string]AvatarCandidateCount{}
	for _, c := range d.Candidates {
		seen[c.Role+":"+c.Name] = c
	}
	a, b := seen["ROOT:image"], seen["REPLY:images"]
	if a.Shape != "NONEMPTY_STRING" || a.Protocol != "HTTPS" || a.Host != "ALLOWED" || a.Path != "AVATAR_PATH" || a.Components != "CLEAN" {
		t.Fatal("safe root classification")
	}
	if b.Protocol != "HTTP" || b.Host != "OTHER" || b.Components != "RESTRICTED" {
		t.Fatal("reply classification")
	}
	if seen["ROOT:avatar"].Shape != "MISSING" || conversionCount(d, "EMPTY_AFTER_DECODE") != 1 || conversionCount(d, "NONEMPTY_PRESERVED") != 1 {
		t.Fatal("only the confirmed clean image field may populate avatar")
	}
	for _, v := range []string{"https:", "other.invalid", "FAKE_ID", "PRIVATE_PERSON", "PRIVATE_NAME", "PRIVATE_TOKEN"} {
		if strings.Contains(string(wire), v) {
			t.Fatal("value leakage")
		}
	}
}
func TestV2KeyVocabularyRejectsArbitraryNames(t *testing.T) {
	cases := map[string]string{"image": "ALLOWED", "imageb": "ALLOWED", "avatarURL": "ALLOWED", "imageSecret": "SENSITIVE_KEY", "avatarToken": "SENSITIVE_KEY", "imageCustomPerson": "UNLISTED_IMAGE_KEY", "image\nName": "INVALID_KEY", strings.Repeat("image", 10): "INVALID_KEY", "头像image": "INVALID_KEY", "nickname": "UNRELATED"}
	for key, want := range cases {
		if got := avatarCandidateKey(key); got != want {
			t.Fatal("key classification mismatch")
		}
	}
	user := map[string]any{}
	for key := range cases {
		user[key] = "PRIVATE_VALUE"
	}
	raw, _ := json.Marshal(user)
	d := inspectRawAvatarSource(avatarFixture(string(raw)), "requested")
	wire, _ := json.Marshal(d)
	for key, want := range cases {
		if want != "ALLOWED" && strings.Contains(string(wire), key) {
			t.Fatal("rejected key leaked")
		}
	}
	if strings.Contains(string(wire), "PRIVATE_VALUE") || len(d.Filtered) != 3 {
		t.Fatal("filter counters or value leak")
	}
}
func TestV2CandidateURLClassificationNeverFetches(t *testing.T) {
	cases := []struct{ value, protocol, host, components, path string }{
		{"https://sns-avatar-qc.xhscdn.com/avatar/fake.jpg", "HTTPS", "ALLOWED", "CLEAN", "AVATAR_PATH"},
		{"http://sns-avatar-qc.xhscdn.com/avatar/fake.jpg", "HTTP", "ALLOWED", "CLEAN", "AVATAR_PATH"},
		{"https://sns-avatar-qc.xhscdn.com.evil.invalid/avatar/a", "HTTPS", "OTHER", "CLEAN", "AVATAR_PATH"},
		{"https://user:PASS@sns-avatar-qc.xhscdn.com:444/avatar/a?token=TOKEN#FRAGMENT", "HTTPS", "ALLOWED", "RESTRICTED", "AVATAR_PATH"},
		{"//sns-avatar-qc.xhscdn.com/avatar/a", "RELATIVE", "ALLOWED", "CLEAN", "AVATAR_PATH"},
		{"/avatar/a", "RELATIVE", "UNAVAILABLE", "CLEAN", "AVATAR_PATH"},
		{"data:image/png;base64,PRIVATE", "OTHER", "UNAVAILABLE", "CLEAN", "UNAVAILABLE"},
		{"https://sns-avatar-qc.xhscdn.com/avatar/%2f", "HTTPS", "ALLOWED", "RESTRICTED", "OTHER"},
		{"https://sns-avatar-qc.xhscdn.com\\@evil.invalid/a", "INVALID", "UNAVAILABLE", "NA", "UNAVAILABLE"},
		{strings.Repeat("x", 2049), "INVALID", "UNAVAILABLE", "NA", "UNAVAILABLE"},
	}
	for _, tc := range cases {
		raw, _ := json.Marshal(tc.value)
		c := avatarCandidate("image", "ROOT", raw)
		if c.Protocol != tc.protocol || c.Host != tc.host || c.Components != tc.components || c.Path != tc.path {
			t.Fatal("controlled URL classification mismatch", c)
		}
	}
	for _, raw := range []string{`null`, `""`, `"  "`, `42`, `true`, `[]`, `{}`} {
		c := avatarCandidate("image", "REPLY", []byte(raw))
		if c.Protocol != "NONE" || c.Components != "NA" {
			t.Fatal("non-URL classification")
		}
	}
}
func TestV2CandidateBoundAndStableSerialization(t *testing.T) {
	users := []string{}
	for name := range avatarCandidateNames {
		for _, value := range []any{nil, "", " ", 42, true, []string{}, map[string]string{}, "https://other.invalid/fake", "/relative"} {
			raw, _ := json.Marshal(map[string]any{name: value})
			users = append(users, string(raw))
		}
	}
	raw := avatarFixture(users...)
	d := inspectRawAvatarSource(raw, "requested")
	if !d.Truncated || len(d.Candidates) != 256 {
		t.Fatal("candidate cardinality cap")
	}
	first, _ := json.Marshal(d)
	again, _ := json.Marshal(inspectRawAvatarSource(raw, "requested"))
	if string(first) != string(again) {
		t.Fatal("deterministic ordering")
	}
}
