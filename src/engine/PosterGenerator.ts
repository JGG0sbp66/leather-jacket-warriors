import { WEAPONS } from '../data/weapons.ts';
import { HEXTECH } from '../data/hextech.ts';
import { ALLIES } from '../data/summons.ts';
import type { RunReport } from '../types/game.ts';

const WIDTH = 1080;
const HEIGHT = 1440;
const INK = '#252e24';
const MUTED = '#686957';
const SERIF = '"Songti SC", "SimSun", "Noto Serif CJK SC", serif';
const SANS = '"Microsoft YaHei", "PingFang SC", sans-serif';

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  return text.split('\n').flatMap((paragraph) => {
    const lines: string[] = [];
    let line = '';
    for (const character of Array.from(paragraph)) {
      if (line && ctx.measureText(line + character).width > width) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else line += character;
    }
    lines.push(line.trimEnd());
    return lines;
  });
}

interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  color?: string;
  family?: string;
  bold?: boolean;
  center?: boolean;
}

function textBox(ctx: CanvasRenderingContext2D, text: string, box: TextBox): void {
  let size = box.size;
  let lines: string[] = [];
  while (size >= 12) {
    ctx.font = `${box.bold ? '700' : '400'} ${size}px ${box.family ?? SANS}`;
    lines = wrapText(ctx, text, box.width);
    if (lines.length * size * 1.42 <= box.height) break;
    size--;
  }
  if (size < 12) throw new Error('战报内容过长，无法在本地海报中完整排版。');
  ctx.fillStyle = box.color ?? INK;
  ctx.textBaseline = 'top';
  ctx.textAlign = box.center ? 'center' : 'left';
  lines.forEach((line, index) => ctx.fillText(line, box.center ? box.x + box.width / 2 : box.x, box.y + index * size * 1.42));
  ctx.textAlign = 'left';
}

function rule(ctx: CanvasRenderingContext2D, y: number, thick = false): void {
  ctx.fillStyle = INK;
  ctx.fillRect(64, y, 952, thick ? 3 : 1);
  if (thick) ctx.fillRect(64, y + 7, 952, 1);
}

function section(ctx: CanvasRenderingContext2D, title: string, y: number, number: string): void {
  ctx.fillStyle = INK;
  ctx.fillRect(64, y, 39, 29);
  textBox(ctx, number, { x: 64, y: y + 2, width: 39, height: 27, size: 17, color: '#eee8d8', center: true });
  textBox(ctx, title, { x: 116, y: y - 1, width: 900, height: 37, size: 25, bold: true, family: SERIF });
}

