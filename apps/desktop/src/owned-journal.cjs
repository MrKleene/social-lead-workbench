'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readReplyJournal,journalRecordSchema}=require('../../../runtime/local/platform-provider.cjs');
async function readOwnedJournal(directory,attemptId,{platform=process.platform,checkPrivateFile}={}){
 if(platform!=='win32')return readReplyJournal(directory,attemptId);
 if(typeof checkPrivateFile!=='function'||typeof attemptId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(attemptId))return {state:'INVALID',records:[]};
 const file=path.join(directory,'reply-stage-'+attemptId+'.jsonl');let fd;
 try{
  checkPrivateFile(file);const before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>131072)return {state:'INVALID',records:[]};
  fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));const opened=fs.fstatSync(fd);if(!opened.isFile()||opened.nlink!==1||opened.dev!==before.dev||opened.ino!==before.ino||opened.size!==before.size)return {state:'INVALID',records:[]};
  const bytes=Buffer.alloc(131073),count=fs.readSync(fd,bytes,0,bytes.length,0);if(count>131072)return {state:'INVALID',records:[]};checkPrivateFile(file);const after=fs.lstatSync(file);if(after.dev!==opened.dev||after.ino!==opened.ino||after.size!==opened.size||after.isSymbolicLink())return {state:'INVALID',records:[]};
  const text=bytes.subarray(0,count).toString('utf8'),lines=text.split('\n');lines.pop();const records=[];for(const line of lines){const p=journalRecordSchema.safeParse(JSON.parse(line));if(!p.success||p.data.attemptId!==attemptId||p.data.sequence!==records.length+1||records.length>=64)return {state:'INVALID',records:[]};records.push(p.data);}return {state:text.endsWith('\n')&&records.length?'AVAILABLE':'TRUNCATED',records};
 }catch(error){return {state:error.code==='ENOENT'?'MISSING':'INVALID',records:[]};}finally{if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={readOwnedJournal};
