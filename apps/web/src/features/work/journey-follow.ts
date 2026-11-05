import type {JourneyStage} from './journey-model';

export type JourneyObservation = {key:string; active:boolean; consumed:boolean};
type Snapshot = {key:string; status:string; safeEnd:boolean; reviewReady:boolean|undefined; stage:JourneyStage};
/** Follow only a live transition observed in this mounted workspace, never a historical opening. */
export function followJourney(previous:JourneyObservation|undefined, next:Snapshot) {
 const active=['QUEUED','RUNNING'].includes(next.status);
 if(!previous||previous.key!==next.key)return {observation:{key:next.key,active,consumed:!active},follow:false};
 if(previous.consumed)return {observation:previous,follow:false};
 if(active)return {observation:{...previous,active:true},follow:false};
 if(!next.safeEnd)return {observation:{...previous,consumed:true},follow:false};
 if(next.reviewReady===undefined)return {observation:previous,follow:false};
 return {observation:{...previous,consumed:true},follow:previous.active&&next.reviewReady&&next.stage==='collect'};
}

export type ReviewJourneyObservation={key:string;armed:boolean;consumed:boolean};
/** Follow a witnessed review transition once; refreshing a finished run is not a transition. */
export function followReviewJourney(previous:ReviewJourneyObservation|undefined,next:{key:string;active:boolean;ready:boolean|undefined;stage:JourneyStage;canContinue:boolean}){
 if(!previous||previous.key!==next.key)return {observation:{key:next.key,armed:next.active,consumed:next.ready===true},follow:false};
 if(previous.consumed)return {observation:previous,follow:false};
 if(next.ready!==true)return {observation:{...previous,armed:previous.armed||next.active},follow:false};
 return {observation:{...previous,consumed:true},follow:previous.armed&&next.canContinue&&next.stage==='review'};
}
