package xiaohongshu

import (
	"bytes"
	"encoding/json"
	"net/url"
	"regexp"
	"sort"
	"strings"
)

// Only fixed enums/counts and explicitly allowlisted structural keys; never values, URLs or identity.
type AvatarShapeCount struct {
	Group string `json:"group"`
	Shape string `json:"shape"`
	Count int    `json:"count"`
}
type AvatarConversionCount struct {
	State string `json:"state"`
	Count int    `json:"count"`
}
type AvatarSourceDiagnostic struct {
	Candidates  []AvatarCandidateCount  `json:"candidates"`
	Filtered    []AvatarFilteredCount   `json:"filtered"`
	Transitions []AvatarTransitionCount `json:"transitions"`
	Version     int                     `json:"version"`
	Status      string                  `json:"status"`
	Truncated   bool                    `json:"truncated"`
	Roots       int                     `json:"roots"`
	Replies     int                     `json:"replies"`
	Fields      []AvatarShapeCount      `json:"fields"`
	Conversion  []AvatarConversionCount `json:"conversion"`
}

const avatarDiagnosticBytes = 2 * 1024 * 1024
const avatarDiagnosticUsers = 1000
const avatarDiagnosticDepth = 16
const avatarDiagnosticFields = 64

func avatarShape(raw json.RawMessage) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return "MISSING"
	}
	switch raw[0] {
	case 'n':
		return "NULL"
	case '"':
		var s string
		if json.Unmarshal(raw, &s) != nil {
			return "INVALID"
		}
		if s == "" {
			return "EMPTY_STRING"
		}
		if strings.TrimSpace(s) == "" {
			return "WHITESPACE_STRING"
		}
		return "NONEMPTY_STRING"
	case '{':
		return "OBJECT"
	case '[':
		return "ARRAY"
	case 't', 'f':
		return "BOOLEAN"
	default:
		return "NUMBER"
	}
}

