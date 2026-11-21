import { MAX_PROJECTILES, WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import type {
  Enemy, GameState, Point, Projectile, SoundName, WeaponEffect, WeaponState,
} from '../types/game.ts';

export interface WeaponHooks {
  nextId: () => number;
  damageEnemy: (enemy: Enemy, amount: number, canCrit?: boolean) => void;
  nearestEnemy: (at: Point, ignoredIds?: readonly number[]) => Enemy | undefined;
  onSound: (name: SoundName) => void;
}

interface AttackOrigin extends Point {
  owner: 'player' | 'clone';
  facing: number;
  spectral: boolean;
}

interface AttackContext {
  state: GameState;
  hooks: WeaponHooks;
  damageScale: number;
  sizeScale: number;
}

const TAU = Math.PI * 2;
const MAX_WEAPON_EFFECTS = 96;
const FULL_MAP_LENGTH = Math.hypot(WORLD_WIDTH, WORLD_HEIGHT) + 120;

function addProjectile(context: AttackContext, shot: Omit<Projectile, 'id' | 'hitIds'>): boolean {
  const { state, hooks } = context;
  if (state.projectiles.length >= MAX_PROJECTILES) return false;
  state.projectiles.push({ ...shot, id: hooks.nextId(), hitIds: [] });
  return true;
}

function addEffect(state: GameState, effect: WeaponEffect): void {
  if (state.weaponEffects.length < MAX_WEAPON_EFFECTS) state.weaponEffects.push(effect);
}

function nearestLivingEnemy(context: AttackContext, at: Point): Enemy | undefined {
  const enemy = context.hooks.nearestEnemy(at);
  return enemy && enemy.hp > 0 ? enemy : undefined;
}

function segmentDistanceSquared(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  ));
  return (point.x - start.x - t * dx) ** 2 + (point.y - start.y - t * dy) ** 2;
}

function intersectsSector(enemy: Enemy, origin: Point, angle: number, length: number, arc: number): boolean {
  const dx = enemy.x - origin.x;
  const dy = enemy.y - origin.y;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared > (length + enemy.radius) ** 2) return false;
  if (distanceSquared <= enemy.radius ** 2) return true;

  const delta = Math.atan2(dy, dx) - angle;
  const difference = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
  if (difference <= arc / 2) return true;

  // Check the finite radial edges too: a circle can overlap the sector while its center is outside.
  for (const edgeAngle of [angle - arc / 2, angle + arc / 2]) {
    const end = {
      x: origin.x + Math.cos(edgeAngle) * length,
      y: origin.y + Math.sin(edgeAngle) * length,
    };
    if (segmentDistanceSquared(enemy, origin, end) <= enemy.radius ** 2) return true;
  }
  return false;
}

function attackGpu(context: AttackContext, weapon: WeaponState, origin: AttackOrigin): boolean {
  const { state, damageScale, sizeScale } = context;
  let fired = false;
  if (weapon.evolved) {
    for (let i = 0; i < 8 && state.projectiles.length < MAX_PROJECTILES; i++) {
      const angle = state.time * 2 + i * TAU / 8;
      fired = addProjectile(context, {
        x: origin.x + Math.cos(angle) * 66,
        y: origin.y + Math.sin(angle) * 66,
        vx: Math.cos(angle) * 850,
        vy: Math.sin(angle) * 850,
        radius: 18 * sizeScale,
        damage: 90 * damageScale,
        life: 3,
        pierced: 999,
        weapon: 'gpu',
        evolved: true,
        spectral: origin.spectral,
        orbit: { owner: origin.owner, angle, remaining: 0.45 },
      }) || fired;
    }
    return fired;
  }

  const target = nearestLivingEnemy(context, origin);
  if (!target) return false;
  const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
  const growth = Math.floor((weapon.level - 1) / 2);
  const bonus = Math.max(0, Math.floor(state.projectileCount) - 1);
  const count = Math.min(MAX_PROJECTILES, 1 + growth + bonus);
  const spread = Math.min(0.14 * (count - 1), Math.PI * 0.65);
  for (let i = 0; i < count && state.projectiles.length < MAX_PROJECTILES; i++) {
    const direction = angle + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
    fired = addProjectile(context, {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(direction) * 620,
      vy: Math.sin(direction) * 620,
      radius: (7 + (weapon.level - 1) * 0.7) * sizeScale,
      damage: (20 + (weapon.level - 1) * 8) * damageScale,
      life: 2.5,
      pierced: 1 + growth,
      weapon: 'gpu',
      evolved: false,
      spectral: origin.spectral,
    }) || fired;
  }
  return fired;
}

