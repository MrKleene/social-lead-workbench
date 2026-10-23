package xiaohongshu

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestSyntheticThumbnailBoundary(t *testing.T) {
	raw, err := os.ReadFile("avatar-query-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var suite struct {
		Synthetic bool `json:"synthetic"`
		Cases     []struct {
			URL      string `json:"url"`
			Accepted bool   `json:"accepted"`
		} `json:"cases"`
	}
	if json.Unmarshal(raw, &suite) != nil || !suite.Synthetic {
		t.Fatal("invalid synthetic suite")
	}
	for i, c := range suite.Cases {
		if safeCommentImage(c.URL) != c.Accepted {
			t.Fatalf("boundary case %d", i)
		}
		got := decodeSyntheticUser(t, map[string]any{"image": c.URL})
		if (got.Avatar != "") != c.Accepted {
			t.Fatalf("mapping case %d", i)
		}
		if c.Accepted && got.Avatar != c.URL {
			t.Fatal("URL rewritten")
		}
	}
}
func TestThumbnailDiagnosticNoValues(t *testing.T) {
	for _, query := range []string{"imageView2/2/w/80", "unknown/PRIVATE_VALUE"} {
		expected := "UNSUPPORTED"
		if strings.HasPrefix(query, "imageView2/") {
			expected = "IMAGE_VIEW2_THUMBNAIL"
		}
		raw, _ := json.Marshal(map[string]any{"requested": map[string]any{"comments": map[string]any{"list": []any{map[string]any{"userInfo": map[string]any{"image": syntheticImage + "?" + query}, "subComments": []any{map[string]any{"userInfo": map[string]any{"image": syntheticImage + "?" + query}}}}}}}})
		d := inspectRawAvatarSource(raw, "requested")
		if d.Roots != 1 || d.Replies != 1 {
			t.Fatal("root/reply counts")
		}
		found := 0
		for _, c := range d.Candidates {
			if c.Name == "image" {
				found++
				if c.QueryPolicy != expected || c.QueryForm != "BARE" || !c.Restrictions.Query {
					t.Fatal("classification")
				}
			}
		}
		if found != 2 {
			t.Fatal("missing role")
		}
		out, _ := json.Marshal(d)
		for _, secret := range []string{query, syntheticImage, "PRIVATE_VALUE"} {
			if strings.Contains(string(out), secret) {
				t.Fatal("unsafe diagnostic")
			}
		}
	}
}
