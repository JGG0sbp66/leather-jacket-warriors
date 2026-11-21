import { BOSS_DEFINITIONS, BOSS_QUOTE, REVERSAL_QUOTE, STORY_NEWS } from '../data/events.ts';
import { DUNGEON_MAPS } from '../data/dungeons.ts';
import { DIFFICULTIES } from '../data/difficulty.ts';
import { findOpenPoint, resolveDungeonCollision } from './DungeonSystem.ts';
import { BOSS_INTRO_DURATION, WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import type { BossType, Enemy, EnemyKind, GameState, Point, SoundName, StoryState } from '../types/game.ts';
import { mulberry32 } from '../utils/prng.ts';

export interface StoryHooks {
  nextId: () => number;
  spawnEnemy: (kind: EnemyKind, at: Point, options?: Partial<Enemy>) => Enemy;
  damageEnemy: (enemy: Enemy, amount: number, canCrit?: boolean) => void;
  hurtPlayer: (amount: number) => void;
  dropSupply: (at: Point, source: string, core: boolean, newWeapon: boolean, rare?: boolean) => void;
  dropCrystal: (at: Point, value: number, heal?: number, attracted?: boolean) => void;
  charge: (amount: number) => void;
  onSound: (name: SoundName) => void;
  onNews: (text: string) => void;
}

const TAU = Math.PI * 2;
const EPSILON = 1e-8;
const RING_COUNT = 24;
const RING_RADIUS = 230;
const RING_MEMBER_RADIUS = 18;
const MAX_ENEMY_SHOTS = 100;
const CUT_LENGTH = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) * 2;

type Ring = NonNullable<StoryState['ring']>;
interface RingTrack { members: Enemy[]; previous: Point }
const ringTracks = new WeakMap<Ring, RingTrack>();

