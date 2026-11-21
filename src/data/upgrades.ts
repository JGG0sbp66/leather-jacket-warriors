import type { Upgrade } from '../types/game.ts';

export const UPGRADES: Upgrade[] = [
  { id: 'power', name: '核心超频', category: '全武器强化', description: '提升全部武器的基础伤害，分身同步获得加成。', detail: '全武器伤害倍率 +40 个百分点', icon: 'chip' },
  { id: 'rapid', name: '并行指令', category: '攻击强化', description: '缩短发射间隔，用更密集的弹幕压住敌群。', detail: '全武器攻击间隔 −15%', icon: 'bolt' },
  { id: 'volley', name: '多线程分发', category: '弹道强化', description: '普通形态的显卡飞镖每轮额外发射一枚，覆盖更宽的攻击扇面。', detail: '额外飞镖 +1 · 最多额外 4 枚 · 超武固定 8 枚', icon: 'crosshair' },
  { id: 'magnet', name: '宽域采集', category: '收集强化', description: '远处的经验晶核也会自动向你靠拢。', detail: '拾取半径 +45 · 当前生命 +10', icon: 'magnet' },
  { id: 'vitality', name: '冗余备份', category: '生存强化', description: '扩充生命容量，并立即修复受损的机体。', detail: '生命上限 +20 · 恢复 35 生命', icon: 'heart' },
  { id: 'speed', name: '轻量运行时', category: '移动强化', description: '更轻快地穿过包围圈，把追兵甩在身后。', detail: '移动速度 +12%', icon: 'move' },
];
