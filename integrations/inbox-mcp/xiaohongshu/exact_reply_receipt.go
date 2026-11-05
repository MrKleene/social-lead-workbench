package xiaohongshu

import (
	"context"
	"encoding/base64"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"sync"
	"time"
)

// No interception, network replay or speculative API request. Browser events are
// observed only during the one authorized click; all credentials stay in memory.
type exactReceiptCapture struct {
	mu                sync.Mutex
	active            bool
	count             int
	requestID         proto.NetworkRequestID
	endpoint          string
	request, response []byte
	status            int
	broken            bool
	done              bool
	cancel            context.CancelFunc
	waitDone          chan struct{}
}

// Same paths and tuple checks as captured-reply-reconciliation.ts, reviewed
// against the 2026-10-28 captured response plus independent fresh readback.
// This describes response evidence only: engine.Run still requires a new matching
// reply after reload and confirmed owned-process shutdown before CONFIRMED.
func reviewedExactReceiptMapping() *exactreply.ReceiptMapping {
	return &exactreply.ReceiptMapping{
		Endpoint: "https://edith.xiaohongshu.com/api/sns/web/v1/comment/post",
		PostPath: "/note_id", TargetPath: "/target_comment_id", ContentPath: "/content",
		SuccessPath: "/success", SuccessValue: true, CodePath: "/code", ReplyIDPath: "/data/comment/id",
		ResponsePostPath: "/data/comment/note_id", ResponseTargetPath: "/data/comment/target_comment/id",
		ResponseRecipientPath: "/data/comment/target_comment/user_info/user_id", ResponseSenderPath: "/data/comment/user_info/user_id", ResponseContentPath: "/data/comment/content",
	}
}
func armExactReceipt(ctx context.Context, p *rod.Page, c exactreply.Command) (cap *exactReceiptCapture, err error) {
	cap = &exactReceiptCapture{waitDone: make(chan struct{})}
	watch, cancel := context.WithCancel(ctx)
	cap.cancel = cancel
	p = p.Context(watch)
	defer func() {
		if recover() != nil {
			cancel()
			cap = nil
			err = errors.New("RECEIPT_CAPTURE_UNAVAILABLE")
		}
	}()
	buffer, resource, post := 262144, 65536, 32768
	if e := (proto.NetworkEnable{MaxTotalBufferSize: &buffer, MaxResourceBufferSize: &resource, MaxPostDataSize: &post}).Call(p); e != nil {
		cancel()
		return nil, errors.New("RECEIPT_CAPTURE_UNAVAILABLE")
	}
	wait := p.EachEvent(func(e *proto.NetworkRequestWillBeSent) { cap.onRequest(ctx, c, e) },
		func(e *proto.NetworkResponseReceived) { cap.onResponse(e) },
		func(e *proto.NetworkLoadingFailed) { cap.onFailure(e) },
		func(e *proto.NetworkLoadingFinished) {
			cap.onFinished(ctx, c, e, func(id proto.NetworkRequestID) (*proto.NetworkGetResponseBodyResult, error) {
				return (proto.NetworkGetResponseBody{RequestID: id}).Call(p)
			})
		})
	if err = exactreply.RecordReceipt(ctx, exactreply.ReceiptEvidence{State: "ARMED"}); err != nil {
		cancel()
		return nil, err
	}
	go func() {
		defer close(cap.waitDone)
		defer func() {
			if recover() != nil {
				cap.mu.Lock()
				cap.broken = true
				cap.mu.Unlock()
			}
		}()
		wait()
	}()
	return cap, nil
}
func (cap *exactReceiptCapture) activate(ctx context.Context) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	cap.mu.Lock()
	defer cap.mu.Unlock()
	if cap.broken || cap.active {
		return errors.New("RECEIPT_CAPTURE_UNAVAILABLE")
	}
	cap.active = true
	return nil
}
func (cap *exactReceiptCapture) stop() { cap.cancel(); <-cap.waitDone }
func (cap *exactReceiptCapture) result(ctx context.Context, c exactreply.Command) (*exactreply.Observation, bool, error) {
	// A bounded observation window, not a retry or a delayed second submission.
	timer := time.NewTimer(4 * time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return nil, false, ctx.Err()
	case <-timer.C:
	}
	return cap.finish(ctx, c)
}
func (cap *exactReceiptCapture) finish(ctx context.Context, c exactreply.Command) (*exactreply.Observation, bool, error) {
	cap.mu.Lock()
	defer cap.mu.Unlock()
	cap.active = false
	state := "MAPPING_UNREVIEWED"
	if reviewedExactReceiptMapping() != nil {
		state = "MAPPING_REVIEWED"
	}
	if cap.count == 0 {
		state = "REQUEST_NOT_OBSERVED"
	} else if cap.count != 1 {
		state = "AMBIGUOUS_REQUEST"
	} else if cap.broken || !cap.done || len(cap.response) == 0 {
		state = "RESPONSE_UNAVAILABLE"
	}
	if err := exactreply.RecordReceipt(ctx, exactreply.ReceiptEvidence{State: state}); err != nil {
		return nil, false, err
	}
	if cap.count == 1 && cap.status == 429 {
		return nil, false, exactreply.RiskError("RATE_LIMITED")
	}
	if cap.count == 1 && cap.status == 403 {
		return nil, false, exactreply.RiskError("PLATFORM_REFUSED")
	}
	if state != "MAPPING_UNREVIEWED" && state != "MAPPING_REVIEWED" {
		return nil, false, nil
	}
	o, accepted := exactreply.ParseMappedReceipt(c, reviewedExactReceiptMapping(), cap.endpoint, cap.status, cap.request, cap.response)
	return o, accepted, nil
}