export function initialStory(): StoryState {
  return {
    event: 'parking', news: STORY_NEWS.parking, fired: [], crashes: [], ring: null,
    blackoutUntil: 0, whiteFlash: 0, bullUntil: 0, nextBullSpawn: 0,
    bossId: null, bossDeath: null, bossType: null, bossName: '', bossTitle: '', bossIntroText: '', bossQuoteText: '',
    bossIntroStart: 0, bossLanding: null, bossPhaseGuardUntil: 0, bossPhaseGuardRemaining: 0,
    bossPhase: 1, bossIntroUntil: 0, bossQuoteRemaining: 0,
    bossShotTimer: 0.6, bossCutTimer: 4, bossAngle: 0, cuts: [],
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointNear(at: Point, angle: number, radius: number, margin = 32): Point {
  return { x: clamp(at.x + Math.cos(angle) * radius, margin, WORLD_WIDTH - margin),
    y: clamp(at.y + Math.sin(angle) * radius, margin, WORLD_HEIGHT - margin) };
}

function farPoint(player: Point, margin: number): Point {
  const corners = [{ x: margin, y: margin }, { x: WORLD_WIDTH - margin, y: margin },
    { x: margin, y: WORLD_HEIGHT - margin }, { x: WORLD_WIDTH - margin, y: WORLD_HEIGHT - margin }];
  return corners.reduce((best, point) => distance(point, player) > distance(best, player) ? point : best);
}

function announce(state: GameState, hooks: StoryHooks, event: StoryState['event'], news = STORY_NEWS[event]): void {
  const changed = state.story.event !== event || state.story.news !== news;
  state.story.event = event;
  state.story.news = news;
  if (changed) hooks.onNews(news);
}

function once(state: GameState, key: string, at: number, action: () => void): void {
  if (state.dungeon.floorTime + EPSILON < at || state.story.fired.includes(key)) return;
  state.story.fired.push(key);
  action();
}

function attractCrystals(state: GameState): void {
  for (const crystal of state.crystals) crystal.attracted = true;
}

function updateControlledEnemy(enemy: Enemy, dt: number, worldDt: number): boolean {
  enemy.flash = Math.max(0, enemy.flash - dt);
  enemy.motionTime += worldDt;
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - worldDt);
  const entering = enemy.spawnGrace > 0;
  enemy.spawnGrace = Math.max(0, enemy.spawnGrace - worldDt);
  return worldDt > 0 && !entering && enemy.hp > 0;
}

function spawnCrashWave(state: GameState, wave: number, hooks: StoryHooks): void {
  const random = mulberry32(state.seed ^ Math.imul(state.dungeon.floor, 0x27d4eb2f) ^ 0x4b1d5a77 ^ Math.imul(wave + 1, 0x9e3779b9));
  for (let i = 0; i < 5 && state.story.crashes.length < 24; i++) {
    const at = i === 0 ? { x: state.player.x, y: state.player.y } : pointNear(state.player, random() * TAU, 110 + random() * 220, 64);
    state.story.crashes.push({ id: hooks.nextId(), ...at, radius: 58, delay: 1, life: 0.45, hit: false });
  }
  hooks.onSound('alarm');
}

function updateCrashes(state: GameState, worldDt: number, hooks: StoryHooks): void {
  if (worldDt <= 0) return;
  for (const crash of state.story.crashes) {
    if (crash.hit) { crash.life = Math.max(0, crash.life - worldDt); continue; }
    crash.delay = Math.max(0, crash.delay - worldDt);
    if (crash.delay > EPSILON) continue;
    crash.delay = 0;
    crash.hit = true;
    state.shake = Math.max(state.shake, 0.25);
    if (distance(crash, state.player) <= crash.radius + state.player.radius) hooks.hurtPlayer(24 * state.dungeon.hazardDamageMultiplier);
    for (const enemy of [...state.enemies]) {
      if (enemy.hp > 0 && enemy.kind !== 'boss' && distance(crash, enemy) <= crash.radius + enemy.radius) hooks.damageEnemy(enemy, 180, false);
    }
    hooks.onSound('hit');
  }
  state.story.crashes = state.story.crashes.filter((crash) => !crash.hit || crash.life > 0);
}

function spawnRing(state: GameState, hooks: StoryHooks): void {
  const ring: Ring = {
    center: { x: clamp(state.player.x, 180, WORLD_WIDTH - 180), y: clamp(state.player.y, 180, WORLD_HEIGHT - 180) },
    radius: RING_RADIUS, remaining: 10, memberIds: [], escaped: false,
  };
  const members: Enemy[] = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const angle = i * TAU / RING_COUNT;
    const hp = 64 * state.dungeon.enemyHpMultiplier;
    const enemy = hooks.spawnEnemy('reporter', { x: ring.center.x + Math.cos(angle) * ring.radius, y: ring.center.y + Math.sin(angle) * ring.radius },
      { hp, maxHp: hp, radius: RING_MEMBER_RADIUS, phase: angle, ringMember: true, spawnGrace: 0.4 });
    members.push(enemy);
    ring.memberIds.push(enemy.id);
  }
  ringTracks.set(ring, { members, previous: { x: state.player.x, y: state.player.y } });
  state.story.ring = ring;
}

function releaseRing(state: GameState, ring: Ring): void {
  for (const enemy of state.enemies) if (ring.memberIds.includes(enemy.id)) enemy.ringMember = false;
}

