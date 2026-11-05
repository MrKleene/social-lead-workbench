import {describe,it,expect} from 'vitest';
import {filters,receiverLabel,modeLabel,type Receiver} from './inbox-api';
import {activeNavigation,secondaryNavigation} from '@/components/app-navigation/navigation-model';
const r={state:'LISTENING',updatedAt:new Date().toISOString()}as Receiver;
describe('inbox presentation',()=>{
 it('does not claim unverified channels are realtime',()=>{expect(modeLabel('UNCONFIRMED')).toBe('推送待验证');expect(modeLabel('PUSH')).toBe('已收到推送')});
 it('stale receiver does not show an endless active spinner',()=>expect(receiverLabel({...r,updatedAt:new Date(0).toISOString()})).toBe('连接状态待恢复'));
 it('labels stop, reconnect and yielded separately',()=>{expect(receiverLabel({...r,state:'RECONNECTING'})).toBe('正在重连');expect(receiverLabel({...r,state:'STOPPED'})).toBe('已停止');expect(receiverLabel({...r,state:'YIELDED'})).toBe('已让出账号')});
 it('validates channel and pagination URL state',()=>{expect(filters(new URLSearchParams('channel=SECRET&page=-1')).channel).toBe('all');expect(filters(new URLSearchParams('page=2.5')).page).toBe(2);expect(filters(new URLSearchParams('unread=1')).unread).toBe(true)});
 it('admin-only inbox navigation and current highlight',()=>{expect(secondaryNavigation.find(x=>x.id==='inbox')?.adminOnly).toBe(true);expect(activeNavigation('/inbox','',true)).toBe('inbox');expect(activeNavigation('/inbox','',false)).toBeNull()});
});
