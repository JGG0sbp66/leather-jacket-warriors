import { SUMMON_DURATION, WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import { ALLIES } from '../data/summons.ts';
import { WEAPONS } from '../data/weapons.ts';
import { REVERSAL_QUOTE, STORY_NEWS } from '../data/events.ts';
import type { CrashPillar, Crystal, Enemy, EnemyProjectile, GameState, Joystick, Player, Point, Projectile, WeaponEffect } from '../types/game.ts';

const TAU = Math.PI * 2;
const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
const LIME = '#b6ed76';
const MAX_PARTICLES = 240;
const MAX_DAMAGE_TEXTS = 48;
const ENEMY_COLORS: Record<Enemy['kind'], string> = {
  reporter: '#d6bb68', short: '#f58276', legal: '#c2ccad', security: '#f58276',
  boss: '#e4b87a', guard: '#9caabd', assassin: '#9d465d', bull: '#f9d976',
};

const READY_ENEMIES: readonly Enemy[] = [
  { id: -1, x: 366, y: 267, radius: 16, hp: 30, maxHp: 30, speed: 0, kind: 'reporter', attackCooldown: 0, flash: 0, phase: 0.4, spawnGrace: 0, motionTime: 0, chargeState: 'approach', chargeTime: 0, chargeAngle: 0 },
  { id: -2, x: 786, y: 248, radius: 16, hp: 30, maxHp: 30, speed: 0, kind: 'short', attackCooldown: 0, flash: 0, phase: 2.1, spawnGrace: 0, motionTime: 0, chargeState: 'approach', chargeTime: 0, chargeAngle: 0 },
  { id: -3, x: 813, y: 531, radius: 24, hp: 120, maxHp: 120, speed: 0, kind: 'legal', attackCooldown: 0, flash: 0, phase: 4.2, spawnGrace: 0, motionTime: 0, chargeState: 'approach', chargeTime: 0, chargeAngle: 0 },
  { id: -4, x: 425, y: 564, radius: 19, hp: 60, maxHp: 60, speed: 0, kind: 'security', attackCooldown: 0, flash: 0, phase: 1.5, spawnGrace: 0, motionTime: 0, chargeState: 'approach', chargeTime: 0, chargeAngle: 0 },
];
const READY_CRYSTALS: readonly Crystal[] = [
  { id: -1, x: 502, y: 558, value: 1, phase: 0 },
  { id: -2, x: 531, y: 574, value: 1, phase: 1.7 },
  { id: -3, x: 716, y: 544, value: 2, phase: 2.4 },
  { id: -4, x: 804, y: 353, value: 1, phase: 4.1 },
  { id: -5, x: 408, y: 419, value: 1, phase: 3.2 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function path(ctx: CanvasRenderingContext2D, points: readonly number[], close = false): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  if (close) ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
}

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly arena: HTMLCanvasElement;
  private readonly motionQuery: MediaQueryList | null;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private scale = 1;
  private cameraX = 0;
  private cameraY = 0;
  private viewWidth = WORLD_WIDTH;
  private viewHeight = WORLD_HEIGHT;
  private arenaResolution = 0;
  private arenaReady = false;
  private vignette: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.arena = canvas.ownerDocument.createElement('canvas');
    const view = canvas.ownerDocument.defaultView;
    this.motionQuery = view && typeof view.matchMedia === 'function'
      ? view.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    this.resize(canvas.clientWidth || canvas.width || WORLD_WIDTH,
      canvas.clientHeight || canvas.height || WORLD_HEIGHT);
  }

  resize(width: number, height: number): void {
    this.width = Number.isFinite(width) ? Math.max(1, width) : 1;
    this.height = Number.isFinite(height) ? Math.max(1, height) : 1;
    this.dpr = clamp(this.canvas.ownerDocument.defaultView?.devicePixelRatio || 1, 1, 2);
    this.scale = Math.max(this.width / WORLD_WIDTH, this.height / WORLD_HEIGHT);
    this.viewWidth = this.width / this.scale;
    this.viewHeight = this.height / this.scale;
    const pixelWidth = Math.max(1, Math.round(this.width * this.dpr));
    const pixelHeight = Math.max(1, Math.round(this.height * this.dpr));
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;

    const resolution = Math.min(1.5, Math.max(1, this.scale * this.dpr));
    if (resolution !== this.arenaResolution) {
      this.arenaResolution = resolution;
      this.arena.width = Math.ceil(WORLD_WIDTH * resolution);
      this.arena.height = Math.ceil(WORLD_HEIGHT * resolution);
      const arenaCtx = this.arena.getContext('2d', { alpha: false });
      this.arenaReady = arenaCtx !== null;
      if (arenaCtx) {
        arenaCtx.setTransform(resolution, 0, 0, resolution, 0, 0);
        this.drawArena(arenaCtx);
      }
    }

    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.vignette = this.ctx.createRadialGradient(
        this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.22,
        this.width / 2, this.height / 2, Math.hypot(this.width, this.height) * 0.55,
      );
      this.vignette.addColorStop(0, 'rgba(3, 9, 6, 0)');
      this.vignette.addColorStop(1, 'rgba(3, 9, 6, 0.28)');
    }
  }

  render(state: GameState, joystick?: Joystick): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const reduced = this.motionQuery?.matches ?? false;
    const defeat = state.status === 'defeat';
    const finishing = state.status === 'finishing' && state.blackFlash > 0;
    const time = state.status === 'ready' && !reduced ? performance.now() / 1000 : state.time;
    this.cameraX = clamp(state.player.x - this.viewWidth / 2, 0, Math.max(0, WORLD_WIDTH - this.viewWidth));
    this.cameraY = clamp(state.player.y - this.viewHeight / 2, 0, Math.max(0, WORLD_HEIGHT - this.viewHeight));
    const shake = state.status === 'playing' && !reduced ? clamp(state.shake * 20, 0, 4) : 0;
    const shakeX = Math.sin(time * 71) * shake;
    const shakeY = Math.cos(time * 83 + 1.3) * shake * 0.65;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = defeat ? 'grayscale(1)' : 'none';
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.fillStyle = '#0b100e';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    if (finishing) {
      ctx.filter = reduced ? 'grayscale(1) brightness(0.65)'
        : `grayscale(1) contrast(2.8)${state.blackFlash > 0.28 ? ' invert(1)' : ''}`;
    } else if (!defeat && state.effects.freeze > 0) ctx.filter = 'grayscale(1) invert(1)';
    ctx.translate(shakeX, shakeY);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.cameraX, -this.cameraY);
    ctx.imageSmoothingEnabled = true;
    // WHY: Cache the static circuitry to keep frame cost focused on live entities.
    if (this.arenaReady) ctx.drawImage(this.arena, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    else this.drawArena(ctx);

    ctx.strokeStyle = `rgba(182, 237, 118, ${reduced ? 0.12 : 0.12 + Math.sin(time * 1.2) * 0.035})`;
    ctx.lineWidth = 1;
    circle(ctx, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 112);
    ctx.stroke();

    if (state.status === 'ready') {
      if (state.crystals.length === 0) {
        for (const crystal of READY_CRYSTALS) {
          if (this.visible(crystal.x, crystal.y, 18)) this.drawCrystal(ctx, crystal, time, reduced);
        }
      }
      if (state.enemies.length === 0) {
        for (const enemy of READY_ENEMIES) {
          if (this.visible(enemy.x, enemy.y, enemy.radius * 2)) {
            this.drawEnemy(ctx, { ...enemy, motionTime: time }, reduced);
          }
        }
      }
    }
    this.drawBullMarket(ctx, state, reduced);
    for (const crystal of state.crystals) {
      if (this.visible(crystal.x, crystal.y, 18)) this.drawCrystal(ctx, crystal, time, reduced);
    }
    this.drawWeaponDrops(ctx, state, reduced);
    this.drawFields(ctx, state, reduced);
    this.drawWeaponFields(ctx, state, reduced);
    this.drawLevelPulse(ctx, state, reduced);
    // Keep red threats legible over the time-stop inversion; darkness is applied later.
    ctx.save(); ctx.filter = defeat ? 'grayscale(1)' : 'none';
    this.drawStoryGround(ctx, state, reduced);
    this.drawBossLanding(ctx, state, reduced);
    // Threats can cross the viewport even when their source is off-screen.
    for (const enemy of state.enemies) this.drawEnemyThreat(ctx, enemy, reduced);
    ctx.restore();
    for (const enemy of state.enemies) {
      if (this.visible(enemy.x, enemy.y, enemy.radius * 2.5)) {
        this.drawEnemy(ctx, enemy, reduced, state.story.bossPhase === 2);
      }
    }
    for (const effect of state.weaponEffects) this.drawWeaponEffect(ctx, effect, reduced);
    if (state.effects.slow > 0 && state.player.moving && !reduced) {
      for (let i = 3; i > 0; i--) {
        ctx.save(); ctx.globalAlpha = 0.12;
        this.drawPlayer(ctx, { ...state.player, x: state.player.x - Math.cos(state.player.facing) * i * 17, y: state.player.y - Math.sin(state.player.facing) * i * 17, invincible: 0 }, time, true);
        ctx.restore();
      }
    }
    this.drawPlayer(ctx, state.player, time, reduced, state.effects.chairActive);
    if (state.effects.clone) {
      ctx.save(); ctx.globalAlpha = 0.5;
      this.drawPlayer(ctx, { ...state.player, ...state.effects.clone, invincible: 0 }, time, reduced);
      ctx.fillStyle = '#c2b1ff'; ctx.font = `9px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText('黑皮衣分身', state.effects.clone.x, state.effects.clone.y - 38);
      ctx.restore();
    }
    this.drawDucks(ctx, state);
    for (const shot of state.enemyProjectiles) {
      if (this.visible(shot.x, shot.y, shot.radius + 2)) this.drawEnemyProjectile(ctx, shot);
    }
    for (const projectile of state.projectiles) {
      if (this.visible(projectile.x, projectile.y, projectile.radius + 22)) {
        this.drawProjectile(ctx, projectile, time, reduced);
      }
    }
    this.drawParticles(ctx, state, reduced);
    if (state.summonFlash > 0) this.drawSummon(ctx, state, reduced);
    this.drawDamageTexts(ctx, state, reduced);
    ctx.save(); ctx.filter = defeat ? 'grayscale(1)' : 'none';
    this.drawBossCuts(ctx, state, reduced);
    ctx.restore();
    ctx.restore();

    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    this.drawBlackout(ctx, state, shakeX, shakeY);
    if (!finishing) this.drawStoryScreen(ctx, state, reduced);
    if (state.effects.freeze > 0 || state.effects.slow > 0) {
      ctx.strokeStyle = state.effects.freeze > 0 ? '#c4b2ff' : '#70dddc';
      ctx.lineWidth = 3; ctx.globalAlpha = 0.55;
      ctx.strokeRect(2, 2, this.width - 4, this.height - 4);
      ctx.globalAlpha = 1;
    }
    if (finishing) this.drawBlackFlash(ctx, state, reduced);
    if (defeat) {
      ctx.fillStyle = 'rgba(22, 22, 22, 0.3)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (joystick?.active) this.drawJoystick(ctx, joystick);
    ctx.restore();
    // A defeat/finishing frame must not leak its filter into a subsequent run.
    ctx.filter = 'none';
  }

  private drawWeaponDrops(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    for (const drop of state.weaponDrops) {
      if (!this.visible(drop.x, drop.y, 130)) continue;
      ctx.save(); ctx.translate(drop.x, drop.y);
      const height = reduced ? 64 : 82 + Math.sin(state.time * 2 + drop.id) * 5;
      const beam = ctx.createLinearGradient(0, -height, 0, 8);
      beam.addColorStop(0, '#6cff9900'); beam.addColorStop(0.7, '#6cff991c');
      beam.addColorStop(1, '#97ffab68');
      ctx.fillStyle = beam; ctx.fillRect(-16, -height, 32, height + 8);
      ctx.strokeStyle = '#82eaa2'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 8, 19, 6, 0, 0, TAU); ctx.stroke();
      path(ctx, [-11, -7, -6, -12, 8, -12, 13, -7, 13, 8, -11, 8], true);
      ctx.fillStyle = '#133729'; ctx.fill(); ctx.stroke();
      path(ctx, [-11, -7, 13, -7, 8, -12, -6, -12, -11, -7, -6, -2, 8, -2, 13, -7]); ctx.stroke();
      ctx.fillStyle = '#b9ffd1'; ctx.fillRect(-2, -4, 4, 9);
      if (drop.core) {
        path(ctx, [0, -29, 7, -21, 0, -13, -7, -21], true);
        ctx.fillStyle = '#caffaa'; ctx.fill();
      }
      const label = drop.weapon ? `${drop.core ? '强化核心 · ' : ''}${WEAPONS[drop.weapon].name}`
        : drop.core ? '强化核心' : '强化宝箱';
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      const labelWidth = ctx.measureText(label).width + 12;
      ctx.fillStyle = '#071910e8'; ctx.fillRect(-labelWidth / 2, 14, labelWidth, 20);
      ctx.fillStyle = '#caffb4'; ctx.fillText(label, 0, 28);
      ctx.restore();
    }
  }

  private drawLevelPulse(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    if (state.levelPulse <= 0) return;
    const remaining = clamp(state.levelPulse / 0.4, 0, 1);
    const radius = reduced ? 34 : 18 + (1 - remaining) * 68;
    ctx.save(); ctx.translate(state.player.x, state.player.y);
    ctx.globalAlpha = remaining * (reduced ? 0.4 : 0.8);
    ctx.fillStyle = '#72fa8c18'; ctx.strokeStyle = '#a1ff9a'; ctx.lineWidth = 2;
    circle(ctx, 0, 0, radius); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1; circle(ctx, 0, 0, radius * 0.72); ctx.stroke();
    ctx.restore();
  }

  private drawBullMarket(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    if (state.story.bullUntil <= state.time) return;
    ctx.save();
    ctx.fillStyle = '#e5b3380b';
    ctx.fillRect(this.cameraX, this.cameraY, this.viewWidth, this.viewHeight);
    // Decorative geometry only: no extra entities, particles or random allocations.
    const count = reduced ? 6 : 20;
    for (let i = 0; i < count; i++) {
      const x = (i * 193 + 79) % WORLD_WIDTH;
      const y = ((i * 137 + (reduced ? 0 : state.time * 42)) % (WORLD_HEIGHT + 80)) - 40;
      if (!this.visible(x, y, 32)) continue;
      ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2);
      ctx.globalAlpha = reduced ? 0.16 : 0.18 + (i % 3) * 0.035;
      this.drawArrow(ctx, 12 + (i % 3) * 3, '#7bffa0', '#daffc0');
      if (!reduced) {
        ctx.strokeStyle = '#74eb9270'; ctx.lineWidth = 1;
        path(ctx, [18, 0, 42, 0]); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  private drawStoryGround(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    const ring = state.story.ring;
    if (ring && ring.remaining > 0 && ring.radius > 0) {
      ctx.save(); ctx.translate(ring.center.x, ring.center.y);
      // This is a formation guide, not a damaging wall or a screen-space hurt outline.
      ctx.strokeStyle = ring.escaped ? '#95eba9' : '#dfc377'; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 9]); circle(ctx, 0, 0, ring.radius); ctx.stroke(); ctx.setLineDash([]);
      const label = ring.escaped ? '已突围' : `狗仔围堵 · ${Math.ceil(clamp(ring.remaining, 0, 10))} / 10秒 · 冲破缺口`;
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.strokeStyle = '#10130c'; ctx.lineWidth = 3; ctx.fillStyle = ring.escaped ? '#95eba9' : '#f1d892';
      ctx.strokeText(label, 0, -ring.radius - 14); ctx.fillText(label, 0, -ring.radius - 14);
      ctx.restore();
    }
    for (const crash of state.story.crashes) this.drawCrash(ctx, crash, reduced);
  }

  private drawCrash(ctx: CanvasRenderingContext2D, crash: CrashPillar, reduced: boolean): void {
    if (crash.radius <= 0 || (crash.delay <= 0 && crash.life <= 0)) return;
    if (!this.visible(crash.x, crash.y, crash.radius + 220)) return;
    const warning = crash.delay > 0;
    const progress = 1 - clamp(crash.delay, 0, 1);
    ctx.save(); ctx.translate(crash.x, crash.y);
    ctx.fillStyle = warning ? '#ed36451a' : '#ff32434a';
    circle(ctx, 0, 0, crash.radius); ctx.fill();
    // Inset strokes so the outer edge never overstates the actual collision radius.
    ctx.strokeStyle = '#ff5661'; ctx.lineWidth = 2;
    if (warning) ctx.setLineDash([6, 5]);
    circle(ctx, 0, 0, Math.max(0, crash.radius - 1)); ctx.stroke(); ctx.setLineDash([]);
    if (warning) {
      ctx.strokeStyle = '#ffaaa1';
      ctx.beginPath(); ctx.arc(0, 0, Math.max(0, crash.radius - 3), -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.stroke();
      ctx.font = `bold 10px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb9ad';
      ctx.fillText(`K / ${Math.max(0, crash.delay).toFixed(1)}s`, 0, crash.radius + 15);
    } else {
      ctx.save(); circle(ctx, 0, 0, crash.radius); ctx.clip();
      ctx.strokeStyle = '#ff8c80'; ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8;
        path(ctx, [Math.cos(angle) * crash.radius * 0.5, Math.sin(angle) * crash.radius * 0.5,
          Math.cos(angle + 0.12) * crash.radius, Math.sin(angle + 0.12) * crash.radius]); ctx.stroke();
      }
      ctx.restore();
    }
    const height = crash.radius * 2.2;
    const width = Math.min(30, crash.radius * 0.6);
    const altitude = warning ? (reduced ? 40 : (1 - progress) * (height + 80)) : 0;
    ctx.translate(0, -altitude);
    ctx.globalAlpha = warning ? 0.5 + progress * 0.3 : clamp(crash.life * 5, 0.35, 1);
    ctx.strokeStyle = '#ff776e'; ctx.lineWidth = 2;
    path(ctx, [0, -height - 15, 0, 8]); ctx.stroke();
    ctx.fillStyle = '#c51e37'; ctx.fillRect(-width / 2, -height, width, height);
    ctx.strokeStyle = '#ff9c8b'; ctx.lineWidth = 1; ctx.strokeRect(-width / 2, -height, width, height);
    ctx.fillStyle = '#ff5d65'; ctx.fillRect(-width / 2 + 3, -height + 3, 3, Math.max(1, height - 6));
    ctx.restore();
  }

  private drawBossLanding(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    const remaining = state.story.bossIntroUntil - state.time;
    if (remaining <= 0) return;
    const boss = state.enemies.find((enemy) => enemy.id === state.story.bossId && enemy.kind === 'boss');
    if (!boss) return;
    const progress = 1 - clamp(remaining, 0, 1);
    const radius = boss.radius + 20 + (reduced ? 0 : progress * 110);
    ctx.save(); ctx.translate(boss.x, boss.y);
    ctx.globalAlpha = reduced ? 0.55 : 1 - progress * 0.8;
    ctx.strokeStyle = '#ff4b55'; ctx.lineWidth = reduced ? 2 : 4 - progress * 2;
    circle(ctx, 0, 0, radius); ctx.stroke();
    ctx.fillStyle = '#b9233320'; circle(ctx, 0, 0, boss.radius + 16); ctx.fill();
    if (!reduced) {
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const angle = i * TAU / 10;
        path(ctx, [Math.cos(angle) * (radius - 8), Math.sin(angle) * (radius - 8),
          Math.cos(angle + 0.06) * (radius + 16), Math.sin(angle + 0.06) * (radius + 16)]); ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawBossCuts(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    let nextCut = Infinity;
    // Deliberately do not cull by the source: a finite segment can cross the entire view.
    for (const cut of state.story.cuts) {
      if (cut.length <= 0 || cut.width <= 0 || (cut.delay <= 0 && cut.life <= 0)) continue;
      const warning = cut.delay > 0;
      if (warning) nextCut = Math.min(nextCut, cut.delay);
      ctx.save(); ctx.translate(cut.x, cut.y); ctx.rotate(cut.angle);
      ctx.lineCap = 'round';
      // Story collision uses a capsule centered on (x, y), with finite +/- length/2 ends.
      path(ctx, [-cut.length / 2, 0, cut.length / 2, 0]);
      ctx.lineWidth = cut.width;
      ctx.strokeStyle = warning ? '#ff354514' : '#ff3545';
      ctx.globalAlpha = warning ? 1 : 0.65 + clamp(cut.life / 0.25, 0, 1) * 0.35;
      ctx.stroke();
      if (warning) {
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#ff7479'; ctx.setLineDash([10, 7]);
        ctx.lineDashOffset = reduced ? 0 : clamp(cut.delay / 1.2, 0, 1) * 17;
        ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.lineWidth = Math.min(3, cut.width * 0.2); ctx.strokeStyle = '#ffd5d1'; ctx.stroke();
      }
      ctx.restore();
    }
    if (Number.isFinite(nextCut)) {
      const urgency = 1 - clamp(nextCut / 1.2, 0, 1);
      ctx.save();
      ctx.font = `bold ${reduced ? 32 : 30 + urgency * 6}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4; ctx.strokeStyle = '#1e080e'; ctx.fillStyle = '#ff4053';
      const y = state.player.y - state.player.radius - 24;
      ctx.strokeText('危', state.player.x, y); ctx.fillText('危', state.player.x, y);
      ctx.restore();
    }
  }

  private drawBlackout(ctx: CanvasRenderingContext2D, state: GameState, shakeX: number, shakeY: number): void {
    if (state.story.blackoutUntil <= state.time) return;
    const x = (state.player.x - this.cameraX) * this.scale + shakeX;
    const y = (state.player.y - this.cameraY) * this.scale + shakeY;
    const mask = ctx.createRadialGradient(x, y, 0, x, y, 240 * this.scale);
    mask.addColorStop(0, 'rgba(2, 3, 5, 0)');
    mask.addColorStop(0.72, 'rgba(2, 3, 5, 0)');
    mask.addColorStop(0.9, 'rgba(2, 3, 5, 0.5)');
    mask.addColorStop(1, 'rgba(2, 3, 5, 1)');
    // source-over works on the opaque main canvas; destination-out would erase the scene.
    ctx.save(); ctx.fillStyle = mask; ctx.fillRect(0, 0, this.width, this.height);
    ctx.translate(shakeX, shakeY); ctx.scale(this.scale, this.scale); ctx.translate(-this.cameraX, -this.cameraY);
    for (const enemy of state.enemies) {
      if (enemy.kind !== 'assassin' || enemy.hp <= 0 || enemy.radius <= 0 || !this.visible(enemy.x, enemy.y, enemy.radius)) continue;
      ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.scale(enemy.radius / 16, enemy.radius / 16);
      ctx.globalAlpha = enemy.spawnGrace > 0 ? 0.35 : 1;
      this.drawAssassinEyes(ctx);
      ctx.restore();
    }
    ctx.restore();
  }

  private drawStoryScreen(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    ctx.save();
    if (state.story.whiteFlash > 0) {
      const alpha = Math.min(reduced ? 0.025 : 0.18, state.story.whiteFlash * (reduced ? 0.08 : 0.65));
      ctx.fillStyle = `rgba(240, 248, 241, ${alpha})`; ctx.fillRect(0, 0, this.width, this.height);
    }
    const alarm = state.story.event === 'alarm' || (state.story.bullUntil > 0
      && state.time >= state.story.bullUntil && state.story.bossId === null && !state.bossDefeated);
    if (alarm) {
      const opacity = reduced ? 0.22 : 0.3 + Math.sin(state.time * 2.4) * 0.045;
      for (const horizontal of [true, false]) {
        const extent = horizontal ? this.width : this.height;
        const edge = Math.min(0.2, 62 / extent);
        const glow = ctx.createLinearGradient(0, 0, horizontal ? extent : 0, horizontal ? 0 : extent);
        glow.addColorStop(0, `rgba(223, 29, 49, ${opacity})`);
        glow.addColorStop(edge, '#df1d3100'); glow.addColorStop(1 - edge, '#df1d3100');
        glow.addColorStop(1, `rgba(223, 29, 49, ${opacity})`);
        ctx.fillStyle = glow; ctx.fillRect(0, 0, this.width, this.height);
      }
      ctx.strokeStyle = '#cf3e4b'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, this.width - 2, this.height - 2);
    }
    const bull = state.story.event === 'bull' && state.story.bullUntil > state.time;
    const reversal = state.story.event === 'alarm' && state.story.news === REVERSAL_QUOTE;
    if ((bull || reversal) && state.status !== 'defeat') {
      const shake = reversal && !reduced ? clamp(state.shake * 10, 0, 3) : 0;
      const y = this.height * 0.39;
      ctx.save();
      ctx.translate(Math.sin(state.time * 71) * shake, Math.cos(state.time * 83) * shake);
      ctx.fillStyle = reversal ? '#24090ddd' : '#132015cc';
      ctx.fillRect(16, y - 25, Math.max(1, this.width - 32), 50);
      ctx.strokeStyle = reversal ? '#c64c59' : '#a59d5b';
      ctx.lineWidth = 1;
      path(ctx, [16, y + 25, this.width - 16, y + 25]); ctx.stroke();
      ctx.font = `bold ${clamp(this.width * 0.036, 15, 27)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = reversal ? '#ffb1b0' : '#e4d39b';
      ctx.fillText(reversal ? REVERSAL_QUOTE : STORY_NEWS.bull, this.width / 2, y, Math.max(1, this.width - 48));
      ctx.restore();
    }
    const intro = state.story.bossIntroUntil - state.time;
    if (intro > 0 && state.status !== 'defeat') {
      const strength = clamp(intro, 0, 1);
      ctx.globalAlpha = reduced ? 0.9 : Math.min(1, strength * 5);
      ctx.font = `bold ${reduced ? 28 : 28 + strength * 8}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#21090c'; ctx.lineWidth = 5; ctx.fillStyle = '#ff8b8c';
      const maxWidth = Math.max(1, this.width - 32);
      ctx.strokeText('资本长老会主席', this.width / 2, this.height * 0.65, maxWidth);
      ctx.fillText('资本长老会主席', this.width / 2, this.height * 0.65, maxWidth);
    }
    ctx.restore();
  }

  private drawBlackFlash(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    if (state.status !== 'finishing' || state.blackFlash <= 0) return;
    // The engine freezes world time here. Only the dedicated 0.4s countdown animates this pass.
    const progress = reduced ? 0.5 : 1 - clamp(state.blackFlash / 0.4, 0, 1);
    const boss = state.enemies.find((enemy) => enemy.id === state.story.bossId);
    const origin = boss ?? state.player;
    const x = (origin.x - this.cameraX) * this.scale;
    const y = (origin.y - this.cameraY) * this.scale;
    const reach = Math.hypot(this.width, this.height) * 0.65;
    ctx.save();
    ctx.fillStyle = reduced ? 'rgba(42, 4, 13, 0.6)' : `rgba(9, 0, 4, ${0.18 + progress * 0.58})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = reduced ? '#ad354a' : '#ff294b';
    ctx.lineWidth = reduced ? 2 : 2 + (1 - progress) * 3;
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    const count = reduced ? 4 : 9;
    for (let i = 0; i < count; i++) {
      const angle = i * TAU / count + 0.19;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let step = 1; step <= 5; step++) {
        const distance = reach * step / 5;
        const offset = Math.sin(i * 9 + step * 4 + progress * 5) * reach * 0.035;
        ctx.lineTo(x + Math.cos(angle) * distance - Math.sin(angle) * offset,
          y + Math.sin(angle) * distance + Math.cos(angle) * offset);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFields(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    const scale = state.hexes.includes('wide') ? 1.35 : 1;
    for (const strike of state.strikes) {
      ctx.save(); ctx.translate(strike.x, strike.y);
      ctx.strokeStyle = strike.delay > 0 ? '#fc795b' : '#efa363';
      ctx.fillStyle = strike.delay > 0 ? '#f4744b13' : '#f48e412c';
      ctx.lineWidth = 2;
      if (strike.delay > 0) ctx.setLineDash([7, 5]);
      circle(ctx, 0, 0, strike.radius); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      if (strike.delay > 0) {
        path(ctx, [-12, 0, 12, 0]); ctx.stroke(); path(ctx, [0, -12, 0, 12]); ctx.stroke();
        ctx.fillStyle = '#f3bf83'; ctx.fillRect(-4, -30 - strike.delay * 90, 8, 16);
      } else {
        ctx.globalAlpha = Math.min(0.6, strike.life / 2);
        for (let i = 0; i < 8; i++) {
          const angle = i * TAU / 8;
          const x = Math.cos(angle) * strike.radius * 0.6;
          const y = Math.sin(angle) * strike.radius * 0.6;
          const height = 10 + (reduced ? 8 : Math.sin(state.time * 8 + i) * 7 + 8);
          ctx.fillStyle = '#ffb664'; ctx.fillRect(x, y - height, 4, height);
        }
      }
      ctx.restore();
    }
    if (state.effects.wall > 0) {
      ctx.save(); ctx.translate(state.player.x, state.player.y);
      ctx.rotate(reduced ? 0 : state.time * 0.7);
      ctx.strokeStyle = '#edcd80'; ctx.fillStyle = '#edcd8010'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const angle = i * TAU / 8;
        const x = Math.cos(angle) * 74 * scale; const y = Math.sin(angle) * 74 * scale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    if (state.effects.arc > 0) {
      ctx.save(); ctx.translate(state.player.x, state.player.y);
      ctx.globalAlpha = Math.min(1, state.effects.arc * 4);
      ctx.strokeStyle = '#a8e5ff'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const angle = i * TAU / 24; const r = (i % 2 === 0 ? 106 : 87) * scale;
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.stroke(); ctx.restore();
    }
  }

  private drawWeaponFields(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    if (!state.equipped.includes('cuda')) return;
    const cuda = state.weapons.find((weapon) => weapon.id === 'cuda' && weapon.level > 0);
    if (!cuda) return;
    const wide = state.hexes.includes('wide') ? 1.35 : 1;
    const radius = (cuda.evolved ? 210 : 60 + cuda.level * 10) * wide;
    const owners: readonly Point[] = state.effects.clone ? [state.player, state.effects.clone] : [state.player];
    for (const owner of owners) {
      if (!this.visible(owner.x, owner.y, radius)) continue;
      ctx.save(); ctx.translate(owner.x, owner.y);
      const glow = ctx.createRadialGradient(0, 0, radius * 0.25, 0, 0, radius);
      glow.addColorStop(0, '#55da7300');
      glow.addColorStop(0.85, cuda.evolved ? '#55da7320' : '#55da7310');
      glow.addColorStop(1, '#88ed7540');
      ctx.fillStyle = glow; circle(ctx, 0, 0, radius); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = cuda.evolved ? '#c9ffa4' : '#8fdd76';
      circle(ctx, 0, 0, radius - 1); ctx.stroke();
      ctx.rotate(reduced ? 0 : state.time * 0.22);
      ctx.lineWidth = 1; ctx.strokeStyle = '#62c980';
      circle(ctx, 0, 0, radius * 0.86); ctx.stroke();
      const count = cuda.evolved ? 24 : 16;
      for (let i = 0; i < count; i++) {
        ctx.save(); ctx.rotate(i * TAU / count);
        path(ctx, [radius * 0.72, 0, radius * 0.8, 0, radius * 0.86, 5, radius * 0.94, 5]);
        ctx.stroke();
        ctx.fillStyle = i % 2 === 0 ? LIME : '#54b68a';
        circle(ctx, radius * 0.94, 5, 1.8); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  }

  private drawDucks(ctx: CanvasRenderingContext2D, state: GameState): void {
    if (!state.equipped.includes('duck')) return;
    const duck = state.weapons.find((weapon) => weapon.id === 'duck' && weapon.level > 0);
    if (!duck) return;
    const owners: readonly Point[] = state.effects.clone ? [state.player, state.effects.clone] : [state.player];
    const count = duck.evolved ? 6 : 2;
    const radius = duck.evolved ? 64 : 48;
    for (const owner of owners) {
      for (let i = 0; i < count; i++) {
        // These are firing origins, so their orbit remains accurate in reduced motion.
        const angle = state.time * (duck.evolved ? 3.2 : 1.8) + i * TAU / count;
        const x = owner.x + Math.cos(angle) * radius;
        const y = owner.y + Math.sin(angle) * radius;
        if (!this.visible(x, y, 12)) continue;
        ctx.save(); ctx.translate(x, y);
        ctx.scale(Math.cos(angle + Math.PI / 2) < 0 ? -1 : 1, 1);
        this.drawCyberDuck(ctx, duck.evolved ? 10 : 9);
        ctx.restore();
      }
    }
  }

  private drawCyberDuck(ctx: CanvasRenderingContext2D, radius: number): void {
    ctx.save(); ctx.scale(radius / 10, radius / 10);
    path(ctx, [-9, -1, -4, 1, -5, 5], true);
    ctx.fillStyle = '#a4d968'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1, 2, 7, 4.5, 0, 0, TAU);
    ctx.fillStyle = '#d6e780'; ctx.fill();
    circle(ctx, 3, -3, 4); ctx.fill();
    path(ctx, [6, -4, 10, -2, 6, -1], true);
    ctx.fillStyle = '#e7ba66'; ctx.fill();
    ctx.fillStyle = '#122d28'; ctx.fillRect(1, -5, 5, 3);
    ctx.fillStyle = '#7cffe0'; ctx.fillRect(3, -4, 2, 1);
    ctx.strokeStyle = '#267866'; ctx.lineWidth = 1;
    path(ctx, [-5, 1, -2, 1, 0, 3, 3, 3]); ctx.stroke();
    ctx.fillStyle = '#183b2c'; ctx.fillRect(-3, 3, 3, 2);
    ctx.strokeStyle = '#88e6ba'; path(ctx, [1, -6, 0, -8]); ctx.stroke();
    circle(ctx, 0, -8, 1); ctx.fillStyle = LIME; ctx.fill();
    ctx.restore();
  }

  private drawWeaponEffect(ctx: CanvasRenderingContext2D, effect: WeaponEffect, reduced: boolean): void {
    if (effect.life <= 0 || effect.maxLife <= 0 || effect.length <= 0) return;
    if (effect.kind === 'beam' && effect.width <= 0) return;
    if (!this.visible(effect.x, effect.y, effect.length + Math.max(0, effect.width) / 2)) return;
    const life = clamp(effect.life / effect.maxLife, 0, 1);
    ctx.save(); ctx.translate(effect.x, effect.y); ctx.rotate(effect.angle);
    ctx.globalAlpha = (0.35 + life * 0.65) * (effect.spectral ? 0.65 : 1);
    if (effect.kind === 'beam') {
      const halfWidth = effect.width / 2;
      const glow = ctx.createLinearGradient(0, -halfWidth, 0, halfWidth);
      glow.addColorStop(0, '#21cdb548'); glow.addColorStop(0.22, '#22cbbf');
      glow.addColorStop(0.5, '#d8fffc'); glow.addColorStop(0.78, '#52ceec');
      glow.addColorStop(1, '#43a6f448');
      ctx.strokeStyle = glow; ctx.lineWidth = effect.width; ctx.lineCap = 'round';
      path(ctx, [0, 0, effect.length, 0]); ctx.stroke();
      ctx.fillStyle = effect.spectral ? '#dfd5ff' : '#ccffed';
      const tubeWidth = Math.min(2, effect.width * 0.12);
      for (const side of [-1, 1]) {
        ctx.fillRect(0, side * effect.width * 0.23 - tubeWidth / 2, effect.length, tubeWidth);
      }
      if (effect.evolved) {
        ctx.fillStyle = '#edffff';
        ctx.fillRect(effect.length - 2, -halfWidth, 2, effect.width);
        ctx.fillRect(0, -effect.width * 0.08, effect.length, effect.width * 0.16);
      }
    } else {
      const halfArc = clamp(effect.arc, 0, TAU) / 2;
      if (halfArc > 0) {
        const radius = effect.length;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -halfArc, halfArc); ctx.closePath();
        ctx.fillStyle = effect.evolved ? '#4bff9160' : '#85de733a'; ctx.fill();
        ctx.strokeStyle = effect.spectral ? '#c8bdff' : '#a7ffc1';
        ctx.lineWidth = Math.min(3, radius * 0.04);
        ctx.beginPath(); ctx.arc(0, 0, radius - ctx.lineWidth / 2, -halfArc, halfArc); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = '#52ce81';
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.78, -halfArc, halfArc); ctx.stroke();
        // Sweep inside the complete sector, rather than doubling its angle.
        ctx.rotate(reduced ? 0 : (1 - life * 2) * halfArc * 0.65);
        const bladeHalf = Math.min(radius * 0.13, radius * halfArc * 0.2);
        const tip = Math.sqrt(radius * radius - bladeHalf * bladeHalf) - 1;
        ctx.lineWidth = Math.min(5, radius * 0.06); ctx.strokeStyle = '#d9e8bf';
        path(ctx, [radius * 0.12, 0, radius * 0.7, 0]); ctx.stroke();
        path(ctx, [radius * 0.62, -bladeHalf * 0.5, tip, -bladeHalf,
          tip, bladeHalf, radius * 0.62, bladeHalf * 0.5], true);
        ctx.fillStyle = effect.evolved ? '#7cffa8' : '#acc8ac'; ctx.fill();
        ctx.strokeStyle = '#e7ffd8'; ctx.lineWidth = 1; ctx.stroke();
        ctx.strokeStyle = '#3f8260';
        for (const side of [-1, 0, 1]) {
          path(ctx, [radius * 0.73, side * bladeHalf * 0.45, radius * 0.9, side * bladeHalf * 0.6]);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  private visible(x: number, y: number, margin: number): boolean {
    return x + margin >= this.cameraX && x - margin <= this.cameraX + this.viewWidth
      && y + margin >= this.cameraY && y - margin <= this.cameraY + this.viewHeight;
  }

  private drawArena(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = '#0b100e';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const floor = ctx.createRadialGradient(600, 400, 60, 600, 400, 660);
    floor.addColorStop(0, '#17271b');
    floor.addColorStop(0.5, '#101c15');
    floor.addColorStop(1, '#0c1410');
    path(ctx, [48, 18, 1152, 18, 1182, 48, 1182, 752, 1152, 782, 48, 782, 18, 752, 18, 48], true);
    ctx.fillStyle = '#171f19';
    ctx.fill();
    ctx.strokeStyle = '#3b4b3c';
    ctx.lineWidth = 2;
    ctx.stroke();
    path(ctx, [72, 46, 1128, 46, 1154, 72, 1154, 728, 1128, 754, 72, 754, 46, 728, 46, 72], true);
    ctx.fillStyle = floor;
    ctx.fill();
    ctx.strokeStyle = '#293d2e';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = '#1a2a1f';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = 80; x <= 1120; x += 80) {
      ctx.moveTo(x, 65);
      ctx.lineTo(x, 735);
    }
    for (let y = 80; y <= 720; y += 80) {
      ctx.moveTo(65, y);
      ctx.lineTo(1135, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#344637';
    for (let x = 80; x <= 1120; x += 80) {
      for (let y = 80; y <= 720; y += 80) ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
    }

    ctx.fillStyle = '#14251a';
    ctx.fillRect(82, 384, 1036, 32);
    ctx.fillRect(584, 80, 32, 640);
    ctx.strokeStyle = '#304231';
    ctx.setLineDash([18, 12]);
    path(ctx, [90, 400, 1110, 400]);
    ctx.stroke();
    path(ctx, [600, 88, 600, 712]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.save();
        ctx.translate(600, 400);
        ctx.scale(sx, sy);
        ctx.strokeStyle = '#284631';
        ctx.lineWidth = 1.2;
        for (let lane = 0; lane < 3; lane += 1) {
          const offset = lane * 9;
          path(ctx, [145, 48 + offset, 203, 48 + offset, 250, 95 + offset,
            424, 95 + offset, 460, 131 + offset, 502, 131 + offset]);
          ctx.stroke();
          circle(ctx, 502, 131 + offset, 2.5);
          ctx.fillStyle = lane === 1 ? '#638653' : '#34513a';
          ctx.fill();
        }
        ctx.strokeStyle = '#203b2b';
        path(ctx, [72, 148, 72, 196, 128, 252, 338, 252, 370, 284, 482, 284]);
        ctx.stroke();
        path(ctx, [92, 139, 92, 188, 140, 236, 270, 236, 292, 214, 416, 214]);
        ctx.stroke();
        ctx.strokeRect(414, 208, 12, 12);
        ctx.fillStyle = '#45623f';
        ctx.fillRect(418, 212, 4, 4);
        ctx.fillStyle = '#294330';
        for (let x = 215; x < 475; x += 76) {
          path(ctx, [x, 14, x + 8, 20, x, 26, x + 3, 20], true);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    for (let i = 0; i < 6; i += 1) {
      const x = 102 + i * 178;
      for (const y of [24, 760]) {
        ctx.fillStyle = '#0b130e';
        ctx.fillRect(x, y, 106, 15);
        ctx.strokeStyle = '#324332';
        ctx.strokeRect(x, y, 106, 15);
        ctx.fillStyle = '#2c3c2d';
        for (let j = 0; j < 7; j += 1) ctx.fillRect(x + 8 + j * 9, y + 4, 4, 7);
        ctx.fillStyle = i % 3 === 0 ? '#9caf65' : '#4a7050';
        ctx.fillRect(x + 90, y + 6, 7, 3);
      }
    }
    for (let i = 0; i < 5; i += 1) {
      for (const x of [25, 1159]) {
        const y = 111 + i * 125;
        ctx.fillStyle = '#0b130e';
        ctx.fillRect(x, y, 16, 78);
        ctx.strokeStyle = '#334633';
        ctx.strokeRect(x, y, 16, 78);
        ctx.fillStyle = '#526348';
        ctx.fillRect(x + 6, y + 9, 4, 12);
        ctx.fillStyle = '#253a2b';
        ctx.fillRect(x + 6, y + 29, 4, 38);
      }
    }
    ctx.strokeStyle = '#747749';
    ctx.lineWidth = 3;
    for (const x of [65, 1117]) {
      for (const y of [65, 719]) {
        for (let i = 0; i < 3; i += 1) {
          path(ctx, [x + i * 7, y + 9, x + 5 + i * 7, y]);
          ctx.stroke();
        }
      }
    }

    this.drawTemple(ctx);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `10px ${MONO}`;
    const sectors = [
      { x: 116, y: 152, code: '01 / MEMORY ARCHIVE', name: '记忆阵列' },
      { x: 880, y: 152, code: '02 / INFERENCE BAY', name: '推演回廊' },
      { x: 116, y: 645, code: '03 / RECOVERY NODE', name: '重构节点' },
      { x: 880, y: 645, code: '04 / POWER TRANSIT', name: '能源通路' },
    ];
    for (const sector of sectors) {
      ctx.fillStyle = '#5b7057';
      ctx.fillText(sector.code, sector.x, sector.y);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#405a43';
      ctx.fillText(sector.name, sector.x, sector.y + 20);
      ctx.font = `10px ${MONO}`;
      ctx.fillStyle = '#3d5d41';
      ctx.fillRect(sector.x, sector.y - 18, 22, 2);
    }
    ctx.font = `9px ${MONO}`;
    ctx.fillStyle = '#62765b';
    ctx.textAlign = 'center';
    ctx.fillText('N / 000', 600, 68);
    ctx.fillText('S / 800', 600, 738);
    ctx.save();
    ctx.translate(65, 400);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('W / 000', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(1137, 400);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('E / 1200', 0, 0);
    ctx.restore();
    ctx.restore();
  }

  private drawTemple(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    circle(ctx, 0, 0, 157);
    ctx.fillStyle = '#101c14';
    ctx.fill();
    ctx.strokeStyle = '#3a5138';
    ctx.lineWidth = 2;
    ctx.stroke();
    circle(ctx, 0, 0, 147);
    ctx.strokeStyle = '#263d2a';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < 64; i += 1) {
      const angle = i * TAU / 64;
      const major = i % 8 === 0;
      ctx.strokeStyle = major ? '#718a57' : '#354f35';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * (major ? 130 : 136), Math.sin(angle) * (major ? 130 : 136));
      ctx.lineTo(Math.cos(angle) * 142, Math.sin(angle) * 142);
      ctx.stroke();
    }
    circle(ctx, 0, 0, 121);
    ctx.fillStyle = '#16251a';
    ctx.fill();
    ctx.strokeStyle = '#405c3b';
    ctx.stroke();
    for (let i = 0; i < 8; i += 1) {
      const angle = i * TAU / 8;
      circle(ctx, Math.cos(angle) * 150, Math.sin(angle) * 150, 3);
      ctx.fillStyle = '#8a9866';
      ctx.fill();
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = '#2b4230';
      ctx.fillRect(99, -5, 18, 10);
      ctx.fillStyle = '#647951';
      ctx.fillRect(103, -1, 9, 2);
      ctx.restore();
    }
    path(ctx, [-40, -96, 40, -96, 96, -40, 96, 40, 40, 96, -40, 96, -96, 40, -96, -40], true);
    ctx.fillStyle = '#0e1a12';
    ctx.fill();
    ctx.strokeStyle = '#3c5939';
    ctx.stroke();
    ctx.strokeStyle = '#2c4a31';
    for (let i = -2; i <= 2; i += 1) {
      const offset = i * 12;
      for (let side = 0; side < 4; side += 1) {
        ctx.save();
        ctx.rotate(side * Math.PI / 2);
        path(ctx, [offset, 41, offset, 61, offset + 12, 73, offset + 12, 85]);
        ctx.stroke();
        ctx.fillStyle = '#617b48';
        ctx.fillRect(offset - 2, 40, 4, 7);
        ctx.restore();
      }
    }
    ctx.fillStyle = '#233924';
    ctx.fillRect(-39, -39, 78, 78);
    ctx.strokeStyle = '#668750';
    ctx.strokeRect(-39, -39, 78, 78);
    ctx.fillStyle = '#122417';
    ctx.fillRect(-32, -32, 64, 64);
    ctx.fillStyle = '#8cb461';
    ctx.fillRect(-18, -19, 36, 4);
    ctx.fillRect(-18, -11, 6, 26);
    ctx.fillRect(12, -11, 6, 26);
    ctx.fillRect(-4, -5, 8, 20);
    ctx.fillRect(-21, 19, 42, 4);
    ctx.font = `8px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#779461';
    ctx.fillText('COMPUTE SANCTUM / 00', 0, 109);
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: Player, time: number, reduced: boolean, seated = false): void {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(Math.max(0.5, player.radius / 14), Math.max(0.5, player.radius / 14));
    ctx.fillStyle = 'rgba(0, 5, 2, 0.65)';
    ctx.beginPath();
    ctx.ellipse(0, seated ? 23 : 18, 15, 6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(182, 237, 118, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 16, 21, 9, 0, 0, TAU);
    ctx.stroke();
    const breathing = reduced || seated ? 0 : Math.sin(time * 2.7) * (player.moving ? 0.45 : 1.1);
    const stride = !reduced && player.moving && !seated ? Math.sin(time * 14) * 2.8 : 0;
    ctx.translate(0, breathing);
    ctx.scale(Math.cos(player.facing) < 0 ? -1 : 1, 1);
    const hurt = player.invincible > 0;
    if (seated) {
      // A molded plastic back and seat on crossed folding legs, not a standing frame.
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = '#eef3e9'; ctx.lineWidth = 3;
      path(ctx, [-14, 12, 10, 25]); ctx.stroke();
      path(ctx, [11, 12, -14, 25]); ctx.stroke();
      ctx.strokeStyle = '#abb8aa'; ctx.lineWidth = 1;
      path(ctx, [-14, 12, 10, 25]); ctx.stroke();
      path(ctx, [11, 12, -14, 25]); ctx.stroke();
      path(ctx, [-17, -9, -14, -12, 6, -12, 9, -9, 7, 11, -16, 11], true);
      ctx.fillStyle = '#f1f3e9'; ctx.fill();
      ctx.strokeStyle = '#b4c0b1'; ctx.stroke();
      ctx.fillStyle = '#a8b7aa';
      for (let x = -12; x <= 3; x += 5) ctx.fillRect(x, -7, 2, 11);
      path(ctx, [-17, 11, 12, 11, 16, 15, -16, 15], true);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = '#b9c6b6'; ctx.stroke();
      circle(ctx, -2, 19, 1.5); ctx.fillStyle = '#8c9e8e'; ctx.fill();
      // Separate thighs, bent knees and grounded shins keep the seated silhouette readable.
      for (const leg of [[-6, 10, -1, 16, -3, 23], [3, 10, 12, 16, 10, 23]]) {
        path(ctx, leg); ctx.strokeStyle = '#536653'; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = '#08130e'; ctx.lineWidth = 5; ctx.stroke();
      }
      ctx.fillStyle = '#101d16';
      path(ctx, [-5, 22, 1, 22, 5, 25, -5, 25], true); ctx.fill();
      path(ctx, [8, 22, 14, 22, 17, 25, 8, 25], true); ctx.fill();
      ctx.fillStyle = '#74856c'; ctx.fillRect(-5, 25, 10, 1.5); ctx.fillRect(8, 25, 9, 1.5);
    } else {
      ctx.fillStyle = '#060d0a';
      ctx.fillRect(-8, 9, 6, 11 + stride);
      ctx.fillRect(3, 9, 6, 11 - stride);
      ctx.fillStyle = '#647765';
      ctx.fillRect(-9, 19 + stride, 8, 2);
      ctx.fillRect(3, 19 - stride, 8, 2);
    }
    ctx.save();
    if (seated) { ctx.translate(0, 5); ctx.scale(1, 0.75); }
    ctx.fillStyle = '#243c2d';
    ctx.fillRect(-13, -10, 7, 20);
    ctx.fillStyle = '#75965e';
    ctx.fillRect(-12, -7, 2, 10);
    path(ctx, [-9, -12, 5, -12, 11, -5, 10, 12, 4, 15, -11, 11, -12, -4], true);
    ctx.fillStyle = hurt && !reduced ? '#b7c9b3' : '#111c17';
    ctx.fill();
    ctx.strokeStyle = hurt ? '#e0f1d5' : '#5c7660';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#263a2c';
    ctx.fillRect(-4, -8, 2, 18);
    ctx.fillStyle = '#8da978';
    ctx.fillRect(-9, -6, 3, 4);
    ctx.fillStyle = '#52654a';
    ctx.fillRect(-9, 7, 18, 3);
    ctx.fillStyle = '#18251c';
    ctx.fillRect(-2, 6, 5, 5);
    ctx.fillStyle = hurt && !reduced ? '#e4eed7' : '#0a1410';
    ctx.fillRect(-8, -24, 15, 14);
    ctx.fillRect(-10, -20, 3, 8);
    ctx.fillStyle = '#344938';
    ctx.fillRect(-7, -24, 12, 3);
    ctx.fillStyle = '#b5b898';
    ctx.fillRect(-1, -19, 8, 7);
    ctx.fillStyle = '#111e17';
    ctx.fillRect(-2, -19, 10, 3);
    ctx.fillStyle = LIME;
    ctx.fillRect(2, -18, 6, 1.5);
    if (seated) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const arm of [[-9, -5, -12, 2, -5, 6], [9, -5, 14, 2, 11, 6]]) {
        path(ctx, arm); ctx.strokeStyle = '#526c54'; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = '#101e16'; ctx.lineWidth = 4; ctx.stroke();
      }
      ctx.fillStyle = '#294f30'; ctx.fillRect(-6, 1, 19, 9);
      ctx.strokeStyle = '#b4ed89'; ctx.lineWidth = 1; ctx.strokeRect(-6, 1, 19, 9);
      for (const x of [-1, 7]) {
        circle(ctx, x, 5.5, 3); ctx.fillStyle = '#0b1b13'; ctx.fill();
        ctx.strokeStyle = '#71af67'; ctx.stroke();
        path(ctx, [x - 2, 5.5, x + 2, 5.5]); ctx.stroke();
      }
      ctx.fillStyle = '#c4b17c'; ctx.fillRect(-2, 10, 10, 2);
      ctx.fillStyle = '#b5b898'; ctx.fillRect(-7, 4, 3, 4); ctx.fillRect(11, 4, 3, 4);
    } else {
      ctx.fillStyle = '#0b1711';
      ctx.fillRect(7, -5, 7, 8);
      ctx.strokeStyle = '#6a875e';
      ctx.strokeRect(9, -4, 9, 6);
      ctx.fillStyle = LIME;
      ctx.fillRect(11, -2, 5, 2);
    }
    ctx.restore();
    ctx.restore();

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.facing);
    ctx.strokeStyle = '#95c76a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius + 13, -0.16, 0.16);
    ctx.stroke();
    ctx.restore();
  }

  private drawEnemyThreat(ctx: CanvasRenderingContext2D, enemy: Enemy, reduced: boolean): void {
    if (enemy.hp <= 0) return;
    if (enemy.spawnGrace > 0) {
      ctx.save(); ctx.translate(enemy.x, enemy.y);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#e4bb72'; ctx.fillStyle = '#e4bb7218'; ctx.lineWidth = 1.5;
      circle(ctx, 0, 0, enemy.radius + 8); ctx.fill(); ctx.stroke();
      const progress = 1 - clamp(enemy.spawnGrace / 0.85, 0, 1);
      ctx.strokeStyle = '#f8d8a1'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, enemy.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress); ctx.stroke();
      ctx.restore();
      return;
    }
    if (enemy.kind !== 'security' || enemy.chargeState === 'approach') return;
    ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(enemy.chargeAngle);
    const radius = enemy.radius;
    if (enemy.chargeState === 'aim') {
      const progress = 1 - clamp(enemy.chargeTime / 0.9, 0, 1);
      ctx.fillStyle = `rgba(244, 69, 66, ${0.045 + progress * 0.055})`;
      ctx.fillRect(0, -radius, 600, radius * 2);
      ctx.strokeStyle = '#ff6265'; ctx.lineWidth = 1.5 + progress;
      ctx.globalAlpha = 0.65 + progress * 0.35;
      path(ctx, [0, 0, 600, 0]); ctx.stroke();
      ctx.lineWidth = 1; ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = reduced ? 0 : -enemy.motionTime * 22;
      path(ctx, [0, -radius, 600, -radius]); ctx.stroke();
      path(ctx, [0, radius, 600, radius]); ctx.stroke();
      ctx.setLineDash([]);
      for (let x = 60; x < 600; x += 90) {
        path(ctx, [x - 7, -5, x, 0, x - 7, 5]); ctx.stroke();
      }
      ctx.rotate(-enemy.chargeAngle);
      ctx.font = `bold 9px ${MONO}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb4a2';
      ctx.fillText(`${Math.max(0, enemy.chargeTime).toFixed(1)}s`, 0, radius + 17);
    } else {
      // A persistent, non-flickering trail also communicates the dash in reduced motion.
      const trail = ctx.createLinearGradient(-radius * 5, 0, 0, 0);
      trail.addColorStop(0, '#ff535b00'); trail.addColorStop(1, '#ff535b70');
      ctx.fillStyle = trail;
      path(ctx, [-radius * 5, -radius * 0.2, 0, -radius * 0.8,
        0, radius * 0.8, -radius * 5, radius * 0.2], true); ctx.fill();
      ctx.strokeStyle = '#ff9d90'; ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        path(ctx, [-radius * (reduced ? 2.5 : 4), side * radius * 0.35, -radius, side * radius * 0.6]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, reduced: boolean, bossEnraged = false): void {
    if (enemy.hp <= 0 || enemy.radius <= 0) return;
    ctx.save(); ctx.translate(enemy.x, enemy.y);
    ctx.globalAlpha *= enemy.spawnGrace > 0 ? 0.3 : 1;
    const unit = enemy.radius / 16;
    ctx.scale(unit, unit);
    ctx.fillStyle = 'rgba(0, 4, 2, 0.45)';
    ctx.beginPath(); ctx.ellipse(0, 10, 13, 4, 0, 0, TAU); ctx.fill();
    // Only the enemy-local clock drives animation: phase stays a random initial offset.
    const step = reduced || enemy.spawnGrace > 0 ? 0 : Math.sin(enemy.motionTime * 8 + enemy.phase);
    const flash = enemy.flash > 0 && !reduced;
    const outline = ENEMY_COLORS[enemy.kind];
    ctx.lineWidth = 1; ctx.lineJoin = 'round';
    if (enemy.kind === 'boss') {
      this.drawBoss(ctx, flash, bossEnraged || enemy.hp < enemy.maxHp * 0.5, step);
    } else if (enemy.kind === 'guard') {
      this.drawGuard(ctx, flash, step);
    } else if (enemy.kind === 'assassin') {
      this.drawAssassin(ctx, flash, step);
    } else if (enemy.kind === 'bull') {
      this.drawBull(ctx, flash, step);
    } else if (enemy.kind === 'short') {
      path(ctx, [-11, -10, -4, -10, -4, -3, 4, 2, 7, -1, 10, 12, -2, 8, 1, 5, -11, -2], true);
      ctx.fillStyle = flash ? '#fff2df' : '#a93842'; ctx.fill();
      ctx.strokeStyle = outline; ctx.stroke();
      ctx.strokeStyle = '#ffd0a7';
      path(ctx, [-8, -7, -7, -1, 6, 7]); ctx.stroke();
      ctx.fillStyle = '#fa8b77'; ctx.fillRect(-9, -6, 3, 2);
    } else if (enemy.kind === 'security') {
      ctx.fillStyle = '#111d19';
      ctx.fillRect(-9, 8, 6, 6); ctx.fillRect(3, 8, 6, 6);
      ctx.fillStyle = '#76847a'; ctx.fillRect(-9, 12, 6, 2); ctx.fillRect(3, 12, 6, 2);
      ctx.fillStyle = flash ? '#ecf4dc' : '#46544c';
      ctx.fillRect(-13, -3, 4, 9); ctx.fillRect(9, -3, 4, 9);
      path(ctx, [-8, -3, 8, -3, 10, 5, 6, 10, -6, 10, -10, 5], true);
      ctx.fill(); ctx.strokeStyle = '#a6b6a2'; ctx.stroke();
      path(ctx, [-9, -11, 9, -11, 11, -8, 9, -2, -9, -2, -11, -8], true);
      ctx.fillStyle = flash ? '#ffffff' : '#25352c'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#09110e'; ctx.fillRect(-8, -8, 16, 4);
      ctx.fillStyle = '#ff535f'; ctx.fillRect(-6, -7, 4, 2); ctx.fillRect(2, -7, 4, 2);
      ctx.fillStyle = '#13291e'; ctx.fillRect(-5, 1, 10, 5);
      ctx.fillStyle = enemy.chargeState === 'approach' ? '#be685e' : '#ff7275';
      ctx.fillRect(-3, 2, 6, 2);
      ctx.strokeStyle = '#88a18b'; path(ctx, [-5, 8, 5, 8]); ctx.stroke();
    } else {
      const legal = enemy.kind === 'legal';
      ctx.fillStyle = '#0b1510';
      ctx.fillRect(-6, 6, 5, 7 + step * 0.7); ctx.fillRect(2, 6, 5, 7 - step * 0.7);
      ctx.fillStyle = '#67715a';
      ctx.fillRect(-7, 12 + step * 0.7, 6, 2); ctx.fillRect(2, 12 - step * 0.7, 6, 2);
      path(ctx, [-6, -5, 5, -5, 9, 0, 7, 8, -7, 8, -10, 0], true);
      ctx.fillStyle = flash ? '#f4f2dc' : legal ? '#080e0b' : '#625c35'; ctx.fill();
      ctx.strokeStyle = outline; ctx.stroke();
      ctx.fillStyle = legal ? '#d6dbbd' : '#dabd8d'; ctx.fillRect(-4, -11, 8, 7);
      ctx.fillStyle = '#182219'; ctx.fillRect(-5, -14, 9, 4);
      if (legal) {
        path(ctx, [-4, -5, 0, 2, 4, -5], true); ctx.fillStyle = '#dfe7d5'; ctx.fill();
        path(ctx, [0, -3, 2, 3, 0, 6, -2, 3], true); ctx.fillStyle = '#8c4147'; ctx.fill();
        ctx.fillStyle = '#162620'; ctx.fillRect(-5, -10, 10, 2);
        ctx.fillStyle = '#b6e0c4'; ctx.fillRect(-3, -10, 2, 1); ctx.fillRect(2, -10, 2, 1);
        ctx.save(); ctx.translate(8, 2); ctx.rotate(-0.18); this.drawDocument(ctx, 6.5); ctx.restore();
        ctx.fillStyle = '#c4c8a8'; ctx.fillRect(4, 6, 4, 2);
      } else {
        ctx.fillStyle = '#1a2118'; ctx.fillRect(-2, -10, 6, 2);
        ctx.fillStyle = '#efe0a5'; ctx.fillRect(-5, -1, 3, 4);
        ctx.strokeStyle = '#ac975c'; ctx.lineWidth = 3;
        path(ctx, [6, 0, 10, 4, 12, -2]); ctx.stroke();
        ctx.save(); ctx.translate(0, reduced ? 0 : step * 0.4);
        ctx.strokeStyle = '#443d26'; ctx.lineWidth = 2;
        path(ctx, [12, 2, 12, -5]); ctx.stroke();
        circle(ctx, 12, -6, 3); ctx.fillStyle = '#f7d34f'; ctx.fill();
        ctx.strokeStyle = '#ffeb9b'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.fillStyle = '#8c782b'; ctx.fillRect(10, -6, 4, 1); ctx.restore();
      }
    }
    if (enemy.ringMember && enemy.kind === 'reporter') {
      ctx.fillStyle = '#1b211d'; ctx.fillRect(6, -5, 8, 5);
      circle(ctx, 10, -2, 1.8); ctx.fillStyle = '#d7e6df'; ctx.fill();
      ctx.save(); ctx.globalAlpha *= reduced ? 0.65 : 0.5 + Math.sin(enemy.motionTime * 3 + enemy.phase) * 0.25;
      ctx.strokeStyle = '#fff4c2'; ctx.lineWidth = 1;
      path(ctx, [12, -14, 12, -7, 9, -10.5, 15, -10.5]); ctx.stroke();
      circle(ctx, 12, -10.5, 1.5); ctx.fillStyle = '#fff7dc'; ctx.fill(); ctx.restore();
    }
    // The main Boss health bar belongs to the UI, not to this sprite pass.
    if (enemy.kind !== 'boss') {
      const hp = enemy.maxHp > 0 ? clamp(enemy.hp / enemy.maxHp, 0, 1) : 0;
      ctx.fillStyle = '#161712'; ctx.fillRect(-12, -21, 24, 3);
      ctx.fillStyle = hp < 0.4 ? '#f49160' : outline; ctx.fillRect(-12, -21, 24 * hp, 2);
    }
    if (enemy.kind === 'legal' || enemy.kind === 'short') {
      ctx.fillStyle = outline; ctx.font = `7px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(enemy.kind === 'legal' ? 'ELITE' : 'RANGED', 0, -25);
    }
    ctx.restore();
  }

  private drawBoss(ctx: CanvasRenderingContext2D, flash: boolean, enraged: boolean, step: number): void {
    // The shared enemy transform scales this mechanical suit to the Boss's radius (46).
    const armor = flash ? '#f8e5df' : enraged ? '#872a3b' : '#283038';
    const edge = enraged ? '#ff6473' : '#b0adb0';
    ctx.fillStyle = '#121720';
    ctx.fillRect(-10, 7, 7, 7 + step * 0.5); ctx.fillRect(3, 7, 7, 7 - step * 0.5);
    ctx.fillStyle = armor; ctx.strokeStyle = edge; ctx.lineWidth = 0.7;
    for (const x of [-11, 3]) {
      ctx.fillRect(x, 11, 8, 5); ctx.strokeRect(x, 11, 8, 5);
      ctx.fillStyle = edge; ctx.fillRect(x + 1, 12, 6, 1); ctx.fillStyle = armor;
    }
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1);
      path(ctx, [9, -10, 15, -8, 16, -2, 11, 0, 8, -4], true);
      ctx.fill(); ctx.stroke();
      circle(ctx, 13, 1, 2.5); ctx.fillStyle = '#69717a'; ctx.fill();
      ctx.fillStyle = armor; ctx.fillRect(10, 3, 6, 7); ctx.strokeRect(10, 3, 6, 7);
      ctx.fillStyle = enraged ? '#ff5869' : '#d8ba7d'; ctx.fillRect(10, 7, 6, 1.5);
      ctx.strokeStyle = '#0e151c'; path(ctx, [12, 4, 12, 6, 14, 6]); ctx.stroke();
      ctx.restore();
    }
    path(ctx, [-8, -11, 8, -11, 11, 0, 8, 10, -8, 10, -11, 0], true);
    ctx.fillStyle = armor; ctx.fill(); ctx.strokeStyle = edge; ctx.stroke();
    path(ctx, [-5, -11, 5, -11, 2, 0, -2, 0], true); ctx.fillStyle = '#ddd9d0'; ctx.fill();
    path(ctx, [0, -10, 2, -7, 1, 3, -1, 3, -2, -7], true);
    ctx.fillStyle = enraged ? '#ff274b' : '#632f40'; ctx.fill();
    for (const side of [-1, 1]) {
      path(ctx, [side * 6, -10, side * 3, 0, side * 9, -5]); ctx.stroke();
      ctx.fillStyle = '#090e16'; ctx.fillRect(side < 0 ? -8 : 4, 3, 4, 4);
      ctx.fillStyle = enraged ? '#ff3c55' : '#d7b774';
      ctx.fillRect(side < 0 ? -7 : 5, 4, 2, 1);
    }
    path(ctx, [-6, -18, 5, -18, 7, -14, 5, -10, -5, -10, -7, -14], true);
    ctx.fillStyle = flash ? '#fff0eb' : '#727780'; ctx.fill(); ctx.strokeStyle = edge; ctx.stroke();
    ctx.fillStyle = '#191b26'; ctx.fillRect(-5, -17, 10, 2); ctx.fillRect(-5, -14, 10, 2);
    ctx.fillStyle = enraged ? '#ff526b' : '#efc987'; ctx.fillRect(-4, -14, 3, 1); ctx.fillRect(1, -14, 3, 1);
    ctx.strokeStyle = '#bbb5ae'; ctx.lineWidth = 0.5; path(ctx, [-3, -11, 3, -11]); ctx.stroke();
    if (enraged) {
      ctx.strokeStyle = '#ff637b'; ctx.lineWidth = 0.9;
      path(ctx, [-10, -7, -7, -3, -9, 0, -6, 5]); ctx.stroke();
      path(ctx, [10, -7, 7, -2, 9, 1, 6, 7]); ctx.stroke();
      circle(ctx, 0, 6, 2); ctx.fillStyle = '#ff3154'; ctx.fill();
    }
  }

  private drawGuard(ctx: CanvasRenderingContext2D, flash: boolean, step: number): void {
    // Each orbiting guard carries its own visible bullet-blocking surface.
    ctx.lineWidth = 1; ctx.strokeStyle = '#98c9de'; ctx.fillStyle = '#7db7d316';
    circle(ctx, 0, 0, 15.5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#090b12';
    ctx.fillRect(-6, 6, 5, 7 + step * 0.6); ctx.fillRect(2, 6, 5, 7 - step * 0.6);
    path(ctx, [-7, -5, 6, -5, 10, 0, 7, 8, -7, 8, -10, 0], true);
    ctx.fillStyle = flash ? '#e9eef5' : '#10121b'; ctx.fill(); ctx.strokeStyle = '#6d798b'; ctx.stroke();
    path(ctx, [-4, -5, 0, 2, 4, -5], true); ctx.fillStyle = '#cad1dc'; ctx.fill();
    path(ctx, [0, -3, 1.5, 3, 0, 6, -1.5, 3], true); ctx.fillStyle = '#252d40'; ctx.fill();
    ctx.fillStyle = '#b8b2ae'; ctx.fillRect(-4, -12, 8, 7);
    ctx.fillStyle = '#080b12'; ctx.fillRect(-5, -14, 10, 3); ctx.fillRect(-5, -10, 10, 3);
    ctx.fillStyle = '#a0c6e3'; ctx.fillRect(4, -10, 2, 2);
    ctx.strokeStyle = '#b8dfed'; ctx.lineWidth = 1.2;
    path(ctx, [10, -4, 14, -2, 14, 6, 10, 9, 7, 6, 7, -2, 10, -4]); ctx.stroke();
  }

  private drawAssassin(ctx: CanvasRenderingContext2D, flash: boolean, step: number): void {
    ctx.fillStyle = '#05060c';
    ctx.fillRect(-6, 7, 4, 7 + step); ctx.fillRect(2, 7, 4, 7 - step);
    path(ctx, [-5, -5, 5, -5, 11, 12, 2, 9, 0, 13, -10, 11], true);
    ctx.fillStyle = flash ? '#bcb6c3' : '#111019'; ctx.fill();
    ctx.strokeStyle = '#423046'; ctx.lineWidth = 0.8; ctx.stroke();
    path(ctx, [0, -16, 7, -10, 6, -3, -6, -3, -7, -10], true);
    ctx.fillStyle = '#070810'; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#716977'; path(ctx, [8, 3, 12, 10]); ctx.stroke();
    this.drawAssassinEyes(ctx);
  }

  private drawAssassinEyes(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#ff304b';
    circle(ctx, -3, -8, 1.4); ctx.fill(); circle(ctx, 3, -8, 1.4); ctx.fill();
  }

  private drawBull(ctx: CanvasRenderingContext2D, flash: boolean, step: number): void {
    ctx.save(); ctx.translate(0, step * 0.7);
    path(ctx, [-14, -5, -8, -2, 0, 0, 8, -2, 14, -5, 10, 7, 0, 11, -10, 7], true);
    ctx.fillStyle = flash ? '#fff5d2' : '#d79b28'; ctx.fill();
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -3, 8, 6, 0, 0, TAU);
    ctx.fillStyle = '#f4ce61'; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffeaa0'; path(ctx, [-10, 1, -6, 5, 6, 5, 10, 1]); ctx.stroke();
    ctx.fillStyle = '#62481b'; ctx.fillRect(-4, -4, 2, 2); ctx.fillRect(2, -4, 2, 2);
    ctx.strokeStyle = '#fff0ae'; ctx.lineWidth = 1;
    path(ctx, [-12, -13, -12, -7]); ctx.stroke(); path(ctx, [-15, -10, -9, -10]); ctx.stroke();
    ctx.fillStyle = '#8dec91'; ctx.fillRect(10, -10, 2, 2);
    ctx.restore();
  }

  private drawDocument(ctx: CanvasRenderingContext2D, radius: number): void {
    // Inscribe the rotating square in the projectile's collision circle.
    const half = radius / Math.SQRT2;
    ctx.fillStyle = '#e8ecd9'; ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.lineWidth = Math.min(0.8, radius * 0.08); ctx.strokeStyle = '#a3b39a';
    const inset = ctx.lineWidth / 2;
    ctx.strokeRect(-half + inset, -half + inset, half * 2 - inset * 2, half * 2 - inset * 2);
    ctx.fillStyle = '#7a9580'; ctx.fillRect(-half * 0.7, -half * 0.65, half * 1.4, half * 0.1);
    ctx.font = `bold ${half * 0.43}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#253a2a'; ctx.fillText('辞职协议', 0, 0, half * 1.8);
    ctx.fillStyle = '#b15151'; ctx.fillRect(half * 0.28, half * 0.35, half * 0.4, half * 0.35);
  }

  private drawArrow(ctx: CanvasRenderingContext2D, radius: number, color: string, accent: string): void {
    path(ctx, [radius, 0, radius * 0.05, -radius * 0.64, radius * 0.05, -radius * 0.24,
      -radius * 0.78, -radius * 0.24, -radius * 0.78, radius * 0.24,
      radius * 0.05, radius * 0.24, radius * 0.05, radius * 0.64], true);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = radius * 0.1;
    path(ctx, [-radius * 0.65, 0, radius * 0.6, 0]); ctx.stroke();
  }

  private drawEnemyProjectile(ctx: CanvasRenderingContext2D, shot: EnemyProjectile): void {
    if (shot.radius <= 0 || shot.life <= 0) return;
    ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(shot.rotation);
    if (shot.shape === 'document') this.drawDocument(ctx, shot.radius);
    else this.drawArrow(ctx, shot.radius, '#f35b65', '#ffd0a3');
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, projectile: Projectile, time: number, reduced: boolean): void {
    const radius = projectile.radius;
    if (radius <= 0 || projectile.life <= 0) return;
    const heading = Math.atan2(projectile.vy, projectile.vx);
    const weapon = projectile.weapon ?? 'gpu';
    const accent = projectile.spectral ? '#c5aeff' : projectile.homing && weapon === 'gpu' ? '#efd08c' : LIME;
    ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(heading);
    if (!reduced) {
      ctx.strokeStyle = projectile.spectral ? '#bea5ff45' : '#8fd46745';
      ctx.lineWidth = Math.min(2, radius * 0.25);
      path(ctx, [-radius * 2.4, 0, -radius, 0]); ctx.stroke();
    }
    if (weapon === 'crescent') {
      ctx.beginPath(); ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
      ctx.quadraticCurveTo(radius * 0.7, 0, 0, -radius); ctx.closePath();
      ctx.fillStyle = projectile.spectral ? '#bcf1d8' : '#60f6a0'; ctx.fill();
      ctx.strokeStyle = '#dcffe3'; ctx.lineWidth = radius * 0.07;
      ctx.beginPath(); ctx.arc(0, 0, radius * 0.91, -1.3, 1.3); ctx.stroke();
    } else if (weapon === 'duck') {
      circle(ctx, 0, 0, radius); ctx.fillStyle = projectile.evolved ? '#bafad5' : '#d6e985'; ctx.fill();
      path(ctx, [radius * 0.65, 0, -radius * 0.45, -radius * 0.5,
        -radius * 0.1, 0, -radius * 0.45, radius * 0.5], true);
      ctx.fillStyle = projectile.spectral ? '#806dbd' : '#257a68'; ctx.fill();
      circle(ctx, radius * 0.3, 0, radius * 0.17); ctx.fillStyle = '#edfff1'; ctx.fill();
    } else if (weapon === 'reflected') {
      this.drawArrow(ctx, radius, '#eac77b', '#f6ffe1');
    } else {
      // Orbit coordinates and radius (including evolved/wide scaling) belong to the engine.
      ctx.rotate(projectile.orbit ? projectile.orbit.angle + Math.PI / 2 - heading
        : reduced ? Math.PI / 4 : time * 13 + projectile.id * 0.7);
      ctx.fillStyle = accent; ctx.fillRect(-radius * 0.82, -radius * 0.5, radius * 1.64, radius);
      ctx.fillStyle = '#1a422b'; ctx.fillRect(-radius * 0.73, -radius * 0.41, radius * 1.46, radius * 0.82);
      ctx.fillStyle = '#c8b975';
      for (let i = 0; i < 4; i++) ctx.fillRect(radius * (-0.5 + i * 0.29), radius * 0.5, radius * 0.15, radius * 0.15);
      ctx.fillStyle = '#c4e6b4'; ctx.fillRect(-radius * 0.94, -radius * 0.31, radius * 0.1, radius * 0.62);
      const fans = projectile.evolved ? [-0.36, 0.36] : [0];
      const fanRadius = radius * (projectile.evolved ? 0.27 : 0.33);
      for (const x of fans) {
        ctx.save(); ctx.translate(radius * x, 0);
        circle(ctx, 0, 0, fanRadius); ctx.fillStyle = '#0a1c13'; ctx.fill();
        ctx.strokeStyle = '#83c984'; ctx.lineWidth = radius * 0.06; ctx.stroke();
        ctx.rotate(reduced ? 0 : time * 18);
        ctx.strokeStyle = projectile.evolved ? '#d8ffd6' : accent;
        for (let blade = 0; blade < 3; blade++) {
          ctx.rotate(TAU / 3); path(ctx, [0, 0, fanRadius * 0.75, 0]); ctx.stroke();
        }
        ctx.restore();
      }
      if (projectile.evolved) {
        ctx.fillStyle = '#c5ffb5'; ctx.fillRect(-radius * 0.62, -radius * 0.43, radius * 1.24, radius * 0.08);
      }
    }
    ctx.restore();
  }

  private drawCrystal(ctx: CanvasRenderingContext2D, crystal: Crystal, time: number, reduced: boolean): void {
    const radius = Math.min(8, 5 + Math.log2(Math.max(1, crystal.value)) * 0.5);
    ctx.save();
    ctx.translate(crystal.x, crystal.y);
    ctx.fillStyle = 'rgba(66, 153, 99, 0.12)';
    ctx.beginPath();
    ctx.ellipse(0, 7, radius + 4, 3, 0, 0, TAU);
    ctx.fill();
    if (!reduced) ctx.translate(0, Math.sin(time * 3 + crystal.phase) * 1.7);
    path(ctx, [0, -radius - 2, radius, 0, 0, radius + 2, -radius, 0], true);
    ctx.fillStyle = '#55b780';
    ctx.fill();
    ctx.strokeStyle = '#a0ecad';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    path(ctx, [0, -radius, 0, radius, -radius + 1, 0], true);
    ctx.fillStyle = '#2a8254';
    ctx.fill();
    ctx.fillStyle = '#d8ffd0';
    ctx.fillRect(-0.75, -radius + 1, 1.5, 3);
    if (crystal.heal) {
      ctx.fillStyle = '#e1f5f0'; ctx.fillRect(-4, -1, 8, 2); ctx.fillRect(-1, -4, 2, 8);
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    ctx.save();
    const limit = reduced ? 64 : MAX_PARTICLES;
    const start = Math.max(0, state.particles.length - limit);
    for (let i = start; i < state.particles.length; i += 1) {
      const particle = state.particles[i];
      if (particle.life <= 0 || particle.maxLife <= 0 || !this.visible(particle.x, particle.y, 12)) continue;
      const life = clamp(particle.life / particle.maxLife, 0, 1);
      const size = clamp(particle.size, 0.5, 10) * (0.5 + life * 0.5);
      ctx.globalAlpha = life * (reduced ? 0.35 : 0.8);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
    }
    ctx.restore();
  }

  private drawDamageTexts(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 12px ${MONO}`;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a130e';
    const limit = reduced ? 20 : MAX_DAMAGE_TEXTS;
    for (let i = Math.max(0, state.damageTexts.length - limit); i < state.damageTexts.length; i += 1) {
      const text = state.damageTexts[i];
      if (text.life <= 0 || !this.visible(text.x, text.y, 40)) continue;
      ctx.globalAlpha = clamp(text.life * 3, 0, reduced ? 0.7 : 1);
      ctx.fillStyle = text.color;
      ctx.font = `bold ${text.text.endsWith('!') ? 17 : 12}px ${MONO}`;
      ctx.strokeText(text.text, text.x, text.y);
      ctx.fillText(text.text, text.x, text.y);
    }
    ctx.restore();
  }

  private drawSummon(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    const progress = 1 - clamp(state.summonFlash / SUMMON_DURATION, 0, 1);
    const strength = Math.min(1, state.summonFlash);
    const radius = reduced ? 90 : 60 + progress * 180;
    ctx.save();
    ctx.translate(state.player.x, state.player.y);
    ctx.globalAlpha = strength * (reduced ? 0.25 : 0.65);
    ctx.strokeStyle = { patch: LIME, ember: '#f4a36e', aegis: '#edcd80', clock: '#baa5ff' }[state.ally];
    ctx.lineWidth = reduced ? 1 : 2;
    circle(ctx, 0, 0, radius);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 13]);
    circle(ctx, 0, 0, radius + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#153b24';
    ctx.globalAlpha *= 0.45;
    circle(ctx, 0, 0, radius - 8); ctx.fill();
    ctx.globalAlpha /= 0.45;
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate(i * TAU / 8 + (reduced ? 0 : progress * 0.3));
      ctx.translate(0, -radius * 0.74);
      ctx.lineWidth = 3;
      for (let line = 0; line < 3; line++) {
        ctx.beginPath();
        if ((i >> line) & 1) { ctx.moveTo(-10, line * 6); ctx.lineTo(10, line * 6); }
        else { ctx.moveTo(-10, line * 6); ctx.lineTo(-3, line * 6); ctx.moveTo(3, line * 6); ctx.lineTo(10, line * 6); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = '#cdf7a0';
    for (let i = 0; i < (reduced ? 4 : 12); i += 1) {
      const angle = i * TAU / (reduced ? 4 : 12) + (reduced ? 0 : progress * 0.35);
      const distance = radius * (i % 2 === 0 ? 0.86 : 1.08);
      ctx.fillRect(Math.cos(angle) * distance - 2, Math.sin(angle) * distance - 2, 4, 4);
    }
    ctx.font = `9px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(ALLIES[state.ally].skill, 0, -radius - 17);
    if (!reduced) {
      ctx.fillText('01  11  00  01', 0, radius + 24);
      ctx.globalAlpha *= 0.55;
      ctx.fillText('CORE.RESTORE()', -radius * 0.75, -radius * 0.45);
    }
    ctx.restore();
  }

  private drawJoystick(ctx: CanvasRenderingContext2D, joystick: Joystick): void {
    const dx = joystick.current.x - joystick.origin.x;
    const dy = joystick.current.y - joystick.origin.y;
    const distance = Math.hypot(dx, dy);
    const ratio = distance > 36 ? 36 / distance : 1;
    const x = joystick.origin.x + dx * ratio;
    const y = joystick.origin.y + dy * ratio;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 23, 15, 0.68)';
    ctx.strokeStyle = 'rgba(182, 237, 118, 0.38)';
    ctx.lineWidth = 1;
    circle(ctx, joystick.origin.x, joystick.origin.y, 48);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([2, 7]);
    circle(ctx, joystick.origin.x, joystick.origin.y, 35);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(182, 237, 118, 0.25)';
    path(ctx, [joystick.origin.x, joystick.origin.y, x, y]);
    ctx.stroke();
    circle(ctx, x, y, 17);
    ctx.fillStyle = 'rgba(64, 103, 55, 0.88)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(205, 247, 160, 0.82)';
    ctx.stroke();
    ctx.fillStyle = LIME;
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.restore();
  }
}
