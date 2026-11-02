<?php
declare(strict_types=1);
ini_set('display_errors','0');
require __DIR__.'/api.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
$route=$_GET['route'] ?? '';
$response=is_string($route)?(new StillscapeApi())->handle($route,$_GET,$_SERVER['REQUEST_METHOD'] ?? 'GET'):['status'=>400,'headers'=>['Content-Type'=>'application/json; charset=utf-8','Cache-Control'=>'no-store'],'body'=>'{"error":"接口参数无效"}'];
http_response_code($response['status']);
foreach ($response['headers'] as $name=>$value) header($name.': '.$value);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET')!=='HEAD') echo $response['body'];
