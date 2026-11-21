import { BOSS_QUOTE, REVERSAL_QUOTE, STORY_EVENTS, STORY_NEWS } from '../data/events.ts';
import type { StoryEvent } from '../data/events.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import type { Enemy, EnemyKind, GameState, Point, SoundName, StoryState } from '../types/game.ts';
import { mulberry32 } from '../utils/prng.ts';

export interface StoryHooks {
  nextId: () => number;
  spawnEnemy: (kind: EnemyKind, at: Point, options?: Partial<Enemy>) => Enemy;
  damageEnemy: (enemy: Enemy, amount: number, canCrit?: boolean) => void;
  hurtPlayer: (amount: number) => void;
  dropSupply: (at: Point, source: string, core: boolean, newWeapon: boolean) => void;
  dropCrystal: (at: Point, value: number, heal?: number, attracted?: boolean) => void;
  charge: (amount: number) => void;
  onSound: (name: SoundName) => void;
  onNews: (text: string) => void;
}

const TAU = Math.PI * 2;
const EPSILON = 1e-8;
const RING_COUNT = 24;
const RING_RADIUS = 230;
const RING_MEMBER_RADIUS = 19;
const BULL_START = 130;
const BULL_END = 142;
const BULL_INTERVAL = 0.5;
const MAX_ENEMY_SHOTS = 100;
const CUT_LENGTH = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) * 2;

type Ring = NonNullable<StoryState['ring']>;
interface RingTrack { members: Enemy[]; previous: Point }
// Retain enemy references so an entity-cap eviction cannot masquerade as a kill.
const ringTracks = new WeakMap<Ring, RingTrack>();