function updateRing(state: GameState, dt: number, worldDt: number, hooks: StoryHooks): void {
  const ring = state.story.ring;
  if (!ring) return;
  ring.remaining = Math.max(0, ring.remaining - dt);
  if (ring.remaining <= EPSILON) {
    releaseRing(state, ring);
    ringTracks.delete(ring);
    state.story.ring = null;
    if (!ring.escaped && state.story.event === 'paparazzi') announce(state, hooks, 'paparazzi', '闪光灯围堵已解除，继续清怪；本次突围奖励未领取。');
    return;
  }
  if (ring.escaped) return;
  const track = ringTracks.get(ring);
  const previousRadius = ring.radius;
  ring.radius = Math.max(90, ring.radius - 14 * worldDt);
  for (const enemy of state.enemies) {
    if (!enemy.ringMember || enemy.hp <= 0 || !ring.memberIds.includes(enemy.id)) continue;
    const active = updateControlledEnemy(enemy, dt, worldDt);
    if (state.effects.wall > 0 && distance(enemy, state.player) < 74 * (state.hexes.includes('wide') ? 1.35 : 1) + enemy.radius) {
      hooks.damageEnemy(enemy, enemy.hp + 1, false);
      continue;
    }
    if (worldDt > 0) {
      enemy.x = ring.center.x + Math.cos(enemy.phase) * ring.radius;
      enemy.y = ring.center.y + Math.sin(enemy.phase) * ring.radius;
    }
    if (active && distance(enemy, state.player) <= enemy.radius + state.player.radius) hooks.hurtPlayer(12);
  }
  if (!track || state.player.hp <= 0) return;
  const before = distance(track.previous, ring.center);
  const after = distance(state.player, ring.center);
  const margin = state.player.radius + RING_MEMBER_RADIUS;
  const crossedOutward = after > before + EPSILON && before <= previousRadius + margin && after > ring.radius + margin;
  const angle = (Math.atan2(state.player.y - ring.center.y, state.player.x - ring.center.x) + TAU) % TAU;
  const slot = Math.round(angle * RING_COUNT / TAU) % RING_COUNT;
  const gap = track.members[slot];
  const crossing = { x: ring.center.x + Math.cos(angle) * ring.radius, y: ring.center.y + Math.sin(angle) * ring.radius };
  const clearGap = gap && gap.hp <= 0 && track.members.every((member) => member.hp <= 0 || distance(member, crossing) > member.radius + state.player.radius);
  track.previous = { x: state.player.x, y: state.player.y };
  if (!crossedOutward || !clearGap || state.story.fired.includes('paparazzi-escaped')) return;
  ring.escaped = true;
  state.story.fired.push('paparazzi-escaped');
  releaseRing(state, ring);
  attractCrystals(state);
  hooks.dropSupply(state.player, '闪光灯突围 · 武器升级经验箱', true, false);
  hooks.dropCrystal(state.player, 30, 0, true);
  hooks.charge(12);
  announce(state, hooks, 'paparazzi', '闪光灯包围网突破成功！全屏吸铁石与武器升级经验箱已送达！');
  hooks.onSound('upgrade');
}

function spawnBlackoutWave(state: GameState, wave: number, hooks: StoryHooks): void {
  const random = mulberry32(state.seed ^ Math.imul(state.dungeon.floor, 0x27d4eb2f) ^ 0x5e1a7309 ^ Math.imul(wave + 1, 0x85ebca6b));
  for (let i = 0; i < 4; i++) {
    const angle = i * TAU / 4 + random() * 0.5;
    let at = pointNear(state.player, angle, 300 + random() * 90);
    if (distance(at, state.player) < 170) at = farPoint(state.player, 60);
    const hp = 85 * state.dungeon.enemyHpMultiplier;
    hooks.spawnEnemy('ghost', at, { hp, maxHp: hp, radius: 15, speed: 95 * state.dungeon.enemySpeedMultiplier, phase: angle, attackCooldown: 3 });
  }
}

function spawnElite(state: GameState, hooks: StoryHooks): void {
  const map = state.dungeon.map;
  const kind: EnemyKind = map === 'plaza' ? 'captain' : map === 'cryo' || map === 'darknet' ? 'ghost' : 'ironGuard';
  const baseHp = kind === 'captain' ? 260 : kind === 'ghost' ? 440 : 850;
  const hp = baseHp * state.dungeon.enemyHpMultiplier;
  const at = findOpenPoint(state.dungeon, farPoint(state.player, 95), 30);
  hooks.spawnEnemy(kind, at, {
    hp, maxHp: hp, radius: kind === 'captain' ? 24 : kind === 'ghost' ? 23 : 30,
    speed: (kind === 'ghost' ? 90 : kind === 'captain' ? 70 : 65) * state.dungeon.enemySpeedMultiplier,
    attackCooldown: kind === 'ghost' ? 2.5 : 2,
    chargeAngle: Math.atan2(state.player.y - at.y, state.player.x - at.x),
    supplyKey: kind === 'captain' ? 'captain-supply' : kind === 'ghost' ? 'ghost-supply' : 'iron-supply',
  });
  hooks.onNews(kind === 'captain' ? '外围保安队长登场！正面显卡飞镖伤害减半，绕背或用铲子、力场破盾；击杀获得第2把武器！'
    : kind === 'ghost' ? '数据审计幽灵正在巡查机柜！击杀暗影精英，获得第3把武器补给。'
      : '董事会铁卫进入黄金圣殿！击杀可获得海量通灵能量与武器匣补给。');
}

