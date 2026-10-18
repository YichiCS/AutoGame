import type { School } from '../../core/types';
import { POS_ABBR } from '../../core/types';
import { G } from '../../core/state';
import { Btn, Emblem, Grade, Portrait } from './common';
import { openModal } from '../store';
import { rosterPlayers, schoolStrength } from '../../core/world';
import { strengthLetter } from '../../core/team';
import { PREFS } from '../../data/prefectures';
import { fullName, isPitcher, overall, PERS_NAME } from '../../core/attrs';
import { roleSkill } from '../../core/staff';
import { fac } from '../../core/training';
import { sortBy } from '../../core/util';
import { PITCH_DEFS } from '../../data/traits';

const STYLE_NAME: Record<School['style'], string> = { balanced: '均衡', smallball: '小球战术', power: '强攻', pitching: '投手中心', speed: '机动力' };

export function intelLevel(): number {
  return roleSkill('analyst') + fac('analysis') * 15 + G.manager.skills.insight / 3;
}

export function openSchool(id: number): void {
  const s = G.schools[id];
  if (!s) return;
  const st = schoolStrength(s);
  const me = s.id === G.club.schoolId;
  const intel = me ? 999 : intelLevel();
  const ps = s.roster ? sortBy(rosterPlayers(s).filter((p) => !p.retired), overall).slice(0, 18) : [];
  void openModal((close) => (
    <div class="panel modal wide">
      <div class="row">
        <Emblem school={s} lg />
        <div class="grow">
          <div class="mtitle" style={{ margin: 0 }}>{s.name}</div>
          <div class="muted">
            {PREFS[s.prefId].name} · {s.type === 'public' ? '公立' : '私立'} · 名门度 {s.prestige.toFixed(0)} · 风格：{STYLE_NAME[s.style]} · 监督 {me ? G.manager.name : s.mgrName}
          </div>
          <div class="small">
            甲子园出场 {s.koshienApps} 次 · {s.koshienWins} 胜 · 夏季冠军 {s.summerTitles} · 选拔冠军 {s.springTitles}
            {s.rivalry > 30 ? <span class="bad"> · 与本校关系紧张</span> : ''}
          </div>
        </div>
        <div class="center">
          <div class="big-text accent">{strengthLetter(st.total)}</div>
          <div class="small dim">{st.total.toFixed(0)}</div>
        </div>
      </div>
      <div class="row wrap mt8">
        <span>打击 <Grade v={st.off} /></span>
        <span>投手 <Grade v={st.pit} /></span>
        <span>守备 <Grade v={st.def} /></span>
      </div>
      {s.roster ? (
        intel >= 20 ? (
          <div class="table-wrap mt8" style={{ maxHeight: '380px' }}>
            <table class="px">
              <thead>
                <tr>
                  <th />
                  <th>姓名</th>
                  <th>年</th>
                  <th>位置</th>
                  <th>综合</th>
                  <th>{intel >= 40 ? '主要能力' : ''}</th>
                </tr>
              </thead>
              <tbody>
                {ps.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Portrait player={p} size="sm" school={s} />
                    </td>
                    <td>{fullName(p)}</td>
                    <td>{p.grade}</td>
                    <td>{POS_ABBR[p.pos]}</td>
                    <td>
                      <Grade v={overall(p)} />
                    </td>
                    <td class="small">
                      {intel >= 40
                        ? isPitcher(p)
                          ? `${Math.round(p.a.velocity)}km/h 控${Math.round(p.a.control)} 耐${Math.round(p.a.stamina)} ${p.pitches.map((x) => PITCH_DEFS[x.type].short + x.lv).join('')}`
                          : `击${Math.round(p.a.contact)} 力${Math.round(p.a.power)} 速${Math.round(p.a.speed)} 守${Math.round(p.a.fielding)} · ${PERS_NAME[p.pers]}`
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div class="hint-box mt8">情报不足，无法得知详细名单。聘请数据分析员、建设影像分析室或提升慧眼可以获得更多情报。</div>
        )
      ) : (
        <div class="hint-box mt8">这所学校离我们较远，目前只知道大致的实力。与他们交手（或进行练习赛）后可以获得名单情报。</div>
      )}
      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={() => close()}>关闭</Btn>
      </div>
    </div>
  ));
}
