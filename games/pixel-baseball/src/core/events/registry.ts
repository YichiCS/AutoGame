// 事件的定义格式
//   ctx()       随机事件：抽出上下文（谁、什么），返回 null 表示现在不满足条件
//   build(ctx)  生成弹窗的标题、正文和选项。必须只依赖 ctx 和当前状态（读档后会重新生成）
//   choice.def  推荐选项：托管时选它
//   choice.apply() 选了之后的效果，返回一句结果（会写进动态）
import type { Ctx } from '../types';

export interface Choice {
  label: string;
  hint?: string;
  def?: boolean;
  disabled?: boolean;
  apply?: () => string | void;
}

export interface EventView {
  title: string;
  text: string;
  /** 弹窗里附上这名球员的信息卡 */
  pid?: number;
  tone?: 'good' | 'bad' | 'gold' | 'info';
  choices: Choice[];
}

export interface EventDef {
  /** 托管的类别（见 queue.ts 的 AUTO_CATS） */
  cat: string;
  /** 一定要问监督（不受托管影响） */
  never?: boolean;
  /** 随机事件的权重；系统事件不写 */
  weight?: number | (() => number);
  /** 冷却天数 */
  cd?: number;
  ctx?: () => Ctx | null;
  build: (ctx: Ctx) => EventView;
}

export const EVENTS: Record<string, EventDef> = {};

export function def(id: string, d: EventDef): void {
  EVENTS[id] = d;
}

export const OK = (label = '知道了'): Choice => ({ label, def: true });
