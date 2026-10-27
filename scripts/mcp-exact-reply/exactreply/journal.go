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
	Sequence  int    `json:"sequence"`
	AttemptID string `json:"attemptId"`
	Stage     string `json:"stage"`
	At        string `json:"at"`
	Attempted *bool  `json:"attempted,omitempty"`
	Stopped   *bool  `json:"stopped,omitempty"`
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
	case "STARTED", "INSPECTED", "SELECTED", "RECHECKED", "BEFORE_SUBMIT", "ATTEMPTED", "AFTER_SUBMIT", "SUBMIT_FINISHED", "READBACK", "DRIVER_CLOSED":
		return true
	}
	return false
}
func (j *Journal) append(stage string, attempted, stopped *bool) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.broken || j.sequence >= 24 || !validJournalStage(stage) {
		return errors.New("JOURNAL_UNAVAILABLE")
	}
	b, err := json.Marshal(JournalRecord{j.sequence + 1, j.attempt, stage, time.Now().UTC().Format(time.RFC3339Nano), attempted, stopped})
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
