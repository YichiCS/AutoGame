import { useEffect, useRef, useState } from 'preact/hooks';
import type { Difficulty, GameState, SchoolLite } from '../core/types';
import { BACKGROUNDS, randomMgrName, repTier } from '../core/career';
import { prepareWorld, schoolBrief, startGame } from '../core/newgame';
import { importFile, loadGame, peekSave, saveGame, hasLegacySave } from '../core/save';
import { dateStr } from '../core/calendar';
import { strengthLetter } from '../core/team';
import { PREFS, REGIONS, gameSchoolCount } from '../data/prefectures';
import { Btn, Emblem, Panel } from './components/common';
import { refresh, toast } from './store';
import { resumeGame } from './loop';
import { sfx } from './sound';

function winsNeeded(prefId: number): number {
  const p = PREFS[prefId];
  const n = p.districts ? gameSchoolCount(p) / 2 : gameSchoolCount(p);
  return Math.ceil(Math.log2(n));
}

/** 地区 → 县（东京算在关东里） */
const REGION_PREFS = REGIONS.filter((r) => r.id !== 'tokyo').map((r) => ({ r, prefs: PREFS.filter((p) => p.region === r.id || (r.id === 'kanto' && p.region === 'tokyo')) }));

export function StartScreen() {
  const save = peekSave();
  const [legacy, setLegacy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(randomMgrName());
  const [bg, setBg] = useState('teacher');
  const [pref, setPref] = useState(30);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [dh, setDh] = useState(true);
  const [world, setWorld] = useState<{ state: GameState; offers: SchoolLite[] } | null>(null);
  // 有存档时先只给「继续」，点了「开始新的生涯」才展开表单（一次只有一个主要按钮）
  const [fresh, setFresh] = useState(!save);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void hasLegacySave().then(setLegacy);
    // dock.js 是 defer 加载的，准备好以后显示「返回游戏厅」
    const on = () => refresh();
    window.addEventListener('autogame:ready', on);
    return () => window.removeEventListener('autogame:ready', on);
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [step, fresh]);

  const go = () => {
    const w = prepareWorld({ mgrName: name.trim() || '无名监督', bg, age: 35, prefId: pref, difficulty: diff, dh });
    setWorld(w);
    setStep(2);
  };
  const choose = (s: SchoolLite) => {
    if (!world) return;
    startGame(world.state, s.id);
    sfx('fanfare');
    saveGame();
    resumeGame();
  };
  const cont = () => {
    if (loadGame()) {
      sfx('click');
      resumeGame();
    } else toast('读档失败', 'bad');
  };
  const hub = window.AutoGame;

  return (
    <div class="start" ref={scrollRef}>
      <div class="start-inner">
        <div class={`logo ${step === 2 ? 'small' : ''}`}>
          <div class="t1">像素甲子园</div>
          <div class="t2">～ 监督之路 ～</div>
          <div class="t3">挂机经营 · 高中棒球</div>
        </div>

        {step === 1 && save && !fresh && (
          <>
            <Panel title="继续游戏">
              <div class="cont">
                <Emblem school={save.schools[save.schoolId]} lg />
                <div class="grow">
                  <b>{save.schools[save.schoolId]?.name}</b>
                  <div class="small dim">
                    {save.mgr.name} 监督（{repTier(save.mgr.rep)}）· {dateStr(save.day, save.startYear)} · 通算 {save.mgr.totals.w} 胜 {save.mgr.totals.l} 负
                  </div>
                </div>
              </div>
            </Panel>
            <div class="row center">
              <Btn kind="ghost" onClick={() => setFresh(true)}>
                开始新的生涯…（会覆盖现在的存档）
              </Btn>
            </div>
          </>
        )}

        {legacy && step === 1 && (
          <div class="notice">
            发现旧版（经营版）的存档。像素甲子园已经改版为挂机玩法，旧存档无法继续游玩；需要的话，可以在 AutoGame 游戏厅的「存档中心」导出备份或清除。
          </div>
        )}

        {step === 1 && fresh && (
          <Panel title={save ? '开始新的生涯（会覆盖现在的存档）' : '开始你的监督生涯'}>
            <div class="form">
              <div class="frow">
                <label for="mgr-name">监督名字</label>
                <div class="fval row gap4">
                  <input id="mgr-name" class="grow" value={name} maxLength={12} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
                  <Btn small onClick={() => setName(randomMgrName())}>
                    换一个
                  </Btn>
                </div>
              </div>
              <div class="frow">
                <label>经历</label>
                <div class="fval">
                  <div class="btnrow">
                    {BACKGROUNDS.map((b) => (
                      <Btn key={b.id} small on={bg === b.id} onClick={() => setBg(b.id)}>
                        {b.name}
                      </Btn>
                    ))}
                  </div>
                  <div class="small dim mt4">{BACKGROUNDS.find((b) => b.id === bg)?.desc}</div>
                </div>
              </div>
              <div class="frow">
                <label for="pref-sel">执教的县</label>
                <div class="fval">
                  {/* 电脑：按地区排开的按钮；手机：下拉选择 */}
                  <div class="pref-chips">
                    {REGION_PREFS.map(({ r, prefs }) => (
                      <div key={r.id} class="prefrow">
                        <span class="dim small">{r.name}</span>
                        {prefs.map((p) => (
                          <button type="button" key={p.id} class={`chip ${pref === p.id ? 'on' : ''}`} title={`游戏内 ${gameSchoolCount(p)} 校，夏季约需 ${winsNeeded(p.id)} 胜`} onClick={() => setPref(p.id)}>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <select id="pref-sel" class="pref-select" value={String(pref)} onChange={(e) => setPref(Number((e.target as HTMLSelectElement).value))}>
                    {REGION_PREFS.map(({ r, prefs }) => (
                      <optgroup key={r.id} label={r.name}>
                        {prefs.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.name}（{gameSchoolCount(p)} 校）
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div class="small dim mt4">
                    {PREFS[pref].name}：游戏内 {gameSchoolCount(PREFS[pref])} 校，夏季县大会约需 {winsNeeded(pref)} 胜。学校少的县更容易进甲子园。
                  </div>
                </div>
              </div>
              <div class="frow">
                <label>难度</label>
                <div class="fval btnrow">
                  {([['easy', '简单'], ['normal', '普通'], ['hard', '困难']] as [Difficulty, string][]).map(([d, n]) => (
                    <Btn key={d} small on={diff === d} onClick={() => setDiff(d)}>
                      {n}
                    </Btn>
                  ))}
                </div>
              </div>
              <div class="frow">
                <label>指定打击（DH）</label>
                <div class="fval btnrow">
                  <Btn small on={dh} onClick={() => setDh(true)}>
                    采用
                  </Btn>
                  <Btn small on={!dh} onClick={() => setDh(false)}>
                    不采用（投手也打击）
                  </Btn>
                </div>
              </div>
            </div>
          </Panel>
        )}

        {step === 2 && world && (
          <Panel title={`${PREFS[pref].name}的三所学校向你发出了邀请`}>
            <div class="small dim mb6">以你现在的名声，名门强校还不会请你——先从这里证明自己吧。</div>
            <div class="offers">
              {world.offers.map((s) => {
                const b = schoolBrief(s);
                return (
                  <div key={s.id} class="offer">
                    <div class="of-head">
                      <Emblem school={s} lg />
                      <div class="grow">
                        <b>{s.name}</b>
                        <div class="small dim">
                          {s.type === 'public' ? '公立' : '私立'} · 名门度 {Math.round(s.prestige)}
                        </div>
                      </div>
                    </div>
                    <div class="of-kv">
                      <span>
                        <i>县内战力</i>
                        <b>
                          第 {b.rank}/{b.total} 位（{strengthLetter(b.rating)}）
                        </b>
                      </span>
                      <span>
                        <i>年度拨款</i>
                        <b>约 {b.budget} 万円</b>
                      </span>
                      <span>
                        <i>甲子园</i>
                        <b>出场 {s.koshienApps} 次</b>
                      </span>
                    </div>
                    <div class="small dim">{s.type === 'public' ? '公立学校预算少，但校方比较宽容。' : '私立学校预算多，但对成绩要求更高。'}</div>
                    <Btn kind="primary" class="of-go" onClick={() => choose(s)}>
                      就任这所学校
                    </Btn>
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
        <div class="small dim center mt8">字体 Fusion Pixel Font（OFL-1.1）· 所有人名、校名、企业名皆为虚构</div>
      </div>

      {/* 固定在下面的操作栏：不用滚回去找按钮 */}
      <div class="start-bar">
        <div class="sb-in">
          {step === 1 ? (
            <>
              {save && fresh ? (
                <Btn kind="ghost" onClick={() => setFresh(false)}>
                  ◀ 返回
                </Btn>
              ) : (
                <Btn kind="ghost" onClick={() => fileRef.current?.click()}>
                  导入存档
                </Btn>
              )}
              {hub && (
                <Btn kind="ghost" onClick={() => (location.href = hub.hubUrl)}>
                  ◀ 游戏厅
                </Btn>
              )}
              <span class="grow" />
              {fresh ? (
                <Btn kind="primary" big onClick={go}>
                  前往{PREFS[pref].name} ▶
                </Btn>
              ) : (
                <Btn kind="primary" big onClick={cont}>
                  继续 ▶
                </Btn>
              )}
            </>
          ) : (
            <>
              <Btn onClick={() => setStep(1)}>◀ 返回</Btn>
              <span class="grow small dim right">选一所学校就任</span>
            </>
          )}
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
              resumeGame();
            } catch (err) {
              toast(`导入失败：${(err as Error).message}`, 'bad');
              refresh();
            }
          }}
        />
      </div>
    </div>
  );
}
