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
```

`dist/shijing/` 是精简运行目录，可直接执行 `node server.mjs`。开发时刷新浏览器即可读取前端修改；修改服务端后需重启。

GitHub Actions 会运行测试和构建。测试覆盖 API 参数、缓存、上游错误、下载限制、分页选中状态、音乐开关及音频范围请求。

## 部署

```sh
HOST=0.0.0.0 PORT=4178 npm start
```

在 Node 服务前配置 HTTPS 反向代理。网站需要服务端代理旧版 360 接口，**不能仅上传到 GitHub Pages 或纯静态托管**。静态资源支持 ETag / 304 与文本 Gzip；音频支持字节范围请求。

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

底部 GitHub 图标链接本仓库，友情链接：[nav.gs](https://nav.gs/)。

## 许可与素材

应用代码采用 [MIT License](LICENSE)。壁纸、预览截图中的摄影、音乐等第三方素材不包含在代码许可内，详见 [THIRD_PARTY.md](THIRD_PARTY.md)。
