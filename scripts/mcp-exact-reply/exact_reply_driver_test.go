package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"net/url"
	"reflect"
	"testing"
)

func TestExactReplyObservationDoesNotInventTarget(t *testing.T) {
	var r Comment
	if err := json.Unmarshal([]byte(`{"id":"eeeeeeeeeeeeeeeeeeeeeeee","noteId":"bbbbbbbbbbbbbbbbbbbbbbbb","content":"synthetic","userInfo":{"userId":"aaaaaaaaaaaaaaaaaaaaaaaa"},"targetComment":{"id":"cccccccccccccccccccccccc","userInfo":{"userId":"dddddddddddddddddddddddd"}}}`), &r); err != nil {
		t.Fatal(err)
	}
	o, ok := exactObservation(r, r.NoteID)
	if !ok || o.ParentID != r.TargetComment.ID || o.SenderID != r.UserInfo.UserID || o.ContentHash != exactreply.Hash("synthetic") {
		t.Fatal(o, ok)
	}
	r.TargetComment = nil
	if _, ok = exactObservation(r, r.NoteID); ok {
		t.Fatal("invented target")
	}
}
func TestExactReplyFlattenPreservesNestedIdentity(t *testing.T) {
	rows, err := exactComments([]Comment{{ID: "root", SubComments: []Comment{{ID: "child"}}}})
	if err != nil || len(rows) != 2 || rows[1].ID != "child" {
		t.Fatal(rows, err)
	}
}

func TestExactReplyURLPreservesExactPostAndSavedReference(t *testing.T) {
	for _, source := range []string{"pc_feed", "pc_search"} {
		c := exactreply.Command{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Reference: exactreply.Reference{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Token: "synthetic+/==", Source: source}}
		u, err := url.Parse(exactURL(c))
		if err != nil || u.Scheme != "https" || u.Host != "www.xiaohongshu.com" || u.Path != "/explore/"+c.PostID || u.Query().Get("xsec_token") != c.Reference.Token || u.Query().Get("xsec_source") != source || len(u.Query()) != 2 {
			t.Fatal("reference round trip failed")
		}
	}
}

func TestExactReplyCancelledSelectDoesNotTouchPage(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	d := &ExactReplyDriver{}
	if err := d.Select(ctx, exactreply.Command{}); !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
}
func TestExactReplyNoSelectionNeverEntersSubmit(t *testing.T) {
	d := &ExactReplyDriver{}
	result, err := d.Submit(context.Background(), exactreply.Command{})
	if err == nil || err.Error() != "NOT_SUBMITTED" || result.Attempted {
		t.Fatal(result, err)
	}
}

func TestExactReplySelectionPipelineSyntheticSuccess(t *testing.T) {
	var events []string
	action := func(name string) func(context.Context) error {
		return func(context.Context) error { events = append(events, name); return nil }
	}
	steps := replySelectSteps{action("idle"), action("target"), action("empty"), action("click"), action("initial"), action("match"), action("activeEmpty"), action("type"), action("filled")}
	if err := runReplySelect(context.Background(), steps); err != nil {
		t.Fatal(err)
	}
	want := []string{"idle", "target", "empty", "idle", "click", "initial", "activeEmpty", "type", "match", "filled"}
	if !reflect.DeepEqual(events, want) {
		t.Fatal(events)
	}
}
func TestExactReplySelectionFailureOrCancellationCannotAdvanceOrRetry(t *testing.T) {
	for stop := 0; stop < 10; stop++ {
		for _, cancelled := range []bool{false, true} {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			count, clicks, types := 0, 0, 0
			action := func(name string) func(context.Context) error {
				return func(context.Context) error {
					at := count
					count++
					if name == "click" {
						clicks++
					}
					if name == "type" {
						types++
					}
					if at == stop {
						if cancelled {
							cancel()
							return nil
						}
						return errors.New("synthetic stop")
					}
					return nil
				}
			}
			steps := replySelectSteps{action("idle"), action("target"), action("empty"), action("click"), action("initial"), action("match"), action("activeEmpty"), action("type"), action("filled")}
			err := runReplySelect(ctx, steps)
			if err == nil || count != stop+1 || clicks > 1 || types > 1 {
				t.Fatal(stop, cancelled, count, clicks, types, err)
			}
			if stop < 4 && clicks != 0 {
				t.Fatal("clicked after failed prerequisite")
			}
			if stop < 7 && types != 0 {
				t.Fatal("typed before binding + empty editor proof")
			}
		}
	}
}

