package xiaohongshu

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Deliberately narrow documented imageView2 subset, not a claim about observed queries.
// https://developer.qiniu.com/dora/1279/basic-processing-images-imageview2
var thumbnailChars = regexp.MustCompile(`^[A-Za-z0-9/]+$`)
var thumbnailNumber = regexp.MustCompile(`^[1-9][0-9]{0,3}$`)

func avatarQueryPolicy(query string, present bool) string {
	if !present {
		return "NONE"
	}
	if len(query) > 128 || !thumbnailChars.MatchString(query) {
		return "UNSUPPORTED"
	}
	parts := strings.Split(query, "/")
	if len(parts) < 4 || len(parts)%2 != 0 || parts[0] != "imageView2" || (parts[1] != "1" && parts[1] != "2") {
		return "UNSUPPORTED"
	}
	seen := map[string]bool{}
	for i := 2; i < len(parts); i += 2 {
		key, value := parts[i], parts[i+1]
		if seen[key] {
			return "UNSUPPORTED"
		}
		seen[key] = true
		switch key {
		case "w", "h", "q":
			n, err := strconv.Atoi(value)
			limit := 1024
			if key == "q" {
				limit = 100
			}
			if err != nil || !thumbnailNumber.MatchString(value) || n > limit {
				return "UNSUPPORTED"
			}
		case "format":
			if value != "jpg" && value != "jpeg" && value != "png" && value != "webp" {
				return "UNSUPPORTED"
			}
		default:
			return "UNSUPPORTED"
		}
	}
	if seen["w"] || seen["h"] {
		return "IMAGE_VIEW2_THUMBNAIL"
	}
	return "UNSUPPORTED"
}
func safeCommentImage(value string) bool {
	if len(value) > 2048 || !strings.HasPrefix(value, "https://sns-avatar-qc.xhscdn.com/avatar/") || strings.ContainsAny(value, "\\%#\r\n\t ") {
		return false
	}
	u, err := url.Parse(value)
	if err != nil || u.Host != "sns-avatar-qc.xhscdn.com" || u.User != nil || !avatarPathChars.MatchString(u.Path) {
		return false
	}
	for _, part := range strings.Split(u.Path, "/") {
		if part == "." || part == ".." {
			return false
		}
	}
	return avatarQueryPolicy(u.RawQuery, u.ForceQuery || u.RawQuery != "") != "UNSUPPORTED"
}
