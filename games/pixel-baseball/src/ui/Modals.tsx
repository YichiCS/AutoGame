import { useRef } from 'preact/hooks';
import type { GameRecord } from '../core/types';
import { G } from '../core/state';
import { buildView, resolve } from '../core/queue';
import { fullName, isPitcher, overall } from '../core/attrs';
import { POS_NAME } from '../core/types';
import { ipStr } from '../core/attrs';
import { exportFile, importFile, clearSave } from '../core/save';
import { eventCount } from '../core/events';
import { PITCH_LIST } from '../data/pitches';
import { TRAITS } from '../data/traits';
import { Btn, Cond, Grade, Paras, Portrait } from './components/common';
import { openPlayer, refresh, toast, ui } from './store';
import { settings, saveSettings } from './settings';
import { setSoundEnabled, sfx } from './sound';
import { applyZoom } from './zoom';

function Shell(p: { title: string; tone?: string; children: preact.ComponentChildren; onClose?: () => void; wide?: boolean }) {
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && p.onClose?.()}>
      <div class={`modal ${p.wide ? 'wide' : ''} ${p.tone ? `tone-${p.tone}` : ''}`} role="dialog" aria-modal="true">
        <div class="mtitle">
          <span>{p.title}</span>
          {p.onClose && (
            <button type="button" class="x" onClick={p.onClose} aria-label="关闭">
              ×
            </button>
          )}
        </div>
        <div class="mbody">{p.children}</div>
      </div>
    </div>
  );
}

