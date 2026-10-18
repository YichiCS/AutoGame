# 科研模拟器 · 更新日志

每次更新在 `research-simulator-v<版本号>` 分支上完成，合并回 main 后上线。新版本写在最上面。

## v0.1.0 — 2026-10-18

收录进 AutoGame 游戏厅。原仓库 [YichiCS/Research-Simulator](https://github.com/YichiCS/Research-Simulator) 用 git subtree 导入，保留了全部提交历史。

- 接入游戏厅：`game.json`、存档适配器 `save-adapter.js`（游戏厅里显示实验室 / 读博进度；从游戏厅导入存档时不会触发离线快进）、游戏内悬浮标签。
- 存档位置不变（`research-sim-save-v1`、`research-sim-settings-v1`）：在原地址 yichics.github.io/Research-Simulator/ 玩出的存档，从游戏厅打开时直接就在。
- 在线游玩地址改为 <https://yichics.github.io/AutoGame/games/research-simulator/>。

收录时已有的内容（原仓库的开发记录）：

- 初始可玩版本：经营实验室，申请基金、招生、发论文、Tenure / 非升即走考核，北美和中国两种职业体系。
- 课题组（子方向）系统；学校库、按贡献署名、22 个新随机事件。
- 博士阶段：从博士一年级开始，读完博士凭成果找教职；导师行为带随机性。
- 研究方向体系「领域 → 方向 → 子方向」；参考 ccfddl 收录 230 多个会议期刊，支持跨方向投稿。
- 小组规则、工位扩到 32 个、跳槽、青年教师带团队加入、算力「水管」模型、统计页、托管细分。
- 招生面试排序、会议出差「只派一个代表」、更多经费来源、时间检验奖（Test of Time）。
- 学生信息卡、二级导航、论文筛选；学生能力改为正态分布、每年按潜力成长。
