'use strict';
// 系统内置配置：随应用发布的一组默认配置，启动时写入 configurations 表（builtin=1）。
//
// 内置项对用户只读（不可编辑、不可删除），内容完全由应用维护：启动时比对
// kind/name/body，与下面定义不一致就强制覆盖；一致则不写库，避免每次启动都
// bump revision 并连带吊销审核授权。内容真的变了会走 syncReviewPolicy，
// 使旧的审核与自动化授权失效，需要用户重新确认。
//
// 调整内容：改下面 definitions 的 name / body 即可，已安装实例下次启动自动同步。
const definitions=Object.freeze([
 {id:'builtin-keywords',kind:'KEYWORDS',name:'系统默认采集关键词',body:{keywords:[
  '论文选题','毕业论文选题','开题选题','开题报告','论文提纲',
  '开题框架','本科论文选题','论文选题怎么定','开题选题避雷','开题报告框架',
  '论文选题思路','开题思路怎么写','毕业论文选题推荐','文科论文选题','公管论文选题',
  '学前教育论文选题','经管开题选题','论文选题方向','开题研究方向','文献综述思路',
  '新颖论文选题','好写的论文选题','小众开题选题','论文选题参考','开题框架参考'
 ]}},
 {id:'builtin-matching',kind:'MATCHING',name:'系统默认评论匹配规则',body:{text:'评论内容是一个学科专业'}},
 // 模板 1 沿用最早的 id：改 id 会让已安装实例留下一条不可删除的孤儿内置项。
 {id:'builtin-comment-template',kind:'COMMENT_TEMPLATE',name:'系统默认评论回复模板1',body:{text:'童靴， 开题   各种 资料 模板 🈚️长 需要发你嘛'}},
 {id:'builtin-comment-template-2',kind:'COMMENT_TEMPLATE',name:'系统默认评论回复模板2',body:{text:'宝儿，🈚️ 常滴    选题   开题报告  需要帮助嘛'}},
 {id:'builtin-comment-template-3',kind:'COMMENT_TEMPLATE',name:'系统默认评论回复模板3',body:{text:'宝宝，不要 💰    选题   开题报告  需要嘛'}},
 {id:'builtin-comment-template-4',kind:'COMMENT_TEMPLATE',name:'系统默认评论回复模板4',body:{text:'宝子需要无常选题嘛  我这边可以专业帮你推荐几个好写的哦'}},
 // 私信模板与评论模板同文案：两条渠道各存一份，改一边不会同步另一边。
 {id:'builtin-dm-template',kind:'DM_TEMPLATE',name:'系统默认私信模板1',body:{text:'童靴， 开题   各种 资料 模板 🈚️长 需要发你嘛'}},
 {id:'builtin-dm-template-2',kind:'DM_TEMPLATE',name:'系统默认私信模板2',body:{text:'宝儿，🈚️ 常滴    选题   开题报告  需要帮助嘛'}},
 {id:'builtin-dm-template-3',kind:'DM_TEMPLATE',name:'系统默认私信模板3',body:{text:'宝宝，不要 💰    选题   开题报告  需要嘛'}},
 {id:'builtin-dm-template-4',kind:'DM_TEMPLATE',name:'系统默认私信模板4',body:{text:'宝子需要无常选题嘛  我这边可以专业帮你推荐几个好写的哦'}}
].map(definition=>Object.freeze(definition)));
module.exports={definitions};
