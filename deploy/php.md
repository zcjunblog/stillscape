# 拾景 · PHP 直接上传版

目标地址：**https://xss6.com/stillscape/**。

此包已完成前端构建，服务器不需要 Node.js、npm、数据库或常驻进程。需要 **PHP 8.1+**、**PHP cURL 扩展**，以及可用的 HTTPS CA 证书。PHP 按请求转发图库与下载，静态图片、JS、CSS、音乐由现有网站服务提供。

## 三步上传

1. **开启 PHP**：在网站面板中选择 PHP 8.1+（不能为“纯静态”），启用 cURL，并确保 HTTPS CA 证书可用。
2. **上传文件**：将本包内容放到网站根目录的 `stillscape/`，最终入口为 `网站根目录/stillscape/index.html`。从源码构建时，在本机执行 `npm ci`、`npm run build:php`，上传 `dist/php-img/` 内的全部文件；不要多嵌套一层目录。
3. **打开验证**：访问 `https://xss6.com/stillscape/`。API 使用真实文件 `api/index.php?route=...`，无需新增 API 伪静态或反向代理规则；下方验收地址应返回 JSON。

目录应为：

```text
网站根目录/
└── stillscape/
    ├── index.html
    ├── assets/          # 带内容指纹的 JS、CSS、背景、音乐
    ├── api/
    │   ├── index.php    # API 请求入口
    │   └── api.php      # 图库、缓存与下载逻辑
    ├── LICENSE
    ├── THIRD_PARTY.md
    └── DEPLOY.md
```

## 宝塔 / Nginx 注意事项

- 在 xss6.com 网站的 PHP 版本设置中选择 8.1 或更高，并启用该版本的 cURL 扩展。
- 本包不需要 `proxy_pass`。若之前已添加 `/stillscape/` 的 Node 反向代理，请移除对应规则后使用真实文件目录。
- 若已有 `location ^~ /stillscape/` 静态规则会绕过 PHP 正则匹配，应移除或调整，让 `/stillscape/api/index.php` 由站点正常的 PHP-FPM 配置处理。不要将 `.php` 当静态源码返回。
- Node 构建阶段生成的 `.br`、`.gz` 是可选预压缩文件；是否使用由站点配置决定，不启用也能正常运行。建议开启 JS/CSS/JSON 的 Gzip 或 Brotli，并为带指纹的资源设置长期缓存；HTML 应重新验证。
- 音乐由网站静态服务提供，现有 Nginx / Apache 通常支持音频 Range 请求；上线后可用浏览器验证播放与续播。

## 验收

打开下面的地址，应看到 JSON，而不是 404、HTML 首页或 PHP 源码：

- `https://xss6.com/stillscape/api/index.php?route=categories`
- `https://xss6.com/stillscape/api/index.php?route=wallpapers&category=9&start=0&count=24`
- `https://xss6.com/stillscape/api/index.php?route=bing&start=0&count=8`

再检查分类切换、继续加载、收藏、下载和音乐。所有本地资源及接口地址均应留在 `/stillscape/` 目录下。

## 缓存与连接排查

PHP 元数据缓存放在系统临时目录下的 `stillscape-*` 专属目录，最多 200 个条目，分类 / 360 / Bing 的有效期分别为 1 小时 / 5 分钟 / 15 分钟；缓存目录不可写时会直接请求来源，浏览仍可使用。应用不需要网站目录的写入权限，也不将下载图片存到磁盘。

若宝塔 `open_basedir` 限制了系统临时目录，缓存会退化为无缓存；可在该站点 PHP 设置中将 `sys_temp_dir` 指向一个 PHP 可访问、可写且位于公开网站目录之外的临时目录，保留现有安全限制。

若 API 返回“无法连接”，请检查服务器能否访问 `wallpaper.apc.360.cn`、`cn.bing.com` 和图片 CDN；HTTPS 错误应修复 CA 证书配置，不要关闭证书校验。接口依赖第三方来源，不能保证上游永久可用。

## 更新与回退

备份当前完整 `img/` 目录。更新时先上传新指纹资源，再替换 `index.html`、PHP 文件与说明；保留旧资源一段时间，避免已打开页面失效。PHP OPcache 若未及时刷新，可通过站点面板重载 PHP。回退时恢复上一版完整目录。

## 素材许可

应用代码采用 MIT；摄影与音频许可独立，见 `THIRD_PARTY.md`。随包音乐来源及尚未核实的许可状态已在其中说明。

应用已在 `/stillscape/` 子目录验证页面与接口；更新后仍需检查服务器配置、证书与缓存响应头，公网性能应按实际环境测量。
