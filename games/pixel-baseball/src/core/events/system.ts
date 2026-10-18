// 系统事件：由模拟逻辑在特定时刻排进队列
import type { MgrSkill, PitchType, Player } from '../types';
import { MGR_SKILLS } from '../types';
import { G, addRep, log, milestone, mySchool, note } from '../state';
import { chance, pick, randInt } from '../rng';
import { clamp } from '../util';
import { fullName, has, isPitcher, overall, PERS_NAME } from '../attrs';
import { addExp } from '../growth';
import { earn, spend, moneyStr } from '../economy';
import { injure } from '../daily';
import { BACKGROUNDS, MGR_SKILL_DESC, MGR_SKILL_NAME, moveTo, raiseSkill, repTier, suggestSkill, type Offer } from '../career';
import { PITCH_DEFS } from '../../data/pitches';
import { TRAIT_BY_ID } from '../../data/traits';
import { def, OK } from './registry';
import { N, P, active, allMor, chem, mor, board, ob, lines, alive } from './util';
import { commit, prospectBrief } from '../recruit';
import { PREFS } from '../../data/prefectures';

def('welcome', {
  cat: 'notice',
  never: true,
  build: () => {
    const s = mySchool();
    const bg = BACKGROUNDS.find((b) => b.id === G.mgr.bg)!;
    return {
      title: `欢迎来到${s.name}！`,
      tone: 'gold',
      text: lines(
        `你以「${bg.name}」的身份，成为了${PREFS[G.prefId].name}${s.type === 'public' ? '公立' : '私立'}高中${s.name}棒球部的监督。`,
        '',
        '球队会自己运转：每天按你定下的方针训练，比赛日自动排出阵容、自动比赛。你的工作是定方针、修设施、在关键时刻拿主意——需要你决定的事出现时，时间会自动暂停。',
        '',
        '右边的「方针」页可以调整训练和比赛的方针，也可以把小事交给托管；「设施」页用部费升级设施；「球员」页可以看每个人的详细能力和变化球。',
        '',
        `校方今年的期待：${G.club.goal?.text ?? '好好干'}。目标是——甲子园！`,
      ),
      choices: [{ label: '开始执教！', def: true }],
    };
  },
});

def('newClass', {
  cat: 'notice',
  build: (c) => {
    const ps = (c.ids as number[]).map((id) => G.players[id]).filter(Boolean);
    const top = ps.slice().sort((a, b) => overall(b) + b.pot * 0.2 - (overall(a) + a.pot * 0.2)).slice(0, 4);
    const special = ps.filter((p) => p.joined === 'scholar' || p.joined === 'gem' || p.traits.includes('monster'));
    return {
      title: '新生入部',
      pid: top[0]?.id,
      text: lines(
        `今年有 ${ps.length} 名新生加入了棒球部（投手 ${ps.filter(isPitcher).length} 人）。`,
        '',
        '值得关注的新人：',
        ...top.map((p) => `· ${fullName(p)}：${prospectBrief(p)}`),
        special.length ? '' : false,
        special.length ? `特待生 / 推荐入部：${special.map(fullName).join('、')}` : false,
      ),
      choices: [OK('欢迎加入！')],
    };
  },
});

function captainScore(p: Player): number {
  return (has(p, 'captain') ? 25 : 0) + (p.pers === 'leader' ? 18 : 0) + p.trust * 0.2 + p.a.mental * 0.3 + overall(p) * 0.3 + (p.pers === 'shy' ? -10 : 0);
}

def('captain', {
  cat: 'team',
  build: (c) => {
    const ps = (c.cands as number[]).map((id) => G.players[id]).filter(Boolean);
    const best = ps.slice().sort((a, b) => captainScore(b) - captainScore(a))[0];
    return {
      title: '新队伍：任命主将',
      pid: best?.id,
      text: lines('三年级生引退了。以二年级为中心的新队伍就此起步。', '谁来担任主将？主将的性格和威信会影响全队的默契与干劲。'),
      choices: [
        ...ps.map((p) => ({
          label: `${fullName(p)}（${PERS_NAME[p.pers]}）`,
          hint: [has(p, 'captain') ? '领袖气质' : '', `信赖 ${Math.round(p.trust)}`, `精神 ${Math.round(p.a.mental)}`].filter(Boolean).join(' · '),
          def: p === best,
          apply: () => {
            G.club.captainId = p.id;
            mor(p, 8);
            chem(has(p, 'captain') || p.pers === 'leader' ? 6 : 2);
            note(p, '就任主将');
            return `${p.fam}成为了新的主将。`;
          },
        })),
      ],
    };
  },
});

