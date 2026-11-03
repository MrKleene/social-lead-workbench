import {describe,it,expect} from 'vitest';
import {clearArchivedRunUrl,clearedRunId} from './archived-run-location';
describe('archived navigation cleanup',()=>{
 it('removes only the retired task and task-scoped view, keeping configuration',()=>{
  const next=clearArchivedRunUrl('/automation?config=c&run=old&stage=review&fresh=1&post=p&reviewVersion=7#workspace-main','old');
  expect(next).toBe('/automation?config=c&stage=collect#workspace-main');
 });
 it('cleans a remembered workspace route without losing its destination or filters',()=>{
  expect(clearArchivedRunUrl('/work?module=archive&run=old&config=c&view=new','old')).toBe('/work?module=archive&config=c&view=new');
 });
 it('does not strip a valid different run, invalid unconfirmed run, or unrelated URL',()=>{
  for(const url of ['/automation?run=new&stage=review','/automation?run=bad','/configuration?tab=model','/home'])expect(clearArchivedRunUrl(url,'old')).toBe(url);
 });
 it('treats the navigation signal as typed, local history metadata',()=>{
  expect(clearedRunId(null)).toBe('');expect(clearedRunId({archivedRunId:4})).toBe('');expect(clearedRunId({archivedRunId:'old'})).toBe('old');
 });
});