function restorePower(state: GameState, hooks: StoryHooks): void {
  state.story.blackoutUntil = 0;
  state.story.whiteFlash = 0.65;
  state.enemyProjectiles = [];
  for (const enemy of [...state.enemies]) {
    if (enemy.hp > 0 && enemy.kind !== 'boss') hooks.damageEnemy(enemy, enemy.hp + 1, false);
  }
  attractCrystals(state);
  hooks.dropSupply(state.player, '暗网复电 · 稀有武器箱', true, true, true);
  announce(state, hooks, 'parking', '地下电力恢复！闪白清场、全屏吸铁石与稀有武器已送达，按 B 查看武器匣。');
  hooks.onSound('upgrade');
}

function updateBulls(state: GameState, hooks: StoryHooks): void {
  const story = state.story;
  if (story.bullUntil <= state.time) return;
  while (story.nextBullSpawn <= state.time + EPSILON && story.nextBullSpawn < story.bullUntil) {
    const index = Math.round((story.nextBullSpawn - (story.bullUntil - 15)) / 0.55);
    const random = mulberry32(state.seed ^ Math.imul(state.dungeon.floor, 0x27d4eb2f) ^ 0x13bf7965 ^ Math.imul(index + 1, 0x9e3779b9));
    for (let i = 0; i < 3; i++) {
      const at = findOpenPoint(state.dungeon, { x: 70 + random() * (WORLD_WIDTH - 140), y: 70 + random() * (WORLD_HEIGHT - 140) }, 16);
      hooks.spawnEnemy('bull', at, { hp: 24, maxHp: 24, radius: 14, speed: 60, phase: random() * TAU, spawnGrace: 0.1 });
    }
    story.nextBullSpawn += 0.55;
  }
}

function floorEvents(state: GameState, hooks: StoryHooks): void {
  const dungeon = state.dungeon;
  const config = DUNGEON_MAPS[dungeon.map];
  once(state, 'floor-elite', config.eliteAt, () => spawnElite(state, hooks));
  if (dungeon.map === 'plaza') {
    once(state, 'paparazzi', config.eventAt, () => {
      announce(state, hooks, 'paparazzi');
      spawnRing(state, hooks);
      hooks.onSound('alarm');
    });
  } else if (dungeon.map === 'cryo') {
    once(state, 'cold-pipes', config.eventAt, () => {
      dungeon.coolantUntil = state.time + 20;
      announce(state, hooks, 'cryo');
      hooks.onSound('alarm');
    });
    once(state, 'cold-ended', config.eventAt + 20, () => {
      dungeon.coolantUntil = 0;
      if (state.story.event === 'cryo') announce(state, hooks, 'parking', '液冷管道已封闭。利用机柜掩体与爆炸桶，击破法务总监！');
    });
  } else if (dungeon.map === 'darknet') {
    once(state, 'blackout', config.eventAt, () => {
      state.story.blackoutUntil = state.time + 12;
      state.inventoryLockedUntil = Math.max(state.inventoryLockedUntil, state.time + 1);
      announce(state, hooks, 'blackout');
      spawnBlackoutWave(state, 0, hooks);
      hooks.onSound('alarm');
    });
    for (let wave = 1; wave <= 3; wave++) once(state, 'blackout-wave-' + wave, config.eventAt + wave * 3, () => spawnBlackoutWave(state, wave, hooks));
    once(state, 'power-restored', config.eventAt + 12, () => restorePower(state, hooks));
  } else if (dungeon.map === 'temple') {
    once(state, 'bull-market', 10, () => {
      state.story.bullUntil = state.time + 15;
      state.story.nextBullSpawn = state.time;
      announce(state, hooks, 'bull');
      hooks.onSound('upgrade');
    });
    once(state, 'bull-close', 25, () => {
      state.story.bullUntil = 0;
      for (const enemy of state.enemies) if (enemy.kind === 'bull') enemy.hp = 0;
      state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
      attractCrystals(state);
      if (!state.endless && state.hexRound < 3) dungeon.pendingHex = true;
      announce(state, hooks, 'bull', '牛市狂欢收官！第三次海克斯强化已就绪，构筑成型后迎战恶意砸盘。');
    });
    once(state, 'reversal', 30, () => {
      announce(state, hooks, 'shortCrash', REVERSAL_QUOTE + ' 华尔街恶意砸盘，躲开做空K线陨石雨！');
      state.shake = Math.max(state.shake, 0.5);
      hooks.onSound('alarm');
    });
    for (let wave = 0; wave < 5; wave++) once(state, 'crash-wave-' + wave, 30 + wave * 2, () => spawnCrashWave(state, wave, hooks));
    once(state, 'final-boss-warning', 35, () => announce(state, hooks, 'alarm'));
  } else {
    once(state, 'singularity-overload', config.eventAt, () => {
      dungeon.coolantUntil = state.time + 16;
      announce(state, hooks, 'cryo', 'AI奇点过载！踩入蓝色冷却池倾泻火力，小心失控算力陨石！');
      hooks.onSound('alarm');
    });
    for (let wave = 0; wave < 4; wave++) once(state, 'singularity-crash-' + wave, config.eventAt + wave * 3, () => spawnCrashWave(state, wave, hooks));
  }
}

