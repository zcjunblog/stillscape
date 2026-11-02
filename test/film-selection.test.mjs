import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as tick} from 'node:timers/promises';
import {JSDOM} from 'jsdom';

const records=Array.from({length:120},(_,i)=>({id:`360:${1000+i}`,source:'360',sourceId:String(1000+i),category:'9',name:`风景 ${i+1}`,tags:['风景',String(i+1)],width:2560,height:1440,resolution:'2560 × 1440',quality:'QHD',original:`https://p2.qhimg.com/bdr/__85/t01${1000+i}.jpg`,image:`https://p2.qhimg.com/bdm/1920_1080_85/t01${1000+i}.jpg`,thumb:`https://p2.qhimg.com/bdm/320_200_75/t01${1000+i}.jpg`,credit:'图片来源：360 壁纸',createdAt:'2022-01-18 12:00:00',downloadable:true}));
async function until(check){for(let i=0;i<100;i++){if(check())return;await tick()}throw Error('Application did not settle')}
async function boot(t,{playResult=()=>Promise.resolve()}={}){
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'http://localhost:4178/',pretendToBeVisual:true});const {window}=dom,doc=window.document;
 const originals=new Map();let disposed=false;const timers=new Set(),gates=new Map();const realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout;
 function install(key,value){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true})}
 for(const [key,value] of Object.entries({window,document:doc,localStorage:window.localStorage,innerWidth:1440,innerHeight:900,matchMedia:query=>({matches:query.includes('reduced-motion'),addEventListener(){}}),requestAnimationFrame:callback=>realSet(()=>{if(!disposed)callback(performance.now())},0),cancelAnimationFrame:realClear}))install(key,value);
 install('setTimeout',(callback,ms,...args)=>{const timer=realSet(()=>{timers.delete(timer);if(!disposed)callback(...args)},ms);timers.add(timer);return timer});
 install('clearTimeout',timer=>{timers.delete(timer);realClear(timer)});
 install('fetch',async input=>{const url=new URL(String(input),'http://localhost');if(url.pathname==='/api/categories')return Response.json({categories:[{id:'9',name:'风景大片'}]});if(url.pathname==='/api/wallpapers'){const start=Number(url.searchParams.get('start')||0),count=Number(url.searchParams.get('count')||24),items=records.slice(start,start+count);return Response.json({items,total:120,nextStart:start+items.length,hasMore:start+items.length<120})}throw Error('Unexpected fixture request: '+url.pathname)});
 install('Image',function(){const image=doc.createElement('img');image.decode=()=>gates.get(image.getAttribute('src'))?.promise||Promise.resolve();return image});
 window.HTMLElement.prototype.animate=function(){return {cancel(){},pause(){},play(){},finished:Promise.resolve()}};
 const paused=new WeakMap();window.HTMLMediaElement.prototype.play=function(){return playResult().then(()=>{paused.set(this,false)})};window.HTMLMediaElement.prototype.pause=function(){paused.set(this,true)};Object.defineProperty(window.HTMLMediaElement.prototype,'paused',{get(){return paused.get(this)??true}});
 const strip=doc.querySelector('#filmstrip');strip.scrollTo=({left})=>{strip.scrollLeft=left};
 t.after(async()=>{for(const gate of gates.values())gate.resolve();await tick();await tick();disposed=true;for(const timer of timers)realClear(timer);dom.window.close();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}});
 await import(new URL('../app.js?selection-test='+Math.random(),import.meta.url));
 await until(()=>doc.querySelectorAll('.film').length===24&&doc.querySelector('#scene-position').textContent==='01');
 return {doc,strip,async append(count){doc.querySelector('#film-more').click();await until(()=>doc.querySelectorAll('.film').length===count);await tick()},async choose(index){doc.querySelector(`.film[data-index="${index}"]`).click();await until(()=>Number(doc.querySelector('#scene-position').textContent)===index+1)},holdImage(index){let resolve;const promise=new Promise(r=>resolve=r);const gate={promise,resolve};gates.set(records[index].image,gate);return resolve}};
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
