package xiaohongshu

import (
	"encoding/json"
	"strings"
)

// CommentUser is intentionally separate from the post/profile User model.
// Only userInfo.image is evidenced by the reviewed comment payload diagnostics.
// No network, URL rewriting, profile lookup, or guessed aliases.
type CommentUser struct {
	UserID       string `json:"userId"`
	Nickname     string `json:"nickname"`
	NickName     string `json:"nickName"`
	Avatar       string `json:"avatar"`
	AvatarSource string `json:"avatarSource,omitempty"`
}

func (u *CommentUser) UnmarshalJSON(data []byte) error {
	var fields struct {
		UserID   string          `json:"userId"`
		Nickname string          `json:"nickname"`
		NickName string          `json:"nickName"`
		Avatar   json.RawMessage `json:"avatar"`
	}
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	next := CommentUser{UserID: fields.UserID, Nickname: fields.Nickname, NickName: fields.NickName}
	var avatar string
	// Preserve a supplied nonblank string exactly. Existing workbench validation
	// remains authoritative for legacy avatar values, including unsupported URLs.
	if json.Unmarshal(fields.Avatar, &avatar) == nil && strings.TrimSpace(avatar) != "" {
		next.Avatar = avatar
		next.AvatarSource = "avatar"
		*u = next
		return nil
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	image := raw["image"] // exact confirmed key, not case-folded speculative aliases
	facts := avatarCandidate("image", "ROOT", image)
	if facts.Shape == "NONEMPTY_STRING" && facts.Protocol == "HTTPS" && facts.Host == "ALLOWED" && facts.Components == "CLEAN" && facts.Path == "AVATAR_PATH" {
		var value string
		if json.Unmarshal(image, &value) == nil && strings.HasPrefix(value, "https://sns-avatar-qc.xhscdn.com/avatar/") {
			// Reject path traversal rather than normalize it into a different resource.
			safe := true
			for _, part := range strings.Split(strings.TrimPrefix(value, "https://sns-avatar-qc.xhscdn.com"), "/") {
				if part == "." || part == ".." {
					safe = false
				}
			}
			if safe {
				next.Avatar = value
				next.AvatarSource = "image"
			}
		}
	}
	*u = next
	return nil
}
