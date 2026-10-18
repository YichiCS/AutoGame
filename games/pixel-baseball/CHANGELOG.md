# 像素甲子园 · 更新日志

每次更新在 `pixel-baseball-v<版本号>` 分支上完成，合并回 main 后上线。新版本写在最上面。

## v0.1.0 — 2026-10-18

收录进 AutoGame 游戏厅。原仓库 [YichiCS/Pixel-Baseball](https://github.com/YichiCS/Pixel-Baseball) 用 git subtree 导入，保留了全部提交历史。

- 接入游戏厅：`game.json`、存档适配器 `save-adapter.js`（游戏厅里显示每个栏位的学校、监督和日期）、构建模板末尾引入游戏内悬浮标签，并重新构建 `dist/index.html`。离开游戏前会提醒「每周结束时才自动存档」。
- 发布改由 AutoGame 负责（GitHub Pages 直接发布 main 分支），删除了原仓库的 Pages 部署工作流；构建产物 `dist/index.html` 继续提交进仓库。
- 存档位置不变（IndexedDB `pixel-koshien`，localStorage `pixel-koshien:*`）。
- 在线游玩地址：<https://yichics.github.io/AutoGame/games/pixel-baseball/dist/>。

收录时已有的内容（原仓库「像素甲子园：监督之路——首个可玩版本」）：

- 监督生涯：5 种出身、47 个都道府县、8 项监督能力、校方目标与评价、跳槽、16 项成就、OB 名鉴。
- 球员与育成：15 项能力、7 种变化球、40 多种特殊能力、隐藏潜力与成长型、9 种练习菜单、疲劳 / 调子 / 伤病。
- 逐球模拟的比赛引擎与现场指挥，高中棒球规则（500 球限制、抢分决胜、提前结束）。
- 春季县大会到春季选拔的完整大会日程、招募、经营与赞助、40 多种随机事件。
