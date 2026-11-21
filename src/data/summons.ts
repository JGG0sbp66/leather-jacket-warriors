import type { Ally, AllyId } from '../types/game.ts';

export const ALLIES: Record<AllyId, Ally> = {
  patch: { id: 'patch', name: 'Qoder 创世鸭神', skill: '一键重构', description: '把场上所有敌方红色弹幕直接转化成绿色回血代码碎片，并对全屏敌人造成一次伤害；回复 15 点生命值。', quote: '检测到恶意Bug，正在为您一键修复战场！', icon: 'duck', color: '#b6ed76' },
  ember: { id: 'ember', name: '火星马老板', skill: '星链空袭', description: '在密集敌群处生成 4 个红圈，4 枚火箭砸地爆炸，留下持续 6 秒灼烧地面的“推特舆论火海”。', quote: '老铁顶住，我的星链已经锁定他们了！', icon: 'crosshair', color: '#f4a36e' },
  aegis: { id: 'aegis', name: '金毛懂皇', skill: '绝对关税壁垒', description: '主角周围升起旋转金色防弹墙（持续 7 秒），碾碎碰撞小怪并将所有触墙的敌方红色子弹高伤反弹回去！', quote: 'Nobody knows 芯片 better than me!', icon: 'shield', color: '#edcd80' },
  clock: { id: 'clock', name: '晶圆宗师老张', skill: '3nm 时停领域', description: '冻结全场所有敌人和弹幕 4.5 秒！老J 攻速翻倍收割，并在地上撒下六枚回血晶圆。', quote: '在绝对的制程工艺面前，时间都要暂停！', icon: 'clock', color: '#baa5ff' },
};
