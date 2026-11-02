import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as tick} from 'node:timers/promises';
import {JSDOM} from 'jsdom';

const records=Array.from({length:120},(_,i)=>({id:`360:${1000+i}`,source:'360',sourceId:String(1000+i),category:'9',name:`风景 ${i+1}`,tags:['风景',String(i+1)],width:2560,height:1440,resolution:'2560 × 1440',quality:'QHD',original:`https://p2.qhimg.com/bdr/__85/t01${1000+i}.jpg`,image:`https://p2.qhimg.com/bdm/1920_1080_85/t01${1000+i}.jpg`,thumb:`https://p2.qhimg.com/bdm/320_200_75/t01${1000+i}.jpg`,credit:'图片来源：360 壁纸',createdAt:'2022-01-18 12:00:00',downloadable:true}));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick()}throw Error('Application did not settle')}
async function boot(t,{playResult=()=>Promise.resolve(),cache=null,storageFails=false}={}){
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'http://localhost:4178/',pretendToBeVisual:true});const {window}=dom,doc=window.document;
 if(cache!==null)window.localStorage.setItem('stillscape-api-cache-v1',JSON.stringify(cache));
 if(storageFails)window.Storage.prototype.setItem=function(){throw Error('Quota exceeded')};
 const requests=[];
 const originals=new Map();let disposed=false;const timers=new Set(),gates=new Map();const realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout;
 function install(key,value){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 for(const [key,value] of Object.entries({window,document:doc,localStorage:window.localStorage,innerWidth:1440,innerHeight:900,matchMedia:query=>({matches:query.includes('reduced-motion'),addEventListener(){}}),requestAnimationFrame:callback=>realSet(()=>{if(!disposed)callback(performance.now())},0),cancelAnimationFrame:realClear}))install(key,value);
 install('setTimeout',(callback,ms,...args)=>{const timer=realSet(()=>{timers.delete(timer);if(!disposed)callback(...args)},ms);timers.add(timer);return timer});
 install('clearTimeout',timer=>{timers.delete(timer);realClear(timer)});
 install('fetch',async input=>{requests.push(String(input));const url=new URL(String(input),'http://localhost');if(url.pathname==='/api/categories')return Response.json({categories:[{id:'9',name:'风景大片'}]});if(url.pathname==='/api/wallpapers'){const start=Number(url.searchParams.get('start')||0),count=Number(url.searchParams.get('count')||24),items=records.slice(start,start+count);return Response.json({items,total:120,nextStart:start+items.length,hasMore:start+items.length<120})}throw Error('Unexpected fixture request: '+url.pathname)});
 install('Image',function(){const image=doc.createElement('img');image.decode=()=>gates.get(image.getAttribute('src'))?.promise||Promise.resolve();return image});
 window.HTMLElement.prototype.animate=function(){return {cancel(){},pause(){},play(){},finished:Promise.resolve()}};
 const paused=new WeakMap();window.HTMLMediaElement.prototype.play=function(){return playResult().then(()=>{paused.set(this,false)})};window.HTMLMediaElement.prototype.pause=function(){paused.set(this,true)};Object.defineProperty(window.HTMLMediaElement.prototype,'paused',{get(){return paused.get(this)??true}});
 const strip=doc.querySelector('#filmstrip');strip.scrollTo=({left})=>{strip.scrollLeft=left};
 t.after(async()=>{for(const gate of gates.values())gate.resolve();await tick();await tick();disposed=true;for(const timer of timers)realClear(timer);dom.window.close();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}});
 await import(new URL('../app.js?selection-test='+Math.random(),import.meta.url));
 await until(()=>doc.querySelectorAll('.film').length===24&&doc.querySelector('#scene-position').textContent==='01');
 return {doc,strip,requests,storage:window.localStorage,async append(count){doc.querySelector('#film-more').click();await until(()=>doc.querySelectorAll('.film').length===count);await tick()},async choose(index){doc.querySelector(`.film[data-index="${index}"]`).click();await until(()=>Number(doc.querySelector('#scene-position').textContent)===index+1)},holdImage(index){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});const gate={promise,resolve};gates.set(records[index].image,gate);return Object.assign(resolve,{reject})}};
}