// 在固定 User 反序列化前检查原始 JSON；不修改采集内容或将候选字段解释成头像。
func inspectRawAvatarSource(payload []byte, feedID string) *AvatarSourceDiagnostic {
	d := &AvatarSourceDiagnostic{Version: 2, Candidates: []AvatarCandidateCount{}, Filtered: []AvatarFilteredCount{}, Transitions: []AvatarTransitionCount{}, Status: "OK", Fields: []AvatarShapeCount{}, Conversion: []AvatarConversionCount{}}
	if len(payload) > avatarDiagnosticBytes {
		d.Status = "BYTE_LIMIT"
		d.Truncated = true
		return d
	}
	var feeds map[string]json.RawMessage
	if json.Unmarshal(payload, &feeds) != nil {
		d.Status = "INVALID_JSON"
		return d
	}
	entry, ok := feeds[feedID]
	if !ok {
		d.Status = "FEED_MISSING"
		return d
	}
	var feed struct {
		Comments struct {
			List []json.RawMessage `json:"list"`
		} `json:"comments"`
	}
	if json.Unmarshal(entry, &feed) != nil {
		d.Status = "INVALID_SHAPE"
		return d
	}
	counts := map[[2]string]int{}
	conversion := map[string]int{}
	candidates := map[AvatarCandidateCount]int{}
	filtered := map[AvatarFilteredCount]int{}
	transitions := map[AvatarTransitionCount]int{}
	add := func(group, shape string) { counts[[2]string{group, shape}]++ }
	var visit func([]json.RawMessage, int)
	visit = func(comments []json.RawMessage, depth int) {
		if depth > avatarDiagnosticDepth {
			if len(comments) > 0 {
				d.Truncated = true
			}
			return
		}
		for _, raw := range comments {
			role := "ROOT"
			if depth > 0 {
				role = "REPLY"
			}
			converted := func(state string) {
				conversion[state]++
				transitions[AvatarTransitionCount{Role: role, State: state}]++
			}
			if d.Roots+d.Replies >= avatarDiagnosticUsers {
				d.Truncated = true
				return
			}
			if depth == 0 {
				d.Roots++
			} else {
				d.Replies++
			}
			var c struct {
				User     json.RawMessage   `json:"userInfo"`
				Children []json.RawMessage `json:"subComments"`
			}
			if json.Unmarshal(raw, &c) != nil {
				converted("COMMENT_SHAPE_INVALID")
				continue
			}
			add("USER_INFO", avatarShape(c.User))
			var user map[string]json.RawMessage
			if len(c.User) == 0 || json.Unmarshal(c.User, &user) != nil || user == nil {
				converted("USER_UNAVAILABLE")
			} else {
				add("FIXED_AVATAR", avatarShape(user["avatar"]))
				candidates[avatarCandidate("avatar", role, user["avatar"])]++
				keys := make([]string, 0, len(user))
				for key := range user {
					keys = append(keys, key)
				}
				sort.Strings(keys)
				if len(keys) > avatarDiagnosticFields {
					d.Truncated = true
					keys = keys[:avatarDiagnosticFields]
				}
				for _, key := range keys {
					if key != "avatar" {
						if reason := avatarCandidateKey(key); reason == "ALLOWED" {
							candidates[avatarCandidate(key, role, user[key])]++
						} else if reason != "UNRELATED" {
							filtered[AvatarFilteredCount{Role: role, Reason: reason}]++
						}
					}
					if key == "avatar" || key == "userId" || key == "nickname" || key == "nickName" {
						continue
					}
					// 名称仅在内存分类，绝不输出；IMAGE_NAMED 不是已确认头像别名。
					group := "OTHER_MEMBER"
					lower := strings.ToLower(key)
					if strings.EqualFold(key, "avatar") {
						group = "AVATAR_CASE_VARIANT"
					} else if strings.Contains(lower, "image") || strings.Contains(lower, "avatar") {
						group = "IMAGE_NAMED_MEMBER"
					}
					add(group, avatarShape(user[key]))
				}
				var typed CommentUser
				if json.Unmarshal(c.User, &typed) != nil {
					converted("USER_DECODE_FAILED")
				} else {
					// 使用实际 CommentUser 类型和实际 JSON 序列化器，检查固定 avatar 是否在往返中丢失。
					wire, err := json.Marshal(typed)
					var out map[string]json.RawMessage
					if err != nil || json.Unmarshal(wire, &out) != nil {
						converted("WIRE_FAILED")
					} else {
						var saved string
						_ = json.Unmarshal(out["avatar"], &saved)
						if saved != typed.Avatar {
							converted("WIRE_CHANGED")
						} else if typed.Avatar == "" {
							converted("EMPTY_AFTER_DECODE")
						} else {
							converted("NONEMPTY_PRESERVED")
						}
					}
				}
			}
			visit(c.Children, depth+1)
		}
	}
	visit(feed.Comments.List, 0)
	for key, count := range counts {
		d.Fields = append(d.Fields, AvatarShapeCount{key[0], key[1], count})
	}
	sort.Slice(d.Fields, func(i, j int) bool {
		a, b := d.Fields[i], d.Fields[j]
		if a.Group != b.Group {
			return a.Group < b.Group
		}
		return a.Shape < b.Shape
	})
	for state, count := range conversion {
		d.Conversion = append(d.Conversion, AvatarConversionCount{state, count})
	}
	sort.Slice(d.Conversion, func(i, j int) bool { return d.Conversion[i].State < d.Conversion[j].State })
	for key, count := range candidates {
		key.Count = count
		d.Candidates = append(d.Candidates, key)
	}
	sort.Slice(d.Candidates, func(i, j int) bool {
		a, _ := json.Marshal(d.Candidates[i])
		b, _ := json.Marshal(d.Candidates[j])
		return string(a) < string(b)
	})
	if len(d.Candidates) > 256 {
		d.Truncated = true
		d.Candidates = d.Candidates[:256]
	}
	for key, count := range filtered {
		key.Count = count
		d.Filtered = append(d.Filtered, key)
	}
	sort.Slice(d.Filtered, func(i, j int) bool {
		a, b := d.Filtered[i], d.Filtered[j]
		if a.Role != b.Role {
			return a.Role < b.Role
		}
		return a.Reason < b.Reason
	})
	for key, count := range transitions {
		key.Count = count
		d.Transitions = append(d.Transitions, key)
	}
	sort.Slice(d.Transitions, func(i, j int) bool {
		a, b := d.Transitions[i], d.Transitions[j]
		if a.Role != b.Role {
			return a.Role < b.Role
		}
		return a.State < b.State
	})
	return d
}

// Synthetic vocabulary for inspection only: inclusion is NOT evidence of an avatar alias.
type AvatarURLRestrictions struct {
	Query            bool `json:"query"`
	Fragment         bool `json:"fragment"`
	Userinfo         bool `json:"userinfo"`
	Port             bool `json:"port"`
	EncodedPath      bool `json:"encodedPath"`
	EncodedElsewhere bool `json:"encodedElsewhere"`
}

type AvatarCandidateCount struct {
	Restrictions AvatarURLRestrictions `json:"restrictions"`
	QueryForm    string                `json:"queryForm"`
	Name         string                `json:"name"`
	Role         string                `json:"role"`
	Shape        string                `json:"shape"`
	Protocol     string                `json:"protocol"`
	Host         string                `json:"host"`
	Components   string                `json:"components"`
	Path         string                `json:"path"`
	Count        int                   `json:"count"`
}
type AvatarFilteredCount struct {
	Role   string `json:"role"`
	Reason string `json:"reason"`
	Count  int    `json:"count"`
}
type AvatarTransitionCount struct {
	Role  string `json:"role"`
	State string `json:"state"`
	Count int    `json:"count"`
}

