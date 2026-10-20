/** One visibility boundary for CSS animations; cleanup prevents stale listeners after logout. */
export function bindWorkspaceVisibility(doc: Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>, target: {dataset: DOMStringMap}) {
 const update=()=>{target.dataset.crmHidden=String(doc.hidden);};
 update();doc.addEventListener('visibilitychange',update);
 return()=>{doc.removeEventListener('visibilitychange',update);delete target.dataset.crmHidden;};
}