test('appending a page retains the selected thumbnail node, focus and scroll position',async t=>{
 const app=await boot(t);await app.choose(20);const chosen=app.doc.querySelector('.film[aria-pressed="true"]');chosen.focus();app.strip.scrollLeft=1680;
 await app.append(48);
 assert.strictEqual(app.doc.querySelector('.film[aria-pressed="true"]'),chosen,'the selected button must remain the same DOM node');assert.strictEqual(app.doc.activeElement,chosen);assert.equal(app.strip.scrollLeft,1680);assert.equal(app.doc.querySelectorAll('.film[aria-pressed="true"]').length,1);
});

test('a page arriving during image decoding cannot replace the pending selection with the previous image',async t=>{
 const app=await boot(t);await app.append(48);await app.append(72);await app.choose(63);const release=app.holdImage(68);const pending=app.doc.querySelector('.film[data-index="68"]');pending.click();assert.equal(app.doc.querySelector('#scene-position').textContent,'64');assert.equal(pending.getAttribute('aria-pressed'),'true');
 await app.append(96);
 assert.equal(app.doc.querySelector('.film[aria-pressed="true"]')?.dataset.index,'68','append must not restore the previous image selection');assert.strictEqual(app.doc.querySelector('.film[aria-pressed="true"]'),pending,'append must retain the pending selection while the old image is still visible');release();await until(()=>app.doc.querySelector('#scene-position').textContent==='69');assert.strictEqual(app.doc.querySelector('.film[aria-pressed="true"]'),pending);assert.equal(app.doc.querySelectorAll('.film[aria-pressed="true"]').length,1);
});

test('a stale decoded image cannot steal selection after another choice and a page append',async t=>{
 const app=await boot(t);const release=app.holdImage(21);app.doc.querySelector('.film[data-index="21"]').click();await app.choose(22);const latest=app.doc.querySelector('.film[data-index="22"]');await app.append(48);release();await tick();await tick();assert.equal(app.doc.querySelector('#scene-position').textContent,'23');assert.strictEqual(app.doc.querySelector('.film[aria-pressed="true"]'),latest);assert.equal(latest.getAttribute('aria-pressed'),'true');
});

test('music stays off until requested and can be switched off again',async t=>{
 const {doc}=await boot(t);const button=doc.querySelector('#music-toggle'),audio=doc.querySelector('#ambient-audio');
 assert.ok(button,'music control is available');assert.ok(audio);assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(audio.getAttribute('src'),null);assert.equal(audio.paused,true);
 button.click();await until(()=>button.getAttribute('aria-pressed')==='true');assert.equal(audio.paused,false);assert.equal(audio.loop,true);assert.equal(audio.getAttribute('src'),'assets/ambient-music.mp3');
 button.click();assert.equal(button.getAttribute('aria-pressed'),'false');
 await new Promise(r=>setTimeout(r,750));assert.equal(audio.paused,true);assert.equal(audio.volume,0);
});

test('music playback rejection restores the switch and allows retry',async t=>{
 let attempts=0;const {doc}=await boot(t,{playResult:()=>++attempts===1?Promise.reject(Error('Unavailable')):Promise.resolve()});const button=doc.querySelector('#music-toggle');assert.ok(button);
 button.click();await tick();await tick();assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(button.hasAttribute('aria-busy'),false);assert.match(doc.querySelector('#toast').textContent,/音乐/);
 button.click();await until(()=>button.getAttribute('aria-pressed')==='true');
});

test('turning music off while play is pending prevents late playback',async t=>{
 let release;const started=new Promise(r=>release=r);const {doc}=await boot(t,{playResult:()=>started});const button=doc.querySelector('#music-toggle');assert.ok(button);
 button.click();button.click();release();await tick();await tick();assert.equal(button.getAttribute('aria-pressed'),'false');assert.equal(doc.querySelector('#ambient-audio').paused,true);
});

const cachedPages=expires=>[
 {path:'/api/categories',expires,data:{categories:[{id:'9',name:'风景大片'}]}},
 {path:'/api/wallpapers?category=9&start=0&count=24',expires,data:{items:records.slice(0,24),total:120,nextStart:24,hasMore:true}}
];
test('fresh local catalog cache renders the gallery without waiting for API requests',async t=>{
 const app=await boot(t,{cache:cachedPages(Date.now()+60000)});assert.equal(app.requests.length,0);assert.equal(app.doc.querySelectorAll('.film').length,24);await app.choose(3);assert.equal(app.doc.querySelector('#scene-position').textContent,'04');
});
test('expired local catalog entries are refreshed from the API',async t=>{
 const app=await boot(t,{cache:cachedPages(Date.now()-1)});assert.equal(app.requests.length,2);const stored=JSON.parse(app.storage.getItem('stillscape-api-cache-v1'));assert.ok(stored.every(entry=>entry.expires>Date.now()));
});
test('corrupt cached payloads cannot break gallery loading',async t=>{
 const entries=cachedPages(Date.now()+60000);entries[1].data.items='broken';const app=await boot(t,{cache:entries});assert.equal(app.requests.length,1);assert.equal(app.doc.querySelectorAll('.film').length,24);
});
test('unavailable local storage leaves browsing and pagination usable',async t=>{
 const app=await boot(t,{storageFails:true});await app.append(48);assert.equal(app.doc.querySelectorAll('.film').length,48);
});

