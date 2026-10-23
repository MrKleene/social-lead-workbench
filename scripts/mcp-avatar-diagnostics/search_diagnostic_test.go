package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestSearchFailureSafeReasons(t *testing.T) {
	secret := "FAKE_PRIVATE_SENTINEL https://invalid.test/?xsec_token=FAKE_SECRET"
	for _, reason := range []string{"PAGE_REPORTED_ERROR", "PAGE_NAVIGATION_FAILED", "PAGE_NOT_READY", "PAGE_EVALUATION_FAILED", "SEARCH_DATA_MISSING", "DESERIALIZATION_FAILED", "ATTACK"} {
		raw := SearchFailureJSON(fmt.Errorf("wrapped: %w", searchFailure(reason, errors.New(secret))))
		if strings.Contains(raw, "FAKE") || strings.Contains(raw, "https") {
			t.Fatal("unsafe output")
		}
		var x struct {
			Failure struct {
				Version int    `json:"version"`
				Reason  string `json:"reason"`
			} `json:"crmSearchFailure"`
		}
		if err := json.Unmarshal([]byte(raw), &x); err != nil {
			t.Fatal(err)
		}
		want := reason
		if reason == "ATTACK" {
			want = "UNKNOWN"
		}
		if x.Failure.Reason != want || x.Failure.Version != 1 {
			t.Fatal(raw)
		}
	}
	for msg, want := range map[string]string{"未登录 FAKE": "LOGIN_EXPIRED", "频繁 FAKE": "RATE_LIMITED", "验证码 FAKE": "RESTRICTED", "不存在 FAKE": "SOURCE_UNAVAILABLE", "timeout FAKE": "TIMEOUT", "unrecognized FAKE": "UNKNOWN"} {
		raw := SearchFailureJSON(searchFailure("PAGE_NOT_READY", errors.New(msg)))
		if msg == "unrecognized FAKE" {
			raw = SearchFailureJSON(errors.New(msg))
		}
		if !strings.Contains(raw, want) || strings.Contains(raw, "FAKE") {
			t.Fatal(raw)
		}
	}
	if !strings.Contains(SearchFailureJSON(context.DeadlineExceeded), "TIMEOUT") {
		t.Fatal("deadline misclassified")
	}
	if !strings.Contains(SearchFailureJSON(nil), "UNKNOWN") {
		t.Fatal("nil inferred")
	}
}
