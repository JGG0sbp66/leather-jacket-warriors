import { DUNGEON_AFFIXES, DUNGEON_MAPS } from '../data/dungeons.ts';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import type {
  DungeonBarrel, DungeonBranch, DungeonLaser, DungeonMap, DungeonObstacle,
  DungeonPortal, DungeonState, Enemy, GameState, Point, SoundName,
} from '../types/game.ts';
import { mulberry32 } from '../utils/prng.ts';

export interface DungeonHooks {
  nextId: () => number;
  damageEnemy: (enemy: Enemy, amount: number, canCrit?: boolean) => void;
  hurtPlayer: (amount: number) => void;
  dropCrystal: (at: Point, value: number, heal?: number, attracted?: boolean) => void;
  onSound: (name: SoundName) => void;
  onNews: (text: string) => void;
}

const TAU = Math.PI * 2;
const EPSILON = 1e-8;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function circleIntersectsObstacle(point: Point, radius: number, obstacle: DungeonObstacle): boolean {
  const nearestX = clamp(point.x, obstacle.x - obstacle.width / 2, obstacle.x + obstacle.width / 2);
  const nearestY = clamp(point.y, obstacle.y - obstacle.height / 2, obstacle.y + obstacle.height / 2);
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2 < radius ** 2;
}

/** Resolve circular bodies against the cabinets; world bounds remain the caller's responsibility. */
export function resolveDungeonCollision(dungeon: DungeonState, body: Point & { radius: number }, previous?: Point): void {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const obstacle of dungeon.obstacles) {
      const left = obstacle.x - obstacle.width / 2;
      const right = obstacle.x + obstacle.width / 2;
      const top = obstacle.y - obstacle.height / 2;
      const bottom = obstacle.y + obstacle.height / 2;
      const nearestX = clamp(body.x, left, right);
      const nearestY = clamp(body.y, top, bottom);
      const dx = body.x - nearestX;
      const dy = body.y - nearestY;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared >= body.radius * body.radius) continue;
      if (lengthSquared > EPSILON * EPSILON) {
        const length = Math.sqrt(lengthSquared);
        const penetration = body.radius - length + 0.01;
        body.x += dx / length * penetration;
        body.y += dy / length * penetration;
      } else if (previous && previous.x <= left - body.radius) {
        body.x = left - body.radius - 0.01;
      } else if (previous && previous.x >= right + body.radius) {
        body.x = right + body.radius + 0.01;
      } else if (previous && previous.y <= top - body.radius) {
        body.y = top - body.radius - 0.01;
      } else if (previous && previous.y >= bottom + body.radius) {
        body.y = bottom + body.radius + 0.01;
      } else {
        const exits = [
          { distance: body.x - left + body.radius, x: left - body.radius - 0.01, y: body.y },
          { distance: right - body.x + body.radius, x: right + body.radius + 0.01, y: body.y },
          { distance: body.y - top + body.radius, x: body.x, y: top - body.radius - 0.01 },
          { distance: bottom - body.y + body.radius, x: body.x, y: bottom + body.radius + 0.01 },
        ];
        const exit = exits.reduce((best, option) => option.distance < best.distance ? option : best);
        body.x = exit.x;
        body.y = exit.y;
      }
      moved = true;
    }
    if (!moved) break;
  }
}

export function findOpenPoint(dungeon: DungeonState, at: Point, radius = 20): Point {
  const margin = radius + 24;
  const body = {
    x: clamp(at.x, margin, WORLD_WIDTH - margin),
    y: clamp(at.y, margin, WORLD_HEIGHT - margin),
    radius,
  };
  resolveDungeonCollision(dungeon, body);
  body.x = clamp(body.x, margin, WORLD_WIDTH - margin);
  body.y = clamp(body.y, margin, WORLD_HEIGHT - margin);
  if (!dungeon.obstacles.some((obstacle) => circleIntersectsObstacle(body, radius, obstacle))) {
    return { x: body.x, y: body.y };
  }
  // Bounded radial search also makes this helper safe for large boss/drop spawn radii.
  for (let ring = 1; ring <= 10; ring++) {
    for (let i = 0; i < 12; i++) {
      const angle = i * TAU / 12;
      const point = {
        x: clamp(at.x + Math.cos(angle) * ring * 32, margin, WORLD_WIDTH - margin),
        y: clamp(at.y + Math.sin(angle) * ring * 32, margin, WORLD_HEIGHT - margin),
      };
      if (!dungeon.obstacles.some((obstacle) => circleIntersectsObstacle(point, radius, obstacle))) return point;
    }
  }
  return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
}

