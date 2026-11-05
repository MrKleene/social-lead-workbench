import 'reflect-metadata';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Subject} from 'rxjs';
import {InboxController} from '../src/inbox/inbox.module';
describe('inbox authenticated live refresh',()=>{
 let session:any,store:any,c:InboxController,events:any[],s:any;
 beforeEach(()=>{vi.useFakeTimers();session={expiresAt:new Date(Date.now()+120000),user:{active:true,role:'ADMIN'},refreshGrantId:null};store={db:{session:{findUnique:vi.fn(async()=>session)}},changed:new Subject()};c=new InboxController(store,{}as any);events=[];s=c.events({actor:{role:'ADMIN'},sessionId:'fake'}as any).subscribe(x=>events.push(x))});
 afterEach(()=>{s.unsubscribe();c.onModuleDestroy();vi.useRealTimers()});
 it('initial catchup, changes, low frequency heartbeat carry no message content',async()=>{await vi.advanceTimersByTimeAsync(0);store.changed.next();await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(15000);expect(events).toHaveLength(3);expect(Object.keys(events[0].data)).toEqual(['at'])});
 it.each(['expired','revoked','role','inactive'])('stops on live auth change: %s',async mode=>{await vi.advanceTimersByTimeAsync(0);if(mode==='expired')session.expiresAt=new Date(0);if(mode==='role')session.user.role='SALES';if(mode==='inactive')session.user.active=false;if(mode==='revoked'){session.refreshGrantId='g';session.refreshGrant={revokedAt:new Date(),expiresAt:new Date(Date.now()+100000)}}store.changed.next();await vi.advanceTimersByTimeAsync(0);expect(s.closed).toBe(true);expect(events).toHaveLength(1)});
 it('sales cannot subscribe',()=>expect(()=>c.events({actor:{role:'SALES'}}as any)).toThrow());
 it('shutdown and disconnect release subscriptions and timers',async()=>{await vi.advanceTimersByTimeAsync(0);c.onModuleDestroy();expect(s.closed).toBe(true);const n=store.db.session.findUnique.mock.calls.length;store.changed.next();await vi.advanceTimersByTimeAsync(60000);expect(store.db.session.findUnique).toHaveBeenCalledTimes(n)});
});