def('summerOver', {
  cat: 'notice',
  build: (c) => {
    const third = active().filter((p) => p.grade === 3);
    const koshien = !!c.koshien;
    return {
      title: koshien ? '甲子园之土' : '最后的夏天',
      tone: 'info',
      text: koshien
        ? lines(`甲子园的比赛结束了（${c.finish}）。`, '三年级生们跪在黑土上，含着泪把泥土装进袋子里。"明年，一定要再回到这里……"', '', '三年级生就此引退，新队伍出发。')
        : lines(`夏天结束了（${c.finish}）。`, '三年级生们在球场边哭成一片。他们的高中棒球，到这里画上了句号。', '', '三年级生就此引退，新队伍出发。'),
      choices: [{ label: '把这份心情传承下去', def: true, apply: () => void third }],
    };
  },
});

def('koshienQualified', {
  cat: 'notice',
  build: (c) => ({
    title: '甲子园出场决定！',
    tone: 'gold',
    text: lines(`${mySchool().name}夺得${PREFS[G.prefId].name}代表权，要去甲子园了！`, '', `学校挂起了巨大的横幅，OB 会和地方后援会发起了募款：共募得 ${moneyStr(c.fund as number)}。`, '全校都在准备应援：吹奏乐部、应援团、啦啦队……'),
    choices: [OK('目标是全国制霸！')],
  }),
});

def('tourWon', {
  cat: 'notice',
  build: (c) => {
    const big = c.kind === 'koshien' || c.kind === 'senbatsu';
    return {
      title: `${c.name}优胜！`,
      tone: 'gold',
      text: big
        ? lines(`${mySchool().name}站上了全国的顶点！`, c.kind === 'koshien' ? '深红色的大旗交到了主将手里。' : '紫色的大旗交到了主将手里。', '', '你的名字将和这支球队一起被永远记住。')
        : lines(`${mySchool().name}夺得了${c.name}的冠军！`, '部员们把你抛向了空中。'),
      choices: [OK(big ? '这是大家的胜利' : '继续向上！')],
    };
  },
});

def('senbatsuResult', {
  cat: 'notice',
  build: (c) => ({
    title: c.selected ? '春季选拔出场决定！' : '春季选拔落选',
    tone: c.selected ? 'gold' : 'info',
    text: c.selected
      ? lines(`选拔委员会公布了出场学校——${mySchool().name}入选了（${c.reason}）！`, '3 月下旬，将在甲子园参加春季选拔大会。')
      : lines('选拔出场学校公布了，名单上没有我们。', c.reason ? `（${c.reason}）` : '', '把不甘心化作冬训的动力，目标夏天！'),
    choices: [OK(c.selected ? '去甲子园！' : '夏天再来')],
  }),
});

def('draftResult', {
  cat: 'notice',
  build: (c) => {
    const picks = c.picks as string[];
    const passed = c.passed as string[];
    return {
      title: '职业棒球选秀会议',
      tone: picks.length ? 'gold' : 'info',
      text: picks.length
        ? lines('指名结果出来了！', ...picks.map((x) => `· ${x}`), passed.length ? '' : false, passed.length ? `遗憾没有被指名：${passed.join('、')}（会去大学或社会人继续打球）` : false)
        : lines(passed.length ? `${passed.join('、')} 提交了职业志愿书，但这次没有被指名。` : '今年本校没有人参加选秀。', '他们会在大学或社会人球队继续追梦。'),
      choices: [OK()],
    };
  },
});

def('graduation', {
  cat: 'notice',
  build: (c) => ({
    title: '毕业典礼',
    text: lines('三年级生们毕业了。他们的去向：', ...(c.lines as string[]).map((x) => `· ${x}`)),
    choices: [OK('一路顺风')],
  }),
});

def('evaluation', {
  cat: 'notice',
  build: (c) => ({
    title: '校方的评价',
    tone: c.met ? 'good' : 'bad',
    text: lines(
      `今年的目标：${c.goal}`,
      c.met ? '目标达成了。校长在全校集会上表扬了棒球部。' : '目标没能达成。校长把你叫到办公室，语气很严肃。',
      '',
      `校方满意度：${Math.round(c.board as number)}`,
      !c.met && (c.board as number) < 35 ? '再这样下去，监督的位子恐怕不保……' : false,
    ),
    choices: [OK(c.met ? '谢谢' : '明年一定')],
  }),
});

