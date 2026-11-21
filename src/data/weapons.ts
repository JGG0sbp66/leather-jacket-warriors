import type { Upgrade, WeaponDefinition, WeaponId, WeaponState } from '../types/game.ts';

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  gpu: {
    id: 'gpu',
    name: '显卡飞镖',
    evolution: '9090 Ti 核弹阵列',
    description: '朝最近敌人发射绿色显卡飞镖；升级提升伤害、飞镖数量与穿透。',
    evolutionDescription: '每轮释放 8 片巨型核弹显卡，高速环绕后向外飞出，穿刺全图。',
    icon: 'chip',
  },
  spatula: {
    id: 'spatula',
    name: '厨房大铲子',
    evolution: '既见算力，为何不拜',
    description: '朝最近敌人挥出前方扇形重击并击退；升级提升伤害与挥击范围。',
    evolutionDescription: '挥出贯穿半屏的翠绿月牙激光铲气，穿透沿途所有敌人。',
    icon: 'crosshair',
  },
  cuda: {
    id: 'cuda',
    name: 'CUDA 生态力场',
    evolution: '绝对生态领域',
    description: '脚下环绕发光绿色电路环，持续灼烧附近敌人；升级提升伤害与半径。',
    evolutionDescription: '生态领域半径大幅扩大，并使领域内敌人减速 60%。',
    icon: 'shield',
  },
  pulse: {
    id: 'pulse',
    name: '双冷管脉冲炮',
    evolution: '超频死光 · 烤机模式',
    description: '朝最近敌人周期性射出双道平行蓝绿激光，穿透敌群；升级提升宽度与伤害。',
    evolutionDescription: '同时齐射 3 道粗大死光，贯穿全图敌群。',
    icon: 'bolt',
  },
  duck: {
    id: 'duck',
    name: 'Qoder 智能体小鸭',
    evolution: 'AI 蜂群编队',
    description: '2 只赛博小鸭绕飞并发射追踪小弹幕；升级提升伤害与发射频率。',
    evolutionDescription: '升级为 6 只高速蜂群编队，以更高频率齐射追踪弹幕。',
    icon: 'duck',
  },
};

export function weaponUpgrade(weapon: WeaponState): Upgrade {
  const definition = WEAPONS[weapon.id];
  if (weapon.level >= 5) {
    return {
      id: weapon.id,
      name: definition.evolution,
      category: '超武进化',
      description: definition.evolutionDescription,
      detail: `${definition.name} Lv.5 → 超武 · 已达最终形态`,
      icon: definition.icon,
      evolution: true,
    };
  }

  const nextLevel = weapon.level + 1;
  return {
    id: weapon.id,
    name: definition.name,
    category: weapon.level === 0 ? '获取武器' : '武器升级',
    description: definition.description,
    detail: weapon.level === 0
      ? '获得 Lv.1 · 最高 Lv.5，之后再次升级进化为超武'
      : `Lv.${weapon.level} → Lv.${nextLevel} · ${nextLevel === 5 ? '下次升级可进化为超武' : '强化武器性能'}`,
    icon: definition.icon,
  };
}
