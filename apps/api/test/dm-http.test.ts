import 'reflect-metadata';
import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {Test} from '@nestjs/testing';
import {Global,Module,type INestApplication} from '@nestjs/common';
import request from 'supertest';
import {DirectMessagesModule} from '../src/direct-messages/direct-messages.module';
import {Db} from '../src/common/db';
import {configure} from '../src/bootstrap';
const state={role:'ADMIN'};
const session={findUnique:vi.fn(async()=>({csrfToken:'synthetic-csrf',expiresAt:new Date(Date.now()+60000),user:{id:'synthetic',role:state.role,active:true,name:'Synthetic',email:'synthetic@example.invalid'}}))};
@Global() @Module({providers:[{provide:Db,useValue:{session}}],exports:[Db]}) class TestDb{}
let app:INestApplication;
beforeAll(async()=>{const mod=await Test.createTestingModule({imports:[TestDb,DirectMessagesModule]}).compile();app=mod.createNestApplication({bodyParser:false});configure(app);await app.init();});
afterAll(async()=>app.close());
const cookie=`crm_session=${'a'.repeat(64)}`;
it('requires session and admin for capability',async()=>{expect((await request(app.getHttpServer()).get('/api/direct-messages/capability?platform=XHS')).status).toBe(401);state.role='SALES';expect((await request(app.getHttpServer()).get('/api/direct-messages/capability?platform=XHS').set('Cookie',cookie)).status).toBe(403);state.role='ADMIN';const r=await request(app.getHttpServer()).get('/api/direct-messages/capability?platform=XHS').set('Cookie',cookie);expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('no-store, private');expect(r.body.sendingAvailable).toBe(false);});
it('preview enforces CSRF and strict input',async()=>{const base=()=>request(app.getHttpServer()).post('/api/direct-messages/preview').set('Cookie',cookie);expect((await base().send({})).status).toBe(403);expect((await base().set('Origin','http://127.0.0.1:5173').send({})).status).toBe(403);expect((await base().set('Origin','http://127.0.0.1:5173').set('x-csrf-token','synthetic-csrf').send({send:true})).status).toBe(400);});
it.each(['send','confirm','inbox','messages'])('has no unsupported %s route',async path=>{expect((await request(app.getHttpServer()).post('/api/direct-messages/'+path).set('Cookie',cookie).send({})).status).toBe(404);});
