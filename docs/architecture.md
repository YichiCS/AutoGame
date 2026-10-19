# 框架说明

AutoGame 是一个纯静态网站：没有服务器、没有构建步骤，GitHub Pages 直接发布 main 分支的根目录。游戏厅首页列出所有游戏；每个游戏是 `games/<id>/` 下一个独立的网页，彼此不共享代码；所有游戏的存档由游戏厅统一管理。

## 目录结构

```
index.html               游戏厅首页（https://yichics.github.io/AutoGame/）
autogame.json            站点配置：游戏厅版本 + 游戏列表（顺序即展示顺序）
hub/                     游戏厅
  hub.css                像素风样式（Sweetie 16 配色、Fusion Pixel 字体）
  dock.js                游戏内悬浮标签，每个游戏的入口页面引入
  icon.svg               站点图标
  fonts/                 像素字体（OFL 1.1）
  js/
    main.js              首页：游戏卡片、存档中心
    registry.js          读取 autogame.json、game.json，加载存档适配器
    storage.js           按声明读写 localStorage / IndexedDB
    bundle.js            存档包格式
    presence.js          检测正在运行的游戏
    ui.js                对话框、提示条、下载、选文件
    starfield.js         背景星空
games/<id>/              每个游戏一个目录，自成一体
  game.json              游戏清单（游戏厅读它）
  CHANGELOG.md           游戏的更新日志
  save-adapter.js        存档适配器（可选，只给游戏厅用）
  …                      游戏自己的文件（入口 HTML、源码、构建产物……）
scripts/
  check.mjs              检查脚本（本地和 GitHub Actions 共用）
  serve.mjs              本地预览服务器
.githooks/               git 钩子：禁止直接提交到 main、检查分支名
.github/workflows/       GitHub Actions：每次推送 / PR 跑检查
CONTRIBUTING.md          更新规则
CLAUDE.md                给 AI 助手的规则摘要
CHANGELOG.md             游戏厅的更新日志
```

## autogame.json

```json
{
  "name": "AutoGame",
  "title": "AutoGame 像素游戏厅",
  "version": "1.1.0",
  "repository": "https://github.com/YichiCS/AutoGame",
  "games": ["research-simulator", "pixel-baseball"]
}
```

| 字段 | 说明 |
| --- | --- |
| `version` | 游戏厅框架的版本号，`hub-v<版本号>` 分支修改它 |
| `games` | 收录的游戏 id，顺序就是首页的展示顺序。不在这里的目录不会显示 |

## game.json

每个游戏目录下一个，描述游戏本身和它的存档位置。以像素甲子园为例：

```json
{
  "id": "pixel-baseball",
  "name": "像素甲子园",
  "subtitle": "监督之路",
  "version": "2.1.0",
  "legacyVersions": { "0.1.0": "1.0.0", "1.0.0": "2.0.0", "2.0.0": "2.1.0" },
  "description": "以日本高中棒球为题材的像素风挂机经营……",
  "tags": ["挂机", "经营模拟", "体育"],
  "entry": "dist/index.html",
  "cover": "docs/screenshot.png",
  "color": "#38b764",
  "source": "https://github.com/YichiCS/Pixel-Baseball",
  "build": { "command": "npm ci && npm run typecheck && npm run build", "outputs": ["dist/index.html"] },
  "saves": {
    "localStorage": ["pixel-baseball:*", "pixel-koshien:*"],
    "indexedDB": ["pixel-koshien"],
    "adapter": "save-adapter.js",
    "inGameExport": { "match": ["game", "mgr", "roster", "tours"], "hint": "游戏右上角「⚙ 设置 → 导入存档」" }
  },
  "dock": { "y": 0.42 }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✓ | 和目录名一致；小写字母、数字、连字符。用于分支名、存档包、悬浮标签，定下来就不再改 |
| `name` | ✓ | 显示名 |
| `subtitle` | | 副标题 / 英文名 |
| `version` | ✓ | `x.y.z`，每个 `<id>-v<版本号>` 分支都要升，规则见 [CONTRIBUTING.md](../CONTRIBUTING.md#版本号怎么升)；有 `package.json` 的要保持一致 |
| `legacyVersions` | | 旧版本号 → 新版本号的对照表，只有重新编号过的游戏才有。旧存档包里记的是旧版本号，游戏厅导入时先按这张表换算再和 `version` 比较。表里的旧版本号必须比 `version` 小（以后的版本号不会再和它们重复），新版本号不能比 `version` 大 |
| `description` | ✓ | 一两句话的简介，显示在游戏卡片上 |
| `tags` | | 标签 |
| `entry` | ✓ | 入口 HTML（相对游戏目录）。必须引入 `hub/dock.js` |
| `cover` | | 封面图（相对游戏目录），建议 16:10 的游戏截图 |
| `color` | | 主题色 `#rrggbb`，用在卡片和存档中心 |
| `source` | | 原始仓库地址 |
| `build` | | 需要构建的游戏：`command` 在游戏目录里运行，`outputs` 是构建产物（必须提交进仓库） |
| `saves` | ✓ | 存档声明，见下文 |
| `dock` | | 悬浮标签：`y` 默认高度（0 顶 ～ 1 底，默认 0.5）；`leaveConfirm` 离开游戏前的确认文字（不会随时自动保存的游戏才需要） |

