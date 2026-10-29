---
title: "《扑光：今夜回家》"
titleEn: "Puguang: Home Tonight"
subtitle: "以光引路，让一群小家伙平安回家"
subtitleEn: "Guide a small flock home with light"
description: "个人独立开发的俯视角群体引导与轻解谜游戏。以 20 关试玩为线索，记录玩法、关卡、交互反馈与视觉整合的制作过程。"
descriptionEn: "A solo-developed top-down flock-guiding puzzle game. This case study follows a 20-level demo through gameplay, level design, interaction feedback, and visual integration."
category: "独立游戏 / 玩法与关卡设计 / TapTap GameJam"
categoryEn: "Independent Game / Gameplay & Level Design / TapTap GameJam"
pubDate: 2026-10-21
heroImage: "/media/portfolio/puguang/hero.webp"
tags: ["Solo Development", "HTML5", "Canvas", "Game Design", "TapTap GameJam"]
---

<aside class="case-link-panel">
    <span data-i18n-cn="在线试玩 / HTML5" data-i18n-en="Play in browser / HTML5">在线试玩 / HTML5</span>
    <strong data-i18n-cn="先玩一小段，再看这些规则如何被组织成关卡。" data-i18n-en="Try a short session, then explore how the rules become levels.">先玩一小段，再看这些规则如何被组织成关卡。</strong>
    <a href="https://puguang-home-zq.openelf5.chatgpt.site" target="_blank" rel="noopener noreferrer" data-i18n-cn="打开《扑光》试玩" data-i18n-en="Play Puguang">打开《扑光》试玩</a>
</aside>

<p data-i18n-cn="版本说明：公网试玩与本地迭代分开维护。本文展示的游戏截图来自本地 v1.1.1，不代表在线版本已同步。移动端已进行布局与输入调整，真实手机触屏手感仍待验证。" data-i18n-en="Version note: the public demo and local iterations are maintained separately. Gameplay screenshots here show local v1.1.1 and may differ from the online build. Mobile layouts and input have been revised; real-device touch feel remains unverified.">版本说明：公网试玩与本地迭代分开维护。本文展示的游戏截图来自本地 v1.1.1，不代表在线版本已同步。移动端已进行布局与输入调整，真实手机触屏手感仍待验证。</p>

<h2 id="overview" data-i18n-cn="从一盏灯开始的独立游戏" data-i18n-en="An independent game that starts with one light">从一盏灯开始的独立游戏</h2>

<p data-i18n-cn="《扑光：今夜回家》是一款俯视角群体引导与轻解谜游戏。玩家不直接控制飞蛾，而是布置冷光、使用哨声、火源与香盘，改变蛾群的移动方向，再安排路线与时机，把它们接回温室。2026 年 10 月 21 日，项目完成首次 TapTap GameJam 提交。" data-i18n-en="Puguang: Home Tonight is a top-down flock-guiding puzzle game. Instead of controlling moths directly, players place cool lights and use whistles, fire, and incense to influence the flock, plan routes, and time its return to a greenhouse. The project made its first TapTap GameJam submission on October 21, 2026.">《扑光：今夜回家》是一款俯视角群体引导与轻解谜游戏。玩家不直接控制飞蛾，而是布置冷光、使用哨声、火源与香盘，改变蛾群的移动方向，再安排路线与时机，把它们接回温室。2026 年 10 月 21 日，项目完成首次 TapTap GameJam 提交。</p>

<p data-i18n-cn="这是我的个人独立游戏实践。我围绕玩法原型、关卡编排、交互实现、视觉与音频整合、测试和 H5 打包持续迭代。当前试玩包含 20 关，主任务之外设置额外星级目标，让同一关既可以先求通关，也可以继续优化路线与补给使用。" data-i18n-en="This is my solo game-development practice, spanning gameplay prototyping, level progression, interaction implementation, visual and audio integration, testing, and H5 packaging. The demo contains 20 levels, with optional star objectives that let players first complete a level and then refine routes and resource use.">这是我的个人独立游戏实践。我围绕玩法原型、关卡编排、交互实现、视觉与音频整合、测试和 H5 打包持续迭代。当前试玩包含 20 关，主任务之外设置额外星级目标，让同一关既可以先求通关，也可以继续优化路线与补给使用。</p>

<figure>
    <img src="/media/portfolio/puguang/cover.webp" alt="《扑光：今夜回家》正式宣传封面与完整标题 Logo" width="1920" height="1080" loading="lazy" decoding="async" />
    <figcaption data-i18n-cn="正式宣传封面：提灯、飞蛾与夜间花园共同建立“接它们回家”的情绪。此图为宣传插画，游戏画面见下方。" data-i18n-en="Official promotional artwork: the lantern, moths, and night garden establish the mood of guiding them home. This illustration is distinct from the gameplay screenshots below.">正式宣传封面：提灯、飞蛾与夜间花园共同建立“接它们回家”的情绪。此图为宣传插画，游戏画面见下方。</figcaption>
