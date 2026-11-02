import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeServer} from '../server.mjs';

async function serve(t){const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}/assets/ambient-music.mp3`}
test('audio can be streamed in byte ranges without serving the full file',async t=>{
 const url=await serve(t),original=await readFile(new URL('../assets/ambient-music.mp3',import.meta.url));
 const response=await fetch(url,{headers:{range:'bytes=0-31'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.equal(response.headers.get('content-range'),`bytes 0-31/${original.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(0,32));
 const suffix=await fetch(url,{headers:{range:'bytes=-16'}});assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),original.subarray(-16));
});
test('an out-of-bounds audio range returns 416',async t=>{
 const response=await fetch(await serve(t),{headers:{range:'bytes=999999999-'}});assert.equal(response.status,416);assert.match(response.headers.get('content-range'),/^bytes \*\/\d+$/);
});