/** First intersection on a swept projectile segment, including its hit radius. */
export function projectileObstacleHit(dungeon: DungeonState, start: Point, end: Point, radius: number): number | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const movingX = Math.abs(dx) >= EPSILON;
  const movingY = Math.abs(dy) >= EPSILON;
  const inverseX = movingX ? 1 / dx : 0;
  const inverseY = movingY ? 1 / dy : 0;
  const segmentLeft = Math.min(start.x, end.x);
  const segmentRight = Math.max(start.x, end.x);
  const segmentTop = Math.min(start.y, end.y);
  const segmentBottom = Math.max(start.y, end.y);
  let first: number | null = null;
  for (const obstacle of dungeon.obstacles) {
    const left = obstacle.x - obstacle.width / 2 - radius;
    const right = obstacle.x + obstacle.width / 2 + radius;
    const top = obstacle.y - obstacle.height / 2 - radius;
    const bottom = obstacle.y + obstacle.height / 2 + radius;
    if (segmentRight < left || segmentLeft > right || segmentBottom < top || segmentTop > bottom) continue;
    let enter = 0;
    let leave = 1;
    if (!movingX) {
      if (start.x < left || start.x > right) continue;
    } else {
      let near = (left - start.x) * inverseX;
      let far = (right - start.x) * inverseX;
      if (near > far) { const swap = near; near = far; far = swap; }
      enter = Math.max(enter, near);
      leave = Math.min(leave, far);
      if (enter > leave) continue;
    }
    if (!movingY) {
      if (start.y < top || start.y > bottom) continue;
    } else {
      let near = (top - start.y) * inverseY;
      let far = (bottom - start.y) * inverseY;
      if (near > far) { const swap = near; near = far; far = swap; }
      enter = Math.max(enter, near);
      leave = Math.min(leave, far);
      if (enter > leave) continue;
    }
    if (leave >= 0 && enter <= 1 && (first === null || enter < first)) first = clamp(enter, 0, 1);
  }
  return first;
}

function makeLaser(id: number, x: number, y: number, angle: number, length: number, cooldown: number): DungeonLaser {
  return { id, x, y, angle, length, width: 10, warning: 0, active: 0, cooldown, source: 'security' };
}

export function nextEndlessMap(seed: number, floor: number): DungeonMap {
  if (floor <= 4) return 'singularity';
  const random = mulberry32(seed ^ 0x64c56fe9 ^ Math.imul(floor, 0x9e3779b9));
  const maps: DungeonMap[] = ['cryo', 'darknet', 'temple', 'plaza', 'singularity'];
  return maps[Math.floor(random() * maps.length)];
}

