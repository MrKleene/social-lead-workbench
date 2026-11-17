-- Validation detail for a failed model batch. Nullable: transport and config failures keep only error_code.
ALTER TABLE review_batches ADD COLUMN error_detail TEXT;
