import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('./mcp-avatar-diagnostics/coverage_capture.go',import.meta.url),'utf8');
const script=source.match(/const coveragePageScript = `([\s\S]*?)`/)[1];
const capture=(text,visible=true)=>JSON.parse(runInNewContext(`(${script})()`,{window:{__INITIAL_STATE__:{note:{noteDetailMap:{}}}},document:{readyState:'complete',querySelector:()=>({}),querySelectorAll:selector=>selector.includes('.end-container')?[{textContent:text,getBoundingClientRect:()=>({width:visible?100:0,height:20})}]:[]}}));
test('accepts exact observed dash-wrapped THE END and the legacy plain marker',()=>{for(const value of ['THE END','- THE END -','  -  THE END  -  '])assert.equal(capture(value).ready.rootEndVisible,true);});
test('does not invent an end signal from hidden or unrelated text',()=>{for(const value of ['THE END OF STORY','NO MORE','the ending','- THE END - extra'])assert.equal(capture(value).ready.rootEndVisible,false);assert.equal(capture('- THE END -',false).ready.rootEndVisible,false);});
