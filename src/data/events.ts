import type { StoryState } from '../types/game.ts';

export const BOSS_NAME = '资本长老会主席';
export const BOSS_QUOTE = '我才是董事会MVP！股价波动你怎么不找找自己问题？！回答我！Look in my eyes！Tell me why！';
export const REVERSAL_QUOTE = '现在是匆匆忙忙、连滚带爬！';

export const STORY_NEWS: Record<StoryState['event'], string> = {
  parking: '老J手持显卡与大铲子闯入神殿一楼大厅，狗仔与保安溃败。',
  shortCrash: '华尔街空头联合砸盘！红色大阴线陨石正在坠落！',
  paparazzi: '狗仔队闪光灯围堵！10秒内杀出缺口并冲出圆阵，夺取全屏吸铁石与强化宝箱！',
  blackout: '董事会切断神殿电源！暴击率翻倍，撑过12秒黑暗！',
  bull: '本来应该从从容容、游刃有余……',
  alarm: '牛市休市，Boss红色警报！资本长老会主席即将降临！',
  boss: '资本长老会主席降临！机械西装巨人接管顶层董事会。',
  endless: '无尽股东大会',
};

export const STORY_EVENTS = [
  { id: 'legal-20', at: 20 },
  { id: 'weapon-25', at: 25 },
  { id: 'crash-35', at: 35 },
  { id: 'crash-37', at: 37 },
  { id: 'crash-39', at: 39 },
  { id: 'crash-41', at: 41 },
  { id: 'legal-50', at: 50 },
  { id: 'weapon-55', at: 55 },
  { id: 'paparazzi-70', at: 70 },
  { id: 'blackout-105', at: 105 },
  { id: 'assassins-108', at: 108 },
  { id: 'weapon-110', at: 110 },
  { id: 'assassins-111', at: 111 },
  { id: 'assassins-114', at: 114 },
  { id: 'power-117', at: 117 },
  { id: 'bull-130', at: 130 },
  { id: 'alarm-142', at: 142 },
  { id: 'reversal-150', at: 150 },
  { id: 'boss-155', at: 155 },
] as const;

export type StoryEvent = typeof STORY_EVENTS[number];
