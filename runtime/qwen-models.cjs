// Reviewed official Beijing non-thinking JSON Schema models. No live discovery or fallback.
'use strict';
const DEFAULT_QWEN_MODEL='qwen3.7-flash-2026-07-15';
const QWEN_PRICE_VERSION='beijing-2026-10-21';
const catalog=Object.freeze({
 'qwen3.8-flash':[[1000000,0.8,2.7]],
 'qwen3.7-flash-2026-07-15':[[32000,0.2,0.8],[256000,0.6,2.4],[1000000,1.2,4.8]],
 'qwen3.7-plus-2026-05-26':[[256000,2,8],[1000000,6,24]],
 'qwen3.8-max-0902':[[1000000,12,36]],
});
function qwenModel(model){
 if(!Object.hasOwn(catalog,model))return null;
 const tiers=catalog[model];
 if(!tiers?.length||!tiers.every(t=>t.length===3&&t.every(n=>Number.isFinite(n)&&n>0)))return null;
 return {id:model,priceVersion:QWEN_PRICE_VERSION,priceAck:model+':'+QWEN_PRICE_VERSION,priceDescription:tiers.map(([up,input,output])=>'输入≤'+up+' token：输入/输出 '+input+'/'+output+' 元/百万token').join('；')};
}
module.exports={DEFAULT_QWEN_MODEL,QWEN_PRICE_VERSION,qwenModel};
