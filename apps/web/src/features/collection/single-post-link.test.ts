import {describe,expect,it} from 'vitest';
import {inspectSinglePostLink} from './single-post-link';
import {parsePostReference} from '../../../../api/src/collection/post-reference';
const base='https://www.xiaohongshu.com/explore/0123456789abcdef01234567';
const valid=base+'?xsec_token=SYNTHETIC_TEST_ONLY%2B%2F%3D&xsec_source=pc_feed';
// Synthetic references only. No network, session, database or platform access.
const cases: [string,string,string][]=[
 ['empty','','empty'],['bare note',base,'reference'],
 ['missing source',base+'?xsec_token=SYNTHETIC_TEST_ONLY','source'],
 ['HTML separator',valid.replace('&xsec_source','&amp;xsec_source'),'escaped'],
 ['quoted','“'+valid+'”','format'],['internal space',valid.replace('TEST','TE ST'),'format'],
 ['backslash',valid+'\\','format'],['too long',valid+'a'.repeat(8192),'length'],
 ['wrong protocol',valid.replace('https:','http:'),'origin'],
 ['wrong host',valid.replace('www.xiaohongshu.com','www.xiaohongshu.com.evil.invalid'),'origin'],
 ['short link','https://xhslink.com/synthetic','origin'],
 ['credentials',valid.replace('https://','https://u:p@'),'components'],
 ['explicit standard port',valid.replace('.com/', '.com:443/'),'components'],
 ['fragment',valid+'#synthetic','components'],
 ['normalized traversal',valid.replace('/explore/','/other/../explore/'),'components'],
 ['encoded traversal',valid.replace('/explore/','/other/%2e%2e/explore/'),'components'],
 ['encoded ID',valid.replace('/0123','/%30123'),'path'],
 ['other route',valid.replace('/explore/','/discovery/item/'),'path'],
 ['extra parameter',valid+'&private_key=SYNTHETIC_PRIVATE_SENTINEL','parameters'],
 ['duplicate token',valid+'&xsec_token=OTHER','parameters'],
 ['duplicate source',valid+'&xsec_source=pc_search','parameters'],
 ['unknown source',valid.replace('pc_feed','unrecognized'),'sourceValue'],
 ['empty token',base+'?xsec_token=&xsec_source=pc_feed','token'],
 ['raw plus',base+'?xsec_token=FAKE+ONLY&xsec_source=pc_feed','token'],
 ['encoded newline',valid.replace('SYNTHETIC','%0A'),'token'],
 ['malformed encoded token',valid.replace('SYNTHETIC','%ZZ'),'token'],
 ['oversize token',base+'?xsec_token='+'a'.repeat(4097)+'&xsec_source=pc_feed','token'],
 ['valid',valid,'valid'],['outer whitespace',' \n'+valid+'\n ','valid'],
 ['search source',valid.replace('pc_feed','pc_search'),'valid'],
 ['reordered',base+'?xsec_source=pc_feed&xsec_token=SYNTHETIC_TEST_ONLY','valid'],
];
describe('single-post local link validation',()=>{
 it.each(cases)('%s',(_name,input,code)=>{
  const result=inspectSinglePostLink(input);
  expect(result.code).toBe(code);
  expect(result.valid).toBe(Boolean(parsePostReference(input.trim())));
  expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|private_key|https:|0123456789/);
 });
 it('never accepts a reference rejected by the backend across synthetic components',()=>{
  for(const prefix of ['https://www.xiaohongshu.com','HTTPS://www.xiaohongshu.com','https://www.xiaohongshu.com:443','https://evil.invalid'])
   for(const path of ['/explore/0123456789abcdef01234567','/explore/../explore/0123456789abcdef01234567','/explore/%30123456789abcdef01234567'])
    for(const token of ['FAKE','FAKE%2BONLY','FAKE+ONLY','','%252F','%0A','FAKE%26ONLY'])
     for(const suffix of ['&xsec_source=pc_feed','&xsec_source=pc_search','&xsec_source=other','&xsec_source=pc_feed&extra=FAKE','#fragment']){
      const input=prefix+path+'?xsec_token='+token+suffix;
      expect(inspectSinglePostLink(input).valid).toBe(Boolean(parsePostReference(input)));
     }
 });
});
