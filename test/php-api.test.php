<?php
declare(strict_types=1);
require __DIR__.'/../php/api.php';
function check(bool $ok,string $message):void {if(!$ok)throw new RuntimeException($message);}
function data(array $response):array {return json_decode($response['body'],true,512,JSON_THROW_ON_ERROR);}
$wall=['id'=>'2054148','resolution'=>'2560x1440','url'=>'http://p2.qhimg.com/bdr/__85/t01593365222eb4780e.jpg','utag'=>'雪山 树林 高原','create_time'=>'2022-01-18 12:00:00'];
$dir=sys_get_temp_dir().'/stillscape-test-'.bin2hex(random_bytes(6));mkdir($dir,0700);
$calls=0;$clock=1000;$fail=false;$redirect=false;$html=false;$timeout=false;$badPayload=false;$seen=[];
$transport=function(string $url,int $limit,int $seconds)use(&$calls,&$fail,&$redirect,&$html,&$timeout,&$badPayload,&$seen,$wall):array {
 $calls++;$seen[]=$url;if($timeout)throw new StillscapeHttpError(504,'连接超时');
 if($redirect)return ['status'=>302,'type'=>'text/html','body'=>'redirect'];
 if(str_contains($url,'qhimg.com'))return ['status'=>200,'type'=>$html?'text/html':'image/jpeg','body'=>$html?'<html>error</html>':"\xff\xd8\xff\xd9"];
 parse_str(parse_url($url,PHP_URL_QUERY),$q);
 if(isset($q['format']))return ['status'=>200,'type'=>'application/json','body'=>json_encode(['images'=>array_map(fn($date)=>['startdate'=>$date,'urlbase'=>'/th?id=OHR.Test_ZH-CN'.$date,'title'=>'风景','copyright'=>'© Author','wp'=>true],['20261026','20261025','20261024','20261023','20261022','20261021','20261020','20261019'])])];
 $payload=($q['a']??'')==='getAllCategoriesV2'?['errno'=>'0','data'=>[['id'=>'9','name'=>'风景大片']]]:['errno'=>$fail?'1':'0','total'=>'10000','data'=>$badPayload?null:[$wall]];
 return ['status'=>200,'type'=>'application/json','body'=>json_encode($payload)];
};
$api=new StillscapeApi($transport,fn()=>$GLOBALS['clock'],$dir);
try {
 foreach([['start'=>'-1'],['count'=>'500'],['category'=>'../'],['start'=>'1.5'],['count'=>['24']]] as $params)check($api->handle('wallpapers',$params)['status']===400,'reject invalid parameters');check($calls===0,'validation precedes outbound request');
 $response=$api->handle('wallpapers',['start'=>'24']);$d=data($response);check($response['status']===200&&$d['nextStart']===25&&$d['total']===10000&&$d['hasMore'],'pagination preserved');check($d['items'][0]['image']==='https://p2.qhimg.com/bdm/1920_1080_85/t01593365222eb4780e.jpg','HTTPS image normalization');check($d['items'][0]['name']==='雪山 · 树林','Chinese metadata preserved');$before=$calls;check($api->handle('wallpapers',['start'=>'24'])['headers']['X-Cache']==='HIT'&&$calls===$before,'disk cache hit');
 $other=new StillscapeApi($transport,fn()=>$GLOBALS['clock'],$dir);check($other->handle('wallpapers',['start'=>'24'])['headers']['X-Cache']==='HIT','cache shared between PHP requests');$clock+=301;check($api->handle('wallpapers',['start'=>'24'])['headers']['X-Cache']==='MISS','cache expires');
 $fail=true;check($api->handle('wallpapers',['start'=>'25'])['status']===502,'upstream business errors rejected');$fail=false;check($api->handle('wallpapers',['start'=>'25'])['status']===200,'failure not cached');
 $badPayload=true;check($api->handle('wallpapers',['start'=>'26'])['status']===502,'malformed payload rejected');$badPayload=false;
 $d=data($api->handle('categories',[]));check($d['categories'][0]['id']==='9','category contract');
 $d=data($api->handle('bing',['start'=>'8','count'=>'8']));check($d['items'][0]['id']==='bing:20261025'&&$d['nextStart']===15&&!$d['hasMore'],'Bing second page avoids duplicate day');check($d['items'][0]['credit']==='© Author','Bing credit preserved');
 $before=$calls;foreach(['http://127.0.0.1/secret','https://p2.qhimg.com.evil.example/bdr/__85/t01593365222eb4780e.jpg','https://p2.qhimg.com:443/bdr/__85/t01593365222eb4780e.jpg','https://p2.qhimg.com@127.0.0.1/a','https://cn.bing.com/search?q=x','https://p2.qhimg.com/bdr/__85/t01593365222eb4780e.jpg?x=1'] as $url)check($api->handle('download',['url'=>$url])['status']===400,'unsafe image denied');check($calls===$before,'unsafe image never fetched');
 $url=str_replace('http:','https:',$wall['url']);$r=$api->handle('download',['url'=>$url]);check($r['status']===200&&$r['body']==="\xff\xd8\xff\xd9"&&str_starts_with($r['headers']['Content-Disposition'],'attachment; filename="wallpaper-'),'binary attachment');
 $r=$api->handle('download',['url'=>$url,'size'=>'1920x1080']);check($r['status']===200&&str_contains(end($seen),'/bdm/1920_1080_100/'),'download resize');
 $redirect=true;check($api->handle('download',['url'=>$url])['status']===502,'redirect rejected');$redirect=false;$html=true;check($api->handle('download',['url'=>$url])['status']===502,'HTML download rejected');$html=false;$timeout=true;check($api->handle('wallpapers',['start'=>'27'])['status']===504,'timeout remains retryable');$timeout=false;
 check($api->handle('categories',[],'POST')['status']===405,'method restricted');check($api->handle('../categories',[])['status']===404,'unknown route rejected');
 $noCache=new StillscapeApi($transport,null,$dir.'/missing/blocked');check($noCache->handle('categories',[])['status']===200,'cache unavailable still browses');
 echo json_encode(['passed'=>true,'checks'=>['validation','pagination','normalization','cache','cross-request cache','expiry','business error','malformed payload','categories','Bing pagination','allowlist','download','resize','redirect','HTML rejection','timeout','method','route','unavailable cache']],JSON_UNESCAPED_UNICODE)."\n";
}finally {foreach(glob($dir.'/*')?:[] as $file)unlink($file);rmdir($dir);}
