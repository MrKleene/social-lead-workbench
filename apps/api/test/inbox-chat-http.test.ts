import 'reflect-metadata';
import {afterAll,beforeAll,it,expect} from 'vitest';
import {Global,Module,type INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {Db} from '../src/common/db';
import {InboxModule} from '../src/inbox/inbox.module';
import {DM_EXECUTOR} from '../src/direct-messages/dm-executor';
import {configure} from '../src/bootstrap';
let role='ADMIN';const session={findUnique:async()=>({csrfToken:'fixture',expiresAt:new Date(Date.now()+60000),user:{id:'fixture',role,active:true,name:'Fixture',email:'fixture@example.invalid'}})};
@Global() @Module({providers:[{provide:Db,useValue:{session,$queryRaw:async()=>[{accountId:'fixture',unread:2,latestBody:'模拟',latestChannel:'DM',latestAt:null}]}}],exports:[Db]})class TestDb{}
let app:INestApplication;const cookie='crm_session='+'a'.repeat(64);
beforeAll(async()=>{const mod=await Test.createTestingModule({imports:[TestDb,InboxModule]}).overrideProvider(DM_EXECUTOR).useValue({available:()=>false,supportsReplies:()=>false}).compile();app=mod.createNestApplication({bodyParser:false});configure(app);await app.init()});afterAll(async()=>app.close());
it('chat routes are session protected, private and admin only',async()=>{for(const path of ['capability','conversations','messages','requests/fixture']){expect((await request(app.getHttpServer()).get('/api/inbox/chat/'+path)).status).toBe(401);role='SALES';expect((await request(app.getHttpServer()).get('/api/inbox/chat/'+path).set('Cookie',cookie)).status).toBe(403)}role='ADMIN';const r=await request(app.getHttpServer()).get('/api/inbox/chat/capability').set('Cookie',cookie);expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('no-store, private');expect(r.body.sendingAvailable).toBe(false)});
it.each(['prepare','confirm'])('chat %s requires explicit CSRF and rejects invalid requests without DB/platform calls',async path=>{const call=()=>request(app.getHttpServer()).post('/api/inbox/chat/'+path).set('Cookie',cookie);expect((await call().send({})).status).toBe(403);role='SALES';expect((await call().set('Origin','http://127.0.0.1:5173').set('x-csrf-token','fixture').send({})).status).toBe(403);role='ADMIN';expect((await call().set('Origin','http://127.0.0.1:5173').set('x-csrf-token','fixture').send({})).status).toBe(400)});

it('account summary is admin-only and private',async()=>{expect((await request(app.getHttpServer()).get('/api/inbox/account-summaries')).status).toBe(401);role='SALES';expect((await request(app.getHttpServer()).get('/api/inbox/account-summaries').set('Cookie',cookie)).status).toBe(403);role='ADMIN';const r=await request(app.getHttpServer()).get('/api/inbox/account-summaries').set('Cookie',cookie);expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('no-store, private');expect(r.body[0]).toMatchObject({accountId:'fixture',unread:2})});