export function createDungeon(
  seed: number, map: DungeonMap = 'plaza', floor = 1,
  branch: DungeonBranch | null = null, floorsCleared = 0,
): DungeonState {
  const mapIndex = ['plaza', 'cryo', 'darknet', 'temple', 'singularity'].indexOf(map);
  const random = mulberry32(seed ^ 0xa845c721 ^ Math.imul(floor, 0x85ebca6b) ^ Math.imul(mapIndex + 1, 0x27d4eb2f));
  const depth = Math.max(0, floor - 3);
  const affixes: string[] = [];
  if (floor >= 4) {
    const pool: string[] = [...DUNGEON_AFFIXES];
    const count = floor >= 7 ? 2 : 1;
    for (let i = 0; i < count; i++) affixes.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  const dungeon: DungeonState = {
    floor, map, name: DUNGEON_MAPS[map].name, branch,
    phase: 'clearing', floorTime: 0, progress: 0, killProgress: 0, kills: 0,
    floorsCleared, pendingHex: false, transition: 0,
    obstacles: [], barrels: [], pools: [], lasers: [], portals: [],
    coolantUntil: 0, playerInCoolant: false, affixes,
    enemyHpMultiplier: (1 + depth * 0.24) * (affixes.includes('协议装甲') ? 1.32 : 1),
    enemySpeedMultiplier: Math.min(1.7, 1 + depth * 0.055) * (affixes.includes('狂暴超频') ? 1.22 : 1),
    hazardDamageMultiplier: (1 + depth * 0.06) * (affixes.includes('高压陷阱') ? 1.4 : 1),
  };
  const room = map === 'cryo' || map === 'darknet' || map === 'singularity';
  let id = floor * 1000;
  if (room) {
    const columns: Point[] = [{ x: 320, y: 250 }, { x: 880, y: 250 }, { x: 320, y: 550 }, { x: 880, y: 550 }];
    const middleCount = Math.floor(random() * 3);
    if (middleCount >= 1) columns.push({ x: 600, y: 235 });
    if (middleCount >= 2) columns.push({ x: 600, y: 565 });
    dungeon.obstacles = columns.map((point) => ({ ...point, id: id++, width: 96, height: 138 }));
    dungeon.lasers = [
      makeLaser(id++, 460, 250, 0, 184, 4.5 + random() * 2),
      makeLaser(id++, 740, 550, 0, 184, 7 + random() * 2),
      makeLaser(id++, 600, 400, Math.PI / 2, 192, 10 + random() * 2),
    ];
  }
  if (affixes.includes('高压陷阱')) {
    dungeon.lasers.push(makeLaser(id++, 200, 400, Math.PI / 2, 280, 3.5));
    dungeon.lasers.push(makeLaser(id++, 1000, 400, Math.PI / 2, 280, 6));
  }
  if (room || affixes.includes('连锁过载')) {
    const count = 6 + Math.floor(random() * 3) + (affixes.includes('连锁过载') ? 3 : 0);
    for (let i = 0; i < count; i++) {
      let point: Point | null = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        const candidate = { x: 110 + random() * (WORLD_WIDTH - 220), y: 110 + random() * (WORLD_HEIGHT - 220) };
        if (distance(candidate, { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }) < 100) continue;
        if (dungeon.obstacles.some((obstacle) => circleIntersectsObstacle(candidate, 34, obstacle))) continue;
        if (dungeon.barrels.some((barrel) => distance(candidate, barrel) < 65)) continue;
        point = candidate;
        break;
      }
      if (!point) continue;
      const hp = 32 + depth * 3;
      dungeon.barrels.push({ ...point, id: id++, radius: 18, hp, maxHp: hp, flash: 0, explosion: 0, explosionRadius: affixes.includes('连锁过载') ? 168 : 132 });
    }
  }
  if (map === 'cryo' || map === 'singularity') {
    const locations = [{ x: 445, y: 400 }, { x: 755, y: 400 }, { x: 600, y: 660 }, { x: 600, y: 120 }];
    dungeon.pools = locations.map((at) => ({ ...findOpenPoint(dungeon, at, 45), id: id++, radius: 68 + random() * 12 }));
  }
  return dungeon;
}

function withinLaser(point: Point, radius: number, laser: DungeonLaser): boolean {
  const dx = point.x - laser.x;
  const dy = point.y - laser.y;
  const along = dx * Math.cos(laser.angle) + dy * Math.sin(laser.angle);
  const across = -dx * Math.sin(laser.angle) + dy * Math.cos(laser.angle);
  const beyond = Math.max(0, Math.abs(along) - laser.length / 2);
  return Math.hypot(across, beyond) <= radius + laser.width / 2;
}

export function updateDungeonEnvironment(state: GameState, dt: number, worldDt: number, hooks: DungeonHooks): void {
  const dungeon = state.dungeon;
  const combat = dungeon.phase === 'clearing' || dungeon.phase === 'boss';
  dungeon.playerInCoolant = combat && dungeon.coolantUntil > state.time
    && dungeon.pools.some((pool) => distance(pool, state.player) <= pool.radius + state.player.radius * 0.4);
  for (const barrel of dungeon.barrels) {
    barrel.flash = Math.max(0, barrel.flash - dt);
    barrel.explosion = Math.max(0, barrel.explosion - worldDt);
  }
  if (!combat || worldDt <= 0) return;
  for (const laser of dungeon.lasers) {
    if (laser.warning > 0) {
      laser.warning = Math.max(0, laser.warning - worldDt);
      if (laser.warning <= EPSILON) { laser.warning = 0; laser.active = laser.source === 'boss' ? 5 : 3; }
    } else if (laser.active > 0) {
      laser.active = Math.max(0, laser.active - worldDt);
      if (laser.active <= EPSILON) {
        laser.active = 0;
        if (laser.source === 'security') {
          // A fixed floor/id derived cooldown preserves seeded replay without an extra PRNG stream.
          laser.cooldown = 4 + ((laser.id * 7) % 4);
        }
      }
    } else if (laser.source === 'security') {
      laser.cooldown = Math.max(0, laser.cooldown - worldDt);
      if (laser.cooldown <= EPSILON) { laser.warning = 1.5; hooks.onSound('alarm'); }
    }
    if (laser.active > 0 && laser.warning <= 0 && withinLaser(state.player, state.player.radius, laser)) {
      hooks.hurtPlayer(14 * dungeon.hazardDamageMultiplier);
    }
  }
  dungeon.lasers = dungeon.lasers.filter((laser) => laser.source === 'security' || laser.warning > 0 || laser.active > 0);
}

