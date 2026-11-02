# xss6.com/img/ 部署说明

目标地址：**https://xss6.com/img/**。

这是已构建、压缩并带资源指纹的 Node.js 部署包。需要 **Node.js 22+** 与现有 Nginx 站点，不需要数据库，也不需要在服务器运行 `npm install` 或重新构建。仅把文件放进静态 `img` 文件夹无法运行图库 API。

## 1. 上传并运行服务

推荐把 ZIP 解压到独立目录，例如 `/www/wwwroot/stillscape/`。解压后的 `server.mjs`、`index.html`、`assets/` 应在该目录同一层；不要出现多套重复的 `stillscape/stillscape/` 层级。

```sh
cd /www/wwwroot/stillscape
HOST=127.0.0.1 PORT=4178 node server.mjs
```

通过宝塔 Node 项目、PM2 或已有进程管理工具保持运行。启动文件选 `server.mjs`，工作目录选 `/www/wwwroot/stillscape`，环境变量为 `HOST=127.0.0.1`、`PORT=4178`，并使用 Node.js 22+。

先确认 `http://127.0.0.1:4178/` 可在服务器本机访问。若端口被占用，改用空闲端口，并同步修改下一步的 `proxy_pass`。无需向公网开放 Node 端口。

## 2. 配置 /img/ 路径

在 **xss6.com 现有站点**的 Nginx `server {}` 内加入同目录 `nginx-img.conf` 的内容。保留原站根目录、PHP、证书等配置；不要用本文件覆盖整个站点配置。

配置会将：

- `/img` 重定向到 `/img/`，保留查询参数。
- `/img/` 转发到 Node 首页。
- `/img/api/...` 转发到 Node 的 `/api/...`。
- `/img/assets/...` 转发到 Node 的 `/assets/...`。

`proxy_pass http://127.0.0.1:4178/;` **末尾的 `/` 必须保留**。前端的 API、下载、CSS、JS、图片和音乐使用相对地址，统一留在 `/img/` 下；同一份构建也可直接在独立域名根路径运行。

检查配置后再重载 Nginx：

```sh
nginx -t
# 仅在上一步成功后执行：
nginx -s reload
```

HTTPS 由现有站点证书提供。若站点有全局重写或另一个 `/img` 规则，需合并冲突规则；不要让所有 `/img/` 请求回退到原站首页。

## 3. 部署后核对

```sh
curl -I https://xss6.com/img
curl -I https://xss6.com/img/
curl -f 'https://xss6.com/img/api/categories'
```

第一项应重定向到 `/img/`，第二项应返回 HTML，第三项应返回含 `categories` 的 JSON。

在浏览器检查分类、继续加载、下载及音乐开关。JS/CSS 请求应位于 `/img/assets/`，API 请求应位于 `/img/api/`，不存在的资源应返回 404。音乐默认关闭，点击后才请求。

## 4. 更新与回退

备份当前完整运行目录；更新时先放入新指纹资源，再更新 HTML、JS 所需文件和服务文件，重启 Node 服务。保留旧资源一段时间，避免已打开页面失效。需要回退时恢复上一版完整目录并重启服务。

## 验证范围

交付包在本地按 `/img/` 反向代理路径验证。xss6.com 的实际证书、Nginx 配置与公网性能需要上传并启用后检查；本包不代表服务器已经上线。

Nginx 路径转换依据：[官方 proxy_pass 文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)。
