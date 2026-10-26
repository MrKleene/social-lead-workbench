// Reviewed official Beijing non-thinking JSON Schema models. No live discovery or fallback.
'use strict';
const DEFAULT_QWEN_MODEL='qwen3.8-flash';
const QWEN_PRICE_VERSION='beijing-2026-10-21';
const catalog=Object.freeze({
 'qwen3.8-flash':[[1000000,0.8,2.7]],
 // Official model page checked 2026-10-26: standard input/output 12/36, max input 991K.
 'qwen3.8-max':[[991000,12,36]],
 'qwen3.7-flash-2026-07-15':[[32000,0.2,0.8],[256000,0.6,2.4],[1000000,1.2,4.8]],
 'qwen3.7-plus-2026-05-26':[[256000,2,8],[1000000,6,24]],
 'qwen3.8-max-0902':[[1000000,12,36]],
});
function qwenModel(model){
 if(!Object.hasOwn(catalog,model))return null;
 const tiers=catalog[model];
 if(!tiers?.length||!tiers.every(t=>t.length===3&&t.every(n=>Number.isFinite(n)&&n>0)))return null;
 const priceVersion=model==='qwen3.8-max'?'beijing-2026-10-26':QWEN_PRICE_VERSION;
 return {id:model,priceVersion,priceAck:model+':'+priceVersion,priceDescription:tiers.map(([up,input,output])=>'输入≤'+up+' token：输入/输出 '+input+'/'+output+' 元/百万token').join('；')};
}
function qwenModelChoices(savedModel){
 const ids=['qwen3.8-flash','qwen3.8-max','qwen3.8-max-0902'];
 // Existing 3.7 selections retain their exact IDs and original price confirmation.
 if(savedModel&&!ids.includes(savedModel)&&qwenModel(savedModel))ids.push(savedModel);
 return ids.map(id=>{const model=qwenModel(id);return {id,priceDescription:model.priceDescription,priceVersion:model.priceVersion};});
}
module.exports={DEFAULT_QWEN_MODEL,QWEN_PRICE_VERSION,qwenModel,qwenModelChoices};
