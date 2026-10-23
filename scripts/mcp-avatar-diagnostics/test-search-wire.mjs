// Consume only controlled synthetic observation lines from the loopback Go tests.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {safeSearchObservation,safeSearchAttempts} from '../../packages/contracts/dist/index.js';
const text=await readFile(process.argv[2],'utf8');
const rows=text.split('\n').filter(s=>s.includes('SEARCH_OBSERVATION_FIXTURE ')).map(s=>JSON.parse(s.split('SEARCH_OBSERVATION_FIXTURE ')[1]));
assert.equal(rows.length,17,'all loopback cases must provide evidence');
for(const raw of rows){const d=safeSearchObservation(raw);assert(d,`Rejected synthetic state: ${raw.state}`);assert(safeSearchAttempts([{keywordOrdinal:1,requestStep:2,evidence:'AVAILABLE',returnedCount:d.acceptedCount,observation:d}]));assert(!JSON.stringify(d).includes('SYNTHETIC_'));}
console.log('17 actual Go/browser observations accepted by the strict workbench persistence contract; no URLs or content');
