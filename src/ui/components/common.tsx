import type { ComponentChildren, CSSProperties } from 'preact';
import { useState } from 'preact/hooks';
import type { Player, School } from '../../core/types';
import { G } from '../../core/state';
import { gradeLetter, GRADE_COLOR, isPitcher, fullName } from '../../core/attrs';
import { portraitURL } from '../../render/portrait';
import { openPlayer } from '../store';
import { money as fmtMoney } from '../../core/util';

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
    <button class={cls} disabled={p.disabled} title={p.title} style={p.style} onClick={(e) => p.onClick?.(e as unknown as MouseEvent)}>
      {p.children}
    </button>
  );
}

export function Panel(p: { title?: ComponentChildren; right?: ComponentChildren; children?: ComponentChildren; class?: string; style?: CSSProperties; id?: string }) {
  return (
    <div id={p.id} class={`panel ${p.class ?? ''}`} style={p.style}>
      {p.title !== undefined && (
        <div class="ptitle">
          <span>{p.title}</span>
          <span class="grow" />
          {p.right}
        </div>
      )}
      {p.children}
    </div>
  );
}

export function Grade(p: { v: number; showV?: boolean; kmh?: boolean }) {
  const letter = gradeLetter(p.v);
  return (
    <span class="gv">
      <span class="grade" style={{ color: GRADE_COLOR[letter] }}>{letter}</span>
      {p.showV !== false && <span class="v">{Math.round(p.v)}</span>}
    </span>
  );
}

export function Bar(p: { v: number; max?: number; color?: string; mark?: number; tall?: boolean; w?: number }) {
  const max = p.max ?? 100;
  const pct = Math.max(0, Math.min(100, (p.v / max) * 100));
  return (
    <div class={`bar ${p.tall ? 'tall' : ''}`} style={p.w ? { width: `${p.w}px` } : undefined}>
      <i style={{ width: `${pct}%`, background: p.color }} />
      {p.mark !== undefined && <b style={{ left: `${Math.min(100, (p.mark / max) * 100)}%` }} />}
    </div>
  );
}

export function Portrait(p: { player: Player; size?: 'sm' | 'big' | ''; school?: School }) {
  const s = p.school ?? G.schools[p.player.schoolId];
  const colors = s?.colors ?? { primary: '#333c57', secondary: '#f4f4f4', cap: '#333c57', letter: '' };
  const url = portraitURL({ face: p.player.face, colors, mood: p.player.morale, injured: !!p.player.injury, pitcher: isPitcher(p.player) });
  return <img class={`portrait px ${p.size ?? ''}`} src={url} alt="" />;
}

export function Emblem(p: { school: School; lg?: boolean }) {
  const c = p.school.colors;
  return (
    <span class={`emblem ${p.lg ? 'lg' : ''}`} style={{ background: c.primary, color: c.secondary }}>
      {c.letter}
    </span>
  );
}

export function Tabs<T extends string>(p: { tabs: { id: T; label: ComponentChildren }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div class="tabs">
      {p.tabs.map((t) => (
        <div key={t.id} class={`tab ${t.id === p.value ? 'on' : ''}`} onClick={() => p.onChange(t.id)}>
          {t.label}
        </div>
      ))}
    </div>
  );
}

export function useTab<T extends string>(init: T): [T, (t: T) => void] {
  return useState<T>(init);
}

export function Tip(p: { tip: string; children: ComponentChildren; class?: string }) {
  return (
    <span class={`tooltip ${p.class ?? ''}`} data-tip={p.tip}>
      {p.children}
    </span>
  );
}

export function PName(p: { player: Player; noLink?: boolean }) {
  if (p.noLink) return <span>{fullName(p.player)}</span>;
  return (
    <a
      style={{ color: 'inherit', cursor: 'pointer', textDecoration: 'none', borderBottom: '1px dotted var(--line)' }}
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
    <span style={{ color: c.c }} title={c.n}>
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
  return <Bar v={p.v} color={color} w={p.w ?? 46} />;
}

export function Morale(p: { v: number }) {
  const color = p.v >= 75 ? 'var(--accent)' : p.v >= 50 ? 'var(--green)' : p.v >= 30 ? 'var(--orange)' : 'var(--red)';
  return <Bar v={p.v} color={color} w={46} />;
}

export function Money(p: { v: number; signed?: boolean }) {
  const neg = p.v < 0;
  return <span class={neg ? 'bad' : p.signed ? 'good' : ''}>{p.signed && !neg ? '+' : ''}{fmtMoney(p.v)}</span>;
}

export function Stars(p: { n: number | null }) {
  if (p.n === null) return <span class="dim">？</span>;
  return (
    <span style={{ color: 'var(--accent)' }}>
      {'★'.repeat(p.n)}
      <span class="dim">{'★'.repeat(5 - p.n)}</span>
    </span>
  );
}

export interface Col<T> {
  key: string;
  label: ComponentChildren;
  render: (row: T) => ComponentChildren;
  sort?: (row: T) => number | string;
  num?: boolean;
  title?: string;
}

export function DataTable<T>(p: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (r: T) => string | number;
  onRow?: (r: T) => void;
  rowClass?: (r: T) => string;
  initialSort?: string;
  maxHeight?: string;
  desc?: boolean;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(p.initialSort);
  const [desc, setDesc] = useState(p.desc ?? true);
  let rows = p.rows;
  const col = p.cols.find((c) => c.key === sortKey);
  if (col?.sort) {
    const f = col.sort;
    rows = [...rows].sort((a, b) => {
      const va = f(a);
      const vb = f(b);
      const r = typeof va === 'string' ? String(va).localeCompare(String(vb)) : (va as number) - (vb as number);
      return desc ? -r : r;
    });
  }
  return (
    <div class="table-wrap" style={p.maxHeight ? { maxHeight: p.maxHeight } : undefined}>
      <table class="px">
        <thead>
          <tr>
            {p.cols.map((c) => (
              <th
                key={c.key}
                class={`${c.sort ? 'sort' : ''} ${c.num ? 'num' : ''}`}
                title={c.title}
                onClick={() => {
                  if (!c.sort) return;
                  if (sortKey === c.key) setDesc(!desc);
                  else {
                    setSortKey(c.key);
                    setDesc(true);
                  }
                }}
              >
                {c.label}
                {sortKey === c.key ? (desc ? '▼' : '▲') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={p.rowKey(r)} class={`${p.onRow ? 'click' : ''} ${p.rowClass?.(r) ?? ''}`} onClick={() => p.onRow?.(r)}>
              {p.cols.map((c) => (
                <td key={c.key} class={c.num ? 'num' : ''}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Slider(p: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; w?: number }) {
  return (
    <input
      type="range"
      class="px"
      min={p.min}
      max={p.max}
      step={p.step ?? 1}
      value={p.value}
      style={{ width: `${p.w ?? 120}px` }}
      onInput={(e) => p.onChange(Number((e.target as HTMLInputElement).value))}
    />
  );
}

export function Empty(p: { children: ComponentChildren }) {
  return <div class="dim center" style={{ padding: '16px' }}>{p.children}</div>;
}
