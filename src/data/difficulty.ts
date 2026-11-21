import type { DifficultyId } from '../types/game.ts';

export interface DifficultyDefinition {
  id: DifficultyId;
  name: string;
  description: string;
  tagline: string;
  color: string;
  timeLimit: number;
  enemyHpMultiplier: number;
  enemySpeedMultiplier: number;
  enemyDamageMultiplier: number;
  bossHpMultiplier: number;
  bossAttackRate: number;
  bossProjectileSpeedMultiplier: number;
  bossDamageReduction: number;
}

export const DEFAULT_DIFFICULTY: DifficultyId = 'standard';

export const DIFFICULTIES: Record<DifficultyId, DifficultyDefinition> = {
  casual: {
    id: 'casual', name: '休闲', color: '#93cda6',
    timeLimit: 210,
    description: '敌人更温和，Boss 出招更从容，适合第一次闯塔。',
    tagline: '轻松突围 · 容错更高',
    enemyHpMultiplier: 0.9, enemySpeedMultiplier: 0.9, enemyDamageMultiplier: 0.75,
    bossHpMultiplier: 0.6, bossAttackRate: 0.8, bossProjectileSpeedMultiplier: 0.9, bossDamageReduction: 0.1,
  },
  standard: {
    id: 'standard', name: '标准', color: '#b6ed76',
    timeLimit: 210,
    description: '清怪与守关压力均衡，熟悉走位后挑战完整三层高塔。',
    tagline: '推荐开局 · 完整闯塔',
    enemyHpMultiplier: 1.1, enemySpeedMultiplier: 1, enemyDamageMultiplier: 1,
    bossHpMultiplier: 1, bossAttackRate: 1, bossProjectileSpeedMultiplier: 1, bossDamageReduction: 0.2,
  },
  hard: {
    id: 'hard', name: '困难', color: '#f4a36e',
    timeLimit: 270,
    description: 'Boss 更耐打，攻击更紧凑；留好通灵，及时躲开红色预警。',
    tagline: '更密集技能 · 更少容错',
    enemyHpMultiplier: 1.3, enemySpeedMultiplier: 1.1, enemyDamageMultiplier: 1.3,
    bossHpMultiplier: 1.65, bossAttackRate: 1.22, bossProjectileSpeedMultiplier: 1.1, bossDamageReduction: 0.3,
  },
  nightmare: {
    id: 'nightmare', name: '噩梦', color: '#ec7c91',
    timeLimit: 330,
    description: 'Boss 会持续压迫走位，每次失误都更疼；为熟练玩家准备。',
    tagline: '极限挑战 · 连续高压',
    enemyHpMultiplier: 1.5, enemySpeedMultiplier: 1.18, enemyDamageMultiplier: 1.6,
    bossHpMultiplier: 2.5, bossAttackRate: 1.45, bossProjectileSpeedMultiplier: 1.2, bossDamageReduction: 0.4,
  },
};
