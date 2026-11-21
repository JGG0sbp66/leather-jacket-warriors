import { HEXTECH } from '../data/hextech.ts';
import { ALLIES } from '../data/summons.ts';
import { WEAPONS } from '../data/weapons.ts';
import { DUNGEON_MAPS } from '../data/dungeons.ts';
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from '../data/difficulty.ts';
import { initialStory, triggerBossEnrage, updateStory } from './StorySystem.ts';
import type { StoryHooks } from './StorySystem.ts';
import { updateWeapons } from './WeaponSystem.ts';
import type { WeaponHooks } from './WeaponSystem.ts';
import { createDungeon, damageBarrel, findOpenPoint, nextEndlessMap, projectileObstacleHit, resolveDungeonCollision, unlockDungeonPortals, updateDungeonEnvironment } from './DungeonSystem.ts';
import { mulberry32 } from '../utils/prng.ts';
import { FIXED_STEP, HEX_TIMES, MAX_BATTLE_LOG_ENTRIES, MAX_PROJECTILES, SUMMON_DURATION, WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import type { AllyId, BattleLogEntry, DifficultyId, DungeonBarrel, DungeonMap, Enemy, EnemyKind, EnemyProjectile, GameSnapshot, GameState, HexId, Point, Projectile, RunReport, SoundName, WeaponDrop, WeaponId, WeaponState } from '../types/game.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pointNearPlayer = (at: Point, angle: number, radius: number): Point => ({
  x: clamp(at.x + Math.cos(angle) * radius, 48, WORLD_WIDTH - 48),
  y: clamp(at.y + Math.sin(angle) * radius, 48, WORLD_HEIGHT - 48),
});

export class GameEngine {
  state: GameState;
  private spawnRandom: () => number;
  private weaponDropRandom: () => number;
  private dropOrder: WeaponId[] = [];
  private dropIndex = 0;
  private storyHooks: StoryHooks;
  private hexRandom: () => number;
  private combatRandom: () => number;
  private visualRandom: () => number;
  private onSound: (name: SoundName) => void;
  private movement: Point = { x: 0, y: 0 };
  private accumulator = 0;
  private weaponHooks: WeaponHooks;
  private chairTimer = 0;
  private spawnTimer = 0;
  private spawnCount = 0;
  private floorSpawnCount = 0;
  private portalArmed = false;
  private enemyRoutes = new Map<number, { points: Point[]; expires: number }>();
  private projectileHits = new WeakMap<Projectile, Set<number>>();
  private projectileBarrelHits = new WeakMap<Projectile, Set<number>>();
  private frameHoardBonus = 0;
  private entityId = 0;
  private logId = 0;

  constructor(seed: number, onSound: (name: SoundName) => void = () => {}, initialWeapon: WeaponId = 'gpu', difficulty: DifficultyId = DEFAULT_DIFFICULTY) {
    this.state = this.initialState(seed, initialWeapon, difficulty);
    this.spawnRandom = mulberry32(seed);
    this.weaponDropRandom = mulberry32(seed ^ 0x9e3779b9);
    this.hexRandom = mulberry32(seed ^ 0x27d4eb2f);
    this.combatRandom = mulberry32(seed ^ 0xc2b2ae35);
    this.visualRandom = mulberry32(seed ^ 0x85ebca6b);
    this.onSound = onSound;
    this.weaponHooks = {
      nextId: () => this.entityId++,
      damageEnemy: (enemy, amount, canCrit) => this.damageEnemy(enemy, amount, canCrit),
      nearestEnemy: (at, ignoredIds) => this.nearestEnemy(at, ignoredIds),
      nearestBarrel: (at) => this.nearestBarrel(at),
      damageBarrel: (barrel, amount) => damageBarrel(this.state, barrel, amount, this.storyHooks),
      onSound,
    };
    this.storyHooks = {
      nextId: () => this.entityId++,
      spawnEnemy: (kind, at, options) => this.spawnStoryEnemy(kind, at, options),
      damageEnemy: (enemy, amount, canCrit) => this.damageEnemy(enemy, amount, canCrit),
      hurtPlayer: (amount) => this.hurtPlayer(amount),
      dropSupply: (at, source, core, newWeapon, rare) => this.dropSupply(at, source, core, newWeapon, undefined, false, rare),
      dropCrystal: (at, value, heal, attracted) => this.dropCrystal(at, value, heal, attracted),
      charge: (amount) => this.charge(amount),
      onNews: (text) => this.log(text, 'event'),
      onSound,
    };
    this.prepareHexSchedule();
    this.prepareDropOrder();
  }