## 存档

### 存在哪里

所有存档都在玩家的浏览器里。GitHub Pages 上同一个用户的所有项目同属一个域名（`yichics.github.io`），**localStorage 和 IndexedDB 是整个域名共用的**。因此：

- 每个游戏在 `game.json` 的 `saves` 里声明自己用到的存储：
  - `localStorage`：键名列表。`"abc"` 只匹配键 `abc`；`"abc:*"` 匹配所有以 `abc:` 开头的键。
  - `indexedDB`：数据库名列表（整个库都算这个游戏的）。
- 游戏厅只读写声明过的部分；检查脚本保证不同游戏的声明不重叠，且不使用游戏厅保留的 `autogame` 前缀。
- 新游戏请用 `<id>:` 作为 localStorage 前缀、`<id>` 作为数据库名。早于游戏厅的两个游戏沿用了原来的名字（`research-sim-*`、`pixel-koshien`），这样它们在原地址（`yichics.github.io/Research-Simulator/` 等）积累的存档，在游戏厅里打开时直接就在。像素甲子园 v2.0.0（原 v1.0.0）改版为挂机游戏后，新存档改用 `pixel-baseball:save`；旧版的 `pixel-koshien:*` 和 IndexedDB `pixel-koshien` 仍然声明，这样旧存档还能在存档中心里导出备份或清除。

游戏厅自己的数据：`autogame:hub`（上次全部导出的时间）、`autogame:dock`（悬浮标签在每个游戏里的位置）。

### 存档数据

游戏厅读出的一个游戏的数据（下面称 `data`）：

```js
{
  localStorage: { "<键>": "<字符串值>", … },
  indexedDB: [
    {
      name: "pixel-koshien", version: 1,
      stores: [
        { name: "saves", keyPath: null, autoIncrement: false, indexes: [],
          records: [ { key: "data:auto", value: "…" }, { key: "meta:auto", value: { … } } ] }
      ]
    }
  ]
}
```

IndexedDB 里的键和值要能用 JSON 表示（字符串、数字、布尔、null、数组、普通对象）。没有记录的库不会出现在 `data` 里。

### 存档包格式

导出的文件就是存档包。单个游戏和全部游戏是同一种格式，只是 `games` 里的游戏数量不同：

```json
{
  "format": "autogame-saves",
  "formatVersion": 1,
  "exportedAt": "2026-10-18T06:30:00.000Z",
  "hub": { "version": "1.1.0" },
  "games": {
    "research-simulator": { "name": "科研模拟器", "version": "1.3.2", "data": { "localStorage": { … }, "indexedDB": [] } },
    "pixel-baseball":     { "name": "像素甲子园", "version": "2.1.0", "data": { … } }
  }
}
```

文件名形如 `AutoGame存档_全部_2026-10-18_1430.json`、`AutoGame存档_科研模拟器_2026-10-18_1430.json`。

### 导出、导入、清除

