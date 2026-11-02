import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';

test('release references content-hashed assets with matching precompressed representations',async()=>{
 await promisify(execFile)(process.execPath,['build.mjs'],{cwd:new URL('..',import.meta.url)});
 const root=new URL('../dist/shijing/',import.meta.url),html=await readFile(new URL('index.html',root),'utf8');
 const script=/src="(assets\/app\.[a-f0-9]{12}\.js)"/.exec(html)?.[1],style=/href="(assets\/style\.[a-f0-9]{12}\.css)"/.exec(html)?.[1];
 assert.ok(script,'HTML must load the fingerprinted script');assert.ok(style);
 for(const name of ['index.html',script,style]){
  const raw=await readFile(new URL(name,root));if(name!=='index.html')assert.ok(name.includes(createHash('sha256').update(raw).digest('hex').slice(0,12)));
  assert.deepEqual(brotliDecompressSync(await readFile(new URL(name+'.br',root))),raw);assert.deepEqual(gunzipSync(await readFile(new URL(name+'.gz',root))),raw);
 }
 const js=await readFile(new URL(script,root),'utf8'),music=/assets\/ambient-music\.[a-f0-9]{12}\.mp3/.exec(js)?.[0];assert.ok(music);assert.deepEqual(await readFile(new URL(music,root)),await readFile(new URL('../assets/ambient-music.mp3',import.meta.url)));
});