func TestExactReplyProfileNavigationStopsOnEveryUnverifiedOrRestrictedState(t *testing.T) {
	good := restrictionDOM{Identity: "MATCH", SelfProfile: true, Path: "/explore"}
	if !profileNavigationAllowed(good) {
		t.Fatal("verified exact self link blocked")
	}
	cases := []restrictionDOM{
		{Identity: "MISMATCH", SelfProfile: true, Path: "/explore"},
		{Identity: "UNKNOWN", SelfProfile: true, Path: "/explore"},
		{Identity: "MATCH", SelfProfile: false, Path: "/explore"},
		{Identity: "MATCH", SelfProfile: true, Path: "/[EXTERNAL_ORIGIN]"},
		{Identity: "MATCH", SelfProfile: true, Path: "/explore", LoginChallenge: true},
		{Identity: "MATCH", SelfProfile: true, Path: "/explore", Warnings: []exactreply.RestrictionWarning{{Code: "SESSION_LIMIT", Text: "电脑设备登录超限，请重新登录"}}},
	}
	for _, d := range cases {
		if profileNavigationAllowed(d) {
			t.Fatalf("unsafe navigation: %#v", d)
		}
	}
}

func TestExactReplyProfileCaptureRevalidationRejectsChangedOrPrivateUI(t *testing.T) {
	before := restrictionDOM{Identity: "MATCH", Path: "/user/profile/[SENDER]", Warnings: []exactreply.RestrictionWarning{{Code: "ACCOUNT_CONTENT_RESTRICTED", Text: "其内容无法查看"}}}
	if !safeRestrictionCapture(before, before) {
		t.Fatal("stable capture rejected")
	}
	for _, change := range []func(*restrictionDOM){
		func(d *restrictionDOM) { d.Identity = "UNKNOWN" }, func(d *restrictionDOM) { d.Path = "/login" },
		func(d *restrictionDOM) { d.Sensitive = true }, func(d *restrictionDOM) { d.LoginChallenge = true },
		func(d *restrictionDOM) { d.Clip.X = 42 }, func(d *restrictionDOM) { d.Warnings = nil },
		func(d *restrictionDOM) {
			d.Warnings = []exactreply.RestrictionWarning{{Code: "SESSION_LIMIT", Text: "请重新登录"}}
		},
	} {
		after := before
		change(&after)
		if safeRestrictionCapture(before, after) {
			t.Fatal("changed capture accepted")
		}
	}
}

func TestExactReplyProfileGate(t *testing.T) {
	clear := exactreply.RestrictionObservation{Identity: "MATCH", Path: "/user/profile/[SENDER]", Navigation: []exactreply.RestrictionStep{{Path: "/explore", Identity: "MATCH"}, {Path: "/user/profile/[SENDER]", Identity: "MATCH"}}}
	if err := profileSendBlock(clear); err != nil {
		t.Fatal(err)
	}
	for _, code := range []string{"ACCOUNT_CONTENT_RESTRICTED", "BANNED", "MUTED", "SESSION_LIMIT", "VERIFICATION", "RATE_LIMITED", "COMMENT_RESTRICTED"} {
		notice := clear
		notice.Warnings = []exactreply.RestrictionWarning{{Code: code, Text: "合成限制"}}
		if profileSendBlock(notice) == nil {
			t.Fatal(code)
		}
	}
	for _, change := range []func(*exactreply.RestrictionObservation){func(o *exactreply.RestrictionObservation) { o.Identity = "MISMATCH" }, func(o *exactreply.RestrictionObservation) { o.Identity = "UNKNOWN" }, func(o *exactreply.RestrictionObservation) { o.Path = "/explore/[POST]" }, func(o *exactreply.RestrictionObservation) { o.Navigation = nil }} {
		bad := clear
		change(&bad)
		if profileSendBlock(bad) == nil {
			t.Fatal("unverified profile allowed")
		}
	}
}

