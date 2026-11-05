package xiaohongshu

import (
	"context"
	"github.com/go-rod/rod"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
)

// A non-embedding wrapper deliberately exposes only verification and close.
// Both the normal sender and this verifier use exactReplyPage.readback.
type ExactReplyVerifier struct{ page *exactReplyPage }

func NewExactReplyVerifier(p *rod.Page, closeBrowser func()) *ExactReplyVerifier {
	return &ExactReplyVerifier{page: &exactReplyPage{page: p, closeBrowser: closeBrowser}}
}
func (d *ExactReplyVerifier) Verify(ctx context.Context, t exactreply.VerifyTarget) (exactreply.VerifyObservation, error) {
	o, e := d.page.readback(ctx, t.Command(), t.ReplyID)
	return exactreply.VerifyObservation{Reply: o, Counts: d.page.readbackCounts}, e
}
func (d *ExactReplyVerifier) Close(ctx context.Context) error { return d.page.Close(ctx) }
