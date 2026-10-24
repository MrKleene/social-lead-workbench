import {describe,it,expect} from 'vitest';
import {postCounts} from './post-counts';
import type{InfoPost}from'./collection-info-model';
import fixture from '../../../../../scripts/mcp-avatar-diagnostics/coverage-cases.json';
const sample=fixture.diagnostic.samples[0];
const boundedRead={version:1,state:'UNKNOWN',reason:'BUTTON_NOT_FOUND',rootStop:'ROOT_END',replyStop:'BUTTON_NOT_FOUND',rootActions:2,replyActions:3,excludedRoots:0,elapsedMs:800,initial:sample,final:{...sample,total:{state:'EXACT',value:41}},retained:sample};
const post={versions:[{savedComments:38,snapshot:{boundedRead}}],comments:Array(31).fill({})} as unknown as InfoPost;
describe('separate page, stored and declared counts',()=>{
 it('does not confuse 31 visible records with 38 saved or 41 declared',()=>{expect(postCounts(post)).toEqual({saved:38,declared:41,different:true});});
 it('does not convert missing or invalid platform total into zero',()=>{for(const state of ['MISSING','INVALID'])expect(postCounts({...post,versions:[{...post.versions[0],snapshot:{...post.versions[0].snapshot,boundedRead:{...boundedRead,final:{...sample,total:{state,value:null}}}}}]}).declared).toBeUndefined();});
 it('keeps legacy responses unknown rather than inventing saved total',()=>{expect(postCounts(undefined)).toEqual({saved:undefined,declared:undefined,different:false});});
});
