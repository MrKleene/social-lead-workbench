package xiaohongshu

import (
	"bytes"
	"encoding/json"
	"sort"
	"strings"
)

// 仅记录固定类别计数。不得在此结构中加入原文、字段名、URL、ID 或错误文本。
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
	Version    int                     `json:"version"`
	Status     string                  `json:"status"`
	Truncated  bool                    `json:"truncated"`
	Roots      int                     `json:"roots"`
	Replies    int                     `json:"replies"`
	Fields     []AvatarShapeCount      `json:"fields"`
	Conversion []AvatarConversionCount `json:"conversion"`
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
	d := &AvatarSourceDiagnostic{Version: 1, Status: "OK", Fields: []AvatarShapeCount{}, Conversion: []AvatarConversionCount{}}
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
				conversion["COMMENT_SHAPE_INVALID"]++
				continue
			}
			add("USER_INFO", avatarShape(c.User))
			var user map[string]json.RawMessage
			if len(c.User) == 0 || json.Unmarshal(c.User, &user) != nil || user == nil {
				conversion["USER_UNAVAILABLE"]++
			} else {
				add("FIXED_AVATAR", avatarShape(user["avatar"]))
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
				var typed User
				if json.Unmarshal(c.User, &typed) != nil {
					conversion["USER_DECODE_FAILED"]++
				} else {
					// 使用实际 User 类型和实际 JSON 序列化器，检查固定 avatar 是否在往返中丢失。
					wire, err := json.Marshal(typed)
					var out map[string]json.RawMessage
					if err != nil || json.Unmarshal(wire, &out) != nil {
						conversion["WIRE_FAILED"]++
					} else {
						var saved string
						_ = json.Unmarshal(out["avatar"], &saved)
						if saved != typed.Avatar {
							conversion["WIRE_CHANGED"]++
						} else if typed.Avatar == "" {
							conversion["EMPTY_AFTER_DECODE"]++
						} else {
							conversion["NONEMPTY_PRESERVED"]++
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
	return d
}
