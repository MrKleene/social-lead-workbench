package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"github.com/xpzouying/xiaohongshu-mcp/humanize"
	"net/url"
	"time"
)

// ExactReplyDriver only touches the exact comment. No author, nickname, text or
// notification fallback. Missing/unrecognized state is a pre-submit rejection.
type ExactReplyDriver struct {
	page             *rod.Page
	closeBrowser     func()
	opened, selected bool
	profileChecked   bool
	before           map[string]bool
}

func NewExactReplyDriver(p *rod.Page, closeBrowser func()) *ExactReplyDriver {
	return &ExactReplyDriver{page: p, closeBrowser: closeBrowser}
}
func exactURL(c exactreply.Command) string {
	q := url.Values{}
	q.Set("xsec_token", c.Reference.Token)
	q.Set("xsec_source", c.Reference.Source)
	return "https://www.xiaohongshu.com/explore/" + c.PostID + "?" + q.Encode()
}

type exactState struct {
	SenderID  string    `json:"senderId"`
	NoteID    string    `json:"noteId"`
	Comments  []Comment `json:"comments"`
	Blocked   bool      `json:"blocked"`
	StateCode string    `json:"stateCode"`
}

func (d *ExactReplyDriver) state(ctx context.Context, c exactreply.Command, reload bool) (exactState, error) {
	p := d.page.Context(ctx)
	if ctx.Err() != nil {
		return exactState{}, ctx.Err()
	}
	if !d.profileChecked {
		if err := d.profileRestrictions(ctx, c); err != nil {
			return exactState{}, err
		}
		d.profileChecked = true
	}
	if !d.opened || reload {
		if err := exactreply.RecordStage(ctx, "NAVIGATION_INTENT", nil, nil); err != nil {
			return exactState{}, err
		}
		if err := p.Navigate(exactURL(c)); err != nil {
			return exactState{}, err
		}
		d.opened = true
		if err := p.WaitLoad(); err != nil {
			return exactState{}, err
		}
		if err := exactreply.RecordStage(ctx, "NAVIGATED", nil, nil); err != nil {
			return exactState{}, err
		}
	}
	if err := d.restrictions(ctx, c); err != nil {
		return exactState{}, err
	}
	// Paths already used by the reviewed login/detail reader; no invented private API.
	v, err := p.Eval(`(post) => {
  const unwrap=v=>v&&v.value!==undefined?v.value:v&&v._rawValue!==undefined?v._rawValue:v;
  if(document.querySelector('.access-wrapper,.error-wrapper,.not-found-wrapper,.blocked-wrapper')) return JSON.stringify({blocked:true});
  const s=window.__INITIAL_STATE__;const u=unwrap(s?.user?.userInfo);const map=unwrap(s?.note?.noteDetailMap);const row=map?.[post];
  if(!u||u.guest) return JSON.stringify({stateCode:'STATE_USER_MISSING'});
  if(!row) return JSON.stringify({senderId:u.userId||u.user_id,stateCode:'STATE_POST_MISSING'});
  if(row.note?.noteId!==post) return JSON.stringify({senderId:u.userId||u.user_id,noteId:row.note?.noteId,stateCode:'STATE_POST_MISMATCH'});
  if(!Array.isArray(row.comments?.list)) return JSON.stringify({senderId:u.userId||u.user_id,noteId:row.note.noteId,stateCode:'STATE_COMMENTS_MISSING'});
  return JSON.stringify({senderId:u.userId||u.user_id,noteId:row.note.noteId,comments:row.comments?.list,
    blocked:!!document.querySelector('.access-wrapper,.error-wrapper,.not-found-wrapper,.blocked-wrapper')});
 }`, c.PostID)
	if err != nil {
		return exactState{}, err
	}
	raw := v.Value.Str()
	if len(raw) == 0 || len(raw) > 2*1024*1024 {
		return exactState{}, errors.New("STATE_UNAVAILABLE")
	}
	var s exactState
	if err = json.Unmarshal([]byte(raw), &s); err != nil {
		return s, errors.New("STATE_INVALID")
	}
	if s.Blocked {
		return s, exactreply.RiskError("PLATFORM_REFUSED")
	}
	switch s.StateCode {
	case "STATE_USER_MISSING", "STATE_POST_MISSING", "STATE_POST_MISMATCH", "STATE_COMMENTS_MISSING":
		return s, errors.New(s.StateCode)
	case "":
	default:
		return s, errors.New("STATE_INVALID")
	}
	return s, nil
}
func exactComments(rows []Comment) ([]Comment, error) {
	out := []Comment{}
	var visit func([]Comment, int) error
	visit = func(xs []Comment, depth int) error {
		if depth > 8 {
			return errors.New("DEPTH_LIMIT")
		}
		for _, c := range xs {
			out = append(out, c)
			if len(out) > 5000 {
				return errors.New("ROW_LIMIT")
			}
			if err := visit(c.SubComments, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	err := visit(rows, 0)
	return out, err
}
func (d *ExactReplyDriver) Inspect(ctx context.Context, c exactreply.Command) (exactreply.Snapshot, error) {
	s, err := d.state(ctx, c, false)
	if err != nil {
		return exactreply.Snapshot{PostID: s.NoteID, SenderID: s.SenderID}, err
	}
	rows, err := exactComments(s.Comments)
	if err != nil {
		return exactreply.Snapshot{}, err
	}
	result := exactreply.Snapshot{PostID: s.NoteID, SenderID: s.SenderID, ExistingIDs: map[string]bool{}}
	count := 0
	for _, r := range rows {
		result.ExistingIDs[r.ID] = true
		if r.ID == c.TargetID {
			count++
			if r.NoteID != "" && r.NoteID != c.PostID {
				return result, errors.New("POST_MISMATCH")
			}
			result.TargetID = r.ID
			result.TargetAuthor = r.UserInfo.UserID
		}
	}
	if count != 1 {
		return result, errors.New("EXACT_TARGET_MISSING_OR_AMBIGUOUS")
	}
	if d.before == nil {
		d.before = result.ExistingIDs
	}
	if err := exactreply.RecordStage(ctx, "TARGET_LOCATED", nil, nil); err != nil {
		return result, err
	}
	return result, nil
}

// Each action runs at most once, except explicit read-only rechecks. Keeping the
// sequence pure allows cancellation/failure injection without a browser account.
type replySelectSteps struct {
	idle, target, emptyBinding, click, initialBinding, matchedBinding, activeEmpty, input, filled func(context.Context) error
}

func runReplySelect(ctx context.Context, s replySelectSteps) error {
	for _, step := range []func(context.Context) error{s.idle, s.target, s.emptyBinding, s.idle, s.click, s.initialBinding, s.activeEmpty, s.input, s.matchedBinding, s.filled} {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if step == nil {
			return errors.New("SELECTION_STEP_MISSING")
		}
		if err := step(ctx); err != nil {
			return err
		}
	}
	return ctx.Err()
}

// At most 15 observations (1.4s of waits). Only transient presentation states
// may settle. Drafts, ambiguity, identity/binding changes and cancellation stop.
func waitSelectedComposer(ctx context.Context, probe, wait func(context.Context) error) error {
	for n := 0; n < 15; n++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		err := probe(ctx)
		if err == nil {
			return nil
		}
		switch err.Error() {
		case "COMPOSER_BAR_INACTIVE", "COMPOSER_HEADER_MISSING", "COMPOSER_EDITOR_UNFOCUSED", "COMPOSER_PLACEHOLDER_ACTIVE":
			if n == 14 {
				return err
			}
			if err := wait(ctx); err != nil {
				return err
			}
		default:
			return err
		}
	}
	return errors.New("COMPOSER_NOT_ACTIVE")
}

// Only the first post-click EMPTY may be a rendering transition. This helper
// has no click/type capability and succeeds exclusively on exact MATCH. Once
// matched, later guards remain immediate: MATCH -> EMPTY never gets a grace period.
func waitInitialReplyBinding(ctx context.Context, probe, pristine, wait func(context.Context) error, record func(context.Context, string) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := record(ctx, "INITIAL_BINDING_WAIT"); err != nil {
		return err
	}
	for n := 0; n < 15; n++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		err := probe(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err == nil {
			return record(ctx, "INITIAL_BINDING_MATCHED")
		}
		if err.Error() != "BINDING_EMPTY" {
			return err
		}
		if err := pristine(ctx); err != nil {
			return err
		}
		if n == 14 {
			if err := record(ctx, "INITIAL_BINDING_EMPTY_TIMEOUT"); err != nil {
				return err
			}
			return errors.New("BINDING_EMPTY")
		}
		if err := wait(ctx); err != nil {
			return err
		}
	}
	return errors.New("BINDING_EMPTY")
}
func replyRenderWait(ctx context.Context) error {
	timer := time.NewTimer(100 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
func (d *ExactReplyDriver) Select(ctx context.Context, c exactreply.Command) error {
	d.selected = false
	err := runReplySelect(ctx, replySelectSteps{
		idle: func(ctx context.Context) error { return d.composer(ctx, c, "DEFAULT") },
		target: func(ctx context.Context) error {
			snap, err := d.Inspect(ctx, c)
			if err != nil {
				return err
			}
			if snap.PostID != c.PostID || snap.SenderID != c.SenderID || snap.TargetID != c.TargetID || snap.TargetAuthor != c.RecipientID {
				return errors.New("TARGET_CHANGED")
			}
			return nil
		},
		emptyBinding: func(ctx context.Context) error { return d.binding(ctx, c, "EMPTY") },
		click: func(ctx context.Context) error {
			p := d.page.Context(ctx)
			targets, err := p.Elements("#comment-" + c.TargetID)
			if err != nil || len(targets) != 1 {
				return errors.New("EXACT_TARGET_MISSING")
			}
			candidates, err := targets[0].Elements(".right .interactions .reply")
			if err != nil {
				return errors.New("REPLY_BUTTON_AMBIGUOUS")
			}
			buttons := []*rod.Element{}
			for _, candidate := range candidates {
				owner, e := candidate.Eval(`() => this.closest('.comment-item')?.id || ''`)
				if e != nil {
					return errors.New("REPLY_BUTTON_AMBIGUOUS")
				}
				if owner.Value.Str() == "comment-"+c.TargetID {
					buttons = append(buttons, candidate)
				}
			}
			if len(buttons) != 1 {
				return errors.New("REPLY_BUTTON_AMBIGUOUS")
			}
			hit, err := buttons[0].Eval(`() => this.closest('.comment-item')?.id || ''`)
			if err != nil || hit.Value.Str() != "comment-"+c.TargetID {
				return errors.New("BUTTON_TARGET_MISMATCH")
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if err := d.restrictions(ctx, c); err != nil {
				return err
			}
			if err := d.recordSelection(ctx, c, "SELECTION_BEFORE"); err != nil {
				return err
			}
			if err := exactreply.RecordStage(ctx, "SELECT_INTENT", nil, nil); err != nil {
				return err
			}
			if err := d.clickExactReply(ctx, c, buttons[0]); err != nil {
				return err
			}
			if err := exactreply.RecordStage(ctx, "REPLY_SELECTED", nil, nil); err != nil {
				return err
			}
			return d.recordSelection(ctx, c, "SELECTION_AFTER")
		},
		initialBinding: func(ctx context.Context) error {
			return waitInitialReplyBinding(ctx, func(ctx context.Context) error {
				if err := d.restrictions(ctx, c); err != nil {
					return err
				}
				return d.binding(ctx, c, "MATCH")
			}, func(ctx context.Context) error { return d.composer(ctx, c, "BINDING_PENDING") }, replyRenderWait,
				func(ctx context.Context, stage string) error { return exactreply.RecordStage(ctx, stage, nil, nil) })
		},
		matchedBinding: func(ctx context.Context) error { return d.binding(ctx, c, "MATCH") },
		activeEmpty: func(ctx context.Context) error {
			// A store update can precede the visible editor/focus transition. Poll
			// only read-only guards; never click/focus/type to force a passing UI.
			return waitSelectedComposer(ctx, func(ctx context.Context) error {
				if err := d.binding(ctx, c, "MATCH"); err != nil {
					return err
				}
				return d.composer(ctx, c, "SELECTED")
			}, func(ctx context.Context) error {
				timer := time.NewTimer(100 * time.Millisecond)
				defer timer.Stop()
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-timer.C:
					return nil
				}
			})
		},
		input: func(ctx context.Context) error {
			inputs, err := d.page.Context(ctx).Elements("div.input-box p.content-input")
			if err != nil || len(inputs) != 1 {
				return errors.New("COMPOSER_AMBIGUOUS")
			}
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if err := d.restrictions(ctx, c); err != nil {
				return err
			}
			if err := exactreply.RecordStage(ctx, "INPUT_INTENT", nil, nil); err != nil {
				return err
			}
			if err := humanize.Type(ctx, inputs[0], c.Content); err != nil {
				return err
			}
			if err := exactreply.RecordStage(ctx, "INPUT_FINISHED", nil, nil); err != nil {
				return err
			}
			return d.restrictions(ctx, c)
		},
		filled: func(ctx context.Context) error { return d.composer(ctx, c, "FILLED") },
	})
	if err != nil {
		if ctx.Err() == nil {
			if diagnosticErr := d.recordSelection(ctx, c, "SELECTION_STOPPED"); diagnosticErr != nil {
				return diagnosticErr
			}
		}
		return err
	}
	d.selected = true
	return nil
}

func (d *ExactReplyDriver) binding(ctx context.Context, c exactreply.Command, expected string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	v, err := d.page.Context(ctx).Eval(exactReplyBindingGuard, c.PostID, c.TargetID, c.RecipientID, c.SenderID)
	if err != nil {
		return err
	}
	code := v.Value.Str()
	if code == expected {
		return nil
	}
	if code == "BINDING_PLATFORM_BLOCKED" {
		return exactreply.RiskError("PLATFORM_REFUSED")
	}
	if code == "EMPTY" {
		return errors.New("BINDING_EMPTY")
	}
	if code == "MATCH" {
		return errors.New("COMPOSER_TARGET_BOUND")
	}
	return errors.New(code)
}
func (d *ExactReplyDriver) composer(ctx context.Context, c exactreply.Command, phase string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	v, err := d.page.Context(ctx).Eval(exactReplySelectionGuard, c.TargetID, c.RecipientID, phase, c.Content)
	if err != nil {
		return err
	}
	expected := "ACTIVE_MATCH"
	if phase == "BINDING_PENDING" {
		expected = "PENDING_EMPTY"
	}
	if phase == "DEFAULT" {
		expected = "DEFAULT_EMPTY"
	}
	if v.Value.Str() != expected {
		return errors.New(v.Value.Str())
	}
	return nil
}

func (d *ExactReplyDriver) Submit(ctx context.Context, c exactreply.Command) (exactreply.Submission, error) {
	s := exactreply.Submission{}
	if ctx.Err() != nil {
		return s, ctx.Err()
	}
	if !d.selected {
		return s, errors.New("NOT_SUBMITTED")
	}
	if err := d.binding(ctx, c, "MATCH"); err != nil {
		return s, err
	}
	if err := d.composer(ctx, c, "FILLED"); err != nil {
		return s, err
	}
	p := d.page.Context(ctx)
	inputs, err := p.Elements("div.input-box p.content-input")
	if err != nil || len(inputs) != 1 {
		return s, errors.New("COMPOSER_CHANGED")
	}
	text, err := inputs[0].Text()
	if err != nil || text != c.Content {
		return s, errors.New("CONTENT_CHANGED")
	}
	buttons, err := p.Elements(".engage-bar-container .bottom button.submit")
	if err != nil || len(buttons) != 1 {
		return s, errors.New("SUBMIT_AMBIGUOUS")
	}
	if ctx.Err() != nil {
		return s, ctx.Err()
	}
	ready, err := buttons[0].Eval(`() => !this.disabled && this.getAttribute('aria-disabled') !== 'true' && this.getClientRects().length>0 && getComputedStyle(this).visibility==='visible'`)
	if err != nil || !ready.Value.Bool() {
		return s, errors.New("SUBMIT_NOT_READY")
	}
	// Last read-only checks directly precede the single possible submit click.
	if err = d.binding(ctx, c, "MATCH"); err != nil {
		return s, err
	}
	if err = d.composer(ctx, c, "FILLED"); err != nil {
		return s, err
	}
	if ctx.Err() != nil {
		return s, ctx.Err()
	}
	if err := d.restrictions(ctx, c); err != nil {
		return s, err
	}
	// Arm independent response capture before any possible click. A build with no
	// reviewed mapping accepts only the separately authorized evidence capture mode.
	if reviewedExactReceiptMapping() == nil && c.ReceiptMode != exactreply.CaptureOnce {
		return s, errors.New("RECEIPT_MAPPING_UNREVIEWED")
	}
	capture, err := armExactReceipt(ctx, p, c)
	if err != nil {
		return s, err
	}
	defer capture.stop()
	s.Attempted, err = exactreply.SubmitOnce(ctx, func() error {
		if err := d.restrictions(ctx, c); err != nil {
			return err
		}
		if err := capture.activate(ctx); err != nil {
			return err
		}
		return humanize.Click(buttons[0])
	})
	if err != nil {
		return s, err
	}
	// Capture notices before reload dismisses them. Restrictions always win.
	if err = d.restrictions(ctx, c); err != nil {
		return s, err
	}
	s.Response, s.Accepted, err = capture.result(ctx, c)
	if err != nil {
		return s, err
	}
	if s.Response != nil {
		return s, nil
	} // engine independently reloads and verifies it
	// An unreviewed capture still gets an independent reload, but cannot confirm.
	fresh, err := d.state(ctx, c, true)
	if err != nil {
		return s, err
	}
	if fresh.SenderID != c.SenderID {
		return s, errors.New("ACCOUNT_CHANGED")
	}
	rows, err := exactComments(fresh.Comments)
	if err != nil {
		return s, err
	}
	matches := 0
	for _, r := range rows {
		o, ok := exactObservation(r, c.PostID)
		if ok && exactreply.Matches(o, c) && !d.before[o.ID] {
			matches++
		}
	}
	readback := "NO_NEW_MATCH"
	if matches == 1 {
		readback = "ONE_NEW_MATCH"
	} else if matches > 1 {
		readback = "AMBIGUOUS"
	}
	if err = exactreply.RecordReceipt(ctx, exactreply.ReceiptEvidence{State: "UNREVIEWED_READBACK", Readback: readback}); err != nil {
		return s, err
	}
	return s, nil
}

func exactObservation(r Comment, postID string) (exactreply.Observation, bool) {
	o := exactreply.Observation{ID: r.ID, PostID: r.NoteID, SenderID: r.UserInfo.UserID, ContentHash: exactreply.Hash(r.Content)}
	if r.NoteID != postID || r.TargetComment == nil || r.TargetComment.UserInfo == nil {
		return o, false
	}
	o.ParentID = r.TargetComment.ID
	o.RecipientID = r.TargetComment.UserInfo.UserID
	return o, true
}
func (d *ExactReplyDriver) Readback(ctx context.Context, c exactreply.Command, replyID string) (exactreply.Observation, error) {
	s, err := d.state(ctx, c, true)
	if err != nil {
		return exactreply.Observation{}, err
	}
	if s.SenderID != c.SenderID {
		return exactreply.Observation{}, errors.New("ACCOUNT_CHANGED")
	}
	rows, err := exactComments(s.Comments)
	if err != nil {
		return exactreply.Observation{}, err
	}
	var found exactreply.Observation
	count := 0
	for _, r := range rows {
		if r.ID == replyID {
			if o, ok := exactObservation(r, c.PostID); ok {
				found = o
				count++
			}
		}
	}
	if count != 1 {
		return found, errors.New("RECEIPT_NOT_UNIQUE")
	}
	return found, nil
}
func (d *ExactReplyDriver) Close(ctx context.Context) error {
	// Cancellable page contexts stop future operations; browser shutdown must also
	// finish before the engine reports stopped. Uncertain close poisons the instance.
	done := make(chan bool, 1)
	go func() { ok := false; defer func() { _ = recover(); done <- ok }(); d.closeBrowser(); ok = true }()
	select {
	case ok := <-done:
		if ok {
			return nil
		}
		return errors.New("BROWSER_CLOSE_FAILED")
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(2 * time.Second):
		return errors.New("BROWSER_CLOSE_TIMEOUT")
	}
}

// exactReplySelectionGuard is pure/read-only DOM inspection. The default marker
// and editor shape were observed on the existing page without clicking/focusing.
// Missing, hidden, active, bound, populated and ambiguous structures fail closed.
const exactReplySelectionGuard = `(targetId, authorId, phase="DEFAULT", content="") => {
 const visible = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible' && getComputedStyle(e).display !== 'none';
 const targets = [...document.querySelectorAll('#comment-' + targetId)];
 if (targets.length !== 1) return 'EXACT_TARGET_MISSING';
 const target = targets[0];
 if (!visible(target)) return 'EXACT_TARGET_NOT_VISIBLE';
 const authors = [...target.querySelectorAll('[data-user-id]')].filter(e => e.closest('.comment-item') === target);
 if (!authors.length || authors.some(e => e.getAttribute('data-user-id') !== authorId)) return 'AUTHOR_MISMATCH';
 const names = authors.filter(e => e.matches('a.name'));
 if (names.length !== 1 || !visible(names[0])) return 'AUTHOR_AMBIGUOUS';
 const buttons = [...target.querySelectorAll('.right .interactions .reply')].filter(e => e.closest('.comment-item') === target);
 if (buttons.length !== 1 || !visible(buttons[0])) return 'REPLY_BUTTON_AMBIGUOUS';
 const editors = [...document.querySelectorAll('div.input-box p.content-input')];
 if (editors.length !== 1 || document.querySelectorAll('[contenteditable="true"]').length !== 1) return 'COMPOSER_AMBIGUOUS';
 const input = editors[0], box = input.closest('div.input-box'), edit = input.parentElement;
 if (!visible(input)) return 'COMPOSER_HIDDEN';
 if (input.id !== 'content-textarea' || input.getAttribute('contenteditable') !== 'true' || !edit?.matches('.content-edit') || !box) return 'COMPOSER_UNRECOGNIZED';
 // Pending is observation only; it can never authorize typing or submission.
 // UI focus/header may render before store binding. Exact store MATCH is still
 // required by the caller before the normal SELECTED/FILLED guards can run.
 if (phase === 'BINDING_PENDING') {
  if ((input.textContent||'').length!==0 || [...input.children].some(e=>e.tagName!=='BR'||e.attributes.length||e.textContent)) return 'COMPOSER_DRAFT_PRESENT';
  const container=input.closest('.engage-bar-container');
  if (!container || container.querySelectorAll('p.content-input').length!==1 || container.querySelectorAll('.engage-bar.active').length>1 || container.querySelectorAll('.reply-content').length>1) return 'COMPOSER_AMBIGUOUS';
  return 'PENDING_EMPTY';
 }
 if (phase !== 'DEFAULT') {
  if (phase !== 'SELECTED' && phase !== 'FILLED') return 'COMPOSER_UNRECOGNIZED';
  const container=input.closest('.engage-bar-container');
  if (!container || container.querySelectorAll('p.content-input').length!==1) return 'COMPOSER_AMBIGUOUS';
  const bars=[...container.querySelectorAll('.engage-bar.active')];
  const headers=[...container.querySelectorAll('.reply-content')];
  if (bars.length>1 || headers.length>1) return 'COMPOSER_AMBIGUOUS';
  if (bars.length!==1 || !visible(bars[0])) return 'COMPOSER_BAR_INACTIVE';
  if (headers.length!==1 || !visible(headers[0])) return 'COMPOSER_HEADER_MISSING';
  if (document.activeElement!==input) return 'COMPOSER_EDITOR_UNFOCUSED';
  if ([...edit.querySelectorAll('.not-active.inner-when-not-active')].some(visible)) return 'COMPOSER_PLACEHOLDER_ACTIVE';
  if (phase==='SELECTED' && ((input.textContent||'').length!==0 || [...input.children].some(e=>e.tagName!=='BR'||e.attributes.length||e.textContent))) return 'COMPOSER_DRAFT_PRESENT';
  if (phase==='FILLED' && input.textContent!==content) return 'CONTENT_CHANGED';
  return 'ACTIVE_MATCH';
 }
 // Do not silently discard whitespace/zero-width drafts. Only truly zero text
 // (or an empty BR inserted by contenteditable) may pass.
 if ((input.textContent || '').length !== 0 || [...input.children].some(e => e.tagName !== 'BR' || e.attributes.length || e.textContent)) return 'COMPOSER_DRAFT_PRESENT';
 if (document.activeElement === input || input.contains(document.activeElement)) return 'COMPOSER_ACTIVE';
 // Any explicit target/reply marker is evidence of a bound or unfamiliar editor.
 // No values, private text or IDs are returned by this diagnostic.
 const nodes = [box, edit, input, ...edit.querySelectorAll('*')];
 if (nodes.some(e => [...e.attributes].some(a => /(?:target|reply|comment-id|recipient)/i.test(a.name)) || /(?:reply|target)/i.test(e.className || ''))) return 'COMPOSER_TARGET_BOUND';
 const markers = [...edit.querySelectorAll('.not-active.inner-when-not-active')];
 if (markers.length !== 1 || !visible(markers[0]) || markers[0].textContent.trim() !== '说点什么...') return 'COMPOSER_NOT_DEFAULT';
 if ([...edit.children].some(e => e !== input && e !== markers[0])) return 'COMPOSER_UNRECOGNIZED';
 return 'DEFAULT_EMPTY';
}`

// Public page index.a9f61821.js: onReplyClick emits e.comment; the note
// store retains it as commentTarget; submitComment uses commentTarget.id.
// Read only the reviewed store shape. Missing state never means empty. The
// caller additionally verifies the exact comment in noteDetailMap and the DOM.
const exactReplyBindingGuard = `(postId,targetId,authorId,senderId) => {
 const unwrap=v=>v&&v.value!==undefined?v.value:v&&v._rawValue!==undefined?v._rawValue:v;
 if (document.querySelector('.access-wrapper,.error-wrapper,.not-found-wrapper,.blocked-wrapper')) return 'BINDING_PLATFORM_BLOCKED';
 if (window.location.origin!=='https://www.xiaohongshu.com' || window.location.pathname!=='/explore/'+postId) return 'BINDING_POST_MISMATCH';
 const state=window.__INITIAL_STATE__,note=state?.note,user=unwrap(state?.user?.userInfo);
 if (!state||!note) return 'BINDING_STATE_MISSING';
 if (!user||user.guest||!(user.userId||user.user_id)) return 'BINDING_USER_MISSING';
 if ((user.userId||user.user_id)!==senderId) return 'BINDING_ACCOUNT_MISMATCH';
 const map=unwrap(note?.noteDetailMap);
 if (map?.[postId]?.note?.noteId!==postId) return 'BINDING_POST_MISMATCH';
 if (!note || !Object.prototype.hasOwnProperty.call(note,'commentTarget')) return 'BINDING_STATE_MISSING';
 const target=unwrap(note.commentTarget);
 if (!target || typeof target!=='object' || Array.isArray(target)) return 'BINDING_INVALID';
 if (Object.keys(target).length===0) return 'EMPTY';
 if (typeof target.id!=='string') return 'BINDING_INVALID';
 if (target.id!==targetId) return 'BINDING_TARGET_MISMATCH';
 if (target.userInfo?.userId!==authorId) return 'BINDING_AUTHOR_MISMATCH';
 if (target.noteId!==undefined && target.noteId!==postId) return 'BINDING_POST_MISMATCH';
 return 'MATCH';
}`

// Uses the exact send page. Missing identity is never "clear to send".
func (d *ExactReplyDriver) restrictions(ctx context.Context, c exactreply.Command) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	v, err := d.page.Context(ctx).Eval(restrictionInspectionDOM, c.PostID, c.SenderID, c.Reference.Token)
	if err != nil {
		return errors.New("RESTRICTION_UNVERIFIED")
	}
	if len(v.Value.Str()) > 16000 {
		return errors.New("RESTRICTION_UNVERIFIED")
	}
	var dom restrictionDOM
	if json.Unmarshal([]byte(v.Value.Str()), &dom) != nil {
		return errors.New("RESTRICTION_UNVERIFIED")
	}
	o := exactreply.RestrictionObservation{Identity: dom.Identity, Title: dom.Title, Path: dom.Path, Warnings: dom.Warnings}
	t := exactreply.RestrictionTarget{SenderID: c.SenderID, PostID: c.PostID, Reference: c.Reference}
	// Never attribute another account's notice to the sender.
	if dom.Identity != "MATCH" {
		o.Warnings = nil
	}
	journalErr := exactreply.RecordRestriction(ctx, o, t)
	if dom.Identity != "MATCH" {
		return errors.New("RESTRICTION_UNVERIFIED")
	}
	for _, w := range dom.Warnings {
		switch w.Code {
		case "BANNED", "MUTED":
			return exactreply.RiskError("BANNED")
		case "VERIFICATION":
			return exactreply.RiskError("VERIFICATION")
		case "RATE_LIMITED":
			return exactreply.RiskError("RATE_LIMITED")
		default:
			return exactreply.RiskError("PLATFORM_REFUSED")
		}
	}
	if journalErr != nil {
		return journalErr
	}
	// Absence of a known notice is an observation only; deployment still requires
	// independently reviewed send permission and platform response mapping.
	return nil
}
func (d *ExactReplyDriver) FinalRestriction(ctx context.Context, c exactreply.Command) error {
	if !d.opened {
		return nil
	}
	return d.restrictions(ctx, c)
}

// Runs on the exact owned send page before target navigation/editor access. It
// detects restrictions, never supplies the missing positive send qualification.
func (d *ExactReplyDriver) profileRestrictions(ctx context.Context, c exactreply.Command) error {
	inspector := NewRestrictionInspectionDriver(d.page, func() {})
	inspector.textOnly = true
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = inspector.Close(closeCtx)
	}()
	o, err := inspector.Inspect(ctx, exactreply.RestrictionTarget{Protocol: exactreply.ProfileRestrictionProtocol, AccountID: c.AccountID, SenderID: c.SenderID})
	if err != nil {
		return err
	}
	return profileSendBlock(o)
}
func profileSendBlock(o exactreply.RestrictionObservation) error {
	if o.Identity != "MATCH" {
		return errors.New("RESTRICTION_UNVERIFIED")
	}
	for _, w := range o.Warnings {
		switch w.Code {
		case "BANNED", "MUTED":
			return exactreply.RiskError("BANNED")
		case "VERIFICATION", "SESSION_LIMIT":
			return exactreply.RiskError("VERIFICATION")
		case "RATE_LIMITED":
			return exactreply.RiskError("RATE_LIMITED")
		default:
			return exactreply.RiskError("PLATFORM_REFUSED")
		}
	}
	if o.Path != "/user/profile/[SENDER]" || len(o.Navigation) != 2 || o.Navigation[0].Path != "/explore" || o.Navigation[0].Identity != "MATCH" || o.Navigation[1].Path != o.Path || o.Navigation[1].Identity != "MATCH" {
		return errors.New("PROFILE_ENTRY_UNAVAILABLE")
	}
	return nil
}

// One physical click at the verified point; no jitter, JS click, focus forcing,
// retry or alternate selector. Hover/layout/virtual-list changes are rechecked
// before mouse down. A successful dispatch is not a binding or delivery proof.
func (d *ExactReplyDriver) clickExactReply(ctx context.Context, c exactreply.Command, button *rod.Element) error {
	p := d.page.Context(ctx)
	top, err := p.Eval(`() => window === window.top`)
	if err != nil || !top.Value.Bool() {
		return errors.New("REPLY_FRAME_UNSUPPORTED")
	}
	point, err := button.WaitInteractable()
	if err != nil {
		return errors.New("REPLY_POINT_UNAVAILABLE")
	}
	check := func() error {
		v, e := button.Eval(exactReplyPointGuard, c.TargetID, point.X, point.Y)
		if e != nil {
			return errors.New("REPLY_POINT_UNAVAILABLE")
		}
		if v.Value.Str() != "EXACT" {
			return errors.New(v.Value.Str())
		}
		return nil
	}
	if err = check(); err != nil {
		return err
	}
	if err = p.Mouse.MoveTo(*point); err != nil {
		return errors.New("REPLY_POINTER_MOVE_FAILED")
	}
	if err = button.WaitEnabled(); err != nil {
		return errors.New("REPLY_BUTTON_DISABLED")
	}
	if err = d.restrictions(ctx, c); err != nil {
		return err
	}
	if err = d.binding(ctx, c, "EMPTY"); err != nil {
		return err
	}
	if err = d.composer(ctx, c, "DEFAULT"); err != nil {
		return err
	}
	if err = check(); err != nil {
		return err
	}
	if err = exactreply.RecordStage(ctx, "SELECT_POINT_VERIFIED", nil, nil); err != nil {
		return err
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	observer, e := button.Evaluate(rod.Eval(exactReplyClickObserver, c.TargetID).ByObject())
	if e != nil {
		return errors.New("REPLY_EVENT_OBSERVER_UNAVAILABLE")
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		defer cancel()
		page := d.page.Context(cleanup)
		_, _ = page.Evaluate(rod.Eval(`() => this.stop()`).This(observer))
		_ = (proto.RuntimeReleaseObject{ObjectID: observer.ObjectID}).Call(page)
	}()
	// Observer setup cannot exempt the final point check or create another click.
	if err = check(); err != nil {
		return err
	}
	if err = ctx.Err(); err != nil {
		return err
	}
	clickErr := p.Mouse.Click(proto.InputMouseButtonLeft, 1)
	event, e := p.Evaluate(rod.Eval(`() => this.read()`).This(observer))
	stage := "SELECT_EVENT_UNAVAILABLE"
	if e == nil {
		switch event.Value.Str() {
		case "EXACT":
			stage = "SELECT_EVENT_EXACT"
		case "NONE":
			stage = "SELECT_EVENT_NONE"
		case "OTHER":
			stage = "SELECT_EVENT_OTHER"
		case "MULTIPLE":
			stage = "SELECT_EVENT_MULTIPLE"
		}
	}
	if err = exactreply.RecordStage(ctx, stage, nil, nil); err != nil {
		return err
	}
	if clickErr != nil {
		return errors.New("REPLY_CLICK_DISPATCH_UNCERTAIN")
	}
	if stage != "SELECT_EVENT_EXACT" {
		return errors.New("REPLY_CLICK_EVENT_UNVERIFIED")
	}
	return nil
}

const exactReplyPointGuard = `(targetId,x,y) => {
 if(window!==window.top || this.ownerDocument!==document) return 'REPLY_FRAME_UNSUPPORTED';
 if(!this.isConnected || this.closest('.comment-item')?.id!=='comment-'+targetId) return 'BUTTON_TARGET_MISMATCH';
 const targets=[...document.querySelectorAll('#comment-'+targetId)];
 if(targets.length!==1) return 'EXACT_TARGET_MISSING';
 const buttons=[...targets[0].querySelectorAll('.right .interactions .reply')].filter(e=>e.closest('.comment-item')===targets[0]);
 if(buttons.length!==1 || buttons[0]!==this) return 'REPLY_BUTTON_AMBIGUOUS';
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=innerWidth||y>=innerHeight) return 'REPLY_POINT_OFFSCREEN';
 if(![...this.getClientRects()].some(r=>x>=r.left&&x<r.right&&y>=r.top&&y<r.bottom)) return 'REPLY_POINT_MOVED';
 let opacity=1;
 for(let e=this;e;e=e.parentElement){const s=getComputedStyle(e);opacity*=Number(s.opacity);if(s.visibility!=='visible'||s.display==='none'||s.pointerEvents==='none'||!Number.isFinite(opacity)||opacity<0.1)return 'REPLY_POINT_HIDDEN';}
 const hit=document.elementFromPoint(x,y);
 if(!hit || (hit!==this&&!this.contains(hit))) return 'REPLY_POINT_COVERED';
 if(hit.closest('.comment-item')!==targets[0]) return 'BUTTON_TARGET_MISMATCH';
 if(this.disabled||this.getAttribute('aria-disabled')==='true') return 'REPLY_BUTTON_DISABLED';
 return 'EXACT';
}`

func (d *ExactReplyDriver) selection(ctx context.Context, c exactreply.Command) (exactreply.SelectionEvidence, error) {
	var s exactreply.SelectionEvidence
	v, err := d.page.Context(ctx).Eval(exactReplySelectionObservation, c.TargetID, c.RecipientID)
	if err != nil || len(v.Value.Str()) > 2048 {
		return s, errors.New("SELECTION_OBSERVATION_UNAVAILABLE")
	}
	if json.Unmarshal([]byte(v.Value.Str()), &s) != nil || !s.Valid() {
		return s, errors.New("SELECTION_OBSERVATION_INVALID")
	}
	return s, nil
}
func (d *ExactReplyDriver) recordSelection(ctx context.Context, c exactreply.Command, stage string) error {
	s, err := d.selection(ctx, c)
	if err != nil {
		return err
	}
	return exactreply.RecordSelection(ctx, stage, s)
}

// Observes one already located target. No clicking, scrolling, focus, state writes,
// listener registration or invocation. Component/handler hints do NOT prove hydration
// or event delivery. Unknown page versions stay diagnostic and cannot authorize input.
const exactReplySelectionObservation = `(targetId,authorId) => {
 const nodes=[...document.querySelectorAll('#comment-'+targetId)];
 const o={frame:window===window.top?'TOP':'SUBFRAME',target:nodes.length===0?'MISSING':nodes.length===1?'UNIQUE':'AMBIGUOUS',depth:'UNKNOWN',button:'MISSING',centerHit:'UNAVAILABLE',component:'ABSENT',handler:'ABSENT',bindingShape:'MISSING',binding:'INVALID',editor:'ABSENT',replyUI:'INACTIVE',focused:false};
 if(nodes.length===1){
  const target=nodes[0];o.depth=target.parentElement?.closest('.comment-item')?'REPLY':'ROOT';
  const buttons=[...target.querySelectorAll('.right .interactions .reply')].filter(e=>e.closest('.comment-item')===target);
  o.button=buttons.length===0?'MISSING':buttons.length===1?'EXACT':'AMBIGUOUS';
  if(buttons.length===1){
   const b=buttons[0],r=b.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
   if(r.width>0&&r.height>0){if(x<0||y<0||x>=innerWidth||y>=innerHeight)o.centerHit='OFFSCREEN';else{const hit=document.elementFromPoint(x,y);o.centerHit=hit&&(hit===b||b.contains(hit))?'EXACT':'COVERED';}}
   o.handler=typeof b.__vnode?.props?.onClick==='function'?'PRESENT':'ABSENT';
   let c=b.__vueParentComponent;
   for(let i=0;c&&i<16;i++,c=c.parent){const comment=c.props?.comment;if(comment&&typeof comment==='object'&&typeof comment.id==='string'){o.component=comment.id===targetId&&comment.userInfo?.userId===authorId?'MATCH':'MISMATCH';break;}}
  }
 }
 const raw=window.__INITIAL_STATE__?.note?.commentTarget;
 o.bindingShape=raw==null?'MISSING':typeof raw!=='object'||Array.isArray(raw)?'INVALID':raw.value!==undefined?'VALUE_REF':raw._rawValue!==undefined?'RAW_VALUE_REF':Object.prototype.hasOwnProperty.call(raw,'_value')?'UNSUPPORTED_REF':'PLAIN';
 const bound=raw&&raw.value!==undefined?raw.value:raw&&raw._rawValue!==undefined?raw._rawValue:raw;
 if(bound&&typeof bound==='object'&&!Array.isArray(bound)){o.binding=Object.keys(bound).length===0?'EMPTY':typeof bound.id!=='string'?'INVALID':bound.id===targetId&&bound.userInfo?.userId===authorId?'MATCH':'MISMATCH';}
 const inputs=[...document.querySelectorAll('div.input-box p.content-input')];
 o.editor=inputs.length===0?'ABSENT':inputs.length!==1?'AMBIGUOUS':inputs[0].textContent.length===0?'EMPTY':'DRAFT';
 if(inputs.length===1){const input=inputs[0],container=input.closest('.engage-bar-container');o.focused=document.activeElement===input;const bars=container?.querySelectorAll('.engage-bar.active')??[],headers=container?.querySelectorAll('.reply-content')??[];o.replyUI=bars.length>1||headers.length>1?'AMBIGUOUS':bars.length===1&&headers.length===1?'ACTIVE':'INACTIVE';}
 return JSON.stringify(o);
}`

// Passive observer of the ONE already authorized physical reply click. Never
// invokes/cancels/retargets an event or changes application state. Object stays in
// the owned CDP context and is removed/released immediately after the click.
// EXACT proves trusted event delivery to this element, not handler success.
const exactReplyClickObserver = `(targetId) => {
 const button=this;let count=0,exact=false;
 const listener=e=>{count++;exact=count===1&&e.isTrusted&&e.composedPath().includes(button)&&e.target?.closest('.comment-item')?.id==='comment-'+targetId;};
 window.addEventListener('click',listener,{capture:true,passive:true});
 return {read:()=>count===0?'NONE':count>1?'MULTIPLE':exact?'EXACT':'OTHER',stop:()=>window.removeEventListener('click',listener,true)};
}`
