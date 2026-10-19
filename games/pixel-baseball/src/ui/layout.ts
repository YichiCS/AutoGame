// 手机 / 电脑两种布局的切换（和 main.css 里的 @media (max-width: 900px) 用同一个条件）
import { useEffect, useState } from 'preact/hooks';

export const PHONE_QUERY = '(max-width: 900px)';

function matches(): boolean {
  return typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;
}

/** 现在是不是手机布局（窗口宽度变化时自动更新） */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
