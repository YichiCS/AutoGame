# 更新规则

> **不直接修改 main。** 每次更新某个游戏：从 main 拉一个 `<游戏id>-v<版本号>` 分支，在分支上改完，再合并回 main。

main 就是线上版本：GitHub Pages 直接发布 main 分支的根目录，合并进 main 一分钟左右 <https://yichics.github.io/AutoGame/> 就会更新。所以 main 上的每一次变化都应该是「某个游戏 / 游戏厅的某个版本」整体合并进来的。

## 分支命名

| 要改的东西 | 分支名 | 例子 |
| --- | --- | --- |
| 某个游戏 | `<游戏id>-v<新版本号>` | `research-simulator-v1.4.0`、`pixel-baseball-v2.1.1` |
| 收录一个新游戏 | `<新游戏id>-v<首个版本号>` | `pixel-chess-v1.0.0` |
| 游戏厅框架（首页、存档中心、接入脚本、检查脚本、文档、根目录文件） | `hub-v<新版本号>` | `hub-v1.2.0` |

- **游戏 id** 就是 `games/` 下的目录名，也是该游戏 `game.json` 里的 `id`。现有：`research-simulator`、`pixel-baseball`。
- **版本号**写这次改完之后的新版本号，必须比 main 上的大。
- **一个分支只改一个游戏**：游戏分支只动 `games/<游戏id>/`（收录新游戏时可以顺带改 `autogame.json` 和 `README.md` 来登记）；`hub-v…` 分支不动 `games/`。框架改动如果需要每个游戏配合，先合并 hub 分支，再给每个游戏各开一个分支跟进。

## 版本号怎么升

所有游戏和游戏厅用同一套规则。版本号是 `主版本.次版本.修订号`，升哪一位只看两件事：**旧存档还能不能接着玩**、**玩家能不能玩到新东西**——不看改了多少代码。

| 改动 | 升哪一位 | 例子 |
| --- | --- | --- |
| 修 bug、调数值、改文案、微调已有功能的做法 | 修订号 | 1.3.1 → 1.3.2 |
| 新内容、新玩法、新系统、改规则——改动再大，只要旧存档能接着玩，就只升这一位 | 次版本 | 1.3.2 → 1.4.0 |
| 旧存档没法在新版里接着玩，只能重开 | 主版本 | 1.4.0 → 2.0.0 |

- **起点**：收录进游戏厅时已经能从头玩到尾的游戏，从 `1.0.0` 开始。还没做完、只能试玩的从 `0.1.0` 开始；0.x 是试玩期，存档不保证能带到 `1.0.0`。
- **主版本 = 存档的代**：同一个主版本里的存档，在之后的任何版本里都能接着玩。游戏厅导入存档时就按这个判断：存档的主版本比游戏小，提醒「可能不兼容」；存档的版本比游戏新，提醒「可能读不出来」。所以主版本既不能漏升（玩家会在没有提醒的情况下导入读不了的存档），也不能多升（每个旧存档都会被误报不兼容）。
- **改了存档结构**：在游戏里写迁移代码、读到旧格式时自动转换，旧存档就算「能接着玩」，只升次版本。改存档键名 / 库名也一样：写迁移，旧的键名继续留在 `saves` 里（否则从旧存档包导入时这部分数据会被丢掉）。
- **游戏厅**：主版本 = 存档包格式或 `game.json` 格式出现不兼容（旧的存档包读不了，或者每个游戏都得跟着改）；次版本 = 新功能；修订号 = 修 bug、改文档。
- 一次更新里有好几种改动，按最高的那一档升。

### 旧版本号对照

2026-10-18 统一规则之前，两个游戏各按各的习惯升版本：科研模拟器加新功能只升次版本，一直停在 0.x；像素甲子园存档兼容的大改也升了主版本。现在按上面的规则重新编号。旧的分支名、提交说明、存档包里写的还是原来的版本号，对照如下。每个游戏的 `game.json` 用 `legacyVersions` 记着这张表，游戏厅导入旧存档包时先换算成新版本号再比较，不会误报。

科研模拟器（`research-simulator`）：

| 原版本号 | 新版本号 | 内容 |
| --- | --- | --- |
| 0.1.0 | 1.0.0 | 收录进游戏厅（收录时已经能完整玩） |
| 0.2.0 | 1.1.0 | 出路方针、持续招人、自动招满、工位分配顺序 |
| 0.3.0 | 1.2.0 | 博后一直续约、博士最多读 8 年 |
| 0.4.0 | 1.3.0 | 实验室无限扩建 |
| 0.4.1 | 1.3.1 | 持续招人不再有空档 |
| 0.4.2 | 1.3.2 | 持续招人改为按钮可用时自动点一下 |

像素甲子园（`pixel-baseball`）：

| 原版本号 | 新版本号 | 内容 |
| --- | --- | --- |
| 0.1.0 | 1.0.0 | 收录进游戏厅（经营版） |
| 1.0.0 | 2.0.0 | 改版为挂机游戏，经营版的存档不能继续 |
| 2.0.0 | 2.1.0 | 比赛以打席为单位亲自指挥，挂机版的存档可以继续 |

游戏厅（`hub`）的 1.0.0 → 1.0.1 → 1.0.2 本来就符合规则，不变。平常升版本不用碰 `legacyVersions`，只有再做一次整体重新编号时才往里加。

## 一次更新的完整流程

