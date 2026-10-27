package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
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
	if !d.opened || reload {
		if err := p.Navigate(exactURL(c)); err != nil {
			return exactState{}, err
		}
		d.opened = true
		if err := p.WaitLoad(); err != nil {
			return exactState{}, err
		}
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
	return result, nil
}
func (d *ExactReplyDriver) Select(ctx context.Context, c exactreply.Command) error {
	p := d.page.Context(ctx)
	// A preexisting composer may point at another comment; never adopt it.
	exists, _, err := p.Has("div.input-box p.content-input")
	if err != nil {
		return err
	}
	if exists {
		return errors.New("COMPOSER_ALREADY_OPEN")
	}
	targets, err := p.Elements("#comment-" + c.TargetID)
	if err != nil || len(targets) != 1 {
		return errors.New("EXACT_TARGET_MISSING")
	}
	authors, err := targets[0].Elements(`[data-user-id="` + c.RecipientID + `"]`)
	if err != nil || len(authors) != 1 {
		return errors.New("AUTHOR_MISMATCH")
	}
	buttons, err := targets[0].Elements(".right .interactions .reply")
	if err != nil || len(buttons) != 1 {
		return errors.New("REPLY_BUTTON_AMBIGUOUS")
	}
	// Check closest comment ancestor so a nested reply's button cannot be selected.
	hit, err := buttons[0].Eval(`() => this.closest('.comment-item')?.id || ''`)
	if err != nil || hit.Value.Str() != "comment-"+c.TargetID {
		return errors.New("BUTTON_TARGET_MISMATCH")
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err = humanize.Click(buttons[0]); err != nil {
		return err
	}
	input, err := p.Element("div.input-box p.content-input")
	if err != nil {
		return err
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if err = humanize.Type(ctx, input, c.Content); err != nil {
		return err
	}
	text, err := input.Text()
	if err != nil || text != c.Content {
		return errors.New("CONTENT_CHANGED")
	}
	d.selected = true
	return nil
}
func (d *ExactReplyDriver) Submit(ctx context.Context, c exactreply.Command) (exactreply.Submission, error) {
	s := exactreply.Submission{}
	if !d.selected || ctx.Err() != nil {
		return s, ctx.Err()
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
	buttons, err := p.Elements("div.bottom button.submit")
	if err != nil || len(buttons) != 1 {
		return s, errors.New("SUBMIT_AMBIGUOUS")
	}
	if ctx.Err() != nil {
		return s, ctx.Err()
	}
	// The click is never retried, including when its acknowledgement is lost.
	s.Attempted = true
	if err = humanize.Click(buttons[0]); err != nil {
		return s, err
	}
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
	s.Accepted = matches == 1
	// No reviewed submission-response schema exists in this source. A fresh matching
	// comment is only a candidate: it cannot prove this request created it. Do NOT
	// invent an endpoint/response or populate Response from the readback itself.
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
