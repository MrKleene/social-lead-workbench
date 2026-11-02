import {activeWorkModule,type SpaceModule} from '../../features/work/navigation-policy';
export type NavigationItem={id:string;label:string;path:string;module?:SpaceModule;adminOnly?:boolean;group?:string};
export const primaryNavigation:NavigationItem[]=[
 {id:'overview',label:'工作台',path:'/work'},
 {id:'runs',label:'自动化任务',path:'/automation',module:'runs',adminOnly:true},
 {id:'accounts',label:'账号中心',path:'/work?module=accounts',module:'accounts'},
 {id:'reply-history',label:'回复记录',path:'/reply-history',adminOnly:true},
];
export const secondaryNavigation:NavigationItem[]=[
 {id:'archive',label:'采集信息',path:'/work?module=archive',module:'archive',adminOnly:true,group:'工作管理'},
 {id:'review',label:'评论审核',path:'/comment-review',adminOnly:true,group:'工作管理'},
 {id:'configuration',label:'配置管理',path:'/configuration?tab=keywords',adminOnly:true,group:'管理'},
 {id:'pending-replies',label:'待处理回复',path:'/auto-contact?view=pending',adminOnly:true,group:'工作管理'},
 {id:'auto-contact',label:'自动回复与账号矩阵',path:'/auto-contact',adminOnly:true,group:'工作管理'},
 {id:'matches',label:'线索池',path:'/work?module=matches',module:'matches',group:'工作管理'},
 {id:'follow',label:'销售跟进',path:'/work?module=follow',module:'follow',group:'工作管理'},
 {id:'all-leads',label:'全部线索',path:'/leads',group:'工作管理'},
 {id:'tasks',label:'人工任务',path:'/tasks',group:'工作管理'},
 {id:'notices',label:'提醒与异常',path:'/work?module=notices',module:'notices',group:'工作管理'},
 {id:'platforms',label:'平台能力',path:'/platforms',group:'设置'},
];
export const isWorkPath=(path:string)=>/^\/work(?:\/|$)/.test(path);
export function activeNavigation(path:string,search:string,admin:boolean){
 if(path==='/automation')return admin?'runs':null;
 if(path==='/home')return 'home';
 if(isWorkPath(path)){const module=activeWorkModule(search,path.split('/')[2],admin);return module==='settings'||module==='templates'?'configuration':module||'overview';}
 if(/^\/reply-history(?:\/|$)/.test(path))return admin?'reply-history':null;
 if(path==='/auto-contact')return admin?(new URLSearchParams(search).get('view')==='pending'?'pending-replies':'auto-contact'):null;
 if(path==='/review-policies'||path==='/configuration')return admin?'configuration':null;
 if(/^\/comment-review(?:\/|$)/.test(path))return admin?(new URLSearchParams(search).get('manage')==='1'?'configuration':'review'):null;
 if(/^\/leads(?:\/|$)/.test(path))return 'all-leads';
 if(path==='/tasks')return 'tasks';
 if(path==='/platforms')return 'platforms';
 return null;
}
/** Retain only workspace destinations; each module keeps its last detail/filter URL. */
export function navigationPath(item:NavigationItem,current:{pathname:string;search:string},history:Record<string,string>,lastWorkSearch:string){
 if(item.id==='overview')return '/work';
 if(item.id==='runs')return history.runs||'/automation';
 if(!item.module)return item.path;
 if(history[item.id])return history[item.id];
 const query=new URLSearchParams(isWorkPath(current.pathname)?current.search:lastWorkSearch);
 query.set('module',item.module);query.set('view',item.module==='follow'?'follow':'new');
 return '/work?'+query;
}
