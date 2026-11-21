import { WORLD_HEIGHT, WORLD_WIDTH } from '../types/game.ts';
import type { DungeonMap, GameState } from '../types/game.ts';

const TAU = Math.PI * 2;
const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

function path(ctx: CanvasRenderingContext2D, points: readonly number[], close = false): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  if (close) ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU);
}

/** The floor pass is cached by Renderer; only lightweight ambient details animate. */
export class DungeonRenderer {
  drawFloor(ctx: CanvasRenderingContext2D, map: DungeonMap): void {
    const cold = map === 'cryo';
    const dark = map === 'darknet';
    const core = map === 'singularity';
    const gold = map === 'temple';
    const accent = gold ? '#c5a459' : dark ? '#876fc2' : cold ? '#63aebf' : '#70a56c';
    ctx.save();
    ctx.fillStyle = gold ? '#101117' : dark ? '#080a13' : cold ? '#08141b' : '#0a1210';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const floor = ctx.createRadialGradient(600, 400, 30, 600, 400, 690);
    floor.addColorStop(0, gold ? '#24211b' : dark ? '#15132a' : cold ? '#172a36' : '#14291d');
    floor.addColorStop(1, gold ? '#0c0e14' : dark ? '#080a14' : cold ? '#0a1520' : '#07110d');
    path(ctx, [46, 26, 1154, 26, 1174, 46, 1174, 754, 1154, 774, 46, 774, 26, 754, 26, 46], true);
    ctx.fillStyle = floor; ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = gold ? '#4e4530' : cold ? '#233d4d' : dark ? '#302940' : '#23402d';
    ctx.strokeRect(54, 54, 1092, 692);

    if (gold) this.drawGoldFloor(ctx);
    else if (core) this.drawCoreFloor(ctx);
    else this.drawMachineFloor(ctx, cold, dark);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `10px ${MONO}`; ctx.fillStyle = accent;
    const title = gold ? 'BOARD OF DIRECTORS / 黄金圣殿' : core ? 'AI SINGULARITY / 奇点核心'
      : cold ? 'LIQUID COOLING / 极寒超频机房' : 'POWER OFF / 断电暗网走廊';
    ctx.fillText(title, 600, 77);
    for (const side of [70, 730]) {
      ctx.fillStyle = accent; ctx.fillRect(510, side, 180, 1);
      for (const x of [82, 1118]) {
        ctx.strokeStyle = accent; ctx.lineWidth = 2;
        path(ctx, [x - 8, side, x + 8, side]); ctx.stroke();
        path(ctx, [x, side - 8, x, side + 8]); ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawMachineFloor(ctx: CanvasRenderingContext2D, cold: boolean, dark: boolean): void {
    ctx.strokeStyle = dark ? '#201c31' : '#20343f'; ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let x = 90; x < 1150; x += 90) { ctx.moveTo(x, 92); ctx.lineTo(x, 712); }
    for (let y = 100; y < 740; y += 80) { ctx.moveTo(66, y); ctx.lineTo(1134, y); }
    ctx.stroke();
    // Wide marked lanes reinforce that this is one arena, rather than a navigation maze.
    ctx.strokeStyle = cold ? '#315e74' : '#493663'; ctx.lineWidth = 1.5;
    ctx.setLineDash([12, 18]);
    path(ctx, [80, 400, 1120, 400]); ctx.stroke();
    path(ctx, [600, 108, 600, 705]); ctx.stroke(); ctx.setLineDash([]);
    for (const x of [90, 1090]) {
      ctx.fillStyle = cold ? '#112632' : '#1b1727';
      ctx.fillRect(x, 105, 20, 580);
      ctx.strokeStyle = cold ? '#417184' : '#504161'; ctx.lineWidth = 1;
      ctx.strokeRect(x, 105, 20, 580);
      for (let y = 112; y < 690; y += 34) {
        ctx.fillStyle = cold ? '#1f4556' : '#342745'; ctx.fillRect(x + 3, y, 14, 3);
      }
      for (const y of [164, 610]) {
        ctx.strokeStyle = cold ? '#547b88' : '#695170'; ctx.lineWidth = 2;
        path(ctx, [x - 2, y, x + 22, y]); ctx.stroke();
      }
    }
    for (let i = 0; i < 8; i++) {
      const x = 160 + i * 125;
      for (const y of [117, 692]) {
        ctx.fillStyle = '#0b121a'; ctx.fillRect(x, y, 66, 12);
        ctx.strokeStyle = cold ? '#3b6677' : '#3d3150'; ctx.strokeRect(x, y, 66, 12);
        ctx.fillStyle = cold ? '#4c899d' : '#735990';
        for (let j = 0; j < 7; j++) ctx.fillRect(x + 7 + j * 7, y + 3, 2, 6);
      }
    }
    ctx.fillStyle = cold ? '#84b8c322' : '#9671c522'; ctx.textAlign = 'center';
    ctx.font = `bold 24px ${MONO}`; ctx.fillText(cold ? '−196°C / OC READY' : '404 / DARKNET', 600, 704);
    ctx.font = `9px ${MONO}`; ctx.fillStyle = cold ? '#7296a3' : '#6f6083';
    ctx.fillText(cold ? '液冷管道 · 注意过载电池' : '备用照明 · 暗影暴击', 600, 723);
  }

  private drawGoldFloor(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#151716'; ctx.fillRect(66, 100, 1068, 596);
    ctx.strokeStyle = '#3a3425'; ctx.lineWidth = 0.9;
    for (let x = 66; x < 1134; x += 89) {
      for (let y = 100; y < 696; y += 75) {
        ctx.strokeRect(x, y, 89, 75);
        ctx.strokeStyle = '#282923';
        path(ctx, [x + 4, y + 57, x + 26, y + 35, x + 32, y + 38, x + 67, y + 4]); ctx.stroke();
        ctx.strokeStyle = '#3a3425';
      }
    }
    // Black and gold circuit inlays, plus a central boardroom seal.
    ctx.strokeStyle = '#8e7638'; ctx.lineWidth = 2;
    path(ctx, [155, 161, 455, 161, 498, 204, 702, 204, 745, 161, 1045, 161]); ctx.stroke();
    path(ctx, [155, 641, 455, 641, 498, 598, 702, 598, 745, 641, 1045, 641]); ctx.stroke();
    ctx.strokeStyle = '#716339'; ctx.lineWidth = 1;
    circle(ctx, 600, 400, 154); ctx.stroke(); circle(ctx, 600, 400, 141); ctx.stroke();
    ctx.fillStyle = '#ccb16d0b'; circle(ctx, 600, 400, 138); ctx.fill();
    ctx.save(); ctx.translate(600, 400);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12); ctx.fillStyle = '#a18a48'; ctx.fillRect(146, -2, 7, 4);
    }
    ctx.restore();
    ctx.fillStyle = '#b8a15d22'; ctx.font = `bold 26px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText('COMPUTE TEMPLE', 600, 407);
    ctx.font = `10px ${MONO}`; ctx.fillText('创始人权限 · 等待收回', 600, 430);
    // Window edges sit outside the combat lanes; clouds never obscure projectiles.
    for (const x of [30, 1144]) {
      ctx.fillStyle = '#101b26'; ctx.fillRect(x, 86, 26, 628);
      ctx.fillStyle = '#253a451f';
      for (let i = 0; i < 12; i++) {
        ctx.beginPath(); ctx.ellipse(x + 12, 114 + i * 48, 18, 12, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#81724b'; ctx.lineWidth = 1;
      for (let y = 92; y < 715; y += 88) {
        path(ctx, [x, y, x + 26, y]); ctx.stroke();
      }
    }
    for (const [index, height] of [18, 29, 42, 21, 53, 34, 47, 65, 42, 28, 46, 61].entries()) {
      const x = 192 + index * 69;
      const color = index % 3 === 0 ? '#ed666d' : '#96d594';
      ctx.fillStyle = color + '77'; ctx.fillRect(x, 37, 15, height);
      ctx.strokeStyle = color + '99'; ctx.lineWidth = 1;
      path(ctx, [x + 7.5, 31, x + 7.5, 37 + height + 6]); ctx.stroke();
    }
  }

  private drawCoreFloor(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = '#285c39'; ctx.lineWidth = 0.7;
    for (let x = 90; x <= 1110; x += 68) {
      path(ctx, [x, 95, x, 705]); ctx.stroke();
    }
    for (let y = 110; y < 725; y += 58) {
      path(ctx, [68, y, 1132, y]); ctx.stroke();
    }
    ctx.save(); ctx.translate(600, 400);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = i % 2 === 0 ? '#386744' : '#747147'; ctx.lineWidth = i === 0 ? 2 : 1;
      const radius = 80 + i * 26;
      ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = j * TAU / 6;
        if (j === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = '#a4dc8b18'; ctx.font = `bold 37px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillText('∞', 0, 13); ctx.restore();
    for (const x of [100, 1070]) {
      for (let y = 128; y < 685; y += 106) {
        ctx.fillStyle = '#152f22'; ctx.fillRect(x, y, 30, 66);
        ctx.strokeStyle = '#52714b'; ctx.strokeRect(x, y, 30, 66);
        ctx.fillStyle = '#98c966'; ctx.fillRect(x + 5, y + 9, 20, 2);
        ctx.fillStyle = '#406442';
        for (let i = 0; i < 5; i++) ctx.fillRect(x + 6, y + 18 + i * 7, 18, 2);
      }
    }
  }

