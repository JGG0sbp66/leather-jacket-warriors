import { HEXTECH } from '../data/hextech.ts';
import { ALLIES } from '../data/summons.ts';
import { WEAPONS } from '../data/weapons.ts';
import { initialStory, updateStory } from './StorySystem.ts';
import type { StoryHooks } from './StorySystem.ts';
import { updateWeapons } from './WeaponSystem.ts';
import type { WeaponHooks } from './WeaponSystem.ts';
import { mulberry32 } from '../utils/prng.ts';
import { FIXED_STEP, HEX_TIMES, MAX_BATTLE_LOG_ENTRIES, MAX_PROJECTILES, RUN_DURATION, SUMMON_DURATION, WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import type { AllyId, BattleLogEntry, Enemy, EnemyKind, EnemyProjectile, GameSnapshot, GameState, HexId, Point, RunReport, SoundName, WeaponId, WeaponState } from '../types/game.ts';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

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
  private entityId = 0;
  private logId = 0;

  constructor(seed: number, onSound: (name: SoundName) => void = () => {}, initialWeapon: WeaponId = 'gpu') {
    this.state = this.initialState(seed, initialWeapon);
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
      onSound,
    };
    this.storyHooks = {
      nextId: () => this.entityId++,
      spawnEnemy: (kind, at, options) => this.spawnStoryEnemy(kind, at, options),
      damageEnemy: (enemy, amount, canCrit) => this.damageEnemy(enemy, amount, canCrit),
      hurtPlayer: (amount) => this.hurtPlayer(amount),
      dropSupply: (at, source, core, newWeapon) => this.dropSupply(at, source, core, newWeapon),
      dropCrystal: (at, value, heal, attracted) => this.dropCrystal(at, value, heal, attracted),
      charge: (amount) => this.charge(amount),
      onNews: (text) => this.log(text, 'event'),
      onSound,
    };
    this.prepareHexSchedule();
    this.prepareDropOrder();
  }

  private initialState(seed: number, initialWeapon: WeaponId): GameState {
    return {
      status: 'ready', seed: seed >>> 0, time: 0, level: 1, xp: 0, xpNeeded: 12,
      kills: 0, energy: 0, summons: 0, damage: 20,
      fireInterval: 0.48, projectileCount: 1, pickupRadius: 105,
      initialWeapon, equipped: [initialWeapon, null, null], priorityWeapon: initialWeapon,
      weapons: Object.values(WEAPONS).map(({ id }) => ({ id, level: id === initialWeapon ? 1 : 0, evolved: false, nextFireTime: 0 })),
      weaponEffects: [], weaponDrops: [], logs: [], levelPulse: 0, inventoryLockedUntil: 0,
      story: initialStory(), endless: false, bossDefeated: false, blackFlash: 0, defeatReason: null, report: null,
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

  start(): void {
    if (this.state.status !== 'ready') return;
    this.state.status = 'playing';
    this.log(`已接入算力神殿，起手武器：${WEAPONS[this.state.initialWeapon].name}。`, 'system');
    this.log(this.state.story.news, 'system');
    for (let i = 0; i < 5; i++) this.spawnEnemy(0);
    this.spawnTimer = 0.65;
  }

  returnToLobby(seed = this.state.seed, initialWeapon: WeaponId = 'gpu'): void {
    this.state = this.initialState(seed, initialWeapon);
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
    this.entityId = 0;
    this.logId = 0;
    this.setMovement(0, 0);
  }

  restart(seed = this.state.seed): void {
    this.returnToLobby(seed, this.state.initialWeapon);
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
    if (s.status !== 'playing' || s.time < s.inventoryLockedUntil) return false;
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
    s.player.invincible = 1;
    s.story = initialStory();
    s.story.event = 'endless';
    s.story.news = '无尽股东大会模式：会议没有散场，算力永不打烊。';
    s.enemyProjectiles = [];
    s.enemies = [];
    s.inventoryLockedUntil = 0;
    this.setMovement(0, 0);
    this.accumulator = 0;
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
    return this.has('hoard') ? Math.min(0.9, this.state.crystals.filter((crystal) => crystal.value > 0).length * 0.015) : 0;
  }
  private charge(amount: number): void {
    this.state.energy = Math.min(100, this.state.energy + amount * (this.has('network') ? 1.45 : 1));
  }

  requestSummon(): boolean {
    const s = this.state;
    if (s.status !== 'playing' || s.energy < 100) return false;
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
    this.settleOutcome();
    return true;
  }

  activateSlow(automatic = false): boolean {
    const s = this.state;
    const fx = s.effects;
    if (s.status !== 'playing' || !this.has('chrono') || fx.slow > 0) return false;
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
      s.damage *= 1.1;
      this.log('超频溢出：全武器永久伤害 +10%', 'upgrade');
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

  private collectWeapon(id: WeaponId): void {
    const s = this.state;
    const weapon = s.weapons.find((item) => item.id === id)!;
    if (weapon.level > 0) { this.strengthen(weapon); return; }
    weapon.level = 1;
    const slot = s.equipped.indexOf(null);
    if (slot >= 0) {
      s.equipped[slot] = id;
      this.log(`[${WEAPONS[id].name}] 已自动装备至 ${slot + 1}号槽！`);
    } else this.log(`[${WEAPONS[id].name}] 已收入武器匣（按 B 换装）`);
    this.ensurePriority();
    this.onSound('pickup');
  }

  private dropSupply(at: Point, source: string, core: boolean, newWeapon: boolean, bonusWeapon?: WeaponId): void {
    let weapon: WeaponId | null = bonusWeapon ?? null;
    if (newWeapon && this.dropIndex < this.dropOrder.length) weapon = this.dropOrder[this.dropIndex++];
    else if (newWeapon) {
      const owned = this.state.weapons.filter((item) => item.level > 0);
      weapon = owned[Math.floor(this.weaponDropRandom() * owned.length)].id;
    }
    const s = this.state;
    if (s.weaponDrops.length >= 12) {
      const oldest = s.weaponDrops.shift()!;
      if (oldest.weapon) this.collectWeapon(oldest.weapon);
      if (oldest.core) this.strengthenPriority();
    }
    s.weaponDrops.push({ id: this.entityId++, x: clamp(at.x, 50, WORLD_WIDTH - 50), y: clamp(at.y, 50, WORLD_HEIGHT - 50), weapon, core, source });
    this.log(`${source}：${weapon ? WEAPONS[weapon].name : '超频晶核'}，靠近拾取`);
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
    const boss = s.enemies.find((enemy) => enemy.id === s.story.bossId && enemy.hp > 0);
    return {
      status: s.status, seed: s.seed, time: s.time, level: s.level,
      xp: s.xp, xpNeeded: s.xpNeeded, kills: s.kills, energy: s.energy,
      summons: s.summons, weapons: s.weapons.map((weapon) => ({ ...weapon })), hp: s.player.hp,
      maxHp: s.player.maxHp, damage: Math.round(s.damage * (this.has('overwork') ? 1.25 : 1)),
      initialWeapon: s.initialWeapon, equipped: [...s.equipped], priorityWeapon: s.priorityWeapon,
      logs: s.logs, inventoryLocked: s.time < s.inventoryLockedUntil,
      ally: s.ally, summonHistory: [...s.summonHistory], hexes: [...s.hexes], hexChoices: [...s.hexChoices], hexRound: s.hexRound,
      hexRerolls: [...s.hexRerolls], dashCooldown: fx.dashCooldown, activeEffects,
      news: s.story.news, event: s.story.event,
      eventRemaining: s.story.event === 'blackout' ? Math.max(0, s.story.blackoutUntil - s.time) : s.story.event === 'bull' ? Math.max(0, s.story.bullUntil - s.time) : s.story.ring && !s.story.ring.escaped ? s.story.ring.remaining : 0,
      boss: boss ? { hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: s.story.bossPhase, entering: s.time < s.story.bossIntroUntil, quote: s.story.bossQuoteRemaining > 0 } : null,
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
      if (fx.clone.life <= 0) fx.clone = null;
    }
  }

  private createClone(): void {
    const s = this.state;
    s.effects.clone = { x: clamp(s.player.x - 65, 38, WORLD_WIDTH - 38), y: clamp(s.player.y + 45, 38, WORLD_HEIGHT - 38), facing: s.player.facing, life: 40 };
    s.effects.cloneCooldown = 50;
  }

  private step(dt: number): void {
    const s = this.state;
    const p = s.player;
    const summonSlow = s.summonFlash > SUMMON_DURATION - 0.35;
    s.time = s.endless ? s.time + dt : Math.min(RUN_DURATION, s.time + dt);
    s.levelPulse = Math.max(0, s.levelPulse - dt);
    p.invincible = Math.max(0, p.invincible - dt);
    s.summonFlash = Math.max(0, s.summonFlash - dt);
    s.shake = Math.max(0, s.shake - dt);
    this.updateEffects(dt);
    this.charge(dt * 2.1);
    const fx = s.effects;
    const worldDt = fx.freeze > 0 ? 0 : dt * (fx.slow > 0 || summonSlow ? 0.2 : 1);
    const speed = p.speed * (1 + this.hoardBonus()) * (fx.slow > 0 ? 2 : 1);
    p.moving = Math.hypot(this.movement.x, this.movement.y) > 0.05;
    p.x = clamp(p.x + this.movement.x * speed * dt, 38, WORLD_WIDTH - 38);
    p.y = clamp(p.y + this.movement.y * speed * dt, 38, WORLD_HEIGHT - 38);
    if (p.moving) p.facing = Math.atan2(this.movement.y, this.movement.x);

    updateStory(s, dt, worldDt, this.storyHooks);
    if (p.hp <= 0) { this.settleOutcome(); return; }
    while (s.time + 1e-8 >= this.spawnTimer) {
      this.spawnEnemy(this.spawnTimer);
      this.spawnTimer += Math.max(s.endless ? 0.16 : 0.24, 0.82 - this.spawnTimer * 0.0035);
    }
    updateWeapons(s, dt, this.weaponHooks);
    if (s.bossDefeated && !s.endless) { this.settleOutcome(); return; }
    if (fx.chairActive) {
      this.chairTimer -= dt * (this.has('overwork') ? 1.15 : 1) * (fx.freeze > 0 ? 2 : 1);
      if (this.chairTimer <= 0) { this.chairTimer += 0.65; this.fireChairSword(); }
    } else this.chairTimer = 0;

    this.updateStrikes(dt);
    if (s.bossDefeated && !s.endless) { this.settleOutcome(); return; }
    this.updateEnemies(worldDt, dt);
    if (p.hp <= 0) { this.settleOutcome(); return; }

    for (const shot of s.projectiles) {
      const previous = { x: shot.x, y: shot.y };
      if (shot.orbit) {
        const owner = shot.orbit.owner === 'clone' ? fx.clone : p;
        shot.orbit.remaining -= dt;
        shot.orbit.angle += dt * 10;
        shot.vx = Math.cos(shot.orbit.angle) * 850;
        shot.vy = Math.sin(shot.orbit.angle) * 850;
        if (owner) {
          shot.x = owner.x + Math.cos(shot.orbit.angle) * 66;
          shot.y = owner.y + Math.sin(shot.orbit.angle) * 66;
        }
        if (shot.orbit.remaining <= 0 || !owner) shot.orbit = undefined;
      } else {
        if (shot.homing) {
          const target = this.nearestEnemy(shot, shot.hitIds);
          if (target) {
            const angle = Math.atan2(target.y - shot.y, target.x - shot.x);
            const speed = Math.hypot(shot.vx, shot.vy);
            shot.vx = Math.cos(angle) * speed; shot.vy = Math.sin(angle) * speed;
          }
        }
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
      }
      shot.life -= dt;
      if (shot.life <= 0) continue;
      const dx = shot.x - previous.x;
      const dy = shot.y - previous.y;
      const lengthSquared = dx * dx + dy * dy;
      const hits = s.enemies.filter((enemy) => enemy.hp > 0 && !shot.hitIds.includes(enemy.id)).map((enemy) => ({
        enemy, t: lengthSquared > 0 ? clamp(((enemy.x - previous.x) * dx + (enemy.y - previous.y) * dy) / lengthSquared, 0, 1) : 0,
      })).filter(({ enemy, t }) => Math.hypot(enemy.x - previous.x - t * dx, enemy.y - previous.y - t * dy) <= shot.radius + enemy.radius).sort((a, b) => a.t - b.t || Number(b.enemy.kind === 'guard') - Number(a.enemy.kind === 'guard'));
      for (const { enemy } of hits) {
        shot.hitIds.push(enemy.id);
        this.damageEnemy(enemy, shot.damage);
        shot.pierced--;
        if (shot.pierced <= 0 || enemy.kind === 'guard') { shot.life = 0; break; }
      }
    }
    if (s.bossDefeated && !s.endless) { this.settleOutcome(); return; }
    this.updateEnemyProjectiles(worldDt);
    s.enemies = s.enemies.filter((enemy) => enemy.hp > 0);
    s.projectiles = s.projectiles.filter((shot) => shot.life > 0 && shot.x > -40 && shot.x < WORLD_WIDTH + 40 && shot.y > -40 && shot.y < WORLD_HEIGHT + 40);

    if (p.hp <= 0) { this.settleOutcome(); return; }
    s.weaponDrops = s.weaponDrops.filter((drop) => {
      if (distance(p, drop) >= p.radius + 30) return true;
      if (drop.weapon) this.collectWeapon(drop.weapon);
      if (drop.core) this.strengthenPriority();
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
    for (const particle of s.particles) { particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.life -= dt; }
    s.particles = s.particles.filter((particle) => particle.life > 0);
    for (const text of s.damageTexts) { text.y -= dt * 32; text.life -= dt; }
    s.damageTexts = s.damageTexts.filter((text) => text.life > 0);
    if (!this.settleOutcome()) this.checkChoices();
  }

  private createReport(victory: boolean): RunReport {
    const s = this.state;
    return {
      seed: s.seed, initialWeapon: s.initialWeapon, time: s.time, kills: s.kills, level: s.level,
      weapons: s.weapons.filter((weapon) => weapon.level > 0).map(({ id, level, evolved }) => ({ id, level, evolved })),
      equipped: [...s.equipped], hexes: [...s.hexes], summonHistory: [...s.summonHistory], victory,
    };
  }

  private settleOutcome(): boolean {
    const s = this.state;
    if (s.player.hp <= 0) {
      s.status = 'defeat'; s.defeatReason = 'health'; s.report = this.createReport(false); this.onSound('defeat');
      this.log(s.endless ? '无尽股东大会结束：生命耗尽。' : '生命耗尽，行动失败。', 'result');
    } else if (s.bossDefeated && !s.endless) {
      s.status = 'finishing'; s.blackFlash = 0.4; s.report = this.createReport(true); this.onSound('blackflash');
      this.log('黑闪！资本长老会主席已击败，神殿权限已收复。', 'result');
    } else if (!s.endless && s.time >= RUN_DURATION - 1e-8) {
      s.time = RUN_DURATION; s.status = 'defeat'; s.defeatReason = 'timeout'; s.report = this.createReport(false); this.onSound('defeat');
      this.log('180 秒已到，资本长老会主席仍未被击败，本局战败。', 'result');
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
    this.makeEnemySpace();
    this.state.enemies.push(enemy);
    return enemy;
  }

  private makeEnemySpace(): void {
    const s = this.state;
    s.enemies = s.enemies.filter((enemy) => enemy.hp > 0);
    if (s.enemies.length < 140) return;
    const index = s.enemies.findIndex((enemy) => enemy.kind !== 'boss' && enemy.kind !== 'guard' && !enemy.ringMember);
    if (index >= 0) s.enemies.splice(index, 1);
  }

  private spawnEnemy(at: number): void {
    const s = this.state;
    const side = Math.floor(this.spawnRandom() * 4);
    const position = this.spawnRandom();
    this.spawnCount++;
    const kind = at >= 32 && this.spawnCount % 11 === 0 ? 'legal' : at >= 18 && this.spawnCount % 7 === 0 ? 'security' : at >= 10 && this.spawnCount % 4 === 0 ? 'short' : 'reporter';
    const hp = (30 + Math.floor(at / 25) * 9) * (kind === 'legal' ? 5 : kind === 'security' ? 2 : 1);
    const x = side === 0 ? -24 : side === 1 ? WORLD_WIDTH + 24 : 24 + position * (WORLD_WIDTH - 48);
    const y = side === 2 ? -24 : side === 3 ? WORLD_HEIGHT + 24 : 24 + position * (WORLD_HEIGHT - 48);
    const speed = (kind === 'legal' ? 40 : kind === 'short' ? 44 : 56) + this.spawnRandom() * 14 + at * 0.2;
    const phase = this.spawnRandom() * Math.PI * 2;
    this.makeEnemySpace();
    s.enemies.push({
      id: this.spawnCount, x, y, kind, attackCooldown: 1.5,
      radius: kind === 'legal' ? 24 : kind === 'security' ? 20 : 16,
      hp, maxHp: hp, speed, flash: 0, phase, spawnGrace: 0.85, motionTime: 0,
      chargeState: 'approach', chargeTime: 0, chargeAngle: 0,
    });
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
      if (enemy.spawnGrace > 0) {
        enemy.spawnGrace = Math.max(0, enemy.spawnGrace - worldDt);
        continue;
      }
      const d = distance(p, enemy);
      if (s.effects.wall > 0 && d < 74 * this.sizeMultiplier() + enemy.radius) {
        this.damageEnemy(enemy, enemy.kind === 'legal' ? 120 : enemy.hp, false);
        continue;
      }
      if (worldDt <= 0) continue;
      const inField = field && (d < fieldRadius + enemy.radius || (s.effects.clone && distance(s.effects.clone, enemy) < fieldRadius + enemy.radius));
      const speedMultiplier = (this.has('overwork') ? 1.1 : 1) * (inField ? 0.4 : 1);
      enemy.attackCooldown -= worldDt;
      if (enemy.kind === 'security') {
        if (enemy.chargeState === 'aim') {
          enemy.chargeTime -= worldDt;
          if (enemy.chargeTime <= 0) { enemy.chargeState = 'dash'; enemy.chargeTime = 0.65; }
        } else if (enemy.chargeState === 'dash') {
          enemy.x = clamp(enemy.x + Math.cos(enemy.chargeAngle) * 760 * speedMultiplier * worldDt, -28, WORLD_WIDTH + 28);
          enemy.y = clamp(enemy.y + Math.sin(enemy.chargeAngle) * 760 * speedMultiplier * worldDt, -28, WORLD_HEIGHT + 28);
          enemy.chargeTime -= worldDt;
          if (enemy.chargeTime <= 0) { enemy.chargeState = 'approach'; enemy.attackCooldown = 3; }
        } else if (enemy.attackCooldown <= 0 && d < 600) {
          enemy.chargeState = 'aim'; enemy.chargeTime = 0.9;
          enemy.chargeAngle = Math.atan2(p.y - enemy.y, p.x - enemy.x);
        } else if (d > 1) {
          enemy.x += (p.x - enemy.x) / d * enemy.speed * worldDt * speedMultiplier;
          enemy.y += (p.y - enemy.y) / d * enemy.speed * worldDt * speedMultiplier;
        }
      } else {
        if (d > 1 && !(enemy.kind === 'short' && d < 270) && !(enemy.kind === 'legal' && d < 210)) {
          enemy.x += (p.x - enemy.x) / d * enemy.speed * worldDt * speedMultiplier;
          enemy.y += (p.y - enemy.y) / d * enemy.speed * worldDt * speedMultiplier;
        }
        if ((enemy.kind === 'short' || enemy.kind === 'legal') && enemy.attackCooldown <= 0) {
          enemy.attackCooldown = enemy.kind === 'legal' ? 2.8 : 2.1;
          this.enemyFire(enemy);
        }
      }
      if (enemy.kind !== 'bull' && distance(p, enemy) < p.radius + enemy.radius) this.hurtPlayer(enemy.kind === 'legal' ? 18 : enemy.chargeState === 'dash' ? 22 : 12);
    }
  }

  private nearestEnemy(at: Point, ignoredIds: readonly number[] = []): Enemy | undefined {
    let nearest: Enemy | undefined;
    let nearestDistance = Infinity;
    for (const enemy of this.state.enemies) {
      const d = distance(at, enemy);
      if (enemy.hp > 0 && !ignoredIds.includes(enemy.id) && d < nearestDistance) { nearest = enemy; nearestDistance = d; }
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
    const count = document ? 3 : 1;
    const speed = document ? 140 : 180;
    for (let i = 0; i < count && s.enemyProjectiles.length < 100; i++) {
      const a = angle + (i - (count - 1) / 2) * 0.3;
      s.enemyProjectiles.push({ id: this.entityId++, x: enemy.x, y: enemy.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, radius: document ? 10 : 6, damage: document ? 16 : 10, life: 7, shape: document ? 'document' : 'arrow', rotation: a });
    }
  }

  private updateEnemyProjectiles(dt: number): void {
    const s = this.state;
    const fx = s.effects;
    for (const shot of s.enemyProjectiles) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      if (shot.shape === 'document') shot.rotation += dt * 5;
      if (shot.life <= 0) continue;
      const d = distance(shot, s.player);
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
          strike.tick = 0.3;
        }
        continue;
      }
      strike.life -= dt;
      strike.tick -= dt;
      if (strike.tick <= 0) {
        strike.tick += 0.3;
        for (const enemy of s.enemies) if (distance(strike, enemy) < strike.radius + enemy.radius) this.damageEnemy(enemy, 10 + s.level * 2, false);
      }
    }
    s.strikes = s.strikes.filter((strike) => strike.delay > 0 || strike.life > 0);
  }

  private hurtPlayer(amount: number): void {
    const s = this.state;
    const p = s.player;
    if (p.invincible > 0 || s.effects.wall > 0 || p.hp <= 0) return;
    const damage = Math.max(1, Math.round(amount * (s.effects.chairActive ? 0.3 : 1) * (this.has('armor') ? 0.5 : 1) * (this.has('reckless') ? 1.15 : 1)));
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
        const angle = d > 0 ? Math.atan2(enemy.y - p.y, enemy.x - p.x) : enemy.phase;
        enemy.x = clamp(enemy.x + Math.cos(angle) * 75, 24, WORLD_WIDTH - 24);
        enemy.y = clamp(enemy.y + Math.sin(angle) * 75, 24, WORLD_HEIGHT - 24);
      }
    }
  }

  private damageEnemy(enemy: Enemy, amount: number, canCrit = true): void {
    if (enemy.hp <= 0) return;
    const s = this.state;
    if ((enemy.kind === 'boss' || enemy.kind === 'guard') && s.time < s.story.bossIntroUntil) return;
    const blackout = s.story.blackoutUntil > s.time;
    const critical = canCrit && this.combatRandom() < Math.min(1, (0.1 + this.hoardBonus()) * (blackout ? 2 : 1));
    const damage = Math.max(1, Math.round(amount * (critical ? 2 : 1) * (this.has('reckless') && (enemy.kind === 'legal' || enemy.kind === 'boss') ? 1.6 : 1)));
    enemy.hp -= damage;
    enemy.flash = 0.08;
    this.addText(enemy, critical ? `${damage}!` : String(damage), critical ? '#f1ce84' : '#d4edc7');
    if (critical && this.has('vampire') && this.combatRandom() < 0.15 && s.player.hp > 0) s.player.hp = Math.min(s.player.maxHp, s.player.hp + 1);
    this.onSound('hit');
    if (enemy.hp > 0) return;
    s.kills++;
    this.charge(enemy.kind === 'bull' ? 12 : 1.1);
    this.burst(enemy, enemy.kind === 'bull' ? '#edcd80' : '#b6ed76', 6);
    if (enemy.kind === 'boss') { s.bossDefeated = true; return; }
    this.dropCrystal(enemy, enemy.kind === 'legal' ? 30 : enemy.kind === 'bull' ? 12 : enemy.kind === 'security' ? 8 : 4, 0, enemy.kind === 'bull');
    if (enemy.kind === 'legal') {
      if (enemy.supplyKey && !s.story.fired.includes(enemy.supplyKey)) {
        s.story.fired.push(enemy.supplyKey);
        this.dropSupply(enemy, '冷血法务没收品', false, true);
        return;
      }
      const owned = s.weapons.filter((weapon) => weapon.level > 0);
      const weapon = owned[Math.floor(this.weaponDropRandom() * owned.length)].id;
      this.dropSupply(enemy, '冷血法务没收品', false, false, weapon);
    }
  }

  private dropCrystal(at: Point, value: number, heal = 0, attracted = false): void {
    const s = this.state;
    if (s.crystals.length < 180) {
      s.crystals.push({ id: this.entityId++, x: at.x, y: at.y, value, heal, attracted, phase: this.visualRandom() * Math.PI * 2 });
    } else {
      // Merge capped drops rather than silently losing experience or healing.
      let nearest = s.crystals[0];
      for (const crystal of s.crystals) if (distance(crystal, at) < distance(nearest, at)) nearest = crystal;
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
        if (enemy.kind === 'boss' || enemy.kind === 'guard' || enemy.ringMember) continue;
        const d = distance(s.player, enemy);
        if (d > 0 && d < 125) {
          enemy.x = clamp(enemy.x + (enemy.x - s.player.x) / d * 32, 24, WORLD_WIDTH - 24);
          enemy.y = clamp(enemy.y + (enemy.y - s.player.y) / d * 32, 24, WORLD_HEIGHT - 24);
        }
      }
    }
    if (!s.endless && s.hexRound < HEX_TIMES.length && s.time + 1e-8 >= HEX_TIMES[s.hexRound]) {
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
