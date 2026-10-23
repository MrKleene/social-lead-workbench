package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
)

type searchStageFailure struct {
	reason string
	cause  error
}

func (e *searchStageFailure) Error() string          { return e.reason }
func (e *searchStageFailure) Unwrap() error          { return e.cause }
func searchFailure(reason string, cause error) error { return &searchStageFailure{reason, cause} }

type searchObservedError struct {
	cause       error
	observation *SearchObservation
}

func (e *searchObservedError) Error() string { return "SEARCH_OBSERVATION_FAILED" }
func (e *searchObservedError) Unwrap() error { return e.cause }
func searchObservedFailure(err error, observation *SearchObservation) error {
	return &searchObservedError{err, observation}
}

// SearchFailureJSON is a closed protocol; error values never cross the boundary.
func SearchFailureJSON(err error) string {
	reason := "UNKNOWN"
	if err != nil {
		raw := strings.ToLower(err.Error())
		// Preserve existing stop classifications without returning their messages.
		for e := err; e != nil; e = errors.Unwrap(e) {
			raw += "\n" + strings.ToLower(e.Error())
		}
		switch {
		case strings.Contains(raw, "未登录") || strings.Contains(raw, "登录失效") || strings.Contains(raw, "login"):
			reason = "LOGIN_EXPIRED"
		case strings.Contains(raw, "频繁") || strings.Contains(raw, "限流") || strings.Contains(raw, "rate limit") || strings.Contains(raw, "rate_limit"):
			reason = "RATE_LIMITED"
		case strings.Contains(raw, "限制") || strings.Contains(raw, "封禁") || strings.Contains(raw, "验证码") || strings.Contains(raw, "restricted"):
			reason = "RESTRICTED"
		case strings.Contains(raw, "不存在") || strings.Contains(raw, "不可见") || strings.Contains(raw, "未找到") || strings.Contains(raw, "not found"):
			reason = "SOURCE_UNAVAILABLE"
		case errors.Is(err, context.DeadlineExceeded) || strings.Contains(raw, "超时") || strings.Contains(raw, "timeout"):
			reason = "TIMEOUT"
		default:
			var stage *searchStageFailure
			if errors.As(err, &stage) {
				switch stage.reason {
				case "PAGE_REPORTED_ERROR", "PAGE_NAVIGATION_FAILED", "PAGE_NOT_READY", "PAGE_EVALUATION_FAILED", "SEARCH_DATA_MISSING", "DESERIALIZATION_FAILED":
					reason = stage.reason
				}
			}
		}
	}
	var observed *searchObservedError
	var observation *SearchObservation
	if errors.As(err, &observed) {
		observation = observed.observation
	}
	body, _ := json.Marshal(struct {
		Failure struct {
			Version int    `json:"version"`
			Reason  string `json:"reason"`
		} `json:"crmSearchFailure"`
		Observation *SearchObservation `json:"searchObservation,omitempty"`
	}{Failure: struct {
		Version int    `json:"version"`
		Reason  string `json:"reason"`
	}{1, reason}, Observation: observation})
	return string(body)
}
