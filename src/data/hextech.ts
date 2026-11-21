import type { HexCard, HexTier } from '../types/game.ts';

export const TIER_LABELS: Record<HexTier, string> = { prismatic: '棱彩', gold: '黄金', silver: '白银' };
export const HEXTECH: HexCard[] = [
  { id: 'echo', name: '仿生泪滴', tier: 'prismatic', description: '立刻扣减 20% 当前生命，在场上召唤一个与你外观一致、同步发射你当前全套武器的“黑皮衣分身”并肩作战 40 秒。', detail: '分身持续 40 秒 · 每 50 秒重建', icon: 'clone' },
  { id: 'chrono', name: '斯安威斯坦', tier: 'prismatic', description: '血量低于 40% 自动触发或主动按 Shift 开启 2.5 秒子弹时间：主角移速翻倍带霓虹残影，敌人与弹幕速度骤降 80%。', detail: '持续 2.5 秒 · 移速 ×2 · 敌方速度 −80% · 主动冷却 12 秒 / 自动 15 秒', icon: 'clock' },
  { id: 'chair', name: '白色塑料椅', tier: 'prismatic', description: '原地站立不动超过 0.8 秒脚下浮现白色塑料椅坐下！坐下期间减伤 70%、攻速翻倍并自动发射追踪显卡飞剑；一旦移动椅子消失。', detail: '坐下时减伤 70% · 攻速 ×2', icon: 'chair' },
  { id: 'hoard', name: '买得越多，省得越多', tier: 'prismatic', description: '拾取范围 +180%，场上每有 1 颗未拾取晶核，移速与暴击率 +1.5%（最高 +90%）。', detail: '拾取范围 +180% · 两项加成各最多 +90%', icon: 'magnet' },
  { id: 'armor', name: '3nm 芯片，小子！', tier: 'gold', description: '受伤时触发硬化特效，本次伤害减半并在周身炸开高压电弧击退敌人。', detail: '受伤减半 · 电弧反击', icon: 'shield' },
  { id: 'parry', name: '打铁宗师', tier: 'gold', description: '每 6 秒可自动格挡弹反一次即将命中的敌方子弹（发出清脆“叮！”打铁音效与火花），并将该子弹 5 倍伤害弹向最近敌人。', detail: '弹反伤害 ×5 · 冷却 6 秒', icon: 'crosshair' },
  { id: 'reckless', name: '废物的思维', tier: 'gold', description: '等待董事会施舍？但那是，废物的思维！', detail: '放弃所有护盾（含绝对关税壁垒）· 受击伤害 +15% · 对精英与 Boss 伤害 +60%', icon: 'bolt' },
  { id: 'vampire', name: '算力吸血', tier: 'gold', description: '暴击时有 15% 概率恢复 1 点生命值。', detail: '暴击时有 15% 概率恢复 1 生命', icon: 'heart' },
  { id: 'overwork', name: '硅谷 996 福报', tier: 'silver', description: '全武器伤害 +25%，攻速 +15%，敌人移速 +10%。', detail: '伤害 +25% · 攻速 +15% · 敌方移速 +10%', icon: 'chip' },
  { id: 'wide', name: '超宽带鱼屏', tier: 'silver', description: '所有子弹、铲气、光环体积与判定范围 +35%，轰炸、屏障和电弧范围同步扩大。', detail: '投射物与技能范围 +35%', icon: 'move' },
  { id: 'network', name: '人脉滚雪球', tier: 'silver', description: '通灵能量充能速度 +45%，立刻获得 50% 通灵能量。', detail: '充能速度 +45% · 立即获得 50 能量', icon: 'duck' },
];
