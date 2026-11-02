import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createApi} from './api.mjs';
const root=fileURLToPath(new URL('.',import.meta.url)),api=createApi();
const files=new Set(['/index.html','/style.css','/app.js']);
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',m4a:'audio/mp4',mp3:'audio/mpeg'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.qhimg.com https://cn.bing.com https://www.bing.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
export function makeServer(){return createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('content-security-policy',csp);
 if(url.pathname.startsWith('/api/')){const response=await api(new Request(url,{method:req.method,headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));if(req.method==='HEAD'||!response.body)return res.end();await pipeline(Readable.fromWeb(response.body),res);return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{allow:'GET, HEAD'});return res.end()}
 const path=url.pathname==='/'?'/index.html':url.pathname;if(!files.has(path)&&!/^\/assets\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg|ico|m4a|mp3)$/.test(path)){res.writeHead(404);return res.end('Not found')}
 const disk=join(root,path),metadata=await stat(disk),type=types[path.split('.').pop()]||'application/octet-stream';let data=await readFile(disk);const etag='"'+createHash('sha256').update(data).digest('base64url').slice(0,18)+'"';
 res.setHeader('etag',etag);res.setHeader('cache-control',path.startsWith('/assets/')?'public, max-age=86400':'no-cache');res.setHeader('content-type',type);res.setHeader('last-modified',metadata.mtime.toUTCString());
 if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end()}
 if(type.startsWith('audio/')){
  res.setHeader('accept-ranges','bytes');const range=req.headers.range;
  if(range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range),size=data.byteLength;
   const start=match?.[1]?Number(match[1]):match?.[2]?Math.max(0,size-Number(match[2])):NaN;
   const end=match?.[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
   if(!Number.isSafeInteger(start)||start<0||start>=size||end<start){res.writeHead(416,{'content-range':`bytes */${size}`});return res.end()}
   data=data.subarray(start,end+1);res.writeHead(206,{'content-range':`bytes ${start}-${end}/${size}`,'content-length':data.byteLength});return res.end(req.method==='HEAD'?undefined:data)
  }
 }
 if(/gzip/.test(req.headers['accept-encoding']||'')&&/^(text\/|application\/json)/.test(type)){data=gzipSync(data);res.setHeader('content-encoding','gzip');res.setHeader('vary','Accept-Encoding')}
 res.setHeader('content-length',data.byteLength);res.writeHead(200);res.end(req.method==='HEAD'?undefined:data);
 }catch(error){if(res.headersSent){res.destroy();return}res.writeHead(error.code==='ENOENT'?404:500,{'content-type':'text/plain; charset=utf-8'});res.end(error.code==='ENOENT'?'Not found':'服务暂时不可用')}})}
if(process.argv[1]===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT)||4178,host=process.env.HOST||'127.0.0.1';makeServer().listen(port,host,()=>console.log(`Shijing ready: http://${host}:${port}`))}