func TestExactReplyURLRoundTripReservedCharacters(t *testing.T) {
	for _, token := range []string{"abc+def/ghi==", "a_b-c+/=", "synthetic"} {
		c := exactreply.Command{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Reference: exactreply.Reference{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Token: token, Source: "pc_search"}}
		u, err := url.Parse(exactURL(c))
		if err != nil || u.Host != "www.xiaohongshu.com" || u.Path != "/explore/"+c.PostID || u.Query().Get("xsec_token") != token || len(u.Query()["xsec_token"]) != 1 || u.Query().Get("xsec_source") != "pc_search" {
			t.Fatal("reference changed")
		}
	}
}

func TestExactReplySelectedComposerWaitsReadOnlyAndNeverReplaysClick(t *testing.T) {
	for _, code := range []string{"COMPOSER_BAR_INACTIVE", "COMPOSER_HEADER_MISSING", "COMPOSER_EDITOR_UNFOCUSED", "COMPOSER_PLACEHOLDER_ACTIVE"} {
		observations, waits := 0, 0
		err := waitSelectedComposer(context.Background(), func(context.Context) error {
			observations++
			if observations < 4 {
				return errors.New(code)
			}
			return nil
		}, func(context.Context) error { waits++; return nil })
		if err != nil || observations != 4 || waits != 3 {
			t.Fatal(code, err, observations, waits)
		}
	}
}
func TestExactReplySelectedComposerPermanentFailureIsBounded(t *testing.T) {
	n, w := 0, 0
	err := waitSelectedComposer(context.Background(), func(context.Context) error { n++; return errors.New("COMPOSER_EDITOR_UNFOCUSED") }, func(context.Context) error { w++; return nil })
	if err == nil || err.Error() != "COMPOSER_EDITOR_UNFOCUSED" || n != 15 || w != 14 {
		t.Fatal(err, n, w)
	}
}
func TestExactReplySelectedComposerNeverWaitsThroughUnsafeChanges(t *testing.T) {
	for _, code := range []string{"COMPOSER_DRAFT_PRESENT", "COMPOSER_AMBIGUOUS", "BINDING_TARGET_MISMATCH", "BINDING_AUTHOR_MISMATCH", "BINDING_ACCOUNT_MISMATCH", "BINDING_EMPTY", "COMPOSER_HIDDEN", "PLATFORM_REFUSED"} {
		n, w := 0, 0
		err := waitSelectedComposer(context.Background(), func(context.Context) error { n++; return errors.New(code) }, func(context.Context) error { w++; return nil })
		if err == nil || err.Error() != code || n != 1 || w != 0 {
			t.Fatal(code, err, n, w)
		}
	}
}
func TestExactReplySelectedComposerCancellationPreventsNextRead(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	n := 0
	err := waitSelectedComposer(ctx, func(context.Context) error { n++; return errors.New("COMPOSER_BAR_INACTIVE") }, func(context.Context) error { cancel(); return ctx.Err() })
	if !errors.Is(err, context.Canceled) || n != 1 {
		t.Fatal(err, n)
	}
}

