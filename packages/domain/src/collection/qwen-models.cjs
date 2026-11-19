// Reviewed official Beijing non-thinking JSON Schema models. No live discovery or fallback.
'use strict';
const DEFAULT_QWEN_MODEL='qwen4-max';
const QWEN_PRICE_VERSION='beijing-2026-11-20';
// 当前下拉只给三个本轮实测过（结构化输出、非思考参数、北京标准价）的型号；
// 旧型号留在受控目录里：已保存的选择继续可用、保留原价格版本，不会自动替换。
const catalog=Object.freeze({
 'qwen3.8-flash':{tiers:[[1000000,0.8,2.7]],version:'beijing-2026-10-21'},
 // Official model page checked 2026-10-26: standard input/output 12/36, max input 991K.
 'qwen3.8-max':{tiers:[[991000,12,36]],version:'beijing-2026-10-26'},
 'qwen3.7-flash-2026-07-15':{tiers:[[32000,0.2,0.8],[256000,0.6,2.4],[1000000,1.2,4.8]],version:'beijing-2026-10-21'},
 'qwen3.7-plus-2026-05-26':{tiers:[[256000,2,8],[1000000,6,24]],version:'beijing-2026-10-21'},
 'qwen3.8-max-0902':{tiers:[[1000000,12,36]],version:'beijing-2026-10-21'},
 'qwen4-max':{tiers:[[1000000,10,30]],version:QWEN_PRICE_VERSION},
 'kimi-k3.1-pro':{tiers:[[1048576,13,68]],version:QWEN_PRICE_VERSION},
 // 忙时 2/8、闲时 1/4；预算与授权按较高的忙时价计，避免低估。
 'deepseek-v4.1-flash':{tiers:[[1000000,2,8]],version:QWEN_PRICE_VERSION,note:'按忙时 8:00–22:00 计；闲时约半价'},
});
function qwenModel(model){
 if(!Object.hasOwn(catalog,model))return null;
 const {tiers,version,note}=catalog[model];
 if(!tiers?.length||!tiers.every(t=>t.length===3&&t.every(n=>Number.isFinite(n)&&n>0)))return null;
 const base=tiers.map(([up,input,output])=>'输入≤'+up+' token：输入/输出 '+input+'/'+output+' 元/百万token').join('；');
 return {id:model,priceTiers:tiers.map(([up,input,output])=>({upToInputTokens:up,inputCnyPerMillion:input,outputCnyPerMillion:output})),maxInputTokens:991808,maxOutputTokens:131072,contextTokens:1000000,priceVersion:version,priceAck:model+':'+version,priceDescription:note?base+'（'+note+'）':base};
}
function qwenModelChoices(savedModel){
 const ids=['qwen4-max','kimi-k3.1-pro','deepseek-v4.1-flash'];
 // Existing legacy selections retain their exact IDs and original price confirmation.
 if(savedModel&&!ids.includes(savedModel)&&qwenModel(savedModel))ids.push(savedModel);
 return ids.map(id=>{const model=qwenModel(id);return {id,priceDescription:model.priceDescription,priceVersion:model.priceVersion};});
}
module.exports={DEFAULT_QWEN_MODEL,QWEN_PRICE_VERSION,qwenModel,qwenModelChoices};
