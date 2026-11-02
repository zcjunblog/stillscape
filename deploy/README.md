# 拾景 · Node.js 运行版

在线演示：[https://xss6.com/stillscape/](https://xss6.com/stillscape/)。支持部署到独立域名根路径或任意子目录，目录名称不限。

本包已经构建、压缩并带有资源指纹。服务器需要 **Node.js 22+**，不需要 PHP、数据库、`npm install` 或重新构建。需要能够保持 Node 进程运行；如果只想上传文件到已有 PHP 站点，请选择 Release 中的 `stillscape-php.zip`。

## 三步部署

1. **解压并进入目录**：下载 `stillscape-node.zip`，解压后进入内部 `stillscape/`，确认 `server.mjs`、`index.html`、`assets/` 位于同一层。
2. **启动并保持运行**：执行下面的命令，再通过宝塔 Node 项目、PM2 或已有进程管理工具保持运行。启动文件为 `server.mjs`，工作目录为解压后的应用目录，环境变量为 `HOST=127.0.0.1`、`PORT=4178`。

   ```sh
   HOST=127.0.0.1 PORT=4178 node server.mjs
   ```

3. **绑定域名并访问**：先确认服务器本机的 `http://127.0.0.1:4178/` 可访问，再在现有网站中配置 HTTPS 反向代理。可使用域名根路径，也可使用自选子目录；配置参考下方示例。

若端口已占用，改成空闲端口并同步修改代理配置，无需向公网开放 Node 端口。

## Nginx 反向代理示例

以下配置仅合并到现有网站的 `server {}` 内，不要覆盖原有证书或其他站点配置。根路径和子目录示例按需求二选一。

### 独立域名根路径

```nginx
location / {
    proxy_pass http://127.0.0.1:4178/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_read_timeout 60s;
}
```

### 自选子目录

包内 `deploy/nginx-img.conf` 提供 `/wallpaper/` 示例。将其中的路径改成需要的目录名即可，`proxy_pass http://127.0.0.1:4178/;` **末尾的 `/` 必须保留**，使 `/wallpaper/api/...` 转发为 Node 服务的 `/api/...`。

检查配置后再重载：

```sh
nginx -t
# 仅在上一步成功后执行：
nginx -s reload
```

前端的接口、下载与资源使用相对地址；Node.js 服务接收移除代理前缀后的请求。上述代理配置仅适用于 Node.js 版本，PHP 直接上传版不需要配置 `proxy_pass`。

## 验收与常见问题

- 打开部署地址，确认图库加载正常。部署地址后追加 `api/categories` 应返回 JSON。
- 验证分类、继续加载、下载与音乐开关。音乐默认关闭，点击后才请求；不存在的资源应返回 404。
- 502 通常需要检查 Node 进程、监听地址与代理端口；子目录下资源或接口 404 时，检查代理是否移除了路径前缀。
- Node 服务提供预压缩 Brotli/Gzip、指纹资源缓存、ETag / 304 和音频字节范围请求；外层代理应保留相关请求与响应头。

## 更新与回退

备份完整运行目录。先放入新指纹资源，再替换 HTML 与服务文件，重启 Node 进程；旧资源可保留一段时间。需要回退时恢复上一版完整目录并重启服务。

素材许可见包内 `THIRD_PARTY.md`。域名、HTTPS 与公网性能需按实际部署环境检查。

Nginx 路径转换依据：[官方 proxy_pass 文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)。
