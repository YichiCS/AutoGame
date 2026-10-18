# 更新规则

> **不直接修改 main。** 每次更新某个游戏：从 main 拉一个 `<游戏id>-v<版本号>` 分支，在分支上改完，再合并回 main。

main 就是线上版本：GitHub Pages 直接发布 main 分支的根目录，合并进 main 一分钟左右 <https://yichics.github.io/AutoGame/> 就会更新。所以 main 上的每一次变化都应该是「某个游戏 / 游戏厅的某个版本」整体合并进来的。

## 分支命名

| 要改的东西 | 分支名 | 例子 |
| --- | --- | --- |
| 某个游戏 | `<游戏id>-v<新版本号>` | `research-simulator-v0.2.0`、`pixel-baseball-v0.1.1` |
| 收录一个新游戏 | `<新游戏id>-v<首个版本号>` | `pixel-chess-v0.1.0` |
| 游戏厅框架（首页、存档中心、悬浮标签、脚本、文档、根目录文件） | `hub-v<新版本号>` | `hub-v1.1.0` |

- **游戏 id** 就是 `games/` 下的目录名，也是该游戏 `game.json` 里的 `id`。现有：`research-simulator`、`pixel-baseball`。
- **版本号**写这次改完之后的新版本号，必须比 main 上的大。
- **一个分支只改一个游戏**：游戏分支只动 `games/<游戏id>/`（收录新游戏时可以顺带改 `autogame.json` 和 `README.md` 来登记）；`hub-v…` 分支不动 `games/`。框架改动如果需要每个游戏配合，先合并 hub 分支，再给每个游戏各开一个分支跟进。

## 版本号怎么升

版本号是 `主版本.次版本.修订号`：

| 改动 | 升哪一位 | 例子 |
| --- | --- | --- |
| 修 bug、调数值、改文案，旧存档照常能读 | 修订号 | 0.1.0 → 0.1.1 |
| 加新内容、新玩法，旧存档照常能读 | 次版本 | 0.1.1 → 0.2.0 |
| 旧存档读不出来（或需要迁移）、大改 | 主版本 | 0.2.0 → 1.0.0 |

游戏厅导入存档时会对比版本：存档来自更新的版本、或来自更早的主版本，都会提醒玩家。所以**存档不兼容的改动一定要升主版本**——更好的做法是在游戏里写迁移代码，让旧存档继续能读。

## 一次更新的完整流程

以把像素甲子园更新到 0.2.0 为例：

```bash
# 1. 从最新的 main 拉分支
git switch main
git pull
git switch -c pixel-baseball-v0.2.0

# 2. 修改 games/pixel-baseball/ 里的内容……

# 3. 收尾（每次都要做）
#    - games/pixel-baseball/game.json 的 version 改成 0.2.0（有 package.json 的游戏同步改）
#    - games/pixel-baseball/CHANGELOG.md 顶部加一条「## v0.2.0 — 日期」，写清楚改了什么
#    - 需要构建的游戏（game.json 里有 build）：在游戏目录构建，并把构建产物一起提交
#        cd games/pixel-baseball && npm ci && npm run build && cd ../..
#    - 自查
node scripts/check.mjs --branch pixel-baseball-v0.2.0 --base main
node scripts/serve.mjs        # 打开 http://localhost:8080/AutoGame/ 从游戏厅进入游戏试玩

# 4. 提交（可以分多次提交，都在这个分支上）
git add -A
git commit -m "pixel-baseball v0.2.0：……"

# 5. 合并回 main（二选一）
#  A. 走 PR（推荐，GitHub 会自动跑检查）
git push -u origin pixel-baseball-v0.2.0
#     然后在 GitHub 上开 PR 到 main，检查通过后用「Create a merge commit」合并
#  B. 本地合并（一定要 --no-ff，保留「这是一个版本」的合并记录）
git switch main
git pull
git merge --no-ff pixel-baseball-v0.2.0
git push origin main pixel-baseball-v0.2.0
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
4. 入口 HTML 里引入游戏厅的悬浮标签（相对路径按入口文件的位置写到仓库根目录的 `hub/dock.js`）：
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
- **GitHub Actions「检查」**：每次推送和 PR 自动运行 `scripts/check.mjs`——清单和文件是否齐全、悬浮标签是否引入、存档声明有没有互相冲突、分支名和版本号是否合规、构建产物是否已提交。
- **建议开启分支保护**（需要在 GitHub 网页上设置一次）：Settings → Rules → Rulesets（或 Settings → Branches）→ 给 `main` 加规则，勾选 *Require a pull request before merging* 和 *Require status checks to pass*（选「检查」）。开启后只能走上面的 A 流程。
