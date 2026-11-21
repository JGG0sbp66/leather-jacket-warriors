import type { BossType, StoryState } from '../types/game.ts';

export const BOSS_NAME = '资本长老会主席';
export const BOSS_QUOTE = '我才是董事会MVP！公司股价波动你怎么不找找自己问题？！回答我！Look in my eyes！Tell me why！';
export const REVERSAL_QUOTE = '现在是匆匆忙忙、连滚带爬！';

export const BOSS_DEFINITIONS: Record<BossType, {
  name: string; title: string; introText: string; quoteText: string;
  hp: number; radius: number; speed: number;
}> = {
  truck: {
    name: '直播装甲车', title: '头条制造机', hp: 10000, radius: 46, speed: 58,
    introText: '狗仔总编：老J！只要把你狼狈逃窜的画面传上热搜，你就彻底翻不了身了！',
    quoteText: '热搜泥头车：红色路径亮起一秒后冲撞！急刹车时小心舆论闪光环。',
  },
  legal: {
    name: '绝对协议体', title: '冷血法务总监', hp: 21000, radius: 40, speed: 52,
    introText: '法务总监：根据竞业协议第404条，你已无权踏入核心机房半步！签下投降书吧！\n皮衣老J：签字？但那是，废物的思维！',
    quoteText: '律师函会原路飞回；封锁令升起前，绕开机房过道里的红色栅栏。',
  },
  chairman: {
    name: '算力收割机 MK-I', title: BOSS_NAME, hp: 38000, radius: 64, speed: 58,
    introText: '主席：算力帝国不再需要感性的创始人了。在这里，你才是挑战者！\n皮衣老J：少废话。把我的位子还回来！',
    quoteText: BOSS_QUOTE,
  },
};

export const STORY_NEWS: Record<StoryState['event'], string> = {
  parking: '第1层 · 外围霓虹广场：击退八卦狗仔与水军，积攒突破进度，杀回算力神殿！',
  shortCrash: '华尔街恶意砸盘！红色做空K线陨石雨正在坠落，小怪也会被砸中！',
  paparazzi: '全网热搜 · 闪光灯包围网！10秒内轰开缺口并冲出圆阵，夺取全屏吸铁石与升级经验箱！',
  blackout: '神殿拉闸大停电！黑暗中暴击率翻倍，撑过12秒，复电清场必掉稀有武器！',
  cryo: '液冷管道大爆裂！小怪在液氮水域减速80%；老J移速减15%，全武器冷却缩减45%！',
  bull: 'JACKPOT 777！散户大牛市 · 坐杀博徒狂欢！本来应该从从容容、游刃有余……',
  alarm: '最终守关战即将开始！按 B 打开武器匣，调整最适合打Boss的3把神兵。',
  boss: '资本长老会主席 · 算力收割机 MK-I 降临！击破董事护盾，夺回最高管理员权限！',
  truck: '头条制造机 · 直播装甲车封锁广场！红色冲撞预警后绕到车侧反击！',
  legalBoss: '冷血法务总监 · 绝对协议体降临！留心回旋律师函与临时电子栅栏！',
  portal: '守关Boss已击破！收取地面补给，走入传送电梯，继续高塔突围。',
  endless: '无尽深渊地牢：随机地图与强化词缀，击破守关Boss后继续向上！',
};

// Times are relative to entering a floor; bosses additionally accept kill progress.
export const STORY_EVENTS = [
  { id: 'captain-20', floor: 1, at: 20 },
  { id: 'paparazzi-25', floor: 1, at: 25 },
  { id: 'ghost-13', floor: 2, at: 13 },
  { id: 'branch-20', floor: 2, at: 20 },
  { id: 'iron-7', floor: 3, at: 7 },
  { id: 'bull-10', floor: 3, at: 10 },
  { id: 'hex-25', floor: 3, at: 25 },
  { id: 'reversal-30', floor: 3, at: 30 },
  { id: 'alarm-35', floor: 3, at: 35 },
] as const;

export type StoryEvent = typeof STORY_EVENTS[number];
