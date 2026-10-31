package exactreply

// Receipt capture observes the browser's own request. It never issues/replays a
// platform request. Unknown schemas supply evidence, not acceptance or delivery.
import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

const ReceiptCaptureProtocol = "workbench.reply-receipt-capture.v1"
const CaptureOnce = "CAPTURE_ONCE"

type ReceiptField struct {
	Path    string `json:"path"`
	Type    string `json:"type"`
	Binding string `json:"binding,omitempty"`
	ID      string `json:"publicId,omitempty"`
	Boolean *bool  `json:"boolean,omitempty"`
	Number  *int64 `json:"number,omitempty"`
}
type ReceiptEvidence struct {
	EndpointPath string         `json:"endpointPath,omitempty"`
	EndpointHost string         `json:"endpointHost,omitempty"`
	State        string         `json:"state"`
	EndpointHash string         `json:"endpointSha256,omitempty"`
	RequestHash  string         `json:"requestSha256,omitempty"`
	ResponseHash string         `json:"responseSha256,omitempty"`
	Status       int            `json:"status,omitempty"`
	Fields       []ReceiptField `json:"fields,omitempty"`
	Readback     string         `json:"readback,omitempty"`
}

var safeField = regexp.MustCompile(`^(data|result|success|code|id|comment_id|commentId|note_id|noteId|target_comment_id|targetCommentId|parent_comment_id|parentCommentId|user_id|userId|content|comment|comments|user_info|userInfo|target_comment|targetComment|status|message|msg|reply_id|replyId)$`)
var sensitiveField = regexp.MustCompile(`(?i)(token|cookie|session|auth|password|secret|signature|credential|phone|email)`)

func decodeReceipt(b []byte) (any, error) {
	if len(b) == 0 || len(b) > 65536 {
		return nil, errors.New("RECEIPT_BODY_UNAVAILABLE")
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var v any
	if d.Decode(&v) != nil {
		return nil, errors.New("RECEIPT_BODY_UNAVAILABLE")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return nil, errors.New("RECEIPT_BODY_UNAVAILABLE")
	}
	nodes := 0
	var check func(any, int) bool
	check = func(v any, depth int) bool {
		nodes++
		if depth > 12 || nodes > 512 {
			return false
		}
		switch x := v.(type) {
		case map[string]any:
			for _, v := range x {
				if !check(v, depth+1) {
					return false
				}
			}
		case []any:
			for _, v := range x {
				if !check(v, depth+1) {
					return false
				}
			}
		}
		return true
	}
	if !check(v, 0) {
		return nil, errors.New("RECEIPT_BODY_UNAVAILABLE")
	}
	return v, nil
}

// Endpoint is retained only as a digest. Raw URL/query/header/body never goes to
// the journal. Review can compare a known source endpoint against this digest.
func ReceiptEndpoint(raw string) string {
	u, e := url.Parse(raw)
	if e != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" || !(u.Hostname() == "xiaohongshu.com" || strings.HasSuffix(u.Hostname(), ".xiaohongshu.com")) {
		return ""
	}
	return u.Scheme + "://" + u.Hostname() + u.EscapedPath()
}

