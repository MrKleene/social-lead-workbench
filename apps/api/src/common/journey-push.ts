import {Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {Client} from 'pg';
import {Subject} from 'rxjs';
import {journeyPushSchema,type JourneyPush} from '@crm/contracts';
export type PushSignal={type:'connection';available:boolean}|{type:'journey';data:JourneyPush};
/** One LISTEN connection per API process. Worker commits are the event source. */
@Injectable()
export class JourneyPushHub implements OnModuleInit,OnModuleDestroy {
 readonly signals=new Subject<PushSignal>();available=false;
 private ping?:ReturnType<typeof setInterval>;private client?:Client;private retry?:ReturnType<typeof setTimeout>;private stopped=false;private delay=1000;
 onModuleInit(){if(process.env.DATABASE_URL)void this.connect();}
 private async connect(){
  if(this.stopped)return;const client=new Client({connectionString:process.env.DATABASE_URL,application_name:'crm-journey-display',connectionTimeoutMillis:2000,query_timeout:2000,keepAlive:true,keepAliveInitialDelayMillis:15000});this.client=client;
  const failed=()=>{if(this.client!==client||this.stopped)return;this.client=undefined;if(this.ping)clearInterval(this.ping);this.available=false;this.signals.next({type:'connection',available:false});void client.end().catch(()=>{});if(!this.retry){this.retry=setTimeout(()=>{this.retry=undefined;void this.connect();},this.delay);this.retry.unref?.();this.delay=Math.min(30000,this.delay*2);}};
  client.on('error',failed);client.on('end',failed);
  client.on('notification',m=>{if(this.stopped||this.client!==client||m.channel!=='crm_journey_v1'||!m.payload||m.payload.length>2000)return;try{const parsed=journeyPushSchema.safeParse(JSON.parse(m.payload));if(parsed.success)this.signals.next({type:'journey',data:parsed.data});}catch{/* Invalid notifications cannot become UI facts. */}});
  try{await client.connect();const installed=await client.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'journey_push_%' AND NOT tgisinternal");if(installed.rows[0]?.n!==11)throw Error('PUSH_NOT_INSTALLED');await client.query('LISTEN crm_journey_v1');if(this.stopped||this.client!==client){await client.end().catch(()=>{});return;}this.available=true;this.delay=1000;this.signals.next({type:'connection',available:true});this.ping=setInterval(()=>{void client.query('SELECT 1').catch(failed);},15000);this.ping.unref?.();}catch{failed();}
 }
 async onModuleDestroy(){this.stopped=true;if(this.ping)clearInterval(this.ping);if(this.retry)clearTimeout(this.retry);this.signals.complete();const c=this.client;this.client=undefined;if(this.ping)clearInterval(this.ping);this.available=false;await c?.end().catch(()=>{});}
}
