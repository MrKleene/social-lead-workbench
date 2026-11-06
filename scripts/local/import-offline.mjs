import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{LocalDatabase,requireNewDestination}=require('../../runtime/local/database.cjs'),{prepareLegacySnapshot,importLegacySnapshot}=require('../../runtime/local/legacy-import.cjs');
const [input,destination]=process.argv.slice(2);
if(!input||!destination||!path.isAbsolute(input)||!path.isAbsolute(destination)||fs.existsSync(destination))throw Error('Usage: import-offline ABSOLUTE_EXPORT_JSON ABSOLUTE_NEW_SQLITE_FILE; existing destinations are refused');
requireNewDestination(destination);
const stat=fs.lstatSync(input);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>536870912)throw Error('Invalid offline export');
const raw=JSON.parse(fs.readFileSync(input,'utf8')),snapshot=raw.format?raw:prepareLegacySnapshot(raw.tables||raw);let store,owned=false;
try{fs.closeSync(fs.openSync(destination,'wx',0o600));owned=true;store=new LocalDatabase(destination);const result=importLegacySnapshot(store,snapshot);console.log(JSON.stringify({...result,redaction:snapshot.redaction}));store.close();store=null;}
catch{store?.close();if(owned)for(const suffix of ['','-wal','-shm'])fs.rmSync(destination+suffix,{force:true});throw Error('Offline import rejected; source unchanged and no destination retained');}