  private initialState(seed: number, initialWeapon: WeaponId, difficulty: DifficultyId): GameState {
    return {
      status: 'ready', difficulty, seed: seed >>> 0, time: 0, level: 1, xp: 0, xpNeeded: 12,
      kills: 0, energy: 0, summons: 0, damage: 20,
      fireInterval: 0.48, projectileCount: 1, pickupRadius: 105,
      initialWeapon, equipped: [initialWeapon, null, null], priorityWeapon: initialWeapon,
      weapons: Object.values(WEAPONS).map(({ id }) => ({ id, level: id === initialWeapon ? 1 : 0, evolved: false, nextFireTime: 0 })),
      weaponEffects: [], weaponDrops: [], logs: [], levelPulse: 0, inventoryLockedUntil: 0,
      story: initialStory(), endless: false, bossDefeated: false, blackFlash: 0, defeatReason: null, report: null,
      dungeon: createDungeon(seed),
      player: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, radius: 15, hp: 100, maxHp: 100, speed: 220, facing: 0, invincible: 0, moving: false },
      enemies: [], projectiles: [], crystals: [], particles: [], damageTexts: [], summonFlash: 0, shake: 0,
      ally: 'patch', summonHistory: [], hexes: [], hexChoices: [], hexSchedule: [], hexRerolls: [false, false, false], hexSeen: [], hexRound: 0, enemyProjectiles: [], strikes: [],
      effects: { freeze: 0, wall: 0, slow: 0, dashCooldown: 0, autoSlowCooldown: 0, standStill: 0, chairActive: false, clone: null, cloneCooldown: 0, parryCooldown: 0, arc: 0 },
    };
  }

  private prepareHexSchedule(): void {
    const weight = { prismatic: 2, gold: 3, silver: 4 };
    this.state.hexSchedule = HEX_TIMES.map(() => {
      const pool = [...HEXTECH];
      const cards: HexId[] = [];
      while (pool.length > 0) {
        let roll = this.hexRandom() * pool.reduce((sum, card) => sum + weight[card.tier], 0);
        let index = 0;
        while (index < pool.length - 1 && roll >= weight[pool[index].tier]) { roll -= weight[pool[index].tier]; index++; }
        cards.push(pool.splice(index, 1)[0].id);
      }
      return cards;
    });
  }

  private prepareDropOrder(): void {
    this.weaponDropRandom = mulberry32(this.state.seed ^ 0x9e3779b9);
    this.dropOrder = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => id !== this.state.initialWeapon);
    for (let i = this.dropOrder.length - 1; i > 0; i--) {
      const j = Math.floor(this.weaponDropRandom() * (i + 1));
      [this.dropOrder[i], this.dropOrder[j]] = [this.dropOrder[j], this.dropOrder[i]];
    }
    this.dropIndex = 0;
  }

  selectInitialWeapon(id: WeaponId): boolean {
    if (this.state.status !== 'ready' || !Object.hasOwn(WEAPONS, id)) return false;
    this.state.initialWeapon = id;
    this.state.equipped = [id, null, null];
    this.state.priorityWeapon = id;
    for (const weapon of this.state.weapons) weapon.level = weapon.id === id ? 1 : 0;
    this.prepareDropOrder();
    return true;
  }

  selectDifficulty(id: DifficultyId): boolean {
    if (this.state.status !== 'ready' || !Object.hasOwn(DIFFICULTIES, id)) return false;
    this.state.difficulty = id;
    return true;
  }

  start(): void {
    if (this.state.status !== 'ready') return;
    this.state.status = 'playing';
    this.log(`第1层 · 外围霓虹广场突围开始，起手武器：${WEAPONS[this.state.initialWeapon].name}。`, 'system');
    this.log(this.state.story.news, 'system');
    this.log(`难度：${DIFFICULTIES[this.state.difficulty].name} · ${DIFFICULTIES[this.state.difficulty].description}`, 'system');
    for (let i = 0; i < 5; i++) this.spawnEnemy(0);
    this.spawnTimer = 0.65;
  }

  returnToLobby(seed = this.state.seed, initialWeapon: WeaponId = 'gpu', difficulty: DifficultyId = this.state.difficulty): void {
    this.state = this.initialState(seed, initialWeapon, difficulty);
    this.spawnRandom = mulberry32(seed);
    this.prepareDropOrder();
    this.hexRandom = mulberry32(seed ^ 0x27d4eb2f);
    this.combatRandom = mulberry32(seed ^ 0xc2b2ae35);
    this.visualRandom = mulberry32(seed ^ 0x85ebca6b);
    this.prepareHexSchedule();
    this.accumulator = 0;
    this.chairTimer = 0;
    this.spawnTimer = 0;
    this.spawnCount = 0;
    this.floorSpawnCount = 0;
    this.portalArmed = false;
    this.enemyRoutes.clear();
    this.frameHoardBonus = 0;
    this.entityId = 0;
    this.logId = 0;
    this.setMovement(0, 0);
  }

  restart(seed = this.state.seed): void {
    this.returnToLobby(seed, this.state.initialWeapon, this.state.difficulty);
    this.start();
  }

  setMovement(x: number, y: number): void {
    const magnitude = Math.max(1, Math.hypot(x, y));
    this.movement = { x: x / magnitude, y: y / magnitude };
  }

  pause(): void {
    if (this.state.status !== 'playing') return;
    this.state.status = 'paused';
    this.setMovement(0, 0);
    this.accumulator = 0;
  }

  resume(): void {
    if (this.state.status === 'paused') this.state.status = 'playing';
  }

  openInventory(): boolean {
    const s = this.state;
    if (s.status !== 'playing' || s.dungeon.phase === 'transition' || s.time < s.inventoryLockedUntil) return false;
    s.status = 'inventory';
    this.setMovement(0, 0);
    this.accumulator = 0;
    return true;
  }

  closeInventory(): void {
    if (this.state.status !== 'inventory') return;
    this.state.status = 'playing';
    this.setMovement(0, 0);
    this.checkChoices();
  }

  equipWeapon(id: WeaponId, slot: number): boolean {
    const s = this.state;
    if (s.status !== 'inventory' || !Number.isInteger(slot) || slot < 0 || slot > 2 || s.equipped.includes(id)) return false;
    if (!s.weapons.some((weapon) => weapon.id === id && weapon.level > 0)) return false;
    s.equipped[slot] = id;
    this.ensurePriority();
    const weapon = s.weapons.find((item) => item.id === id)!;
    this.log(`槽 ${slot + 1} 已换装：${weapon.evolved ? WEAPONS[id].evolution : WEAPONS[id].name} · Lv.${weapon.level}`);
    return true;
  }

  setPriority(slot: number): boolean {
    const s = this.state;
    if (!['playing', 'inventory'].includes(s.status)) return false;
    const weapon = s.weapons.find((item) => item.id === s.equipped[slot] && !item.evolved);
    if (!weapon) return false;
    if (s.priorityWeapon !== weapon.id) this.log(`优先培养：${WEAPONS[weapon.id].name}`);
    s.priorityWeapon = weapon.id;
    return true;
  }

  private ensurePriority(): void {
    const s = this.state;
    if (s.weapons.some((weapon) => weapon.id === s.priorityWeapon && !weapon.evolved && s.equipped.includes(weapon.id))) return;
    s.priorityWeapon = s.equipped.find((id) => id !== null && s.weapons.some((weapon) => weapon.id === id && !weapon.evolved)) ?? null;
  }

  enterEndless(): boolean {
    const s = this.state;
    if (s.status !== 'victory' || !s.bossDefeated) return false;
    s.endless = true;
    s.status = 'playing';
    s.player.hp = s.player.maxHp;
    s.energy = 100;
    for (const weapon of s.weapons) { weapon.level = 5; weapon.evolved = true; }
    this.ensurePriority();
    this.log('无尽深渊开启：五把神兵全部超武觉醒，保留三槽构筑与海克斯，补满生命与通灵能量。', 'system');
    this.changeFloor(nextEndlessMap(s.seed, 4), 4);
    return true;
  }

  advance(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.state.status === 'finishing') {
      this.state.blackFlash = Math.max(0, this.state.blackFlash - Math.min(dt, 0.05));
      if (this.state.blackFlash <= 1e-8) { this.state.status = 'victory'; this.onSound('victory'); }
      return;
    }
    if (this.state.status !== 'playing') return;
    this.accumulator += Math.min(dt, 0.05);
    while (this.accumulator + 1e-10 >= FIXED_STEP && this.state.status === 'playing') {
      this.accumulator -= FIXED_STEP;
      this.step(FIXED_STEP);
    }
    if (this.state.status !== 'playing') this.accumulator = 0;
  }

  private has(id: HexId): boolean { return this.state.hexes.includes(id); }
  private sizeMultiplier(): number { return this.has('wide') ? 1.35 : 1; }
  private hoardBonus(): number {
    return this.has('hoard') ? this.frameHoardBonus : 0;
  }
  private updateHoardBonus(): void {
    let count = 0;
    if (this.has('hoard')) for (const crystal of this.state.crystals) if (crystal.value > 0) count++;
    this.frameHoardBonus = Math.min(0.9, count * 0.015);
  }
  private charge(amount: number): void {
    this.state.energy = Math.min(100, this.state.energy + amount * (this.has('network') ? 1.45 : 1));
  }

  requestSummon(): boolean {
    const s = this.state;
    if (s.status !== 'playing' || !['clearing', 'boss'].includes(s.dungeon.phase) || s.time < s.story.bossIntroUntil || s.energy < 100) return false;
    s.status = 'summonSelect';
    this.setMovement(0, 0);
    this.accumulator = 0;
    return true;
  }

  cancelSummon(): void {
    if (this.state.status !== 'summonSelect') return;
    this.state.status = 'playing';
    this.setMovement(0, 0);
    this.checkChoices();
  }

  summon(ally: AllyId): boolean {
    const s = this.state;
    if (s.status !== 'summonSelect' || s.energy < 100 || !['patch', 'ember', 'aegis', 'clock'].includes(ally)) return false;
    s.ally = ally;
    s.status = 'playing';
    s.energy = 0;
    s.summons++;
    s.summonHistory.push(ally);
    this.log(`${ALLIES[ally].name} · ${ALLIES[ally].skill}：“${ALLIES[ally].quote}”`, 'summon');
    this.setMovement(0, 0);
    s.summonFlash = SUMMON_DURATION;
    s.inventoryLockedUntil = Math.max(s.inventoryLockedUntil, s.time + 1);
    s.shake = 0.35;
    if (s.ally === 'patch') {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 15);
      for (const shot of s.enemyProjectiles) this.dropCrystal(shot, 0, 1, true);
      s.enemyProjectiles = [];
      for (const enemy of s.enemies) this.damageEnemy(enemy, 100 + s.level * 12, false);
    } else if (s.ally === 'ember') {
      const targets = s.enemies.filter((enemy) => enemy.hp > 0).map((enemy) => ({
        enemy, density: s.enemies.filter((other) => distance(enemy, other) < 110).length,
      })).sort((a, b) => b.density - a.density);
      const selected: Point[] = [];
      for (let i = 0; i < 4; i++) {
        const target = targets.find(({ enemy }) => selected.every((point) => distance(point, enemy) > 110))?.enemy;
        const angle = i * Math.PI / 2;
        const at = { x: target?.x ?? clamp(s.player.x + Math.cos(angle) * 150, 40, WORLD_WIDTH - 40), y: target?.y ?? clamp(s.player.y + Math.sin(angle) * 150, 40, WORLD_HEIGHT - 40) };
        selected.push(at);
        s.strikes.push({ ...at, radius: 92 * this.sizeMultiplier(), delay: 0.8 + i * 0.12, life: 6, tick: 0 });
      }
    } else if (s.ally === 'aegis') {
      s.effects.wall = this.has('reckless') ? 0 : 7;
      if (this.has('reckless')) this.log('废物的思维：已放弃所有护盾，本次关税壁垒不会生效。', 'summon');
    } else {
      s.effects.freeze = 4.5;
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        this.dropCrystal({ x: clamp(s.player.x + Math.cos(angle) * 70, 30, WORLD_WIDTH - 30), y: clamp(s.player.y + Math.sin(angle) * 70, 30, WORLD_HEIGHT - 30) }, 0, 4);
      }
    }
    s.enemies = s.enemies.filter((enemy) => enemy.hp > 0 || (enemy.kind === 'boss' && s.bossDefeated));
    this.onSound('summon');
    if (!this.settleOutcome()) this.checkChoices();
    return true;
  }

  activateSlow(automatic = false): boolean {
    const s = this.state;
    const fx = s.effects;
    if (s.status !== 'playing' || !['clearing', 'boss'].includes(s.dungeon.phase) || s.time < s.story.bossIntroUntil || !this.has('chrono') || fx.slow > 0) return false;
    if (automatic ? fx.autoSlowCooldown > 0 : fx.dashCooldown > 0) return false;
    fx.slow = 2.5;
    if (automatic) fx.autoSlowCooldown = 15; else fx.dashCooldown = 12;
    this.onSound('dash');
    return true;
  }

  private log(text: string, kind: BattleLogEntry['kind'] = 'weapon'): void {
    this.state.logs = [...this.state.logs, { id: ++this.logId, time: this.state.time, text, kind }].slice(-MAX_BATTLE_LOG_ENTRIES);
  }

  private strengthen(weapon?: WeaponState): void {
    const s = this.state;
    if (!weapon || weapon.evolved) {
      const gain = s.endless ? 1.5 : 1;
      s.damage += gain;
      this.log(`超频溢出：全武器基础伤害 +${gain}`, 'upgrade');
    } else if (weapon.level < 5) {
      weapon.level++;
      this.log(`${WEAPONS[weapon.id].name} · Lv.${weapon.level}`, 'upgrade');
    } else {
      weapon.evolved = true;
      this.log(`超武觉醒：【${WEAPONS[weapon.id].evolution}】已解锁！`, 'evolution');
    }
    this.ensurePriority();
    this.onSound('upgrade');
  }

  private strengthenPriority(): void {
    this.ensurePriority();
    this.strengthen(this.state.weapons.find((weapon) => weapon.id === this.state.priorityWeapon));
  }

  private collectWeapon(id: WeaponId, rare = false): void {
    const s = this.state;
    const weapon = s.weapons.find((item) => item.id === id)!;
    if (weapon.level > 0) { this.strengthen(weapon); return; }
    weapon.level = rare ? 3 : 1;
    const slot = s.equipped.indexOf(null);
    if (slot >= 0) {
      s.equipped[slot] = id;
      this.log(`[${WEAPONS[id].name}]${rare ? ' · 稀有 Lv.3' : ''} 已自动装备至 ${slot + 1}号槽！`);
    } else {
      this.log(`[${WEAPONS[id].name}]${rare ? ' · 稀有 Lv.3' : ''} 已收入武器匣（按 B 换装）`);
      s.story.news = `第${s.weapons.filter((item) => item.level > 0).length}把神兵【${WEAPONS[id].name}】已收入武器匣！3个出战槽已满，按 B 换装，背包内保留等级与超武。`;
    }
    this.ensurePriority();
    this.onSound('pickup');
  }

  private awakenPriority(): void {
    const s = this.state;
    this.ensurePriority();
    const weapon = s.weapons.find((item) => item.id === s.priorityWeapon && !item.evolved)
      ?? s.weapons.filter((item) => item.level > 0 && !item.evolved).sort((a, b) => b.level - a.level)[0];
    if (!weapon) {
      const gain = s.endless ? 4 : 3;
      s.damage += gain;
      this.log(`超频升级核心溢出：全武器基础伤害 +${gain}`, 'upgrade');
    } else {
      weapon.level = 5;
      weapon.evolved = true;
      this.log(`超频升级核心激活：【${WEAPONS[weapon.id].evolution}】直接超武觉醒！`, 'evolution');
    }
    this.ensurePriority();
    this.onSound('upgrade');
  }

  private collectDrop(drop: WeaponDrop): void {
    if (drop.weapon) this.collectWeapon(drop.weapon, drop.rare);
    if (drop.core) {
      if (drop.overclock) this.awakenPriority();
      else this.strengthenPriority();
    }
  }

  private dropSupply(at: Point, source: string, core: boolean, newWeapon: boolean, bonusWeapon?: WeaponId, overclock = false, rare = false): void {
    let weapon: WeaponId | null = bonusWeapon ?? null;
    if (newWeapon && this.dropIndex < this.dropOrder.length) weapon = this.dropOrder[this.dropIndex++];
    else if (newWeapon) {
      const owned = this.state.weapons.filter((item) => item.level > 0);
      weapon = owned[Math.floor(this.weaponDropRandom() * owned.length)].id;
    }
    const s = this.state;
    if (s.weaponDrops.length >= 12) {
      const oldest = s.weaponDrops.shift()!;
      this.collectDrop(oldest);
    }
    const point = findOpenPoint(s.dungeon, at, 28);
    s.weaponDrops.push({ id: this.entityId++, ...point, weapon, core, source, overclock, rare });
    this.log(`${source}：${weapon ? WEAPONS[weapon].name : '超频晶核'}${overclock ? ' + 超武觉醒核心' : ''}${rare ? ' · 稀有品质' : ''}，靠近拾取`);
  }

  rerollHex(slot: number): boolean {
    const s = this.state;
    if (s.status !== 'hex' || !Number.isInteger(slot) || slot < 0 || slot > 2 || s.hexRerolls[slot]) return false;
    const id = s.hexSchedule[s.hexRound].find((candidate) => !s.hexes.includes(candidate) && !s.hexSeen.includes(candidate));
    if (!id) return false;
    s.hexChoices = s.hexChoices.map((card, index) => index === slot ? HEXTECH.find((item) => item.id === id)! : card);
    s.hexSeen.push(id);
    s.hexRerolls[slot] = true;
    this.log(`候选槽 ${slot + 1} 已刷新：${s.hexChoices[slot].name}`, 'hex');
    this.onSound('upgrade');
    return true;
  }

  chooseHex(id: HexId): boolean {
    const s = this.state;
    const card = s.hexChoices.find((choice) => choice.id === id);
    if (s.status !== 'hex' || !card || this.has(id)) return false;
    this.log(`${card.name}：${card.detail}`, 'hex');
    s.hexes = [...s.hexes, id];
    s.hexChoices = [];
    s.hexRound++;
    s.dungeon.pendingHex = false;
    if (id === 'hoard') this.updateHoardBonus();
    if (id === 'echo') { s.player.hp = Math.max(1, Math.ceil(s.player.hp * 0.8)); this.createClone(); }
    if (id === 'network') s.energy = Math.min(100, s.energy + 50);
    if (id === 'reckless') s.effects.wall = 0;
    if (id === 'wide') {
      for (const strike of s.strikes) strike.radius *= 1.35;
      for (const shot of s.projectiles) shot.radius *= 1.35;
      for (const effect of s.weaponEffects) { effect.length *= 1.35; effect.width *= 1.35; }
    }
    s.status = 'playing';
    this.setMovement(0, 0);
    this.onSound('upgrade');
    this.checkChoices();
    return true;
  }

  snapshot(): GameSnapshot {
    const s = this.state;
    const fx = s.effects;
    const activeEffects: string[] = [];
    if (fx.freeze > 0) activeEffects.push(`3nm 时停领域 ${fx.freeze.toFixed(1)}s`);
    if (fx.wall > 0) activeEffects.push(`绝对关税壁垒 ${fx.wall.toFixed(1)}s`);
    if (fx.slow > 0) activeEffects.push(`斯安威斯坦 ${fx.slow.toFixed(1)}s`);
    if (fx.chairActive) activeEffects.push('白色塑料椅 · 减伤 / 攻速翻倍');
    if (fx.clone) activeEffects.push(`仿生泪滴 ${Math.ceil(fx.clone.life)}s`);
    if (this.has('parry')) activeEffects.push(fx.parryCooldown > 0 ? `打铁宗师 ${Math.ceil(fx.parryCooldown)}s` : '打铁宗师 · 弹反就绪');
    if (s.dungeon.playerInCoolant) activeEffects.push('液冷超频 · 冷却缩减45% / 移速−15%');
    if (s.story.blackoutUntil > s.time) activeEffects.push('暗网反杀 · 暴击率翻倍');
    const boss = s.enemies.find((enemy) => enemy.id === s.story.bossId && enemy.hp > 0);
    return {
      status: s.status, difficulty: s.difficulty, timeLimit: DIFFICULTIES[s.difficulty].timeLimit, seed: s.seed, time: s.time, level: s.level,
      xp: s.xp, xpNeeded: s.xpNeeded, kills: s.kills, energy: s.energy,
      summons: s.summons, weapons: s.weapons.map((weapon) => ({ ...weapon })), hp: s.player.hp,
      maxHp: s.player.maxHp, damage: Math.round(s.damage * (this.has('overwork') ? 1.25 : 1)),
      initialWeapon: s.initialWeapon, equipped: [...s.equipped], priorityWeapon: s.priorityWeapon,
      logs: s.logs, inventoryLocked: s.time < s.inventoryLockedUntil,
      ally: s.ally, summonHistory: [...s.summonHistory], hexes: [...s.hexes], hexChoices: [...s.hexChoices], hexRound: s.hexRound,
      hexRerolls: [...s.hexRerolls], dashCooldown: fx.dashCooldown, activeEffects,
      news: s.story.news, event: s.story.event,
      eventRemaining: s.story.event === 'blackout' ? Math.max(0, s.story.blackoutUntil - s.time) : s.story.event === 'cryo' ? Math.max(0, s.dungeon.coolantUntil - s.time) : s.story.event === 'bull' ? Math.max(0, s.story.bullUntil - s.time) : s.story.ring && !s.story.ring.escaped ? s.story.ring.remaining : 0,
      dungeon: {
        floor: s.dungeon.floor, map: s.dungeon.map, name: s.dungeon.name, branch: s.dungeon.branch,
        phase: s.dungeon.phase, progress: s.dungeon.progress, floorTime: s.dungeon.floorTime,
        kills: s.dungeon.kills, floorsCleared: s.dungeon.floorsCleared, affixes: [...s.dungeon.affixes],
        transition: s.dungeon.transition, playerInCoolant: s.dungeon.playerInCoolant,
        portalChoices: s.dungeon.portals.map(({ destination, label, description, color }) => ({ destination, label, description, color })),
      },
      boss: boss ? { hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: s.story.bossPhase, entering: s.time < s.story.bossIntroUntil, quote: s.story.bossQuoteRemaining > 0,
        guarded: s.story.bossPhaseGuardRemaining > 0,
        type: boss.bossType ?? 'chairman', name: s.story.bossName, title: s.story.bossTitle, introText: s.story.bossIntroText, quoteText: s.story.bossQuoteText } : null,
      danger: s.story.cuts.some((cut) => cut.delay > 0), endless: s.endless, bossDefeated: s.bossDefeated,
      defeatReason: s.defeatReason, report: s.report,
    };
  }

  private updateEffects(dt: number): void {
    const s = this.state;
    const fx = s.effects;
    for (const key of ['freeze', 'wall', 'slow', 'dashCooldown', 'autoSlowCooldown', 'parryCooldown', 'arc', 'cloneCooldown'] as const) fx[key] = Math.max(0, fx[key] - dt);
    if (this.has('chrono') && s.player.hp < s.player.maxHp * 0.4) this.activateSlow(true);
    fx.standStill = Math.hypot(this.movement.x, this.movement.y) > 0.05 ? 0 : fx.standStill + dt;
    fx.chairActive = this.has('chair') && fx.standStill >= 0.8;
    if (this.has('echo') && fx.cloneCooldown <= 0) this.createClone();
    if (fx.clone) {
      fx.clone.life -= dt;
      fx.clone.x += (clamp(s.player.x - 65, 38, WORLD_WIDTH - 38) - fx.clone.x) * Math.min(1, dt * 5);
      fx.clone.y += (clamp(s.player.y + 45, 38, WORLD_HEIGHT - 38) - fx.clone.y) * Math.min(1, dt * 5);
      const at = findOpenPoint(s.dungeon, fx.clone, s.player.radius);
      fx.clone.x = at.x; fx.clone.y = at.y;
      if (fx.clone.life <= 0) fx.clone = null;
    }
  }

  private createClone(): void {
    const s = this.state;
    s.effects.clone = { ...findOpenPoint(s.dungeon, { x: s.player.x - 65, y: s.player.y + 45 }, s.player.radius), facing: s.player.facing, life: 40 };
    s.effects.cloneCooldown = 50;
  }

  private changeFloor(map: DungeonMap, floor: number): void {
    const s = this.state;
    this.enemyRoutes.clear();
    this.collectFloorLoot();
    const branch = floor === 2 && (map === 'cryo' || map === 'darknet') ? map : s.dungeon.branch;
    const cleared = s.dungeon.floorsCleared;
    s.dungeon = createDungeon(s.seed, map, floor, branch, cleared);
    s.dungeon.phase = 'transition';
    s.dungeon.transition = 1;
    s.story = initialStory();
    s.story.event = s.endless ? 'endless' : 'parking';
    s.story.news = floor + 'F · ' + s.dungeon.name + '：' + DUNGEON_MAPS[map].description;
    s.enemies = []; s.enemyProjectiles = []; s.projectiles = []; s.weaponEffects = [];
    s.strikes = []; s.particles = []; s.damageTexts = [];
    s.summonFlash = 0; s.shake = 0; s.blackFlash = 0;
    s.effects.freeze = 0; s.effects.wall = 0; s.effects.slow = 0; s.effects.arc = 0;
    s.effects.standStill = 0; s.effects.chairActive = false;
    s.player.x = WORLD_WIDTH / 2; s.player.y = WORLD_HEIGHT / 2 + 60;
    s.player.moving = false; s.player.invincible = 1.5;
    if (s.effects.clone) {
      s.effects.clone.x = s.player.x - 65;
      s.effects.clone.y = s.player.y + 45;
    }
    for (const weapon of s.weapons) weapon.nextFireTime = s.time;
    this.floorSpawnCount = 0;
    this.portalArmed = false;
    this.spawnRandom = mulberry32(s.seed ^ Math.imul(floor, 0x9e3779b9) ^ Math.imul(['plaza', 'cryo', 'darknet', 'temple', 'singularity'].indexOf(map) + 1, 0x27d4eb2f));
    this.spawnTimer = s.time + 0.65;
    this.chairTimer = 0;
    s.inventoryLockedUntil = s.time;
    this.setMovement(0, 0);
    this.accumulator = 0;
    this.log(s.story.news, 'system');
    if (s.dungeon.affixes.length > 0) this.log('本层词缀：' + s.dungeon.affixes.join(' / '), 'event');
    this.onSound('upgrade');
  }

  private collectFloorLoot(): void {
    const s = this.state;
    for (const drop of s.weaponDrops) this.collectDrop(drop);
    s.weaponDrops = [];
    for (const crystal of s.crystals) {
      s.xp += crystal.value;
      if (s.player.hp > 0) s.player.hp = Math.min(s.player.maxHp, s.player.hp + (crystal.heal ?? 0));
    }
    s.crystals = [];
    this.frameHoardBonus = 0;
    this.checkChoices();
  }

  private finishFloorBoss(boss: Enemy): void {
    const s = this.state;
    const d = s.dungeon;
    if (d.phase !== 'boss' || s.story.bossId !== boss.id) return;
    d.floorsCleared++;
    d.progress = 100;
    s.story.bossDeath = { x: boss.x, y: boss.y };
    s.story.bossId = null;
    s.story.bossIntroStart = 0; s.story.bossIntroUntil = 0; s.story.bossLanding = null; s.story.bossPhaseGuardUntil = 0;
    s.story.bossPhaseGuardRemaining = 0;
    s.story.crashes = []; s.story.cuts = []; s.story.ring = null;
    s.story.blackoutUntil = 0; s.story.bullUntil = 0; s.story.bossQuoteRemaining = 0;
    s.effects.freeze = 0; s.effects.slow = 0; s.effects.wall = 0; s.effects.arc = 0;
    s.effects.chairActive = false; s.effects.standStill = 0; s.summonFlash = 0;
    s.inventoryLockedUntil = s.time;
    for (const enemy of s.enemies) enemy.hp = 0;
    s.enemies = []; s.enemyProjectiles = []; s.projectiles = []; s.weaponEffects = []; s.strikes = [];
    this.log(d.floor + 'F 守关者击破：【' + s.story.bossTitle + ' · ' + s.story.bossName + '】', 'result');
    if (!s.endless && d.floor === 1) {
      if (!s.story.fired.includes('captain-supply')) {
        s.story.fired.push('captain-supply');
        this.dropSupply(boss, '外围安保遗留 · 第2把武器箱', false, true);
      }
      this.dropSupply(boss, '直播装甲车残骸 · 升级核心', true, false);
    } else if (!s.endless && d.floor === 2) {
      if (!s.story.fired.includes('ghost-supply')) {
        s.story.fired.push('ghost-supply');
        this.dropSupply(boss, '审计幽灵遗留 · 第3把武器箱', false, true);
      }
      this.dropSupply(boss, '法务总监 · 武器箱与超频升级核心', true, true, undefined, true);
    } else if (!s.endless && d.floor === 3) {
      if (!s.story.fired.includes('iron-supply')) {
        s.story.fired.push('iron-supply');
        this.dropSupply(boss, '董事会铁卫遗留 · 最后一把神兵', false, true);
      }
      s.bossDefeated = true;
      this.collectFloorLoot();
      return;
    } else {
      this.dropSupply(boss, '无尽守关补给 · 超频升级核心', true, false, undefined, true);
      this.dropCrystal(boss, 45, 18, true);
      this.charge(25);
    }
    unlockDungeonPortals(s, this.storyHooks);
    d.pendingHex = !s.endless && d.floor <= 2 && s.hexRound < d.floor;
    s.story.event = 'portal';
    s.story.news = d.floor === 1 && !s.endless
      ? '第一层突破！海克斯选取后走入左侧蓝门或右侧紫门，自选第二层机房。'
      : d.floor === 2 && !s.endless
        ? '第二层突破！拾取超频核心觉醒神兵，选完海克斯后走入金色直达电梯！'
        : '无尽守关者已击破！收取补给，走入绿色电梯挑战更高楼层。';
    this.portalArmed = false;
    this.setMovement(0, 0);
    this.log(s.story.news, 'system');
  }

  private updateGroundLoot(dt: number): void {
    const s = this.state;
    const p = s.player;
    s.weaponDrops = s.weaponDrops.filter((drop) => {
      if (distance(p, drop) >= p.radius + 30) return true;
      this.collectDrop(drop);
      return false;
    });
    const pickupRadius = s.pickupRadius * (this.has('hoard') ? 2.8 : 1);
    s.crystals = s.crystals.filter((crystal) => {
      const d = distance(p, crystal);
      if (d < p.radius + 12) {
        s.xp += crystal.value;
        if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + (crystal.heal ?? 0));
        this.charge(0.8);
        this.onSound('pickup');
        return false;
      }
      if (crystal.attracted || d < pickupRadius) {
        crystal.attracted = true;
        const travel = Math.min(d, dt * (crystal.heal ? 700 : 400));
        crystal.x += (p.x - crystal.x) / d * travel;
        crystal.y += (p.y - crystal.y) / d * travel;
      }
      return true;
    });
  }

  private updateVisuals(dt: number): void {
    const s = this.state;
    s.levelPulse = Math.max(0, s.levelPulse - dt);
    s.shake = Math.max(0, s.shake - dt);
    for (const particle of s.particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.life -= dt; }
    s.particles = s.particles.filter((particle) => particle.life > 0);
    for (const text of s.damageTexts) { text.y -= dt * 32; text.life -= dt; }
    s.damageTexts = s.damageTexts.filter((text) => text.life > 0);
  }

  private finishFrame(dt: number): void {
    this.updateGroundLoot(dt);
    this.updateVisuals(dt);
    if (!this.settleOutcome()) this.checkChoices();
  }

  private step(dt: number): void {
    const s = this.state;
    const p = s.player;
    const d = s.dungeon;
    if (d.phase === 'transition') {
      d.transition = Math.max(0, d.transition - dt);
      p.moving = false;
      if (d.transition <= 1e-8) {
        d.phase = 'clearing';
        for (let i = 0; i < 5; i++) this.spawnEnemy(s.time);
        this.spawnTimer = s.time + 0.65;
        this.setMovement(0, 0);
      }
      return;
    }
    if (d.phase === 'portal') {
      const previous = { x: p.x, y: p.y };
      p.moving = Math.hypot(this.movement.x, this.movement.y) > 0.05;
      p.x = clamp(p.x + this.movement.x * p.speed * dt, 38, WORLD_WIDTH - 38);
      p.y = clamp(p.y + this.movement.y * p.speed * dt, 38, WORLD_HEIGHT - 38);
      resolveDungeonCollision(d, p, previous);
      if (p.moving) p.facing = Math.atan2(this.movement.y, this.movement.x);
      this.finishFrame(dt);
      if (s.status !== 'playing' || d.pendingHex) return;
      if (!this.portalArmed && d.portals.every((gate) => distance(gate, p) > gate.radius + p.radius + 8)) this.portalArmed = true;
      const gate = this.portalArmed && p.moving ? d.portals.find((portal) => distance(portal, p) < portal.radius + p.radius) : undefined;
      if (gate) this.changeFloor(gate.destination, gate.nextFloor);
      return;
    }

    const summonSlow = s.summonFlash > SUMMON_DURATION - 0.35;
    s.time = s.endless ? s.time + dt : Math.min(DIFFICULTIES[s.difficulty].timeLimit, s.time + dt);
    d.floorTime += dt;
    this.updateHoardBonus();
    const enteringBoss = d.phase === 'boss' && s.time < s.story.bossIntroUntil;
    p.invincible = Math.max(0, p.invincible - dt);
    s.summonFlash = Math.max(0, s.summonFlash - dt);
    this.updateEffects(dt);
    this.charge(dt * 2.1);
    const fx = s.effects;
    const worldDt = enteringBoss || fx.freeze > 0 ? 0 : dt * (fx.slow > 0 || summonSlow ? 0.2 : 1);
    d.playerInCoolant = d.coolantUntil > s.time && d.pools.some((pool) => distance(pool, p) <= pool.radius + p.radius * 0.4);
    const speed = p.speed * (1 + this.hoardBonus()) * (fx.slow > 0 ? 2 : 1)
      * (d.playerInCoolant ? 0.85 : 1) * (s.story.bullUntil > s.time ? 1.45 : 1);
    const previousPlayer = { x: p.x, y: p.y };
    p.moving = !enteringBoss && Math.hypot(this.movement.x, this.movement.y) > 0.05;
    if (!enteringBoss) {
      p.x = clamp(p.x + this.movement.x * speed * dt, 38, WORLD_WIDTH - 38);
      p.y = clamp(p.y + this.movement.y * speed * dt, 38, WORLD_HEIGHT - 38);
    }
    resolveDungeonCollision(d, p, previousPlayer);
    if (p.moving) p.facing = Math.atan2(this.movement.y, this.movement.x);

    updateStory(s, dt, worldDt, this.storyHooks);
    if (p.hp <= 0) { this.settleOutcome(); return; }
    if (d.phase === 'boss' && s.time < s.story.bossIntroUntil) {
      p.moving = false;
      p.invincible = Math.max(p.invincible, 0.6);
      this.spawnTimer = s.time + 0.65;
      this.finishFrame(dt);
      return;
    }
    updateDungeonEnvironment(s, dt, worldDt, this.storyHooks);
    if (p.hp <= 0) { this.settleOutcome(); return; }
    while (s.time + 1e-8 >= this.spawnTimer) {
      this.spawnEnemy(this.spawnTimer);
      const interval = Math.max(s.endless ? 0.18 : 0.25, 0.8 - d.floorTime * 0.006 - (d.floor - 1) * 0.09);
      this.spawnTimer += interval * (d.phase === 'boss' ? 1.65 : 1);
    }
    updateWeapons(s, dt, this.weaponHooks);
    if (s.bossDefeated && !s.endless) { this.settleOutcome(); return; }
    if (s.dungeon.phase === 'portal') { this.finishFrame(dt); return; }
    if (fx.chairActive) {
      this.chairTimer -= dt * (this.has('overwork') ? 1.15 : 1) * (fx.freeze > 0 ? 2 : 1) * (d.playerInCoolant ? 1 / 0.55 : 1);
      if (this.chairTimer <= 0) { this.chairTimer += 0.65; this.fireChairSword(); }
    } else this.chairTimer = 0;

    this.updateStrikes(dt);
    if (s.bossDefeated && !s.endless) { this.settleOutcome(); return; }
    if (s.dungeon.phase === 'portal') { this.finishFrame(dt); return; }
    this.updateEnemies(worldDt, dt);
    if (p.hp <= 0) { this.settleOutcome(); return; }

    for (const shot of s.projectiles) {
      let hitIds = this.projectileHits.get(shot);
      if (!hitIds) { hitIds = new Set(shot.hitIds); this.projectileHits.set(shot, hitIds); }
      let barrelHitIds = this.projectileBarrelHits.get(shot);
      if (!barrelHitIds) { barrelHitIds = new Set(); this.projectileBarrelHits.set(shot, barrelHitIds); }
      const previous = { x: shot.x, y: shot.y };
      if (shot.orbit) {
        const owner = shot.orbit.owner === 'clone' ? fx.clone : p;
        shot.orbit.remaining -= dt;
        shot.orbit.angle += dt * 10;
        shot.vx = Math.cos(shot.orbit.angle) * 850; shot.vy = Math.sin(shot.orbit.angle) * 850;
        if (owner) { shot.x = owner.x + Math.cos(shot.orbit.angle) * 66; shot.y = owner.y + Math.sin(shot.orbit.angle) * 66; }
        if (shot.orbit.remaining <= 0 || !owner) shot.orbit = undefined;
      } else {
        if (shot.homing) {
          const target = this.nearestEnemy(shot, hitIds);
          if (target) {
            const angle = Math.atan2(target.y - shot.y, target.x - shot.x);
            const speed = Math.hypot(shot.vx, shot.vy);
            shot.vx = Math.cos(angle) * speed; shot.vy = Math.sin(angle) * speed;
          }
        }
        shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      }
      shot.life -= dt;
      if (shot.life <= 0) continue;
      const dx = shot.x - previous.x; const dy = shot.y - previous.y;
      const lengthSquared = dx * dx + dy * dy;
      const obstacleT = !shot.evolved && shot.weapon !== 'crescent' ? projectileObstacleHit(d, previous, shot, shot.radius) : null;
      const limit = obstacleT ?? 1;
      const impacts: { t: number; enemy?: Enemy; barrel?: DungeonBarrel }[] = [];
      for (const enemy of s.enemies) {
        if (enemy.hp <= 0 || hitIds.has(enemy.id)) continue;
        const t = lengthSquared > 0 ? clamp(((enemy.x - previous.x) * dx + (enemy.y - previous.y) * dy) / lengthSquared, 0, 1) : 0;
        if (t <= limit && (enemy.x - previous.x - t * dx) ** 2 + (enemy.y - previous.y - t * dy) ** 2 <= (shot.radius + enemy.radius) ** 2) impacts.push({ t, enemy });
      }
      for (const barrel of d.barrels) {
        if (barrel.hp <= 0 || barrelHitIds.has(barrel.id)) continue;
        const t = lengthSquared > 0 ? clamp(((barrel.x - previous.x) * dx + (barrel.y - previous.y) * dy) / lengthSquared, 0, 1) : 0;
        if (t <= limit && (barrel.x - previous.x - t * dx) ** 2 + (barrel.y - previous.y - t * dy) ** 2 <= (shot.radius + barrel.radius) ** 2) impacts.push({ t, barrel });
      }
      impacts.sort((a, b) => a.t - b.t || Number(b.enemy?.kind === 'guard') - Number(a.enemy?.kind === 'guard'));
      for (const impact of impacts) {
        if (impact.enemy) {
          const enemy = impact.enemy;
          if (enemy.hp <= 0) continue;
          shot.hitIds.push(enemy.id);
          hitIds.add(enemy.id);
          const facingDelta = Math.atan2(Math.sin(Math.atan2(previous.y - enemy.y, previous.x - enemy.x) - enemy.chargeAngle),
            Math.cos(Math.atan2(previous.y - enemy.y, previous.x - enemy.x) - enemy.chargeAngle));
          const shield = enemy.kind === 'captain' && shot.weapon === 'gpu' && Math.abs(facingDelta) < Math.PI * 0.45;
          this.damageEnemy(enemy, shot.damage * (shield ? 0.5 : 1));
          shot.pierced--;
          if (shot.pierced <= 0 || enemy.kind === 'guard') { shot.life = 0; break; }
        } else if (impact.barrel) {
          if (impact.barrel.hp <= 0) continue;
          barrelHitIds.add(impact.barrel.id);
          damageBarrel(s, impact.barrel, shot.damage, this.storyHooks);
          shot.pierced--;
          if (shot.pierced <= 0) { shot.life = 0; break; }
        }
        if (s.dungeon.phase === 'portal' || (s.bossDefeated && !s.endless)) break;
      }
      if (obstacleT !== null && shot.life > 0) {
        shot.x = previous.x + dx * obstacleT; shot.y = previous.y + dy * obstacleT;
        shot.life = 0;
        this.burst(shot, '#6ad8de', 3);
      }
      if (s.dungeon.phase === 'portal' || (s.bossDefeated && !s.endless)) break;
    }
    if (s.bossDefeated && !s.endless) { this.settleOutcome(); return; }
    if (s.dungeon.phase === 'portal') { this.finishFrame(dt); return; }
    this.updateEnemyProjectiles(worldDt);
    s.enemies = s.enemies.filter((enemy) => enemy.hp > 0);
    s.projectiles = s.projectiles.filter((shot) => shot.life > 0 && shot.x > -40 && shot.x < WORLD_WIDTH + 40 && shot.y > -40 && shot.y < WORLD_HEIGHT + 40);
    if (p.hp <= 0) { this.settleOutcome(); return; }
    this.finishFrame(dt);
  }

  private createReport(victory: boolean): RunReport {
    const s = this.state;
    return {
      seed: s.seed, initialWeapon: s.initialWeapon, difficulty: s.difficulty, time: s.time, kills: s.kills, level: s.level,
      weapons: s.weapons.filter((weapon) => weapon.level > 0).map(({ id, level, evolved }) => ({ id, level, evolved })),
      equipped: [...s.equipped], hexes: [...s.hexes], summonHistory: [...s.summonHistory], victory,
      dungeonBranch: s.dungeon.branch, floorsCleared: s.dungeon.floorsCleared,
      highestFloor: s.dungeon.floor, endless: s.endless,
    };
  }

  private settleOutcome(): boolean {
    const s = this.state;
    if (s.player.hp <= 0) {
      s.status = 'defeat'; s.defeatReason = 'health'; s.report = this.createReport(false); this.onSound('defeat');
      this.log(s.endless ? `无尽深渊结束：止步第${s.dungeon.floor}层，生命耗尽。` : `第${s.dungeon.floor}层生命耗尽，突围失败。`, 'result');
    } else if (s.bossDefeated && !s.endless) {
      s.status = 'finishing'; s.blackFlash = 0.4; s.report = this.createReport(true); this.onSound('blackflash');
      this.log('黑闪！资本长老会主席已击败，神殿权限已收复。', 'result');
    } else if (!s.endless && s.time >= DIFFICULTIES[s.difficulty].timeLimit - 1e-8) {
      s.time = DIFFICULTIES[s.difficulty].timeLimit; s.status = 'defeat'; s.defeatReason = 'timeout'; s.report = this.createReport(false); this.onSound('defeat');
      this.log(`${DIFFICULTIES[s.difficulty].name}难度的 ${s.time} 秒战斗时间已到，高塔尚未突破，本局战败。`, 'result');
    } else return false;
    this.setMovement(0, 0);
    this.accumulator = 0;
    return true;
  }

  private spawnStoryEnemy(kind: EnemyKind, at: Point, options: Partial<Enemy> = {}): Enemy {
    const hp = kind === 'legal' ? 140 : kind === 'bull' ? 14 : 45;
    const enemy: Enemy = {
      id: -(++this.entityId), x: at.x, y: at.y, kind, hp, maxHp: hp,
      radius: kind === 'legal' ? 24 : 16, speed: kind === 'bull' ? 35 : 72,
      attackCooldown: 1.5, flash: 0, phase: 0, spawnGrace: 0.85, motionTime: 0,
      chargeState: 'approach', chargeTime: 0, chargeAngle: 0, ...options,
    };
    if (kind !== 'boss') {
      const difficulty = DIFFICULTIES[this.state.difficulty];
      enemy.hp = Math.max(1, Math.round(enemy.hp * difficulty.enemyHpMultiplier));
      enemy.maxHp = Math.max(1, Math.round(enemy.maxHp * difficulty.enemyHpMultiplier));
      enemy.speed *= difficulty.enemySpeedMultiplier;
    }
    if (!enemy.ringMember && !['ghost', 'drone', 'vulture', 'guard'].includes(kind)) {
      const point = findOpenPoint(this.state.dungeon, enemy, enemy.radius);
      enemy.x = point.x; enemy.y = point.y;
    }
    this.makeEnemySpace();
    this.state.enemies.push(enemy);
    return enemy;
  }

  private makeEnemySpace(): void {
    const s = this.state;
    s.enemies = s.enemies.filter((enemy) => enemy.hp > 0);
    if (s.enemies.length < 140) return;
    const index = s.enemies.findIndex((enemy) => enemy.kind !== 'boss' && enemy.kind !== 'guard' && !enemy.ringMember && !enemy.supplyKey);
    if (index >= 0) { this.enemyRoutes.delete(s.enemies[index].id); s.enemies.splice(index, 1); }
  }

  private spawnEnemy(at: number): void {
    const s = this.state;
    const dungeon = s.dungeon;
    const difficulty = DIFFICULTIES[s.difficulty];
    const elapsed = Math.max(0, at - (s.time - dungeon.floorTime));
    const side = Math.floor(this.spawnRandom() * 4);
    const position = this.spawnRandom();
    this.floorSpawnCount++;
    const room = dungeon.map === 'cryo' || dungeon.map === 'darknet' || dungeon.map === 'singularity';
    const kind: EnemyKind = dungeon.map === 'plaza'
      ? elapsed >= 8 && this.floorSpawnCount % 4 === 0 ? 'keyboard' : 'reporter'
      : room ? this.floorSpawnCount % 4 === 0 ? 'drone' : 'fan'
        : this.floorSpawnCount % 4 === 0 ? 'vulture' : 'quant';
    const group = kind === 'quant' && this.floorSpawnCount % 3 === 0 ? 3 : 1;
    const hp = (kind === 'fan' ? 64 : kind === 'drone' ? 82 : kind === 'vulture' ? 94 : kind === 'quant' ? 104 : kind === 'keyboard' ? 38 : 30)
      + Math.floor(elapsed / 15) * (room || dungeon.map === 'temple' ? 7 : 5);
    const x = side === 0 ? -24 : side === 1 ? WORLD_WIDTH + 24 : 24 + position * (WORLD_WIDTH - 48);
    const y = side === 2 ? -24 : side === 3 ? WORLD_HEIGHT + 24 : 24 + position * (WORLD_HEIGHT - 48);
    const speed = (kind === 'fan' ? 126 : kind === 'drone' ? 72 : kind === 'vulture' ? 88 : kind === 'quant' ? 70 : kind === 'keyboard' ? 53 : 67)
      + this.spawnRandom() * 14 + Math.min(22, elapsed * 0.3);
    const phase = this.spawnRandom() * Math.PI * 2;
    for (let i = 0; i < group; i++) {
      this.makeEnemySpace();
      const offset = (i - (group - 1) / 2) * 44;
      this.spawnCount++;
      s.enemies.push({
        id: this.spawnCount, x: x + (side >= 2 ? offset : 0), y: y + (side < 2 ? offset : 0),
        kind, attackCooldown: 1.5 + i * 0.08,
        radius: kind === 'fan' ? 18 : kind === 'drone' || kind === 'vulture' ? 19 : 16,
        hp: Math.round(hp * dungeon.enemyHpMultiplier * difficulty.enemyHpMultiplier), maxHp: Math.round(hp * dungeon.enemyHpMultiplier * difficulty.enemyHpMultiplier),
        speed: speed * dungeon.enemySpeedMultiplier * difficulty.enemySpeedMultiplier, flash: 0, phase: phase + i * 0.15, spawnGrace: 0.85, motionTime: 0,
        chargeState: 'approach', chargeTime: 0, chargeAngle: 0,
      });
    }
  }

  private moveGroundEnemy(enemy: Enemy, target: Point, travel: number): void {
    const dungeon = this.state.dungeon;
    const previous = { x: enemy.x, y: enemy.y };
    let destination = target;
    const blockedDirect = dungeon.obstacles.length > 0 && projectileObstacleHit(dungeon, enemy, target, enemy.radius + 5) !== null;
    if (!blockedDirect) this.enemyRoutes.delete(enemy.id);
    else {
      let route = this.enemyRoutes.get(enemy.id);
      while (route?.points.length && distance(enemy, route.points[0]) <= 8) route.points.shift();
      if (!route?.points.length || route.expires < this.state.time
        || projectileObstacleHit(dungeon, enemy, route.points[0], enemy.radius + 2) !== null) {
        let nearestT = Infinity;
        let blocked: typeof dungeon.obstacles[number] | undefined;
        for (const obstacle of dungeon.obstacles) {
          const t = projectileObstacleHit({ ...dungeon, obstacles: [obstacle] }, enemy, target, enemy.radius + 5);
          if (t !== null && t < nearestT) { nearestT = t; blocked = obstacle; }
        }
        if (blocked) {
          const margin = enemy.radius + 14;
          const corners = [
            { x: blocked.x - blocked.width / 2 - margin, y: blocked.y - blocked.height / 2 - margin },
            { x: blocked.x + blocked.width / 2 + margin, y: blocked.y - blocked.height / 2 - margin },
            { x: blocked.x - blocked.width / 2 - margin, y: blocked.y + blocked.height / 2 + margin },
            { x: blocked.x + blocked.width / 2 + margin, y: blocked.y + blocked.height / 2 + margin },
          ];
          const blockedLeg = (from: Point, to: Point) => projectileObstacleHit(dungeon, from, to, enemy.radius + 2) !== null;
          let best = Infinity;
          let points: Point[] = [];
          for (const first of corners) {
            const approach = distance(enemy, first) + (blockedLeg(enemy, first) ? 4000 : 0);
            const singleScore = approach + distance(first, target) + (blockedLeg(first, target) ? 1500 : 0);
            if (singleScore < best && distance(enemy, first) > 8) { best = singleScore; points = [first]; }
            for (const second of corners) {
              if (first === second || (first.x !== second.x && first.y !== second.y)) continue;
              const score = approach + distance(first, second) + distance(second, target)
                + (blockedLeg(first, second) ? 4000 : 0) + (blockedLeg(second, target) ? 1500 : 0);
              if (score < best) { best = score; points = distance(enemy, first) <= 8 ? [second] : [first, second]; }
            }
          }
          route = { points, expires: this.state.time + 2.5 };
          this.enemyRoutes.set(enemy.id, route);
        }
      }
      if (route?.points.length) destination = route.points[0];
    }
    const d = distance(enemy, destination);
    if (d > 0) {
      const step = Math.min(travel, d);
      enemy.x += (destination.x - enemy.x) / d * step;
      enemy.y += (destination.y - enemy.y) / d * step;
    }
    resolveDungeonCollision(dungeon, enemy, previous);
    enemy.x = clamp(enemy.x, -28, WORLD_WIDTH + 28);
    enemy.y = clamp(enemy.y, -28, WORLD_HEIGHT + 28);
  }

  private updateEnemies(worldDt: number, dt: number): void {
    const s = this.state;
    const p = s.player;
    const field = s.weapons.find((weapon) => weapon.id === 'cuda' && weapon.evolved && s.equipped.includes('cuda'));
    const fieldRadius = 210 * this.sizeMultiplier();
    for (const enemy of s.enemies) {
      if (enemy.hp <= 0 || enemy.kind === 'boss' || enemy.kind === 'guard' || enemy.ringMember) continue;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.motionTime += worldDt;
      if (enemy.spawnGrace > 0) { enemy.spawnGrace = Math.max(0, enemy.spawnGrace - worldDt); continue; }
      const d = distance(p, enemy);
      if (s.effects.wall > 0 && d < 74 * this.sizeMultiplier() + enemy.radius) {
        this.damageEnemy(enemy, ['legal', 'captain', 'ghost', 'ironGuard'].includes(enemy.kind) && enemy.supplyKey ? 125 : enemy.hp + 1, false);
        continue;
      }
      if (worldDt <= 0) continue;
      const inField = field && (d < fieldRadius + enemy.radius || (s.effects.clone && distance(s.effects.clone, enemy) < fieldRadius + enemy.radius));
      const inCoolant = s.dungeon.coolantUntil > s.time && s.dungeon.pools.some((pool) => distance(pool, enemy) < pool.radius + enemy.radius);
      const speedMultiplier = (this.has('overwork') ? 1.1 : 1) * (inField ? 0.4 : 1) * (inCoolant ? 0.2 : 1);
      enemy.attackCooldown -= worldDt;
      if (enemy.kind === 'bull') {
        if (d > 0 && d < 300) {
          let angle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
          if (enemy.x < 45 || enemy.x > WORLD_WIDTH - 45 || enemy.y < 45 || enemy.y > WORLD_HEIGHT - 45) angle += Math.PI / 2;
          enemy.x = clamp(enemy.x + Math.cos(angle) * enemy.speed * worldDt, 28, WORLD_WIDTH - 28);
          enemy.y = clamp(enemy.y + Math.sin(angle) * enemy.speed * worldDt, 28, WORLD_HEIGHT - 28);
        }
        continue;
      }
      if (enemy.kind === 'captain') enemy.chargeAngle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      if (enemy.kind === 'ghost' && enemy.attackCooldown <= 0) {
        const angle = enemy.phase + enemy.motionTime * 0.7;
        const at = pointNearPlayer(p, angle, enemy.supplyKey ? 130 : 170);
        enemy.x = at.x; enemy.y = at.y; enemy.flash = 0.1; enemy.spawnGrace = 0.28;
        enemy.attackCooldown = enemy.supplyKey ? 2.6 : 3.4;
        this.burst(enemy, '#82cfff', 6);
        continue;
      }
      if (enemy.kind === 'security') {
        if (enemy.chargeState === 'aim') {
          enemy.chargeTime -= worldDt;
          if (enemy.chargeTime <= 0) { enemy.chargeState = 'dash'; enemy.chargeTime = 0.65; }
        } else if (enemy.chargeState === 'dash') {
          const previous = { x: enemy.x, y: enemy.y };
          enemy.x = clamp(enemy.x + Math.cos(enemy.chargeAngle) * 760 * speedMultiplier * worldDt, -28, WORLD_WIDTH + 28);
          enemy.y = clamp(enemy.y + Math.sin(enemy.chargeAngle) * 760 * speedMultiplier * worldDt, -28, WORLD_HEIGHT + 28);
          resolveDungeonCollision(s.dungeon, enemy, previous);
          enemy.chargeTime -= worldDt;
          if (enemy.chargeTime <= 0) { enemy.chargeState = 'approach'; enemy.attackCooldown = 3; }
        } else if (enemy.attackCooldown <= 0 && d < 600) {
          enemy.chargeState = 'aim'; enemy.chargeTime = 0.9;
          enemy.chargeAngle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
        } else this.moveGroundEnemy(enemy, p, enemy.speed * worldDt * speedMultiplier);
      } else {
        const ranged = ['keyboard', 'drone', 'quant', 'short', 'legal'].includes(enemy.kind);
        const standoff = enemy.kind === 'drone' ? 310 : enemy.kind === 'legal' ? 220 : 270;
        if (d > 1 && !(ranged && d < standoff)) {
          const travel = enemy.speed * worldDt * speedMultiplier;
          if (['drone', 'vulture', 'ghost'].includes(enemy.kind)) {
            enemy.x += (p.x - enemy.x) / d * travel;
            enemy.y += (p.y - enemy.y) / d * travel;
          } else this.moveGroundEnemy(enemy, p, travel);
        }
        if (ranged && enemy.attackCooldown <= 0) {
          enemy.attackCooldown = enemy.kind === 'quant' ? 2.5 : enemy.kind === 'drone' ? 3.2 : enemy.kind === 'legal' ? 2.8 : 2.1;
          this.enemyFire(enemy);
        }
        if (enemy.kind === 'vulture' && enemy.attackCooldown <= 0 && s.story.crashes.length < 24) {
          enemy.attackCooldown = 3.6;
          const at = pointNearPlayer(p, enemy.phase + enemy.motionTime, 30);
          s.story.crashes.push({ id: this.entityId++, ...at, radius: 43, delay: 1.1, life: 0.4, hit: false });
        }
      }
      if (distance(p, enemy) < p.radius + enemy.radius) {
        this.hurtPlayer(enemy.kind === 'ironGuard' ? 24 : enemy.kind === 'fan' ? 19 : enemy.kind === 'legal' || enemy.kind === 'captain' ? 18 : enemy.chargeState === 'dash' ? 22 : 12);
      }
    }
  }

  private nearestEnemy(at: Point, ignoredIds: readonly number[] | ReadonlySet<number> = []): Enemy | undefined {
    let nearest: Enemy | undefined;
    let nearestDistance = Infinity;
    const ignored: ReadonlySet<number> | null = Array.isArray(ignoredIds)
      ? ignoredIds.length > 0 ? new Set<number>(ignoredIds) : null
      : ignoredIds as ReadonlySet<number>;
    for (const enemy of this.state.enemies) {
      const d = (at.x - enemy.x) ** 2 + (at.y - enemy.y) ** 2;
      if ((enemy.kind === 'boss' || enemy.kind === 'guard') && this.state.time < this.state.story.bossIntroUntil) continue;
      if (enemy.hp > 0 && !ignored?.has(enemy.id) && d < nearestDistance) { nearest = enemy; nearestDistance = d; }
    }
    return nearest;
  }

  private nearestBarrel(at: Point): DungeonBarrel | undefined {
    let nearest: DungeonBarrel | undefined;
    let nearestDistance = 420;
    for (const barrel of this.state.dungeon.barrels) {
      const d = distance(at, barrel);
      if (barrel.hp > 0 && d < nearestDistance && projectileObstacleHit(this.state.dungeon, at, barrel, 5) === null) {
        nearest = barrel; nearestDistance = d;
      }
    }
    return nearest;
  }

  private fireChairSword(): void {
    const s = this.state;
    const nearest = this.nearestEnemy(s.player);
    if (!nearest || s.projectiles.length >= MAX_PROJECTILES) return;
    const angle = Math.atan2(nearest.y - s.player.y, nearest.x - s.player.x);
    s.projectiles.push({
      id: this.entityId++, x: s.player.x, y: s.player.y,
      vx: Math.cos(angle) * 670, vy: Math.sin(angle) * 670, radius: 9 * this.sizeMultiplier(),
      damage: s.damage * 1.4 * (this.has('overwork') ? 1.25 : 1), life: 2,
      pierced: 2, hitIds: [], homing: true, weapon: 'gpu',
    });
    this.onSound('shoot');
  }

  private enemyFire(enemy: Enemy): void {
    const s = this.state;
    const angle = Math.atan2(s.player.y - enemy.y, s.player.x - enemy.x);
    const document = enemy.kind === 'legal';
    const keyboard = enemy.kind === 'keyboard';
    const drone = enemy.kind === 'drone';
    const quant = enemy.kind === 'quant';
    const count = document || keyboard || quant ? 3 : 1;
    const speed = quant ? 320 : drone ? 210 : document ? 140 : 175;
    for (let i = 0; i < count && s.enemyProjectiles.length < 100; i++) {
      const a = angle + (i - (count - 1) / 2) * (quant ? 0.12 : keyboard ? 0.1 : 0.3);
      s.enemyProjectiles.push({
        id: this.entityId++, x: enemy.x - Math.sin(a) * (quant ? (i - 1) * 12 : 0),
        y: enemy.y + Math.cos(a) * (quant ? (i - 1) * 12 : 0),
        vx: Math.cos(a) * (speed + (keyboard ? i * 20 : 0)), vy: Math.sin(a) * (speed + (keyboard ? i * 20 : 0)),
        radius: document ? 10 : drone ? 7 : 6, damage: document ? 16 : quant ? 13 : drone ? 14 : 10, life: 7,
        shape: document ? 'document' : keyboard ? 'at' : drone ? 'missile' : quant ? 'data' : 'arrow',
        rotation: a, homing: drone, ignoresObstacles: drone,
      });
    }
  }

  private updateEnemyProjectiles(dt: number): void {
    const s = this.state;
    const fx = s.effects;
    for (const shot of s.enemyProjectiles) {
      const previous = { x: shot.x, y: shot.y };
      if (shot.homing && shot.life > 3.5 && dt > 0) {
        const current = Math.atan2(shot.vy, shot.vx);
        const desired = Math.atan2(s.player.y - shot.y, s.player.x - shot.x);
        const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
        const angle = current + clamp(delta, -dt * 1.8, dt * 1.8);
        const speed = Math.hypot(shot.vx, shot.vy);
        shot.vx = Math.cos(angle) * speed; shot.vy = Math.sin(angle) * speed; shot.rotation = angle;
      }
      if (shot.boomerang && !shot.boomerang.returning) {
        shot.boomerang.returnAfter -= dt;
        if (shot.boomerang.returnAfter <= 0) {
          shot.boomerang.returning = true; shot.vx *= -1; shot.vy *= -1;
        }
      }
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      if (shot.shape === 'document') shot.rotation += dt * 5;
      if (shot.life <= 0) continue;
      if (!shot.ignoresObstacles && projectileObstacleHit(s.dungeon, previous, shot, shot.radius) !== null) { shot.life = 0; continue; }
      if (shot.boomerang?.returning && distance(shot, shot.boomerang.origin) < shot.radius + 14) { shot.life = 0; continue; }
      const dx = shot.x - previous.x; const dy = shot.y - previous.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared > 0 ? clamp(((s.player.x - previous.x) * dx + (s.player.y - previous.y) * dy) / lengthSquared, 0, 1) : 0;
      const d = Math.hypot(s.player.x - previous.x - t * dx, s.player.y - previous.y - t * dy);
      if (fx.wall > 0 && d < 74 * this.sizeMultiplier() + shot.radius) {
        this.reflect(shot, 4); shot.life = 0;
      } else if (fx.freeze <= 0 && d < s.player.radius + shot.radius) {
        if (this.has('parry') && fx.parryCooldown <= 0) {
          this.reflect(shot, 5); fx.parryCooldown = 6; fx.arc = 0.25; this.onSound('parry');
        } else this.hurtPlayer(shot.damage);
        shot.life = 0;
      }
    }
    s.enemyProjectiles = s.enemyProjectiles.filter((shot) => shot.life > 0 && shot.x > -40 && shot.x < WORLD_WIDTH + 40 && shot.y > -40 && shot.y < WORLD_HEIGHT + 40);
  }

  private reflect(shot: EnemyProjectile, multiplier: number): void {
    const s = this.state;
    const target = this.nearestEnemy(shot);
    const angle = target ? Math.atan2(target.y - shot.y, target.x - shot.x) : Math.atan2(-shot.vy, -shot.vx);
    if (s.projectiles.length < MAX_PROJECTILES) s.projectiles.push({
      id: this.entityId++, x: shot.x, y: shot.y, vx: Math.cos(angle) * 520, vy: Math.sin(angle) * 520,
      radius: 8 * this.sizeMultiplier(), damage: shot.damage * multiplier, life: 2, pierced: 2, hitIds: [], homing: true, weapon: 'reflected',
    });
    this.burst(shot, '#edcd80', 5);
  }

  private updateStrikes(dt: number): void {
    const s = this.state;
    for (const strike of s.strikes) {
      if (strike.delay > 0) {
        strike.delay -= dt;
        if (strike.delay <= 0) {
          s.shake = 0.22;
          this.burst(strike, '#f4a36e', 16);
          for (const enemy of s.enemies) if (distance(strike, enemy) < strike.radius + enemy.radius) this.damageEnemy(enemy, 85 + s.level * 8, false);
          for (const barrel of s.dungeon.barrels) if (barrel.hp > 0 && distance(strike, barrel) < strike.radius + barrel.radius) damageBarrel(s, barrel, 100, this.storyHooks);
          strike.tick = 0.3;
        }
        continue;
      }
      strike.life -= dt;
      strike.tick -= dt;
      if (strike.tick <= 0) {
        strike.tick += 0.3;
        for (const enemy of s.enemies) if (distance(strike, enemy) < strike.radius + enemy.radius) this.damageEnemy(enemy, 10 + s.level * 2, false);
        for (const barrel of s.dungeon.barrels) if (barrel.hp > 0 && distance(strike, barrel) < strike.radius + barrel.radius) damageBarrel(s, barrel, 10 + s.level * 2, this.storyHooks);
      }
    }
    s.strikes = s.strikes.filter((strike) => strike.delay > 0 || strike.life > 0);
  }

  private hurtPlayer(amount: number): void {
    const s = this.state;
    const p = s.player;
    if (p.invincible > 0 || s.effects.wall > 0 || p.hp <= 0) return;
    const damage = Math.max(1, Math.round(amount * DIFFICULTIES[s.difficulty].enemyDamageMultiplier * (s.effects.chairActive ? 0.3 : 1) * (this.has('armor') ? 0.5 : 1) * (this.has('reckless') ? 1.15 : 1)));
    p.hp = Math.max(0, p.hp - damage);
    p.invincible = 0.85;
    s.shake = 0.18;
    this.burst(p, '#ff866b', 10);
    this.addText(p, `−${damage}`, '#ff967b');
    this.onSound('hurt');
    if (this.has('armor')) {
      s.effects.arc = 0.3;
      for (const enemy of s.enemies) {
        const d = distance(p, enemy);
        if (enemy.hp <= 0 || d > 115 * this.sizeMultiplier()) continue;
        this.damageEnemy(enemy, 12 + s.level * 3, false);
        if (['boss', 'guard', 'fan'].includes(enemy.kind) || enemy.ringMember) continue;
        const angle = d > 0 ? Math.atan2(enemy.y - p.y, enemy.x - p.x) : enemy.phase;
        const previous = { x: enemy.x, y: enemy.y };
        enemy.x = clamp(enemy.x + Math.cos(angle) * 75, 24, WORLD_WIDTH - 24);
        enemy.y = clamp(enemy.y + Math.sin(angle) * 75, 24, WORLD_HEIGHT - 24);
        if (!['drone', 'vulture', 'ghost'].includes(enemy.kind)) resolveDungeonCollision(s.dungeon, enemy, previous);
      }
    }
  }

  private damageEnemy(enemy: Enemy, amount: number, canCrit = true): void {
    if (enemy.hp <= 0 || amount <= 0 || !Number.isFinite(amount)) return;
    const s = this.state;
    if ((enemy.kind === 'boss' || enemy.kind === 'guard') && s.time < s.story.bossIntroUntil) return;
    if (enemy.kind === 'boss' && s.story.bossPhaseGuardRemaining > 0) return;
    const blackout = s.story.blackoutUntil > s.time;
    const critical = canCrit && this.combatRandom() < Math.min(1, (0.1 + this.hoardBonus()) * (blackout ? 2 : 1));
    const elite = !!enemy.supplyKey || enemy.kind === 'legal' || enemy.kind === 'captain' || enemy.kind === 'ironGuard';
    let damage = Math.max(1, Math.round(amount * (critical ? 2 : 1) * (this.has('reckless') && (elite || enemy.kind === 'boss') ? 1.6 : 1)
      * (enemy.kind === 'boss' ? 1 - DIFFICULTIES[s.difficulty].bossDamageReduction : 1)));
    const phaseThreshold = Math.max(1, Math.floor(enemy.maxHp * 0.5));
    const phaseBreak = enemy.kind === 'boss' && enemy.bossType === 'chairman' && s.story.bossPhase === 1 && enemy.hp - damage <= phaseThreshold;
    if (phaseBreak) damage = Math.min(damage, Math.max(0, enemy.hp - phaseThreshold));
    enemy.hp -= damage;
    if (phaseBreak) triggerBossEnrage(s, enemy, this.storyHooks);
    enemy.flash = 0.08;
    this.addText(enemy, critical ? `${damage}!` : String(damage), critical ? '#f1ce84' : '#d4edc7');
    if (critical && this.has('vampire') && this.combatRandom() < 0.15 && s.player.hp > 0) s.player.hp = Math.min(s.player.maxHp, s.player.hp + 1);
    this.onSound('hit');
    if (enemy.hp > 0) return;
    this.enemyRoutes.delete(enemy.id);
    s.kills++;
    s.dungeon.kills++;
    if (s.dungeon.phase === 'clearing' && enemy.kind !== 'bull' && enemy.kind !== 'guard') {
      s.dungeon.killProgress = Math.min(25, s.dungeon.killProgress + (elite ? 3.5 : 0.55));
    }
    this.charge(enemy.kind === 'boss' ? 25 : enemy.kind === 'ironGuard' ? 35 : elite ? 18 : enemy.kind === 'bull' ? 12 : 1.1);
    this.burst(enemy, enemy.kind === 'bull' ? '#edcd80' : '#b6ed76', 6);
    if (enemy.kind === 'boss') { this.finishFloorBoss(enemy); return; }
    this.dropCrystal(enemy, enemy.kind === 'ironGuard' ? 60 : elite ? 30 : enemy.kind === 'bull' ? 12 : ['security', 'drone', 'quant'].includes(enemy.kind) ? 8 : enemy.kind === 'fan' || enemy.kind === 'vulture' ? 6 : 4, 0, enemy.kind === 'bull');
    if (enemy.supplyKey && !s.story.fired.includes(enemy.supplyKey)) {
      s.story.fired.push(enemy.supplyKey);
      this.dropSupply(enemy, enemy.kind === 'captain' ? '外围保安队长 · 第2把武器箱'
        : enemy.kind === 'ghost' ? '数据审计幽灵 · 第3把武器补给'
          : enemy.kind === 'ironGuard' ? '董事会铁卫 · 武器匣终极补给' : '冷血法务没收品', false, true);
      return;
    }
    if (enemy.kind === 'legal') {
      const owned = s.weapons.filter((weapon) => weapon.level > 0);
      const weapon = owned[Math.floor(this.weaponDropRandom() * owned.length)].id;
      this.dropSupply(enemy, '冷血法务没收品', false, false, weapon);
    }
  }

  private dropCrystal(at: Point, value: number, heal = 0, attracted = false): void {
    const s = this.state;
    const point = findOpenPoint(s.dungeon, at, 10);
    if (s.crystals.length < 180) {
      s.crystals.push({ id: this.entityId++, ...point, value, heal, attracted, phase: this.visualRandom() * Math.PI * 2 });
    } else {
      // Merge capped drops rather than silently losing experience or healing.
      let nearest = s.crystals[0];
      let nearestDistance = (nearest.x - point.x) ** 2 + (nearest.y - point.y) ** 2;
      for (const crystal of s.crystals) {
        const d = (crystal.x - point.x) ** 2 + (crystal.y - point.y) ** 2;
        if (d < nearestDistance) { nearest = crystal; nearestDistance = d; }
      }
      nearest.value += value;
      nearest.heal = (nearest.heal ?? 0) + heal;
      nearest.attracted ||= attracted;
    }
  }

  private checkChoices(): void {
    const s = this.state;
    if (s.status !== 'playing') return;
    while (s.xp >= s.xpNeeded) {
      s.xp -= s.xpNeeded;
      s.level++;
      s.xpNeeded = 16 + s.level * 6;
      this.strengthenPriority();
      s.levelPulse = 0.4;
      for (const enemy of s.enemies) {
        if (enemy.kind === 'boss' || enemy.kind === 'guard' || enemy.kind === 'fan' || enemy.ringMember) continue;
        const d = distance(s.player, enemy);
        if (d > 0 && d < 125) {
          const previous = { x: enemy.x, y: enemy.y };
          enemy.x = clamp(enemy.x + (enemy.x - s.player.x) / d * 32, 24, WORLD_WIDTH - 24);
          enemy.y = clamp(enemy.y + (enemy.y - s.player.y) / d * 32, 24, WORLD_HEIGHT - 24);
          if (!['drone', 'vulture', 'ghost'].includes(enemy.kind)) resolveDungeonCollision(s.dungeon, enemy, previous);
        }
      }
    }
    if (!s.endless && s.dungeon.pendingHex && s.hexRound < HEX_TIMES.length) {
      const ids = s.hexSchedule[s.hexRound].filter((id) => !s.hexes.includes(id)).slice(0, 3);
      s.hexChoices = ids.map((id) => HEXTECH.find((card) => card.id === id)!);
      s.hexSeen = [...ids];
      s.hexRerolls = [false, false, false];
      this.log(`第 ${s.hexRound + 1} 次海克斯选取已开启，战场暂停。`, 'hex');
      s.status = 'hex';
      this.setMovement(0, 0);
      this.onSound('upgrade');
    }
  }

  private burst(at: Point, color: string, count: number): void {
    const s = this.state;
    for (let i = 0; i < count && s.particles.length < 180; i++) {
      const angle = this.visualRandom() * Math.PI * 2;
      const speed = 30 + this.visualRandom() * 100;
      const life = 0.25 + this.visualRandom() * 0.3;
      s.particles.push({ x: at.x, y: at.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: 2 + this.visualRandom() * 3, color });
    }
  }

  private addText(at: Point, text: string, color: string): void {
    if (this.state.damageTexts.length >= 45) return;
    this.state.damageTexts.push({ x: at.x, y: at.y - 20, text, color, life: 0.7 });
  }
}
