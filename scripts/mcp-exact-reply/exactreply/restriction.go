package exactreply

import (
	"bytes"
	"context"
	"encoding/base64"
	"image/png"
	"regexp"
	"strings"
	"time"
)

const RestrictionProtocol = "workbench.xhs.restriction-inspection.v1"

type RestrictionTarget struct {
	Protocol  string    `json:"protocol"`
	AccountID string    `json:"accountId"`
	SenderID  string    `json:"senderId"`
	PostID    string    `json:"postId"`
	Reference Reference `json:"postReference"`
}

func (t RestrictionTarget) Valid() bool {
	return t.Protocol == RestrictionProtocol && opaque.MatchString(t.AccountID) && id.MatchString(t.SenderID) && id.MatchString(t.PostID) && t.Reference.PostID == t.PostID && len(t.Reference.Token) <= 4096 && token.MatchString(t.Reference.Token) && (t.Reference.Source == "pc_feed" || t.Reference.Source == "pc_search")
}

type RestrictionWarning struct {
	Code string `json:"code"`
	Text string `json:"text"`
}
type RestrictionImage struct {
	Mime   string `json:"mimeType"`
	Data   string `json:"data"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Scope  string `json:"scope"`
}
type RestrictionObservation struct {
	Identity          string               `json:"identity"`
	IdentitySource    string               `json:"identitySource"`
	Title             string               `json:"title"`
	Path              string               `json:"pathname"`
	Warnings          []RestrictionWarning `json:"warnings"`
	Screenshot        *RestrictionImage    `json:"screenshot,omitempty"`
	ScreenshotReasons []string             `json:"screenshotReasons,omitempty"`
	ScreenshotState   string               `json:"screenshotState"`
	ConsoleErrors     int                  `json:"consoleErrors"`
	NetworkFailures   int                  `json:"networkFailures"`
}
type RestrictionResult struct {
	Protocol        string                 `json:"protocol"`
	Kind            string                 `json:"kind"`
	Code            string                 `json:"code"`
	ObservedAt      string                 `json:"observedAt"`
	Observation     RestrictionObservation `json:"observation"`
	ProcessStopped  bool                   `json:"processStopped"`
	WriteOperations int                    `json:"writeOperations"`
}

// This surface cannot select, type, submit, save cookies or change an account.
type RestrictionInspector interface {
	Inspect(context.Context, RestrictionTarget) (RestrictionObservation, error)
	Close(context.Context) error
}

var urlText = regexp.MustCompile(`(?i)(?:https?://|www\.)\S+`)
var emailText = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`)
var longNumber = regexp.MustCompile(`[0-9]{7,}`)
var longOpaque = regexp.MustCompile(`[A-Za-z0-9_+/=-]{24,}`)

func RestrictionSafeText(s, secret string, limit int) string {
	if secret != "" {
		s = strings.ReplaceAll(s, secret, "[REDACTED]")
	}
	s = urlText.ReplaceAllString(s, "[URL]")
	s = emailText.ReplaceAllString(s, "[EMAIL]")
	s = longNumber.ReplaceAllString(s, "[NUMBER]")
	s = longOpaque.ReplaceAllString(s, "[OPAQUE]")
	s = strings.Join(strings.Fields(s), " ")
	r := []rune(s)
	if len(r) > limit {
		s = string(r[:limit])
	}
	return s
}
func SafeRestrictionObservation(o RestrictionObservation, t RestrictionTarget) RestrictionObservation {
	o.Identity = choose(o.Identity, "MATCH", "MISMATCH")
	o.IdentitySource = choose(o.IdentitySource, "INITIAL_STATE_USER_INFO", "SELF_PROFILE_LINK", "STATE_AND_SELF_LINK")
	o.Title = RestrictionSafeText(o.Title, t.Reference.Token, 160)
	switch o.Path {
	case "/explore/[POST]", "/explore", "/login", "/404", "/[OTHER_ROUTE]", "/[EXTERNAL_ORIGIN]":
	default:
		o.Path = "/[OTHER_ROUTE]"
	}
	out := []RestrictionWarning{}
	for _, w := range o.Warnings {
		code := choose(w.Code, "BANNED", "MUTED", "VERIFICATION", "RATE_LIMITED", "COMMENT_RESTRICTED", "REVIEW_PENDING", "VISIBILITY_RESTRICTED", "ACCESS_ERROR")
		if code != "UNKNOWN" && len(out) < 5 {
			out = append(out, RestrictionWarning{code, RestrictionSafeText(w.Text, t.Reference.Token, 500)})
		}
	}
	o.Warnings = out
	o.ScreenshotState = choose(o.ScreenshotState, "CAPTURED", "UNAVAILABLE", "NO_SAFE_REGION", "SENSITIVE_UI", "IDENTITY_MISMATCH", "EXTERNAL_ORIGIN", "OVERSIZE", "CANCELLED")
	reasons := []string{}
	for _, reason := range o.ScreenshotReasons {
		code := choose(reason, "NOTICE_SENSITIVE_TEXT", "EDITABLE_CONTENT", "VISIBLE_QR", "UNVERIFIED_MEDIA", "TEXT_SCAN_LIMIT", "REGION_SENSITIVE_TEXT", "NO_SAFE_REGION")
		if code == "UNKNOWN" {
			o.Screenshot = nil
			o.ScreenshotState = "SENSITIVE_UI"
		}
		if code != "UNKNOWN" && len(reasons) < 7 {
			reasons = append(reasons, code)
		}
	}
	o.ScreenshotReasons = reasons
	if o.ConsoleErrors < 0 {
		o.ConsoleErrors = 0
	}
	if o.ConsoleErrors > 32 {
		o.ConsoleErrors = 32
	}
	if o.NetworkFailures < 0 {
		o.NetworkFailures = 0
	}
	if o.NetworkFailures > 32 {
		o.NetworkFailures = 32
	}
	if o.Screenshot != nil {
		b, e := base64.StdEncoding.DecodeString(o.Screenshot.Data)
		valid := e == nil && len(b) <= 1500000 && o.Screenshot.Mime == "image/png" && o.Screenshot.Scope == "VISIBLE_WARNING" && len(o.Warnings) > 0 && len(o.ScreenshotReasons) == 0 && o.ScreenshotState == "CAPTURED"
		if valid {
			cfg, e := png.DecodeConfig(bytes.NewReader(b))
			valid = e == nil && cfg.Width > 0 && cfg.Height > 0 && cfg.Width <= 1280 && cfg.Height <= 900 && cfg.Width == o.Screenshot.Width && cfg.Height == o.Screenshot.Height
		}
		if !valid || o.Identity == "MISMATCH" || o.Path == "/[EXTERNAL_ORIGIN]" {
			o.Screenshot = nil
			o.ScreenshotState = "UNAVAILABLE"
		}
	}
	if o.Screenshot == nil && o.ScreenshotState == "CAPTURED" {
		o.ScreenshotState = "UNAVAILABLE"
	}
	return o
}
func InspectRestriction(ctx context.Context, t RestrictionTarget, factory func() (RestrictionInspector, error)) (r RestrictionResult) {
	r = RestrictionResult{Protocol: RestrictionProtocol, Kind: "UNAVAILABLE", Code: "INVALID_TARGET", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), Observation: SafeRestrictionObservation(RestrictionObservation{}, t)}
	if !t.Valid() {
		r.ProcessStopped = true
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if ctx.Err() != nil {
		r.Code = "CANCELLED"
		r.ProcessStopped = true
		return
	}
	var d RestrictionInspector
	defer func() {
		if recover() != nil {
			r.Kind = "UNAVAILABLE"
			r.Code = "DRIVER_PANIC"
		}
		if d != nil {
			closeCtx, end := context.WithTimeout(context.Background(), 2*time.Second)
			defer end()
			r.ProcessStopped = closeRestriction(closeCtx, d)
		}
		if !r.ProcessStopped {
			r.Kind = "UNAVAILABLE"
			r.Code = "STOP_UNCONFIRMED"
		}
	}()
	var err error
	d, err = factory()
	if err != nil || d == nil {
		r.Code = "DRIVER_ERROR"
		return
	}
	o, err := d.Inspect(ctx, t)
	r.Observation = SafeRestrictionObservation(o, t)
	r.ObservedAt = time.Now().UTC().Format(time.RFC3339Nano)
	if r.Observation.Identity == "MISMATCH" {
		r.Kind = "IDENTITY_MISMATCH"
		r.Code = "ACCOUNT_MISMATCH"
		r.Observation.Warnings = []RestrictionWarning{}
		r.Observation.Screenshot = nil
		return
	}
	if len(r.Observation.Warnings) > 0 {
		r.Kind = "RESTRICTION_VISIBLE"
		r.Code = "VISIBLE_NOTICE"
		return
	}
	if ctx.Err() != nil {
		r.Code = "CANCELLED"
		return
	}
	if err != nil {
		r.Code = "DRIVER_ERROR"
		return
	}
	switch r.Observation.Identity {
	case "MATCH":
		r.Kind = "OBSERVED_NO_RESTRICTION"
		r.Code = "NOT_A_SEND_PERMISSION_CHECK"
	case "MISMATCH":
		r.Kind = "IDENTITY_MISMATCH"
		r.Code = "ACCOUNT_MISMATCH"
	default:
		r.Kind = "IDENTITY_UNVERIFIED"
		r.Code = "ACCOUNT_UNVERIFIED"
	}
	return
}
func closeRestriction(ctx context.Context, d RestrictionInspector) (ok bool) {
	defer func() { _ = recover() }()
	return d.Close(ctx) == nil
}