export function initialStory(): StoryState {
  return {
    event: 'parking',
    news: STORY_NEWS.parking,
    fired: [],
    crashes: [],
    ring: null,
    blackoutUntil: 0,
    whiteFlash: 0,
    bullUntil: 0,
    nextBullSpawn: 0,
    bossId: null,
    bossPhase: 1,
    bossIntroUntil: 0,
    bossQuoteRemaining: 0,
    bossShotTimer: 0.45,
    bossCutTimer: 4,
    bossAngle: 0,
    cuts: [],
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointNear(at: Point, angle: number, radius: number, margin = 32): Point {
  return {
    x: clamp(at.x + Math.cos(angle) * radius, margin, WORLD_WIDTH - margin),
    y: clamp(at.y + Math.sin(angle) * radius, margin, WORLD_HEIGHT - margin),
  };
}

function farPoint(player: Point, margin: number): Point {
  const corners = [
    { x: margin, y: margin },
    { x: WORLD_WIDTH - margin, y: margin },
    { x: margin, y: WORLD_HEIGHT - margin },
    { x: WORLD_WIDTH - margin, y: WORLD_HEIGHT - margin },
  ];
  return corners.reduce((best, point) => distance(point, player) > distance(best, player) ? point : best);
}

function announce(state: GameState, hooks: StoryHooks, event: StoryState['event'], news = STORY_NEWS[event]): void {
  const changed = state.story.event !== event || state.story.news !== news;
  state.story.event = event;
  state.story.news = news;
  if (changed) hooks.onNews(news);
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
  const random = mulberry32(state.seed ^ 0x4b1d5a77 ^ Math.imul(wave + 1, 0x9e3779b9));
  for (let i = 0; i < 5 && state.story.crashes.length < 24; i++) {
    const at = i === 0 ? { ...state.player } : pointNear(state.player, random() * TAU, 110 + random() * 220, 64);
    state.story.crashes.push({ id: hooks.nextId(), x: at.x, y: at.y, radius: 58, delay: 1, life: 0.45, hit: false });
  }
  hooks.onSound('alarm');
}

function updateCrashes(state: GameState, dt: number, hooks: StoryHooks): void {
  for (const crash of state.story.crashes) {
    if (crash.hit) {
      crash.life = Math.max(0, crash.life - dt);
      continue;
    }
    crash.delay = Math.max(0, crash.delay - dt);
    if (crash.delay > EPSILON) continue;
    crash.delay = 0;
    crash.hit = true;
    state.shake = Math.max(state.shake, 0.25);
    if (distance(crash, state.player) <= crash.radius + state.player.radius) hooks.hurtPlayer(24);
    for (const enemy of [...state.enemies]) {
      if (enemy.hp > 0 && enemy.kind !== 'boss' && distance(crash, enemy) <= crash.radius + enemy.radius) {
        hooks.damageEnemy(enemy, 180, false);
      }
    }
    hooks.onSound('hit');
  }
  state.story.crashes = state.story.crashes.filter((crash) => !crash.hit || crash.life > 0);
}

function spawnRing(state: GameState, hooks: StoryHooks): void {
  if (state.time >= 80) return;
  const ring: Ring = {
    center: { x: state.player.x, y: state.player.y },
    radius: RING_RADIUS,
    remaining: 80 - state.time,
    memberIds: [],
    escaped: false,
  };
  const members: Enemy[] = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const angle = i * TAU / RING_COUNT;
    const enemy = hooks.spawnEnemy('reporter', {
      x: ring.center.x + Math.cos(angle) * ring.radius,
      y: ring.center.y + Math.sin(angle) * ring.radius,
    }, { hp: 105, maxHp: 105, radius: RING_MEMBER_RADIUS, phase: angle, ringMember: true });
    members.push(enemy);
    ring.memberIds.push(enemy.id);
  }
  ringTracks.set(ring, { members, previous: { x: state.player.x, y: state.player.y } });
  state.story.ring = ring;
}

function releaseRing(state: GameState, ring: Ring): void {
  for (const enemy of state.enemies) {
    if (ring.memberIds.includes(enemy.id)) enemy.ringMember = false;
  }
}

function updateRing(state: GameState, dt: number, worldDt: number, hooks: StoryHooks): void {
  const ring = state.story.ring;
  if (!ring) return;
  ring.remaining = Math.max(0, 80 - state.time);
  if (ring.remaining <= EPSILON) {
    releaseRing(state, ring);
    ringTracks.delete(ring);
    state.story.ring = null;
    if (!ring.escaped && state.story.event === 'paparazzi') announce(state, hooks, 'paparazzi', '围堵已解除，未能在10秒内杀出缺口；突围奖励未发放。');
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
      hooks.damageEnemy(enemy, enemy.hp, false);
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
  const clearGap = gap && gap.hp <= 0 && track.members.every((member) =>
    member.hp <= 0 || distance(member, crossing) > member.radius + state.player.radius,
  );
  track.previous = { x: state.player.x, y: state.player.y };
  if (!crossedOutward || !clearGap || state.story.fired.includes('paparazzi-escaped')) return;
  ring.escaped = true;
  state.story.fired.push('paparazzi-escaped');
  releaseRing(state, ring);
  attractCrystals(state);
  hooks.dropSupply(state.player, '狗仔突围强化宝箱', true, false);
  announce(state, hooks, 'paparazzi', '狗仔圆阵突破成功！全屏晶核吸附，强化宝箱已送达！');
  hooks.onSound('upgrade');
}

function spawnAssassins(state: GameState, wave: number, hooks: StoryHooks): void {
  if (state.time >= 117) return;
  const random = mulberry32(state.seed ^ 0x5e1a7309 ^ Math.imul(wave + 1, 0x85ebca6b));
  for (let i = 0; i < 5; i++) {
    const angle = i * TAU / 5 + random() * 0.5;
    const at = pointNear(state.player, angle, 290 + random() * 110);
    hooks.spawnEnemy('assassin', distance(at, state.player) < 180 ? farPoint(state.player, 40) : at,
      { hp: 95, maxHp: 95, radius: 15, speed: 112, phase: angle });
  }
}

function spawnBoss(state: GameState, hooks: StoryHooks): void {
  if (state.bossDefeated) return;
  const story = state.story;
  announce(state, hooks, 'boss');
  story.bossPhase = 1;
  story.bossAngle = 0;
  story.bossShotTimer = 0.45;
  story.bossCutTimer = 4;
  story.bossIntroUntil = 156;
  state.inventoryLockedUntil = Math.max(state.inventoryLockedUntil, 156);
  const boss = hooks.spawnEnemy('boss', farPoint(state.player, 150), {
    hp: 5600, maxHp: 5600, radius: 46, speed: 64, spawnGrace: 1, phase: 0,
  });
  story.bossId = boss.id;
  for (let i = 0; i < 4; i++) {
    const phase = i * TAU / 4;
    hooks.spawnEnemy('guard', { x: boss.x + Math.cos(phase) * 92, y: boss.y + Math.sin(phase) * 92 }, {
      hp: 220, maxHp: 220, radius: 18, phase, speed: 0, spawnGrace: 1,
    });
  }
  hooks.onSound('alarm');
}

function fireEvent(state: GameState, event: StoryEvent, hooks: StoryHooks): void {
  switch (event.id) {
    case 'legal-20':
    case 'legal-50':
      if (state.time < event.at + 5) hooks.spawnEnemy('legal', farPoint(state.player, 70), {
        hp: 240, maxHp: 240, radius: 25, speed: 88, attackCooldown: 1.8,
        supplyKey: event.id === 'legal-20' ? 'weapon-25' : 'weapon-55',
      });
      break;
    case 'weapon-25':
    case 'weapon-55':
      hooks.dropSupply(pointNear(state.player, -Math.PI / 2, 48), '冷血法务没收品', false, true);
      break;
    case 'crash-35':
    case 'crash-37':
    case 'crash-39':
    case 'crash-41':
      if (event.id === 'crash-35') announce(state, hooks, 'shortCrash');
      if (state.time < 43) spawnCrashWave(state, (event.at - 35) / 2, hooks);
      break;
    case 'paparazzi-70':
      announce(state, hooks, 'paparazzi');
      hooks.dropSupply(pointNear(state.player, -Math.PI / 2, 48), '突围应急空投', true, true);
      spawnRing(state, hooks);
      hooks.onSound('alarm');
      break;
    case 'blackout-105':
      announce(state, hooks, 'blackout');
      state.story.blackoutUntil = 117;
      state.inventoryLockedUntil = Math.max(state.inventoryLockedUntil, 106);
      spawnAssassins(state, 0, hooks);
      hooks.onSound('alarm');
      break;
    case 'assassins-108':
    case 'assassins-111':
    case 'assassins-114':
      spawnAssassins(state, (event.at - 105) / 3, hooks);
      break;
    case 'weapon-110':
      hooks.dropSupply(pointNear(state.player, -Math.PI / 2, 48), '停电应急空投', true, true);
      break;
    case 'power-117':
      state.story.blackoutUntil = 0;
      state.story.whiteFlash = 0.65;
      state.inventoryLockedUntil = Math.max(state.inventoryLockedUntil, 118);
      state.enemyProjectiles = [];
      for (const enemy of [...state.enemies]) {
        if (enemy.hp > 0 && enemy.kind !== 'boss') hooks.damageEnemy(enemy, enemy.hp + 1, false);
      }
      attractCrystals(state);
      hooks.dropSupply(state.player, '神殿复电强化补给', true, false);
      announce(state, hooks, 'parking', '神殿电力恢复！全屏清场，强化核心与全屏吸铁石已送达！');
      hooks.onSound('upgrade');
      break;
    case 'bull-130':
      announce(state, hooks, 'bull');
      state.story.bullUntil = BULL_END;
      state.story.nextBullSpawn = BULL_START;
      hooks.onSound('upgrade');
      break;
    case 'alarm-142':
      state.story.bullUntil = 0;
      state.enemies = state.enemies.filter((enemy) => enemy.kind !== 'bull');
      announce(state, hooks, 'alarm');
      hooks.onSound('alarm');
      break;
    case 'reversal-150':
      announce(state, hooks, 'alarm', REVERSAL_QUOTE);
      state.shake = Math.max(state.shake, 0.5);
      hooks.onSound('alarm');
      break;
    case 'boss-155':
      spawnBoss(state, hooks);
      break;
  }
}

function updateBulls(state: GameState, hooks: StoryHooks): void {
  const story = state.story;
  if (story.bullUntil <= 0 || state.time >= story.bullUntil) return;
  while (story.nextBullSpawn <= state.time + EPSILON && story.nextBullSpawn < BULL_END) {
    const index = Math.round((story.nextBullSpawn - BULL_START) / BULL_INTERVAL);
    const random = mulberry32(state.seed ^ 0x13bf7965 ^ Math.imul(index + 1, 0x9e3779b9));
    const at = { x: 70 + random() * (WORLD_WIDTH - 140), y: 70 + random() * (WORLD_HEIGHT - 140) };
    hooks.spawnEnemy('bull', at, { hp: 28, maxHp: 28, radius: 14, speed: 28, phase: random() * TAU });
    story.nextBullSpawn += BULL_INTERVAL;
  }
}

function spawnBossCuts(state: GameState, hooks: StoryHooks): void {
  const story = state.story;
  const index = story.fired.filter((id) => id.startsWith('boss-cut-')).length;
  story.fired.push(`boss-cut-${index}`);
  const random = mulberry32(state.seed ^ 0x630b28a5 ^ Math.imul(index + 1, 0x85ebca6b));
  const count = index % 2 === 0 ? 3 : 4;
  const rotation = random() * Math.PI;
  for (let i = 0; i < count && story.cuts.length < 8; i++) {
    story.cuts.push({
      id: hooks.nextId(),
      x: WORLD_WIDTH / 2 + (random() - 0.5) * 160,
      y: WORLD_HEIGHT / 2 + (random() - 0.5) * 120,
      angle: rotation + i * Math.PI / count,
      length: CUT_LENGTH, width: 24, delay: 1.2, life: 0.25, hit: false,
    });
  }
  hooks.onNews('资本长老会主席：空间切割蓄力，1.2秒后爆发！');
  hooks.onSound('alarm');
}

function updateCuts(state: GameState, worldDt: number, hooks: StoryHooks): void {
  if (worldDt <= 0) return;
  for (const cut of state.story.cuts) {
    if (cut.hit) {
      cut.life = Math.max(0, cut.life - worldDt);
      continue;
    }
    cut.delay = Math.max(0, cut.delay - worldDt);
    if (cut.delay > EPSILON) continue;
    cut.delay = 0;
    cut.hit = true;
    const dx = state.player.x - cut.x;
    const dy = state.player.y - cut.y;
    const along = dx * Math.cos(cut.angle) + dy * Math.sin(cut.angle);
    const across = -dx * Math.sin(cut.angle) + dy * Math.cos(cut.angle);
    const beyond = Math.max(0, Math.abs(along) - cut.length / 2);
    if (Math.hypot(beyond, across) <= state.player.radius + cut.width / 2) hooks.hurtPlayer(30);
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

function updateBoss(state: GameState, dt: number, worldDt: number, hooks: StoryHooks): void {
  const story = state.story;
  if (story.bossId === null) return;
  const boss = state.enemies.find((enemy) => enemy.id === story.bossId);
  if (!boss || boss.hp <= 0 || state.bossDefeated) {
    story.cuts = [];
    state.enemies = state.enemies.filter((enemy) => enemy.kind !== 'guard');
    return;
  }
  if (story.bossPhase === 1 && boss.hp < boss.maxHp * 0.5) {
    story.bossPhase = 2;
    story.fired.push('boss-phase-two');
    story.bossQuoteRemaining = 9;
    announce(state, hooks, 'boss', BOSS_QUOTE);
    story.bossCutTimer = 1.8;
    boss.speed = 76;
    state.enemies = state.enemies.filter((enemy) => enemy.kind !== 'guard');
    hooks.onSound('alarm');
  }
  const active = updateControlledEnemy(boss, dt, worldDt);
  const entering = state.time < story.bossIntroUntil;
  if (active && !entering) {
    story.bossAngle = (story.bossAngle + worldDt * 0.85) % TAU;
    const d = distance(boss, state.player);
    if (d > 1) {
      const travel = Math.min(d, boss.speed * bossMoveScale(state, boss) * worldDt);
      boss.x = clamp(boss.x + (state.player.x - boss.x) / d * travel, boss.radius, WORLD_WIDTH - boss.radius);
      boss.y = clamp(boss.y + (state.player.y - boss.y) / d * travel, boss.radius, WORLD_HEIGHT - boss.radius);
    }
    if (distance(boss, state.player) <= boss.radius + state.player.radius) hooks.hurtPlayer(22);
  }
  if (boss.hp <= 0 || state.bossDefeated) return;
  for (const guard of state.enemies) {
    if (guard.kind !== 'guard' || guard.hp <= 0) continue;
    const guardActive = updateControlledEnemy(guard, dt, worldDt);
    if (worldDt > 0 && !entering) {
      const angle = story.bossAngle + guard.phase;
      guard.x = boss.x + Math.cos(angle) * 92;
      guard.y = boss.y + Math.sin(angle) * 92;
    }
    if (guardActive && !entering && distance(guard, state.player) <= guard.radius + state.player.radius) hooks.hurtPlayer(16);
  }
  if (!active || entering || boss.hp <= 0 || state.bossDefeated) return;
  updateCuts(state, worldDt, hooks);
  if (story.bossPhase === 1) {
    story.bossShotTimer -= worldDt;
    if (story.bossShotTimer > EPSILON) return;
    story.bossShotTimer += 0.42;
    for (let i = 0; i < 4 && state.enemyProjectiles.length < MAX_ENEMY_SHOTS; i++) {
      const angle = story.bossAngle * 3 + i * TAU / 4;
      state.enemyProjectiles.push({
        id: hooks.nextId(), x: boss.x + Math.cos(angle) * 48, y: boss.y + Math.sin(angle) * 48,
        vx: Math.cos(angle) * 155, vy: Math.sin(angle) * 155,
        radius: 9, damage: 16, life: 7, shape: 'document', rotation: angle,
      });
    }
  } else {
    story.bossCutTimer -= worldDt;
    if (story.bossCutTimer <= EPSILON) {
      story.bossCutTimer += 4;
      spawnBossCuts(state, hooks);
    }
  }
}

function enterEndless(state: GameState, hooks: StoryHooks): void {
  const story = state.story;
  if (!story.fired.includes('endless')) {
    story.fired.push('endless');
    if (story.ring) ringTracks.delete(story.ring);
    state.enemies = state.enemies.filter((enemy) => enemy.id >= 0 && enemy.kind !== 'boss' && enemy.kind !== 'guard' && !enemy.ringMember);
    state.enemyProjectiles = [];
    if (state.inventoryLockedUntil === story.bossIntroUntil) state.inventoryLockedUntil = Math.min(state.inventoryLockedUntil, state.time);
    story.crashes = [];
    story.cuts = [];
    story.ring = null;
    story.blackoutUntil = 0;
    story.whiteFlash = 0;
    story.bullUntil = 0;
    story.nextBullSpawn = 0;
    story.bossId = null;
    story.bossPhase = 1;
    story.bossIntroUntil = 0;
    story.bossQuoteRemaining = 0;
    story.bossShotTimer = 0;
    story.bossCutTimer = 0;
    story.bossAngle = 0;
  }
  announce(state, hooks, 'endless');
}

export function updateStory(state: GameState, dt: number, worldDt: number, hooks: StoryHooks): void {
  const story = state.story;
  if (state.endless || story.fired.includes('endless')) {
    enterEndless(state, hooks);
    return;
  }
  story.whiteFlash = Math.max(0, story.whiteFlash - dt);
  if (story.bossQuoteRemaining > 0) {
    story.bossQuoteRemaining = Math.max(0, story.bossQuoteRemaining - dt);
    story.news = story.bossQuoteRemaining > 0 ? BOSS_QUOTE : STORY_NEWS.boss;
  }
  updateCrashes(state, dt, hooks);
  updateRing(state, dt, worldDt, hooks);
  for (const event of STORY_EVENTS) {
    if (state.time + EPSILON < event.at || story.fired.includes(event.id)) continue;
    story.fired.push(event.id);
    fireEvent(state, event, hooks);
  }
  updateBulls(state, hooks);
  updateBoss(state, dt, worldDt, hooks);
}
