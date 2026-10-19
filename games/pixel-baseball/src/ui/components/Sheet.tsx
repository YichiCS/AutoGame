import type { ComponentChildren } from 'preact';

/**
 * 弹窗外框：标题、可以滚动的正文、固定在下面的操作区。
 * 电脑上是居中的对话框；手机上是从底部升起的面板（最高约 90% 屏幕），操作按钮始终看得到。
 */
export function Sheet(p: { title: string; tone?: string; children: ComponentChildren; foot?: ComponentChildren; onClose?: () => void; wide?: boolean; class?: string }) {
  return (
    <div class="overlay sheet-host" onClick={(e) => e.target === e.currentTarget && p.onClose?.()}>
      <div class={`modal sheet ${p.wide ? 'wide' : ''} ${p.tone ? `tone-${p.tone}` : ''} ${p.class ?? ''}`} role="dialog" aria-modal="true" aria-label={p.title}>
        <div class="mtitle">
          <span>{p.title}</span>
          {p.onClose && (
            <button type="button" class="x" onClick={p.onClose} aria-label="关闭">
              ×
            </button>
          )}
        </div>
        <div class="mbody">{p.children}</div>
        {p.foot && <div class="mact">{p.foot}</div>}
      </div>
    </div>
  );
}
