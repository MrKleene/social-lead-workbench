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
	steps := replySelectSteps{action("idle"), action("target"), action("empty"), action("click"), action("match"), action("activeEmpty"), action("type"), action("filled")}
	if err := runReplySelect(context.Background(), steps); err != nil {
		t.Fatal(err)
	}
	want := []string{"idle", "target", "empty", "idle", "click", "match", "activeEmpty", "type", "match", "filled"}
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
			steps := replySelectSteps{action("idle"), action("target"), action("empty"), action("click"), action("match"), action("activeEmpty"), action("type"), action("filled")}
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
