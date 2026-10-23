import {describe,it,expect} from 'vitest';
import {ApiError} from '../../lib/api';
import {singlePostError} from './single-post-error';
describe('safe single-post failure display',()=>{
 const secret='https://example.invalid/?token=FAKE_PRIVATE_REFERENCE';
 it.each([400,401,403,404,409,429,500,502,504])('safe HTTP %i classification',status=>{
  const text=singlePostError(new ApiError(status,secret));expect(text).toContain(`HTTP ${status}`);expect(text).not.toContain(secret);expect(text).not.toContain('FAKE_PRIVATE_REFERENCE');
 });
 it.each(['CSRF 校验失败','请求来源验证失败'])('known guard rejection does not blame XHS login: %s',message=>{expect(singlePostError(new ApiError(403,message))).toContain('尚未开始账号核验');});
 it('known invalid reference differs from account failure',()=>{const text=singlePostError(new ApiError(400,'请提供含有效访问引用的小红书原文链接'));expect(text).toContain('链接格式');expect(text).toContain('尚未开始账号核验');});
 it.each([new Error(secret),new ApiError(500,secret),null,new ApiError(NaN,secret)])('uncertain failures never claim not executed',error=>{expect(singlePostError(error)).toContain('是否已执行尚不确定');expect(singlePostError(error)).not.toContain(secret);});
});
