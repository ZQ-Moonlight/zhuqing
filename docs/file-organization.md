# 作品集网站文件存放规则

这份规则用于整理 `C:\Users\ZQ\Desktop\portfolio` 的文件位置。核心原则是：内容、路由、组件、可公开访问的媒体、源素材分开存放；新增文件时先判断它属于哪一种，不再按临时方便随手放。

## 总规则

| 类型 | 放置位置 | 用途 |
| --- | --- | --- |
| 博客正文 | `src/content/blog/` | Markdown 文章、文章旁边的 `.assets` 图片、文章相关 PDF |
| 作品集正文 | `src/content/portfolio/` | 作品集 Markdown 数据页，描述项目内容、封面、视频、文档链接 |
| 页面路由 | `src/pages/` | Astro 路由入口。这里的文件会变成网站 URL，不放素材 |
| 通用组件 | `src/components/` | Header、B 站播放器、背景、评论等可复用 UI |
| 页面布局 | `src/layouts/` | 全站页面壳、SEO、公共结构 |
| 工具函数 | `src/lib/` | 路径处理、内容归档、资源路由等代码逻辑 |
| 公开媒体 | `public/media/` | 浏览器可以直接访问的图片、视频、PDF |
| 源素材 | `src/source-media/` | 本地保留的高质量原图、导出源文件、未直接发布到网页的素材，不提交到 git |
| 项目说明 | `docs/` | 给自己和之后维护者看的规则、记录、说明 |

## 为什么 `src/pages` 里一定会有文件

这个网站使用 Astro。Astro 采用文件路由，所以 `src/pages/index.astro` 会生成首页，`src/pages/portfolio.astro` 会生成作品页，`src/pages/portfolio/[slug].astro` 会生成动态作品详情页。

因此，`src/pages` 不是“乱放页面文件”，而是网站 URL 的入口层。它应该只存放这些内容：

| 文件类型 | 可以放在 `src/pages` 吗 | 原因 |
| --- | --- | --- |
| `.astro` 页面 | 可以 | 直接对应网站页面 |
| 路由 `.ts` 文件 | 可以 | 例如 sitemap、文件下载接口、旧文章资源兼容路由 |
| 图片、视频、PDF | 不可以 | 应该放到 `public/media/` 或文章自己的 `.assets` 目录 |
| 原始工程素材 | 不可以 | 可以本地放到 `src/source-media/`，但不要提交 |

现在 `src/pages/blog/files/[...path].ts` 和 `src/pages/blog/数字摄影技术/数字摄影技术.assets/[...path].ts` 是路由兼容文件，不是素材本体。它们的作用是把 `src/content/blog` 里的旧文件安全地发布出来。

## 公开媒体规则

所有浏览器需要直接读取的站点媒体，统一放到：

```text
public/media/
```

站点级素材放这里：

```text
public/media/site/home/
public/media/site/og/
```

作品集素材按作品 slug 分组：

```text
public/media/portfolio/<作品-slug>/images/
public/media/portfolio/<作品-slug>/videos/
public/media/portfolio/<作品-slug>/files/
```

例子：

```text
public/media/portfolio/detroit/images/cover.webp
public/media/portfolio/ue-cinematics-pipeline/images/animated/early-blockout.gif
public/media/portfolio/ue-cinematics-pipeline/videos/first-cutscene.mp4
public/media/portfolio/ndisplay/files/icvfx-camera-system-scope.pdf
```

在 Markdown 或 Astro 里引用时，使用对应的公开 URL：

```md
![示例](/media/portfolio/ue-cinematics-pipeline/images/cover.webp)
```

## 作品集 slug 对照

| 页面 / 用途 | 媒体目录 |
| --- | --- |
| `/portfolio/detroit/` | `public/media/portfolio/detroit/` |
| `/portfolio/ue-cinematics-pipeline/` | `public/media/portfolio/ue-cinematics-pipeline/` |
| `/portfolio/metahuman/` | `public/media/portfolio/metahuman/` |
| `/portfolio/ndisplay/` | `public/media/portfolio/ndisplay/` |
| `/portfolio/guangying-changqing/` | `public/media/portfolio/guangying-changqing/` |
| 作品页里的后期展示卡片 | `public/media/portfolio/post-production/` |
| 历史/归档素材 | `public/media/archive/` |

## 源素材规则

不直接在网页上展示，但可能用于重新导出、压缩、修图的原始素材，放在：

```text
src/source-media/   # 本地素材暂存，已被 .gitignore 忽略
```

作品集源素材同样按 slug 分组：

```text
src/source-media/portfolio/metahuman/lightstage-workflow.jpeg
src/source-media/portfolio/ndisplay/ndisplay-wall-01.jpeg
```

这里的文件不会自动变成公开 URL。它们更像工作台里的母版素材。

## 博客素材规则

博客已经比较清楚，继续保持“文章和素材在一起”的规则：

```text
src/content/blog/post-name.md
src/content/blog/post-name.assets/image-01.png
```

如果是一篇博客独有的图片，就放在这篇文章旁边的 `.assets` 目录；如果是全站共用、作品集封面或需要直接写公开 URL 的图片，才放到 `public/media/`。

## 新增作品集时的步骤

1. 在 `src/content/portfolio/` 新建 `new-project.md`。
2. 在 `public/media/portfolio/new-project/images/` 放网页用图片。
3. 如果有网页视频，放到 `public/media/portfolio/new-project/videos/`。
4. 如果有 PDF 或下载文件，放到 `public/media/portfolio/new-project/files/`。
5. 如果有原始大图、未压缩视频、工程导出截图，可以本地放到 `src/source-media/portfolio/new-project/`，但不要提交到 git。
6. 在 Markdown frontmatter 里使用 `/media/portfolio/new-project/...` 路径。
7. 不要把图片、视频或 PDF 放进 `src/pages/`。

## 本次整理后的判断标准

如果你想找某个作品集页面的素材，先去 `public/media/portfolio/<作品-slug>/`。如果你想改作品集文字，去 `src/content/portfolio/`。如果你想改页面模板、布局和交互，去 `src/pages/`、`src/components/` 或 `src/layouts/`。如果你想找原始母版素材，去 `src/source-media/`。