function spawnBoss(state: GameState, hooks: StoryHooks): void {
  const dungeon = state.dungeon;
  const story = state.story;
  const type: BossType = DUNGEON_MAPS[dungeon.map].bossType;
  const definition = BOSS_DEFINITIONS[type];
  const difficulty = DIFFICULTIES[state.difficulty];
  dungeon.phase = 'boss';
  dungeon.progress = 100;
  story.bossType = type;
  story.bossName = definition.name;
  story.bossTitle = definition.title;
  story.bossIntroText = definition.introText;
  story.bossQuoteText = definition.quoteText;
  story.bossPhase = 1;
  story.bossAngle = 0;
  story.bossShotTimer = (type === 'truck' ? 1.6 : 0.35) / difficulty.bossAttackRate;
  story.bossCutTimer = (type === 'truck' ? 0.7 : type === 'legal' ? 1.8 : 4) / difficulty.bossAttackRate;
  story.bossIntroStart = state.time;
  story.bossIntroUntil = state.time + BOSS_INTRO_DURATION;
  story.bossPhaseGuardUntil = 0;
  story.bossPhaseGuardRemaining = 0;
  state.inventoryLockedUntil = Math.max(state.inventoryLockedUntil, story.bossIntroUntil);
  const at = findOpenPoint(dungeon, farPoint(state.player, 150), definition.radius);
  story.bossLanding = { ...at };
  state.enemyProjectiles = [];
  const hp = Math.round(definition.hp * dungeon.enemyHpMultiplier * difficulty.bossHpMultiplier);
  const boss = hooks.spawnEnemy('boss', at, {
    hp, maxHp: hp, radius: definition.radius, speed: definition.speed * dungeon.enemySpeedMultiplier * difficulty.enemySpeedMultiplier,
    bossType: type, spawnGrace: 0, phase: 0, attackCooldown: 0,
  });
  story.bossId = boss.id;
  announce(state, hooks, type === 'truck' ? 'truck' : type === 'legal' ? 'legalBoss' : 'boss');
  if (type === 'chairman') {
    for (let i = 0; i < 4; i++) {
      const phase = i * TAU / 4;
      const guardHp = 600 * dungeon.enemyHpMultiplier;
      hooks.spawnEnemy('guard', { x: boss.x + Math.cos(phase) * 106, y: boss.y + Math.sin(phase) * 106 }, {
        hp: guardHp, maxHp: guardHp, radius: 19, phase, speed: 0, spawnGrace: 0,
      });
    }
  }
  hooks.onSound('alarm');
}

function spawnBossCuts(state: GameState, hooks: StoryHooks): void {
  const story = state.story;
  const index = story.fired.filter((id) => id.startsWith('boss-cut-')).length;
  story.fired.push('boss-cut-' + index);
  const random = mulberry32(state.seed ^ Math.imul(state.dungeon.floor, 0x27d4eb2f) ^ 0x630b28a5 ^ Math.imul(index + 1, 0x85ebca6b));
  const count = index % 2 === 0 ? 3 : 4;
  const rotation = random() * Math.PI;
  const horizontal = index % 2 === 0;
  for (let i = 0; i < count && story.cuts.length < 8; i++) {
    // Parallel slices always leave readable, continuous safe gaps.
    const offset = (i - (count - 1) / 2) * 155;
    story.cuts.push({
      id: hooks.nextId(), x: WORLD_WIDTH / 2 + (horizontal ? 0 : offset),
      y: WORLD_HEIGHT / 2 + (horizontal ? offset : 0),
      angle: horizontal ? 0 : Math.PI / 2 + rotation * 0.12,
      length: CUT_LENGTH, width: 24, delay: 1.2, life: 0.3, hit: false,
    });
  }
  hooks.onNews('强制退市切割：危！1.2秒后激光爆发，钻进红线之间的安全缝隙！');
  hooks.onSound('alarm');
}

