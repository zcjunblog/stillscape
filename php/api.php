<?php
declare(strict_types=1);

final class StillscapeHttpError extends RuntimeException {
    public function __construct(public int $status, string $message) {parent::__construct($message);}
}

/** Same normalized payloads as api.mjs; PHP-FPM handles each request on demand. */
final class StillscapeApi {
    private Closure $fetcher;
    private Closure $clock;
    private string $cacheDir;
    private const WALL = 'http://wallpaper.apc.360.cn/index.php';
    private const MAX_IMAGE = 33554432;

    public function __construct(?callable $fetcher = null, ?callable $clock = null, ?string $cacheDir = null) {
        $this->fetcher = Closure::fromCallable($fetcher ?? [self::class, 'fetch']);
        $this->clock = Closure::fromCallable($clock ?? 'time');
        $this->cacheDir = $cacheDir ?? sys_get_temp_dir().'/stillscape-'.substr(hash('sha256', __DIR__), 0, 16);
    }

    public function handle(string $route, array $params, string $method = 'GET'): array {
        try {
            if (!in_array($method, ['GET', 'HEAD'], true)) return $this->json(['error'=>'仅支持 GET 请求'], 405, ['Allow'=>'GET, HEAD']);
            if ($route === 'download') return $this->download($params);
            if ($route === 'categories') {
                [$data, $state] = $this->memo('categories', 3600, function() {
                    $data = $this->upstream(self::WALL.'?'.http_build_query(['c'=>'WallPaper','a'=>'getAllCategoriesV2','from'=>'360chrome']));
                    if ((string)($data['errno'] ?? '') !== '0' || !$this->isList($data['data'] ?? null)) $this->fail(502, '壁纸分类暂时不可用');
                    $categories = [];
                    foreach ($data['data'] as $item) if (is_array($item) && preg_match('/^\d+$/D', (string)($item['id'] ?? ''))) $categories[] = ['id'=>(string)$item['id'],'name'=>$this->text($item['name'] ?? '',40)];
                    return ['categories'=>$categories,'source'=>'360'];
                });
            } elseif ($route === 'wallpapers') {
                $category = $this->param($params,'category','9');
                if (!preg_match('/^\d{1,4}$/D',$category)) $this->fail(400,'壁纸分类无效');
                $start = $this->integer($params,'start',0,0,20000);$count = $this->integer($params,'count',24,1,48);
                [$data, $state] = $this->memo("360:$category:$start:$count",300,function() use ($category,$start,$count) {
                    $data = $this->upstream(self::WALL.'?'.http_build_query(['c'=>'WallPaper','a'=>'getAppsByCategory','cid'=>$category,'start'=>$start,'count'=>$count,'from'=>'360chrome']));
                    if ((string)($data['errno'] ?? '') !== '0' || !$this->isList($data['data'] ?? null) || !is_numeric($data['total'] ?? null)) $this->fail(502,'壁纸来源数据异常，请稍后重试');
                    $items = [];
                    foreach ($data['data'] as $item) if (is_array($item) && ($scene = $this->wallpaper($item,$category))) $items[]=$scene;
                    if ($data['data'] && !$items) $this->fail(502,'暂时没有可用的图片地址');
                    $next = $start+count($data['data']);$total=max(0,(int)$data['total']);
                    return ['source'=>'360','category'=>$category,'items'=>$items,'total'=>$total,'start'=>$start,'nextStart'=>$next,'hasMore'=>count($data['data'])>0 && $next<$total];
                });
            } elseif ($route === 'bing') {
                $start=$this->integer($params,'start',0,0,14);$count=$this->integer($params,'count',8,1,8);
                [$data,$state]=$this->memo("bing:$start:$count",900,function() use ($start,$count) {
                    $upstreamStart=min($start,7);$offset=$start-$upstreamStart;
                    $data=$this->upstream('https://cn.bing.com/HPImageArchive.aspx?'.http_build_query(['format'=>'js','idx'=>$upstreamStart,'n'=>min(8,$count+$offset),'mkt'=>'zh-CN']));
                    if (!$this->isList($data['images'] ?? null)) $this->fail(502,'必应壁纸暂时不可用');
                    $raw=array_slice($data['images'],$offset,$count);$items=[];
                    foreach ($raw as $item) if (is_array($item) && ($scene=$this->bing($item))) $items[]=$scene;
                    if ($raw && !$items) $this->fail(502,'必应图片地址异常');
                    $next=$start+count($items);
                    return ['source'=>'bing','category'=>'bing','items'=>$items,'total'=>15,'start'=>$start,'nextStart'=>$next,'hasMore'=>count($items)>0 && $next<15];
                });
            } else return $this->json(['error'=>'接口不存在'],404);
            return $this->json($data,200,['X-Cache'=>$state]);
        } catch (StillscapeHttpError $error) {return $this->json(['error'=>$error->getMessage()],$error->status);
        } catch (Throwable $error) {return $this->json(['error'=>'请求暂时无法完成，请稍后重试'],502);}
    }

