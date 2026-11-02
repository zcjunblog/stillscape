import {mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {join,parse} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {transform} from 'esbuild';
const dest='dist/shijing',sizes=[];
await rm(dest,{recursive:true,force:true});await mkdir(join(dest,'assets'),{recursive:true});
async function output(name,data,{fingerprinted=false,text=false,originalBytes=data.length}={}){
 if(fingerprinted){const {name:stem,ext}=parse(name),hash=createHash('sha256').update(data).digest('hex').slice(0,12);name=`assets/${stem}.${hash}${ext}`}
 await writeFile(join(dest,name),data);const row={file:name,source_bytes:originalBytes,bytes:Buffer.byteLength(data)};
 if(text){const gz=gzipSync(data,{level:9}),br=brotliCompressSync(data,{params:{[constants.BROTLI_PARAM_QUALITY]:11}});await Promise.all([writeFile(join(dest,name+'.gz'),gz),writeFile(join(dest,name+'.br'),br)]);row.gzip_bytes=gz.length;row.brotli_bytes=br.length}
 sizes.push(row);return name;
}
const image=await output('scene-12.jpg',await readFile('assets/scene-12.jpg'),{fingerprinted:true});
const music=await output('ambient-music.mp3',await readFile('assets/ambient-music.mp3'),{fingerprinted:true});
const css=await readFile('style.css','utf8'),js=await readFile('app.js','utf8');
const style=await output('style.css',(await transform(css,{loader:'css',minify:true,target:'es2022',legalComments:'none',charset:'utf8'})).code,{fingerprinted:true,text:true,originalBytes:Buffer.byteLength(css)});
const app=await output('app.js',(await transform(js.replaceAll('assets/ambient-music.mp3',music),{loader:'js',minify:true,target:'es2022',legalComments:'none',charset:'utf8'})).code,{fingerprinted:true,text:true,originalBytes:Buffer.byteLength(js)});
const html=await readFile('index.html','utf8');await output('index.html',html.replaceAll('assets/scene-12.jpg',image).replace('href="style.css"',`href="${style}"`).replace('src="app.js"',`src="${app}"`),{text:true,originalBytes:Buffer.byteLength(html)});
for(const file of ['api.mjs','server.mjs','LICENSE','THIRD_PARTY.md'])await copyFile(file,join(dest,file));
await writeFile(join(dest,'README.md'),(await readFile('README.md','utf8')).replace(/!\[Stillscape 预览\]\(docs\/preview\.png\)\n/,''));
const pkg=JSON.parse(await readFile('package.json','utf8'));for(const script of ['test','build','preview'])delete pkg.scripts[script];delete pkg.devDependencies;await writeFile(join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await mkdir('qa',{recursive:true});await writeFile('qa/build-sizes.json',JSON.stringify({assets:sizes},null,2)+'\n');console.log(dest);