function offersFrom(c: { offers?: unknown }): Offer[] {
  return ((c.offers as string[]) ?? []).map((s) => JSON.parse(s) as Offer);
}

def('dismissal', {
  cat: 'career',
  never: true,
  build: (c) => {
    const offers = offersFrom(c);
    return {
      title: '解任',
      tone: 'bad',
      text: lines('连续未能达成校方的目标，理事会决定解除你的监督职务。', '', '收拾行李的时候，有几所学校联系了你——', ...offers.map((o) => `· ${o.school.name}（${PREFS[o.prefId].name}，名门度 ${Math.round(o.school.prestige)}）：${o.note}`)),
      choices: offers.map((o, i) => ({
        label: `去${o.school.name}`,
        hint: `${PREFS[o.prefId].name} · ${o.school.type === 'public' ? '公立' : '私立'}`,
        def: i === 0,
        apply: () => {
          moveTo(o);
          return `你成为了${o.school.name}的监督。`;
        },
      })),
    };
  },
});

def('offers', {
  cat: 'career',
  build: (c) => {
    const offers = offersFrom(c);
    return {
      title: '其他学校的邀请',
      text: lines(
        `你的名声（${repTier(G.mgr.rep)}）传开了。有学校希望你去当监督：`,
        ...offers.map((o) => `· ${o.school.name}（${PREFS[o.prefId].name}，${o.school.type === 'public' ? '公立' : '私立'}，名门度 ${Math.round(o.school.prestige)}）：${o.note}`),
        '',
        '跳槽的话，现在的球员会留在原来的学校；名声、经验和成就会跟着你走。',
      ),
      choices: [
        { label: `留在${mySchool().name}`, def: true, apply: () => { board(4); ob(4); return '你婉拒了邀请。消息传开后，部员们都很高兴。'; } },
        ...offers.map((o) => ({ label: `接受${o.school.name}的邀请`, hint: `名门度 ${Math.round(o.school.prestige)}`, apply: () => { moveTo(o); return `你成为了${o.school.name}的监督。`; } })),
      ],
    };
  },
});

def('mgrLevel', {
  cat: 'career',
  build: (c) => {
    const sug = suggestSkill();
    const order = [sug, ...MGR_SKILLS.filter((k) => k !== sug)];
    return {
      title: `监督升级（Lv ${c.level}）`,
      text: lines('执教经验积累起来了。这次重点提升哪一项能力？（+3）'),
      choices: order.map((k: MgrSkill) => ({
        label: `${MGR_SKILL_NAME[k]}（${Math.round(G.mgr.skills[k])}）`,
        hint: MGR_SKILL_DESC[k],
        def: k === sug,
        disabled: G.mgr.skills[k] >= 99,
        apply: () => {
          raiseSkill(k, 3);
          return `${MGR_SKILL_NAME[k]}提升到 ${Math.round(G.mgr.skills[k])}`;
        },
      })),
    };
  },
});

def('learnPitch', {
  cat: 'training',
  build: (c) => {
    const p = P(c);
    const opts = (c.opts as string[]) as PitchType[];
    return {
      title: '想学新的变化球',
      pid: p?.id,
      text: lines(`投手 ${N(c)} 来找你商量："我想再学一种变化球！"`, `现在会的：${p ? p.pitches.map((x) => `${x.sig ?? PITCH_DEFS[x.type].name}（${x.lv}）`).join('、') || '只有直球' : ''}`, '学会需要一段时间，期间变化经验会投到新球种上。'),
      choices: [
        ...opts.map((t, i) => ({
          label: `学${PITCH_DEFS[t].name}`,
          hint: `${PITCH_DEFS[t].desc}`,
          def: i === 0,
          apply: () => {
            if (!alive(c)) return '';
            P(c).learning = { pitch: t, progress: 0 };
            note(P(c), `开始练习${PITCH_DEFS[t].name}`);
            return `${P(c).fam}开始练习${PITCH_DEFS[t].name}。`;
          },
        })),
        { label: '先把现有的球种练精', apply: () => { if (!alive(c)) return ''; const q = P(c); const ps = q.pitches[0]; if (ps) ps.lv = Math.min(7, ps.lv + (chance(0.5) ? 1 : 0)); addExp(q, { brk: 15 }); return `${q.fam}专心打磨现有的球种。`; } },
      ],
    };
  },
});

