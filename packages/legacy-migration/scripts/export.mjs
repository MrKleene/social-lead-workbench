// Explicit operator-only PostgreSQL export. Importing this module never connects.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),{legacyEntities,credentialFields,prepareLegacySnapshot}=require('@crm/local-runtime/legacy-import');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
export async function exportLegacy(client,{maxRows=2000000}={}){
 const tables=await client.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const tables={};let total=0;
  for(const table of legacyEntities){
   const columns=await tx.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",table);
   const names=columns.map(c=>c.column_name).filter(c=>!credentialFields.includes(c.toLowerCase()));if(!names.length)continue;
   const rows=await tx.$queryRawUnsafe('SELECT '+names.map(quote).join(',')+' FROM public.'+quote(table)+' LIMIT '+(maxRows-total+1));total+=rows.length;if(total>maxRows)throw Error('EXPORT_TOO_LARGE');
   // Preserve date strings and JSON, without Prisma model relations or authentication tables.
   tables[table]=JSON.parse(JSON.stringify(rows,(_key,value)=>typeof value==='bigint'?value.toString():value));
  }
  return tables;
 },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:120000});
 return {...prepareLegacySnapshot(tables),exportedAt:new Date().toISOString(),consistency:'POSTGRES_REPEATABLE_READ_READ_ONLY'};
}
async function main(){
 const [ack,destination]=process.argv.slice(2);if(ack!=='--ack-readonly-source'||!destination||!path.isAbsolute(destination)||process.argv.length!==4)throw Error('Use --ack-readonly-source ABSOLUTE_NEW_EXPORT_JSON');
 const connection=process.env.LOCAL_LEGACY_EXPORT_DATABASE_URL;if(!connection)throw Error('Explicit LOCAL_LEGACY_EXPORT_DATABASE_URL is required; .env is never loaded');
 const parent=fs.lstatSync(path.dirname(destination));if(!parent.isDirectory()||fs.realpathSync(path.dirname(destination))!==path.dirname(destination)||process.platform!=='win32'&&(parent.uid!==process.getuid()||(parent.mode&0o077)))throw Error('PRIVATE_EXPORT_DIRECTORY_REQUIRED');
 if(fs.existsSync(destination))throw Error('EXPORT_DESTINATION_EXISTS');
 const {PrismaClient}=await import('@prisma/client');const client=new PrismaClient({datasources:{db:{url:connection}},log:[]});let fd,owned=false;
 try{const snapshot=await exportLegacy(client);fd=fs.openSync(destination,'wx',0o600);owned=true;fs.writeFileSync(fd,JSON.stringify(snapshot));fs.fsyncSync(fd);fs.closeSync(fd);fd=null;console.log(JSON.stringify({exported:true,counts:Object.fromEntries(Object.entries(snapshot.tables).map(([name,rows])=>[name,rows.length])),credentialsExported:false}));}
 catch{if(fd!=null)fs.closeSync(fd);if(owned)fs.rmSync(destination,{force:true});throw Error('LEGACY_EXPORT_FAILED: source unchanged; check connection/schema privately');}
 finally{await client.$disconnect();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