function attackSpatula(context: AttackContext, weapon: WeaponState, origin: AttackOrigin): boolean {
  const { state, hooks, damageScale, sizeScale } = context;
  const target = nearestLivingEnemy(context, origin);
  const angle = target ? Math.atan2(target.y - origin.y, target.x - origin.x) : origin.facing;
  const length = (weapon.evolved ? 200 : 118 + weapon.level * 14) * sizeScale;
  const width = (weapon.evolved ? 40 : 24 + weapon.level * 3) * sizeScale;
  const arc = Math.PI * (weapon.evolved ? 0.85 : 0.55 + weapon.level * 0.04);
  addEffect(state, {
    kind: 'swing', x: origin.x, y: origin.y, angle, length, width, arc,
    life: 0.22, maxLife: 0.22, spectral: origin.spectral, evolved: weapon.evolved,
  });

  if (weapon.evolved) {
    addProjectile(context, {
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * 600,
      vy: Math.sin(angle) * 600,
      radius: 64 * sizeScale,
      damage: 140 * damageScale,
      life: 1,
      pierced: 999,
      weapon: 'crescent',
      evolved: true,
      spectral: origin.spectral,
    });
    return true;
  }

  const damage = (42 + (weapon.level - 1) * 16) * damageScale;
  const knockback = (24 + weapon.level * 7) * sizeScale;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || !intersectsSector(enemy, origin, angle, length, arc)) continue;
    hooks.damageEnemy(enemy, damage);
    if (enemy.hp <= 0 || enemy.kind === 'boss' || enemy.kind === 'guard' || enemy.ringMember) continue;
    const dx = enemy.x - origin.x;
    const dy = enemy.y - origin.y;
    const distance = Math.hypot(dx, dy);
    const nx = distance > 0 ? dx / distance : Math.cos(angle);
    const ny = distance > 0 ? dy / distance : Math.sin(angle);
    enemy.x = Math.max(enemy.radius, Math.min(WORLD_WIDTH - enemy.radius, enemy.x + nx * knockback));
    enemy.y = Math.max(enemy.radius, Math.min(WORLD_HEIGHT - enemy.radius, enemy.y + ny * knockback));
  }
  return true;
}

function attackCuda(context: AttackContext, weapon: WeaponState, origin: AttackOrigin): boolean {
  const { state, hooks, damageScale, sizeScale } = context;
  const radius = (weapon.evolved ? 210 : 60 + weapon.level * 10) * sizeScale;
  const damage = (weapon.evolved ? 42 : 6 + weapon.level * 3) * damageScale;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if ((enemy.x - origin.x) ** 2 + (enemy.y - origin.y) ** 2 <= (radius + enemy.radius) ** 2) {
      hooks.damageEnemy(enemy, damage);
    }
  }
  return true;
}