    private function param(array $params,string $key,string $default=''): string {
        $value=$params[$key] ?? $default;if (!is_string($value)) $this->fail(400,"参数 $key 无效");return $value;
    }
    private function integer(array $params,string $key,int $default,int $min,int $max): int {
        $value=$this->param($params,$key,(string)$default);
        if (!preg_match('/^\d+$/D',$value) || strlen($value)>8 || (int)$value<$min || (int)$value>$max) $this->fail(400,"参数 $key 超出允许范围");return (int)$value;
    }
    private function isList(mixed $value): bool {return is_array($value) && array_is_list($value);}
    private function text(mixed $value,int $max=200): string {
        if (!is_scalar($value)) return '';
        $value=trim(preg_replace('/[\x00-\x1f\x7f]/',' ',(string)$value) ?? '');
        preg_match_all('/./us',$value,$chars);return implode('',array_slice($chars[0],0,$max));
    }
    private function fail(int $status,string $message): never {throw new StillscapeHttpError($status,$message);}
    private function json(array $data,int $status=200,array $headers=[]): array {
        return ['status'=>$status,'headers'=>array_merge(['Content-Type'=>'application/json; charset=utf-8','Cache-Control'=>$status===200?'public, max-age=60':'no-store','X-Content-Type-Options'=>'nosniff'],$headers),'body'=>json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)];
    }

    private function imageURL(string $url): array {
        $parts=parse_url($url);
        if (!$parts || ($parts['scheme'] ?? '')!=='https' || isset($parts['user'],$parts['pass']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port']) || isset($parts['fragment']) || preg_match('/[\x00-\x20\x7f\\\\]/',$url)) $this->fail(400,'不支持的图片地址');
        $host=$parts['host'] ?? '';$path=$parts['path'] ?? '';$query=[];parse_str($parts['query'] ?? '',$query);
        $qh=preg_match('/^(?:p|browser)\d{1,2}\.qhimg\.com$/D',$host) && preg_match('~^/(?:bdr/__\d{1,3}|bdm/\d{1,5}_\d{1,5}_\d{1,3})/t[0-9a-f]{8,80}\.(?:jpg|jpeg|png|webp)$~D',$path) && !isset($parts['query']);
        $bing=in_array($host,['cn.bing.com','www.bing.com'],true) && $path==='/th' && is_string($query['id'] ?? null) && preg_match('/^OHR\.[\w.-]+(?:_UHD|_\d+x\d+)\.jpg$/D',$query['id']) && !array_diff(array_keys($query),['id','w','h','c','qlt','pid','rf']);
        foreach ($query as $value) if (!is_string($value)) $bing=false;
        if (!$qh && !$bing) $this->fail(400,'该图片地址不在允许的来源中');
        return ['url'=>$url,'host'=>$host,'path'=>$path,'query'=>$query];
    }
    private function resize(string $url,int $width,int $height,int $quality=85): string {
        $parts=$this->imageURL($url);
        if (str_ends_with($parts['host'],'.qhimg.com')) return preg_replace('~/(?:bdr/__\d+|bdm/\d+_\d+_\d+)/~',"/bdm/{$width}_{$height}_{$quality}/",$url);
        $parts['query']['w']=(string)$width;$parts['query']['h']=(string)$height;$parts['query']['c']='7';
        return 'https://'.$parts['host'].$parts['path'].'?'.http_build_query($parts['query'],'','&',PHP_QUERY_RFC3986);
    }
    private function wallpaper(array $item,string $category): ?array {
        if (!preg_match('/^\d{1,14}$/D',(string)($item['id'] ?? ''))) return null;
        try {$url=$this->imageURL(preg_replace('/^http:/','https:',(string)($item['url'] ?? '')))['url'];}catch (StillscapeHttpError $error) {return null;}
        if (!preg_match('/^(\d{2,5})x(\d{2,5})$/D',(string)($item['resolution'] ?? ''),$size)) return null;
        $width=(int)$size[1];$height=(int)$size[2];if (!$width || !$height) return null;
        $tags=array_values(array_unique(preg_split('/\s+/u',$this->text($item['utag'] ?? '',180),-1,PREG_SPLIT_NO_EMPTY) ?: []));
        if (!$tags) {preg_match_all('/_category_([^_]+)_/u',(string)($item['tag'] ?? ''),$matches);$tags=array_map(fn($s)=>$this->text($s,30),$matches[1]);}
        $previewWidth=min($width,1920);$previewHeight=(int)round($previewWidth*$height/$width);
        return ['id'=>'360:'.$item['id'],'source'=>'360','sourceId'=>(string)$item['id'],'category'=>$category,'name'=>$this->text(implode(' · ',array_slice($tags,0,2)) ?: '壁纸 '.$item['id'],60),'tags'=>array_slice($tags,0,8),'width'=>$width,'height'=>$height,'resolution'=>"$width × $height",'quality'=>$width>=3840?'4K UHD':($width>=2560?'QHD':'FULL HD'),'original'=>$url,'image'=>$this->resize($url,$previewWidth,$previewHeight),'thumb'=>$this->resize($url,320,200,75),'credit'=>'图片来源：360 壁纸','createdAt'=>$this->text($item['create_time'] ?? '',30),'downloadable'=>true];
    }
    private function bing(array $item): ?array {
        $base=$item['urlbase'] ?? '';if (!is_string($base)) return null;
        if (str_starts_with($base,'/th?')) $base='https://cn.bing.com'.$base;
        $parts=parse_url($base);$q=[];parse_str($parts['query'] ?? '',$q);
        if (!$parts || ($parts['scheme'] ?? '')!=='https' || ($parts['host'] ?? '')!=='cn.bing.com' || ($parts['path'] ?? '')!=='/th' || !is_string($q['id'] ?? null) || !preg_match('/^OHR\.[\w.-]+$/D',$q['id'])) return null;
        $date=$this->text($item['startdate'] ?? '',8);if (!preg_match('/^\d{8}$/D',$date)) return null;
        $original='https://cn.bing.com/th?'.http_build_query(['id'=>$q['id'].'_UHD.jpg']);$image='https://cn.bing.com/th?'.http_build_query(['id'=>$q['id'].'_1920x1080.jpg']);
        return ['id'=>'bing:'.$date,'source'=>'bing','sourceId'=>$date,'category'=>'bing','name'=>$this->text($item['title'] ?? $item['copyright'] ?? '',60),'tags'=>[$this->text($item['copyright'] ?? '',180)],'width'=>3840,'height'=>2160,'resolution'=>'3840 × 2160','quality'=>'4K UHD','original'=>$original,'image'=>$image,'thumb'=>$this->resize($image,320,200,75),'credit'=>$this->text($item['copyright'] ?? '',250),'createdAt'=>$date,'downloadable'=>($item['wp'] ?? true)!==false];
    }

    private function upstream(string $url): array {
        $response=($this->fetcher)($url,2097152,15);
        if ($response['status']<200 || $response['status']>=300 || strlen($response['body'])>2097152) $this->fail(502,'壁纸来源返回异常响应');
        try {$data=json_decode($response['body'],true,512,JSON_THROW_ON_ERROR);}catch (JsonException $error) {$this->fail(502,'壁纸来源数据格式异常');}
        if (!is_array($data)) $this->fail(502,'壁纸来源数据格式异常');return $data;
    }
    private function memo(string $key,int $ttl,callable $load): array {
        if (!is_dir($this->cacheDir)) @mkdir($this->cacheDir,0700);
        $path=$this->cacheDir.'/'.hash('sha256',$key).'.json';$file=@fopen($path,'c+');
        if (!$file) return [$load(),'MISS'];
        try {
            if (!flock($file,LOCK_EX)) return [$load(),'MISS'];
            @chmod($path,0600);$raw=stream_get_contents($file,2097153);$entry=is_string($raw)?json_decode($raw,true):null;
            if (is_array($entry) && ($entry['expires'] ?? 0)>($this->clock)() && is_array($entry['data'] ?? null)) return [$entry['data'],'HIT'];
            $data=$load();$encoded=json_encode(['expires'=>($this->clock)()+$ttl,'data'=>$data],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
            if (strlen($encoded)<=2097152) {rewind($file);@ftruncate($file,0);@fwrite($file,$encoded);@fflush($file);}
            return [$data,'MISS'];
        } finally {
            flock($file,LOCK_UN);fclose($file);
            $files=glob($this->cacheDir.'/*.json') ?: [];
            if (count($files)>200) {usort($files,fn($a,$b)=>(@filemtime($a) ?: 0)<=> (@filemtime($b) ?: 0));foreach (array_slice($files,0,count($files)-200) as $old) if ($old!==$path) @unlink($old);}
        }
    }

    private function download(array $params): array {
        $image=$this->imageURL($this->param($params,'url'));$size=$this->param($params,'size','original');
        if (!in_array($size,['original','1920x1080','2560x1440','3840x2160'],true)) $this->fail(400,'不支持的下载尺寸');
        if ($size!=='original') {
            if (str_ends_with($image['host'],'.bing.com')) {$image['query']['id']=preg_replace('/_(?:UHD|\d+x\d+)\.jpg$/','',$image['query']['id']).'_'.$size.'.jpg';unset($image['query']['w'],$image['query']['h'],$image['query']['c']);$url='https://'.$image['host'].$image['path'].'?'.http_build_query($image['query']);}
            else {[$w,$h]=array_map('intval',explode('x',$size));$url=$this->resize($image['url'],$w,$h,100);}
            $image=$this->imageURL($url);
        }
        $response=($this->fetcher)($image['url'],self::MAX_IMAGE,25);$type=strtolower(trim(explode(';',$response['type'])[0]));$body=$response['body'];
        if ($response['status']<200 || $response['status']>=300) $this->fail(502,'壁纸来源返回异常响应');
        if (!in_array($type,['image/jpeg','image/png','image/webp','image/avif'],true) || !$this->imageSignature($body,$type)) $this->fail(502,'来源没有返回有效图片');
        if (strlen($body)>self::MAX_IMAGE) $this->fail(502,'图片超出下载大小限制');
        $extension=$type==='image/jpeg'?'jpg':substr($type,6);$id=substr(preg_replace('/[^a-zA-Z0-9_-]/','',basename($image['path']) ?: 'image'),-70);
        return ['status'=>200,'headers'=>['Content-Type'=>$type,'Content-Length'=>(string)strlen($body),'Content-Disposition'=>'attachment; filename="wallpaper-'.$id.'-'.$size.'.'.$extension.'"','Cache-Control'=>'private, max-age=3600','X-Content-Type-Options'=>'nosniff'],'body'=>$body];
    }
    private function imageSignature(string $body,string $type): bool {
        return match($type) {
            'image/jpeg'=>str_starts_with($body,"\xff\xd8\xff"),
            'image/png'=>str_starts_with($body,"\x89PNG\r\n\x1a\n"),
            'image/webp'=>substr($body,0,4)==='RIFF' && substr($body,8,4)==='WEBP',
            'image/avif'=>substr($body,4,4)==='ftyp' && (str_contains(substr($body,8,32),'avif') || str_contains(substr($body,8,32),'avis')),
            default=>false
        };
    }

    /** Fixed callers only. No redirects; the callback caps decompressed response bytes. */
    public static function fetch(string $url,int $limit,int $seconds): array {
        if (!function_exists('curl_init')) throw new StillscapeHttpError(503,'服务器需要启用 PHP cURL 扩展');
        $curl=curl_init($url);$body='';$tooLarge=false;
        curl_setopt_array($curl,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>$seconds,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS,CURLOPT_ENCODING=>'',CURLOPT_USERAGENT=>'Stillscape-Wallpaper/1.0',CURLOPT_HTTPHEADER=>['Accept: application/json,image/*'],CURLOPT_WRITEFUNCTION=>static function($handle,string $chunk)use(&$body,&$tooLarge,$limit):int {if (strlen($body)+strlen($chunk)>$limit) {$tooLarge=true;return 0;}$body.=$chunk;return strlen($chunk);}]);
        $ok=curl_exec($curl);$errno=curl_errno($curl);$status=(int)curl_getinfo($curl,CURLINFO_RESPONSE_CODE);$type=(string)curl_getinfo($curl,CURLINFO_CONTENT_TYPE);curl_close($curl);
        if ($tooLarge) throw new StillscapeHttpError(502,'壁纸来源响应超出大小限制');
        if ($ok===false) throw new StillscapeHttpError($errno===CURLE_OPERATION_TIMEDOUT?504:502,'壁纸来源暂时无法连接，请稍后重试');
        return ['status'=>$status,'type'=>$type,'body'=>$body];
    }
}
