export function manualReviewLabel(status:string){return ({PENDING:'未人工复核',APPROVED:'已人工确认',REJECTED:'已人工排除'} as Record<string,string>)[status]||status;}
