import { Sheet as Shell } from './components/Sheet';
import { useEffect, useRef } from 'preact/hooks';
import type { GameRecord, QueueItem } from '../core/types';
import { POS_NAME } from '../core/types';
import { G } from '../core/state';
import { buildView, resolve } from '../core/queue';
import { fullName, overall } from '../core/attrs';
import { ipStr } from '../core/attrs';
import { exportFile, importFile, clearSave, saveGame } from '../core/save';
import { eventCount } from '../core/events';
import { previewChoice, type ChoicePreview } from '../core/preview';
import { PITCH_LIST } from '../data/pitches';
import { TRAITS } from '../data/traits';
import { Btn, Cond, Fatigue, Lv, Morale, Ovr, Paras, Portrait } from './components/common';
import { openPlayer, refresh, toast, ui } from './store';
import { settings, saveSettings } from './settings';
import { setSoundEnabled } from './sound';
import { applyZoom } from './zoom';

// ---------- 选项的潜在结果 ----------
/** 每件事的选项预览，按 qid 缓存（undefined = 还没算完）。一个 tick 算一个选项，不卡画面 */
const previews = new Map<number, (ChoicePreview | null | undefined)[]>();
let previewBusy = false;

function schedulePreview(item: QueueItem, n: number): void {
  let arr = previews.get(item.qid);
  if (!arr) {
    // 不在队列里的旧结果丢掉
    for (const k of previews.keys()) if (!G.queue.some((q) => q.qid === k)) previews.delete(k);
    arr = new Array<ChoicePreview | null | undefined>(n).fill(undefined);
    previews.set(item.qid, arr);
  }
  if (previewBusy) return;
  const next = arr.findIndex((x) => x === undefined);
  if (next < 0) return;
  previewBusy = true;
  setTimeout(() => {
    previewBusy = false;
    // 已经处理掉了（或者换了别的事）就不算了
    if (G.queue[0] !== item) return;
    let r: ChoicePreview | null = null;
    try {
      r = previewChoice(item, next);
    } catch (e) {
      console.error('preview', item.id, e);
    }
    arr![next] = r;
    refresh();
    schedulePreview(item, n);
  }, 0);
}

function Outcome(p: { pv: ChoicePreview | null | undefined; single: boolean }) {
  if (p.pv === undefined) return <span class="otags wait">正在推算可能的结果…</span>;
  if (!p.pv) return null;
  if (!p.pv.tags.length) return p.single ? null : <span class="otags"><i class="ot none">没有直接影响</i></span>;
  return (
    <span class="otags" title={p.pv.runs > 1 ? `模拟了 ${p.pv.runs} 次；写着「约 %」的不一定发生` : undefined}>
      {p.pv.tags.map((t, i) => (
        <i key={i} class={`ot ${t.tone}`}>
          {t.text}
        </i>
      ))}
    </span>
  );
}

/** 决策队列的弹窗 */
export function EventModal() {
  const item = G.queue[0];
  const v = item ? buildView(item) : null;
  const n = v?.choices.length ?? 0;
  useEffect(() => {
    if (item && v && !ui.queueMin) schedulePreview(item, n);
  });
  if (!item) return null;
  if (!v) {
    resolve(item, 0);
    return null;
  }
  if (ui.queueMin) {
    return (
      <div class="qbar">
        <span class="grow">⏸ 有 {G.queue.length} 件事等你决定：{v.title}</span>
        <Btn
          small
          kind="primary"
          onClick={() => {
            ui.queueMin = false;
            refresh();
          }}
        >
          处理
        </Btn>
      </div>
    );
  }
  const pl = v.pid !== undefined ? G.players[v.pid] : null;
  const pv = previews.get(item.qid);
  const foot = (
    <>
      <div class="choices">
        {v.choices.map((c, i) => (
          <button
            type="button"
            key={i}
            class="choice"
            disabled={c.disabled}
            onClick={() => {
              resolve(item, i);
              ui.queueMin = false;
              refresh();
            }}
          >
            <b>{c.label}</b>
            {c.hint && <small>{c.hint}</small>}
            {!c.disabled && <Outcome pv={pv?.[i]} single={n === 1} />}
          </button>
        ))}
      </div>
      <div class="mact-row">
        <span class="small dim grow">{G.queue.length > 1 ? `还有 ${G.queue.length - 1} 件事等你决定` : ''}</span>
        <Btn
          small
          kind="ghost"
          onClick={() => {
            ui.queueMin = true;
            refresh();
          }}
        >
          先收起来
        </Btn>
      </div>
    </>
  );
  return (
    <Shell title={v.title} tone={v.tone} foot={foot}>
      <Paras text={v.text} />
      {pl && (
        <div class="pcard">
          <Portrait player={pl} />
          <div class="pc-main">
            <div class="pc-name">
              <b>{fullName(pl)}</b>
              <span class="dim">
                {pl.grade ? `${pl.grade}年` : '中学生'} · {POS_NAME[pl.pos]}
              </span>
            </div>
            <div class="pc-stats">
              <Ovr v={overall(pl)} label />
              <span class="lv">
                <i>调子</i>
                <Cond v={pl.cond} />
              </span>
              <Fatigue v={pl.fatigue} />
              <Morale v={pl.morale} />
              <Lv label="信赖" v={pl.trust} />
            </div>
          </div>
          {G.players[pl.id] && pl.grade > 0 && (
            <Btn small onClick={() => openPlayer(pl.id)}>
              详情
            </Btn>
          )}
        </div>
      )}
    </Shell>
  );
}