</figure>

<h2 id="gameplay" data-i18n-cn="玩法：引导群体，而非控制单个角色" data-i18n-en="Gameplay: guide a flock rather than a single character">玩法：引导群体，而非控制单个角色</h2>

<p data-i18n-cn="核心循环是观察、部署、看蛾群反应，再收起或补上下一处引导。冷光建立安全的吸引点，哨声帮助打断聚集或改变方向；火源兼有吸引与危险，香盘则用于限制飞蛾进入某些区域。道具的意义由位置、时机和环境共同决定，不能只靠连续放灯解决所有问题。" data-i18n-en="The core loop is to observe, deploy, watch the flock respond, and then recall or add the next guide. Cool light creates a safe attraction point, while whistles interrupt gathering or change direction. Fire brings both attraction and danger; incense helps keep moths out of certain areas. Position, timing, and the environment give each tool its meaning.">核心循环是观察、部署、看蛾群反应，再收起或补上下一处引导。冷光建立安全的吸引点，哨声帮助打断聚集或改变方向；火源兼有吸引与危险，香盘则用于限制飞蛾进入某些区域。道具的意义由位置、时机和环境共同决定，不能只靠连续放灯解决所有问题。</p>

<figure>
    <img src="/media/portfolio/puguang/gameplay.webp" alt="本地 v1.1.1 游戏截图：蛾群、可燃叶墙、温室与四种道具" width="1366" height="768" loading="lazy" decoding="async" />
    <figcaption data-i18n-cn="本地 v1.1.1 游戏画面：第 15 关“风过叶墙”，观察蛾群、风向与可燃障碍，再安排通往温室的路线。" data-i18n-en="Local v1.1.1 gameplay: level 15, Wind through the Leaf Wall. Players observe the flock, wind, and a burnable barrier before planning the route to the greenhouse.">本地 v1.1.1 游戏画面：第 15 关“风过叶墙”，观察蛾群、风向与可燃障碍，再安排通往温室的路线。</figcaption>
</figure>

<h2 id="levels" data-i18n-cn="20 关：先读懂规则，再组合规则" data-i18n-en="20 levels: learn the rules, then combine them">20 关：先读懂规则，再组合规则</h2>

<p data-i18n-cn="前段关卡从一盏冷光和接力引路开始，让玩家看懂吸引、收起与继续前进的关系。随后逐步加入遮挡、风、雨、不同性格的飞蛾以及危险生物；后段再组合可燃叶墙、压力板与闸门。教学重点是让环境里的变化对应玩家刚刚做出的操作，而不是一次性列出所有说明。" data-i18n-en="Early levels start with one cool light and a relay of attraction points, establishing the relationship between placement, recall, and onward movement. Occlusion, wind, rain, moth temperaments, and dangerous creatures enter gradually. Later levels combine burnable leaf walls, pressure plates, and gates. The aim is to connect visible changes to the player's latest action.">前段关卡从一盏冷光和接力引路开始，让玩家看懂吸引、收起与继续前进的关系。随后逐步加入遮挡、风、雨、不同性格的飞蛾以及危险生物；后段再组合可燃叶墙、压力板与闸门。教学重点是让环境里的变化对应玩家刚刚做出的操作，而不是一次性列出所有说明。</p>

<p data-i18n-cn="星级任务把“能够完成”和“完成得更好”分开：基础目标确保玩家能推进，额外目标再要求接回更多飞蛾、节省资源或完成特定操作。复盘时，我会检查失败能否归因到可见规则，以及关卡是否在要求尚未教过的技巧。" data-i18n-en="Star objectives separate completion from mastery: the main objective allows progression, while optional goals ask players to rescue more moths, conserve resources, or perform specific actions. During iteration, I check whether a failure can be traced to a visible rule and whether a level expects a skill that has not yet been introduced.">星级任务把“能够完成”和“完成得更好”分开：基础目标确保玩家能推进，额外目标再要求接回更多飞蛾、节省资源或完成特定操作。复盘时，我会检查失败能否归因到可见规则，以及关卡是否在要求尚未教过的技巧。</p>

<h2 id="visuals" data-i18n-cn="视觉：用冷暖关系解释危险与归处" data-i18n-en="Visual direction: warm and cool cues for danger and shelter">视觉：用冷暖关系解释危险与归处</h2>

<p data-i18n-cn="视觉围绕夜间花园展开：蓝绿环境压低背景，温室和灯光保留清晰的亮度层次，飞蛾与小叶的形象维持柔和的插画气质。宣传图负责建立情绪；实际游戏界面则优先区分路线、道具和环境事件，让美术服务判断。" data-i18n-en="The visual direction centers on a garden at night: blue-green surroundings recede, the greenhouse and lights retain distinct brightness levels, and the moths and Xiaoye keep a soft illustrative character. Promotional artwork sets the mood; the playable interface prioritizes routes, tools, and environmental events so that the art supports decisions.">视觉围绕夜间花园展开：蓝绿环境压低背景，温室和灯光保留清晰的亮度层次，飞蛾与小叶的形象维持柔和的插画气质。宣传图负责建立情绪；实际游戏界面则优先区分路线、道具和环境事件，让美术服务判断。</p>