function explosionParticles(state: GameState, at: Point): void {
  for (let i = 0; i < 12 && state.particles.length < 180; i++) {
    const angle = i * TAU / 12;
    const speed = 75 + (i % 3) * 45;
    state.particles.push({ ...at, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 0.4, maxLife: 0.4, size: 3 + i % 2, color: i % 2 ? '#a6f17a' : '#ff986f' });
  }
}

export function damageBarrel(state: GameState, barrel: DungeonBarrel, amount: number, hooks: DungeonHooks): void {
  if (barrel.hp <= 0 || amount <= 0 || !Number.isFinite(amount)) return;
  barrel.hp = Math.max(0, barrel.hp - amount);
  barrel.flash = 0.1;
  if (barrel.hp > 0) return;
  const dungeon = state.dungeon;
  const queue = [barrel];
  let explosions = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    current.explosion = 0.55;
    current.flash = 0;
    explosions++;
    state.shake = Math.max(state.shake, 0.22);
    explosionParticles(state, current);
    const damage = 160 + dungeon.floor * 28;
    for (const enemy of [...state.enemies]) {
      if (enemy.hp <= 0 || distance(enemy, current) > current.explosionRadius + enemy.radius) continue;
      hooks.damageEnemy(enemy, damage, false);
      if (enemy.hp <= 0 || enemy.kind === 'boss' || enemy.kind === 'guard' || enemy.kind === 'fan' || enemy.ringMember) continue;
      const angle = Math.atan2(enemy.y - current.y, enemy.x - current.x);
      const previous = { x: enemy.x, y: enemy.y };
      enemy.x += Math.cos(angle) * 38;
      enemy.y += Math.sin(angle) * 38;
      if (enemy.kind !== 'drone' && enemy.kind !== 'vulture' && enemy.kind !== 'ghost') resolveDungeonCollision(dungeon, enemy, previous);
    }
    hooks.dropCrystal(current, 6, 0, false);
    for (const neighbor of dungeon.barrels) {
      if (neighbor.hp <= 0 || distance(neighbor, current) > current.explosionRadius + neighbor.radius) continue;
      neighbor.hp = 0;
      queue.push(neighbor);
    }
  }
  hooks.onSound('hit');
  hooks.onNews(explosions > 1 ? `过载电池连锁引爆 ×${explosions}！机房火力缺口已打开。` : '过载电池桶引爆！爆炸范围内的敌人受到重创。');
}

function portal(state: GameState, hooks: DungeonHooks, at: Point, destination: DungeonMap, nextFloor: number, label: string, description: string, color: string): DungeonPortal {
  return { ...findOpenPoint(state.dungeon, at, 48), id: hooks.nextId(), radius: 42, destination, nextFloor, label, description, color };
}

export function unlockDungeonPortals(state: GameState, hooks: DungeonHooks): void {
  const dungeon = state.dungeon;
  dungeon.phase = 'portal';
  dungeon.progress = 100;
  dungeon.lasers = [];
  dungeon.coolantUntil = 0;
  dungeon.playerInCoolant = false;
  if (!state.endless && dungeon.floor === 1) {
    dungeon.portals = [
      portal(state, hooks, { x: 390, y: 155 }, 'cryo', 2, '极寒超频机房', '液冷池冷却缩减 +45% · 电池桶连锁爆炸', '#6ad8ff'),
      portal(state, hooks, { x: 810, y: 155 }, 'darknet', 2, '断电暗网走廊', '停电暴击率翻倍 · 复电必掉稀有武器', '#c59cff'),
    ];
  } else if (!state.endless && dungeon.floor === 2) {
    dungeon.portals = [portal(state, hooks, { x: WORLD_WIDTH / 2, y: 100 }, 'temple', 3,
      '黄金圣殿直达电梯', '顶层董事局 · 准备迎战算力收割机', '#edcd80')];
  } else {
    const nextFloor = dungeon.floor + 1;
    const destination = nextEndlessMap(state.seed, nextFloor);
    dungeon.portals = [portal(state, hooks, { x: WORLD_WIDTH / 2, y: 100 }, destination, nextFloor,
      `${nextFloor}F · ${DUNGEON_MAPS[destination].name}`, '保留全部武器与海克斯 · 继续挑战强化地牢', '#b6ed76')];
  }
  hooks.onSound('upgrade');
}
