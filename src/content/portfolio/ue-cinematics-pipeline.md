---
title: "UE5 剧情动画与交互扫描流程"
subtitle: "Cinematic Integration / Blueprint / Scan FX"
description: "以《底特律：化身为人》互动叙事练习为例，整理从白模、Sequencer、蓝图触发、QTE、扫描特效、UI 到问题复盘的制作过程。"
category: "UE5 / Cinematics / 交互叙事"
pubDate: 2026-07-04
heroImage: "/media/portfolio/ue-cinematics-pipeline/images/cover.webp"
tags: ["UE5", "Sequencer", "Blueprint", "QTE", "Interactive Narrative", "Scan FX"]
---

<h2 id="overview">项目概述</h2>

这个页面记录的是一次 UE5 互动叙事练习。项目以《底特律：化身为人》中马库斯在废弃坑洞中醒来、寻找部件、逐步恢复感知与行动能力的段落为参考。我不只想复刻一段画面，而是想做出一个能被玩家扫描、触发 QTE、播放过场，并且能在蓝图里维护状态的关卡片段。

这个游戏段落的核心玩法是 QTE。扫描和“记忆宫殿”不是单独拿出来炫技的功能，而是服务 QTE 的信息层：玩家先通过扫描知道哪里还能继续交互，然后靠按键和触发区域推进事件。我的工作重点就是把这些环节接起来：白模先验证玩家走向和交互点位置，Sequencer 负责过场和镜头，蓝图负责扫描、QTE、能力解锁和状态恢复，UI 负责告诉玩家现在能做什么。

这页不是单独的 showreel 页面。完整演示只保留 B 站版本作为总览入口；正文的重点是拆分我怎样把这个段落从白模、镜头、蓝图、扫描、UI 和材质一步步落到引擎里。

<aside class="case-link-panel">
    <span>同一项目的两个阅读入口</span>
    <strong>本页偏技术拆解；最终观感与完整作品说明可查看《底特律：化身为人》UE5 复刻主页面。</strong>
    <a href="/portfolio/detroit/">打开最终展示页</a>
</aside>

| 项目项 | 内容 |
| --- | --- |
| 目标 | 做出一个可探索、可扫描、可触发 QTE、可播放过场的 UE5 互动叙事段落 |
| 个人职责 | 白模规划、地图搭建、Sequencer、Blueprint 触发、QTE 交互、扫描特效、UI 测试、雨水材质、剪辑整理与文档复盘 |
| 使用工具 | Unreal Engine 5、Sequencer、Blueprint、Niagara、后处理材质、After Effects、DaVinci Resolve、Blender |
| 产出 | B 站完整演示、循环过程动图、蓝图截图、材质截图、地图草图、问题复盘与可复用检查清单 |

<h2 id="complete-demo">完整演示参考</h2>

完整版演示放在 B 站视频中，作为理解项目最终效果的总览。下面的章节不会再按照 showreel 的方式连续展示结果，而是按技术环节拆解每一部分是如何被搭建、测试和修正的。

<figure class="bilibili-inline">
    <iframe
        src="https://player.bilibili.com/player.html?bvid=BV18XApe2Efy&page=1&p=1&as_wide=1&high_quality=1&danmaku=0&autoplay=0"
        title="《底特律：化身为人》UE5 场景与交互复刻完整演示"
        loading="lazy"
        scrolling="no"
        allow="fullscreen; picture-in-picture"
        allowfullscreen
    ></iframe>
    <figcaption>完整演示视频：用于快速理解最终体验；本页后续内容是技术拆分解析。</figcaption>
</figure>