func (cap *exactReceiptCapture) onRequest(ctx context.Context, c exactreply.Command, e *proto.NetworkRequestWillBeSent) {
	cap.mu.Lock()
	defer cap.mu.Unlock()
	if !cap.active || e.Request == nil {
		return
	}
	if e.RequestID == cap.requestID && e.RedirectResponse != nil {
		cap.broken = true
		return
	}
	if !exactreply.ReceiptRequestMatches(c, e.Request.URL, e.Request.Method, []byte(e.Request.PostData)) {
		return
	}
	cap.count++
	if cap.count != 1 {
		cap.broken = true
		return
	}
	cap.requestID = e.RequestID
	cap.endpoint = e.Request.URL
	cap.request = []byte(e.Request.PostData)
	host, path := exactreply.ReceiptSafeRoute(cap.endpoint)
	fields, err := exactreply.ReceiptProjection(c, cap.request)
	if err != nil || exactreply.RecordReceipt(ctx, exactreply.ReceiptEvidence{State: "REQUEST_MATCHED", EndpointHost: host, EndpointPath: path, EndpointHash: exactreply.Hash(exactreply.ReceiptEndpoint(cap.endpoint)), RequestHash: exactreply.Hash(string(cap.request)), Fields: fields}) != nil {
		cap.broken = true
	}
}
func (cap *exactReceiptCapture) onResponse(e *proto.NetworkResponseReceived) {
	cap.mu.Lock()
	defer cap.mu.Unlock()
	if cap.count == 1 && e.RequestID == cap.requestID && e.Response != nil {
		if exactreply.ReceiptEndpoint(e.Response.URL) != exactreply.ReceiptEndpoint(cap.endpoint) || e.Response.FromDiskCache || e.Response.FromServiceWorker {
			cap.broken = true
			return
		}
		cap.status = e.Response.Status
	}
}
func (cap *exactReceiptCapture) onFailure(e *proto.NetworkLoadingFailed) {
	cap.mu.Lock()
	defer cap.mu.Unlock()
	if cap.count == 1 && e.RequestID == cap.requestID {
		cap.broken = true
		cap.done = true
	}
}
func (cap *exactReceiptCapture) onFinished(ctx context.Context, c exactreply.Command, e *proto.NetworkLoadingFinished, bodyFor func(proto.NetworkRequestID) (*proto.NetworkGetResponseBodyResult, error)) {
	cap.mu.Lock()
	defer cap.mu.Unlock()
	if cap.count != 1 || e.RequestID != cap.requestID || cap.done {
		return
	}
	cap.done = true
	if cap.broken || e.EncodedDataLength > 65536 {
		cap.broken = true
		return
	}
	body, err := bodyFor(e.RequestID)
	if err != nil || len(body.Body) > 90000 {
		cap.broken = true
		return
	}
	data := []byte(body.Body)
	if body.Base64Encoded {
		data, err = base64.StdEncoding.DecodeString(body.Body)
	}
	if err != nil || len(data) > 65536 {
		cap.broken = true
		return
	}
	fields, err := exactreply.ReceiptProjection(c, data)
	if err != nil {
		cap.broken = true
		return
	}
	cap.response = data
	if exactreply.RecordReceipt(ctx, exactreply.ReceiptEvidence{State: "RESPONSE_CAPTURED", Failure: exactreply.ReceiptFailureProjection(data), EndpointHash: exactreply.Hash(exactreply.ReceiptEndpoint(cap.endpoint)), RequestHash: exactreply.Hash(string(cap.request)), ResponseHash: exactreply.Hash(string(data)), Status: cap.status, Fields: fields}) != nil {
		cap.broken = true
	}
}