- **导出**：读出声明的数据，打包下载。「导出全部存档」会记下时间，超过 7 天没备份时存档中心会提醒。
- **导入**：
  1. 解析文件。如果是某个游戏在游戏内导出的单局存档（按 `saves.inGameExport.match` 里的字段识别），提示玩家去游戏里按 `hint` 导入。
  2. 预览：列出文件里的游戏、存档内容、版本对比（存档包里的旧版本号先按 `legacyVersions` 换算）；存档来自更新的版本或更早的主版本时给出提醒；会覆盖现有存档的标出来。玩家勾选要导入的游戏。
  3. 检查这些游戏是否正开在别的标签页里（见下文），是的话要求先关掉。
  4. 可选：先下载一份本机现有存档的备份。
  5. 对每个游戏：**整体替换**——先清掉该游戏已声明的全部数据，再写入文件里的数据；不属于该游戏声明范围的键和库会被忽略。写入失败时恢复成导入前的数据。
- **清除**：清掉该游戏声明的全部 localStorage 键，清空声明的 IndexedDB 库里的所有表（不删库）。可选先下载备份。

### 存档适配器（可选）

`saves.adapter` 指向游戏目录里的一个 ES 模块，只有游戏厅会加载它，两个函数都可以不写：

```js
// 把 data 翻译成给人看的存档列表，显示在游戏卡片和存档中心。返回 null 表示看不懂。
// slots 为空数组表示「只有设置，没有存档」。
export function describe(data) {
  return { slots: [{ label: '自动存档', detail: '相模原实业高校 · 2026年4月 第1周', savedAt: 1760000000000 }] };
}

// 导入写入之前调整数据（拿到的是副本），返回要写入的 data。
// 例：科研模拟器把 savedAt 改成现在，避免读档时把「导出到导入之间的时间」当成离线时间快进。
export function beforeImport(data) {
  return data;
}
```

适配器解析的是游戏自己的存档格式，**游戏改了存档结构时要同步改适配器**。适配器出错不会影响导入导出，只是显示不出详情。

### 正在运行的游戏

游戏都会自动保存。如果游戏开在另一个标签页里，游戏厅刚导入的存档很快会被游戏内存里的旧进度覆盖。所以每个游戏页面里的 `dock.js` 会在 `BroadcastChannel('autogame')` 上应答游戏厅的询问：

- 游戏厅发 `{ type: 'ping', id }`
- 游戏页面回 `{ type: 'pong', id, game: '<游戏 id>' }`

导入、清除之前游戏厅会问一圈，发现对应游戏正在运行就要求先关闭。首页的游戏卡片上也会显示「运行中」。

## 悬浮标签 dock.js

每个游戏的入口页面引入（路径按入口文件位置，写到仓库根目录的 `hub/dock.js`）：

```html
<!-- games/research-simulator/index.html -->
<script src="../../hub/dock.js" data-game="research-simulator" defer></script>
<!-- games/pixel-baseball/dist/index.html -->
<script src="../../../hub/dock.js" data-game="pixel-baseball" defer></script>
```

- 在屏幕左边缘显示一个小标签，点开有「返回游戏厅」「存档管理」。标签可以上下拖动，位置按游戏分别记住；默认高度取 `game.json` 的 `dock.y`。
- `dock.leaveConfirm` 有内容时，离开游戏前会先确认。
- 样式在 Shadow DOM 里，不受游戏 CSS 影响；按键不会漏给游戏（比如空格不会让游戏暂停）。
- 直接双击打开的本地文件（`file://`）不显示标签。
- 应答「谁在运行」的询问（见上文）。

## 发布

- GitHub Pages：Settings → Pages → Build and deployment → **Deploy from a branch → `main` / `(root)`**。合并进 main 后一分钟左右上线。
- 根目录有 `.nojekyll`，文件按原样发布。
- Pages 不会运行构建，**需要构建的游戏必须把构建产物提交进仓库**（如 `games/pixel-baseball/dist/index.html`）。检查脚本的 `--build` 会重新构建并确认提交的产物是最新的。
- 所有路径都要用相对路径：站点在 `/AutoGame/` 子路径下。

## 检查与预览

```bash
node scripts/check.mjs                                     # 清单、文件、悬浮标签、存档声明
node scripts/check.mjs --branch <分支名> --base main        # 加上分支规则：命名、版本号、改动范围
node scripts/check.mjs --build                             # 运行各游戏的 build 命令，确认构建产物已提交
node scripts/serve.mjs                                     # 本地预览 http://localhost:8080/AutoGame/
```

GitHub Actions 的「检查」工作流在每次推送和 PR 时运行这些检查（PR 和分支推送会检查分支规则）。
