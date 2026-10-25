import {describe,expect,it} from 'vitest';
import {inspectSinglePostLink,singlePostRequestUrl} from './single-post-link';
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
 ['fixed page source',valid+'&source=web_explore_feed','valid'],
 ['detail page source',valid+'&source=web_note_detail_r10','valid'],
 ['unknown detail version',valid+'&source=web_note_detail_r11','parameters'],
 ['encoded detail source',valid+'&source=web_note_detail_%7210','parameters'],
 ['duplicate detail source',valid+'&source=web_note_detail_r10&source=web_note_detail_r10','parameters'],
 ['search page source',valid+'&source=web_search_result_notes','valid'],
 ['duplicate mixed page source',valid+'&source=web_explore_feed&source=web_search_result_notes','parameters'],
 ['encoded search marker',valid+'&source=web_search_result_%6eotes','parameters'],
 ['navigation redirect',valid+'&source=web_search_result_notes%26redirect%3Dhttps%3A%2F%2Fevil.invalid','parameters'],
 ['wrong page source',valid+'&source=other','parameters'],
 ['duplicate page source',valid+'&source=web_explore_feed&source=web_explore_feed','parameters'],
 ['page source plus extra',valid+'&source=web_explore_feed&redirect=OTHER','parameters'],
 ['encoded page-source key',valid+'&%73ource=web_explore_feed','parameters'],
 ['encoded page-source value',valid+'&source=%77eb_explore_feed','parameters'],
 ['valid',valid,'valid'],['outer whitespace',' \n'+valid+'\n ','valid'],
 ['search source',valid.replace('pc_feed','pc_search'),'valid'],
 ['reordered',base+'?xsec_source=pc_feed&xsec_token=SYNTHETIC_TEST_ONLY','valid'],
];
describe('single-post local link validation',()=>{
 it.each(cases)('%s',(_name,input,code)=>{
  const result=inspectSinglePostLink(input);
  expect(result.code).toBe(code);
  expect(result.valid).toBe(Boolean(parsePostReference(singlePostRequestUrl(input))));
  if(result.valid && !input.includes('&source=web_explore_feed')) expect(parsePostReference(input.trim())).toBeDefined();
  expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|private_key|https:|0123456789/);
 });
 it('removes only the known markers and preserves access values and note identity exactly',()=>{
  for(const source of ['web_explore_feed','web_search_result_notes','web_note_detail_r10'])for(const input of [valid+'&source='+source,base+'?source='+source+'&'+valid.split('?')[1],valid.replace('&xsec_source','&source='+source+'&xsec_source')]){
   expect(singlePostRequestUrl(input)).toBe(valid);
   expect(parsePostReference(singlePostRequestUrl(input))).toEqual(parsePostReference(valid));
   expect(parsePostReference(input)).toEqual(parsePostReference(valid));
  }
  expect(singlePostRequestUrl(valid+'&redirect=OTHER')).toBeUndefined();
 });
 it('never accepts a reference rejected by the backend across synthetic components',()=>{
  for(const prefix of ['https://www.xiaohongshu.com','HTTPS://www.xiaohongshu.com','https://www.xiaohongshu.com:443','https://evil.invalid'])
   for(const path of ['/explore/0123456789abcdef01234567','/explore/../explore/0123456789abcdef01234567','/explore/%30123456789abcdef01234567'])
    for(const token of ['FAKE','FAKE%2BONLY','FAKE+ONLY','','%252F','%0A','FAKE%26ONLY'])
     for(const suffix of ['&xsec_source=pc_feed','&xsec_source=pc_search','&xsec_source=other','&xsec_source=pc_feed&source=web_search_result_notes','&xsec_source=pc_feed&source=web_explore_feed','&xsec_source=pc_feed&extra=FAKE','#fragment']){
      const input=prefix+path+'?xsec_token='+token+suffix;
      expect(inspectSinglePostLink(input).valid).toBe(Boolean(parsePostReference(input)));
     }
 });
});