  drawAmbient(ctx: CanvasRenderingContext2D, map: DungeonMap, time: number, reduced: boolean): void {
    ctx.save();
    if (map === 'plaza') {
      if (!reduced) {
        ctx.strokeStyle = '#a4c0d220'; ctx.lineWidth = 0.8;
        for (let i = 0; i < 46; i++) {
          const x = (i * 193 + time * 62) % WORLD_WIDTH;
          const y = (i * 157 + time * 450) % WORLD_HEIGHT;
          path(ctx, [x, y, x - 4, y + 14]); ctx.stroke();
        }
        for (let i = 0; i < 15; i++) {
          const phase = (time * 1.25 + i * 0.371) % 1;
          ctx.globalAlpha = (1 - phase) * 0.14;
          ctx.strokeStyle = '#a3d3ce';
          ctx.beginPath(); ctx.ellipse((i * 137 + 110) % WORLD_WIDTH, (i * 217 + 98) % WORLD_HEIGHT,
            2 + phase * 10, 1 + phase * 3.4, 0, 0, TAU); ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.09; ctx.fillStyle = '#62c097';
      ctx.fillRect(110, 390, 975, 3); ctx.fillRect(595, 170, 3, 520);
    } else if (map === 'temple') {
      const count = reduced ? 3 : 7;
      for (let i = 0; i < count; i++) {
        const x = 200 + i * 126;
        const y = 91 + Math.sin(time * 0.35 + i) * 4;
        ctx.strokeStyle = i % 3 === 0 ? '#cf727b50' : '#96ddac40'; ctx.lineWidth = 1;
        path(ctx, [x, y, x + 22, y - 8, x + 39, y - 4, x + 62, y - 17]); ctx.stroke();
      }
    } else if (!reduced) {
      ctx.strokeStyle = map === 'darknet' ? '#b692dc19' : '#96dcdb17'; ctx.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const x = 140 + i * 99;
        const y = 110 + ((time * 25 + i * 61) % 580);
        path(ctx, [x, y + 10, x, y - 10, x + 5, y - 15]); ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawGround(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    const dungeon = state.dungeon;
    ctx.save();
    if (dungeon.coolantUntil > state.time) {
      for (const pool of dungeon.pools) {
        ctx.save(); ctx.translate(pool.x, pool.y);
        ctx.fillStyle = '#59c9ed24'; circle(ctx, 0, 0, pool.radius); ctx.fill();
        ctx.strokeStyle = '#8bdcecaa'; ctx.lineWidth = 1.2;
        circle(ctx, 0, 0, pool.radius - 1); ctx.stroke();
        ctx.strokeStyle = '#b1f4ff44'; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
          const angle = i * TAU / 6 + (reduced ? 0 : state.time * 0.025);
          const length = pool.radius * (0.46 + (i % 3) * 0.13);
          path(ctx, [Math.cos(angle) * 13, Math.sin(angle) * 13, Math.cos(angle) * length, Math.sin(angle) * length]); ctx.stroke();
          const bend = length * 0.65;
          path(ctx, [Math.cos(angle) * bend, Math.sin(angle) * bend,
            Math.cos(angle) * bend + Math.cos(angle + 0.8) * 12,
            Math.sin(angle) * bend + Math.sin(angle + 0.8) * 12]); ctx.stroke();
        }
        ctx.fillStyle = '#d5f7ffbb'; ctx.font = `bold 10px ${MONO}`; ctx.textAlign = 'center';
        ctx.fillText('❄ OC +45%', 0, 4);
        if (!reduced) {
          for (let i = 0; i < 3; i++) {
            const t = (state.time * 0.65 + i * 0.31 + pool.id * 0.12) % 1;
            ctx.globalAlpha = (1 - t) * 0.18;
            ctx.strokeStyle = '#c5fbff';
            ctx.beginPath(); ctx.ellipse((i - 1) * 18, -t * 24, 15 + t * 16, 5 + t * 8, 0, 0, TAU); ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
    if (dungeon.playerInCoolant) {
      ctx.strokeStyle = '#b5f6ff'; ctx.lineWidth = 1.4;
      circle(ctx, state.player.x, state.player.y, state.player.radius + 8); ctx.stroke();
      ctx.font = `bold 10px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ccf9ff'; ctx.strokeStyle = '#102431'; ctx.lineWidth = 3;
      ctx.strokeText('液冷超频', state.player.x, state.player.y + state.player.radius + 24);
      ctx.fillText('液冷超频', state.player.x, state.player.y + state.player.radius + 24);
    }
    for (const laser of dungeon.lasers) {
      if (laser.warning <= 0 && laser.active <= 0) continue;
      ctx.save(); ctx.translate(laser.x, laser.y); ctx.rotate(laser.angle);
      const warning = laser.warning > 0;
      ctx.lineCap = 'round'; ctx.lineWidth = laser.width;
      ctx.strokeStyle = warning ? '#fa3c5219' : '#ff344ca0';
      path(ctx, [-laser.length / 2, 0, laser.length / 2, 0]); ctx.stroke();
      ctx.lineWidth = warning ? 1.5 : Math.min(4, laser.width * 0.18);
      ctx.strokeStyle = warning ? '#ff7681' : '#ffd5d6';
      if (warning) { ctx.setLineDash([7, 6]); ctx.lineDashOffset = reduced ? 0 : -state.time * 24; }
      path(ctx, [-laser.length / 2, 0, laser.length / 2, 0]); ctx.stroke(); ctx.setLineDash([]);
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#311a26'; ctx.strokeStyle = '#e0576b'; ctx.lineWidth = 1;
        ctx.fillRect(side * laser.length / 2 - 5, -8, 10, 16);
        ctx.strokeRect(side * laser.length / 2 - 5, -8, 10, 16);
        ctx.fillStyle = warning ? '#e0777e' : '#ffe3dd'; ctx.fillRect(side * laser.length / 2 - 2, -4, 4, 8);
      }
      if (warning) {
        ctx.rotate(-laser.angle); ctx.textAlign = 'center'; ctx.font = `bold 9px ${MONO}`;
        ctx.fillStyle = '#ffa8b0'; ctx.strokeStyle = '#0a0d13'; ctx.lineWidth = 3;
        const label = `门禁预警 ${laser.warning.toFixed(1)}s`;
        ctx.strokeText(label, 0, -19); ctx.fillText(label, 0, -19);
      }
      ctx.restore();
    }
    for (const portal of dungeon.portals) {
      ctx.save(); ctx.translate(portal.x, portal.y);
      const pulse = reduced ? 0 : Math.sin(state.time * 2.1 + portal.id) * 2;
      const radius = portal.radius;
      const color = portal.color;
      ctx.fillStyle = color + '13'; circle(ctx, 0, 0, radius + 13 + pulse); ctx.fill();
      ctx.strokeStyle = color + '85'; ctx.lineWidth = 2;
      circle(ctx, 0, 0, radius + 5); ctx.stroke();
      ctx.fillStyle = '#070e14ee'; circle(ctx, 0, 0, Math.max(1, radius - 4)); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 9, radius * 0.72, radius * 0.28, 0, 0, TAU); ctx.stroke();
      path(ctx, [-radius * 0.62, 11, -radius * 0.62, -radius * 0.74,
        radius * 0.62, -radius * 0.74, radius * 0.62, 11]); ctx.stroke();
      ctx.fillStyle = color + '25'; ctx.fillRect(-radius * 0.56, -radius * 0.67, radius * 1.12, radius * 0.84);
      ctx.save();
      ctx.beginPath(); ctx.rect(-radius * 0.54, -radius * 0.62, radius * 1.08, radius * 0.79); ctx.clip();
      ctx.strokeStyle = color + '77'; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = -radius * 0.55 + ((i * 15 + (reduced ? 0 : state.time * 16)) % (radius * 0.67));
        path(ctx, [-radius * 0.53, y, radius * 0.53, y]); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = color; ctx.font = `bold 20px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText('↑', 0, 5);
      ctx.font = 'bold 12px sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#080b11';
      ctx.strokeText(portal.label, 0, radius + 26); ctx.fillText(portal.label, 0, radius + 26);
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#d3dbe0';
      const hint = portal.destination === 'cryo' ? '液冷超频 · 爆炸电池'
        : portal.destination === 'darknet' ? '黑暗暴击 · 稀有补给' : '走入电梯 · 继续突破';
      ctx.strokeText(hint, 0, radius + 44); ctx.fillText(hint, 0, radius + 44);
      ctx.restore();
    }
    ctx.restore();
  }

  drawProps(ctx: CanvasRenderingContext2D, state: GameState, reduced: boolean): void {
    const dark = state.dungeon.map === 'darknet';
    ctx.save();
    for (const obstacle of state.dungeon.obstacles) {
      const x = obstacle.x - obstacle.width / 2;
      const y = obstacle.y - obstacle.height / 2;
      const width = obstacle.width;
      const height = obstacle.height;
      const extrusion = 14;
      ctx.fillStyle = '#02060960'; ctx.fillRect(x + 6, y + 8, width + 8, height + 8);
      ctx.fillStyle = dark ? '#12121e' : '#10212b'; ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = dark ? '#5e4b78' : '#497385'; ctx.lineWidth = 1.3;
      ctx.strokeRect(x, y, width, height);
      path(ctx, [x, y, x + 9, y - extrusion, x + width + 9, y - extrusion, x + width, y], true);
      ctx.fillStyle = dark ? '#272035' : '#273e48'; ctx.fill(); ctx.stroke();
      path(ctx, [x + width, y, x + width + 9, y - extrusion, x + width + 9, y + height - extrusion,
        x + width, y + height], true);
      ctx.fillStyle = dark ? '#171323' : '#162d38'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#070d12'; ctx.fillRect(x + 5, y + 8, width - 10, height - 16);
      for (let row = 0; row < Math.floor((height - 19) / 18); row++) {
        const ry = y + 12 + row * 18;
        ctx.fillStyle = dark ? '#221e2f' : '#152934'; ctx.fillRect(x + 8, ry, width - 16, 13);
        ctx.fillStyle = dark ? '#9075c5' : '#69bdcf';
        ctx.fillRect(x + 12, ry + 4, 3, 3);
        ctx.fillStyle = row % 3 === 0 ? '#9acf72' : dark ? '#5d4f7b' : '#4d7c8d';
        ctx.fillRect(x + 19, ry + 4, 3, 3);
        ctx.fillStyle = dark ? '#4a3d5c' : '#3a5865';
        for (let vent = 0; vent < Math.max(0, Math.floor((width - 42) / 5)); vent++) {
          ctx.fillRect(x + 31 + vent * 5, ry + 3, 2, 7);
        }
      }
      ctx.font = `7px ${MONO}`; ctx.textAlign = 'left';
      ctx.fillStyle = dark ? '#9d8ab3' : '#8eafb9'; ctx.fillText(`SRV / ${String(obstacle.id).padStart(2, '0')}`, x + 8, y + height - 4);
    }
    for (const barrel of state.dungeon.barrels) {
      ctx.save(); ctx.translate(barrel.x, barrel.y);
      if (barrel.explosion > 0) {
        const phase = Math.min(1, barrel.explosion / 0.45);
        ctx.globalAlpha = reduced ? 0.28 : phase * 0.75;
        ctx.fillStyle = '#b7ec7820'; circle(ctx, 0, 0, barrel.explosionRadius); ctx.fill();
        ctx.strokeStyle = '#c5f29b'; ctx.lineWidth = 2;
        circle(ctx, 0, 0, barrel.explosionRadius * (1 - phase * 0.32)); ctx.stroke();
        ctx.fillStyle = '#e6ffd2';
        for (let i = 0; i < 10; i++) {
          const angle = i * TAU / 10;
          const reach = barrel.explosionRadius * (0.32 + (i % 3) * 0.14);
          path(ctx, [Math.cos(angle) * 12, Math.sin(angle) * 12,
            Math.cos(angle + 0.1) * reach, Math.sin(angle + 0.1) * reach,
            Math.cos(angle + 0.17) * (reach - 14), Math.sin(angle + 0.17) * (reach - 14)], true); ctx.fill();
        }
      } else if (barrel.hp > 0) {
        const r = barrel.radius;
        const color = barrel.id % 2 === 0 ? '#bc5d5b' : '#7aaf61';
        ctx.fillStyle = '#02060670'; ctx.beginPath(); ctx.ellipse(4, r * 0.68, r + 4, r * 0.52, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = barrel.flash > 0 && !reduced ? '#f0f8d8' : '#23302a';
        ctx.fillRect(-r * 0.8, -r * 0.72, r * 1.6, r * 1.43);
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.strokeRect(-r * 0.8, -r * 0.72, r * 1.6, r * 1.43);
        ctx.beginPath(); ctx.ellipse(0, -r * 0.72, r * 0.8, r * 0.28, 0, 0, TAU);
        ctx.fillStyle = '#314239'; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, r * 0.7, r * 0.8, r * 0.27, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = color + '66'; ctx.fillRect(-r * 0.76, -r * 0.2, r * 1.52, r * 0.55);
        ctx.strokeStyle = '#dce89e'; ctx.lineWidth = 1.5;
        path(ctx, [3, -7, -3, 0, 2, 0, -2, 7]); ctx.stroke();
        ctx.fillStyle = '#12251d'; ctx.fillRect(-r, -r - 7, r * 2, 2);
        ctx.fillStyle = color; ctx.fillRect(-r, -r - 7, r * 2 * Math.max(0, barrel.hp / barrel.maxHp), 2);
        if (!reduced) {
          const sparks = Math.sin(state.time * 3.7 + barrel.id) > 0.75;
          if (sparks) {
            ctx.strokeStyle = '#e1f8a3'; ctx.lineWidth = 1;
            path(ctx, [r * 0.25, -r * 0.8, r * 0.7, -r * 1.18, r * 0.42, -r * 1.3]); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  drawTransition(ctx: CanvasRenderingContext2D, state: GameState, width: number, height: number, reduced: boolean): void {
    if (state.dungeon.transition <= 0) return;
    const remaining = state.dungeon.transition;
    const alpha = reduced ? 0.94 : Math.min(0.98, remaining * 1.7);
    const color = state.dungeon.map === 'cryo' ? '#9adfec' : state.dungeon.map === 'darknet' ? '#c3a3f2'
      : state.dungeon.map === 'temple' ? '#ecd286' : '#b7ed88';
    ctx.save(); ctx.fillStyle = `rgba(4, 8, 13, ${alpha})`; ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = Math.min(1, remaining * 3);
    ctx.strokeStyle = color + '50'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const x = width * (i + 0.5) / 12;
      const y = reduced ? 0 : ((state.time * 250 + remaining * 120 + i * 77) % (height + 200)) - 100;
      path(ctx, [x, y, x, y + height * 0.32]); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.min(45, Math.max(24, width * 0.05))}px ${MONO}`;
    ctx.fillStyle = color; ctx.fillText(`${state.dungeon.floor}F`, width / 2, height * 0.41);
    ctx.font = `bold ${Math.min(27, Math.max(16, width * 0.035))}px sans-serif`;
    ctx.fillText(state.dungeon.name, width / 2, height * 0.51, width - 36);
    ctx.font = `10px ${MONO}`; ctx.fillStyle = '#a8b4ba';
    ctx.fillText('传送电梯已接入 · 正在上行', width / 2, height * 0.59);
    if (state.dungeon.affixes.length) {
      ctx.fillStyle = color; ctx.font = '11px sans-serif';
      ctx.fillText(state.dungeon.affixes.join(' · '), width / 2, height * 0.65, width - 32);
    }
    ctx.restore();
  }
}
