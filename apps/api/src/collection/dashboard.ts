import {historyDisplay} from '../common/db';
import type {Db} from '../common/db';
import {withCoveragePostLabels} from './run-coverage-labels';
/** Recent history is independent of the configuration picker's latest-run sample. */
export async function collectionDashboard(db:Db){
 db=historyDisplay(db);
 const [recent,active]=await Promise.all([
  db.collectionRun.findMany({orderBy:[{createdAt:'desc'},{id:'desc'}],take:6,include:{config:true}}),
  db.collectionRun.findMany({where:{status:{in:['QUEUED','RUNNING']}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100,include:{config:true}}),
 ]);
 const rows=[...new Map([...recent,...active].map(r=>[r.id,r])).values()];
 const configs=[...new Map(rows.map(r=>[r.configId,r.config])).values()].map(c=>({...c,runs:rows.filter(r=>r.configId===c.id).map(({config,...run})=>run)}));
 return withCoveragePostLabels(db,configs);
}
