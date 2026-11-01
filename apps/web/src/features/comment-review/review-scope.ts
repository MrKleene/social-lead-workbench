/** Task review starts with every persisted state, including unscored/failed rows. */
export function reviewDefaults(scoped:boolean){
 return {search:'',minScore:'',maxScore:'',sort:scoped?'newest':'score-desc',status:'',state:scoped?'':'EVALUATED'};
}
export function reviewActivityJobs<T>(jobs:T[],scoped:boolean){return scoped?[]:jobs;}
