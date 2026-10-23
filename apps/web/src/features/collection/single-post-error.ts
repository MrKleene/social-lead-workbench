import {ApiError} from '../../lib/api';
/** Fixed copy only: backend error text may contain a note reference. Never echo it. */
export function singlePostError(error:unknown):string {
 if(!(error instanceof ApiError))return '连接中断或响应不可用，未取得检查结果。是否已执行尚不确定，请先核查；不会自动重试。';
 if(error.status===400){
  if(error.message==='请提供含有效访问引用的小红书原文链接')return '链接格式未通过检查（HTTP 400），尚未开始账号核验。请从小红书地址栏复制完整原文链接。';
  if(error.message==='本机只读服务未启用')return '本机只读服务未启用（HTTP 400），尚未开始检查。';
  if(error.message==='请求格式无效；未执行')return '请求格式无效（HTTP 400），尚未执行检查。';
  return '检查请求被拒绝（HTTP 400），未取得诊断结果。请核查链接与当前设置；不会自动重试。';
 }
 if(error.status===401)return '工作台登录已过期（HTTP 401），请重新登录工作台；不代表小红书账号失效。';
 if(error.status===403){
  if(error.message==='CSRF 校验失败'||error.message==='请求来源验证失败')return '工作台安全校验未通过（HTTP 403），请刷新当前页面后重新确认；尚未开始账号核验。';
  return '没有执行本次检查的权限（HTTP 403）。请核查工作台账号权限；不会自动重试。';
 }
 if(error.status===409)return '检查请求发生冲突（HTTP 409）。请先核查正在进行或已提交的任务；不会自动重试。';
 if(error.status===404)return '单帖检查入口不可用（HTTP 404），请核查前后端版本；不会自动重试。';
 if(error.status===429)return '请求受限（HTTP 429）。请等待限制解除；不会自动重试。';
 const code=Number.isInteger(error.status)&&error.status>=400&&error.status<=599?`（HTTP ${error.status}）`:'';
 return `服务未返回检查结果${code}。是否已执行尚不确定，请先核查；不会自动重试。`;
}
