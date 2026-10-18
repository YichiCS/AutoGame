import { G, mySchool } from '../../core/state';
import { Panel, Btn, Grade, Bar, Emblem, Empty, Tip } from '../components/common';
import { MGR_SKILL_NAME, MGR_SKILL_DESC, BACKGROUNDS, repTier, raiseSkill, skillCost, LADDER, ACHIEVEMENTS, offerWindow, mgrExpNeed } from '../../core/career';
import { MGR_SKILLS } from '../../core/types';
import { acceptOffer } from '../../core/game';
import { refresh, toast, openModal } from '../store';
import { money } from '../../core/util';
import { PREFS } from '../../data/prefectures';
import { schoolStrength } from '../../core/world';
import { strengthLetter } from '../../core/team';

export function ManagerScreen() {
  const m = G.manager;
  const me = mySchool();
  const bg = BACKGROUNDS.find((b) => b.id === m.bg);
  const need = mgrExpNeed(m.level);
  return (
    <div class="col">
      <div class="page-title">
        监督 {m.name}
        <span class="sub">
          {m.age} 岁 · {bg?.name} · Lv{m.level}
        </span>
      </div>
      <div class="grid3">
        <Panel title="名声与生涯">
          <div class="big-text accent">{repTier(m.reputation)}</div>
          <Bar v={m.reputation} tall color="var(--accent2)" />
          <div class="kv small mt8">
            <span class="k">经验</span>
            <span>
              <Bar v={m.exp} max={need} color="var(--blue)" /> {Math.floor(m.exp)}/{need}
            </span>
            <span class="k">个人资产</span>
            <span>{money(m.money)}</span>
            <span class="k">年薪</span>
            <span>{m.salary} 万円</span>
            <span class="k">合同剩余</span>
            <span>{m.contractYears} 年</span>
            <span class="k">执教年数</span>
            <span>{m.totals.seasons + 1} 年</span>
          </div>
        </Panel>
        <Panel title="通算成绩">
          <div class="kv small">
            <span class="k">公式战</span>
            <span>
              {m.totals.w} 胜 {m.totals.l} 败（{m.totals.w + m.totals.l ? ((m.totals.w / (m.totals.w + m.totals.l)) * 100).toFixed(1) : '0'}%）
            </span>
            <span class="k">本季</span>
            <span>
              {m.seasonW} 胜 {m.seasonL} 败
            </span>
            <span class="k">甲子园出场</span>
            <span>{m.totals.koshienApps} 次</span>
            <span class="k">甲子园胜利</span>
            <span>{m.totals.koshienWins} 胜</span>
            <span class="k">全国冠军</span>
            <span class="accent">
              夏 {m.totals.summerTitles} / 春 {m.totals.springTitles}
            </span>
            <span class="k">培养职业球员</span>
            <span>{m.totals.drafted} 人</span>
          </div>
        </Panel>
        <Panel title="校方评价">
          <div>
            目标：<span class="accent">{LADDER[G.club.goal]}</span>
          </div>
          <div class="kv small mt8">
            <span class="k">校方</span>
            <Bar v={G.club.board} color={G.club.board >= 50 ? 'var(--green)' : 'var(--red)'} />
            <span class="k">OB会</span>
            <Bar v={G.club.ob} color="var(--accent2)" />
            <span class="k">地方期待</span>
            <Bar v={G.club.supporters} color="var(--pink)" />
          </div>
          <div class="small dim mt8">夏季结束时，根据成绩与目标的差距评价。私立学校满意度过低时可能被解任；合同到期时，满意度 45 以上才会续约。</div>
        </Panel>
      </div>
      <Panel title={`监督能力（技能点 ${m.points}）`} right={<span class="small muted">比赛胜利、甲子园、培养职业球员都能获得经验</span>}>
        <div class="grid4">
          {MGR_SKILLS.map((k) => (
            <div key={k} class="panel flat">
              <div class="row between">
                <Tip tip={MGR_SKILL_DESC[k]}>
                  <span>{MGR_SKILL_NAME[k]}</span>
                </Tip>
                <Grade v={m.skills[k]} />
              </div>
              <Bar v={m.skills[k]} color="var(--blue)" />
              <div class="row between mt8">
                <span class="small dim">{MGR_SKILL_DESC[k]}</span>
                <Btn
                  small
                  disabled={m.points < skillCost(m.skills[k]) || m.skills[k] >= 99}
                  onClick={() => {
                    if (raiseSkill(k)) refresh();
                  }}
                >
                  +{skillCost(m.skills[k]) > 1 ? `(${skillCost(m.skills[k])})` : ''}
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={`跳槽邀请${m.offers.length ? `（${m.offers.length}）` : ''}`} right={<span class="small muted">{offerWindow() ? '现在是转任窗口期' : '转任窗口：8月下旬、11月~3月'}</span>}>
        {m.offers.length ? (
          m.offers.map((o) => {
            const s = G.schools[o.schoolId];
            return (
              <div key={o.id} class="row listitem">
                <Emblem school={s} lg />
                <div class="grow">
                  <div class="accent">
                    {s.name}（{PREFS[s.prefId].name}·{s.type === 'public' ? '公立' : '私立'}）
                  </div>
                  <div class="small muted">
                    名门度 {s.prestige.toFixed(0)} · 战力 {strengthLetter(schoolStrength(s).total)} · 甲子园 {s.koshienApps} 次 · 预算约 {o.budgetHint} 万/年
                  </div>
                  <div class="small">
                    年薪 {o.salary} 万（现 {m.salary}）· 合同 {o.years} 年 · 校方目标 {LADDER[o.goal]} {o.note}
                  </div>
                </div>
                <Btn
                  kind="primary"
                  disabled={!offerWindow()}
                  onClick={() =>
                    void openModal<boolean>((close) => (
                      <div class="panel modal">
                        <div class="mtitle">确认转任</div>
                        <div>
                          要离开{me.name}，就任{s.name}的监督吗？现在的球员、教练和设施都将留在原学校。
                        </div>
                        <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
                          <Btn onClick={() => close(false)}>再想想</Btn>
                          <Btn kind="primary" onClick={() => close(true)}>
                            就任
                          </Btn>
                        </div>
                      </div>
                    )).then((ok) => {
                      if (!ok) return;
                      const err = acceptOffer(o.id);
                      if (err) toast(err, 'bad');
                      refresh();
                    })
                  }
                >
                  接受
                </Btn>
                <Btn
                  small
                  onClick={() => {
                    m.offers = m.offers.filter((x) => x.id !== o.id);
                    refresh();
                  }}
                >
                  拒绝
                </Btn>
              </div>
            );
          })
        ) : (
          <Empty>暂无邀请。提升名声后，其他学校会主动联系你。</Empty>
        )}
      </Panel>
      <div class="grid2">
        <Panel title="执教履历">
          {m.history.length ? (
            <table class="px">
              <thead>
                <tr>
                  <th>年度</th>
                  <th>学校</th>
                  <th>战绩</th>
                  <th>成绩</th>
                </tr>
              </thead>
              <tbody>
                {m.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <tr key={i}>
                      <td>{h.year}</td>
                      <td>{h.schoolName}</td>
                      <td>
                        {h.w}-{h.l}
                      </td>
                      <td class="small">{h.summary}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <Empty>第一年的挑战刚刚开始</Empty>
          )}
        </Panel>
        <Panel title={`成就（${m.achievements.length}/${Object.keys(ACHIEVEMENTS).length}）`}>
          <div class="grid2">
            {Object.entries(ACHIEVEMENTS).map(([id, a]) => {
              const got = m.achievements.includes(id);
              return (
                <div key={id} class="row small" style={{ opacity: got ? 1 : 0.4 }}>
                  <span class={got ? 'accent' : 'dim'}>{got ? '🏆' : '🔒'}</span>
                  <Tip tip={a.desc}>
                    <span>{a.name}</span>
                  </Tip>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