function attackPulse(context: AttackContext, weapon: WeaponState, origin: AttackOrigin): boolean {
  const { state, hooks, damageScale, sizeScale } = context;
  const target = nearestLivingEnemy(context, origin);
  if (!target) return false;
  const aim = Math.atan2(target.y - origin.y, target.x - origin.x);
  const count = weapon.evolved ? 3 : 2;
  const width = (weapon.evolved ? 58 : 10 + weapon.level * 3) * sizeScale;
  const length = (weapon.evolved ? FULL_MAP_LENGTH : 600 + weapon.level * 40) * sizeScale;
  const damage = (weapon.evolved ? 110 : 26 + (weapon.level - 1) * 12) * damageScale;

  for (let i = 0; i < count; i++) {
    // The ordinary pair is strictly parallel; the evolved trio fans out across the map.
    const angle = aim + (weapon.evolved ? (i - 1) * 0.22 : 0);
    const offset = weapon.evolved ? 0 : (i - 0.5) * (width + 8 * sizeScale);
    const start = {
      x: origin.x - Math.sin(aim) * offset,
      y: origin.y + Math.cos(aim) * offset,
    };
    const end = { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
    const targets = state.enemies.filter((enemy) => enemy.hp > 0 && segmentDistanceSquared(enemy, start, end) <= (width / 2 + enemy.radius) ** 2)
      .map((enemy) => ({ enemy, along: Math.max(0, (enemy.x - start.x) * Math.cos(angle) + (enemy.y - start.y) * Math.sin(angle)) }))
      .sort((a, b) => a.along - b.along);
    let beamLength = length;
    for (const { enemy, along } of targets) {
      hooks.damageEnemy(enemy, damage);
      if (enemy.kind === 'guard') { beamLength = Math.min(length, along); break; }
    }
    addEffect(state, {
      kind: 'beam', x: start.x, y: start.y, angle, length: beamLength, width, arc: 0,
      life: 0.2, maxLife: 0.2, spectral: origin.spectral, evolved: weapon.evolved,
    });
  }
  return true;
}

function attackDuck(context: AttackContext, weapon: WeaponState, origin: AttackOrigin): boolean {
  const { state, damageScale, sizeScale } = context;
  const count = weapon.evolved ? 6 : 2;
  const orbitRadius = weapon.evolved ? 64 : 48;
  const angularSpeed = weapon.evolved ? 3.2 : 1.8;
  const speed = weapon.evolved ? 780 : 650;
  let fired = false;
  for (let i = 0; i < count && state.projectiles.length < MAX_PROJECTILES; i++) {
    const orbitAngle = state.time * angularSpeed + i * TAU / count;
    const start = {
      x: origin.x + Math.cos(orbitAngle) * orbitRadius,
      y: origin.y + Math.sin(orbitAngle) * orbitRadius,
    };
    const target = nearestLivingEnemy(context, start);
    if (!target) continue;
    const angle = Math.atan2(target.y - start.y, target.x - start.x);
    fired = addProjectile(context, {
      x: start.x,
      y: start.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: (weapon.evolved ? 7 : 5) * sizeScale,
      damage: (weapon.evolved ? 52 : 14 + (weapon.level - 1) * 6) * damageScale,
      life: 2.5,
      pierced: weapon.evolved ? 2 : 1,
      weapon: 'duck',
      homing: true,
      evolved: weapon.evolved,
      spectral: origin.spectral,
    }) || fired;
  }
  return fired;
}

function attackInterval(weapon: WeaponState): number {
  switch (weapon.id) {
    case 'gpu': return weapon.evolved ? 0.72 : 0.48;
    case 'spatula': return weapon.evolved ? 0.85 : 1.05;
    case 'cuda': return 0.35;
    case 'pulse': return weapon.evolved ? 0.95 : 1.35 - (weapon.level - 1) * 0.08;
    case 'duck': return weapon.evolved ? 0.28 : 0.8 - (weapon.level - 1) * 0.1;
  }
}

function attack(context: AttackContext, weapon: WeaponState, origin: AttackOrigin): boolean {
  switch (weapon.id) {
    case 'gpu': return attackGpu(context, weapon, origin);
    case 'spatula': return attackSpatula(context, weapon, origin);
    case 'cuda': return attackCuda(context, weapon, origin);
    case 'pulse': return attackPulse(context, weapon, origin);
    case 'duck': return attackDuck(context, weapon, origin);
  }
}

export function updateWeapons(state: GameState, dt: number, hooks: WeaponHooks): void {
  let activeEffects = 0;
  for (const effect of state.weaponEffects) {
    effect.life -= dt;
    if (effect.life > 0 && activeEffects < MAX_WEAPON_EFFECTS) {
      state.weaponEffects[activeEffects++] = effect;
    }
  }
  state.weaponEffects.length = activeEffects;

  const overwork = state.hexes.includes('overwork');
  const attackSpeed = 0.48 / state.fireInterval
    * (state.effects.freeze > 0 ? 2 : 1)
    * (state.effects.chairActive ? 2 : 1)
    * (overwork ? 1.15 : 1);
  const context: AttackContext = {
    state, hooks,
    damageScale: state.damage / 20 * (overwork ? 1.25 : 1),
    sizeScale: state.hexes.includes('wide') ? 1.35 : 1,
  };
  const target = hooks.nearestEnemy(state.player);
  if (target && !state.player.moving) state.player.facing = Math.atan2(target.y - state.player.y, target.x - state.player.x);
  const origins: AttackOrigin[] = [{
    x: state.player.x, y: state.player.y, facing: state.player.facing,
    owner: 'player', spectral: false,
  }];
  const clone = state.effects.clone;
  if (clone && clone.life > 0) {
    const cloneTarget = hooks.nearestEnemy(clone);
    if (cloneTarget) clone.facing = Math.atan2(cloneTarget.y - clone.y, cloneTarget.x - clone.x);
    origins.push({ x: clone.x, y: clone.y, facing: clone.facing, owner: 'clone', spectral: true });
  }

  let playShotSound = false;
  for (const weapon of state.weapons) {
    if (weapon.level <= 0 || !state.equipped.includes(weapon.id) || state.time + 1e-8 < weapon.nextFireTime) continue;
    let fired = false;
    for (const origin of origins) fired = attack(context, weapon, origin) || fired;
    if (!fired) continue;
    if (weapon.id !== 'cuda') playShotSound = true;
    weapon.nextFireTime = state.time + attackInterval(weapon) / attackSpeed;
  }
  if (playShotSound) hooks.onSound('shoot');
}
