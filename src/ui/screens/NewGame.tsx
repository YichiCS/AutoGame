import { useState } from 'preact/hooks';
import type { Difficulty, School } from '../../core/types';
import { BACKGROUNDS, MGR_SKILL_NAME, repTier } from '../../core/career';
import { PREFS, REGIONS, gameSchoolCount } from '../../data/prefectures';
import { generateWorld, beginCareer, schoolBrief } from '../../core/newgame';
import { ui, refresh } from '../store';
import { Btn, Panel, Grade, Emblem } from '../components/common';
import { MGR_SKILLS } from '../../core/types';
import { FAMILY_NAMES, GIVEN_NAMES } from '../../data/names';
import { saveGame } from '../../core/save';
import { FACILITY_DEFS } from '../../core/training';
import { sfx } from '../sound';
import { showPendingNotices } from '../flow';

function randName(): string {
  const f = FAMILY_NAMES[Math.floor(Math.random() * FAMILY_NAMES.length)];
  const g = GIVEN_NAMES[Math.floor(Math.random() * GIVEN_NAMES.length)];
  return `${f} ${g}`;
}

export function NewGame() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(randName());
  const [age, setAge] = useState(34);
  const [bg, setBg] = useState('teacher');
  const [pref, setPref] = useState(12);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [dh, setDh] = useState(true);
  const [cands, setCands] = useState<School[]>([]);
  const [busy, setBusy] = useState(false);

  const gen = () => {
    setBusy(true);
    setTimeout(() => {
      const c = generateWorld({ mgrName: name.trim() || '无名监督', bg, age, prefId: pref, difficulty: diff, dh, seed: (Date.now() & 0x7fffffff) ^ 0x5bd1e995, year: 2026 });
      setCands(c);
      setBusy(false);
      setStep(3);
    }, 30);
  };

  const start = async (s: School) => {
    beginCareer(s.id);
    sfx('fanfare');
    ui.screen = 'game';
    ui.tab = 'home';
    refresh();
    try {
      await saveGame('auto');
    } catch {
      /* 存档失败不影响开始游戏 */
    }
    await showPendingNotices();
  };

  return (
    <div class="main" style={{ maxWidth: '1100px', margin: '0 auto', height: '100vh' }}>
      <div class="page-title">
        新的监督生涯
        <span class="sub">第 {step} / 3 步</span>
        <span class="grow" />
        <Btn
          onClick={() => {
            ui.screen = 'title';
            refresh();
          }}
        >
          返回标题
        </Btn>
      </div>
      {step === 1 && (
        <div class="col">
          <Panel title="监督资料">
            <div class="row wrap">
              <span>姓名</span>
              <input class="px" value={name} maxLength={10} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              <Btn small onClick={() => setName(randName())}>
                随机
              </Btn>
              <span style={{ marginLeft: '20px' }}>年龄 {age}</span>
              <input type="range" class="px" min={25} max={60} value={age} onInput={(e) => setAge(Number((e.target as HTMLInputElement).value))} />
            </div>
          </Panel>
          <Panel title="经历（决定初始能力与名声）">
            <div class="grid3">
              {BACKGROUNDS.map((b) => (
                <div
                  key={b.id}
                  class="panel flat"
                  style={{ cursor: 'pointer', boxShadow: bg === b.id ? 'inset 0 0 0 2px var(--accent)' : undefined }}
                  onClick={() => setBg(b.id)}
                >
                  <div class="accent">{bg === b.id ? '▶ ' : ''}{b.name}</div>
                  <div class="small muted" style={{ minHeight: '36px' }}>{b.desc}</div>
                  <div class="small">初始名声：{repTier(b.rep)}（{b.rep}） · 个人资产 {b.money} 万</div>
                  <div class="grid2 small mt8">
                    {MGR_SKILLS.map((k) => (
                      <div key={k} class="row between">
                        <span class="muted">{MGR_SKILL_NAME[k]}</span>
                        <Grade v={b.skills[k]} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <div class="row" style={{ justifyContent: 'flex-end' }}>
            <Btn kind="primary" big onClick={() => setStep(2)}>
              下一步 ▶
            </Btn>
          </div>
        </div>
      )}
      {step === 2 && (
        <div class="col">
          <Panel title="选择执教的都道府县">
            <div class="hint-box mb8">
              学校数量越多，夏季县大会需要连胜的场数越多（例如神奈川、大阪需要 6 胜，鸟取只需 4 胜）。东京与北海道分为两个夏季地区。
            </div>
            {REGIONS.map((r) => (
              <div key={r.id} class="row wrap mb8">
                <span class="accent" style={{ width: '56px' }}>{r.name}</span>
                {PREFS.filter((p) => p.region === r.id).map((p) => {
                  const n = gameSchoolCount(p);
                  const per = p.districts ? n / 2 : n;
                  const wins = Math.ceil(Math.log2(per));
                  return (
                    <Btn key={p.id} small on={pref === p.id} onClick={() => setPref(p.id)} title={`游戏内 ${n} 校，夏季约需 ${wins} 胜`}>
                      {p.name}
                      <span class="dim small">{wins}胜</span>
                    </Btn>
                  );
                })}
              </div>
            ))}
          </Panel>
          <Panel title="规则">
            <div class="row wrap">
              <span>难度</span>
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                <Btn key={d} small on={diff === d} onClick={() => setDiff(d)}>
                  {d === 'easy' ? '简单' : d === 'normal' ? '普通' : '困难'}
                </Btn>
              ))}
              <span style={{ marginLeft: '20px' }}>指定打击（DH）</span>
              <Btn small on={dh} onClick={() => setDh(true)}>
                采用
              </Btn>
              <Btn small on={!dh} onClick={() => setDh(false)}>
                不采用
              </Btn>
            </div>
            <div class="small muted mt8">简单：训练效率更高、对手稍弱、校方要求较低。困难：训练效率降低、外县强校更强。</div>
          </Panel>
          <div class="row between">
            <Btn onClick={() => setStep(1)}>◀ 上一步</Btn>
            <Btn kind="primary" big disabled={busy} onClick={gen}>
              {busy ? '生成世界中…' : `前往${PREFS[pref].name} ▶`}
            </Btn>
          </div>
        </div>
      )}
      {step === 3 && (
        <div class="col">
          <div class="hint-box">
            {PREFS[pref].name}的三所学校向你发出了监督邀请。以你目前的名声，名门强校还不会邀请你——先从这里证明自己吧！
          </div>
          <div class="grid3">
            {cands.map((s) => {
              const b = schoolBrief(s);
              return (
                <Panel key={s.id} title={s.type === 'public' ? '公立' : '私立'}>
                  <div class="row">
                    <Emblem school={s} lg />
                    <div>
                      <div class="big-text">{s.name}</div>
                      <div class="muted">名门度 {s.prestige.toFixed(0)} · 甲子园出场 {s.koshienApps} 次</div>
                    </div>
                  </div>
                  <div class="kv mt8">
                    <span class="k">县内战力</span>
                    <span>
                      第 {b.rank} / {b.total} 位（{b.strength.toFixed(0)}）
                    </span>
                    <span class="k">年度预算</span>
                    <span>约 {b.budget} 万円</span>
                    <span class="k">校方期待</span>
                    <span class="accent">{b.goal}</span>
                    <span class="k">设施水平</span>
                    <span>{s.facility.toFixed(0)}</span>
                    <span class="k">学业水平</span>
                    <span>{s.academic.toFixed(0)}</span>
                  </div>
                  <div class="small muted mt8">
                    {s.type === 'public' ? '公立学校预算有限，不能提供特待生名额，但校方比较宽容。' : '私立学校预算充足，可以提供特待生名额与宿舍，但对成绩要求更高。'}
                  </div>
                  <div class="mt12">
                    <Btn kind="primary" onClick={() => void start(s)}>
                      就任这所学校
                    </Btn>
                  </div>
                </Panel>
              );
            })}
          </div>
          <div class="row">
            <Btn onClick={() => setStep(2)}>◀ 重新选择地区</Btn>
            <span class="small dim">（设施说明：{Object.values(FACILITY_DEFS).map((f) => f.name).join('、')}）</span>
          </div>
        </div>
      )}
    </div>
  );
}
