// 界面小工具：转义、对话框、提示条、下载、选文件、时间和大小的显示

export const $ = (sel, root = document) => root.querySelector(sel);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- 对话框（原生 <dialog>：自带焦点管理和 Esc 关闭） ----------
// actions: [{ label, value, kind: 'primary' | 'danger' | '', autofocus }]
// 返回 Promise<{ value, el }>：value 是点击的按钮（按 Esc 关闭时为 null），el 用来读取对话框里勾选的内容。
// 点按钮时直接给出结果，不等 close 事件：Chromium 把 close 事件放在下一次渲染时派发，
// 页面在后台（比如玩家按提示切去关游戏）时不渲染，流程会一直卡住。
export function openDialog({ title, body = '', actions = [{ label: '知道了', value: 'ok', kind: 'primary' }] }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    dlg.setAttribute('aria-labelledby', 'dlg-title');
    dlg.innerHTML = `<h2 class="dlg-title" id="dlg-title"></h2><div class="dlg-body"></div><div class="dlg-actions"></div>`;
    dlg.querySelector('.dlg-title').textContent = title;
    const bodyEl = dlg.querySelector('.dlg-body');
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else bodyEl.append(body);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve({ value: value || null, el: dlg });
    };
    const foot = dlg.querySelector('.dlg-actions');
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.kind || ''}`;
      b.dataset.value = a.value ?? '';
      b.textContent = a.label;
      if (a.autofocus) b.autofocus = true;
      b.addEventListener('click', () => finish(a.value));
      foot.append(b);
    }
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    dlg.addEventListener('close', () => finish(null));
    document.body.append(dlg);
    dlg.showModal();
  });
}

// ---------- 提示条 ----------
export function toast(text, kind = 'info', ms = 3200) {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  box.append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- 文件 ----------
export function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    document.querySelectorAll('input.ag-file').forEach((x) => x.remove());
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.className = 'ag-file';
    input.hidden = true;
    const done = (f) => {
      resolve(f);
      input.remove();
    };
    input.addEventListener('change', () => done(input.files && input.files[0] ? input.files[0] : null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

// ---------- 显示 ----------
const pad = (n) => String(n).padStart(2, '0');

export function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return formatDate(ts).slice(0, 10);
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
