import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('PHP adapter preserves browsing and download contracts with bounded source access',async()=>{
 const {stdout,stderr}=await promisify(execFile)('php',['-d','display_errors=stderr','-d','error_reporting=32767','test/php-api.test.php'],{cwd:new URL('..',import.meta.url)});
 assert.equal(stderr,'');const result=JSON.parse(stdout);assert.equal(result.passed,true);assert.equal(result.checks.length,19);
});

test('PHP cURL transport stops at redirects, response size limits and timeouts',async t=>{
 const {createServer}=await import('node:http');let reachedTarget=0;const timers=[];
 const server=createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{location:'/target'});res.end('redirect')}else if(req.url==='/target'){reachedTarget++;res.end('target')}else if(req.url==='/large')res.end('x'.repeat(100));else timers.push(setTimeout(()=>res.end('late'),1800))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{timers.forEach(clearTimeout);server.closeAllConnections();return new Promise(resolve=>server.close(resolve))});
 const base=`http://127.0.0.1:${server.address().port}`;
 const run=async(path,limit=1000)=>{const {stdout,stderr}=await promisify(execFile)('php',['-d','display_errors=stderr','-r',`require 'php/api.php';try{echo json_encode(StillscapeApi::fetch($argv[1],(int)$argv[2],1));}catch(StillscapeHttpError $e){echo json_encode(['error'=>$e->status]);}`,base+path,String(limit)],{cwd:new URL('..',import.meta.url)});assert.equal(stderr,'');return JSON.parse(stdout)};
 assert.equal((await run('/redirect')).status,302);assert.equal(reachedTarget,0);assert.equal((await run('/large',10)).error,502);assert.equal((await run('/slow')).error,504);
});
