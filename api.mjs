const UPSTREAM='http://wallpaper.apc.360.cn/index.php';
const MAX_IMAGE_BYTES=32*1024*1024;
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const bad=message=>{throw new HttpError(400,message)};
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':status===200?'public, max-age=60':'no-store','x-content-type-options':'nosniff',...headers}});
function integer(params,key,fallback,min,max){const value=params.get(key)??String(fallback);if(!/^\d+$/.test(value)||Number(value)<min||Number(value)>max)bad(`参数 ${key} 超出允许范围`);return Number(value)}
function imageURL(value){let url;try{url=new URL(value)}catch{bad('图片地址无效')}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)bad('不支持的图片地址');
 const qh=/^(?:p|browser)\d{1,2}\.qhimg\.com$/.test(url.hostname)&&/^\/(?:bdr\/__\d{1,3}|bdm\/\d{1,5}_\d{1,5}_\d{1,3})\/t[0-9a-f]{8,80}\.(?:jpg|jpeg|png|webp)$/.test(url.pathname)&&!url.search;
 const bing=['cn.bing.com','www.bing.com'].includes(url.hostname)&&url.pathname==='/th'&&/^OHR\.[\w.-]+(?:_UHD|_\d+x\d+)\.jpg$/.test(url.searchParams.get('id')||'')&&[...url.searchParams.keys()].every(key=>['id','w','h','c','qlt','pid','rf'].includes(key));
 if(!qh&&!bing)bad('该图片地址不在允许的来源中');return url;
}
function resize(url,width,height,quality=85){const copy=new URL(url);if(copy.hostname.endsWith('.qhimg.com'))copy.pathname=copy.pathname.replace(/\/(?:bdr\/__\d+|bdm\/\d+_\d+_\d+)\//,`/bdm/${width}_${height}_${quality}/`);else{copy.searchParams.set('w',String(width));copy.searchParams.set('h',String(height));copy.searchParams.set('c','7')}return copy.href}
function text(value,max=200){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function normalizeWall(item,category){if(!/^\d{1,14}$/.test(String(item.id)))return null;let original;try{original=imageURL(String(item.url).replace(/^http:/,'https:'))}catch{return null}
 const match=/^(\d{2,5})x(\d{2,5})$/.exec(String(item.resolution));if(!match)return null;const width=Number(match[1]),height=Number(match[2]);
 const tags=[...new Set(text(item.utag,180).split(/\s+/).filter(Boolean))];if(!tags.length)for(const found of String(item.tag||'').matchAll(/_category_([^_]+)_/g))tags.push(text(found[1],30));
 const previewWidth=Math.min(width,1920),previewHeight=Math.round(previewWidth*height/width);
 return {id:`360:${item.id}`,source:'360',sourceId:String(item.id),category:String(category),name:text(tags.slice(0,2).join(' · ')||`壁纸 ${item.id}`,60),tags:tags.slice(0,8),width,height,resolution:`${width} × ${height}`,quality:width>=3840?'4K UHD':width>=2560?'QHD':'FULL HD',original:original.href,image:resize(original,previewWidth,previewHeight),thumb:resize(original,320,200,75),credit:'图片来源：360 壁纸',createdAt:text(item.create_time,30),downloadable:true};
}
function normalizeBing(item){const base=new URL(item.urlbase,'https://cn.bing.com');if(base.origin!=='https://cn.bing.com'||base.pathname!=='/th'||!/^OHR\.[\w.-]+$/.test(base.searchParams.get('id')||''))return null;
 const original=new URL(base);original.searchParams.set('id',base.searchParams.get('id')+'_UHD.jpg');const image=new URL(base);image.searchParams.set('id',base.searchParams.get('id')+'_1920x1080.jpg');
 return {id:`bing:${text(item.startdate,8)}`,source:'bing',sourceId:text(item.startdate,8),category:'bing',name:text(item.title||item.copyright,60),tags:[text(item.copyright,180)],width:3840,height:2160,resolution:'3840 × 2160',quality:'4K UHD',original:imageURL(original.href).href,image:imageURL(image.href).href,thumb:resize(image,320,200,75),credit:text(item.copyright,250),createdAt:text(item.startdate,8),downloadable:item.wp!==false};
}
export function createApi({fetcher=fetch,now=Date.now}={}){
 const cache=new Map(),inflight=new Map();
 async function upstream(url,{json=true}={}){let response;try{response=await fetcher(String(url),{signal:AbortSignal.timeout(json?15000:25000),redirect:'manual',headers:{'user-agent':'Shijing-Wallpaper/1.0','accept':json?'application/json':'image/avif,image/webp,image/*'}})}catch(error){throw new HttpError(error.name==='TimeoutError'||error.name==='AbortError'?504:502,'壁纸来源暂时无法连接，请稍后重试')}
  if(!response.ok)throw new HttpError(502,'壁纸来源返回异常响应');if(!json)return response;
  if(Number(response.headers.get('content-length'))>2*1024*1024)throw new HttpError(502,'壁纸来源响应过大');
  try{return await response.json()}catch{throw new HttpError(502,'壁纸来源数据格式异常')}
 }
 async function memo(key,ttl,load){const saved=cache.get(key);if(saved&&saved.expires>now())return [saved.data,'HIT'];if(inflight.has(key))return [await inflight.get(key),'COALESCED'];const promise=load();inflight.set(key,promise);try{const data=await promise;cache.set(key,{data,expires:now()+ttl});while(cache.size>200)cache.delete(cache.keys().next().value);return [data,'MISS']}finally{inflight.delete(key)}}
 return async function handle(request){try{
  const url=new URL(request.url),p=url.searchParams;if(request.method!=='GET'&&request.method!=='HEAD')return reply({error:'仅支持 GET 请求'},405,{allow:'GET, HEAD'});
  if(url.pathname==='/api/categories'){
   const [result,state]=await memo('categories',3600000,async()=>{const u=new URL(UPSTREAM);u.search=new URLSearchParams({c:'WallPaper',a:'getAllCategoriesV2',from:'360chrome'});const data=await upstream(u);if(String(data.errno)!=='0'||!Array.isArray(data.data))throw new HttpError(502,'壁纸分类暂时不可用');return {categories:data.data.filter(x=>/^\d+$/.test(String(x.id))).map(x=>({id:String(x.id),name:text(x.name,40)})),source:'360'}});return reply(result,200,{'x-cache':state});
  }
  if(url.pathname==='/api/wallpapers'){
   const category=p.get('category')||'9';if(!/^\d{1,4}$/.test(category))bad('壁纸分类无效');const start=integer(p,'start',0,0,20000),count=integer(p,'count',24,1,48);
   const key=`360:${category}:${start}:${count}`;const [result,state]=await memo(key,300000,async()=>{const u=new URL(UPSTREAM);u.search=new URLSearchParams({c:'WallPaper',a:'getAppsByCategory',cid:category,start:String(start),count:String(count),from:'360chrome'});const data=await upstream(u);if(String(data.errno)!=='0'||!Array.isArray(data.data)||!Number.isFinite(Number(data.total)))throw new HttpError(502,'壁纸来源数据异常，请稍后重试');const items=data.data.map(x=>normalizeWall(x,category)).filter(Boolean);if(data.data.length&&!items.length)throw new HttpError(502,'暂时没有可用的图片地址');const nextStart=start+data.data.length;return {source:'360',category,items,total:Math.max(0,Number(data.total)),start,nextStart,hasMore:data.data.length>0&&nextStart<Number(data.total)}});return reply(result,200,{'x-cache':state});
  }
  if(url.pathname==='/api/bing'){
   const start=integer(p,'start',0,0,14),count=integer(p,'count',8,1,8);const [result,state]=await memo(`bing:${start}:${count}`,900000,async()=>{const u=new URL('https://cn.bing.com/HPImageArchive.aspx');const upstreamStart=Math.min(start,7),offset=start-upstreamStart;u.search=new URLSearchParams({format:'js',idx:String(upstreamStart),n:String(Math.min(8,count+offset)),mkt:'zh-CN'});const data=await upstream(u);if(!Array.isArray(data.images))throw new HttpError(502,'必应壁纸暂时不可用');const items=data.images.slice(offset,offset+count).map(normalizeBing).filter(Boolean);if(data.images.slice(offset,offset+count).length&&!items.length)throw new HttpError(502,'必应图片地址异常');const nextStart=start+items.length;return {source:'bing',category:'bing',items,total:15,start,nextStart,hasMore:items.length>0&&nextStart<15}});return reply(result,200,{'x-cache':state});
  }
  if(url.pathname==='/api/download'){
   let image=imageURL(p.get('url')||'');const size=p.get('size')||'original';if(!['original','1920x1080','2560x1440','3840x2160'].includes(size))bad('不支持的下载尺寸');if(size!=='original'){const [w,h]=size.split('x').map(Number);if(image.hostname.endsWith('.bing.com')){const id=image.searchParams.get('id').replace(/_(?:UHD|\d+x\d+)\.jpg$/,'');image.searchParams.set('id',`${id}_${size}.jpg`);image.searchParams.delete('w');image.searchParams.delete('h');image.searchParams.delete('c')}else image=new URL(resize(image,w,h,100))}
   const upstreamResponse=await upstream(image,{json:false}),type=(upstreamResponse.headers.get('content-type')||'').split(';')[0];if(!['image/jpeg','image/png','image/webp','image/avif'].includes(type))throw new HttpError(502,'来源没有返回有效图片');if(Number(upstreamResponse.headers.get('content-length'))>MAX_IMAGE_BYTES)throw new HttpError(502,'图片超出下载大小限制');
   const extension=type==='image/jpeg'?'jpg':type.split('/')[1];const imageId=(image.pathname.split('/').pop()||image.searchParams.get('id')||'image').replace(/[^a-zA-Z0-9_-]/g,'').slice(-70);let seen=0;
   const body=upstreamResponse.body?.pipeThrough(new TransformStream({transform(chunk,controller){seen+=chunk.byteLength;if(seen>MAX_IMAGE_BYTES)throw Error('Image exceeded size limit');controller.enqueue(chunk)}}));
   return new Response(body,{headers:{'content-type':type,'content-disposition':`attachment; filename="wallpaper-${imageId}-${size}.${extension}"`,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff',...(upstreamResponse.headers.get('content-length')?{'content-length':upstreamResponse.headers.get('content-length')}:{})}});
  }
  return reply({error:'接口不存在'},404);
 }catch(error){return reply({error:error instanceof HttpError?error.message:'请求暂时无法完成，请稍后重试'},error instanceof HttpError?error.status:502)}};
}
