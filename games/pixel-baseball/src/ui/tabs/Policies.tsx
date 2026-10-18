import type { ComponentChildren } from 'preact';
import type { AIStyle, Policies as Pol, TrainFocus } from '../../core/types';
import { G } from '../../core/state';
import { FOCUS_DESC, FOCUS_NAME, INTENSITY } from '../../core/daily';
import { AUTO_CATS, AUTO_PRESETS, catAuto, autoResolve } from '../../core/queue';
import { Btn, Panel } from '../components/common';
import { refresh } from '../store';
import { settings, saveSettings } from '../settings';

function Choice<T extends string | number>(p: { label: string; value: T; options: [T, string, string?][]; onChange: (v: T) => void; desc?: ComponentChildren }) {
  return (
    <div class="pol">
      <div class="pol-l">{p.label}</div>
      <div class="pol-r">
        <div class="row wrap gap4">
          {p.options.map(([v, name, tip]) => (
            <Btn key={String(v)} small on={p.value === v} title={tip} onClick={() => p.onChange(v)}>
              {name}
            </Btn>
          ))}
        </div>
        {p.desc && <div class="small dim mt4">{p.desc}</div>}
      </div>
    </div>
  );
}

const set = <K extends keyof Pol>(k: K, v: Pol[K]) => {
  G.policies[k] = v;
  refresh();
};

export function Policies() {
  const pol = G.policies;
  const focusList = Object.keys(FOCUS_NAME) as TrainFocus[];
  return (
    <div>
      <Panel title="训练">
        <Choice label="训练方针" value={pol.focus} options={focusList.map((f) => [f, FOCUS_NAME[f], FOCUS_DESC[f]])} onChange={(v) => set('focus', v)} desc={FOCUS_DESC[pol.focus]} />
        <Choice
          label="训练强度"
          value={pol.intensity}
          options={INTENSITY.map((x, i) => [i, x.name] as [number, string])}
          onChange={(v) => set('intensity', v)}
          desc={['经验少，但轻松愉快，几乎不会受伤', '标准的训练量', '经验多，疲劳和受伤也多，有人会不满', '经验非常多，伤病风险高，家长可能投诉'][pol.intensity]}
        />
        <Choice label="疲劳过高时" value={pol.autoRest ? 1 : 0} options={[[1, '自动休养'], [0, '继续练']]} onChange={(v) => set('autoRest', v === 1)} desc="疲劳超过 75 的人自动休息一天（推荐）" />
        <Choice
          label="学业"
          value={pol.study}
          options={[['baseball', '棒球第一'], ['balanced', '文武兼顾'], ['academic', '重视学业']]}
          onChange={(v) => set('study', v)}
          desc="学力太低的人期末考试会挂科，补习两周不能比赛"
        />
      </Panel>
      <Panel title="比赛">
        <Choice
          label="比赛风格"
          value={pol.style}
          options={([['balanced', '稳健'], ['smallball', '小球（触击、推进）'], ['power', '强攻'], ['speed', '机动（盗垒）'], ['pitching', '投手战']] as [AIStyle, string][])}
          onChange={(v) => set('style', v)}
        />
        <Choice
          label="投手起用"
          value={pol.pitcherUse}
          options={[['ace', '王牌主义'], ['rotation', '轮换'], ['bullpen', '继投']]}
          onChange={(v) => set('pitcherUse', v)}
          desc={{ ace: '王牌尽量先发、投得更久：短期最强，但累积疲劳和受伤风险高', rotation: '按体力轮换先发：稳健', bullpen: '早早换投、多人分担：投手不容易累，但要有足够的投手' }[pol.pitcherUse]}
        />
        <Choice
          label="起用方针"
          value={pol.lineup}
          options={[['merit', '实力优先'], ['seniors', '重视高年级'], ['youth', '培养新人']]}
          onChange={(v) => set('lineup', v)}
          desc={{ merit: '谁强谁上', seniors: '三年级优先上场（他们会更有干劲）', youth: '练习赛多给低年级机会（比赛经验帮助成长）' }[pol.lineup]}
        />
        <Choice
          label="亲自指挥"
          value={settings.command}
          options={[['official', '正式比赛'], ['big', '重要比赛'], ['all', '全部比赛'], ['off', '都不指挥']]}
          onChange={(v) => {
            settings.command = v;
            saveSettings();
            refresh();
          }}
          desc="亲自指挥的比赛会打开比赛画面，以打席为单位下指令（打者视角 / 投手视角）。不指挥的比赛按阵容和方针直接出结果。重要比赛：甲子园、神宫、选拔，以及县大会的八强以后。"
        />
        <Choice
          label="打席自动化"
          value={settings.matchAuto}
          options={[['off', '全部亲自'], ['key', '关键时刻才问我'], ['bat', '只指挥进攻'], ['pitch', '只指挥防守'], ['all', '全交给教练']]}
          onChange={(v) => {
            settings.matchAuto = v;
            saveSettings();
            refresh();
          }}
          desc="亲自指挥时，哪些打席交给教练（教练按看得到的情报下指令）。比赛中也可以随时切换。"
        />
      </Panel>
      <Panel title="招生">
        <Choice
          label="招生方针"
          value={pol.recruit}
          options={[['balanced', '均衡'], ['ready', '重视即战力'], ['potential', '重视潜力']]}
          onChange={(v) => set('recruit', v)}
          desc={{ balanced: '一般的新生', ready: '入学时能力更强，但成长空间小一些', potential: '入学时能力弱一些，但潜力更高' }[pol.recruit]}
        />
      </Panel>
      <Panel title="托管">
        <div class="row wrap gap4">
          {AUTO_PRESETS.map((p) => (
            <Btn
              key={p.id}
              small
              on={pol.auto === p.id}
              onClick={() => {
                pol.auto = p.id;
                autoResolve();
                refresh();
              }}
            >
              {p.name}
            </Btn>
          ))}
          <Btn
            small
            on={pol.auto === 'custom'}
            onClick={() => {
              if (pol.auto !== 'custom') {
                const cats: Record<string, boolean> = {};
                for (const c of AUTO_CATS) cats[c.id] = catAuto(c.id);
                pol.autoCats = cats;
                pol.auto = 'custom';
              }
              refresh();
            }}
          >
            自定义
          </Btn>
        </div>
        <div class="small dim mt4">托管的事会按推荐选项自动处理，只记在动态里；其他的事出现时时间会暂停，等你决定。</div>
        <div class="autocats mt6">
          {AUTO_CATS.map((c) => {
            const on = catAuto(c.id);
            return (
              <button
                type="button"
                key={c.id}
                class={`autocat ${on ? 'on' : ''}`}
                title={c.desc}
                onClick={() => {
                  if (pol.auto !== 'custom') {
                    const cats: Record<string, boolean> = {};
                    for (const x of AUTO_CATS) cats[x.id] = catAuto(x.id);
                    pol.autoCats = cats;
                    pol.auto = 'custom';
                  }
                  pol.autoCats[c.id] = !on;
                  autoResolve();
                  refresh();
                }}
              >
                <span>{on ? '托管' : '问我'}</span>
                <b>{c.group} · {c.name}</b>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
