# Stillscape · 拾景

**A quiet place for your screen.**

一个以图片为中心的沉浸式壁纸网站。全屏风景、镜头缓动与柔和光影，配合真实图库、分类浏览、下载、本地收藏与可开关的背景音乐。

![Stillscape 预览](docs/preview.png)

## 功能

- 全屏图片、渐变转场、指针光影、纯净赏图与自动漫游。
- 360 壁纸分类分页、Bing 近期每日图片；接近列表末尾自动续载。
- 图库骨架占位和固定弹窗；续载保留当前选择、焦点与滚动状态。
- 原图下载与适配尺寸下载，保留图片来源。
- 浏览器本地收藏与已加载图片搜索。
- 背景音乐默认关闭，点击才加载；支持循环、暂停续播和淡入淡出。
- 手机布局、键盘操作与系统“减少动态效果”设置。

## 快速运行

需要 **Node.js 22 或更新版本**。运行网站无需第三方运行依赖。

```sh
git clone https://github.com/zcjunblog/stillscape.git
cd stillscape
npm start
```

打开 [http://127.0.0.1:4178](http://127.0.0.1:4178)。

## 开发与构建

```sh
npm ci
npm test
npm run build
npm run preview
```

`dist/shijing/` 是精简运行目录，可直接执行 `node server.mjs`。开发时刷新浏览器即可读取前端修改；修改服务端后需重启。

GitHub Actions 会运行测试和构建。测试覆盖 API 参数、缓存、上游错误、下载限制、分页选中状态、音乐开关及音频范围请求。

## 部署

```sh
HOST=0.0.0.0 PORT=4178 npm start
```

在 Node 服务前配置 HTTPS 反向代理。网站需要服务端代理旧版 360 接口，**不能仅上传到 GitHub Pages 或纯静态托管**。发布版 JS/CSS 已压缩并带内容指纹，提供预压缩 Brotli/Gzip；静态资源支持 ETag / 304，音频支持字节范围请求。

## 打开速度与本地缓存

- 发布时使用 `npm run build` 生成的 `dist/shijing/`；`npm run preview` 可直接查看压缩版。源码模式 `npm start` 适合开发。
- JS、CSS、加载背景与音乐采用内容指纹地址，浏览器可缓存一年；文件内容改变后自动产生新地址。HTML 每次重新验证，避免一直使用旧入口。
- HTML、JS、CSS 预生成 `.br` / `.gz`，服务端按浏览器支持协商；服务端复用文件与压缩结果，源码变化会使内存缓存失效。API JSON 同样支持 Brotli / Gzip。
- 分类和已浏览页面元数据保存在本机：分类 1 小时、360 页面 5 分钟、Bing 页面 15 分钟，最多 12 条且序列化后小于约 600 KB。过期会重新请求；损坏或写入失败不影响浏览，也不会清除收藏。
- 切图时复用最近解码的大图：桌面最多 8 张、手机最多 4 张；背景顺序预取相邻图片，指针停留或键盘聚焦缩略图时提前准备。开启省流模式或 2G 网络时停止自动预取。
- 随机跳转到未准备的大图时，优先显示已有缩略图，再淡入高清图；快速连续选择时，过时的图片不会覆盖当前选择。高清失败可重试，原图下载尺寸保持不变。
- 壁纸文件仍遵循来源 CDN 的浏览器缓存；7 MB 音乐只在点击后加载，不提前下载整段音频。
- 页面界面文字禁止拖选，搜索框仍可正常编辑与复制粘贴。

本地文件体积和 localhost 验证不等同于公网性能；域名、HTTPS、反向代理和真实网络的首屏指标仍需上线测量。

## 数据接口

| 接口 | 用途 |
| --- | --- |
| `/api/categories` | 360 分类，缓存 1 小时 |
| `/api/wallpapers?category=9&start=0&count=24` | 分类分页，每次最多 48 张，缓存 5 分钟 |
| `/api/bing?start=0&count=8` | Bing 近期图片，当前最多 15 天，缓存 15 分钟 |
| `/api/download?url=...&size=original` | 来源原图或适配尺寸，仅允许指定图片域名 |

360 分类样本主要是旧图库，数据时效取决于上游；不承诺持续更新。首页首批请求 24 张，继续浏览会接续分页。搜索仅筛选当前已加载图片。收藏保存在当前浏览器，不提供账号同步。

接口参考 [mengkunsoft/wallpaper](https://github.com/mengkunsoft/wallpaper)，页面与交互独立实现。

## 音乐与链接

音频使用用户指定的[原始 MP3](https://static.yiyitu.net/wp-content/uploads/2020/09/1609253354fcdf.mp3)，在项目中保存为 `assets/ambient-music.mp3`。约 15 分 16 秒、7 MB，保留原始文件；仅点击音乐开关后加载，不计入首页必需资源。

底部 GitHub 图标链接本仓库；“友情链接”可展开多个站点，目前包含 [nav.gs](https://nav.gs/) 和 [关于我们 · jkhcz.com](https://jkhcz.com/)。支持键盘展开、Escape 收起和点击外部关闭。

增加站点时，在 `index.html` 的 `#friend-links .friend-panel` 内追加 `.friend-entry` 链接即可；列表超出高度会内部滚动，页脚入口宽度保持不变。

## 许可与素材

应用代码采用 [MIT License](LICENSE)。壁纸、预览截图中的摄影、音乐等第三方素材不包含在代码许可内，详见 [THIRD_PARTY.md](THIRD_PARTY.md)。
