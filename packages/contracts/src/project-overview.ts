export type ProjectOverview={
 asOf:string;timezone:'Asia/Shanghai';day:string;
 archive:{posts:number;comments:number;scored:number;unscored:number;failed:number};
 sends:{confirmed:number;pending:number;unknown:number;failed:number;cancelled:number;blockedJobs:number};
 accounts:{total:number;paused:number;restricted:number;notPaused:number;dailyLimit:number;occupied:number};
 tasks:{running:number;queued:number;reviewPending:number};
 activity:{id:string;kind:'collection'|'send';at:string;label:string;status:string;configId?:string}[];
};
