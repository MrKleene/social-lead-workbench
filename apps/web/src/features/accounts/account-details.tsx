import {InfoSection} from '@/components/information-panel';
import type {Account} from './types';
import {accountState} from './account-presentation';
export function AccountDetails({account:a}:{account:Account}){
 return <InfoSection title="账号与核验记录"><dl>
  <dt>平台账号 ID</dt><dd>{a.loginPlatformUserId||'尚未获取'}</dd>
  <dt>系统账号编号</dt><dd>{a.id}</dd>
  <dt>登录状态</dt><dd>{accountState({...a,systemBlockReason:null,status:'UNCONNECTED'})}</dd>
  <dt>上次登录验证（不代表持续在线）</dt><dd>{a.loginVerifiedAt?new Date(a.loginVerifiedAt).toLocaleString():'尚未验证'}</dd>
  <dt>执行设备编号</dt><dd>{a.sessionReference?.deviceId||'未关联'}</dd>
  <dt>本机会话</dt><dd>{a.sessionReference?'已登记，执行前核验':'未登记'}</dd>
  <dt>今日回复额度</dt><dd>已用 {a.occupied} / {a.dailyLimit} 条（{a.day}）</dd>
  <dt>额度说明</dt><dd>已用包含已确认、发送中和结果未知的占用；同一账号的任务共用。真实回复按北京时间每日计算。</dd>
  <dt>风险记录</dt><dd>{a.systemBlockReason||(a.status==='RESTRICTED'?'平台限制待核查':'没有账号级限制记录；发送前仍需核验')}</dd>
 </dl></InfoSection>;
}
