import {safePostCoverUrl} from '@crm/contracts';
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** Upstream types.go: noteCard.cover and note.imageList[0]. Optional image
 * metadata never invalidates otherwise usable text/comments. Do not invent URLs. */
export function xhsCover(value:unknown){
 const image=record(value),info=Array.isArray(image.infoList)?image.infoList.slice(0,8):[];
 for(const candidate of [image.urlDefault,image.urlPre,image.url,...info.map(i=>record(i).url)]){const url=safePostCoverUrl(candidate);if(url)return url;}
}
export function xhsDetailCover(value:unknown){return Array.isArray(value)?xhsCover(value[0]):undefined;}
