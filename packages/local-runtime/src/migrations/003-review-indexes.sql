CREATE INDEX IF NOT EXISTS review_results_queue_scan ON review_results(review_status,decision,score,created_at);

CREATE INDEX IF NOT EXISTS review_results_created ON review_results(created_at,id);

CREATE INDEX IF NOT EXISTS review_batches_state ON review_batches(state,policy_id);

CREATE INDEX IF NOT EXISTS send_attempts_recipient ON send_attempts(platform,recipient_id,channel,state);

CREATE INDEX IF NOT EXISTS send_queue_recipient ON send_queue(recipient_id,channel,state);

CREATE INDEX IF NOT EXISTS send_queue_review_state ON send_queue(review_id,state);