<h2 id="interaction" data-i18n-cn="交互：把反馈放在动作发生的地方" data-i18n-en="Interaction: feedback where the action happens">交互：把反馈放在动作发生的地方</h2>

<p data-i18n-cn="一次部署需要让玩家同时理解“放在哪里”和“花了多少补给”。迭代中，补给扣除提示被放回补给显示附近；移动端则拆分轻点放置、按住瞄准、滑出取消和道具收起，减少误触。暂停状态仍允许观察地图，让玩家有空间重新规划。" data-i18n-en="Each placement must communicate both its location and its resource cost. Iterations moved the resource-decrement cue beside the supply display. Mobile input distinguishes tap-to-place, hold-to-aim, slide-to-cancel, and tool recall to reduce accidental actions. Players can still inspect the map while paused and reconsider their route.">一次部署需要让玩家同时理解“放在哪里”和“花了多少补给”。迭代中，补给扣除提示被放回补给显示附近；移动端则拆分轻点放置、按住瞄准、滑出取消和道具收起，减少误触。暂停状态仍允许观察地图，让玩家有空间重新规划。</p>

<p data-i18n-cn="本地 v1.1.1 增加可移动镜头、全图查看和小地图定位，以应对横屏、竖屏和超宽屏的可视范围差异。它们解决的是观察与布局问题；截图和自动化检查仍不能代替手机上的真实触屏体验。" data-i18n-en="Local v1.1.1 adds a movable camera, a full-map view, and minimap navigation to handle the different visible areas of landscape, portrait, and ultrawide screens. These changes address observation and layout; screenshots and automated checks still cannot establish real-device touch quality.">本地 v1.1.1 增加可移动镜头、全图查看和小地图定位，以应对横屏、竖屏和超宽屏的可视范围差异。它们解决的是观察与布局问题；截图和自动化检查仍不能代替手机上的真实触屏体验。</p>

<figure>
    <img src="/media/portfolio/puguang/result.webp" alt="本地 v1.1.1 夜巡手记式结算界面与任务反馈" width="1366" height="768" loading="lazy" decoding="async" />
    <figcaption data-i18n-cn="本地 v1.1.1 结算界面：把结果、任务与继续操作组织成一张夜巡手记。此图展示界面状态，不作为完整通关证明。" data-i18n-en="Local v1.1.1 result interface: outcomes, objectives, and next actions arranged as a night-watch journal. This image documents an interface state rather than a full-playthrough result.">本地 v1.1.1 结算界面：把结果、任务与继续操作组织成一张夜巡手记。此图展示界面状态，不作为完整通关证明。</figcaption>
</figure>

<h2 id="retrospective" data-i18n-cn="GameJam 复盘：先保证循环成立，再打磨表达" data-i18n-en="GameJam retrospective: establish the loop, then refine its expression">GameJam 复盘：先保证循环成立，再打磨表达</h2>

<p data-i18n-cn="项目使用 HTML5、JavaScript 与 Canvas 实现，先围绕群体引导验证核心循环，再逐步加入关卡目标、叙事、美术和音频。每次新增版本保留旧源码和发布包，让玩法变化与视觉调整可以回看；分享时提供可离线运行的 H5 包，线上试玩则独立维护。" data-i18n-en="The project uses HTML5, JavaScript, and Canvas. Development began with the flock-guidance loop, followed by level objectives, narrative, art, and audio. Earlier source versions and release packages are retained so that gameplay and visual changes remain traceable. Offline H5 packages and the public browser demo are maintained separately.">项目使用 HTML5、JavaScript 与 Canvas 实现，先围绕群体引导验证核心循环，再逐步加入关卡目标、叙事、美术和音频。每次新增版本保留旧源码和发布包，让玩法变化与视觉调整可以回看；分享时提供可离线运行的 H5 包，线上试玩则独立维护。</p>

<p data-i18n-cn="这次实践最重要的收获，是规则成立不等于玩家能读懂规则。风、光、声音与补给必须在发生作用时给出反馈，关卡目标也要和实际行为一致。后续重点是开展真实手机试玩，观察误触、信息遮挡与教学理解，再决定哪些交互和关卡需要继续调整。" data-i18n-en="The main lesson is that working rules do not guarantee understandable rules. Wind, light, sound, and resource costs need feedback when they take effect, and objectives must match actual behavior. The next priority is real-device mobile playtesting to observe accidental input, obstructed information, and tutorial comprehension before deciding what to revise.">这次实践最重要的收获，是规则成立不等于玩家能读懂规则。风、光、声音与补给必须在发生作用时给出反馈，关卡目标也要和实际行为一致。后续重点是开展真实手机试玩，观察误触、信息遮挡与教学理解，再决定哪些交互和关卡需要继续调整。</p>