var avatarCandidateNames = map[string]bool{"avatar": true, "Avatar": true, "avatarUrl": true, "avatarURL": true, "avatar_url": true, "userAvatar": true, "user_avatar": true, "userAvatarUrl": true, "user_avatar_url": true, "image": true, "Image": true, "imageUrl": true, "imageURL": true, "image_url": true, "images": true, "imageb": true, "imageB": true, "imageSmall": true, "imageBig": true, "headImage": true, "headImageUrl": true, "head_image": true, "head_image_url": true, "headImg": true, "headImgUrl": true, "head_img": true, "head_img_url": true, "profileImage": true, "profileImageUrl": true, "profile_image": true, "profile_image_url": true, "avatarSmall": true, "avatarLarge": true}
var avatarKeyChars = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,31}$`)
var avatarSensitiveKey = regexp.MustCompile(`(?i)token|cookie|session|secret|password|passwd|credential|auth|email|phone|contact|address|private`)
var avatarPathChars = regexp.MustCompile(`^/avatar/[A-Za-z0-9_/.!@,=+-]+$`)

func avatarCandidateKey(key string) string {
	lower := strings.ToLower(key)
	if !strings.Contains(lower, "image") && !strings.Contains(lower, "avatar") && !strings.Contains(lower, "headimg") {
		return "UNRELATED"
	}
	if !avatarKeyChars.MatchString(key) {
		return "INVALID_KEY"
	}
	if avatarSensitiveKey.MatchString(key) {
		return "SENSITIVE_KEY"
	}
	if !avatarCandidateNames[key] {
		return "UNLISTED_IMAGE_KEY"
	}
	return "ALLOWED"
}
func avatarCandidate(name, role string, raw json.RawMessage) AvatarCandidateCount {
	c := AvatarCandidateCount{Name: name, Role: role, Shape: avatarShape(raw), Protocol: "NONE", Host: "UNAVAILABLE", Components: "NA", Path: "UNAVAILABLE", QueryForm: "NONE"}
	if c.Shape != "NONEMPTY_STRING" {
		return c
	}
	var value string
	_ = json.Unmarshal(raw, &value)
	c.Protocol = "INVALID"
	if len(value) > 2048 || strings.ContainsAny(value, "\\\r\n\t ") {
		return c
	}
	u, err := url.Parse(value)
	if err != nil {
		return c
	}
	switch strings.ToLower(u.Scheme) {
	case "http":
		c.Protocol = "HTTP"
	case "https":
		c.Protocol = "HTTPS"
	case "":
		c.Protocol = "RELATIVE"
	default:
		c.Protocol = "OTHER"
	}
	host := strings.ToLower(u.Hostname())
	if host != "" {
		c.Host = "OTHER"
		if host == "sns-avatar-qc.xhscdn.com" {
			c.Host = "ALLOWED"
		}
	}
	c.Components = "CLEAN"
	c.Restrictions, c.QueryForm = avatarURLRestrictions(value, u)
	if c.Restrictions.Query || c.Restrictions.Fragment || c.Restrictions.Userinfo || c.Restrictions.Port || c.Restrictions.EncodedPath || c.Restrictions.EncodedElsewhere {
		c.Components = "RESTRICTED"
	}
	if u.Path != "" {
		c.Path = "OTHER"
		if avatarPathChars.MatchString(u.EscapedPath()) {
			c.Path = "AVATAR_PATH"
		}
	}
	return c
}

// Return fixed structural facts only. Never emit a query key/value, URL or identity.
func avatarURLRestrictions(value string, u *url.URL) (AvatarURLRestrictions, string) {
	rawPath := strings.SplitN(strings.SplitN(value, "#", 2)[0], "?", 2)[0]
	if u.Opaque != "" {
		rawPath = ""
	} else if u.Host != "" {
		start := strings.Index(rawPath, "//")
		if start >= 0 {
			authority := rawPath[start+2:]
			if slash := strings.Index(authority, "/"); slash >= 0 {
				rawPath = authority[slash:]
			} else {
				rawPath = ""
			}
		} else {
			rawPath = ""
		}
	} else if u.Scheme != "" {
		rawPath = strings.TrimPrefix(rawPath, u.Scheme+":")
	}
	facts := AvatarURLRestrictions{Query: u.RawQuery != "" || u.ForceQuery, Fragment: strings.Contains(value, "#"), Userinfo: u.User != nil, Port: u.Port() != "", EncodedPath: strings.Contains(rawPath, "%"), EncodedElsewhere: strings.Count(value, "%") > strings.Count(rawPath, "%")}
	form := "NONE"
	if facts.Query {
		form = "EMPTY"
		if u.RawQuery != "" {
			pairs, bare := false, false
			for _, segment := range strings.Split(u.RawQuery, "&") {
				if strings.Contains(segment, "=") {
					pairs = true
				} else {
					bare = true
				}
			}
			if pairs && bare {
				form = "MIXED"
			} else if pairs {
				form = "KEY_VALUE"
			} else {
				form = "BARE"
			}
		}
	}
	return facts, form
}
