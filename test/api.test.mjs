import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../api.mjs';
const wall={id:'2054148',class_id:'9',resolution:'2560x1440',url:'http://p2.qhimg.com/bdr/__85/t01593365222eb4780e.jpg',utag:'雪山 树林 高原',tag:'_category_雪山_',create_time:'2022-01-18 12:00:00',ad_url:'https://example.invalid/ad'};
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
const request=path=>new Request('http://localhost'+path);
test('rejects invalid pagination before contacting the upstream',async()=>{
 const api=createApi({fetcher:()=>{throw Error('Unexpected upstream request')}});
 for(const query of ['category=9&start=-1','category=9&count=500','category=../../','category=9&start=1.5'])assert.equal((await api(request('/api/wallpapers?'+query))).status,400);
});
test('normalizes live records, uses HTTPS and preserves pagination',async()=>{
 const api=createApi({fetcher:async url=>{assert.equal(new URL(url).searchParams.get('start'),'24');return json({errno:'0',total:'10000',data:[wall]})}});
 const response=await api(request('/api/wallpapers?category=9&start=24&count=24'));assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.items[0].id,'360:2054148');assert.equal(data.items[0].width,2560);assert.equal(data.items[0].image,'https://p2.qhimg.com/bdm/1920_1080_85/t01593365222eb4780e.jpg');assert.equal(data.nextStart,25);assert.equal(data.hasMore,true);assert.equal(data.total,10000);assert.equal(data.items[0].ad_url,undefined);
});
test('coalesces identical upstream requests and caches successful JSON',async()=>{
 let calls=0;const api=createApi({fetcher:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return json({errno:'0',total:'1',data:[wall]})}});
 const responses=await Promise.all([api(request('/api/wallpapers?category=9')),api(request('/api/wallpapers?category=9'))]);
 assert.equal(responses[0].status,200);assert.deepEqual(await responses[0].json(),await responses[1].json());assert.equal(calls,1);
 const cached=await api(request('/api/wallpapers?category=9'));assert.equal(cached.headers.get('x-cache'),'HIT');assert.equal((await cached.json()).items.length,1);assert.equal(calls,1);
});
test('converts upstream business errors to 502 without caching the failure',async()=>{
 let attempt=0;const api=createApi({fetcher:async()=>++attempt===1?json({errno:'1',errmsg:'failed',data:[]}):json({errno:'0',total:1,data:[wall]})});
 assert.equal((await api(request('/api/wallpapers?category=9'))).status,502);assert.equal((await api(request('/api/wallpapers?category=9'))).status,200);
});
test('treats malformed successful payloads as upstream failures',async()=>{
 const api=createApi({fetcher:async()=>json({errno:'0',total:'50',data:null})});assert.equal((await api(request('/api/wallpapers?category=9'))).status,502);
});
test('normalizes Bing metadata and retains source credit',async()=>{
 const api=createApi({fetcher:async()=>json({images:[{startdate:'20261102',urlbase:'/th?id=OHR.Test_ZH-CN1234567890',title:'海岸',copyright:'海岸 © Author',wp:true}]})});
 const response=await api(request('/api/bing?start=0&count=8'));assert.equal(response.status,200);const d=await response.json();assert.equal(d.items[0].source,'bing');assert.equal(d.items[0].credit,'海岸 © Author');assert.equal(d.items[0].original,'https://cn.bing.com/th?id=OHR.Test_ZH-CN1234567890_UHD.jpg');
});
test('rejects non-allowlisted image requests including misleading hosts and ports',async()=>{
 const api=createApi({fetcher:()=>{throw Error('Unexpected outbound request')}});
 for(const url of ['http://127.0.0.1/secret','https://p2.qhimg.com.evil.example/a.jpg','https://p2.qhimg.com:8080/bdr/__85/t012345.jpg','https://p2.qhimg.com/../../secret','https://cn.bing.com/search?q=test'])assert.equal((await api(request('/api/download?url='+encodeURIComponent(url)))).status,400);
});
test('streams JPEG downloads with an attachment filename',async()=>{
 const bytes=new Uint8Array([255,216,255,217]);const api=createApi({fetcher:async()=>new Response(bytes,{headers:{'content-type':'image/jpeg','content-length':'4'}})});
 const response=await api(request('/api/download?url='+encodeURIComponent(wall.url.replace('http:','https:'))+'&size=original'));assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment; filename="wallpaper-/);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
});
test('does not follow image redirects to untrusted hosts',async()=>{
 let calls=0;const api=createApi({fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}})}});
 assert.equal((await api(request('/api/download?url='+encodeURIComponent(wall.url.replace('http:','https:'))))).status,502);assert.equal(calls,1);
});
test('does not serve HTML from an image endpoint',async()=>{
 const api=createApi({fetcher:async()=>new Response('<html>failure</html>',{headers:{'content-type':'text/html'}})});assert.equal((await api(request('/api/download?url='+encodeURIComponent(wall.url.replace('http:','https:'))))).status,502);
});
test('returns a retryable timeout response instead of successful empty data',async()=>{
 const api=createApi({fetcher:async()=>{throw new DOMException('Timed out','TimeoutError')}});const response=await api(request('/api/wallpapers?category=9'));assert.equal(response.status,504);assert.equal(typeof (await response.json()).error,'string');
});
test('refreshes expired metadata instead of serving an indefinitely frozen library',async()=>{
 let clock=0,calls=0;const api=createApi({now:()=>clock,fetcher:async()=>json({errno:'0',total:1,data:[{...wall,id:String(2054148+calls++)}]})});
 assert.equal((await (await api(request('/api/wallpapers?category=9'))).json()).items[0].id,'360:2054148');clock=300001;assert.equal((await (await api(request('/api/wallpapers?category=9'))).json()).items[0].id,'360:2054149');
});
test('paginates Bing beyond its clamped index without repeating the previous page',async()=>{
 const dates=['20261026','20261025','20261024','20261023','20261022','20261021','20261020','20261019'];
 const api=createApi({fetcher:async url=>{assert.equal(new URL(url).searchParams.get('idx'),'7');return json({images:dates.map(date=>({startdate:date,urlbase:'/th?id=OHR.Test_ZH-CN'+date,title:'风景',copyright:'© Author',wp:true}))})}});
 const response=await api(request('/api/bing?start=8&count=8'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.items.length,7);assert.equal(data.items[0].id,'bing:20261025');assert.equal(data.nextStart,15);assert.equal(data.total,15);assert.equal(data.hasMore,false);
});