/** 决策队列的弹窗 */
export function EventModal() {
  const item = G.queue[0];
  if (!item) return null;
  const v = buildView(item);
  if (!v) {
    resolve(item, 0);
    return null;
  }
  if (ui.queueMin) {
    return (
      <div class="qbar">
        <span>⏸ 有 {G.queue.length} 件事等你决定：{v.title}</span>
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
  return (
    <Shell title={v.title} tone={v.tone}>
      <Paras text={v.text} />
      {pl && (
        <div class="pcard">
          <Portrait player={pl} />
          <div class="grow">
            <b>{fullName(pl)}</b>{' '}
            <span class="dim small">
              {pl.grade ? `${pl.grade}年` : '中学生'} · {POS_NAME[pl.pos]}
            </span>
            <div class="small">
              综合 <Grade v={overall(pl)} /> · 调子 <Cond v={pl.cond} /> · 干劲 {Math.round(pl.morale)} · 信赖 {Math.round(pl.trust)}
              {isPitcher(pl) ? ` · ${Math.round(pl.a.velocity)}km/h` : ''}
            </div>
          </div>
          {G.players[pl.id] && pl.grade > 0 && (
            <Btn small onClick={() => openPlayer(pl.id)}>
              详情
            </Btn>
          )}
        </div>
      )}
      <div class="choices">
        {v.choices.map((c, i) => (
          <button
            type="button"
            key={i}
            class={`choice ${c.def ? 'def' : ''}`}
            disabled={c.disabled}
            onClick={() => {
              sfx('click');
              resolve(item, i);
              ui.queueMin = false;
              refresh();
            }}
          >
            <b>{c.label}</b>
            {c.hint && <small>{c.hint}</small>}
            {c.def && <em>推荐</em>}
          </button>
        ))}
      </div>
      <div class="row mt6">
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

function Settings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const tog = (k: 'sound' | 'offline') => {
    settings[k] = !settings[k];
    if (k === 'sound') setSoundEnabled(settings.sound);
    saveSettings();
    refresh();
  };
  return (
    <div>
      <div class="pol">
        <div class="pol-l">音效</div>
        <div class="pol-r"><Btn small on={settings.sound} onClick={() => tog('sound')}>{settings.sound ? '开' : '关'}</Btn></div>
      </div>
      <div class="pol">
        <div class="pol-l">离线进度</div>
        <div class="pol-r">
          <Btn small on={settings.offline} onClick={() => tog('offline')}>{settings.offline ? '开' : '关'}</Btn>
          <div class="small dim mt4">关掉页面期间，球队按 1 倍速继续练习（最多 120 天，遇到要你决定的事会停下）。</div>
        </div>
      </div>
      <div class="pol">
        <div class="pol-l">界面缩放</div>
        <div class="pol-r row gap4">
          {[1, 1.25, 1.5, 2].map((z) => (
            <Btn key={z} small on={settings.zoom === z} onClick={() => { settings.zoom = z; saveSettings(); applyZoom(); refresh(); }}>
              {z * 100}%
            </Btn>
          ))}
        </div>
      </div>
      <div class="pol">
        <div class="pol-l">存档</div>
        <div class="pol-r">
          <div class="row wrap gap4">
            <Btn small onClick={() => exportFile()}>导出存档</Btn>
            <Btn small onClick={() => fileRef.current?.click()}>导入存档</Btn>
            <Btn small kind="red" onClick={() => { ui.modal = { kind: 'confirm', title: '删除存档', text: '确定删除现在的存档、重新开始吗？此操作无法撤销（建议先导出备份）。', ok: '删除并重新开始', onOk: () => { clearSave(); location.reload(); } }; refresh(); }}>
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
          <div class="small dim mt4">游戏每 15 秒自动保存在浏览器里。在 AutoGame 游戏厅的「存档中心」可以把所有游戏的存档一起导出 / 导入。</div>
        </div>
      </div>
    </div>
  );
}

function Help() {
  const ec = eventCount();
  return (
    <div class="help">
      <p><b>像素甲子园</b>是一个挂机经营游戏：时间会自己流逝，球队每天按你定的方针训练，比赛日自动排出阵容、自动比赛。你要做的是定方针、修设施，在关键时刻拿主意。</p>
      <p class="sect">时间</p>
      <p>1 倍速下游戏里的一天约 1.5 秒。空格暂停 / 继续，数字键 1～4 切换速度。需要你决定的事出现时会自动暂停。</p>
      <p class="sect">一年的流程</p>
      <p>4 月新生入部 → 春季县大会 → 7 月夏季县大会（冠军去 8 月的甲子园）→ 夏天结束三年级引退、新队伍成立、校方评价 → 秋季县大会、地区大会（成绩好的 1 月入选春季选拔，地区冠军去明治神宫大会）→ 10 月选秀会议 → 冬训（12～3 月不能打对外比赛）→ 3 月毕业、春季选拔。每周六有练习赛。</p>
      <p class="sect">球员</p>
      <p>每名球员有 15 项能力和各自的能力上限、潜力、早熟 / 晚成、性格、调子、疲劳、伤病，以及 {TRAITS.length} 种特殊能力。投手可以掌握最多 6 种变化球（共 {PITCH_LIST.length} 种，按变化方向排在变化球表里），变化球练到高等级后，有机会开发出独创的「魔球」。训练得到的经验会按每个人的「培养方针」自动加点。</p>
      <p class="sect">方针</p>
      <p>训练方针决定经验往哪里分，强度越高经验越多、也越累越容易受伤。比赛风格、投手起用和起用方针会影响比赛里的指挥。慧眼高或影像分析室等级高时，能看到能力上限和潜力。</p>
      <p class="sect">事件与托管</p>
      <p>一共有 {ec.random} 种随机事件和多种系统事件。在「方针 → 托管」里可以把某几类事交给托管（按推荐选项处理）。</p>
      <p class="sect">观战</p>
      <p>重要的比赛会在画面里一球一球地进行；在「方针」里可以改成全部观战或不观战，观战时随时可以跳过。</p>
    </div>
  );
}

function Confirm(p: { title: string; text: string; ok: string; onOk: () => void }) {
  return (
    <div>
      <Paras text={p.text} />
      <div class="row gap4 mt6" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={() => { ui.modal = null; refresh(); }}>取消</Btn>
        <Btn kind="red" onClick={() => { ui.modal = null; p.onOk(); refresh(); }}>{p.ok}</Btn>
      </div>
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
      <Shell title="设置" onClose={close}>
        <Settings />
      </Shell>
    );
  if (m.kind === 'help')
    return (
      <Shell title="怎么玩" onClose={close} wide>
        <Help />
      </Shell>
    );
  if (m.kind === 'confirm')
    return (
      <Shell title={m.title} onClose={close}>
        <Confirm {...m} />
      </Shell>
    );
  return null;
}
