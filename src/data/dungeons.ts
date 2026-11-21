import type { BossType, DungeonMap } from '../types/game.ts';

export interface DungeonMapDefinition {
  name: string;
  description: string;
  bossType: BossType;
  bossAt: number;
  earliestBossAt: number;
  eliteAt: number;
  eventAt: number;
}

export const DUNGEON_MAPS: Record<DungeonMap, DungeonMapDefinition> = {
  plaza: {
    name: '外围霓虹广场',
    description: '雨夜突围 · 轰开媒体包围网，夺回神殿大门。',
    bossType: 'truck', bossAt: 40, earliestBossAt: 35, eliteAt: 20, eventAt: 25,
  },
  cryo: {
    name: '极寒超频机房',
    description: '机柜掩体、过载电池与液冷管道；踩入液冷池，武器冷却缩减 45%。',
    bossType: 'legal', bossAt: 43, earliestBossAt: 36, eliteAt: 13, eventAt: 20,
  },
  darknet: {
    name: '断电暗网走廊',
    description: '机柜之间摸黑反杀；停电时暴击率翻倍，复电必得稀有武器。',
    bossType: 'legal', bossAt: 43, earliestBossAt: 36, eliteAt: 13, eventAt: 20,
  },
  temple: {
    name: '顶层董事局 · 黄金圣殿',
    description: '穿过赛博云海，经历牛市与砸盘，夺回最高管理员权限。',
    bossType: 'chairman', bossAt: 40, earliestBossAt: 40, eliteAt: 7, eventAt: 10,
  },
  singularity: {
    name: 'AI 奇点核心',
    description: '无尽深渊已开启；保留全部构筑，挑战随机词缀与强化守关者。',
    bossType: 'chairman', bossAt: 34, earliestBossAt: 24, eliteAt: 10, eventAt: 12,
  },
};

export const DUNGEON_AFFIXES = ['狂暴超频', '协议装甲', '高压陷阱', '连锁过载'] as const;
