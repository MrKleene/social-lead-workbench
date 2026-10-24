package xiaohongshu

import "encoding/json"

// Discovery only: these spellings are hypotheses, NOT aliases mapped to a reply
// target. Only named paths, types and equality to already loaded IDs are emitted.
// No source values, arbitrary keys, usernames or URLs leave this inspection.
var relationFields = []string{"targetComment", "target_comment", "targetCommentId", "target_comment_id", "targetUser", "target_user", "targetUserId", "target_user_id", "replyTo", "reply_to", "replyToComment", "reply_to_comment", "replyToCommentId", "reply_to_comment_id", "replyToUser", "reply_to_user", "replyToUserId", "reply_to_user_id", "parentCommentId", "parent_comment_id", "rootCommentId", "root_comment_id"}
var relationLeaves = []string{"id", "commentId", "comment_id", "userId", "user_id"}

type RelationFieldEvidence struct {
	Ordinal         int    `json:"ordinal"`
	Path            string `json:"path"`
	Shape           string `json:"shape"`
	CommentOrdinals []int  `json:"commentOrdinals"`
	UserMatches     int    `json:"userMatches"`
}
type ReplyRelationEvidence struct {
	Version int                     `json:"version"`
	Scanned int                     `json:"scanned"`
	Limited bool                    `json:"limited"`
	Fields  []RelationFieldEvidence `json:"fields"`
}

func relationString(raw json.RawMessage) string {
	var s string
	if len(raw) > 512 || json.Unmarshal(raw, &s) != nil {
		return ""
	}
	return s
}
func inspectReplyRelations(rows []map[string]json.RawMessage) *ReplyRelationEvidence {
	d := &ReplyRelationEvidence{Version: 1, Scanned: len(rows), Fields: []RelationFieldEvidence{}}
	comments := map[string][]int{}
	users := map[string]int{}
	for i, r := range rows {
		if s := relationString(r["id"]); s != "" {
			comments[s] = append(comments[s], i+1)
		}
		u := coverageObject(r["userInfo"])
		if s := relationString(u["userId"]); s != "" {
			users[s]++
		}
	}
	add := func(ordinal int, path string, raw json.RawMessage) {
		if len(raw) == 0 {
			return
		}
		if len(d.Fields) >= 256 {
			d.Limited = true
			return
		}
		e := RelationFieldEvidence{Ordinal: ordinal, Path: path, Shape: "INVALID", CommentOrdinals: []int{}}
		var v any
		if json.Unmarshal(raw, &v) == nil {
			switch x := v.(type) {
			case nil:
				e.Shape = "NULL"
			case string:
				e.Shape = "STRING"
				if x == "" {
					e.Shape = "EMPTY"
				}
				if len(x) <= 512 && x != "" {
					e.CommentOrdinals = append(e.CommentOrdinals, comments[x]...)
					e.UserMatches = users[x]
				}
			case map[string]any:
				e.Shape = "OBJECT"
			case []any:
				e.Shape = "ARRAY"
			case float64:
				e.Shape = "NUMBER"
			case bool:
				e.Shape = "BOOLEAN"
			}
		}
		d.Fields = append(d.Fields, e)
	}
	for i, row := range rows {
		for _, name := range relationFields {
			raw, exists := row[name]
			if !exists {
				continue
			}
			add(i+1, name, raw)
			obj := coverageObject(raw)
			for _, leaf := range relationLeaves {
				add(i+1, name+"."+leaf, obj[leaf])
			}
			for _, userKey := range []string{"userInfo", "user_info"} {
				user := coverageObject(obj[userKey])
				for _, leaf := range []string{"userId", "user_id", "id"} {
					add(i+1, name+"."+userKey+"."+leaf, user[leaf])
				}
			}
		}
	}
	return d
}