test('revisiting a decoded image does not wait for a new image decode',async t=>{
 const app=await boot(t);const first=app.doc.querySelector('.scene-frame.current img');await app.choose(5);app.holdImage(0);await app.choose(0);assert.strictEqual(app.doc.querySelector('.scene-frame.current img'),first);
});
test('the next image is decoded before the user selects it',async t=>{
 const app=await boot(t);await tick();await tick();app.holdImage(1);await app.choose(1);assert.equal(app.doc.querySelector('#scene-position').textContent,'02');
});
test('an unprepared destination shows its available thumbnail before the full image finishes',async t=>{
 const app=await boot(t),release=app.holdImage(10),thumb=app.doc.querySelector('.film[data-index="10"] img');Object.defineProperty(thumb,'complete',{value:true});Object.defineProperty(thumb,'naturalWidth',{value:320});
 app.doc.querySelector('.film[data-index="10"]').click();await tick();assert.equal(app.doc.querySelector('#scene-position').textContent,'11');assert.equal(app.doc.querySelector('.scene-frame.current img').getAttribute('src'),records[10].thumb);assert.equal(app.doc.querySelector('#loading-state').hidden,true);
 release();await until(()=>app.doc.querySelector('.scene-frame.current img').getAttribute('src')===records[10].image);assert.equal(app.doc.querySelectorAll('.scene-frame').length,1);
});

test('a late full image cannot replace a more recently selected preview',async t=>{
 const app=await boot(t),first=app.holdImage(10),second=app.holdImage(11);
 for(const index of [10,11]){const thumb=app.doc.querySelector(`.film[data-index="${index}"] img`);Object.defineProperty(thumb,'complete',{value:true});Object.defineProperty(thumb,'naturalWidth',{value:320});app.doc.querySelector(`.film[data-index="${index}"]`).click()}
 first();await tick();assert.equal(app.doc.querySelector('#scene-position').textContent,'12');assert.equal(app.doc.querySelector('.scene-frame.current img').getAttribute('src'),records[11].thumb);
 second();await until(()=>app.doc.querySelector('.scene-frame.current img').getAttribute('src')===records[11].image);assert.equal(app.doc.querySelectorAll('.scene-frame').length,1);
});
test('a failed full image keeps the preview usable and can be retried',async t=>{
 const app=await boot(t),failed=app.holdImage(10),thumb=app.doc.querySelector('.film[data-index="10"] img');Object.defineProperty(thumb,'complete',{value:true});Object.defineProperty(thumb,'naturalWidth',{value:320});app.doc.querySelector('.film[data-index="10"]').click();failed.reject(Error('image failed'));await tick();await tick();assert.equal(app.doc.querySelector('#scene-position').textContent,'11');assert.equal(app.doc.querySelector('.scene-frame.current img').getAttribute('src'),records[10].thumb);
 const retry=app.holdImage(10);app.doc.querySelector('.film[data-index="10"]').click();retry();await until(()=>app.doc.querySelector('.scene-frame.current img').getAttribute('src')===records[10].image);
});

test('the friend list closes on outside click and Escape restores its trigger focus',async t=>{
 const {doc}=await boot(t),list=doc.querySelector('#friend-links'),trigger=list?.querySelector('summary');assert.ok(trigger,'the friend list has an accessible native trigger');
 trigger.click();assert.equal(list.open,true);doc.body.click();assert.equal(list.open,false);
 trigger.click();const first=list.querySelector('a');first.focus();first.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(list.open,false);assert.strictEqual(doc.activeElement,trigger);
});
test('Space on the friend trigger remains available to native disclosure behavior',async t=>{
 const {doc}=await boot(t),trigger=doc.querySelector('#friend-links summary');assert.ok(trigger);const event=new doc.defaultView.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});trigger.dispatchEvent(event);assert.equal(event.defaultPrevented,false);assert.equal(doc.querySelector('#experience').classList.contains('zen'),false);
});
