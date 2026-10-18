# AutoGame · 给 Claude 的工作须知

像素小游戏合集。GitHub Pages 直接发布 main 分支根目录：<https://yichics.github.io/AutoGame/> 是游戏厅首页（`index.html`），每个游戏在 `games/<id>/`。

## 必须遵守的更新规则（详见 CONTRIBUTING.md）

- **绝不直接在 main 上提交或修改。** 开始改动之前先确认当前分支。
- 更新某个游戏：`git switch main && git pull && git switch -c <游戏id>-v<新版本号>`，在分支上改完再合并回 main（`git merge --no-ff`，或推分支开 PR）。
- 改游戏厅框架（`hub/`、`index.html`、`scripts/`、`docs/`、根目录文件）用 `hub-v<新版本号>` 分支。
- 一个分支只改一个游戏的目录；游戏分支只有在收录新游戏时才能改 `autogame.json`（登记 id）和 `README.md`。
- 每次都要：升版本号（`game.json` 的 `version`，有 `package.json` 的同步改；hub 改 `autogame.json` 的 `version`），在对应的 `CHANGELOG.md` 顶部写 `## v<版本号> — 日期`。
- `game.json` 里有 `build` 的游戏：提交前在游戏目录构建，把构建产物（如 `dist/index.html`）一起提交——Pages 不会替你构建。
- 提交前运行 `node scripts/check.mjs --branch <分支名> --base main`。
- 合并 / 推送前问一下用户，除非用户已经明确要求。
- clone 后运行一次 `git config core.hooksPath .githooks` 启用钩子。

## 存档

- 存档只在玩家浏览器里（localStorage / IndexedDB），游戏厅按 `game.json` 的 `saves` 声明来导出、导入、清除。
- 不要改已有的存档键名 / 库名；必须改时在游戏里写迁移并升主版本号。新增存储位置要同步 `saves`。
- 新游戏：localStorage 键用 `<id>:` 前缀，IndexedDB 库名用 `<id>`；`autogame` 开头的名字是游戏厅保留的。
- 游戏的 `save-adapter.js`（可选）只给游戏厅用：`describe(data)` 显示存档详情，`beforeImport(data)` 导入前调整数据。

## 其他约定

- 所有路径用相对路径（站点在 `/AutoGame/` 子路径下）。
- 每个游戏的入口 HTML 都要引入 `hub/dock.js`（`data-game="<id>"`）。
- 本地预览：`node scripts/serve.mjs` → <http://localhost:8080/AutoGame/>。
- 框架说明（目录、`game.json` 字段、存档包格式、悬浮标签）：`docs/architecture.md`。