function updateCuts(state: GameState, worldDt: number, hooks: StoryHooks): void {
  if (worldDt <= 0) return;
  for (const cut of state.story.cuts) {
    if (cut.hit) { cut.life = Math.max(0, cut.life - worldDt); continue; }
    cut.delay = Math.max(0, cut.delay - worldDt);
    if (cut.delay > EPSILON) continue;
    cut.delay = 0;
    cut.hit = true;
    const dx = state.player.x - cut.x;
    const dy = state.player.y - cut.y;
    const along = dx * Math.cos(cut.angle) + dy * Math.sin(cut.angle);
    const across = -dx * Math.sin(cut.angle) + dy * Math.cos(cut.angle);
    const beyond = Math.max(0, Math.abs(along) - cut.length / 2);
    if (Math.hypot(beyond, across) <= state.player.radius + cut.width / 2) hooks.hurtPlayer(30 * state.dungeon.hazardDamageMultiplier);
    state.shake = Math.max(state.shake, 0.2);
  }
  state.story.cuts = state.story.cuts.filter((cut) => !cut.hit || cut.life > 0);
}

function bossMoveScale(state: GameState, boss: Enemy): number {
  let scale = state.hexes.includes('overwork') ? 1.1 : 1;
  const field = state.equipped.includes('cuda') && state.weapons.some((weapon) => weapon.id === 'cuda' && weapon.evolved);
  const radius = 210 * (state.hexes.includes('wide') ? 1.35 : 1) + boss.radius;
  if (field && (distance(boss, state.player) < radius || (state.effects.clone && distance(boss, state.effects.clone) < radius))) scale *= 0.4;
  return scale;
}

function moveBoss(state: GameState, boss: Enemy, worldDt: number, targetDistance = 0): void {
  const d = distance(boss, state.player);
  if (d <= Math.max(1, targetDistance)) return;
  const previous = { x: boss.x, y: boss.y };
  const travel = Math.min(d - targetDistance, boss.speed * bossMoveScale(state, boss) * worldDt);
  boss.x = clamp(boss.x + (state.player.x - boss.x) / d * travel, boss.radius + 10, WORLD_WIDTH - boss.radius - 10);
  boss.y = clamp(boss.y + (state.player.y - boss.y) / d * travel, boss.radius + 10, WORLD_HEIGHT - boss.radius - 10);
  if (boss.bossType === 'truck') resolveDungeonCollision(state.dungeon, boss, previous);
}

function flashRing(state: GameState, boss: Enemy, hooks: StoryHooks): void {
  const speed = 170 * DIFFICULTIES[state.difficulty].bossProjectileSpeedMultiplier;
  for (let i = 0; i < 20 && state.enemyProjectiles.length < MAX_ENEMY_SHOTS; i++) {
    const angle = state.story.bossAngle + i * TAU / 20;
    state.enemyProjectiles.push({ id: hooks.nextId(), x: boss.x + Math.cos(angle) * 48, y: boss.y + Math.sin(angle) * 48,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: 7, damage: 12, life: 6, shape: 'flash', rotation: angle });
  }
}

function updateTruck(state: GameState, boss: Enemy, worldDt: number, hooks: StoryHooks): void {
  const story = state.story;
  const multiplier = bossMoveScale(state, boss);
  const attackRate = DIFFICULTIES[state.difficulty].bossAttackRate;
  if (boss.chargeState === 'aim') {
    boss.chargeTime -= worldDt;
    if (boss.chargeTime <= EPSILON) { boss.chargeState = 'dash'; boss.chargeTime = 0.65; }
  } else if (boss.chargeState === 'dash') {
    const previous = { x: boss.x, y: boss.y };
    boss.x = clamp(boss.x + Math.cos(boss.chargeAngle) * 750 * multiplier * worldDt, 60, WORLD_WIDTH - 60);
    boss.y = clamp(boss.y + Math.sin(boss.chargeAngle) * 750 * multiplier * worldDt, 60, WORLD_HEIGHT - 60);
    resolveDungeonCollision(state.dungeon, boss, previous);
    boss.chargeTime -= worldDt;
    if (boss.chargeTime <= EPSILON) {
      boss.chargeState = 'approach';
      story.bossCutTimer = 3.6 / attackRate;
      flashRing(state, boss, hooks);
      state.shake = Math.max(state.shake, 0.15);
    }
  } else {
    moveBoss(state, boss, worldDt, 150);
    story.bossCutTimer -= worldDt;
    if (story.bossCutTimer <= EPSILON) {
      boss.chargeState = 'aim';
      boss.chargeTime = 1;
      boss.chargeAngle = Math.atan2(state.player.y - boss.y, state.player.x - boss.x);
      hooks.onSound('alarm');
    }
    story.bossShotTimer -= worldDt;
    if (story.bossShotTimer <= EPSILON) { story.bossShotTimer += 5.2 / attackRate; flashRing(state, boss, hooks); }
  }
}

