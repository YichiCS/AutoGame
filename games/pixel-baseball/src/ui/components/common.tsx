import type { ComponentChildren, CSSProperties } from 'preact';
import type { Player, SchoolLite } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { gradeLetter, GRADE_COLOR, isPitcher, fullName } from '../../core/attrs';
import { portraitURL } from '../../render/portrait';
import { openPlayer } from '../store';
import { moneyStr } from '../../core/economy';

type BtnKind = 'primary' | 'red' | 'green' | 'blue' | 'ghost' | '';

export function Btn(p: {
  children: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
  kind?: BtnKind;
  small?: boolean;
  big?: boolean;
  disabled?: boolean;
  on?: boolean;
  title?: string;
  class?: string;
  style?: CSSProperties;
}) {
  const cls = ['btn', p.kind ?? '', p.small ? 'small' : '', p.big ? 'big' : '', p.on ? 'on' : '', p.class ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" class={cls} disabled={p.disabled} title={p.title} style={p.style} onClick={(e) => p.onClick?.(e as unknown as MouseEvent)}>
      {p.children}
    </button>
  );
}

export function Panel(p: { title?: ComponentChildren; right?: ComponentChildren; children?: ComponentChildren; class?: string; style?: CSSProperties }) {
  return (
    <section class={`panel ${p.class ?? ''}`} style={p.style}>
      {p.title !== undefined && (
        <div class="ptitle">
          <span>{p.title}</span>
          <span class="grow" />
          {p.right}
        </div>
      )}
      {p.children}
    </section>
  );
}

/** 总评 / 能力：0-100 的数字，按档位上色（档位字母放在提示里） */
export function Grade(p: { v: number; showV?: boolean }) {
  const letter = gradeLetter(p.v);
  return (
    <span class="gv" title={`${letter} 级`}>
      <span class="v" style={{ color: GRADE_COLOR[letter] }}>{Math.max(0, Math.min(100, Math.round(p.v)))}</span>
    </span>
  );
}

/** 上个月涨了多少（每月 1 日结算） */
export function recentGain(pl: Player, k?: string): number {
  const a = pl.gm ?? {};
  if (k) return (a as Record<string, number>)[k] ?? 0;
  let s = 0;
  for (const v of Object.values(a)) s += v ?? 0;
  return s;
}

export function Gain(p: { n: number }) {
  if (!p.n) return null;
  return <span class="gain" title="上个月的成长">+{p.n}</span>;
}

/** 0-100 的能力数值，按档位上色 */
export function Num(p: { v: number }) {
  const v = Math.max(0, Math.min(100, Math.round(p.v)));
  return (
    <span class="num" style={{ color: GRADE_COLOR[gradeLetter(v)] }}>
      {v}
    </span>
  );
}

export function Letter(p: { v: number }) {
  const l = gradeLetter(p.v);
  return <span class="grade" style={{ color: GRADE_COLOR[l] }}>{l}</span>;
}

export function Bar(p: { v: number; max?: number; color?: string; mark?: number; w?: number }) {
  const max = p.max ?? 100;
  const pct = Math.max(0, Math.min(100, (p.v / max) * 100));
  return (
    <span class="bar" style={p.w ? { width: `${p.w}px` } : undefined}>
      <i style={{ width: `${pct}%`, background: p.color }} />
      {p.mark !== undefined && <b style={{ left: `${Math.min(100, (p.mark / max) * 100)}%` }} />}
    </span>
  );
}

export function Portrait(p: { player: Player; size?: 'sm' | 'big' | '' }) {
  const colors = mySchool()?.colors ?? { primary: '#333c57', secondary: '#f4f4f4', cap: '#333c57', letter: '' };
  const url = portraitURL({ face: p.player.face, colors, mood: p.player.morale, injured: !!p.player.injury, pitcher: isPitcher(p.player) });
  return <img class={`portrait ${p.size ?? ''}`} src={url} alt="" />;
}

export function Emblem(p: { school: SchoolLite | null | undefined; lg?: boolean }) {
  if (!p.school) return null;
  const c = p.school.colors;
  return (
    <span class={`emblem ${p.lg ? 'lg' : ''}`} style={{ background: c.primary, color: c.secondary }}>
      {c.letter}
    </span>
  );
}

