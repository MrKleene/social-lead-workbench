import {inspectImageUrl} from './image-diagnostic';
/** Exact public CDN allowlist, HTTPS and unsigned paths only. */
export function safePostCoverUrl(value:unknown):string|undefined{return inspectImageUrl(value,'cover').url;}
