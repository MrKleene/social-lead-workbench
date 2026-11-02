/** Settings/templates stay mounted within /work; lead forms belong to one path. */
export function shouldProtectDrafts(kinds:readonly ('retained'|'lead')[],currentPath:string,nextPath:string) {
 if(!kinds.length)return false;
 if(currentPath==='/configuration')return currentPath!==nextPath;
 if(!/^\/work(?:\/|$)/.test(nextPath))return true;
 return kinds.includes('lead')&&currentPath!==nextPath;
}
export function legacyWorkspacePath(module:'settings'|'templates',config?:string){
 const query=new URLSearchParams({module});if(config)query.set('config',config);return `/work?${query}`;
}

export type SpaceModule = 'matches' | 'archive' | 'runs' | 'follow' | 'notices' | 'settings' | 'templates' | 'accounts';
/** Match the actual workspace screen, including historical view/detail deep links. */
export function activeWorkModule(search:string,id:string|undefined,admin:boolean):SpaceModule|null {
 const params=new URLSearchParams(search),requested=params.get('module'),view=params.get('view')||'new';
 return requested==='archive'&&admin?'archive':requested==='accounts'?'accounts':(requested==='settings'||requested==='templates')&&admin?requested:requested==='runs'&&admin?'runs':requested==='notices'?'notices':requested==='follow'||view==='follow'?'follow':id||requested==='matches'||params.has('view')?'matches':null;
}

export function automationPath(search:string){const p=new URLSearchParams(search);p.delete('module');p.delete('view');return '/automation'+(p.size?'?'+p:'');}
