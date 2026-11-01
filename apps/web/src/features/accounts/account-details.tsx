import {InfoSection} from '@/components/information-panel';
import type {Account} from './types';
import type {accountStatusView} from './account-status';
export function AccountDetails({account:a,status,admin}:{account:Account;status:ReturnType<typeof accountStatusView>|null;admin:boolean}){
 const verifiedAt=a.sessionReference?.verifiedAt||a.loginVerifiedAt;
 return <InfoSection title="账号与核验记录"><dl>
  <dt>平台账号 ID</dt><dd>{a.loginPlatformUserId||'尚未获取'}</dd>
  <dt>系统账号编号</dt><dd>{a.id}</dd>
  <dt>登录状态</dt><dd>{status?.login||'登录状态待核查'}</dd>
  <dt>采集能力</dt><dd>{status?.collection||'尚未获取资格'}</dd>
  <dt>回复能力</dt><dd>{status?.reply||'尚未获取资格'}</dd>
  <dt>上次登录核验</dt><dd>{verifiedAt?new Date(verifiedAt).toLocaleString():'尚无核验记录'}</dd>
  {admin&&<><dt>上次回复资格检查</dt><dd>{status?.checkedAt?new Date(status.checkedAt).toLocaleString():'尚无检查记录'}</dd></>}
  <dt>自动核验</dt><dd>采集启动和回复执行前，系统自动核验；历史检查不代表持续在线或保证可发送。</dd>
  <dt>执行设备编号</dt><dd>{a.sessionReference?.deviceId||'未关联'}</dd>
  <dt>本机会话</dt><dd>{a.sessionReference?'已登记，执行前自动核验':'未登记'}</dd>
  <dt>今日回复额度</dt><dd>已用 {a.occupied} / {a.dailyLimit} 条（{a.day}）</dd>
  <dt>额度说明</dt><dd>已用包含已确认、发送中和结果未知的占用；同一账号的任务共用。真实回复按北京时间每日计算。</dd>
  <dt>风险记录</dt><dd>{status?.issue||'暂无账号级限制记录；执行前仍会检查'}{status?.issue?.includes('历史')&&'。历史限制不会因登录检查通过而解除。'}</dd>
 </dl></InfoSection>;
}
