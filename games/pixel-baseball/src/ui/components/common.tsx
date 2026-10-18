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

export function Grade(p: { v: number; showV?: boolean }) {
  const letter = gradeLetter(p.v);
  return (
    <span class="gv">
      <span class="grade" style={{ color: GRADE_COLOR[letter] }}>{letter}</span>
      {p.showV !== false && <span class="v">{Math.round(p.v)}</span>}
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

export function Fatigue(p: { v: number; w?: number }) {
  const color = p.v >= 70 ? 'var(--red)' : p.v >= 45 ? 'var(--orange)' : 'var(--green)';
  return <Bar v={p.v} color={color} w={p.w ?? 40} />;
}

export function Morale(p: { v: number; w?: number }) {
  const color = p.v >= 75 ? 'var(--accent)' : p.v >= 50 ? 'var(--green)' : p.v >= 30 ? 'var(--orange)' : 'var(--red)';
  return <Bar v={p.v} color={color} w={p.w ?? 40} />;
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