// Correlation requires all three exact values, not substring or equal DOM text.
// Schema-specific binding is additionally required for a reviewed confirmation.
func ReceiptRequestMatches(c Command, rawURL, method string, body []byte) bool {
	if method != "POST" || ReceiptEndpoint(rawURL) == "" || len(body) > 32768 {
		return false
	}
	v, e := decodeReceipt(body)
	if e != nil {
		return false
	}
	seen := map[string]bool{}
	var walk func(any)
	walk = func(v any) {
		switch x := v.(type) {
		case string:
			if x == c.PostID || x == c.TargetID || x == c.Content {
				seen[x] = true
			}
		case map[string]any:
			for k, v := range x {
				if !sensitiveField.MatchString(k) {
					walk(v)
				}
			}
		case []any:
			for _, v := range x {
				walk(v)
			}
		}
	}
	walk(v)
	return seen[c.PostID] && seen[c.TargetID] && seen[c.Content]
}
func ReceiptProjection(c Command, body []byte) ([]ReceiptField, error) {
	v, e := decodeReceipt(body)
	if e != nil {
		return nil, e
	}
	fields := []ReceiptField{}
	overflow := false
	var walk func(any, string, string)
	walk = func(v any, path, key string) {
		if len(fields) >= 128 {
			overflow = true
			return
		}
		f := ReceiptField{Path: path, Type: "null"}
		switch x := v.(type) {
		case map[string]any:
			keys := []string{}
			for k := range x {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, k := range keys {
				if sensitiveField.MatchString(k) {
					continue
				}
				segment := k
				if !safeField.MatchString(k) {
					segment = "opaque_" + Hash(k)[:12]
				}
				walk(x[k], path+"/"+segment, k)
			}
			return
		case []any:
			for i, v := range x {
				walk(v, path+"/"+strconv.Itoa(i), key)
			}
			return
		case string:
			f.Type = "string"
			switch x {
			case c.PostID:
				f.Binding = "POST"
			case c.TargetID:
				f.Binding = "TARGET"
			case c.RecipientID:
				f.Binding = "RECIPIENT"
			case c.SenderID:
				f.Binding = "SENDER"
			case c.Content:
				f.Binding = "CONTENT"
			default:
				if id.MatchString(x) && (key == "id" || key == "comment_id" || key == "commentId" || key == "reply_id" || key == "replyId") {
					f.ID = x
				}
			}
		case bool:
			f.Type = "boolean"
			if key == "success" {
				f.Boolean = &x
			}
		case json.Number:
			f.Type = "number"
			n, e := x.Int64()
			if e == nil && (key == "code" || key == "status") && n >= -1000000 && n <= 1000000 {
				f.Number = &n
			}
		}
		fields = append(fields, f)
	}
	walk(v, "", "")
	projected, _ := json.Marshal(fields)
	if len(projected) > 24576 {
		overflow = true
	}
	if overflow {
		return nil, errors.New("RECEIPT_BODY_UNAVAILABLE")
	}
	return fields, nil
}

// Descriptors are compiled source reviewed against actual evidence, never supplied
// by a command, environment variable, remote response or model-generated mapping.
// No production descriptor is installed until that evidence exists.
type ReceiptMapping struct {
	Endpoint                                                                                             string
	PostPath, TargetPath, ContentPath                                                                    string
	SuccessPath                                                                                          string
	SuccessValue                                                                                         any
	ReplyIDPath                                                                                          string
	CodePath                                                                                             string
	ResponsePostPath, ResponseTargetPath, ResponseRecipientPath, ResponseSenderPath, ResponseContentPath string
}

func pointer(v any, p string) any {
	if p == "" || !strings.HasPrefix(p, "/") {
		return nil
	}
	for _, s := range strings.Split(p[1:], "/") {
		m, ok := v.(map[string]any)
		if !ok {
			return nil
		}
		v = m[strings.ReplaceAll(strings.ReplaceAll(s, "~1", "/"), "~0", "~")]
	}
	return v
}
func ParseMappedReceipt(c Command, m *ReceiptMapping, endpoint string, status int, request, response []byte) (*Observation, bool) {
	if m == nil || ReceiptEndpoint(endpoint) != m.Endpoint || status < 200 || status >= 300 {
		return nil, false
	}
	req, e := decodeReceipt(request)
	if e != nil {
		return nil, false
	}
	res, e := decodeReceipt(response)
	if e != nil {
		return nil, false
	}
	if pointer(req, m.PostPath) != c.PostID || pointer(req, m.TargetPath) != c.TargetID || pointer(req, m.ContentPath) != c.Content {
		return nil, false
	}
	actual, _ := json.Marshal(pointer(res, m.SuccessPath))
	expected, _ := json.Marshal(m.SuccessValue)
	if m.SuccessValue == nil || !bytes.Equal(actual, expected) {
		return nil, false
	}
	if m.CodePath != "" {
		code, ok := pointer(res, m.CodePath).(json.Number)
		if !ok || code.String() != "0" {
			return nil, false
		}
	}
	for _, pair := range [][2]string{{m.ResponsePostPath, c.PostID}, {m.ResponseTargetPath, c.TargetID}, {m.ResponseRecipientPath, c.RecipientID}, {m.ResponseSenderPath, c.SenderID}, {m.ResponseContentPath, c.Content}} {
		if pair[0] != "" && pointer(res, pair[0]) != pair[1] {
			return nil, false
		}
	}
	reply, ok := pointer(res, m.ReplyIDPath).(string)
	if !ok || !id.MatchString(reply) || reply == c.TargetID || reply == c.PostID || reply == c.SenderID || reply == c.RecipientID {
		return nil, true
	}
	return &Observation{reply, c.PostID, c.TargetID, c.RecipientID, c.SenderID, c.ContentHash}, true
}

// Only ordinary API route segments and known service hosts may be disclosed.
// Everything else is digest-only; no query, fragment, credentials or arbitrary ID.
func ReceiptSafeRoute(raw string) (string, string) {
	u, e := url.Parse(raw)
	if e != nil || ReceiptEndpoint(raw) == "" {
		return "", ""
	}
	if u.Hostname() != "edith.xiaohongshu.com" && u.Hostname() != "www.xiaohongshu.com" {
		return "", ""
	}
	if !regexp.MustCompile(`^/api(/(sns|web|comment|reply|post|publish|add|create|send|v[0-9]{1,2})){1,8}$`).MatchString(u.EscapedPath()) {
		return "", ""
	}
	return u.Hostname(), u.EscapedPath()
}