function updateLegalBoss(state: GameState, boss: Enemy, worldDt: number, hooks: StoryHooks): void {
  const story = state.story;
  const difficulty = DIFFICULTIES[state.difficulty];
  moveBoss(state, boss, worldDt, 240);
  story.bossShotTimer -= worldDt;
  if (story.bossShotTimer <= EPSILON) {
    story.bossShotTimer += 2.8 / difficulty.bossAttackRate;
    const aim = Math.atan2(state.player.y - boss.y, state.player.x - boss.x);
    for (let i = 0; i < 3 && state.enemyProjectiles.length < MAX_ENEMY_SHOTS; i++) {
      const angle = aim + (i - 1) * 0.3;
      state.enemyProjectiles.push({ id: hooks.nextId(), x: boss.x, y: boss.y,
        vx: Math.cos(angle) * 250 * difficulty.bossProjectileSpeedMultiplier, vy: Math.sin(angle) * 250 * difficulty.bossProjectileSpeedMultiplier, radius: 13, damage: 17,
        life: 5, shape: 'document', rotation: angle, ignoresObstacles: true,
        boomerang: { origin: { x: boss.x, y: boss.y }, returnAfter: 1.15, returning: false } });
    }
  }
  story.bossCutTimer -= worldDt;
  if (story.bossCutTimer > EPSILON) return;
  story.bossCutTimer += 8.5 / difficulty.bossAttackRate;
  const index = story.fired.filter((key) => key.startsWith('legal-fence-')).length;
  story.fired.push('legal-fence-' + index);
  for (let i = 0; i < 2; i++) {
    state.dungeon.lasers.push({
      id: hooks.nextId(), x: index % 2 === 0 ? 600 : i === 0 ? 470 : 730,
      y: index % 2 === 0 ? i === 0 ? 330 : 470 : 400,
      angle: index % 2 === 0 ? 0 : Math.PI / 2,
      length: index % 2 === 0 ? 480 : 320, width: 12,
      warning: 1.5, active: 0, cooldown: 0, source: 'boss',
    });
  }
  hooks.onNews('地牢封锁令：2道电子栅栏即将开启，持续5秒，绕向机柜外侧通道！');
  hooks.onSound('alarm');
}

export function triggerBossEnrage(state: GameState, boss: Enemy, hooks: StoryHooks): void {
  const story = state.story;
  if (boss.bossType !== 'chairman' || boss.hp <= 0 || story.bossPhase !== 1 || boss.hp > boss.maxHp * 0.5) return;
  story.bossPhase = 2;
  story.fired.push('boss-phase-two');
  story.bossQuoteRemaining = 9;
  story.bossQuoteText = BOSS_QUOTE;
  story.bossPhaseGuardUntil = state.time + 0.9;
  story.bossPhaseGuardRemaining = 0.9;
  story.bossCutTimer = 4.6 / DIFFICULTIES[state.difficulty].bossAttackRate;
  boss.speed *= 1.25;
  for (const guard of state.enemies) if (guard.kind === 'guard') guard.hp = 0;
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  announce(state, hooks, 'boss', BOSS_QUOTE);
  // Start the first warning during the brief phase transition, rather than after it.
  spawnBossCuts(state, hooks);
}

