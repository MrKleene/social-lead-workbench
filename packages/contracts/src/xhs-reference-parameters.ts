// Navigation markers used by the reviewed XHS search URL implementation.
// They are not xsec_source or an access reference. Unknown markers stay rejected.
const navigationParts = ['source=web_explore_feed', 'source=web_search_result_notes'];
export function hasSupportedXhsReferenceParameters(url: URL, raw: string): boolean {
 const keys = [...url.searchParams.keys()];
 if (new Set(keys).size !== keys.length || !keys.includes('xsec_token') || !keys.includes('xsec_source')) return false;
 if (keys.length === 2) return true;
 return keys.length === 3 && keys.includes('source') &&
  raw.slice(raw.indexOf('?') + 1).split('&').some(part => navigationParts.includes(part));
}
// Use only after validating the complete official URL. Preserve all access bytes;
// the marker is not needed by get_feed_detail and is never persisted or logged.
export function withoutXhsNavigationMarker(raw: string): string {
 const boundary = raw.indexOf('?');
 if (boundary < 0) return raw;
 return raw.slice(0, boundary + 1) + raw.slice(boundary + 1).split('&')
  .filter(part => !navigationParts.includes(part)).join('&');
}