func TestExactReplyInitialBindingWaitOnlyAcceptsExactMatch(t *testing.T) {
	n, empty, waits := 0, 0, 0
	var stages []string
	err := waitInitialReplyBinding(context.Background(), func(context.Context) error {
		n++
		if n < 4 {
			return errors.New("BINDING_EMPTY")
		}
		return nil
	}, func(context.Context) error { empty++; return nil }, func(context.Context) error { waits++; return nil }, func(_ context.Context, s string) error { stages = append(stages, s); return nil })
	if err != nil || n != 4 || empty != 3 || waits != 3 || !reflect.DeepEqual(stages, []string{"INITIAL_BINDING_WAIT", "INITIAL_BINDING_MATCHED"}) {
		t.Fatal(err, n, empty, waits, stages)
	}
}
func TestExactReplyInitialBindingNeverSucceedsFromPermanentEmpty(t *testing.T) {
	n, w := 0, 0
	var stages []string
	err := waitInitialReplyBinding(context.Background(), func(context.Context) error { n++; return errors.New("BINDING_EMPTY") }, func(context.Context) error { return nil }, func(context.Context) error { w++; return nil }, func(_ context.Context, s string) error { stages = append(stages, s); return nil })
	if err == nil || err.Error() != "BINDING_EMPTY" || n != 15 || w != 14 || !reflect.DeepEqual(stages, []string{"INITIAL_BINDING_WAIT", "INITIAL_BINDING_EMPTY_TIMEOUT"}) {
		t.Fatal(err, n, w, stages)
	}
}
func TestExactReplyInitialBindingMismatchAndRiskNeverWait(t *testing.T) {
	for _, code := range []string{"BINDING_TARGET_MISMATCH", "BINDING_AUTHOR_MISMATCH", "BINDING_ACCOUNT_MISMATCH", "BINDING_POST_MISMATCH", "BINDING_STATE_MISSING", "BINDING_USER_MISSING", "BINDING_INVALID", "PLATFORM_REFUSED", "RESTRICTION_UNVERIFIED"} {
		n, w, empty := 0, 0, 0
		err := waitInitialReplyBinding(context.Background(), func(context.Context) error { n++; return errors.New(code) }, func(context.Context) error { empty++; return nil }, func(context.Context) error { w++; return nil }, func(context.Context, string) error { return nil })
		if err == nil || err.Error() != code || n != 1 || w != 0 || empty != 0 {
			t.Fatal(code, err, n, w, empty)
		}
	}
}
func TestExactReplyInitialBindingCannotWaitPastDraftOrChangedDOM(t *testing.T) {
	for _, code := range []string{"COMPOSER_DRAFT_PRESENT", "COMPOSER_HIDDEN", "COMPOSER_AMBIGUOUS", "COMPOSER_UNRECOGNIZED", "EXACT_TARGET_MISSING", "AUTHOR_MISMATCH", "REPLY_BUTTON_AMBIGUOUS"} {
		w := 0
		err := waitInitialReplyBinding(context.Background(), func(context.Context) error { return errors.New("BINDING_EMPTY") }, func(context.Context) error { return errors.New(code) }, func(context.Context) error { w++; return nil }, func(context.Context, string) error { return nil })
		if err == nil || err.Error() != code || w != 0 {
			t.Fatal(code, err, w)
		}
	}
}
func TestExactReplyInitialBindingCancellationAndJournalFailureDoNotAdvance(t *testing.T) {
	for _, kind := range []string{"cancel-before", "cancel-wait", "journal-start", "journal-match", "journal-timeout"} {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		if kind == "cancel-before" {
			cancel()
		}
		n := 0
		err := waitInitialReplyBinding(ctx, func(context.Context) error {
			n++
			if kind == "journal-match" {
				return nil
			}
			return errors.New("BINDING_EMPTY")
		}, func(context.Context) error { return nil }, func(context.Context) error {
			if kind == "cancel-wait" {
				cancel()
				return ctx.Err()
			}
			return nil
		}, func(_ context.Context, s string) error {
			if kind == "journal-start" && s == "INITIAL_BINDING_WAIT" || kind == "journal-match" && s == "INITIAL_BINDING_MATCHED" || kind == "journal-timeout" && s == "INITIAL_BINDING_EMPTY_TIMEOUT" {
				return errors.New("JOURNAL_UNAVAILABLE")
			}
			return nil
		})
		if err == nil || (kind == "cancel-before" || kind == "journal-start") && n != 0 || kind == "cancel-wait" && n != 1 {
			t.Fatal(kind, err, n)
		}
	}
}
func TestExactReplyInitialBindingDelayedSelectionClicksAndTypesOnce(t *testing.T) {
	for _, lost := range []bool{false, true} {
		clicks, types, reads := 0, 0, 0
		ok := func(context.Context) error { return nil }
		s := replySelectSteps{idle: ok, target: ok, emptyBinding: ok, click: func(context.Context) error { clicks++; return nil }, initialBinding: func(ctx context.Context) error {
			return waitInitialReplyBinding(ctx, func(context.Context) error {
				reads++
				if reads < 3 {
					return errors.New("BINDING_EMPTY")
				}
				return nil
			}, ok, ok, func(context.Context, string) error { return nil })
		}, matchedBinding: ok, activeEmpty: func(context.Context) error {
			if lost {
				return errors.New("BINDING_EMPTY")
			}
			return nil
		}, input: func(context.Context) error { types++; return nil }, filled: ok}
		err := runReplySelect(context.Background(), s)
		if clicks != 1 || reads != 3 || lost && (err == nil || types != 0) || !lost && (err != nil || types != 1) {
			t.Fatal(lost, err, clicks, types, reads)
		}
	}
}
