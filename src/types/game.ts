export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;
export const RUN_DURATION = 180;
export const FIXED_STEP = 1 / 60;
export const SUMMON_DURATION = 2.4;
export const MAX_PROJECTILES = 180;
export const HEX_TIMES = [45, 95, 135] as const;
export const MAX_BATTLE_LOG_ENTRIES = 120;
export type GameStatus = 'ready' | 'playing' | 'paused' | 'inventory' | 'hex' | 'summonSelect' | 'finishing' | 'victory' | 'defeat';
export type WeaponId = 'gpu' | 'spatula' | 'cuda' | 'pulse' | 'duck';
export type UpgradeId = WeaponId | 'power' | 'rapid' | 'volley' | 'magnet' | 'vitality' | 'speed';
export type SoundName = 'shoot' | 'hit' | 'pickup' | 'hurt' | 'upgrade' | 'summon' | 'victory' | 'defeat' | 'parry' | 'dash' | 'intro' | 'alarm' | 'blackflash';
export type AllyId = 'patch' | 'ember' | 'aegis' | 'clock';
export type HexId = 'echo' | 'chrono' | 'chair' | 'hoard' | 'armor' | 'parry' | 'reckless' | 'vampire' | 'overwork' | 'wide' | 'network';
export type HexTier = 'prismatic' | 'gold' | 'silver';
export interface Ally {
  id: AllyId;
  name: string;
  skill: string;
  description: string;
  quote: string;
  icon: string;
  color: string;
}
export interface HexCard {
  id: HexId;
  name: string;
  tier: HexTier;
  description: string;
  detail: string;
  icon: string;
}
export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  evolution: string;
  description: string;
  evolutionDescription: string;
  icon: string;
}
export interface WeaponState {
  id: WeaponId;
  level: number;
  evolved: boolean;
  nextFireTime: number;
}
export interface WeaponEffect extends Point {
  kind: 'swing' | 'beam';
  angle: number;
  length: number;
  width: number;
  arc: number;
  life: number;
  maxLife: number;
  spectral: boolean;
  evolved: boolean;
}
export interface Point { x: number; y: number }
export interface Player extends Point {
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  facing: number;
  invincible: number;
  moving: boolean;
}
export type EnemyKind = 'reporter' | 'short' | 'legal' | 'security' | 'assassin' | 'bull' | 'boss' | 'guard';
export interface Enemy extends Point {
  id: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  flash: number;
  phase: number;
  kind: EnemyKind;
  attackCooldown: number;
  spawnGrace: number;
  motionTime: number;
  chargeState: 'approach' | 'aim' | 'dash';
  chargeTime: number;
  chargeAngle: number;
  ringMember?: boolean;
  supplyKey?: 'weapon-25' | 'weapon-55';
}
export interface Projectile extends Point {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  pierced: number;
  hitIds: number[];
  spectral?: boolean;
  homing?: boolean;
  weapon?: 'gpu' | 'duck' | 'crescent' | 'reflected';
  evolved?: boolean;
  orbit?: { owner: 'player' | 'clone'; angle: number; remaining: number };
}
export interface EnemyProjectile extends Point {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  shape: 'arrow' | 'document';
  rotation: number;
}
export interface Airstrike extends Point {
  radius: number;
  delay: number;
  life: number;
  tick: number;
}
export interface Effects {
  freeze: number;
  wall: number;
  slow: number;
  dashCooldown: number;
  autoSlowCooldown: number;
  standStill: number;
  chairActive: boolean;
  clone: (Point & { life: number; facing: number }) | null;
  cloneCooldown: number;
  parryCooldown: number;
  arc: number;
}
export interface Crystal extends Point { id: number; value: number; phase: number; heal?: number; attracted?: boolean }
export interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}
export interface DamageText extends Point { text: string; life: number; color: string }
export interface Upgrade {
  id: UpgradeId;
  name: string;
  category: string;
  description: string;
  detail: string;
  icon: string;
  evolution?: boolean;
}
export interface WeaponDrop extends Point {
  id: number;
  weapon: WeaponId | null;
  core: boolean;
  source: string;
}
export interface BattleLogEntry {
  id: number;
  time: number;
  text: string;
  kind: 'system' | 'weapon' | 'upgrade' | 'evolution' | 'event' | 'summon' | 'hex' | 'result';
}
export interface CrashPillar extends Point { id: number; radius: number; delay: number; life: number; hit: boolean }
export interface BossCut extends Point { id: number; angle: number; length: number; width: number; delay: number; life: number; hit: boolean }
export interface StoryState {
  event: 'parking' | 'shortCrash' | 'paparazzi' | 'blackout' | 'bull' | 'alarm' | 'boss' | 'endless';
  news: string;
  fired: string[];
  crashes: CrashPillar[];
  ring: { center: Point; radius: number; remaining: number; memberIds: number[]; escaped: boolean } | null;
  blackoutUntil: number;
  whiteFlash: number;
  bullUntil: number;
  nextBullSpawn: number;
  bossId: number | null;
  bossPhase: 1 | 2;
  bossIntroUntil: number;
  bossQuoteRemaining: number;
  bossShotTimer: number;
  bossCutTimer: number;
  bossAngle: number;
  cuts: BossCut[];
}
export interface RunReport {
  seed: number;
  initialWeapon: WeaponId;
  time: number;
  kills: number;
  level: number;
  weapons: { id: WeaponId; level: number; evolved: boolean }[];
  equipped: (WeaponId | null)[];
  hexes: HexId[];
  summonHistory: AllyId[];
  victory: boolean;
}
export interface RunChallenge {
  version: 2;
  seed: number;
  initialWeapon: WeaponId;
  target: { kills: number; level: number; time: number; weapons: RunReport['weapons']; equipped: (WeaponId | null)[]; hexes: HexId[]; summonHistory: AllyId[] };
}
export interface GameState {
  status: GameStatus;
  seed: number;
  time: number;
  level: number;
  xp: number;
  xpNeeded: number;
  kills: number;
  energy: number;
  summons: number;
  initialWeapon: WeaponId;
  equipped: (WeaponId | null)[];
  priorityWeapon: WeaponId | null;
  weapons: WeaponState[];
  weaponEffects: WeaponEffect[];
  weaponDrops: WeaponDrop[];
  logs: readonly BattleLogEntry[];
  levelPulse: number;
  inventoryLockedUntil: number;
  damage: number;
  fireInterval: number;
  projectileCount: number;
  pickupRadius: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  crystals: Crystal[];
  particles: Particle[];
  damageTexts: DamageText[];
  summonFlash: number;
  shake: number;
  ally: AllyId;
  summonHistory: AllyId[];
  hexes: HexId[];
  hexChoices: HexCard[];
  hexSchedule: HexId[][];
  hexRerolls: boolean[];
  hexSeen: HexId[];
  hexRound: number;
  effects: Effects;
  enemyProjectiles: EnemyProjectile[];
  strikes: Airstrike[];
  story: StoryState;
  endless: boolean;
  bossDefeated: boolean;
  blackFlash: number;
  defeatReason: 'health' | 'timeout' | null;
  report: RunReport | null;
}
export interface GameSnapshot {
  status: GameStatus;
  seed: number;
  time: number;
  level: number;
  xp: number;
  xpNeeded: number;
  kills: number;
  energy: number;
  summons: number;
  initialWeapon: WeaponId;
  equipped: (WeaponId | null)[];
  priorityWeapon: WeaponId | null;
  weapons: WeaponState[];
  logs: readonly BattleLogEntry[];
  inventoryLocked: boolean;
  hp: number;
  maxHp: number;
  damage: number;
  ally: AllyId;
  summonHistory: AllyId[];
  hexes: HexId[];
  hexChoices: HexCard[];
  hexRerolls: boolean[];
  hexRound: number;
  dashCooldown: number;
  activeEffects: string[];
  news: string;
  event: StoryState['event'];
  eventRemaining: number;
  boss: { hp: number; maxHp: number; phase: 1 | 2; entering: boolean; quote: boolean } | null;
  danger: boolean;
  endless: boolean;
  bossDefeated: boolean;
  defeatReason: 'health' | 'timeout' | null;
  report: RunReport | null;
}
export interface Joystick { active: boolean; origin: Point; current: Point }
