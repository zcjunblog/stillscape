import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {createApi} from './api.mjs';
const defaultRoot=fileURLToPath(new URL('.',import.meta.url));
const files=new Set(['/index.html','/style.css','/app.js']);
const assetPath=/^\/assets\/[a-zA-Z0-9_-]+(?:\.[a-f0-9]{12})?\.(jpg|jpeg|png|webp|svg|ico|m4a|mp3|js|css)$/;
const fingerprint=/\.[a-f0-9]{12}\.[a-z0-9]+$/;
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',m4a:'audio/mp4',mp3:'audio/mpeg'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.qhimg.com https://cn.bing.com https://www.bing.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
const digest=data=>createHash('sha256').update(data).digest('base64url').slice(0,18);
function encodingFor(header=''){
 const qualities=new Map(header.split(',').map(part=>{const [name,...params]=part.trim().split(';');const q=params.find(p=>p.trim().startsWith('q='));return [name.trim().toLowerCase(),q?Number(q.trim().slice(2)):1]}));
 return ['br','gzip'].map(name=>({name,q:qualities.get(name)??qualities.get('*')??0})).filter(x=>x.q>0).sort((a,b)=>b.q-a.q)[0]?.name||'identity';
}
function compress(data,encoding){return encoding==='br'?brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:5}}):encoding==='gzip'?gzipSync(data):data}
export function makeServer({root=defaultRoot}={}){
 const api=createApi(),buffers=new Map();
 async function load(path){
  const disk=join(root,path),metadata=await stat(disk),cached=buffers.get(path);
  if(cached&&cached.modified===metadata.mtimeMs&&cached.size===metadata.size)return cached;
  const raw=await readFile(disk),entry={disk,raw,tag:digest(raw),modified:metadata.mtimeMs,size:metadata.size,encoded:new Map()};
  buffers.set(path,entry);while(buffers.size>32)buffers.delete(buffers.keys().next().value);return entry;
 }
 async function representation(entry,encoding){
  if(encoding==='identity')return entry.raw;
  if(!entry.encoded.has(encoding)){
   let data;try{const side=entry.disk+(encoding==='br'?'.br':'.gz');if((await stat(side)).mtimeMs<entry.modified)throw Error('Stale compression');data=await readFile(side)}catch{data=compress(entry.raw,encoding)}
   entry.encoded.set(encoding,data);
  }
  return entry.encoded.get(encoding);
 }
 return createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-security-policy',csp);
  if(url.pathname.startsWith('/api/')){
   const response=await api(new Request(url,{method:req.method,headers:req.headers}));
   for(const [key,value] of response.headers)res.setHeader(key,value);
   if(response.headers.get('content-type')?.startsWith('application/json')){
    const raw=Buffer.from(await response.arrayBuffer()),encoding=encodingFor(req.headers['accept-encoding']);res.setHeader('vary','Accept-Encoding');
    if(encoding!=='identity')res.setHeader('content-encoding',encoding);
    const data=compress(raw,encoding);res.setHeader('content-length',data.length);res.writeHead(response.status);return res.end(req.method==='HEAD'?undefined:data);
   }
   res.writeHead(response.status);if(req.method==='HEAD'||!response.body)return res.end();await pipeline(Readable.fromWeb(response.body),res);return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{allow:'GET, HEAD'});return res.end()}
  const path=url.pathname==='/'?'/index.html':url.pathname;
  if(!files.has(path)&&!assetPath.test(path)){res.writeHead(404);return res.end('Not found')}
  const entry=await load(path),type=types[path.split('.').pop()]||'application/octet-stream',text=/^(text\/|image\/svg)/.test(type);
  const encoding=text?encodingFor(req.headers['accept-encoding']):'identity',etag='"'+entry.tag+'-'+encoding+'"';
  res.setHeader('etag',etag);res.setHeader('cache-control',fingerprint.test(path)?'public, max-age=31536000, immutable':'no-cache');res.setHeader('content-type',type);res.setHeader('last-modified',new Date(entry.modified).toUTCString());
  if(text)res.setHeader('vary','Accept-Encoding');
  if(encoding!=='identity')res.setHeader('content-encoding',encoding);
  if((req.headers['if-none-match']||'').split(/,\s*/).includes(etag)){res.writeHead(304);return res.end()}
  let data=entry.raw;
  if(type.startsWith('audio/')){
   res.setHeader('accept-ranges','bytes');const range=req.headers.range;
   if(range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range),size=data.byteLength;
    const start=match?.[1]?Number(match[1]):match?.[2]?Math.max(0,size-Number(match[2])):NaN;
    const end=match?.[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
    if(!Number.isSafeInteger(start)||start<0||start>=size||end<start){res.writeHead(416,{'content-range':`bytes */${size}`});return res.end()}
    data=data.subarray(start,end+1);res.writeHead(206,{'content-range':`bytes ${start}-${end}/${size}`,'content-length':data.byteLength});return res.end(req.method==='HEAD'?undefined:data);
   }
  }
  data=await representation(entry,encoding);res.setHeader('content-length',data.length);res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);
 }catch(error){if(res.headersSent){res.destroy();return}res.writeHead(error.code==='ENOENT'?404:500,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(error.code==='ENOENT'?'Not found':'服务暂时不可用')}});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT)||4178,host=process.env.HOST||'127.0.0.1';makeServer().listen(port,host,()=>console.log(`Stillscape ready: http://${host}:${port}`))}
