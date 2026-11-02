/** Task review starts with every persisted state, including unscored/failed rows. */
export function reviewDefaults(scoped:boolean){
 return {from:'',to:'',publication:'',search:'',minScore:'',maxScore:'',sort:scoped?'newest':'comment-newest',status:'',state:scoped?'':'EVALUATED'};
}
export function reviewActivityJobs<T>(jobs:T[],scoped:boolean){return scoped?[]:jobs;}
