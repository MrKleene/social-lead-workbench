/** Settings/templates stay mounted within /work; lead forms belong to one path. */
export function shouldProtectDrafts(kinds:readonly ('retained'|'lead')[],currentPath:string,nextPath:string) {
 if(!kinds.length)return false;
 if(!/^\/work(?:\/|$)/.test(nextPath))return true;
 return kinds.includes('lead')&&currentPath!==nextPath;
}
export function legacyWorkspacePath(module:'settings'|'templates',config?:string){
 const query=new URLSearchParams({module});if(config)query.set('config',config);return `/work?${query}`;
}
