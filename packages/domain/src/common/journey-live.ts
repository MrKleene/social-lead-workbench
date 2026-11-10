export type LiveStage='collect'|'review'|'contact';
export type LivePhase='PREPARING_CAPTURE'|'CHECKING_ACCOUNT'|'SEARCHING'|'READING_POST'|'READING_COMMENTS'|'READING_REPLIES'|'SAVING_CAPTURE'|'PREPARING_REVIEW'|'REVIEWING'|'SAVING_REVIEW'|'PREPARING_SEND'|'LOCATING_TARGET'|'FILLING_MESSAGE'|'SUBMITTING'|'CONFIRMING'|'IDLE';
export type LiveReporter={set:(phase:LivePhase)=>Promise<void>;close:()=>Promise<void>};