export async function generatePoster(report: RunReport): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法创建海报画布。');

  ctx.fillStyle = '#e9e3d2';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const paper = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  paper.addColorStop(0, '#fff8e933');
  paper.addColorStop(.45, '#b9ac8911');
  paper.addColorStop(1, '#ab95642a');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Fixed local grain does not consume the battle PRNG or alter the challenge.
  let grain = 0x5a17;
  const random = () => { grain = (Math.imul(grain, 1664525) + 1013904223) >>> 0; return grain / 4294967296; };
  for (let i = 0; i < 9500; i++) {
    ctx.fillStyle = i % 2 ? '#544a2910' : '#ffffff30';
    ctx.fillRect(random() * WIDTH, random() * HEIGHT, 1 + random() * 2, 1 + random() * 2);
  }
  ctx.strokeStyle = '#424833';
  ctx.lineWidth = 2;
  ctx.strokeRect(33, 33, WIDTH - 66, HEIGHT - 66);
  ctx.lineWidth = 1;
  ctx.strokeRect(41, 41, WIDTH - 82, HEIGHT - 82);

  textBox(ctx, '硅谷科技周刊', { x: 64, y: 65, width: 952, height: 108, size: 77, family: SERIF, bold: true, center: true });
  textBox(ctx, 'THE SILICON VALLEY WEEKLY  /  头版号外', { x: 64, y: 174, width: 952, height: 31, size: 19, center: true });
  rule(ctx, 216, true);
  textBox(ctx, report.victory ? '皮衣归来，神殿易主。' : '跌', { x: 64, y: 246, width: 952, height: 101, size: report.victory ? 61 : 76, bold: true, family: report.victory ? SERIF : '"KaiTi", "STKaiti", serif', center: true, color: report.victory ? '#28412a' : '#873f31' });
  const deck = report.victory
    ? '胜利 / 资本长老会主席倒下，最高管理员权限重归老J。'
    : '战败 / 犹豫，就会被做空。老J决定连夜转行去夜市摆摊卖黄金蛋炒饭。';
  textBox(ctx, deck, { x: 96, y: 361, width: 888, height: 74, size: 26, family: SERIF, center: true });

  ctx.fillStyle = '#35492d';
  ctx.fillRect(64, 454, 952, 102);
  const time = `${Math.floor(report.time / 60).toString().padStart(2, '0')}:${Math.floor(report.time % 60).toString().padStart(2, '0')}`;
  const metrics = [[time, '战斗时间'], [String(report.kills), '击杀敌人'], [`LV.${report.level}`, '本局等级']];
  metrics.forEach(([value, label], index) => {
    const x = 64 + index * 952 / 3;
    textBox(ctx, value, { x, y: 466, width: 952 / 3, height: 50, size: 34, color: '#f1e9d6', bold: true, center: true });
    textBox(ctx, label, { x, y: 517, width: 952 / 3, height: 28, size: 18, color: '#c8d0b9', center: true });
  });

  section(ctx, '前线装备 / 三槽构筑', 582, '01');
  Array.from({ length: 3 }, (_, slot) => {
    const x = 64 + slot * 324;
    const weapon = report.weapons.find((item) => item.id === report.equipped[slot] && item.level > 0);
    ctx.strokeStyle = '#7b806b';
    ctx.strokeRect(x, 626, 304, 108);
    textBox(ctx, `SLOT 0${slot + 1}`, { x: x + 13, y: 634, width: 278, height: 22, size: 14, color: MUTED });
    textBox(ctx, weapon ? weapon.evolved ? WEAPONS[weapon.id].evolution : WEAPONS[weapon.id].name : '空槽位', { x: x + 13, y: 660, width: 278, height: 43, size: 24, bold: true });
    textBox(ctx, weapon ? `LV.${weapon.level}${weapon.evolved ? ' / 超武' : ' / 基础武器'}` : '未装备', { x: x + 13, y: 705, width: 278, height: 23, size: 16, color: MUTED });
  });

  section(ctx, '全部已得武器 / 等级档案', 759, '02');
  const weapons = report.weapons.filter((weapon) => weapon.level > 0).map((weapon) => `${weapon.evolved ? WEAPONS[weapon.id].evolution : WEAPONS[weapon.id].name}  LV.${weapon.level}${weapon.evolved ? '（超武）' : ''}`).join('  /  ');
  textBox(ctx, weapons || '未获得武器', { x: 64, y: 804, width: 952, height: 114, size: 25 });
  rule(ctx, 930);

  section(ctx, '海克斯科技 / 战术增幅', 950, '03');
  const hexes = report.hexes.map((id) => HEXTECH.find((card) => card.id === id)!.name).join('  /  ');
  textBox(ctx, hexes || '本局未选择海克斯', { x: 64, y: 994, width: 952, height: 72, size: 26 });
  rule(ctx, 1080);

  section(ctx, '通灵援军 / 召唤名单', 1099, '04');
  // Count every summon without allowing a long endless history to overflow the page.
  const summons = Object.values(ALLIES).flatMap((ally) => {
    const count = report.summonHistory.filter((id) => id === ally.id).length;
    return count ? [`${ally.name} ×${count}`] : [];
  }).join('  /  ');
  textBox(ctx, summons || '本局尚未召唤盟友', { x: 64, y: 1142, width: 952, height: 82, size: 25 });
  rule(ctx, 1238, true);

  textBox(ctx, `SEED ${report.seed.toString(16).toUpperCase().padStart(8, '0')}  /  起手：${WEAPONS[report.initialWeapon].name}`, { x: 64, y: 1263, width: 952, height: 63, size: 23, bold: true });
  textBox(ctx, '本地战报，未经服务器验证，不代表排名。\n同种子、同决策复现候选与掉落；挑战不是自动回放。', { x: 64, y: 1333, width: 952, height: 55, size: 16, color: MUTED, center: true });

  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('浏览器未能生成 PNG 数据，请重试。'));
      }, 'image/png');
    } catch (error) { reject(error); }
  });
}
