import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {makeServer} from '../server.mjs';

const rawGet=(url,headers={})=>new Promise((resolve,reject)=>{request(url,{headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}))}).on('error',reject).end()});
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'stillscape-http-'));await mkdir(join(root,'assets'));await writeFile(join(root,'index.html'),'<h1>Stillscape</h1>');const body='/* scene styles */\n.scene{color:#fff;background:#102027}\n'.repeat(500),hash=createHash('sha256').update(body).digest('hex').slice(0,12),path=`/assets/style.${hash}.css`;await writeFile(join(root,path),body);const server=makeServer({root});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true})});return {url:`http://127.0.0.1:${server.address().port}`,path,body,root}}

test('fingerprinted resources use immutable browser caching while HTML revalidates',async t=>{const f=await fixture(t),asset=await rawGet(f.url+f.path),html=await rawGet(f.url+'/');assert.equal(asset.status,200);assert.equal(asset.headers['cache-control'],'public, max-age=31536000, immutable');assert.equal(html.headers['cache-control'],'no-cache');assert.equal(html.body.toString(),'<h1>Stillscape</h1>')});
test('Brotli and gzip preserve content and negotiate encoding-specific ETags',async t=>{const f=await fixture(t),br=await rawGet(f.url+f.path,{'accept-encoding':'br, gzip'});assert.equal(br.headers['content-encoding'],'br');assert.equal(brotliDecompressSync(br.body).toString(),f.body);const gz=await rawGet(f.url+f.path,{'accept-encoding':'br;q=0, gzip;q=1'});assert.equal(gz.headers['content-encoding'],'gzip');assert.equal(gunzipSync(gz.body).toString(),f.body);assert.notEqual(gz.headers.etag,br.headers.etag);const hit=await rawGet(f.url+f.path,{'accept-encoding':'br','if-none-match':br.headers.etag});assert.equal(hit.status,304);assert.equal(hit.body.length,0);assert.equal(hit.headers.vary,'Accept-Encoding')});
test('changed source files invalidate the server buffer cache',async t=>{const f=await fixture(t);await writeFile(join(f.root,'app.js'),'console.log("first")');const first=await rawGet(f.url+'/app.js');await writeFile(join(f.root,'app.js'),'console.log("updated source")');const second=await rawGet(f.url+'/app.js',{'if-none-match':first.headers.etag});assert.equal(second.status,200);assert.notEqual(second.headers.etag,first.headers.etag);assert.match(second.body.toString(),/updated source/)});
