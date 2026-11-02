import {mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {transform} from 'esbuild';
const dest='dist/shijing';await rm(dest,{recursive:true,force:true});await mkdir(join(dest,'assets'),{recursive:true});
for(const file of ['index.html','api.mjs','server.mjs','README.md','LICENSE','THIRD_PARTY.md'])await copyFile(file,join(dest,file));
for(const [file,loader] of [['app.js','js'],['style.css','css']]){const result=await transform(await readFile(file,'utf8'),{loader,minify:true,target:'es2022',legalComments:'none'});await writeFile(join(dest,file),result.code)}
for(const file of ['scene-12.jpg','ambient-music.mp3'])await copyFile(join('assets',file),join(dest,'assets',file));
const pkg=JSON.parse(await readFile('package.json','utf8'));delete pkg.scripts.test;delete pkg.scripts.build;delete pkg.devDependencies;await writeFile(join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n');console.log(dest);
