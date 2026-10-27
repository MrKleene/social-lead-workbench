package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
)

// A new named type, NOT an embedded send driver: callers see only Inspect/Close.
type ExactPreflightDriver struct{ read *ExactReplyDriver }

func NewExactPreflightDriver(p *rod.Page, closeBrowser func()) *ExactPreflightDriver {
	return &ExactPreflightDriver{read: NewExactReplyDriver(p, closeBrowser)}
}

var _ exactreply.ReadOnlyInspector = (*ExactPreflightDriver)(nil)

// Pure DOM reads; no click, focus, input, event dispatch, fetch, state setter or scroll.
const exactPreflightDOM = `(target,author) => {
 const nodes=Array.from(document.querySelectorAll('#comment-'+target));
 const cardinality=n=>n===0?'MISSING':n===1?'UNIQUE':'AMBIGUOUS';
 const result={target:cardinality(nodes.length),author:'MISSING',replyButton:'MISSING',composer:'ABSENT'};
 if(nodes.length===1){
  const node=nodes[0];
  const authors=Array.from(node.querySelectorAll('[data-user-id]')).filter(x=>x.closest('.comment-item')===node);
  result.author=authors.length===0?'MISSING':authors.length!==1?'AMBIGUOUS':authors[0].getAttribute('data-user-id')===author?'MATCH':'MISMATCH';
  const buttons=Array.from(node.querySelectorAll('.right .interactions .reply')).filter(x=>x.closest('.comment-item')===node);
  result.replyButton=buttons.length===0?'MISSING':buttons.length!==1?'AMBIGUOUS':buttons[0].closest('.comment-item')?.id==='comment-'+target?'EXACT':'MISMATCH';
 }
 const inputs=Array.from(document.querySelectorAll('div.input-box p.content-input'));
 result.composer=inputs.length===0?'ABSENT':inputs.length!==1?'AMBIGUOUS':inputs[0].textContent?.trim()?'NONEMPTY':'EMPTY';
 return JSON.stringify(result);
}`

func (d *ExactPreflightDriver) Inspect(ctx context.Context, t exactreply.PreflightTarget) (o exactreply.PreflightObservation, err error) {
	c := exactreply.Command{AccountID: t.AccountID, SenderID: t.SenderID, PostID: t.PostID, TargetID: t.TargetID, RecipientID: t.RecipientID, Reference: t.Reference}
	// One navigation by the existing reader, then bounded state-only samples. No reload.
	o, err = exactreply.WaitForReadOnlyState(ctx, t, func() (sample exactreply.PreflightObservation, inspectErr error) {
		sample.Snapshot, inspectErr = d.read.Inspect(ctx, c)
		sample.Sources = exactreply.FieldSources{Identity: "INITIAL_STATE_USER_INFO", Target: "INITIAL_STATE_NOTE_COMMENTS", DOM: "UNOBSERVED"}
		if ctx.Err() != nil {
			return sample, ctx.Err()
		}
		v, e := d.read.page.Context(ctx).Eval(exactPreflightPage, t.PostID, t.Reference.Token, t.Reference.Source)
		if e != nil {
			if inspectErr != nil {
				return sample, inspectErr
			}
			return sample, e
		}
		raw := v.Value.Str()
		if len(raw) > 2048 || json.Unmarshal([]byte(raw), &sample.Page) != nil {
			if inspectErr != nil {
				return sample, inspectErr
			}
			return sample, errors.New("STATE_INVALID")
		}
		return
	}, exactreply.ReadOnlySettle)
	if err != nil {
		return
	}
	if ctx.Err() != nil {
		return o, ctx.Err()
	}
	v, e := d.read.page.Context(ctx).Eval(exactPreflightDOM, t.TargetID, t.RecipientID)
	if e != nil {
		return o, e
	}
	raw := v.Value.Str()
	if len(raw) > 1024 {
		return o, errors.New("STATE_INVALID")
	}
	if e = json.Unmarshal([]byte(raw), &o.DOM); e != nil {
		return o, errors.New("STATE_INVALID")
	}
	o.Sources.DOM = "EXACT_COMMENT_ID_AND_SCOPED_DESCENDANTS"
	return
}
func (d *ExactPreflightDriver) Close(ctx context.Context) error { return d.read.Close(ctx) }
