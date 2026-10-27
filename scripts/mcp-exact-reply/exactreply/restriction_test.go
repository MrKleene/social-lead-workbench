package exactreply

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"image/png"
	"strings"
	"testing"
)

func restrictionTarget() RestrictionTarget {
	return RestrictionTarget{Protocol: RestrictionProtocol, AccountID: "account", SenderID: strings.Repeat("a", 24), PostID: strings.Repeat("b", 24), Reference: Reference{PostID: strings.Repeat("b", 24), Token: "synthetic-only", Source: "pc_feed"}}
}

type fakeRestriction struct {
	o                 RestrictionObservation
	err               error
	closed, inspected int
	panicClose        bool
}

func (f *fakeRestriction) Inspect(context.Context, RestrictionTarget) (RestrictionObservation, error) {
	f.inspected++
	return f.o, f.err
}
func (f *fakeRestriction) Close(context.Context) error {
	f.closed++
	if f.panicClose {
		panic("private")
	}
	return nil
}
func TestRestrictionVisibleDoesNotAssertSendPermission(t *testing.T) {
	tgt := restrictionTarget()
	f := &fakeRestriction{o: RestrictionObservation{Identity: "MATCH", Warnings: []RestrictionWarning{{"BANNED", "账号已被封禁"}}}}
	r := InspectRestriction(context.Background(), tgt, func() (RestrictionInspector, error) { return f, nil })
	if r.Kind != "RESTRICTION_VISIBLE" || !r.ProcessStopped || r.WriteOperations != 0 || f.inspected != 1 || f.closed != 1 {
		t.Fatal(r, f)
	}
}
func TestRestrictionNoNoticeNeverMeansCanSend(t *testing.T) {
	for _, identity := range []string{"MATCH", "UNKNOWN", "MISMATCH"} {
		f := &fakeRestriction{o: RestrictionObservation{Identity: identity}}
		r := InspectRestriction(context.Background(), restrictionTarget(), func() (RestrictionInspector, error) { return f, nil })
		if r.Code == "CAN_SEND" || r.Kind == "CONFIRMED" || r.WriteOperations != 0 {
			t.Fatal(r)
		}
		if identity == "MATCH" && r.Code != "NOT_A_SEND_PERMISSION_CHECK" {
			t.Fatal(r)
		}
	}
}
func TestRestrictionIdentityMismatchCannotAttributeBan(t *testing.T) {
	f := &fakeRestriction{o: RestrictionObservation{Identity: "MISMATCH", Warnings: []RestrictionWarning{{"BANNED", "封禁"}}}}
	r := InspectRestriction(context.Background(), restrictionTarget(), func() (RestrictionInspector, error) { return f, nil })
	if r.Kind != "IDENTITY_MISMATCH" || len(r.Observation.Warnings) != 0 {
		t.Fatal(r)
	}
}
func TestRestrictionCancelInvalidNeverOpens(t *testing.T) {
	for _, invalid := range []bool{false, true} {
		ctx, cancel := context.WithCancel(context.Background())
		tgt := restrictionTarget()
		if invalid {
			tgt.Protocol = "bad"
		} else {
			cancel()
		}
		r := InspectRestriction(ctx, tgt, func() (RestrictionInspector, error) { t.Fatal("opened"); return nil, nil })
		cancel()
		if !r.ProcessStopped || r.Kind != "UNAVAILABLE" {
			t.Fatal(r)
		}
	}
}
func TestRestrictionErrorAndCloseFailureAreBounded(t *testing.T) {
	for _, closeFail := range []bool{false, true} {
		f := &fakeRestriction{err: errors.New("private token"), panicClose: closeFail}
		r := InspectRestriction(context.Background(), restrictionTarget(), func() (RestrictionInspector, error) { return f, nil })
		if strings.Contains(r.Code, "private") || r.Kind != "UNAVAILABLE" || r.ProcessStopped == closeFail {
			t.Fatal(r)
		}
	}
}
func TestRestrictionRedactionAndScreenshotValidation(t *testing.T) {
	tgt := restrictionTarget()
	o := RestrictionObservation{Identity: "MATCH", Title: "synthetic-only https://example.invalid/?token=secret test@example.com 13812345678", Path: "/path?secret=raw", Warnings: []RestrictionWarning{{"BANNED", "账号封禁 synthetic-only 13812345678"}, {"raw-secret", "raw"}}, ScreenshotState: "CAPTURED", Screenshot: &RestrictionImage{Mime: "image/png", Data: "bad"}, ConsoleErrors: 100, NetworkFailures: -1}
	r := SafeRestrictionObservation(o, tgt)
	if strings.Contains(r.Title, "synthetic") || strings.Contains(r.Title, "13812345678") || len(r.Warnings) != 1 || r.Screenshot != nil || r.Path != "/[OTHER_ROUTE]" || r.ConsoleErrors != 32 || r.NetworkFailures != 0 {
		t.Fatal(r)
	}
	var b bytes.Buffer
	png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	o.Screenshot = &RestrictionImage{Mime: "image/png", Data: base64.StdEncoding.EncodeToString(b.Bytes()), Width: 2, Height: 2, Scope: "VISIBLE_WARNING"}
	if SafeRestrictionObservation(o, tgt).Screenshot == nil {
		t.Fatal("valid synthetic screenshot rejected")
	}
	o.Identity = "MISMATCH"
	if SafeRestrictionObservation(o, tgt).Screenshot != nil {
		t.Fatal("wrong identity screenshot")
	}
}

func TestRestrictionScreenshotNeverExportsViewportOrUnsafeNotice(t *testing.T) {
	var b bytes.Buffer
	png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	for _, reason := range []string{"NOTICE_SENSITIVE_TEXT", "EDITABLE_CONTENT", "VISIBLE_QR", "UNVERIFIED_MEDIA", "TEXT_SCAN_LIMIT", "REGION_SENSITIVE_TEXT", "NO_SAFE_REGION"} {
		o := RestrictionObservation{Identity: "MATCH", Warnings: []RestrictionWarning{{"BANNED", "账号封禁"}}, ScreenshotState: "CAPTURED", ScreenshotReasons: []string{reason}, Screenshot: &RestrictionImage{Mime: "image/png", Data: base64.StdEncoding.EncodeToString(b.Bytes()), Width: 2, Height: 2, Scope: "VISIBLE_WARNING"}}
		safe := SafeRestrictionObservation(o, restrictionTarget())
		if safe.Screenshot != nil || len(safe.ScreenshotReasons) != 1 {
			t.Fatal(reason, safe)
		}
	}
	o := RestrictionObservation{Identity: "MATCH", ScreenshotState: "CAPTURED", Screenshot: &RestrictionImage{Mime: "image/png", Data: base64.StdEncoding.EncodeToString(b.Bytes()), Width: 2, Height: 2, Scope: "VIEWPORT"}}
	if SafeRestrictionObservation(o, restrictionTarget()).Screenshot != nil {
		t.Fatal("viewport must never be exported")
	}
}