def('sigPitch', {
  cat: 'training',
  build: (c) => {
    const p = P(c);
    const idx = c.idx as number;
    const ps = p?.pitches[idx];
    const names = c.names as string[];
    return {
      title: '魔球诞生！？',
      tone: 'gold',
      pid: p?.id,
      text: lines(`${N(c)} 反复钻研${ps ? PITCH_DEFS[ps.type].name : '变化球'}的握法，终于投出了一种谁都没见过的球！`, '捕手说："这球……根本接不住啊！"', '', '给这颗魔球取个名字吧：'),
      choices: names.map((nm, i) => ({
        label: `「${nm}」`,
        def: i === 0,
        apply: () => {
          if (!alive(c) || !P(c).pitches[idx]) return '';
          const q = P(c);
          const pk = q.pitches[idx];
          pk.sig = nm;
          pk.lv = Math.min(7, pk.lv + 1);
          note(q, `开发出魔球「${nm}」`);
          milestone(`${fullName(q)} 开发出魔球「${nm}」`);
          q.pop = clamp(q.pop + 15, 0, 100);
          return `魔球「${nm}」诞生了！`;
        },
      })),
    };
  },
});

def('deficit', {
  cat: 'money',
  build: () => ({
    title: '部费赤字',
    tone: 'bad',
    text: lines(`部费账户出现了赤字（${moneyStr(G.funds)}）。会计老师很为难。`),
    choices: [
      { label: '请 OB 会紧急援助', def: true, hint: 'OB 会满意度下降', apply: () => { const v = 120 + Math.round(G.club.ob); earn(v, 'ob'); ob(-12); return `OB 会紧急捐了 ${v} 万円。`; } },
      { label: '监督自掏腰包', apply: () => { earn(80, 'other'); allMor(4); addRep(1); return '你垫付了 80 万円。部员们很感动。'; } },
      { label: '节衣缩食（训练用具降级一个月）', apply: () => { earn(40, 'other'); allMor(-5); G.flags.austerity = G.day + 30; return '用旧了的球和球棒还得再撑一个月。'; } },
    ],
  }),
});

def('injurySerious', {
  cat: 'injury',
  build: (c) => {
    const p = P(c);
    const cost = 60 + randIntStable(c, 40);
    return {
      title: '重伤',
      tone: 'bad',
      pid: p?.id,
      text: lines(`${N(c)} 的伤势比想象中严重：${p?.injury?.name ?? '重伤'}。`, '医生给出了两个方案。'),
      choices: [
        { label: `手术（${cost} 万円）`, hint: '恢复期长一些，但不会留下后遗症', def: G.funds >= cost, disabled: G.funds < cost, apply: () => { if (!alive(c) || !P(c).injury) return ''; spend(cost, 'medical'); P(c).injury!.days += 20; return '手术很成功，接下来是漫长的康复。'; } },
        { label: '保守治疗', hint: '恢复快，但可能留下后遗症（能力上限下降）', def: G.funds < cost, apply: () => { if (!alive(c) || !P(c).injury) return ''; const q = P(c); q.injury!.days = Math.round(q.injury!.days * 0.75); if (chance(0.55)) { const part = q.injury!.part; const keys = part === 'elbow' || part === 'shoulder' ? (['velocity', 'control', 'arm'] as const) : part === 'leg' ? (['speed', 'baserun', 'fielding'] as const) : (['power', 'durability'] as const); for (const k of keys) q.caps[k] = Math.max(q.a[k], q.caps[k] - randInt(3, 7)); note(q, '伤后能力上限下降'); return '伤好得快，但似乎留下了后遗症……'; } return '运气不错，恢复得很顺利。'; } },
      ],
    };
  },
});

/** build 里需要的「随机」数：由上下文决定，读档后不变 */
function randIntStable(c: Record<string, unknown>, n: number): number {
  const s = String(c.pid ?? '') + String(c.seed ?? '');
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return h % n;
}

