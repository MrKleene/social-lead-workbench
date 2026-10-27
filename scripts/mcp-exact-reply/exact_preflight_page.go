package xiaohongshu

// Diagnostic-only JS: no navigation, writes, profile lookup, state enumeration or token output.
const exactPreflightPage = `(post,token,source) => {
 const shape=x=>x==null?'MISSING':typeof x!=='object'||Array.isArray(x)?'INVALID':x.value!==undefined?'VALUE_REF':x._rawValue!==undefined?'RAW_VALUE_REF':Object.prototype.hasOwnProperty.call(x,'_value')?'UNSUPPORTED_REF':'PLAIN';
 const unwrap=x=>x&&x.value!==undefined?x.value:x&&x._rawValue!==undefined?x._rawValue:x;
 const root=window.__INITIAL_STATE__,note=root?.note,map=unwrap(note?.noteDetailMap),entry=map?.[post];
 const u=new URL(window.location.href),exact='/explore/'+post;
 const nav=u.origin!=='https://www.xiaohongshu.com'?'EXTERNAL_ORIGIN':u.pathname===exact?'EXACT_POST':/^\/explore\/[a-f0-9]{24}$/.test(u.pathname)?'OTHER_POST':'OTHER_ROUTE';
 const param=(key,expected)=>{const v=u.searchParams.getAll(key);return v.length===0?'MISSING':v.length!==1?'AMBIGUOUS':v[0]===expected?'MATCH':'MISMATCH'};
 return JSON.stringify({navigation:nav,token:param('xsec_token',token),source:param('xsec_source',source),document:document.readyState,root:shape(root),note:shape(note),map:shape(note?.noteDetailMap),entry:shape(entry),wait:'UNKNOWN',samples:0});
}`
