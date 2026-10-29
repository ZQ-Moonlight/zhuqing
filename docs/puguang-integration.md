# 《扑光：今夜回家》游戏展示页

2026-10-29，按最新反馈改为 Steam 游戏页式布局。

## 内容来源

游戏介绍采用 TapTap 原文，不再展示长篇开发复盘。原文从 https://www.taptap.cn/app/991431?os=pc 读取。按作者最新确认，主要开发署名为 ZQ / YYS，开发者留言署名为 ZQ，并简短补充 ZQ 首次参加 TapTap GameJam 的经历；页面与结构化数据不使用工作室署名。

页面使用独立的 `src/pages/portfolio/puguang.astro`，仍从现有 Portfolio Content Collection 读取标题、简介与正文。动态案例路由只增加排除该静态页面的条件，其他案例不做改造。项目卡片继续保留中英文，中文采用 TapTap 简介。

## 媒体来源

| 网站文件 | 原始来源 |
| --- | --- |
| cover.webp | 用户指定：gamejam/07_图标与海报/宣传图+横板海报4.png |
| wallpaper.webp | 用户指定：gamejam/07_图标与海报/Gemini_Generated_Image_1u8tv81u8tv81u8t.jpg |
| icon.webp | 用户指定：gamejam/07_图标与海报/扑光-图标.png |
| sprites.webp | 用户指定：gamejam/07_图标与海报/10abd304e77d021efd309e93dcb7d712.png，保留透明通道，使用 CSS 取景 |
| taptap-01.webp | TapTap 图集：market/images/b7b86c8528800b9af0832bcad21f69df.jpg |
| taptap-02.webp | TapTap 图集：market/images/4e6cf5786517de058932ac80521935ca.jpg |
| taptap-03.webp | TapTap 图集：market/images/eab2698b35de6b8707a601f63ac3a807.jpg |
| taptap-04.webp | TapTap 图集：market/images/59cecfa2577429df5a4b1c94814d0aa9.jpg |
| trailer.mp4 | gamejam/02_分享与试玩/扑光_发布视频_20261020_v2/05_宣传片_导演版.mp4 |
| gameplay.mp4 | 同目录 01_游戏实机录屏.mp4 |

截图来自 TapTap 原图集，未用新版截图替代。两支视频使用已有本地发布素材，转为 1280×720 / 30fps H.264 + AAC，保留原内容与音轨，无自动播放；预览版视频共约 22.2 MiB，仅在用户播放或打开放大预览时载入。

## 交互与验证

- `npm run build` 通过；静态页面、媒体链接及 VideoGame 结构化数据检查通过。
- 图集包含宣传片、实机录屏及四张截图；支持缩略图、前后按钮与左右方向键切换。
- 两支视频在浏览器中实际解码播放，切换到图片时停止；页面内放大预览支持 Esc 关闭及焦点返回，关闭后停止放大播放器。
- 飞蛾漂浮、光点与提灯辉光使用 CSS；提供动效开关，并遵循 `prefers-reduced-motion`。
- 飞蛾图标取景窗口扩大至 86×57，并禁止 flex 压缩，完整保留左右翅膀。
- 320、390、1366 像素宽度检查，无整页横向溢出。窄屏改为单列；既有 320 宽度导航保留自身滚动。
- 浏览器试玩链接沿用现有公网游戏；TapTap 主按钮使用用户指定链接。不修改游戏版本或发布线上作品集。

本地验证材料保存在被忽略的 `test/puguang-qa/`。原有城堡演示、package.json 和锁文件的未提交修改不纳入 PR。
