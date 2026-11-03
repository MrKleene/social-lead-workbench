-- Display invalidation only. Notifications become visible only after COMMIT.
-- No snapshots, comments, identity, content, credentials or execution authority are sent.
CREATE FUNCTION public.crm_journey_notify() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n jsonb; o jsonb; rid text; cid text; payload jsonb; topic text := 'change';
BEGIN
 n := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 o := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
 IF TG_TABLE_NAME='AuditLog' THEN
  IF n->>'action'<>'JOURNEY_PROGRESS' OR n->'metadata'->>'v'<>'1' THEN RETURN NULL; END IF;
  rid := n->>'entityId';
  topic := CASE WHEN n->'metadata'->>'heartbeat'='true' THEN 'heartbeat' ELSE 'change' END;
 ELSIF TG_TABLE_NAME='CollectionRun' THEN rid:=n->>'id';
 ELSIF TG_TABLE_NAME IN ('AutoReviewJob','SemanticReview') THEN rid:=n->>'runId';
 ELSIF TG_TABLE_NAME='AutoContactJob' THEN SELECT "runId" INTO rid FROM public."SemanticReview" WHERE id=n->>'reviewId';
 ELSE topic:='reset'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME NOT IN ('HistoryArchiveBatch','HistoryArchiveItem') AND
    jsonb_build_array(n->'status',n->'state',n->'reason',n->'processed',n->'score',n->'reviewStatus',n->'requests',n->'observed',n->'capturedPosts',n->'capturedCommentsCount',n->'finishedAt',n->'enabled',n->'version',n->'autoEnabled',n->'pauseReason',n->'archivedAt',n->'accountId',n->'revision',n->'activeRunId',n->'cancelRequested')
    IS NOT DISTINCT FROM
    jsonb_build_array(o->'status',o->'state',o->'reason',o->'processed',o->'score',o->'reviewStatus',o->'requests',o->'observed',o->'capturedPosts',o->'capturedCommentsCount',o->'finishedAt',o->'enabled',o->'version',o->'autoEnabled',o->'pauseReason',o->'archivedAt',o->'accountId',o->'revision',o->'activeRunId',o->'cancelRequested') THEN RETURN NULL; END IF;
 IF topic<>'reset' THEN
  IF TG_TABLE_NAME='CollectionRun' THEN cid:=n->>'configId'; ELSE SELECT "configId" INTO cid FROM public."CollectionRun" WHERE id=rid; END IF;
  IF rid IS NULL OR cid IS NULL THEN RETURN NULL; END IF;
 END IF;
 payload:=jsonb_build_object('v',1,'kind',topic,'id',txid_current()::text||':'||topic||':'||coalesce(rid,'all'),'runId',rid,'configId',cid);
 IF topic='heartbeat' THEN payload:=payload||jsonb_build_object('id',n->>'id','at',(n->>'createdAt')||'Z','executionId',n->'metadata'->>'executionId','session',n->'metadata'->>'session','phase',n->'metadata'->>'phase'); END IF;
 -- A stalled listener must not fill the notification queue and jeopardize work.
 IF pg_notification_queue_usage()<0.25 THEN PERFORM pg_notify('crm_journey_v1',payload::text); END IF;
 RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL; -- Observation must not reject business writes.
END $$;
CREATE TRIGGER journey_push_run AFTER INSERT OR UPDATE OR DELETE ON public."CollectionRun" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_review_job AFTER INSERT OR UPDATE OR DELETE ON public."AutoReviewJob" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_review AFTER INSERT OR UPDATE OR DELETE ON public."SemanticReview" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_contact AFTER INSERT OR UPDATE OR DELETE ON public."AutoContactJob" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_phase AFTER INSERT ON public."AuditLog" FOR EACH ROW WHEN (NEW.action='JOURNEY_PROGRESS') EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_rule AFTER INSERT OR UPDATE OR DELETE ON public."AutoContactRule" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_control AFTER INSERT OR UPDATE OR DELETE ON public."AutoContactControl" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_archive AFTER INSERT OR UPDATE OR DELETE ON public."HistoryArchiveBatch" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_archive_item AFTER INSERT OR DELETE ON public."HistoryArchiveItem" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_config AFTER INSERT OR UPDATE OR DELETE ON public."CollectionConfig" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
CREATE TRIGGER journey_push_policy AFTER INSERT OR UPDATE OR DELETE ON public."CommentReviewPolicy" FOR EACH ROW EXECUTE FUNCTION public.crm_journey_notify();
