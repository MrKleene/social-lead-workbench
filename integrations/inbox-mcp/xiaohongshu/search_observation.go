package xiaohongshu

// This closed structure contains no keyword, feed ID, user value, URL or response text.
type SearchObservation struct {
	ParseIssue      *SearchParseIssue `json:"parseIssue,omitempty"`
	Version         int               `json:"version"`
	State           string            `json:"state"`
	Stop            string            `json:"stop"`
	InitialState    bool              `json:"initialState"`
	SearchState     bool              `json:"searchState"`
	DocumentReady   bool              `json:"documentReady"`
	RouteMatches    bool              `json:"routeMatches"`
	ValueType       string            `json:"valueType"`
	RawValueType    string            `json:"rawValueType"`
	Selected        string            `json:"selected"`
	RawCount        *int              `json:"rawCount"`
	NoteCount       *int              `json:"noteCount"`
	KnownOtherCount *int              `json:"knownOtherCount"`
	UnknownCount    *int              `json:"unknownCount"`
	MalformedCount  *int              `json:"malformedCount"`
	AcceptedCount   int               `json:"acceptedCount"`
	Observations    int               `json:"observations"`
	WaitedMs        int               `json:"waitedMs"`
	FirstRawCount   *int              `json:"firstRawCount"`
	// No verified empty/completion/loading marker exists in the reviewed search source.
	CompletionSignal string `json:"completionSignal"`
}

// The same function is used in production and loopback-only browser fixtures.
// Only already-reviewed value/_value wrappers and modelType values are recognized.
const searchObservationJS = `(keyword, expectedOrigin) => {
 const shape=v=>v===undefined?'MISSING':v===null?'NULL':Array.isArray(v)?'ARRAY':typeof v==='object'?'OBJECT':['string','number','boolean'].includes(typeof v)?(typeof v).toUpperCase():'OTHER';
 const state=window.__INITIAL_STATE__, search=state&&state.search, feeds=search&&search.feeds;
 const value=feeds&&typeof feeds==='object'&&!Array.isArray(feeds)?feeds.value:undefined;
 const raw=feeds&&typeof feeds==='object'&&!Array.isArray(feeds)?feeds._value:undefined;
 const here=new URL(location.href);
 const d={version:1,state:'STATE_MISSING',stop:'WAITING',initialState:!!state,searchState:!!search,documentReady:document.readyState!=='loading',routeMatches:here.origin===expectedOrigin&&here.pathname==='/search_result'&&here.searchParams.get('keyword')===keyword,valueType:shape(value),rawValueType:shape(raw),selected:'NONE',rawCount:null,noteCount:null,knownOtherCount:null,unknownCount:null,malformedCount:null,acceptedCount:0,observations:0,waitedMs:0,firstRawCount:null,completionSignal:'UNSUPPORTED'};
 // Existing upstream error containers; absence is NOT proof of unrestricted access.
 const blocked=[...document.querySelectorAll('.access-wrapper, .error-wrapper, .not-found-wrapper, .blocked-wrapper')].some(e=>e.getClientRects().length&&e.textContent.trim());
 if(blocked){d.state='ACCESS_BLOCKED';return {diagnostic:d};}
 if(!d.routeMatches){d.state='ROUTE_UNCONFIRMED';return {diagnostic:d};}
 if(!d.documentReady){d.state='PAGE_LOADING';return {diagnostic:d};}
 if(!state||!search)return {diagnostic:d};
 if(feeds===undefined||feeds===null){d.state='FEEDS_MISSING';return {diagnostic:d};}
 let chosen;
 if(value!==undefined&&raw!==undefined){
  if(!Array.isArray(value)||!Array.isArray(raw)){d.state='AMBIGUOUS_FIELDS';return {diagnostic:d};}
  // Never silently prefer an empty .value over a populated ._value (or vice versa).
  if(JSON.stringify(value)!==JSON.stringify(raw)){d.state='AMBIGUOUS_FIELDS';return {diagnostic:d};}
  d.selected='BOTH';chosen=value;
 }else if(Array.isArray(value)){d.selected='VALUE';chosen=value;}
 else if(value===undefined&&Array.isArray(raw)){d.selected='RAW_VALUE';chosen=raw;}
 else {d.state='UNSUPPORTED_SHAPE';return {diagnostic:d};}
 if(chosen.length>200){d.state='RESULT_LIMIT';return {diagnostic:d};}
 d.rawCount=chosen.length;d.noteCount=0;d.knownOtherCount=0;d.unknownCount=0;d.malformedCount=0;
 for(const f of chosen){
  if(f&&f.modelType==='note')d.noteCount++;
  else if(f&&['live_v2','hot_query'].includes(f.modelType))d.knownOtherCount++;
  else d.unknownCount++;
  if(!f||typeof f!=='object'||Array.isArray(f)||(f.modelType==='note'&&(typeof f.id!=='string'||!f.id||typeof f.xsecToken!=='string'||!f.xsecToken)))d.malformedCount++;
 }
 d.state=d.malformedCount?'INVALID_NOTE':d.noteCount?'NOTES_AVAILABLE':d.unknownCount?'UNKNOWN_ITEM_TYPES':d.rawCount?'FILTERED_NON_NOTES':'EMPTY_UNCONFIRMED';
 // The nonempty, strictly typed note data is evidence of available records, not of exhaustive search.
 return {diagnostic:d,feeds:chosen};
}`

// A JSON string is an unambiguous CDP transport for reactive/Proxy arrays and
// nested objects. It stays in memory, is never logged, and is strictly decoded
// by the existing note parser. This does not widen accepted source shapes.
const searchObservationTransportJS = `(keyword, origin) => JSON.stringify((` + searchObservationJS + `)(keyword, origin))`
