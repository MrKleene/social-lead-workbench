package exactreply

import (
	"context"
	"sync"
	"time"
)

const DMConversationProtocol = "workbench.xhs.dm-conversation-inspection.v1"

type DMConversationTarget struct {
	Protocol       string `json:"protocol"`
	InspectionID   string `json:"inspectionId"`
	AccountID      string `json:"accountId"`
	SenderID       string `json:"senderId"`
	RecipientID    string `json:"recipientId"`
	MaxOpenings    int    `json:"maxOpenings"`
	MaxInputs      int    `json:"maxInputs"`
	MaxSubmissions int    `json:"maxSubmissions"`
}

func (t DMConversationTarget) Valid() bool {
	return t.Protocol == DMConversationProtocol && uuid.MatchString(t.InspectionID) && opaque.MatchString(t.AccountID) && id.MatchString(t.SenderID) && id.MatchString(t.RecipientID) && t.SenderID != t.RecipientID && t.MaxOpenings == 1 && t.MaxInputs == 0 && t.MaxSubmissions == 0
}

type DMConversationNode struct {
	Tag       string         `json:"tag"`
	ClassName string         `json:"className"`
	Empty     bool           `json:"empty"`
	X         int            `json:"x"`
	Y         int            `json:"y"`
	Width     int            `json:"width"`
	Height    int            `json:"height"`
	Parents   []DMIconParent `json:"parents"`
}
type DMBindingAttribute struct {
	Source string `json:"source"`
	Name   string `json:"name"`
	Match  string `json:"match"`
}
type DMConversationAction struct {
	Tag       string `json:"tag"`
	ClassName string `json:"className"`
	Label     string `json:"label"`
	Disabled  bool   `json:"disabled"`
}
type DMObservedMessage struct {
 ID string `json:"id"`
 ClassName string `json:"className"`
 Text string `json:"-"`
 ContentHash string `json:"contentSha256"`
 Failed bool `json:"failed"`
 Pending bool `json:"pending"`
}
type DMConversationObservation struct {
 Messages []DMObservedMessage `json:"messages"`

	BoundRecipient   bool                   `json:"boundRecipient"`
	ConversationKind string                 `json:"conversationKind"`
	HeaderName       string                 `json:"headerName"`
	Hints            []string               `json:"hints"`
	Actions          []DMConversationAction `json:"actions"`

	Loading           bool                 `json:"loading"`
	HeaderPresent     bool                 `json:"headerPresent"`
	BindingAttributes []DMBindingAttribute `json:"bindingAttributes"`
	ScriptResources   []string             `json:"scriptResources"`
	StateKeys         []string             `json:"stateKeys"`

	Identity       string               `json:"identity"`
	Route          string               `json:"route"`
	Risk           bool                 `json:"risk"`
	LoginChallenge bool                 `json:"loginChallenge"`
	Editors        []DMConversationNode `json:"editors"`
	TargetLinks    []DMConversationNode `json:"targetLinks"`
	Regions        []DMConversationNode `json:"regions"`
	SendButtons    int                  `json:"sendButtons"`
}
type DMConversationResult struct {
	Protocol        string                    `json:"protocol"`
	Code            string                    `json:"code"`
	ObservedAt      string                    `json:"observedAt"`
	OpenInvocations int                       `json:"openInvocations"`
	Inputs          int                       `json:"inputs"`
	Submissions     int                       `json:"submissions"`
	Stopped         bool                      `json:"stopped"`
	Observation     DMConversationObservation `json:"observation"`
}
type DMConversationInspector interface {
	Inspect(context.Context, DMConversationTarget) (DMConversationObservation, int, error)
	Close(context.Context) error
}
type DMConversationEngine struct {
	mu   sync.Mutex
	used bool
}

func (e *DMConversationEngine) Execute(ctx context.Context, t DMConversationTarget, factory func() (DMConversationInspector, error)) (r DMConversationResult) {
	r = DMConversationResult{Protocol: DMConversationProtocol, Code: "INVALID_SCOPE", ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), Stopped: true}
	if !t.Valid() || ctx.Err() != nil {
		return
	}
	e.mu.Lock()
	if e.used {
		e.mu.Unlock()
		r.Code = "ALREADY_USED"
		return
	}
	e.used = true
	e.mu.Unlock()
	d, err := factory()
	if err != nil {
		r.Code = "OPEN_FAILED"
		return
	}
	r.Stopped = false
	defer func() {
		stop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		r.Stopped = d.Close(stop) == nil
		if !r.Stopped {
			r.Code = "STOP_UNCONFIRMED"
		}
	}()
	o, n, err := d.Inspect(ctx, t)
	r.OpenInvocations = n
	r.Observation = o
	if err != nil {
		r.Code = "INSPECTION_STOPPED"
		return
	}
	switch {
	case o.Identity != "MATCH":
		r.Code = "IDENTITY_UNVERIFIED"
	case o.Risk || o.LoginChallenge:
		r.Code = "PLATFORM_BLOCKED"
	case o.Route != "CHAT" && o.Route != "PROFILE":
		r.Code = "ROUTE_CHANGED"
	case len(o.Editors) == 0:
		r.Code = "NO_EDITOR_OBSERVED"
	default:
		r.Code = "CONVERSATION_OBSERVED_NOT_SEND_READY"
	}
	return
}