以把像素甲子园更新到 2.2.0 为例：

```bash
# 1. 从最新的 main 拉分支
git switch main
git pull
git switch -c pixel-baseball-v2.2.0

# 2. 修改 games/pixel-baseball/ 里的内容……

# 3. 收尾（每次都要做）
#    - games/pixel-baseball/game.json 的 version 改成 2.2.0（有 package.json 的游戏同步改）
#    - games/pixel-baseball/CHANGELOG.md 顶部加一条「## v2.2.0 — 日期」，写清楚改了什么
#    - 需要构建的游戏（game.json 里有 build）：在游戏目录构建，并把构建产物一起提交
#        cd games/pixel-baseball && npm ci && npm run build && cd ../..
#    - 自查
node scripts/check.mjs --branch pixel-baseball-v2.2.0 --base main
node scripts/serve.mjs        # 打开 http://localhost:8080/AutoGame/ 从游戏厅进入游戏试玩

# 4. 提交（可以分多次提交，都在这个分支上）
git add -A
git commit -m "pixel-baseball v2.2.0：……"

# 5. 合并回 main（二选一）
#  A. 走 PR（推荐，GitHub 会自动跑检查）
git push -u origin pixel-baseball-v2.2.0
#     然后在 GitHub 上开 PR 到 main，检查通过后用「Create a merge commit」合并
#  B. 本地合并（一定要 --no-ff，保留「这是一个版本」的合并记录）
git switch main
git pull
git merge --no-ff pixel-baseball-v2.2.0
git push origin main pixel-baseball-v2.2.0
```

合并后的分支可以留着当版本记录，也可以删掉（合并提交里已经记下了分支名）。

## 存档兼容（重要）

玩家的存档只保存在他们自己的浏览器里，改坏了没法从服务器恢复，所以：

- **不要改已有的存档键名 / 数据库名**（`game.json` 里 `saves` 声明的那些）。确实要改，游戏里要写迁移：读到旧键就搬到新键；并升主版本号。
- 读档时兼容旧数据：缺少的新字段补默认值，不认识的旧字段别报错。
- 新增了存储位置（新的 localStorage 键、新的 IndexedDB 库），**同步更新 `game.json` 的 `saves`**，否则游戏厅导出不到。
- 新游戏的 localStorage 键一律用 `<游戏id>:` 前缀，IndexedDB 库名用 `<游戏id>`。`autogame` 开头的名字留给游戏厅自己。
- 同一个域名（yichics.github.io）下的所有项目共用 localStorage 和 IndexedDB，名字起得太宽泛会和别的项目撞。

## 收录新游戏

1. 拉分支 `<新游戏id>-v<首个版本号>`。游戏 id 用小写字母、数字和连字符，定下来就不要再改（存档包、分支名都靠它）。
2. 把游戏放进 `games/<id>/`。想保留原仓库的提交历史可以用 subtree：
   ```bash
   git subtree add --prefix=games/<id> https://github.com/<用户>/<仓库>.git main
   ```
3. 写 `games/<id>/game.json`，照着现有游戏改；字段说明见 [docs/architecture.md](docs/architecture.md#gamejson)。
4. 入口 HTML 里引入游戏厅的接入脚本（相对路径按入口文件的位置写到仓库根目录的 `hub/dock.js`）。它不在画面上显示任何东西；游戏要在**自己的设置菜单**里放「返回游戏厅」「存档管理」，地址从 `window.AutoGame.hubUrl` / `savesUrl` 取（见 [docs/architecture.md](docs/architecture.md#接入脚本-dockjs)）。不要在游戏画面上浮任何东西：
   ```html
   <script src="../../hub/dock.js" data-game="<id>" defer></script>
   ```
5. 存档用 `<id>:` 前缀，并在 `game.json` 的 `saves` 里声明；想让游戏厅显示存档详情（哪个存档、玩到哪了），写一个 `save-adapter.js`。
6. 加封面（建议 16:10 的游戏截图）和 `CHANGELOG.md`。
7. 在 `autogame.json` 的 `games` 里登记 id（顺序就是游戏厅里的展示顺序），在 `README.md` 的游戏列表里加一行。
8. 所有资源都用**相对路径**：网站挂在 `/AutoGame/` 子路径下，以 `/` 开头的路径会 404。
9. `node scripts/check.mjs` 通过；`node scripts/serve.mjs` 本地走一遍：游戏厅 → 进入游戏 → 存档 → 返回游戏厅 → 导出 → 清除 → 导入 → 继续游戏。

## 防呆设施

- **本地 git 钩子**（每个 clone 运行一次）：
  ```bash
  git config core.hooksPath .githooks
  ```
  之后在 main 上直接 `git commit` 会被拦下；分支名不符合 `<游戏id>-v<版本号>` 会被拦下；推送 main 时如果有没经过 `--no-ff` 合并的提交也会被拦下。
- **GitHub Actions「检查」**：每次推送和 PR 自动运行 `scripts/check.mjs`——清单和文件是否齐全、接入脚本是否引入、存档声明有没有互相冲突、分支名和版本号是否合规、构建产物是否已提交。
- **建议开启分支保护**（需要在 GitHub 网页上设置一次）：Settings → Rules → Rulesets（或 Settings → Branches）→ 给 `main` 加规则，勾选 *Require a pull request before merging* 和 *Require status checks to pass*（选「检查」）。开启后只能走上面的 A 流程。
