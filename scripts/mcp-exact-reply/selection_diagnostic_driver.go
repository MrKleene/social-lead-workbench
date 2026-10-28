package xiaohongshu

import (
	"context"
	"github.com/go-rod/rod"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
)

// Holds only the shared selection page. It cannot invoke the send driver's input,
// Submit or Readback methods. No body parameter exists on its public surface.
type SelectionDiagnosticDriver struct{ selection *exactReplyPage }

func NewSelectionDiagnosticDriver(p *rod.Page, closeBrowser func()) *SelectionDiagnosticDriver {
	return &SelectionDiagnosticDriver{selection: &exactReplyPage{page: p, closeBrowser: closeBrowser}}
}

var _ exactreply.SelectionInspector = (*SelectionDiagnosticDriver)(nil)

func (d *SelectionDiagnosticDriver) Inspect(ctx context.Context, t exactreply.SelectionTarget) (exactreply.Snapshot, error) {
	return d.selection.Inspect(ctx, t.Command())
}
func (d *SelectionDiagnosticDriver) OpenOnce(ctx context.Context, t exactreply.SelectionTarget) error {
	return d.selection.openReply(ctx, t.Command())
}
func (d *SelectionDiagnosticDriver) Trace() exactreply.SelectionTrace { return d.selection.trace }
func (d *SelectionDiagnosticDriver) Close(ctx context.Context) error  { return d.selection.Close(ctx) }
