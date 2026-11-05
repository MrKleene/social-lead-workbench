CREATE TABLE "InboxReceiver" (
 "accountId" TEXT PRIMARY KEY REFERENCES "PlatformAccount"("id") ON DELETE CASCADE,
 "ownerId" TEXT NOT NULL REFERENCES "User"("id"), "generation" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'STOPPED', "commentMode" TEXT NOT NULL DEFAULT 'UNCONFIRMED', "dmMode" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
 "baselineAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "lastEventAt" TIMESTAMPTZ,
 "expiresAt" TIMESTAMPTZ, "leaseToken" TEXT, "stopRequested" BOOLEAN NOT NULL DEFAULT false,
 "coverage" TEXT NOT NULL DEFAULT 'NOT_CHECKED', "reason" TEXT
);
CREATE TABLE "InboxMessage" (
 "id" TEXT PRIMARY KEY, "accountId" TEXT NOT NULL REFERENCES "PlatformAccount"("id") ON DELETE CASCADE,
 "channel" TEXT NOT NULL CHECK ("channel" IN ('COMMENT','DM')), "platformId" TEXT NOT NULL,
 "senderId" TEXT NOT NULL, "senderName" TEXT NOT NULL DEFAULT '', "body" TEXT NOT NULL DEFAULT '',
 "postId" TEXT, "postTitle" TEXT, "commentId" TEXT, "publishedAt" TIMESTAMPTZ,
 "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "isNew" BOOLEAN NOT NULL DEFAULT false,
 "source" TEXT NOT NULL CHECK ("source" IN ('PUSH','RECONCILIATION')), "contentType" TEXT NOT NULL DEFAULT 'TEXT',
 UNIQUE("accountId","channel","platformId")
);
CREATE INDEX "InboxMessage_received" ON "InboxMessage"("receivedAt" DESC,"id");
CREATE TABLE "InboxRead" (
 "messageId" TEXT NOT NULL REFERENCES "InboxMessage"("id") ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "readAt" TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY("messageId","userId")
);