function BoxScore(p: { g: GameRecord }) {
  const g = p.g;
  const n = Math.max(9, g.line[0].length, g.line[1].length);
  const cols = Array.from({ length: n }, (_, i) => i);
  const rowFor = (line: number[], name: string, r: number, h: number, e: number) => (
    <tr>
      <td class="tn">{name}</td>
      {cols.map((i) => (
        <td key={i}>{line[i] ?? (i < line.length ? 0 : 'x')}</td>
      ))}
      <td class="b">{r}</td>
      <td>{h}</td>
      <td>{e}</td>
    </tr>
  );
  const awayFirst = !g.home;
  const mine = rowFor(g.line[0], '本校', g.my, g.hits[0], g.errors[0]);
  const theirs = rowFor(g.line[1], g.oppName, g.opp, g.hits[1], g.errors[1]);
  return (
    <div>
      <div class="dim small mb6">
        {g.label} · {g.home ? '后攻' : '先攻'} · {g.win ? '胜' : '负'} {g.my}-{g.opp}
        {g.called ? '（提前结束）' : g.inn > 9 ? `（延长 ${g.inn} 局）` : ''}
        {g.mvp ? ` · MVP ${g.mvp}` : ''}
      </div>
      <div class="scroll-x">
        <table class="line">
          <thead>
            <tr>
              <th />
              {cols.map((i) => (
                <th key={i}>{i + 1}</th>
              ))}
              <th>R</th>
              <th>H</th>
              <th>E</th>
            </tr>
          </thead>
          <tbody>
            {awayFirst ? mine : theirs}
            {awayFirst ? theirs : mine}
          </tbody>
        </table>
      </div>
      <div class="sect">本校打击</div>
      <div class="scroll-x">
        <table class="stbl">
          <thead>
            <tr><th>球员</th><th>位</th><th>打数</th><th>安打</th><th>打点</th><th>本垒打</th><th>四坏</th><th>三振</th><th>各打席</th></tr>
          </thead>
          <tbody>
            {g.bat.map((b, i) => (
              <tr key={i}>
                <td>{b.name}</td><td>{b.pos}</td><td>{b.ab}</td><td>{b.h}</td><td>{b.rbi}</td><td>{b.hr}</td><td>{b.bb}</td><td>{b.so}</td>
                <td class="seq">{b.seq.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {[['本校投手', g.pit], [`${g.oppName} 投手`, g.oppPit]].map(([title, list]) => (
        <div key={title as string}>
          <div class="sect">{title as string}</div>
          <div class="scroll-x">
            <table class="stbl">
              <thead>
                <tr><th>投手</th><th>局数</th><th>球数</th><th>被安打</th><th>失分</th><th>三振</th><th>四坏</th><th /></tr>
              </thead>
              <tbody>
                {(list as GameRecord['pit']).map((x, i) => (
                  <tr key={i}>
                    <td>{x.name}</td><td>{ipStr(x.outs)}</td><td>{x.np}</td><td>{x.h}</td><td>{x.r}</td><td>{x.so}</td><td>{x.bb}</td>
                    <td class={x.dec === 'W' ? 'good' : x.dec === 'L' ? 'bad' : ''}>{x.dec === 'W' ? '胜' : x.dec === 'L' ? '负' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {g.highlights.length > 0 && (
        <>
          <div class="sect">精彩场面</div>
          <ul class="notes">
            {g.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 从 AutoGame 游戏厅打开时（hub/dock.js 提供地址）才有：离开前先存一次档 */
function leaveTo(url: string): void {
  saveGame();
  location.href = url;
}

function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  // dock.js 是 defer 加载的：设置打开得早的话，等它准备好再显示游戏厅的按钮
  useEffect(() => {
    const on = () => refresh();
    window.addEventListener('autogame:ready', on);
    return () => window.removeEventListener('autogame:ready', on);
  }, []);
  const hub = window.AutoGame;
  const tog = (k: 'sound' | 'offline') => {
    settings[k] = !settings[k];
    if (k === 'sound') setSoundEnabled(settings.sound);
    saveSettings();
    refresh();
  };
  return (
    <div class="settings">
      {hub && (
        <div class="pol">
          <div class="pol-l">游戏厅</div>
          <div class="pol-r">
            <div class="btnrow">
              <Btn onClick={() => leaveTo(hub.hubUrl)}>◀ 返回游戏厅</Btn>
              <Btn onClick={() => leaveTo(hub.savesUrl)}>存档管理</Btn>
            </div>
            <div class="small dim mt4">离开前会自动保存。存档管理里可以把所有游戏的存档一起导出 / 导入。</div>
          </div>
        </div>
      )}
      <div class="pol">
        <div class="pol-l">音效</div>
        <div class="pol-r">
          <div class="btnrow">
            <Btn small on={settings.sound} onClick={() => !settings.sound && tog('sound')}>开</Btn>
            <Btn small on={!settings.sound} onClick={() => settings.sound && tog('sound')}>关</Btn>
          </div>
        </div>
      </div>
      <div class="pol">
        <div class="pol-l">离线进度</div>
        <div class="pol-r">
          <div class="btnrow">
            <Btn small on={settings.offline} onClick={() => !settings.offline && tog('offline')}>开</Btn>
            <Btn small on={!settings.offline} onClick={() => settings.offline && tog('offline')}>关</Btn>
          </div>
          <div class="small dim mt4">关掉页面期间，球队按 1 倍速继续练习（最多 120 天，遇到要你决定的事会停下）。</div>
        </div>
      </div>
      <div class="pol">
        <div class="pol-l">界面缩放</div>
        <div class="pol-r">
          <div class="btnrow">
            {[1, 1.25, 1.5, 2].map((z) => (
              <Btn key={z} small on={settings.zoom === z} onClick={() => { settings.zoom = z; saveSettings(); applyZoom(); refresh(); }}>
                {z * 100}%
              </Btn>
            ))}
          </div>
        </div>
      </div>
      <div class="pol">
        <div class="pol-l">存档</div>
        <div class="pol-r">
          <div class="btnrow">
            <Btn small onClick={() => exportFile()}>导出存档</Btn>
            <Btn small onClick={() => fileRef.current?.click()}>导入存档</Btn>
          </div>
          <div class="btnrow mt4">
            <Btn small kind="red" onClick={() => { ui.modal = { kind: 'confirm', title: '删除存档', text: '确定删除现在的存档、重新开始吗？此操作无法撤销。', ok: '删除并重新开始', onOk: () => { clearSave(); location.reload(); } }; refresh(); }}>
              删除存档，重新开始
            </Btn>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              (e.target as HTMLInputElement).value = '';
              if (!f) return;
              try {
                await importFile(f);
                toast('存档导入成功', 'good');
                ui.modal = null;
                refresh();
              } catch (err) {
                toast(`导入失败：${(err as Error).message}`, 'bad');
              }
            }}
          />
          <div class="small dim mt4">游戏每 15 秒自动保存在浏览器里。</div>
        </div>
      </div>
    </div>
  );
}

function Help() {
  const ec = eventCount();
  return (
    <div class="help">
      <p><b>像素甲子园</b>：平时时间自己流逝，球队按你定的方针训练、成长；比赛日由你亲自指挥——以打席为单位下指令，进攻时从打者身后看，防守时从投手身后看，结果由球员的能力和一点运气决定。</p>
      <p class="sect">时间</p>
      <p>1 倍速下游戏里的一天约 1.5 秒。空格暂停 / 继续，数字键 1～4 切换速度（手机上点顶栏的速度按钮换档）。需要你决定的事出现时会自动暂停。</p>
      <p class="sect">一年的流程</p>
      <p>4 月新生入部 → 春季县大会 → 7 月夏季县大会（冠军去 8 月的甲子园）→ 夏天结束三年级引退、新队伍成立、校方评价 → 秋季县大会、地区大会（成绩好的 1 月入选春季选拔，地区冠军去明治神宫大会）→ 10 月选秀会议 → 冬训（12～3 月不能打对外比赛）→ 3 月毕业、春季选拔。每周六有练习赛。</p>
      <p class="sect">球员</p>
      <p>每名球员有 15 项能力和各自的能力上限、潜力、早熟 / 晚成、性格、调子、疲劳、伤病，以及 {TRAITS.length} 种特殊能力。谁都可以守任何位置、也可以投球：「总评」是他在最适合的位置上的评价，球员详情里能看到他在每个位置上的总评。投手可以掌握最多 6 种变化球（共 {PITCH_LIST.length} 种，按变化方向排在变化球表里），变化球练到高等级后，有机会开发出独创的「魔球」。训练得到的经验会按每个人的「培养方针」自动加点。</p>
      <p class="sect">方针</p>
      <p>训练方针决定经验往哪里分，强度越高经验越多、也越累越容易受伤。比赛风格、投手起用和起用方针会影响比赛里的指挥。慧眼高或影像分析室等级高时，能看到能力上限和潜力。</p>
      <p class="sect">事件与托管</p>
      <p>一共有 {ec.random} 种随机事件和多种系统事件。每个选项下面标着可能的结果（把这个选项模拟若干次推算出来的；写着「约 %」的不一定发生）。在「方针 → 托管」里可以把某几类事交给托管，由教练替你决定，结果记在动态里。</p>
      <p class="sect">比赛：以打席为单位指挥</p>
      <p>进攻时选打法（强振、轻打、选球、触击……）、狙球种（直球 / 变化球）、狙路线（内角、外角、高、低），有跑者时还能指挥跑垒的积极程度、盗垒、打带跑、双盗；防守时定配球比重、决胜球、攻击区域、投球方针、守备阵型，以及注意跑者、外角吊球、牵制。随时可以代打、代跑、换投、守备替换。</p>
      <p>对手会参考之前的打席调整策略：上个打席被你打中了直球，这次可能多投变化球；被你的滑球三振了，下次可能就在等它。慧眼越高、影像分析室越好，越容易看穿对方这个打席的打算。</p>
      <p>不想每个打席都指挥？「打席自动化」可以只在关键时刻问你、只指挥进攻或防守，或者整局、整场交给教练。在「方针」里可以设定哪些比赛要亲自指挥。</p>
      <p class="sect">阵容</p>
      <p>在「阵容」页可以自己排打线、守位和先发顺位：任何人都可以排在任何守位、也都可以先发投球，候选名单里会列出每个人在那个位置上的总评。受伤、停赛的人到比赛那天会自动由板凳上最合适的人代替。练习赛默认按起用方针自动排（给替补和新人机会），也可以设成一样用这套阵容。</p>
    </div>
  );
}

export function UIModal() {
  const m = ui.modal;
  if (!m) return null;
  const close = () => {
    ui.modal = null;
    refresh();
  };
  if (m.kind === 'box') {
    const g = G.games.find((x) => x.id === m.gameId);
    if (!g) return null;
    return (
      <Shell title="比赛成绩" onClose={close} wide>
        <BoxScore g={g} />
      </Shell>
    );
  }
  if (m.kind === 'settings')
    return (
      <Shell title="设置" onClose={close} foot={<div class="mact-row end"><Btn onClick={close}>关闭</Btn></div>}>
        <Settings />
      </Shell>
    );
  if (m.kind === 'help')
    return (
      <Shell title="怎么玩" onClose={close} wide foot={<div class="mact-row end"><Btn onClick={close}>知道了</Btn></div>}>
        <Help />
      </Shell>
    );
  if (m.kind === 'confirm')
    return (
      <Shell
        title={m.title}
        onClose={close}
        foot={
          <div class="mact-row end">
            <Btn onClick={close}>取消</Btn>
            <Btn kind="red" onClick={() => { ui.modal = null; m.onOk(); refresh(); }}>{m.ok}</Btn>
          </div>
        }
      >
        <Paras text={m.text} />
      </Shell>
    );
  return null;
}