[在 B 站打开完整演示](https://www.bilibili.com/video/BV18XApe2Efy/)

<h2 id="blockout">从白模到可玩空间</h2>

早期阶段最重要的不是画面精度，而是先判断空间是否能服务剧情。这个段落的核心行为是“醒来、观察、拾取、恢复、继续探索”，因此地图需要提供三个层次：玩家醒来的低处、可被扫描识别的散落物、引导玩家继续前进的出口方向。白模阶段我先用简单体块确定坑洞边界、镜头朝向和可交互物体的距离，避免后期才发现角色动线和镜头调度互相冲突。

<figure>
    <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/early-blockout.gif" alt="前期白模循环动图" loading="lazy" decoding="async" />
    <figcaption>前期白模测试：先验证角色移动、坑洞尺度、镜头可读性和基础探索路径。</figcaption>
</figure>

<div class="stage-strip">
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/map-blockout-01.webp" alt="地图草图初版" />
        <figcaption>01 地图草图：确认坑洞、可交互物和出口关系。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/map-blockout-02.webp" alt="地图草图阶段二" />
        <figcaption>02 地图草图阶段 2：补充玩家视线引导和扫描物体分布。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/map-blockout-03.webp" alt="地图草图阶段三" />
        <figcaption>03 地图草图阶段 3：加入更明确的空间分区和路径节奏。</figcaption>
    </figure>
</div>

这三张草图都属于前期规划，它们不是为了展示最终画面，而是用来判断空间关系、交互点分布和玩家视线是否成立。真正进入引擎后，我再把这些信息翻译成可移动、可触发、可扫描的场景。

<figure class="feature-figure">
    <img src="/media/portfolio/ue-cinematics-pipeline/images/final-map.webp" alt="最终地图" />
    <figcaption>阶段结果：最终地图。这个版本用于检查空间气氛、可交互物提示、镜头落点和任务路线是否统一。</figcaption>
</figure>

地图推进过程中，我把“最终好看”拆成两个更具体的判断标准。第一是玩家是否能在受损视觉和雨夜环境中读懂方向；第二是每次扫描是否能给玩家明确反馈。也就是说，场景不是单纯堆资产，而是要为交互状态服务。比如可拾取组件不能只靠模型形状提示，还需要通过发光轮廓、扫描反馈和声音反馈共同建立可读性。

<h2 id="sequencer">Sequencer 与过场集成</h2>

过场动画部分采用 Sequencer 组织镜头、参考片段、角色动作、UI 片段和相机切换。这个阶段的难点在于，Sequencer 不是独立播放的“短片播放器”，它必须和关卡状态接上。播放前要冻结玩家输入，播放后要把控制权、UI、物体状态和后续 QTE 触发交还给蓝图。

<figure>
    <img src="/media/portfolio/ue-cinematics-pipeline/images/sequencer-shot-01.webp" alt="Sequencer 关卡序列截图" />
    <figcaption>关卡序列截图：把镜头轨道、参考视频、UI 片段、相机轨道和事件触发放进同一条时间线上检查。</figcaption>
</figure>

<figure>
    <video class="process-video" controls preload="metadata" poster="/media/portfolio/ue-cinematics-pipeline/images/cover.webp">
        <source src="/media/portfolio/ue-cinematics-pipeline/videos/first-cutscene.mp4" type="video/mp4" />
    </video>
    <figcaption>第一个过场动画的 Sequencer 录屏，右下角画中画是运行时的最终游戏效果。因为 QTE 是放在交互蓝图组件里触发的，调整关卡序列时不会直接触发，只能在运行游戏时验证。</figcaption>
</figure>

这也是我后来把录屏做成画中画的原因：左边能看到我在调 Sequencer 的时间线，右下角能看到进入游戏后 QTE 和 UI 是否真的接上。单看 Sequencer 预览很容易觉得没问题，但 QTE、扫描、输入冻结和 UI 提示都要在运行时才算数。

<figure>
    <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/cinematic-ui-ae-ingame.gif" alt="过场动画 UI 循环动图" loading="lazy" decoding="async" />
    <figcaption>过场 UI 测试：先在 AE 中整理 UI 动效逻辑，再回到实机测试和 Sequencer 触发。</figcaption>
</figure>

我把过场集成拆成四个检查点：进入过场前冻结玩家输入，播放期间保证相机和 UI 的层级正确，关键帧处触发角色或物体状态变化，过场结束后恢复玩家控制并清理临时 UI。这个流程能减少很多“画面看起来对，但玩法状态已经乱了”的问题。

<h2 id="blueprints">蓝图触发与状态管理</h2>

蓝图负责把剧情动画从“时间线内容”变成“玩家能操作的事件”。这个项目里最重要的是 QTE：玩家要先扫描到交互点，再进入对应的按键事件。下面四张图按原始文件命名来说明，分别对应可交互物体、角色操控扫描、关卡序列控制和扫描材质。它们不是同一张小预览图的四个角，而是四个需要单独查看的工作面。

<div class="large-figure-stack">
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/blueprint-eye-interaction.webp" alt="眼部交互物体蓝图" />
        <figcaption>BP_eyescene EventGraph：可交互物体的蓝图。用于处理眼部组件这一类可交互物体的拾取和反馈逻辑。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/blueprint-character-scan.webp" alt="角色扫描控制蓝图" />
        <figcaption>CBP_SandboxCharacter EventGraph：角色操控扫描的蓝图。用于处理角色输入、右键扫描触发和扫描检测。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/blueprint-level-sequence.webp" alt="关卡序列控制蓝图" />
        <figcaption>Graveyard EventGraph：关卡序列蓝图（控制播放）。用于控制关卡序列播放和剧情节点衔接。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/material-scan-postprocess.webp" alt="扫描后处理材质图" />
        <figcaption>M_PP_ScanScene MaterialGraph_0：扫描材质部分。用于扫描效果里的后处理、深度和轮廓反馈。</figcaption>
    </figure>
</div>

这一组图的重点不是泛泛地讲“状态命名”，而是说明我把不同功能拆在了不同蓝图和材质图里：`BP_eyescene` 负责可交互物体和拾取反馈，`CBP_SandboxCharacter` 负责角色输入、右键扫描和检测，`Graveyard` 关卡蓝图负责关卡序列播放，`M_PP_ScanScene` 负责扫描材质。QTE 本身放在交互蓝图组件里，这样每个交互区域可以重复用同一套逻辑，也方便区分“已扫描”“可交互”“已完成”等状态。

<h2 id="scan-fx">扫描特效与可读性</h2>

扫描系统是为了服务 QTE 的。玩家如果不知道哪里能继续按键交互，QTE 就会变成乱找按钮。所以我把扫描做成一个信息层：玩家按右键后能看到哪些物体有意义，哪些已经处理，哪些还能触发下一步事件。为了让这个反馈成立，我尝试了后处理材质、自定义深度、轮廓高亮、粒子扩散和 UI 提示的组合。

<div class="ordered-media-list">
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/early-scan-development.gif" alt="早期扫描特效制作循环动图" loading="lazy" decoding="async" />
        <figcaption>01 早期扫描特效制作：验证扫描扩散、发光轮廓和后处理层级。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/early-scan-test.gif" alt="早期扫描测试循环动图" loading="lazy" decoding="async" />
        <figcaption>02 早期扫描特效测试：检查实机场景中能否读懂目标物。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/motion-matching-scan-test.gif" alt="Motion Matching 与扫描组合测试循环动图" loading="lazy" decoding="async" />
        <figcaption>03 中期 Motion Matching 迁移和扫描特效测试：确认角色动作和扫描状态能否同时成立。</figcaption>
    </figure>
    <figure class="final-step">
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/scan-state-comparison.gif" alt="扫描状态区分循环动图" loading="lazy" decoding="async" />
        <figcaption>04 最终游戏环节：扫描会显示已交互物体和未交互物体的区别。</figcaption>
    </figure>
</div>

扫描的强度需要反复试。太弱时玩家会忽略交互点，太强时又会把雨夜环境和角色表演都压掉。最后我给它定的目标很简单：按下扫描时先让玩家注意到关键物，持续状态下能看出差异，松开或结束后不要一直干扰画面。

<h2 id="memory-palace">记忆宫殿与右键扫描</h2>

“记忆宫殿”是《底特律：化身为人》中很有意思的互动方式，在这个项目里对应的是玩家按右键触发扫描后的信息层。它不是 UI 小提示本身，而是玩家用扫描去理解环境、零件和可交互对象的方式。这个功能最后还是要回到 QTE：扫描告诉玩家哪里能继续触发事件，QTE 才能自然接下去。

<figure class="feature-figure">
    <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/eye-pickup-scan-unlock.gif" alt="获取眼睛部分后开启扫描功能（记忆宫殿）循环动图" loading="lazy" decoding="async" />
    <figcaption>获取眼睛部分后开启扫描功能（记忆宫殿）：拾取眼部组件后，右键扫描成为新的观察方式。</figcaption>
</figure>

这部分我更关注的是交互节奏：玩家先通过拾取眼部组件恢复视觉能力，再通过右键扫描进入“记忆宫殿”式的信息观察。扫描不是单纯把画面变蓝，而是把环境中的可用信息重新组织出来，让玩家知道下一步应该调查哪里、哪里可能继续出现 QTE。

<h2 id="ui">UI 提示</h2>

UI 在这个项目里主要是给 QTE 和扫描做提示。最开始我想做更接近原作的 3D UI：在需要交互的蓝图组件里直接放好 UI 图，再用 Timeline 播放动画，这样可以做出 Z 轴方向的推进和一点视差。但这个做法对蓝图、材质和动画控制要求更高，我当时还没能复刻出原版那种高级感。

最后我改成了 WBP 的 2D 用户 UI。它没有那么强的空间视差，但更稳定，也更省性能。每个交互区域可以重复调用同一个 UI 组件，只要蓝图告诉它当前提示内容和触发状态，就能在不同 QTE 点上复用。

<div class="media-grid">
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/ui-prototype.gif" alt="中期 UI 制作循环动图" loading="lazy" decoding="async" />
        <figcaption>中期 UI 制作：先验证布局、层级和基础动画。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/final-ui-prompt.gif" alt="最终 UI 提示循环动图" loading="lazy" decoding="async" />
        <figcaption>最终 UI 提示：对准角色界面时给出清晰反馈。</figcaption>
    </figure>
</div>

这次做下来我觉得 UI 最重要的是别抢走玩家注意力。玩家真正要做的是扫描、靠近、按键、触发 QTE，所以提示要短、位置要准、出现时机要对。之后如果继续做，我会再尝试把 WBP 和 3D 空间 UI 结合起来：基础提示仍然用可复用组件，关键剧情节点再做更有层次的空间动画。

<h2 id="rain">雨水、材质与环境反馈</h2>

雨夜环境承担了情绪氛围，也增加了材质和性能压力。人物身上的雨水流淌、水坑溅射、地面反光和镜头后处理需要统一到同一种湿冷环境中，否则角色和场景会分离。这个阶段我主要测试角色表面水流、雨滴溅射、水坑反馈和亮度控制。

<div class="media-grid">
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/character-rain-shader.gif" alt="人物雨水流淌效果循环动图" loading="lazy" decoding="async" />
        <figcaption>人物雨水流淌效果：让近景角色材质和雨夜环境保持一致。</figcaption>
    </figure>
    <figure>
        <img src="/media/portfolio/ue-cinematics-pipeline/images/animated/raindrop-puddle-fx.gif" alt="雨滴溅射和水坑效果循环动图" loading="lazy" decoding="async" />
        <figcaption>雨滴溅射和水坑效果：强化地面反馈和空间湿度。</figcaption>
    </figure>
</div>

这一部分也提醒我，环境效果不是越多越好。雨水、雾气、反光、扫描和 UI 同时存在时，画面很容易变脏。我后面会更早做取舍：如果一个效果只是让画面更复杂，但没有帮助玩家找到方向、理解 QTE 或看清角色状态，就应该降级或先拿掉。

<h2 id="lessons">问题复盘</h2>

**1. Sequencer 与玩法状态容易脱节。**  
过场动画在单独预览时可能完全正常，但进入可玩关卡后，玩家输入、相机控制、UI 层级和物体状态都会影响播放结果。我的处理方式是把过场前后拆成固定检查：冻结输入、设置相机、显示或隐藏 UI、播放序列、更新任务状态、恢复输入。这样每次新增镜头时都有同一套交接逻辑。

**2. 扫描特效最初缺少状态差异。**  
早期扫描只是验证扫描扩散、轮廓和后处理层级，玩家无法判断哪些物体已经处理。后来我根据“扫描会显示已交互物体和未交互物体的区别”这一目标，把状态差异纳入扫描反馈。这个改动看似只是美术层，实际解决的是玩法信息问题。

**3. UI 和镜头会互相抢注意力。**  
过场动画里如果 UI 动效过强，玩家会忽略角色表演和镜头运动；如果 UI 太弱，又不能完成提示功能。因此我把 UI 分成“剧情信息”和“操作提示”两类。剧情信息可以更有风格，操作提示必须简短直接，并尽量放在玩家视线已经集中的区域。

**4. 雨水与扫描叠加后画面容易混乱。**  
雨水反光、扫描高亮和后处理同时开启时，画面层次会变得很拥挤。解决方式不是继续加细节，而是控制每一层的强度和出现时机：扫描触发瞬间允许更亮，常态显示降低强度，雨水材质只保留对角色轮廓有帮助的部分。

**5. 本地视频片段在 UE5.4 里很难做到又省空间又流畅。**  
这个版本是为了赶作业做出来的，很多动画来不及一点点 K，只能先放本地视频片段来撑起演出节奏。但当时用的是 UE5.4，把本地视频塞进项目里并不顺手：文件体积、播放稳定性、材质显示和性能都要一起考虑。直到最后我都没有找到一个既省空间又节约性能的办法，所以在播放视频并进入 QTE 时，还是能感觉到一些卡顿。

<aside class="process-note">
    <strong>网页展示的小彩蛋</strong>
    <span>这些过程 GIF 原始体积很大，最大超过 250MB。放进网站前我保留了自动循环的观看方式，但重新压成适合网页加载的版本，并且给图片加了延迟加载。它不是项目本体的问题，只是作品集页面展示时需要处理的小尾巴。</span>
</aside>

<h2 id="checklist">之后可以复用的检查清单</h2>

这次练习后，我把自己踩过的坑整理成一张简单清单。之后再做 UE 过场、QTE 互动、扫描系统或者游戏内演出时，可以直接照着检查一遍。

| 阶段 | 检查项 |
| --- | --- |
| 输入 | 剧情目标、QTE 节点、角色状态、场景资产、音效或字幕需求是否明确 |
| 白模 | 玩家路线、镜头遮挡、可交互物距离、触发区域和出口方向是否看得懂 |
| Sequencer | Camera Cut、镜头命名、焦距/景深、事件关键帧、UI 层级是否清楚 |
| 蓝图 | 输入冻结、任务阶段、物体状态、扫描解锁、QTE 触发和恢复控制是否闭环 |
| 特效 | 扫描、雨水、后处理和 UI 是否有优先级，是否会互相遮挡 |
| 性能 | 视频、粒子、后处理、材质和动态 UI 是否会造成明显卡顿 |
| 交付 | 是否有镜头表、问题记录、素材命名说明、可复用清单和压缩后的网页媒体 |

对我来说，这个项目最大的收获不是某一个特效做成了，而是我更清楚地知道：一个剧情片段进到引擎里以后，就不只是画面了。它要被玩家触发，要接 QTE，要能扫描，要能恢复输入，还要考虑性能。之后我再做类似内容，会先把交互状态和播放逻辑理顺，再去补动画和画面细节。
