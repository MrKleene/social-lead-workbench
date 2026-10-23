/** Only an authenticated archive redirect can expose a validated saved reference.
 * Never guess a usable original link from a bare platform ID. */
export function postSourceLink(platform:unknown,postId:unknown,captureId?:unknown,available?:boolean):string|undefined {
 if(platform!=='XHS'||typeof postId!=='string'||!/^[a-f0-9]{24}$/.test(postId)||available!==true||typeof captureId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(captureId))return;
 return `/api/collection/captured-posts/${captureId}/source`;
}
