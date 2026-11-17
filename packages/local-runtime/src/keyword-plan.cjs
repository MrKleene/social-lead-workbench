'use strict';
const {randomInt,randomBytes}=require('node:crypto');
const {LocalError}=require('./database.cjs');
// One batch may read at most 10 posts; a keyword never needs a larger quota than that.
const MAX_LIMIT=10;
const FILTERS=Object.freeze({
 sortBy:['综合','最新','最多点赞','最多评论','最多收藏'],
 publishTime:['不限','一天内','一周内','半年内'],
});
const DEFAULT_FILTERS=Object.freeze({sortBy:'最多点赞',publishTime:'一周内'});
const normalize=value=>String(value).normalize('NFKC').trim().toLowerCase();
function shuffle(keywords,draw){
 const pool=[...keywords];
 for(let i=pool.length-1;i>0;i--){const j=draw(i+1);if(!Number.isInteger(j)||j<0||j>i)throw new LocalError('INVALID_COLLECTION_PLAN');[pool[i],pool[j]]=[pool[j],pool[i]];}
 return pool;
}
/**
 * A random search plan for one round: shuffle the whole keyword list, draw a seed, and
 * freeze both. The collector replays the seed to draw 1..remaining posts per keyword,
 * so the plan stays deterministic even though the batch size is decided while reading.
 */
function randomPlan(keywords,batchLimit,{draw=randomInt,seed=randomBytes(16).toString('hex')}={}){
 if(!Array.isArray(keywords)||keywords.length<1||keywords.length>100)throw new LocalError('INVALID_COLLECTION_PLAN');
 if(!Number.isInteger(batchLimit)||batchLimit<1||batchLimit>MAX_LIMIT)throw new LocalError('INVALID_COLLECTION_PLAN');
 if(!/^[a-f0-9]{32}$/.test(seed))throw new LocalError('INVALID_COLLECTION_PLAN');
 return {version:2,order:shuffle(keywords,draw),seed,filters:{...DEFAULT_FILTERS}};
}
function filterValue(filters,key,allowed){
 const value=filters?.[key]??DEFAULT_FILTERS[key];
 if(!allowed.includes(value))throw new LocalError('INVALID_COLLECTION_PLAN');
 return value;
}
/**
 * Re-check a plan supplied by the caller: it may only reorder the user's own keywords,
 * never invent a keyword, repeat one or change the frozen filters.
 */
function planSpec(input,keywords,batchLimit){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==2)throw new LocalError('INVALID_COLLECTION_PLAN');
 if(!Array.isArray(keywords)||keywords.length<1||!Number.isInteger(batchLimit)||batchLimit<1||batchLimit>MAX_LIMIT)throw new LocalError('INVALID_COLLECTION_PLAN');
 if(!Array.isArray(input.order)||input.order.length<1||input.order.length>Math.min(100,keywords.length))throw new LocalError('INVALID_COLLECTION_PLAN');
 if(typeof input.seed!=='string'||!/^[a-f0-9]{32}$/.test(input.seed))throw new LocalError('INVALID_COLLECTION_PLAN');
 const canonical=new Map(keywords.map(keyword=>[normalize(keyword),keyword])),used=new Set();
 const order=input.order.map(value=>{
  const key=typeof value==='string'?normalize(value):'',keyword=canonical.get(key);
  if(!keyword||used.has(key))throw new LocalError('INVALID_COLLECTION_PLAN');
  used.add(key);return keyword;
 });
 return {version:2,order,seed:input.seed,filters:{sortBy:filterValue(input.filters,'sortBy',FILTERS.sortBy),publishTime:filterValue(input.filters,'publishTime',FILTERS.publishTime)}};
}
module.exports={randomPlan,planSpec,MAX_LIMIT,DEFAULT_FILTERS};
