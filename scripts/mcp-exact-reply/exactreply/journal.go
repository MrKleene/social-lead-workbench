package exactreply

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const JournalProtocol = "workbench.reply-stage-journal.v1"

type JournalRecord struct {
	Sequence  int                  `json:"sequence"`
	AttemptID string               `json:"attemptId"`
	Stage     string               `json:"stage"`
	At        string               `json:"at"`
	Attempted *bool                `json:"attempted,omitempty"`
	Stopped   *bool                `json:"stopped,omitempty"`
	Evidence  *RestrictionEvidence `json:"evidence,omitempty"`
	Receipt   *ReceiptEvidence     `json:"receipt,omitempty"`
}
type Journal struct {
	mu       sync.Mutex
	file     *os.File
	attempt  string
	sequence int
	broken   bool
}
type journalKey struct{}

func WithJournal(ctx context.Context, j *Journal) context.Context {
	return context.WithValue(ctx, journalKey{}, j)
}
func OpenJournal(directory, attempt string) (*Journal, error) {
	if !uuid.MatchString(attempt) || !filepath.IsAbs(directory) {
		return nil, errors.New("JOURNAL_UNAVAILABLE")
	}
	real, err := filepath.EvalSymlinks(directory)
	if err != nil || real != directory {
		return nil, errors.New("JOURNAL_UNAVAILABLE")
	}
	st, err := os.Stat(directory)
	if err != nil || !st.IsDir() || st.Mode().Perm()&0077 != 0 {
		return nil, errors.New("JOURNAL_UNAVAILABLE")
	}
	// Exclusive creation: no overwrite, symlink following, reuse or replay.
	f, err := os.OpenFile(filepath.Join(directory, "reply-stage-"+attempt+".jsonl"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return nil, errors.New("JOURNAL_UNAVAILABLE")
	}
	d, err := os.Open(directory)
	if err == nil {
		err = d.Sync()
		d.Close()
	}
	if err != nil {
		f.Close()
		return nil, errors.New("JOURNAL_UNAVAILABLE")
	}
	return &Journal{file: f, attempt: attempt}, nil
}
func (j *Journal) Close() error { return j.file.Close() }
func validJournalStage(s string) bool {
	switch s {
	case "RECEIPT_CAPTURE", "NAVIGATION_INTENT", "NAVIGATED", "TARGET_LOCATED", "SELECT_INTENT", "REPLY_SELECTED", "INPUT_INTENT", "INPUT_FINISHED", "CANCELLED", "RESTRICTION_CHECK", "BEFORE_CLOSE", "STARTED", "INSPECTED", "SELECTED", "RECHECKED", "BEFORE_SUBMIT", "ATTEMPTED", "AFTER_SUBMIT", "SUBMIT_FINISHED", "READBACK", "DRIVER_CLOSED":
		return true
	}
	return false
}
func (j *Journal) append(stage string, attempted, stopped *bool) error {
	return j.appendEvidence(stage, attempted, stopped, nil)
}
func (j *Journal) appendEvidence(stage string, attempted, stopped *bool, evidence *RestrictionEvidence) error {
	return j.appendRecord(stage, attempted, stopped, evidence, nil)
}
func (j *Journal) appendRecord(stage string, attempted, stopped *bool, evidence *RestrictionEvidence, receipt *ReceiptEvidence) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.broken || j.sequence >= 64 || !validJournalStage(stage) {
		return errors.New("JOURNAL_UNAVAILABLE")
	}
	b, err := json.Marshal(JournalRecord{j.sequence + 1, j.attempt, stage, time.Now().UTC().Format(time.RFC3339Nano), attempted, stopped, evidence, receipt})
	if err == nil {
		var n int
		b = append(b, '\n')
		n, err = j.file.Write(b)
		if err == nil && n != len(b) {
			err = errors.New("SHORT_WRITE")
		}
	}
	if err == nil {
		err = j.file.Sync()
	}
	if err != nil {
		j.broken = true
		return errors.New("JOURNAL_UNAVAILABLE")
	}
	j.sequence++
	return nil
}

// Synthetic engines may omit a journal; the production tool must open one before
// creating a browser. No raw command, token, body, URL, IDs or error text is written.
func RecordStage(ctx context.Context, stage string, attempted, stopped *bool) error {
	if j, ok := ctx.Value(journalKey{}).(*Journal); ok {
		return j.append(stage, attempted, stopped)
	}
	return nil
}

// Intent is durable BEFORE invoking the click. ATTEMPTED means 0-or-1 after a
// crash, never proof of actual click/delivery. A journal failure prevents the click.
func SubmitOnce(ctx context.Context, click func() error) (attempted bool, err error) {
	if err = ctx.Err(); err != nil {
		return
	}
	if err = RecordStage(ctx, "BEFORE_SUBMIT", nil, nil); err != nil {
		return
	}
	if err = ctx.Err(); err != nil {
		return
	}
	if err = RecordStage(ctx, "ATTEMPTED", nil, nil); err != nil {
		return
	}
	if err = ctx.Err(); err != nil {
		return
	}
	attempted = true
	err = click()
	if err != nil {
		return
	}
	err = RecordStage(ctx, "AFTER_SUBMIT", nil, nil)
	return
}

// Restriction evidence is a bounded safe projection from this exact owned page.
// Screenshots and raw diagnostics never enter the journal.
type RestrictionEvidence struct {
	Identity        string               `json:"identity"`
	Title           string               `json:"title"`
	Path            string               `json:"pathname"`
	Warnings        []RestrictionWarning `json:"warnings"`
	ScreenshotState string               `json:"screenshotState"`
}

func RecordRestriction(ctx context.Context, o RestrictionObservation, t RestrictionTarget) error {
	o = SafeRestrictionObservation(o, t)
	e := &RestrictionEvidence{o.Identity, o.Title, o.Path, o.Warnings, "NOT_CAPTURED"}
	if j, ok := ctx.Value(journalKey{}).(*Journal); ok {
		return j.appendEvidence("RESTRICTION_CHECK", nil, nil, e)
	}
	return nil
}

func RecordReceipt(ctx context.Context, evidence ReceiptEvidence) error {
	j, ok := ctx.Value(journalKey{}).(*Journal)
	if !ok {
		return errors.New("JOURNAL_UNAVAILABLE")
	}
	return j.appendRecord("RECEIPT_CAPTURE", nil, nil, nil, &evidence)
}
