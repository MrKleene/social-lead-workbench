package exactreply

import (
	"context"
	"time"
)

const DMEntryProtocol = "workbench.xhs.dm-entry-inspection.v1"

type DMEntryTarget struct {
	Protocol  string `json:"protocol"`
	AccountID string `json:"accountId"`
	SenderID  string `json:"senderId"`
}

func (t DMEntryTarget) Valid() bool {
	return t.Protocol == DMEntryProtocol && opaque.MatchString(t.AccountID) && id.MatchString(t.SenderID)
}

type DMEntryLink struct {
	Label    string `json:"label"`
	Tag      string `json:"tag"`
	Path     string `json:"path"`
	Disabled bool   `json:"disabled"`
}
type DMEntryObservation struct {
	Identity       string        `json:"identity"`
	Route          string        `json:"route"`
	LoginChallenge bool          `json:"loginChallenge"`
	Risk           bool          `json:"risk"`
	Entries        []DMEntryLink `json:"entries"`
}
type DMEntryResult struct {
	Protocol           string             `json:"protocol"`
	Code               string             `json:"code"`
	ObservedAt         string             `json:"observedAt"`
	Observation        DMEntryObservation `json:"observation"`
	Stopped            bool               `json:"stopped"`
	Submissions        int                `json:"submissions"`
	ConversationOpened bool               `json:"conversationOpened"`
}
type DMEntryInspector interface {
	Inspect(context.Context, DMEntryTarget) (DMEntryObservation, error)
	Close(context.Context) error
}

func InspectDMEntry(ctx context.Context, t DMEntryTarget, factory func() (DMEntryInspector, error)) (r DMEntryResult) {
	r = DMEntryResult{Protocol: DMEntryProtocol, Code: "INVALID_TARGET", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), Stopped: true}
	if !t.Valid() || ctx.Err() != nil {
		return
	}
	r.Stopped = false
	d, err := factory()
	if err != nil {
		r.Code = "OPEN_FAILED"
		return
	}
	defer func() {
		stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		r.Stopped = d.Close(stop) == nil
		if !r.Stopped {
			r.Code = "STOP_UNCONFIRMED"
		}
	}()
	o, err := d.Inspect(ctx, t)
	if err != nil {
		r.Code = "INSPECTION_FAILED"
		return
	}
	r.Observation = o
	switch {
	case o.Identity != "MATCH":
		r.Code = "IDENTITY_UNVERIFIED"
		r.Observation.Entries = nil
	case o.LoginChallenge || o.Risk:
		r.Code = "PLATFORM_BLOCKED"
		r.Observation.Entries = nil
	case o.Route != "/explore":
		r.Code = "ROUTE_CHANGED"
		r.Observation.Entries = nil
	case len(o.Entries) == 0:
		r.Code = "NO_VISIBLE_ENTRY"
	default:
		r.Code = "ENTRY_OBSERVED_NOT_SEND_READY"
	}
	return
}
