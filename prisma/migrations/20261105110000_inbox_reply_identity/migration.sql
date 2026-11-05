ALTER TABLE "InboxMessage" ADD COLUMN "receiverId" TEXT;
-- Historical rows remain readable; no account identity is invented or backfilled.

ALTER TABLE "ContactAttempt" DROP CONSTRAINT "ContactAttempt_kind_check";
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_kind_check" CHECK ("kind" IN ('FIRST','FOLLOWUP','INBOX_REPLY'));
