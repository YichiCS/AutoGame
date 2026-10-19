// 比赛里用到的名称（打席结果、球种）
import type { PitchType } from '../core/types';
import type { PAResult } from './types';
import { PITCH_DEFS } from '../data/pitches';

export const RES_NAME: Record<PAResult, string> = {
  K: '三振', BB: '四坏球', IBB: '敬远', HBP: '触身球', '1B': '安打', '2B': '二垒打', '3B': '三垒打', HR: '本垒打',
  OUT: '出局', DP: '双杀', SAC: '牺牲触击', SF: '牺牲飞球', E: '对方失误上垒', FC: '野选',
};

export const isHit = (r: PAResult): boolean => r === '1B' || r === '2B' || r === '3B' || r === 'HR';

export function pitchName(t: PitchType | 'FB'): string {
  return t === 'FB' ? '直球' : PITCH_DEFS[t].name;
}

/** 球种名（魔球用自己的名字） */
export function pitchLabel(t: PitchType | 'FB', sig?: string): string {
  return sig ? `「${sig}」` : pitchName(t);
}
