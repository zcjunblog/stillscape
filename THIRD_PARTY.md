# 第三方来源与素材声明

本文件记录 Stillscape 使用的参考资料与第三方素材。仓库中的 [MIT License](LICENSE) 适用于本项目应用代码与原创文档，不为以下第三方作品、服务或标识授予额外权利。

## 1. 参考项目

- 项目：[mengkunsoft/wallpaper](https://github.com/mengkunsoft/wallpaper)
- 参考范围：[API 实现](https://github.com/mengkunsoft/wallpaper/blob/master/api/index.php) 中 360 壁纸分类、分类分页与 Bing 每日图片的接口调用方式。
- 本项目的界面与 Node.js / PHP 服务独立实现；未将参考项目的页面代码或 PHP 代理作为项目文件引入。
- 原项目版权及其 README 中的使用要求归原作者所有；本仓库 MIT 许可证不覆盖原项目。

## 2. 壁纸与摄影

| 来源或文件 | 使用说明 |
| --- | --- |
| 360 壁纸：`wallpaper.apc.360.cn` | 获取分类及图片元数据，图片来自接口返回的 `qhimg.com` CDN |
| Bing：`cn.bing.com` | 获取近期每日图片，界面保留接口返回的署名或版权信息 |
| `assets/scene-12.jpg` | 来自 360 壁纸图库，作为首次连接图库时的本地背景 |
| `docs/preview.png` | 本项目界面截图，其中摄影仍归相应权利人所有 |

图像的著作权归原作者或其他合法权利人所有。本项目未逐张核实图库图片的独立许可，不宣称这些图片属于公共领域、免版权素材或可任意商用。接口可访问性与图片使用许可应分别确认；请按具体素材的许可使用。

## 3. 背景音乐

- 项目文件：`assets/ambient-music.mp3`。
- 来源：[原始 MP3 文件](https://static.yiyitu.net/wp-content/uploads/2020/09/1609253354fcdf.mp3)。
- 由项目维护者指定，仓库保留原始音频，未重新编码。
- 当前未核实曲名、作者及独立的再分发许可；本项目不宣称该音频为原创、免版权或适用 MIT 许可。
- 音乐默认关闭，由使用者点击后加载。需要再分发或商用时，请先核实许可，必要时换用已获授权的音频。

更换音频时，请同步更新本文件。文件名改变时还需修改 `app.js` 与 `build.mjs`，并重新生成生产构建。

## 4. 设计 Skill 与开发工具

网站设计与界面打磨使用项目作者自有的「官网设计」Skill（`guanwang`，早期名称 `website-ui-craft`），配合 Codex 完成。该 Skill 计划独立开源，目前未包含在本仓库，其后续链接见 [README 的设计 Skill 说明](https://github.com/zcjunblog/stillscape#自有设计-skill)。

第三方开发依赖以 `package.json`、`package-lock.json` 记录为准，各依赖遵循其自身许可证。本项目名称以外的第三方名称与标识归各自权利人所有。

## 5. 权利反馈

如您是相关素材的权利人，并对本项目使用方式有异议，请通过 [GitHub Issues](https://github.com/zcjunblog/stillscape/issues) 提供文件位置、来源与权属说明，维护者将核实并移除或替换相关素材。请勿在公开 Issue 中提交私人证明材料。
