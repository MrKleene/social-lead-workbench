import {activeWorkModule,type SpaceModule} from '../../features/work/navigation-policy';
export type NavigationItem={id:string;label:string;path:string;module?:SpaceModule;adminOnly?:boolean;group?:string};
export const primaryNavigation:NavigationItem[]=[
 {id:'overview',label:'工作台',path:'/work'},
 {id:'runs',label:'采集任务',path:'/work?module=runs',module:'runs',adminOnly:true},
 {id:'archive',label:'采集信息',path:'/work?module=archive',module:'archive',adminOnly:true},
 {id:'review',label:'评论审核',path:'/comment-review',adminOnly:true},
 {id:'matches',label:'线索池',path:'/work?module=matches',module:'matches'},
 {id:'follow',label:'销售跟进',path:'/work?module=follow',module:'follow'},
];
export const secondaryNavigation:NavigationItem[]=[
 {id:'all-leads',label:'全部线索',path:'/leads',group:'工作管理'},
 {id:'tasks',label:'人工任务',path:'/tasks',group:'工作管理'},
 {id:'templates',label:'联系与回复',path:'/work?module=templates',module:'templates',adminOnly:true,group:'工作管理'},
 {id:'notices',label:'提醒与异常',path:'/work?module=notices',module:'notices',group:'工作管理'},
 {id:'accounts',label:'账号中心',path:'/work?module=accounts',module:'accounts',group:'设置'},
 {id:'settings',label:'搜索与模型',path:'/work?module=settings',module:'settings',adminOnly:true,group:'设置'},
 {id:'platforms',label:'平台能力',path:'/platforms',group:'设置'},
];
export const isWorkPath=(path:string)=>/^\/work(?:\/|$)/.test(path);
export function activeNavigation(path:string,search:string,admin:boolean){
 if(isWorkPath(path))return activeWorkModule(search,path.split('/')[2],admin)||'overview';
 if(/^\/comment-review(?:\/|$)/.test(path))return admin?'review':null;
 if(/^\/leads(?:\/|$)/.test(path))return 'all-leads';
 if(path==='/tasks')return 'tasks';
 if(path==='/platforms')return 'platforms';
 return null;
}
/** Retain only workspace destinations; each module keeps its last detail/filter URL. */
export function navigationPath(item:NavigationItem,current:{pathname:string;search:string},history:Record<string,string>,lastWorkSearch:string){
 if(item.id==='overview'){const config=new URLSearchParams(isWorkPath(current.pathname)?current.search:lastWorkSearch).get('config');return config?'/work?'+new URLSearchParams({config}):'/work';}
 if(!item.module)return item.path;
 if(history[item.id])return history[item.id];
 const query=new URLSearchParams(isWorkPath(current.pathname)?current.search:lastWorkSearch);
 query.set('module',item.module);query.set('view',item.module==='follow'?'follow':'new');
 return '/work?'+query;
}
