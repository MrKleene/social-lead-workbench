/** Settings/templates stay mounted within the workspace. */
export function shouldProtectDrafts(kinds:readonly 'retained'[],currentPath:string,nextPath:string) {
 if(!kinds.length)return false;
 if(currentPath==='/configuration')return currentPath!==nextPath;
 if(!/^\/work(?:\/|$)/.test(nextPath))return true;
 return false;
}
export function legacyWorkspacePath(module:'settings'|'templates',config?:string){
 const query=new URLSearchParams({module});if(config)query.set('config',config);return `/work?${query}`;
}

export type SpaceModule = 'archive' | 'runs' | 'notices' | 'settings' | 'templates' | 'accounts';
/** Match the actual workspace screen, including historical view/detail deep links. */
export function activeWorkModule(search:string,id:string|undefined,admin:boolean):SpaceModule|null {
 const params=new URLSearchParams(search),requested=params.get('module');
 return requested==='archive'&&admin?'archive':requested==='accounts'?'accounts':(requested==='settings'||requested==='templates')&&admin?requested:requested==='runs'&&admin?'runs':requested==='notices'&&admin?'notices':null;
}

export function automationPath(search:string){const p=new URLSearchParams(search);p.delete('module');p.delete('view');return '/automation'+(p.size?'?'+p:'');}
