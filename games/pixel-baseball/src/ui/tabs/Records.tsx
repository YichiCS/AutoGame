import { MGR_SKILLS } from '../../core/types';
import { G } from '../../core/state';
import { ACHIEVEMENTS, BACKGROUNDS, MGR_SKILL_DESC, MGR_SKILL_NAME, mgrExpNeed, repTier } from '../../core/career';
import { PATH_NAME } from '../../core/draft';
import { TOUR_ORDER } from '../../core/season';
import { dateStr } from '../../core/calendar';
import { POS_ABBR } from '../../core/types';
import { portraitURL } from '../../render/portrait';
import { mySchool } from '../../core/state';
import { Bar, Empty, Num, Ovr, Panel, SubTabs } from '../components/common';
import { setSub, ui } from '../store';

type Sub = 'mgr' | 'years' | 'ob' | 'ach' | 'timeline';

const TOUR_SHORT: Record<string, string> = { springPref: '春县', springRegion: '春地区', summerPref: '夏县', koshien: '甲子园', fallPref: '秋县', fallRegion: '秋地区', jingu: '神宫', senbatsu: '选拔' };

export function Records() {
  const sub = (ui.sub.records as Sub) ?? 'mgr';
  const m = G.mgr;
  const t = m.totals;
  const bg = BACKGROUNDS.find((b) => b.id === m.bg);
  const need = mgrExpNeed(m.level);
  return (
    <div>
      <div class="stick">
        <SubTabs
          value={sub}
          onChange={(v) => setSub('records', v)}
          tabs={[
            { id: 'mgr', label: '监督' },
            { id: 'years', label: '历年' },
            { id: 'ob', label: `OB ${G.alumni.length}` },
            { id: 'ach', label: `成就 ${Object.keys(G.achievements).length}/${ACHIEVEMENTS.length}` },
            { id: 'timeline', label: '大事记' },
          ]}
        />
      </div>
      {sub === 'mgr' && (
        <div>
          <Panel title={m.name}>
            <div class="kv">
              <span>出身</span>
              <span>{bg?.name}</span>
              <span>名声</span>
              <span class="row gap6">
                <b class="gold">{repTier(m.rep)}</b> <Bar v={m.rep} w={90} color="var(--accent)" /> {Math.round(m.rep)}
              </span>
              <span>等级</span>
              <span class="row gap6">
                Lv {m.level} <Bar v={m.exp} max={need} w={90} color="var(--blue)" />
                <span class="dim">
                  经验 {Math.floor(m.exp)}/{need}
                </span>
              </span>
              <span>通算</span>
              <span>
                {t.w} 胜 {t.l} 负 · 县大会冠军 {t.prefTitles} 次
              </span>
              <span>甲子园</span>
              <span>
                出场 {t.koshienApps} 次 · {t.koshienWins} 胜 · 夏季优胜 {t.summerTitles} · 选拔优胜 {t.springTitles}
              </span>
              <span>培养</span>
              <span>职业选手 {G.alumni.filter((a) => a.path === 'pro').length} 人</span>
            </div>
          </Panel>
          <Panel title="监督能力">
            {MGR_SKILLS.map((k) => (
              <div key={k} class="arow skill" title={MGR_SKILL_DESC[k]}>
                <span class="an">{MGR_SKILL_NAME[k]}</span>
                <span class="av">
                  <Num v={m.skills[k]} />
                </span>
                <Bar v={m.skills[k]} />
                <span class="ax dim small ell">{MGR_SKILL_DESC[k]}</span>
              </div>
            ))}
            <div class="small dim mt4">执教经验攒满就会升级，可以选一项能力提升。</div>
          </Panel>
          {m.career.length > 0 && (
            <Panel title="执教履历">
              <div class="glist">
                {m.career.map((c, i) => (
                  <div key={i} class="lrow lr-career small">
                    <span class="ell">{c.school}</span>
                    <span class="dim ell">{c.summary}</span>
                  </div>
                ))}
                <div class="lrow lr-career small">
                  <span class="ell">{mySchool().name}</span>
                  <span class="dim">执教中</span>
                </div>
              </div>
            </Panel>
          )}
        </div>
      )}
      {sub === 'years' && (
        <div>
          {G.history.length ? (
            G.history
              .slice()
              .reverse()
              .map((h) => (
                <Panel key={h.year} title={`${h.year} 学年 · ${h.schoolName}`} right={<span>{h.w} 胜 {h.l} 负</span>}>
                  <div class="yres small">
                    {TOUR_ORDER.filter((k) => h.results[k]).map((k) => (
                      <span key={k} class={h.results[k] === '冠军' ? 'gold' : ''}>
                        <i>{TOUR_SHORT[k]}</i>
                        {h.results[k]}
                      </span>
                    ))}
                  </div>
                  <div class="small dim mt4">
                    目标「{h.goal}」{h.goalMet ? '达成' : '未达成'}
                    {h.best ? ` · ${h.best}` : ''}
                  </div>
                </Panel>
              ))
          ) : (
            <Empty>第一个学年结束后，这里会记下每年的成绩。</Empty>
          )}
        </div>
      )}
      {sub === 'ob' && (
        <div>
          {G.alumni.length ? (
            <div class="plist">
              {G.alumni
                .slice()
                .sort((a, b) => (b.path === 'pro' ? 1 : 0) - (a.path === 'pro' ? 1 : 0) || b.gradYear - a.gradYear)
                .map((a) => (
                  <div key={a.id} class="obr">
                    <img class="portrait sm" alt="" src={portraitURL({ face: a.face, colors: mySchool().colors, mood: 60, pitcher: a.pos === 'P' })} />
                    <span class="nm">
                      <b>{a.name}</b>
                    </span>
                    <span class="ps">{POS_ABBR[a.pos]}</span>
                    <span class="ov">
                      <Ovr v={a.ovr} />
                    </span>
                    <span class="pa">
                      <span class={`tag ${a.path === 'pro' ? 'gold' : ''}`}>{PATH_NAME[a.path]}</span>
                    </span>
                    <span class="sub dim small">
                      {G.startYear + a.gradYear} 届 · {a.schoolName} · {a.summary}
                      {a.path === 'pro' && ` · ${a.proTeam}${a.round ? ` ${a.round} 位` : ' 育成'} · ${a.proStatus ?? ''}`}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <Empty>还没有毕业生。</Empty>
          )}
        </div>
      )}
      {sub === 'ach' && (
        <div class="achs">
          {ACHIEVEMENTS.map((a) => {
            const d = G.achievements[a.id];
            return (
              <div key={a.id} class={`ach ${d !== undefined ? 'on' : ''}`} title={a.desc}>
                <span class="ai">{d !== undefined ? '★' : '☆'}</span>
                <b>{a.name}</b>
                <span class="ad dim">{d !== undefined ? dateStr(d, G.startYear) : ''}</span>
                <span class="ds">{a.desc}</span>
              </div>
            );
          })}
        </div>
      )}
      {sub === 'timeline' && (
        <div>
          {G.timeline.length ? (
            <div class="glist">
              {G.timeline
                .slice()
                .reverse()
                .map((x, i) => (
                  <div key={i} class="lrow lr-note small">
                    <span class="dim">{dateStr(x.d, G.startYear)}</span>
                    <span>{x.t}</span>
                  </div>
                ))}
            </div>
          ) : (
            <Empty>还没有大事。</Empty>
          )}
        </div>
      )}
    </div>
  );
}