def('newYearShrine', {
  cat: 'school',
  build: () => ({
    title: '新年参拜',
    text: '新年第一天，全队一起去神社参拜。你在许愿时祈祷的是——',
    choices: [
      { label: '无病无灾', def: true, apply: () => { G.flags.healthBless = G.day + 90; return '愿大家平安健康。（三个月内受伤风险降低）'; } },
      { label: '必胜', apply: () => { allMor(8); return '"今年一定要去甲子园！"'; } },
      { label: '学业进步', apply: () => { active().forEach((p) => (p.academics = clamp(p.academics + 8, 0, 100))); return '希望大家期末都能过关。'; } },
      { label: '抽一支签', apply: () => { const r = randInt(1, 6); if (r === 1) { allMor(10); return '大吉！全队欢呼雀跃。'; } if (r === 6) { allMor(-3); return '凶……大家脸色都不太好看。'; } allMor(3); return '中吉。还不错。'; } },
    ],
  }),
});

def('winterCamp', {
  cat: 'training',
  build: () => ({
    title: '冬季合宿',
    text: lines('寒假到了。今年的冬训怎么安排？', '冬天不能打对外比赛，正是打基础的时候。'),
    choices: [
      { label: '雪山合宿（120 万円）', hint: '力量、精神经验大增，很累', disabled: G.funds < 120, apply: () => { spend(120, 'travel'); active().forEach((p) => { addExp(p, { str: 26, men: 18, agi: 8 }); p.fatigue = clamp(p.fatigue + 25, 0, 100); }); chem(5); return '在雪地里跑步、扛沙袋……大家都脱了一层皮，也结实了一圈。'; } },
      { label: '南国集训（220 万円）', hint: '温暖的地方，经验均衡增加，不太累', disabled: G.funds < 220, apply: () => { spend(220, 'travel'); active().forEach((p) => { addExp(p, isPitcher(p) ? { str: 12, tech: 12, brk: 16, men: 8 } : { str: 12, agi: 12, tech: 18, men: 8 }); }); allMor(6); return '在温暖的球场上尽情练习，冬天也能打实战。'; } },
      { label: '留在学校练', def: true, apply: () => { active().forEach((p) => addExp(p, { str: 6, men: 4 })); return '在熟悉的操场上，一步一个脚印。'; } },
    ],
  }),
});

def('gwCamp', {
  cat: 'training',
  build: () => ({
    title: '黄金周远征',
    text: '黄金周假期，有几所外县的强校邀请我们去打练习赛。',
    choices: [
      { label: '去远征（80 万円）', hint: '实战经验与战术熟练度提升', def: G.funds >= 200, disabled: G.funds < 80, apply: () => { spend(80, 'travel'); active().forEach((p) => addExp(p, isPitcher(p) ? { brk: 8, men: 8 } : { tech: 9, men: 7 })); G.club.tactics = clamp(G.club.tactics + 4, 0, 100); return '和强校连打了四场，学到了很多。'; } },
      { label: '在学校练习', def: G.funds < 200, apply: () => '大家利用假期好好巩固了基础。' },
    ],
  }),
});

def('scholarProspect', {
  cat: 'recruit',
  build: (c) => {
    const p = P(c);
    const cost = c.cost as number;
    const monster = p?.traits.includes('monster');
    return {
      title: monster ? '「怪物」中学生' : '有前途的中学生',
      tone: monster ? 'gold' : undefined,
      pid: p?.id,
      text: monster
        ? lines(`报纸上管他叫「怪物」：${p ? prospectBrief(p) : ''}`, '他和家人来参观了练习。全国的名门都在抢他。')
        : lines(`中学的教练推荐了一名球员：${p ? prospectBrief(p) : ''}`, `他对${mySchool().name}很感兴趣。`),
      choices: [
        { label: `给特待生待遇（${cost} 万円）`, hint: '一定会来', def: G.funds >= cost + 100, disabled: G.funds < cost, apply: () => { if (!p) return ''; spend(cost, 'scholar'); p.joined = 'scholar'; commit(p); return `${fullName(p)} 答应 4 月入学！`; } },
        { label: '普通推荐入学', hint: `也许会来（${monster ? 20 : 55}%）`, apply: () => { if (!p) return ''; if (chance(monster ? 0.2 : 0.55)) { commit(p); return `${fullName(p)} 决定 4 月入学！`; } delete G.players[p.id]; return `${fullName(p)} 最后去了别的学校。`; } },
        { label: '这次就算了', def: G.funds < cost + 100, apply: () => { if (p && !G.incoming.includes(p.id)) delete G.players[p.id]; return ''; } },
      ],
    };
  },
});

def('yearSummary', {
  cat: 'summary',
  build: (c) => ({
    title: `${c.year} 学年总结`,
    tone: 'info',
    text: lines(...(c.lines as string[])),
    choices: [OK('新的一年')],
  }),
});