export function SubTabs<T extends string>(p: { tabs: { id: T; label: ComponentChildren }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div class="subtabs">
      {p.tabs.map((t) => (
        <button type="button" key={t.id} class={`subtab ${t.id === p.value ? 'on' : ''}`} onClick={() => p.onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function PName(p: { player: Player; noLink?: boolean }) {
  if (p.noLink || !G.players[p.player.id]) return <span>{fullName(p.player)}</span>;
  return (
    <a
      class="plink"
      onClick={(e) => {
        e.stopPropagation();
        openPlayer(p.player.id);
      }}
    >
      {fullName(p.player)}
    </a>
  );
}

const COND = [
  { s: '↓↓', c: '#41a6f6', n: '绝不调' },
  { s: '↘', c: '#94b0c2', n: '不调' },
  { s: '→', c: '#f4f4f4', n: '普通' },
  { s: '↗', c: '#ffa300', n: '好调' },
  { s: '↑↑', c: '#ff4d4d', n: '绝好调' },
];

export function Cond(p: { v: number; text?: boolean }) {
  const c = COND[Math.max(0, Math.min(4, p.v + 2))];
  return (
    <span class="cond" style={{ color: c.c }} title={`调子：${c.n}`}>
      {c.s}
      {p.text ? ` ${c.n}` : ''}
    </span>
  );
}

export function condName(v: number): string {
  return COND[Math.max(0, Math.min(4, v + 2))].n;
}

/** 带名字的数值：「疲劳 23」。名字可以省略（表头已经写了的时候），数字固定宽度、右对齐，上下对得齐 */
export function Lv(p: { label?: string; v: number; color?: string; title?: string; cls?: string }) {
  const v = Math.round(p.v);
  return (
    <span class={`lv ${p.cls ?? ''}`} title={p.title ?? (p.label ? `${p.label} ${v}` : undefined)}>
      {p.label && <i>{p.label}</i>}
      <b style={p.color ? { color: p.color } : undefined}>{v}</b>
    </span>
  );
}

/** 疲劳：45 以下绿、70 以下橙、70 以上红。w 是旧版的条宽，已不用 */
export function fatigueColor(v: number): string {
  return v >= 70 ? 'var(--hot)' : v >= 45 ? 'var(--accent2)' : 'var(--green2)';
}

export function Fatigue(p: { v: number; w?: number; bare?: boolean }) {
  return <Lv label={p.bare ? undefined : '疲劳'} v={p.v} color={fatigueColor(p.v)} title={`疲劳 ${Math.round(p.v)}（越高越容易受伤，45 以上要注意，70 以上很危险）`} cls="fat" />;
}

export function moraleColor(v: number): string {
  return v >= 75 ? 'var(--accent)' : v >= 50 ? 'var(--green2)' : v >= 30 ? 'var(--accent2)' : 'var(--hot)';
}

export function Morale(p: { v: number; w?: number; bare?: boolean }) {
  return <Lv label={p.bare ? undefined : '干劲'} v={p.v} color={moraleColor(p.v)} title={`干劲 ${Math.round(p.v)}`} />;
}

/** 总评：按档位上色的数字；label 时前面写上「总评」，big 时用大字 */
export function Ovr(p: { v: number; label?: boolean; big?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(p.v)));
  const letter = gradeLetter(v);
  return (
    <span class={`ovr ${p.big ? 'big' : ''}`} title={`总评 ${v}（${letter} 级）`}>
      {p.label && <i>总评</i>}
      <b style={{ color: GRADE_COLOR[letter] }}>{v}</b>
    </span>
  );
}

export function Money(p: { v: number; signed?: boolean }) {
  const neg = p.v < 0;
  return (
    <span class={neg ? 'bad' : p.signed ? 'good' : ''}>
      {p.signed && !neg ? '+' : ''}
      {moneyStr(p.v)}
    </span>
  );
}

export function Stars(p: { n: number | null }) {
  if (p.n === null) return <span class="dim">？？？</span>;
  return (
    <span class="stars">
      {'★'.repeat(p.n)}
      <span class="dim">{'★'.repeat(5 - p.n)}</span>
    </span>
  );
}

export function Empty(p: { children: ComponentChildren }) {
  return <div class="empty">{p.children}</div>;
}

/** 把带换行的文字分段显示 */
export function Paras(p: { text: string }) {
  return (
    <div class="paras">
      {p.text.split('\n').map((line, i) => (line ? <p key={i}>{line}</p> : <div key={i} class="gap" />))}
    </div>
  );
}