function updateChairman(state: GameState, boss: Enemy, dt: number, worldDt: number, hooks: StoryHooks): void {
  const story = state.story;
  const difficulty = DIFFICULTIES[state.difficulty];
  moveBoss(state, boss, worldDt);
  for (const guard of state.enemies) {
    if (guard.kind !== 'guard' || guard.hp <= 0) continue;
    const active = updateControlledEnemy(guard, dt, worldDt);
    if (worldDt > 0) {
      const angle = story.bossAngle * 2 + guard.phase;
      guard.x = boss.x + Math.cos(angle) * 106;
      guard.y = boss.y + Math.sin(angle) * 106;
    }
    if (active && distance(guard, state.player) <= guard.radius + state.player.radius) hooks.hurtPlayer(16);
  }
  story.bossShotTimer -= worldDt;
  if (story.bossShotTimer <= EPSILON) {
    story.bossShotTimer += (story.bossPhase === 1 ? 0.48 : 0.75) / difficulty.bossAttackRate;
    for (let i = 0; i < 4 && state.enemyProjectiles.length < MAX_ENEMY_SHOTS; i++) {
      const angle = story.bossAngle * 3 + i * TAU / 4;
      state.enemyProjectiles.push({ id: hooks.nextId(), x: boss.x + Math.cos(angle) * 64, y: boss.y + Math.sin(angle) * 64,
        vx: Math.cos(angle) * 175 * difficulty.bossProjectileSpeedMultiplier, vy: Math.sin(angle) * 175 * difficulty.bossProjectileSpeedMultiplier, radius: 9, damage: 16, life: 7, shape: 'document', rotation: angle });
    }
  }
  if (story.bossPhase === 2) {
    story.bossCutTimer -= worldDt;
    if (story.bossCutTimer <= EPSILON) { story.bossCutTimer += 4.6 / difficulty.bossAttackRate; spawnBossCuts(state, hooks); }
  }
}

function updateBoss(state: GameState, dt: number, worldDt: number, hooks: StoryHooks): void {
  const story = state.story;
  if (state.dungeon.phase !== 'boss' || story.bossId === null) return;
  const boss = state.enemies.find((enemy) => enemy.id === story.bossId && enemy.hp > 0);
  if (!boss) return;
  triggerBossEnrage(state, boss, hooks);
  const active = updateControlledEnemy(boss, dt, worldDt);
  if (state.time < story.bossIntroUntil) return;
  if (story.bossPhaseGuardRemaining > 0) {
    story.bossPhaseGuardRemaining = Math.max(0, story.bossPhaseGuardRemaining - worldDt);
    story.bossPhaseGuardUntil = state.time + story.bossPhaseGuardRemaining;
  }
  updateCuts(state, worldDt, hooks);
  if (!active || story.bossPhaseGuardRemaining > 0) return;
  story.bossAngle = (story.bossAngle + worldDt * 0.85 * DIFFICULTIES[state.difficulty].bossAttackRate) % TAU;
  if (boss.bossType === 'truck') updateTruck(state, boss, worldDt, hooks);
  else if (boss.bossType === 'legal') updateLegalBoss(state, boss, worldDt, hooks);
  else updateChairman(state, boss, dt, worldDt, hooks);
  if (distance(boss, state.player) <= boss.radius + state.player.radius) hooks.hurtPlayer(boss.chargeState === 'dash' ? 26 : 20);
}

export function updateStory(state: GameState, dt: number, worldDt: number, hooks: StoryHooks): void {
  const story = state.story;
  story.whiteFlash = Math.max(0, story.whiteFlash - dt);
  if (story.bossQuoteRemaining > 0) {
    story.bossQuoteRemaining = Math.max(0, story.bossQuoteRemaining - dt);
    if (story.bossQuoteRemaining <= 0 && story.bossType === 'chairman') story.news = STORY_NEWS.boss;
  }
  if (state.dungeon.phase === 'portal' || state.dungeon.phase === 'transition') return;
  updateCrashes(state, worldDt, hooks);
  updateRing(state, dt, worldDt, hooks);
  if (state.dungeon.phase === 'clearing') {
    floorEvents(state, hooks);
    updateBulls(state, hooks);
    const config = DUNGEON_MAPS[state.dungeon.map];
    const rawProgress = state.dungeon.floorTime / config.bossAt * 100 + state.dungeon.killProgress;
    state.dungeon.progress = Math.min(state.dungeon.floorTime < config.earliestBossAt ? 99 : 100, rawProgress);
    if (state.dungeon.progress >= 100 && state.dungeon.floorTime + EPSILON >= config.earliestBossAt) spawnBoss(state, hooks);
  }
  updateBoss(state, dt, worldDt, hooks);
}

