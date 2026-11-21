import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent, ReactNode } from 'react';
import { GameEngine } from './engine/GameEngine.ts';
import { Renderer } from './engine/Renderer.ts';
import { AudioEngine } from './engine/AudioEngine.ts';
import { generatePoster } from './engine/PosterGenerator.ts';
import { challengeLink, decodeChallenge, newSeed } from './utils/prng.ts';
import { HEX_TIMES, MAX_BATTLE_LOG_ENTRIES, SUMMON_DURATION } from './types/game.ts';
import { IntroCutscene } from './components/IntroCutscene.tsx';
import { AllyPortrait } from './components/AllyPortrait.tsx';
import { HexArtwork, WeaponArtwork } from './components/CardArtwork.tsx';
import { ALLIES } from './data/summons.ts';
import { HEXTECH, TIER_LABELS } from './data/hextech.ts';
import { WEAPONS } from './data/weapons.ts';
import { DIFFICULTIES } from './data/difficulty.ts';
import type { AllyId, BattleLogEntry, DifficultyId, GameSnapshot, HexId, Joystick, RunChallenge, RunReport, WeaponId, WeaponState } from './types/game.ts';

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    chip: <><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><path d="M10 10h4v4h-4z"/></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-13h-8z"/>,
    pause: <path d="M8 5v14M16 5v14"/>,
    sound: <path d="m11 5-6 4H2v6h3l6 4zM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>,
    mute: <path d="m11 5-6 4H2v6h3l6 4zM16 9l5 6m0-6-5 6"/>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
    crosshair: <><circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/></>,
    move: <path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>,
    magnet: <path d="M5 3v10a7 7 0 0 0 14 0V3h-5v10a2 2 0 0 1-4 0V3zM5 7h5m4 0h5"/>,
    shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="m8 12 3 3 5-6"/></>,
    replay: <path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>,
    duck: <><path d="M8 11V7a5 5 0 0 1 10 0v2l4 2-4 2c0 5-3 8-8 8-4 0-7-3-7-7V9z"/><path d="M14 6h.01M7 15h5"/></>,
    diamond: <path d="m12 2 9 10-9 10-9-10z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    clone: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H4v12"/></>,
    chair: <path d="M6 13V4h12v9M4 13h16v4H4zM6 17v5m12-5v5M9 4v9m6-9v9"/>,
    star: <path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>,
    box: <><path d="M3 7h18v14H3zM2 3h20v4H2zM9 11h6"/></>,
    download: <path d="M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5"/>,
    link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.chip}</svg>;
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const seedLabel = (seed: number) => seed.toString(16).toUpperCase().padStart(8, '0');
const SUMMON_OPTIONS = Object.values(ALLIES);
const WEAPON_OPTIONS = Object.values(WEAPONS);
const DIFFICULTY_OPTIONS = Object.values(DIFFICULTIES);
const WEAPON_PREVIEWS: Record<WeaponId, { text: string; color: string }> = {
  gpu: { text: '瞄准近敌，飞镖连发。', color: '#b6ed76' },
  spatula: { text: '扇形重击，击退近敌。', color: '#a2e5ce' },
  cuda: { text: '环绕灼烧，贴身清场。', color: '#8adeaf' },
  pulse: { text: '双束激光，直线穿透。', color: '#75daee' },
  duck: { text: '双鸭伴飞，追踪射击。', color: '#ecd17f' },
};
const HEX_SUMMARIES: Record<HexId, string> = {
  echo: '消耗当前生命20%，分身协战40秒。',
  chrono: '子弹时间2.5秒：移速×2，敌速−80%。',
  chair: '站定坐下，减伤70%、攻速翻倍。',
  hoard: '拾取范围+180%；囤晶核加移速与暴击。',
  armor: '受伤减半，电弧震退近敌。',
  parry: '每6秒弹反一次，5倍伤害奉还。',
  reckless: '弃盾、受伤+15%；对精英与Boss伤害+60%。',
  vampire: '暴击有15%概率回复1生命。',
  overwork: '伤害+25%，攻速+15%；敌速+10%。',
  wide: '子弹与技能范围+35%。',
  network: '立获50能量，通灵充能+45%。',
};
const HEX_SCHEDULE = '1F 守关击破 / 2F 守关击破 / 3F 牛市狂欢';
const RECKLESS_WARNING = '废物的思维：已放弃所有护盾，本次关税壁垒不会生效';
const DEFEAT_QUOTE = '犹豫，就会被做空。老J决定连夜转行去夜市摆摊卖黄金蛋炒饭。';
const LOG_LABELS: Record<BattleLogEntry['kind'], string> = { system: '系统', weapon: '装备', upgrade: '强化', evolution: '超武', event: '事件', summon: '通灵', hex: '海克斯', result: '结算' };
const EVENT_LABELS: Record<GameSnapshot['event'], string> = { parking: '外围霓虹广场', shortCrash: '华尔街恶意砸盘', paparazzi: '闪光灯包围网', blackout: '神殿拉闸停电', cryo: '液冷管道大爆裂', bull: '散户大牛市', alarm: '董事会红色警报', boss: '顶层董事会决战', truck: '直播装甲车守关战', legalBoss: '绝对协议体守关战', portal: '传送电梯已开启', endless: '无尽深渊地牢' };
const MAP_DETAILS: Record<GameSnapshot['dungeon']['map'], { color: string; description: string }> = {
  plaza: { color: '#b6ed76', description: '雨夜广场 · 狗仔围堵 · 直播装甲车' },
  cryo: { color: '#7ed7f0', description: '机柜掩体 · 爆炸电池桶 · 液冷超频' },
  darknet: { color: '#c9a3ef', description: '机柜掩体 · 黑暗暴击 · 稀有武器补给' },
  temple: { color: '#e8cd84', description: '黄金圣殿 · 牛市反转 · 主席最终决战' },
  singularity: { color: '#9dacf9', description: 'AI 奇点核心 · 随机地牢词缀 · 无限攀塔' },
};
const branchName = (branch: RunReport['dungeonBranch']) => branch === 'cryo' ? '极寒超频机房' : branch === 'darknet' ? '断电暗网走廊' : '尚未选择二层路线';
const floorPhaseLabel = (phase: GameSnapshot['dungeon']['phase']) => ({ clearing: '突破进度', boss: '守关决战', portal: '电梯已开启', transition: '乘电梯上行' })[phase];
const MOVEMENT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
const COMMAND_KEYS = [...MOVEMENT_KEYS, 'Space', 'Enter', 'Escape', 'KeyB', 'ShiftLeft', 'ShiftRight', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'];
const weaponName = (weapon: { id: WeaponId; evolved: boolean }) => weapon.evolved ? WEAPONS[weapon.id].evolution : WEAPONS[weapon.id].name;
const cooldownLabel = (weapon: WeaponState, time: number) => weapon.nextFireTime > time ? `冷却 ${(weapon.nextFireTime - time).toFixed(1)}s` : '冷却就绪';

function Meter({ value, max, className = '', label }: { value: number; max: number; className?: string; label: string }) {
  const safeMax = Math.max(1, max);
  const current = Math.max(0, Math.min(safeMax, value));
  return <div className={`meter ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={Math.round(current)}><span style={{ width: `${current / safeMax * 100}%` }}/></div>;
}

function EquipmentSlots({ snapshot, onPriority, onSlot, reserve }: { snapshot: GameSnapshot; onPriority: (slot: number) => void; onSlot?: (slot: number) => void; reserve?: WeaponId | null }) {
  return <div className="equipment-slots" aria-label="三槽装备栏">{Array.from({ length: 3 }, (_, slot) => {
    const id = snapshot.equipped[slot];
    const weapon = snapshot.weapons.find((item) => item.id === id && item.level > 0);
    const priority = !!weapon && snapshot.priorityWeapon === weapon.id;
    const content = <><span className="item-icon"><Icon name={weapon ? WEAPONS[weapon.id].icon : 'box'} size={21}/></span><span className="slot-description"><strong>{weapon ? weaponName(weapon) : '空槽位'}</strong><small>{weapon ? `LV.${weapon.level}${weapon.evolved ? ' · 超武' : ''} · ${cooldownLabel(weapon, snapshot.time)}` : '获得武器后可装入'}</small>{onSlot && <em>{reserve ? `将 ${WEAPONS[reserve].name} 装入此槽` : '先在下方选择备用武器'}</em>}</span></>;
    return <div key={slot} className={`equipment-slot ${weapon?.evolved ? 'is-evolved' : ''} ${priority ? 'is-priority' : ''} ${weapon ? '' : 'is-empty'}`}>
      {onSlot ? <button type="button" className="slot-swap" onClick={() => onSlot(slot)} disabled={!reserve} aria-label={`槽 ${slot + 1}：${weapon ? weaponName(weapon) : '空'}${reserve ? `，装入 ${WEAPONS[reserve].name}` : '，请先选择备用'}`}>{content}</button> : <div className="slot-content">{content}</div>}
      <button type="button" className="priority-button" onClick={() => onPriority(slot)} disabled={!weapon || weapon.evolved || !['playing', 'inventory'].includes(snapshot.status)} aria-pressed={priority} aria-label={`培养焦点：槽 ${slot + 1}${weapon ? ` ${weaponName(weapon)}` : ' 空槽'}`} title={weapon?.evolved ? '超武已完成培养' : `按 ${slot + 1} 设为培养焦点，不暂停战场`}><span>{slot + 1}</span><Icon name="star" size={13}/><small>{priority ? '培养中' : weapon?.evolved ? '已进化' : '优先'}</small></button>
    </div>;
  })}</div>;
}

const BattleTerminal = memo(function BattleTerminal({ logs, status, onFocus }: { logs: readonly BattleLogEntry[]; status: GameSnapshot['status']; onFocus: () => void }) {
  const output = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const lastSeen = useRef(0);
  const [isFollowing, setIsFollowing] = useState(true);
  const [unread, setUnread] = useState(0);
  const active = status === 'playing';
  const ended = status === 'victory' || status === 'defeat';

  useLayoutEffect(() => {
    const element = output.current;
    if (!element) return;
    const latest = logs.at(-1)?.id ?? 0;
    const previous = lastSeen.current;
    lastSeen.current = latest;
    if (latest <= previous) {
      following.current = true;
      setIsFollowing(true);
      setUnread(0);
    }
    if (following.current) element.scrollTop = element.scrollHeight;
    else setUnread((count) => count + latest - previous);
  }, [logs]);

  function handleScroll() {
    const element = output.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 16;
    following.current = atBottom;
    setIsFollowing(atBottom);
    if (atBottom) setUnread(0);
  }

  function jumpToLatest() {
    following.current = true;
    setIsFollowing(true);
    setUnread(0);
    if (output.current) output.current.scrollTop = output.current.scrollHeight;
  }

  return <section className="battle-terminal" aria-label="战斗终端" data-paused={!active} onFocusCapture={onFocus}>
    <div className="terminal-title"><h2><span aria-hidden="true">&gt;_</span> 战斗终端</h2><span className="terminal-local">LOCAL</span></div>
    <div className="terminal-status"><span className={active ? 'terminal-indicator active' : 'terminal-indicator'}/>{active ? '战场日志接收中' : ended ? '本局战斗已结束' : status === 'ready' ? '等待接入' : '战场暂停'}<span>最近 {MAX_BATTLE_LOG_ENTRIES} 条</span></div>
    <div ref={output} className="terminal-output" role="log" aria-label="按战斗时间排列的只读日志" aria-live={isFollowing ? 'polite' : 'off'} aria-relevant="additions" aria-atomic="false" tabIndex={0} onScroll={handleScroll}>
      {logs.length === 0 ? <p className="terminal-empty">&gt; 等待第一条战斗消息…</p> : logs.map((entry) => <p key={entry.id} className={`terminal-entry log-${entry.kind}`}><time>{formatTime(entry.time + 1e-8)}</time><span><b>{LOG_LABELS[entry.kind]}</b>{entry.text}</span></p>)}
    </div>
    <div className="terminal-footer"><span>{isFollowing ? '> 跟随最新记录' : '> 正在回看'}</span>{!isFollowing && <button type="button" onClick={jumpToLatest}>{unread > 0 ? `${unread} 条新消息` : '回到最新'} <span aria-hidden="true">↓</span></button>}</div>
  </section>;
});

function BuildSummary({ report }: { report: Pick<RunReport, 'weapons' | 'equipped' | 'hexes' | 'summonHistory' | 'difficulty' | 'dungeonBranch' | 'floorsCleared' | 'highestFloor' | 'endless'> }) {
  return <div className="result-build">
    <p><b>挑战难度</b>{DIFFICULTIES[report.difficulty ?? 'standard'].name} · {report.endless ? '无尽挑战' : `战斗上限 ${formatTime(DIFFICULTIES[report.difficulty ?? 'standard'].timeLimit)}`}</p>
    {(report.highestFloor !== undefined || report.dungeonBranch !== undefined) && <p className="result-route"><b>地牢路线</b>外围霓虹广场 → {branchName(report.dungeonBranch)}{report.highestFloor && report.highestFloor >= 3 ? ' → 顶层黄金圣殿' : ''}{report.endless ? ' → 无尽深渊' : ''}<span>已突破 {report.floorsCleared ?? 0} 层 · 到达 {report.highestFloor ?? 1}F{report.endless ? ' · 无尽战报' : ''}</span></p>}
    <p><b>三槽装备</b>{Array.from({ length: 3 }, (_, slot) => { const weapon = report.weapons.find((item) => item.id === report.equipped[slot]); return <span key={slot}>{slot + 1}. {weapon ? `${weaponName(weapon)} · LV.${weapon.level}${weapon.evolved ? ' · 超武' : ''}` : '空槽位'}</span>; })}</p>
    <p><b>全部已得武器</b>{report.weapons.filter((weapon) => weapon.level > 0).map((weapon) => `${weaponName(weapon)} LV.${weapon.level}${weapon.evolved ? '（超武）' : ''}`).join(' / ') || '无'}</p>
    <p><b>海克斯</b>{report.hexes.map((id) => HEXTECH.find((card) => card.id === id)!.name).join(' / ') || '未选择'}</p>
    <p><b>召唤名单</b>{report.summonHistory.map((id) => ALLIES[id].name).join(' → ') || '尚未召唤'}</p>
  </div>;
}

function DungeonStrip({ dungeon }: { dungeon: GameSnapshot['dungeon'] }) {
  const details = MAP_DETAILS[dungeon.map];
  return <div className={`dungeon-strip floor-${dungeon.map}`} style={{ '--floor-color': details.color } as CSSProperties} aria-label={`当前第 ${dungeon.floor} 层，${dungeon.name}`}>
    <div className="dungeon-floor-number"><b>{dungeon.floor}F</b><span>{dungeon.floor > 3 ? '深渊' : '高塔'}</span></div>
    <div className="dungeon-floor-info"><div><strong>{dungeon.name}</strong><span>{floorPhaseLabel(dungeon.phase)} <b>{Math.floor(dungeon.progress)}%</b></span></div><Meter value={dungeon.progress} max={100} className="floor-meter" label={`${dungeon.floor}F 突破进度`}/><p>{dungeon.affixes.length > 0 ? dungeon.affixes.join(' · ') : details.description}</p></div>
    <ol className="dungeon-steps" aria-label="高塔楼层进度">{[1, 2, 3].map((floor) => <li key={floor} className={dungeon.floorsCleared >= floor ? 'cleared' : dungeon.floor === floor ? 'current' : ''} aria-current={dungeon.floor === floor && dungeon.floorsCleared < floor ? 'step' : undefined}>{dungeon.floorsCleared >= floor ? '✓' : floor}<span>{['广场', '机房', '圣殿'][floor - 1]}</span></li>)}{dungeon.floor > 3 && <li className="current">∞<span>深渊</span></li>}</ol>
  </div>;
}

function BossHud({ boss }: { boss: NonNullable<GameSnapshot['boss']> }) {
  const name = `${boss.title} · ${boss.name}`;
  const quote = boss.entering ? boss.introText : boss.quote ? boss.quoteText : null;
  return <><div className={`boss-hud boss-${boss.type} ${boss.phase === 2 ? 'boss-enraged' : ''} ${boss.guarded ? 'boss-protected' : ''}`}>
      <div><strong title={name}>{name}</strong><span><b>{boss.entering ? '降临中' : boss.guarded ? '协议护盾' : boss.type === 'chairman' ? `P${boss.phase}` : '守关战'}</b><small>{Math.ceil(boss.hp)} / {Math.ceil(boss.maxHp)}</small></span></div>
      <Meter value={boss.hp} max={boss.maxHp} label={`${boss.name} 生命值`}/>
    </div>
    {quote && <blockquote className="boss-dialogue" role="status" aria-label={quote} title={quote}>{quote}</blockquote>}
  </>;
}

export default function App() {
  const audio = useRef<AudioEngine | null>(null);
  const [initialLink] = useState(() => ({ hash: window.location.hash, challenge: decodeChallenge(window.location.hash) }));
  const [challenge, setChallenge] = useState<RunChallenge | null>(initialLink.challenge);
  const [engine] = useState(() => new GameEngine(initialLink.challenge?.seed ?? newSeed(), (name) => audio.current?.play(name), initialLink.challenge?.initialWeapon ?? 'gpu', initialLink.challenge?.difficulty ?? 'standard'));
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => engine.snapshot());
  const [muted, setMuted] = useState(false);
  const [fps, setFps] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const introVisible = useRef(true);
  const [previewAlly, setPreviewAlly] = useState<AllyId>('patch');
  const [selectedAlly, setSelectedAlly] = useState<AllyId | null>(null);
  const [selectedReserve, setSelectedReserve] = useState<WeaponId | null>(null);
  const [linkNotice, setLinkNotice] = useState(initialLink.hash.startsWith('#run=') && !initialLink.challenge ? '挑战链接无效或版本不受支持，已为你准备正常新局。' : '');
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const loadedHash = useRef(initialLink.hash);
  const [reportMessage, setReportMessage] = useState('');
  const [manualLink, setManualLink] = useState('');
  const [posterBusy, setPosterBusy] = useState(false);
  const reportRequest = useRef(0);
  const copyInput = useRef<HTMLInputElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const keys = useRef(new Set<string>());
  const held = useRef(new Set<string>());
  const blockedActivation = useRef(new Set<string>());
  const activationAfter = useRef(0);
  const joystick = useRef<Joystick>({ active: false, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } });
  const activePointer = useRef<number | null>(null);
  const status = snapshot.status;
  const inRun = status !== 'ready';
  const isModal = ['paused', 'inventory', 'hex', 'summonSelect', 'victory', 'defeat'].includes(status);
  const showCombatEffects = inRun && !['finishing', 'victory', 'defeat'].includes(status);
  // Only a new round changes dialog focus; rerolling a card must preserve its button's focus.
  const modalStep = status === 'hex' ? snapshot.hexRound : 0;
  const ally = ALLIES[snapshot.ally];
  const preview = ALLIES[previewAlly];
  const hasChrono = snapshot.hexes.includes('chrono');
  const hasReckless = snapshot.hexes.includes('reckless');
  const isSlowed = engine.state.effects.slow > 0;
  const reserves = snapshot.weapons.filter((weapon) => weapon.level > 0 && !snapshot.equipped.includes(weapon.id));
  const missingWeapons = WEAPON_OPTIONS.filter((definition) => !snapshot.weapons.some((weapon) => weapon.id === definition.id && weapon.level > 0));
  const report = snapshot.report;
  const starter = WEAPONS[snapshot.initialWeapon];
  const dungeon = snapshot.dungeon;
  const difficulty = DIFFICULTIES[snapshot.difficulty ?? 'standard'];
  const runTimeLimit = snapshot.timeLimit ?? difficulty.timeLimit;
  const difficultyLocked = challenge?.difficulty !== undefined;
  const eventLabel = snapshot.event === 'parking' ? dungeon.name : snapshot.event === 'cryo' && dungeon.map === 'singularity' ? 'AI 奇点过载' : EVENT_LABELS[snapshot.event];
  const nextHexLabel = snapshot.hexRound === 0 ? '击破 1F 守关 Boss 获得海克斯' : snapshot.hexRound === 1 ? '击破 2F 守关 Boss 获得海克斯' : snapshot.hexRound === 2 ? '3F 牛市狂欢结束时选择海克斯' : '构筑成型 · 向高塔之巅突围';

  const sync = useCallback(() => setSnapshot(engine.snapshot()), [engine]);
  const clearInput = useCallback(() => {
    keys.current.clear();
    joystick.current.active = false;
    if (activePointer.current !== null && canvas.current?.hasPointerCapture(activePointer.current)) canvas.current.releasePointerCapture(activePointer.current);
    activePointer.current = null;
    engine.setMovement(0, 0);
    for (const code of ['Space', 'Enter']) if (held.current.has(code)) blockedActivation.current.add(code);
    activationAfter.current = performance.now() + 180;
  }, [engine]);
  const resetReportUi = useCallback(() => {
    reportRequest.current++;
    setReportMessage(''); setManualLink(''); setPosterBusy(false);
  }, []);
  const finishIntro = useCallback(() => {
    introVisible.current = false;
    clearInput();
    setShowIntro(false);
  }, [clearInput]);
  const unlockIntro = useCallback(() => audio.current?.unlock(), []);
  const playIntroRise = useCallback(() => audio.current?.play('intro'), []);
  const start = useCallback((retry = false) => {
    if (!retry && (introVisible.current || performance.now() < activationAfter.current)) return;
    audio.current?.unlock(); clearInput(); resetReportUi();
    setSelectedAlly(null); setSelectedReserve(null);
    if (retry) engine.restart(); else engine.start();
    sync();
  }, [engine, clearInput, resetReportUi, sync]);
  const requestSummon = useCallback(() => {
    if (['portal', 'transition'].includes(engine.state.dungeon.phase)) return;
    audio.current?.unlock();
    if (!engine.requestSummon()) return;
    clearInput(); setSelectedAlly(null); sync();
  }, [engine, clearInput, sync]);
  const openInventory = useCallback(() => {
    if (engine.snapshot().inventoryLocked || !engine.openInventory()) return;
    audio.current?.unlock(); clearInput(); setSelectedReserve(null); sync();
  }, [engine, clearInput, sync]);
  const closeInventory = useCallback(() => { engine.closeInventory(); setSelectedReserve(null); clearInput(); sync(); }, [engine, clearInput, sync]);
  const prioritize = useCallback((slot: number) => { engine.setPriority(slot); sync(); }, [engine, sync]);
  function equip(slot: number) {
    if (!selectedReserve || !engine.equipWeapon(selectedReserve, slot)) return;
    setSelectedReserve(null); sync();
  }
  function confirmSummon() {
    if (!selectedAlly) return;
    audio.current?.unlock();
    if (!engine.summon(selectedAlly)) return;
    setSelectedAlly(null); clearInput(); sync();
  }
  function cancelSummon() { engine.cancelSummon(); setSelectedAlly(null); clearInput(); sync(); }
  function chooseHex(id: HexId) { engine.chooseHex(id); clearInput(); sync(); }
  function rerollHex(slot: number) { if (!snapshot.hexRerolls[slot]) { engine.rerollHex(slot); sync(); } }
  function selectDifficulty(id: DifficultyId) { if (!difficultyLocked && engine.selectDifficulty(id)) sync(); }
  function lobby(hash = window.location.hash) {
    const next = decodeChallenge(hash);
    setChallenge(next);
    loadedHash.current = hash; setPendingHash(null);
    setLinkNotice(hash.startsWith('#run=') && !next ? '挑战链接无效或版本不受支持，已为你准备正常新局。' : '');
    engine.returnToLobby(next?.seed ?? newSeed(), next?.initialWeapon ?? 'gpu', next ? next.difficulty ?? 'standard' : engine.state.difficulty);
    setSelectedAlly(null); setSelectedReserve(null); resetReportUi();
    introVisible.current = false; setShowIntro(false); clearInput(); sync();
  }
  function exitChallenge() {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    lobby('');
    setLinkNotice('已退出挑战：新种子，起手武器与难度均可自由选择。');
  }
  function navigateSummons(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (status !== 'summonSelect' || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.ally : undefined;
    const current = SUMMON_OPTIONS.findIndex((option) => option.id === (focused ?? selectedAlly));
    const columns = window.matchMedia('(max-width: 720px)').matches ? 2 : 4;
    const offset = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : event.code === 'ArrowUp' ? -columns : columns;
    const next = SUMMON_OPTIONS[current < 0 ? 0 : (current + offset + SUMMON_OPTIONS.length) % SUMMON_OPTIONS.length];
    setSelectedAlly(next.id);
    dialog.current?.querySelector<HTMLButtonElement>(`[data-ally="${next.id}"]`)?.focus({ preventScroll: false });
  }
  function slow() { if (['portal', 'transition'].includes(engine.state.dungeon.phase)) return; audio.current?.unlock(); if (engine.activateSlow()) sync(); }
  function pause() { engine.pause(); clearInput(); sync(); }
  function resume() { engine.resume(); clearInput(); sync(); }
  function enterEndless() { if (engine.enterEndless()) { resetReportUi(); clearInput(); sync(); } }
  function toggleAudio() {
    const next = !muted;
    audio.current?.unlock(); audio.current?.setMuted(next); setMuted(next);
  }
  async function downloadPoster() {
    if (!report || posterBusy) return;
    const request = reportRequest.current;
    setPosterBusy(true); setReportMessage('正在本地绘制战报…');
    try {
      const blob = await generatePoster(report);
      if (request !== reportRequest.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      try {
        anchor.href = url; anchor.download = `硅谷科技周刊-${seedLabel(report.seed)}.png`;
        document.body.append(anchor); anchor.click();
        setReportMessage('已请求下载 PNG；若浏览器拦截，请允许此站点下载。');
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      if (request === reportRequest.current) setReportMessage('战报生成或下载失败，未能确认文件已保存，请稍后重试。');
    } finally {
      if (request === reportRequest.current) setPosterBusy(false);
    }
  }
  async function copyChallenge() {
    if (!report) return;
    const request = reportRequest.current;
    let link: string;
    try { link = challengeLink(report, window.location.href); }
    catch { setReportMessage('挑战链接生成失败，尚未复制，请稍后重试。'); return; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      if (request === reportRequest.current) { setManualLink(''); setReportMessage('挑战链接已复制。目标数据未经验证，不代表服务器排名。'); }
    } catch {
      if (request === reportRequest.current) { setManualLink(link); setReportMessage('无法访问剪贴板，尚未复制。请选中下方链接，手动复制。'); }
    }
  }

  useEffect(() => {
    const onHashChange = () => setPendingHash(window.location.hash === loadedHash.current ? null : window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => {
    if (manualLink) { copyInput.current?.focus(); copyInput.current?.select(); }
  }, [manualLink]);

  useEffect(() => {
    if (!canvas.current) return;
    const renderer = new Renderer(canvas.current);
    const sound = new AudioEngine();
    audio.current = sound;
    let frame = 0;
    let last = performance.now();
    let lastHud = 0;
    let lastFps = last;
    let frames = 0;
    let lastStatus = engine.state.status;
    let lastFloor = engine.state.dungeon.floor;
    let lastDungeonPhase = engine.state.dungeon.phase;
    const hudRevision = () => {
      const s = engine.state;
      return `${s.difficulty}:${s.time}:${s.dungeon.transition}:${s.logs.at(-1)?.id ?? 0}:${s.level}:${s.xp}:${s.player.hp}:${s.energy}`;
    };
    let lastHudRevision = hudRevision();
    const resize = new ResizeObserver(([entry]) => renderer.resize(entry.contentRect.width, entry.contentRect.height));
    resize.observe(canvas.current);
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (target instanceof HTMLElement && target.closest('.battle-terminal') && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Space', 'Enter', 'Tab'].includes(event.code)) return;
      held.current.add(event.code);
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat && COMMAND_KEYS.includes(event.code)) { event.preventDefault(); event.stopPropagation(); return; }
      if (['Space', 'Enter'].includes(event.code) && (blockedActivation.current.has(event.code) || performance.now() < activationAfter.current)) { event.preventDefault(); event.stopPropagation(); return; }
      const current = engine.state.status;
      if (current === 'ready') {
        const canStart = !(target instanceof HTMLElement) || !target.closest('button, a, summary') || !!target.closest('.starter-card, .start-button');
        if (!introVisible.current && event.code === 'Space' && canStart) {
          event.preventDefault(); event.stopPropagation(); start();
        }
        return;
      }
      const number = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
      if (current === 'summonSelect' && number) {
        event.preventDefault(); event.stopPropagation();
        const option = SUMMON_OPTIONS[Number(number[1]) - 1];
        setSelectedAlly(option.id);
        dialog.current?.querySelector<HTMLButtonElement>(`[data-ally="${option.id}"]`)?.focus();
        return;
      }
      if ((current === 'playing' || current === 'inventory') && number && Number(number[1]) <= 3) {
        event.preventDefault(); event.stopPropagation(); prioritize(Number(number[1]) - 1); return;
      }
      if (current === 'inventory') {
        if (event.code === 'KeyB') { event.preventDefault(); event.stopPropagation(); closeInventory(); }
        // Tab stays native inside the modal, including Shift+Tab focus cycling.
        return;
      }
      if (current !== 'playing') return;
      if (event.code === 'Escape') { event.preventDefault(); event.stopPropagation(); engine.pause(); clearInput(); sync(); return; }
      if (event.code === 'KeyB' || (event.code === 'Tab' && !event.shiftKey)) {
        if (event.code === 'KeyB' || !engine.snapshot().inventoryLocked) { event.preventDefault(); event.stopPropagation(); openInventory(); }
        return;
      }
      if (event.code === 'Space') { event.preventDefault(); event.stopPropagation(); requestSummon(); return; }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') { event.preventDefault(); if (!['portal', 'transition'].includes(engine.state.dungeon.phase)) { sound.unlock(); if (engine.activateSlow()) sync(); } return; }
      if (MOVEMENT_KEYS.includes(event.code)) { event.preventDefault(); keys.current.add(event.code); }
    };
    const keyup = (event: KeyboardEvent) => {
      keys.current.delete(event.code); held.current.delete(event.code);
      if (blockedActivation.current.delete(event.code)) { event.preventDefault(); event.stopPropagation(); }
    };
    const loseFocus = () => {
      clearInput(); held.current.clear(); blockedActivation.current.clear();
      if (engine.state.status === 'playing') engine.pause();
      sync(); last = performance.now();
    };
    const visibility = () => { if (document.hidden) loseFocus(); };
    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (engine.state.status === 'playing' && engine.state.dungeon.phase !== 'transition') {
        if (joystick.current.active) {
          const j = joystick.current;
          engine.setMovement((j.current.x - j.origin.x) / 46, (j.current.y - j.origin.y) / 46);
        } else {
          const k = keys.current;
          engine.setMovement(Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')), Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp')));
        }
      } else engine.setMovement(0, 0);
      engine.advance(dt);
      const nextDungeonPhase = engine.state.dungeon.phase;
      const travelChanged = nextDungeonPhase !== lastDungeonPhase && (nextDungeonPhase === 'portal' || nextDungeonPhase === 'transition' || lastDungeonPhase === 'transition');
      // Modal controls sync explicitly; frozen screens need no periodic snapshot allocations.
      if (engine.state.status !== lastStatus || engine.state.dungeon.floor !== lastFloor || travelChanged) {
        clearInput(); lastStatus = engine.state.status; lastFloor = engine.state.dungeon.floor;
        setSnapshot(engine.snapshot()); lastHud = now; lastHudRevision = hudRevision();
        if (engine.state.status !== 'playing') setFps(0);
      } else if (engine.state.status === 'playing' && now - lastHud >= 100) {
        const revision = hudRevision();
        if (revision !== lastHudRevision) { setSnapshot(engine.snapshot()); lastHudRevision = revision; }
        lastHud = now;
      }
      lastDungeonPhase = nextDungeonPhase;
      renderer.render(engine.state, joystick.current);
      if (engine.state.status === 'playing') {
        frames++;
        if (now - lastFps >= 1000) { setFps(Math.round(frames * 1000 / (now - lastFps))); frames = 0; lastFps = now; }
      } else { frames = 0; lastFps = now; }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', loseFocus); document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); sound.dispose(); audio.current = null;
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', loseFocus); document.removeEventListener('visibilitychange', visibility);
    };
  }, [engine, clearInput, requestSummon, openInventory, closeInventory, prioritize, start, sync]);

  useEffect(() => { if (!showIntro) startButton.current?.focus({ preventScroll: true }); }, [showIntro]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isModal) {
      if (!element.open) element.showModal();
      element.scrollTop = 0;
      element.querySelector<HTMLElement>('#dialog-title')?.focus({ preventScroll: true });
    } else if (element.open) {
      element.close();
      if (status === 'ready') startButton.current?.focus({ preventScroll: true });
      else canvas.current?.focus({ preventScroll: true });
    }
  }, [isModal, status, modalStep]);

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (engine.state.status !== 'playing' || engine.state.dungeon.phase === 'transition' || activePointer.current !== null || event.button !== 0) return;
    audio.current?.unlock(); event.currentTarget.setPointerCapture(event.pointerId); activePointer.current = event.pointerId;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    joystick.current = { active: true, origin: point, current: point };
  }
  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const j = joystick.current;
    const dx = event.clientX - rect.left - j.origin.x;
    const dy = event.clientY - rect.top - j.origin.y;
    const scale = Math.min(1, 46 / (Math.hypot(dx, dy) || 1));
    j.current = { x: j.origin.x + dx * scale, y: j.origin.y + dy * scale };
  }
  function pointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null; joystick.current.active = false; engine.setMovement(0, 0);
  }

  const briefing = status === 'summonSelect' ? '战场已暂停，先选择盟友，再确认召唤；取消不会消耗能量。' : engine.state.summonFlash > 0 ? `连一刻都没有为董事会的困局哀悼，立刻赶到战场的是——【${ally.name}】！` : snapshot.news;
  const timeLabel = snapshot.endless ? '无尽累计战斗' : '地牢战斗时间';
  const timeDisplay = formatTime(snapshot.time);
  const connectionLabel = { ready: '起手选择 · 高塔已就绪', playing: snapshot.endless ? `${dungeon.floor}F 无尽深渊` : `${dungeon.floor}F 地牢突围中`, paused: '连接已暂停', inventory: '武器匣 · 战场暂停', hex: '海克斯 · 战场暂停', summonSelect: '通灵选择 · 战场暂停', finishing: '黑闪 · 董事会正在崩解', victory: '神殿权限已收复', defeat: '行动已结束' }[status];

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="./" aria-label="重返算力神殿首页"><span className="brand-mark"><Icon name="chip" size={25}/></span><span><strong>重返算力神殿</strong><small>RETURN TO THE COMPUTE TEMPLE</small></span></a><div className="topbar-right"><span className="build-tag"><i/> VERSION 02 <span>/</span> 高塔地牢</span><span className="offline-label">纯本地运行 <Icon name="shield" size={14}/></span></div></header>
    <main className="workspace">
      <div className="mission-heading"><div><div className="eyebrow">OPERATION 002 <span> // </span> TOWER BREAKOUT</div><h1>皮衣无双 <span>{eventLabel}</span></h1></div><div className="sector-label"><span className="status-dot"/> {dungeon.name} <span className="mono">FLOOR — {String(dungeon.floor).padStart(2, '0')}</span></div></div>
      {(linkNotice || pendingHash !== null) && <div className="link-notice" role="status">{pendingHash !== null ? <><span>检测到新的链接。本局未被重置；返回起手时载入。</span>{!inRun && <button type="button" className="secondary-button" onClick={() => lobby()}>载入当前链接</button>}</> : linkNotice}</div>}
      <div className={`game-layout ${inRun ? '' : 'is-lobby'}`}>
        <section className={`arena-panel ${inRun ? 'is-active' : ''}`} aria-label="游戏战场">
          <div className="arena-toolbar"><span><span className="signal-icon">▥</span> {connectionLabel}</span><div className="arena-actions"><span className="fps mono">{fps || '—'} FPS</span><button className="icon-button" onClick={toggleAudio} aria-label={muted ? '开启音效' : '关闭音效'} title={muted ? '开启音效' : '关闭音效'}><Icon name={muted ? 'mute' : 'sound'} size={18}/></button><button className="icon-button" onClick={pause} disabled={status !== 'playing'} aria-label="暂停游戏" title="暂停 · Esc"><Icon name="pause" size={17}/></button></div></div>
          {inRun && <DungeonStrip dungeon={dungeon}/>}
          <div className={`arena-stage phase-${dungeon.phase} ${snapshot.boss ? 'has-boss' : ''} ${snapshot.boss && (snapshot.boss.entering || snapshot.boss.quote) ? 'has-boss-dialogue' : ''} ${hasChrono ? 'has-chrono' : ''}`}>
            <canvas ref={canvas} className="game-canvas" tabIndex={0} aria-label="WASD、方向键或战场拖动移动；自动攻击；1、2、3切培养焦点；B或Tab打开武器匣；满能量空格选盟友" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}/>
            {inRun && <div className="game-hud"><div className="health-group"><div className="health-caption"><span><Icon name="heart" size={13}/> 生命值</span><b className="mono" data-testid="health">{snapshot.hp}<span>/{snapshot.maxHp}</span></b></div><Meter value={snapshot.hp} max={snapshot.maxHp} className={snapshot.hp < snapshot.maxHp * .3 ? 'danger' : ''} label="生命值"/><div className="level-row"><b>LV.{snapshot.level.toString().padStart(2, '0')}</b><Meter value={snapshot.xp} max={snapshot.xpNeeded} className="xp-meter" label="自动强化经验"/></div><p className="xp-caption">XP 自动强化{snapshot.priorityWeapon ? `：${WEAPONS[snapshot.priorityWeapon].name}` : ' · 装备已完成培养'}</p></div><div className="time-group"><small>{timeLabel}</small><strong className="mono" data-testid="time">{timeDisplay}</strong><span><Icon name="crosshair" size={12}/> {snapshot.kills} 已击杀</span><span className="hud-difficulty" title={snapshot.endless ? `${difficulty.name} · 无尽挑战` : `${difficulty.name}难度 · 战斗上限 ${formatTime(runTimeLimit)}`}>{difficulty.name}{!snapshot.endless && ` · ${formatTime(runTimeLimit)}`}</span></div></div>}
            {inRun && snapshot.boss && <BossHud boss={snapshot.boss}/>}
            {inRun && dungeon.phase === 'portal' && dungeon.portalChoices.length > 0 && <div className="portal-guide" role="status"><span className="portal-guide-title">{dungeon.portalChoices.length > 1 ? '守关已突破 · 走入地面传送门，选择二层路线' : dungeon.floor === 2 && !snapshot.endless ? '守关已突破 · 走入金色电梯，直冲顶层' : '守关已突破 · 走入传送电梯，继续向上'}</span><div className={`portal-route-list ${dungeon.portalChoices.length === 1 ? 'single-route' : ''}`}>{dungeon.portalChoices.map((portal, index) => <div className="portal-route" key={portal.destination} style={{ '--portal-color': portal.color } as CSSProperties}><small>{dungeon.portalChoices.length > 1 ? index === 0 ? '← 左门' : '右门 →' : '↑ 直达电梯'}</small><strong>{portal.label}</strong><span>{portal.description}</span>{challenge?.dungeonBranch === portal.destination && <em>分享者选择的路线</em>}</div>)}</div><p>移动进入光圈即可上行；选门与电梯期间不计战斗时间。</p></div>}
            {inRun && dungeon.transition > 0 && <div className="floor-transition" role="status"><span className="floor-transition-icon"><Icon name="arrow" size={29}/></span><small>传送电梯 · 上行中</small><strong>{dungeon.floor}F · {dungeon.name}</strong><p>{MAP_DETAILS[dungeon.map].description}</p>{dungeon.affixes.length > 0 && <span className="transition-affixes">{dungeon.affixes.join(' · ')}</span>}</div>}
            {!inRun && <div className="start-screen arsenal-screen">
              <div className="arsenal-heading"><div><span className="start-code">起手武器 <span>/</span> 皮衣老J</span><h2>选一把，<span>杀回神殿。</span></h2></div><button type="button" className="intro-replay" onClick={() => { clearInput(); introVisible.current = true; setShowIntro(true); }}>重播开场 <Icon name="replay" size={14}/></button></div>
              <p className="arsenal-description">选 1 把起手，最多 3 把出战。清怪、破 Boss、选门，三层直冲塔顶。<span className="arsenal-swipe-hint">左右滑动查看五把武器</span></p>
              {challenge && <section className="challenge-panel" aria-label="本地挑战目标">
                <div><strong>同款起手已锁定 · {WEAPONS[challenge.initialWeapon].name}</strong><span className="mono">SEED {seedLabel(challenge.seed)}</span></div>
                <p>未验证目标：{challenge.target.kills} 击杀 / LV.{challenge.target.level} / {formatTime(challenge.target.time)} · 非服务器排名</p>
                <p>{difficultyLocked ? `同款难度已锁定：${DIFFICULTIES[challenge.difficulty!].name}` : '旧版挑战默认标准难度，可在下方自由调整。'}</p>
                {challenge.dungeonBranch && <p className={`challenge-route route-${challenge.dungeonBranch}`}>分享者路线：{branchName(challenge.dungeonBranch)}。1F 破关后走入对应门，即可挑战同款机房；也可自由改选另一条路线。</p>}
                {challenge.version === 2 && <p>已兼容载入旧版种子与起手，本局使用新的三层地牢规则。</p>}
                <details><summary>查看目标构筑与复现说明</summary><BuildSummary report={{ ...challenge.target, difficulty: challenge.difficulty, dungeonBranch: challenge.dungeonBranch }}/><p>同种子、同难度、同路线、同决策可复现地图、候选与掉落，不包含自动回放。目标由分享者提供，未经服务器验证。</p></details>
                <button type="button" className="text-button" onClick={exitChallenge}>退出挑战，自由选择起手与难度</button>
              </section>}
              <section className="difficulty-selector" aria-label="选择游戏难度">
                <div className="difficulty-heading"><strong>选择难度</strong><span>{difficultyLocked ? '挑战难度已锁定' : '开局前可更换 · 再来一局保留'}</span></div>
                <div className="difficulty-options" role="group" aria-label="四档难度">{DIFFICULTY_OPTIONS.map((option) => <button type="button" key={option.id} className={`difficulty-choice ${difficulty.id === option.id ? 'selected' : ''}`} style={{ '--difficulty-color': option.color } as CSSProperties} aria-pressed={difficulty.id === option.id} aria-label={`${option.name}：${option.description}，战斗上限 ${formatTime(option.timeLimit)}`} disabled={difficultyLocked} onClick={() => selectDifficulty(option.id)}><strong>{option.name}</strong><span>{option.tagline}</span><small>战斗上限 {formatTime(option.timeLimit)}</small>{difficulty.id === option.id && <i>已选</i>}</button>)}</div>
                <p className="difficulty-description">{difficulty.description} 选卡、选门和切换地图不计时。</p>
              </section>
              <div className="starter-options" role="group" aria-label="五种起手武器">{WEAPON_OPTIONS.map((weapon, index) => <button type="button" className={`starter-card ${snapshot.initialWeapon === weapon.id ? 'selected' : ''}`} key={weapon.id} style={{ '--card-accent': WEAPON_PREVIEWS[weapon.id].color } as CSSProperties} aria-label={`选择${weapon.name}：${WEAPON_PREVIEWS[weapon.id].text} 超武：${weapon.evolution}`} aria-pressed={snapshot.initialWeapon === weapon.id} disabled={!!challenge && challenge.initialWeapon !== weapon.id} onClick={() => { if (!challenge && engine.selectInitialWeapon(weapon.id)) sync(); }}>
                <span className="starter-art"><WeaponArtwork id={weapon.id}/><span className="starter-number" aria-hidden="true">0{index + 1}</span>{snapshot.initialWeapon === weapon.id && <span className="starter-selected-mark" aria-hidden="true"><Icon name="star" size={14}/></span>}</span>
                <span className="starter-copy"><strong className="starter-name">{weapon.name}</strong><span className="starter-description">{WEAPON_PREVIEWS[weapon.id].text}</span><span className="evolution-name"><small>超武</small>{weapon.evolution}</span><span className="starter-choice">{snapshot.initialWeapon === weapon.id ? '已选中' : challenge ? '挑战锁定' : '选择此武器'}<Icon name="arrow" size={16}/></span></span>
              </button>)}</div>
              <details className="starter-details" key={snapshot.initialWeapon}><summary>{starter.name} · 完整介绍</summary><p>{starter.description}</p><p><strong>{starter.evolution}</strong>：{starter.evolutionDescription}</p><p>Lv.1 → Lv.5 → 再升一级自动觉醒超武。</p></details>
              <div className="contract-actions"><button ref={startButton} className="primary-button start-button" onClick={() => start()}>抄起武器，杀回算力神殿！ <Icon name="arrow" size={20}/></button><div className="start-footnote"><span>SPACE 开战</span><i/><span>WASD / 拖动移动</span><i/><span>自动攻击</span></div></div>
            </div>}
            {status === 'playing' && <>
              <div className="effect-tags">{snapshot.activeEffects.map((effect, index) => <span key={index}>{effect}</span>)}</div>
              <div className="battle-notices" aria-hidden="true">{snapshot.logs.filter((entry) => (entry.kind === 'evolution' || entry.kind === 'event') && snapshot.time - entry.time < 2.8).slice(-2).map((entry) => <p key={entry.id} className={`battle-notice notice-${entry.kind}`}>{entry.kind === 'evolution' && <Icon name="star" size={15}/>}<span>{entry.text}</span></p>)}</div>
              <div className="field-caption"><span className="reticle-corner"/> {dungeon.phase === 'portal' ? '走入传送光圈 · 继续上行' : dungeon.phase === 'transition' ? '正在切换地牢地图' : snapshot.eventRemaining > 0 ? `${eventLabel} · ${Math.ceil(snapshot.eventRemaining)}s` : snapshot.endless ? `${dungeon.floor}F 无尽地牢 · 击破守关继续攀塔` : nextHexLabel}</div>
              {hasChrono && <button className="dash-button" onClick={slow} disabled={!!snapshot.boss?.entering || snapshot.dashCooldown > 0 || isSlowed} aria-label={snapshot.boss?.entering ? '首领降临中，落地后可开启斯安威斯坦' : '开启斯安威斯坦'}><Icon name="clock" size={17}/><span>{snapshot.boss?.entering ? '落地后可闪避' : isSlowed ? '子弹时间' : snapshot.dashCooldown > 0 ? `${Math.ceil(snapshot.dashCooldown)} 秒冷却` : '斯安威斯坦'}<small>SHIFT / 点击</small></span></button>}
              <button className={`summon-button ${snapshot.energy >= 100 ? 'charged' : ''}`} disabled={snapshot.energy < 100 || !!snapshot.boss?.entering} onClick={requestSummon} style={{ '--charge': `${snapshot.energy}%` } as CSSProperties} aria-label={snapshot.boss?.entering ? '首领降临中，落地后可选择盟友' : snapshot.energy >= 100 ? '硅谷通灵术：暂停并选择盟友' : `通灵充能 ${Math.floor(snapshot.energy)}%`}><Icon name="bolt" size={26}/><span><strong>{snapshot.boss?.entering ? '首领降临中' : snapshot.energy >= 100 ? '选择召唤盟友' : '通灵充能'}</strong><small>{snapshot.boss?.entering ? '落地后可召唤' : snapshot.energy >= 100 ? 'SPACE / 点击选择' : `${Math.floor(snapshot.energy)}%`}</small></span><span className="summon-key">␣</span></button>
            </>}
            {showCombatEffects && snapshot.summons > 0 && ally.id === 'patch' && engine.state.summonFlash > 0 && <div className="summon-code" key={`code-${snapshot.seed}-${snapshot.summons}`} aria-hidden="true" data-paused={status !== 'playing'} style={{ '--ally-color': ally.color, '--summon-duration': `${SUMMON_DURATION}s` } as CSSProperties}>{Array.from({ length: 8 }, (_, i) => <span key={i} style={{ '--column': i } as CSSProperties}>01 10 01 11 00 10 01 00 11 10 00 01 10 11 01 00</span>)}</div>}
            {showCombatEffects && snapshot.summons > 0 && engine.state.summonFlash > 0 && <div className={`summon-apparition apparition-${ally.id}`} key={`${snapshot.seed}-${snapshot.summons}`} data-paused={status !== 'playing'} style={{ '--ally-color': ally.color, '--summon-duration': `${SUMMON_DURATION}s` } as CSSProperties}><div className="summon-aura" aria-hidden="true"/><AllyPortrait ally={ally.id} className="summon-portrait"/><div className="summon-banner" role="status"><small>硅谷通灵术</small><strong>{ally.name}</strong><span>{ally.skill}</span><p>“{ally.quote}”</p></div></div>}
            {showCombatEffects && engine.state.effects.freeze > 0 && <div className="time-stop-glyphs" aria-hidden="true"><span>ゴゴゴゴ</span><span>ゴゴゴゴ</span></div>}
            <div className="arena-vignette"/>
          </div>
          <div className="equipment-dock"><div className="dock-caption"><span><Icon name="star" size={12}/> 数字 1 / 2 / 3 · 切培养焦点，不暂停</span><span>{snapshot.inventoryLocked ? '保护期间 · 武器匣锁定' : '三槽独立冷却'}</span></div><EquipmentSlots snapshot={snapshot} onPriority={prioritize}/><button type="button" className="inventory-button" disabled={status !== 'playing' || snapshot.inventoryLocked} onClick={openInventory}><Icon name="box" size={19}/><span>武器匣 <b>{reserves.length} 备用</b></span><kbd>B / TAB</kbd></button></div>
          <div className="news-ticker"><span className="ticker-label"><i/> 硅谷突发快讯</span><p>{briefing}</p><span className="ticker-number mono">003</span></div>
        </section>
        <aside className="sidebar">
          <div className="mission-stack">
          <section className="briefing-panel"><div className="panel-label">行动目标 <span>{snapshot.endless ? `${dungeon.floor}F / ENDLESS` : `${difficulty.name} · 三层高塔`}</span></div><div className="mission-icon"><Icon name="shield" size={26}/></div><h2>{dungeon.name}</h2><p>{snapshot.endless ? <>带着当前构筑继续攀塔。每层随机词缀，击破守关 Boss 后走入电梯，挑战下一层。</> : <>操控<strong>皮衣老J</strong>，清怪积攒突破进度，击败三位守关 Boss。{runTimeLimit > 210 ? <><strong>{formatTime(runTimeLimit)} 战斗上限</strong>，留好通灵迎战强敌。</> : <><strong>约 3 分钟</strong>杀回黄金圣殿。</>}</>}</p><div className="mission-progress"><span>{status === 'victory' ? '三层高塔已突破' : status === 'defeat' ? '本层突围结束' : `${dungeon.floor}F ${floorPhaseLabel(dungeon.phase)}`}</span><b className="mono">{Math.floor(dungeon.progress)}%</b></div><Meter value={dungeon.progress} max={100} label="当前楼层突破进度"/><ol className="dungeon-objectives"><li className={dungeon.floorsCleared >= 1 ? 'cleared' : ''}><span>1F</span><div><strong>外围霓虹广场</strong><small>直播装甲车 · 二选一分支门</small></div></li><li className={dungeon.floorsCleared >= 2 ? 'cleared' : ''}><span>2F</span><div><strong>{dungeon.branch ? branchName(dungeon.branch) : '极寒机房 / 暗网走廊'}</strong><small>绝对协议体 · 超武升级核心</small></div></li><li className={dungeon.floorsCleared >= 3 ? 'cleared' : ''}><span>3F</span><div><strong>顶层黄金圣殿</strong><small>牛市反转 · 算力收割机 MK-I</small></div></li></ol><div className="stage-note">清怪 → 守关 → 海克斯 → 走入电梯<br/>{snapshot.endless ? `已突破 ${dungeon.floorsCleared} 层 · 当前 ${dungeon.floor}F` : '杀得越快，守关 Boss 越早登场。'}</div>{challenge && <p className="challenge-mini">挑战中 · 起手锁定<br/>目标 {challenge.target.kills} 击杀 / LV.{challenge.target.level}{challenge.dungeonBranch && <><br/>同款路线：{branchName(challenge.dungeonBranch)}</>}<br/>本地未验证目标，非排名</p>}</section>
          <BattleTerminal logs={snapshot.logs} status={status} onFocus={clearInput}/>
          </div>
          <section className="loadout-panel ally-guide"><div className="panel-label">盟友图鉴 <span>每次均可更换</span></div><div className="ally-guide-options" role="group" aria-label="浏览盟友">{SUMMON_OPTIONS.map((option) => <button type="button" key={option.id} className={`ally-option ${previewAlly === option.id ? 'selected' : ''}`} aria-pressed={previewAlly === option.id} onClick={() => setPreviewAlly(option.id)} style={{ '--ally-color': option.color } as CSSProperties}><AllyPortrait ally={option.id}/><span><strong>{option.name}</strong><small>{option.skill}</small></span></button>)}</div><details className="ally-guide-detail"><summary>{preview.name} · {preview.skill}</summary><p>“{preview.quote}”</p><p>{preview.description}</p></details><p className="ally-note">满能量按 Space 暂停选择；选中后独立确认，取消保留能量。</p>{snapshot.summonHistory.length > 0 && <p className="ally-note">上次召唤：{ally.name} · {ally.skill}</p>}</section>
          <section className="hex-build-panel"><div className="panel-label">海克斯构筑 <span>{snapshot.hexRound} / {HEX_TIMES.length}</span></div>{snapshot.hexes.length === 0 ? <p className="hex-empty">{HEX_SCHEDULE}<br/>各选择一次，每次三槽各可刷新一次。</p> : <div className="hex-build-list">{snapshot.hexes.map((id) => { const card = HEXTECH.find((item) => item.id === id)!; return <div key={id} className={`hex-build-item tier-${card.tier}`} title={`${card.description} ${card.detail}`}><Icon name={card.icon} size={18}/><span><strong>{card.name}</strong><small>{card.detail}</small></span></div>; })}</div>}<details className="hex-catalog"><summary>十一张海克斯 · 完整图鉴</summary>{HEXTECH.map((card) => <div key={card.id} className={`tier-${card.tier}`}><h3>{card.name} <small>{TIER_LABELS[card.tier]}</small></h3><p>{card.description}</p><strong>{card.detail}</strong></div>)}</details></section>
          <section className="controls-panel"><div className="panel-label">操作指引 <span>CONTROLS</span></div><div className="control-row"><div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>移动 / 方向键 / 拖动</span></div><div className="control-row"><kbd>↗</kbd><span>破关后走入光圈选门</span></div><div className="control-row"><kbd>1 / 2 / 3</kbd><span>切培养焦点 · 不暂停</span></div><div className="control-row"><kbd>B / TAB</kbd><span>武器匣 · 暂停换装</span></div><div className="control-row"><kbd>SPACE</kbd><span>满能量选盟友 · 确认释放</span></div><div className="control-row"><kbd>SHIFT</kbd><span>斯安威斯坦（需选卡）</span></div><div className="control-row"><kbd>ESC</kbd><span>暂停 / 返回战场</span></div></section>
        </aside>
      </div>
      <footer className="page-footer"><span><span className="status-dot"/> 本地运行 · 不上传对局数据</span><span>架空科技寓言 <i>/</i> BUILT WITH QODER <i>/</i> <b>第二版 · 高塔地牢</b></span></footer>
    </main>
    <dialog ref={dialog} className={`game-dialog ${status === 'hex' ? 'hex-dialog' : status === 'summonSelect' ? 'summon-dialog' : status === 'inventory' ? 'inventory-dialog' : status === 'victory' ? 'newspaper-dialog' : status === 'defeat' ? 'defeat-dialog' : ''}`} onKeyDown={navigateSummons} onCancel={(event) => { event.preventDefault(); if (status === 'summonSelect') cancelSummon(); else if (status === 'inventory') closeInventory(); else if (status === 'paused') resume(); }} aria-labelledby="dialog-title" aria-describedby={status === 'summonSelect' ? 'summon-description' : undefined}>
      {status === 'inventory' && <>
        <div className="dialog-eyebrow"><Icon name="box" size={16}/> ARMORY / 战场完全暂停</div><h2 id="dialog-title" tabIndex={-1}>武器匣</h2><p className="dialog-description">{timeLabel} <b>{timeDisplay}</b> · 通灵 {Math.floor(snapshot.energy)}%{snapshot.energy >= 100 ? '（已满，返回战场可召唤）' : ''}<br/>先选一把备用，再点击上方目标槽交换。数字 1 / 2 / 3 或星标切换培养焦点。</p>
        <EquipmentSlots snapshot={snapshot} onPriority={prioritize} onSlot={equip} reserve={selectedReserve}/>
        <div className="inventory-section-title"><h3>已获得备用 <span>{reserves.length}</span></h3><span>换装保留等级、进化与冷却</span></div>
        <div className="reserve-options" role="group" aria-label="选择备用武器">{reserves.map((weapon) => <button type="button" key={weapon.id} className={`reserve-card ${weapon.evolved ? 'is-evolved' : ''} ${selectedReserve === weapon.id ? 'selected' : ''}`} aria-pressed={selectedReserve === weapon.id} onClick={() => setSelectedReserve(weapon.id)}><Icon name={WEAPONS[weapon.id].icon} size={23}/><strong>{weaponName(weapon)}</strong><small>LV.{weapon.level}{weapon.evolved ? ' · 超武' : ''} · {cooldownLabel(weapon, snapshot.time)}</small><p>{weapon.evolved ? WEAPONS[weapon.id].evolutionDescription : WEAPONS[weapon.id].description}</p></button>)}</div>
        {reserves.length === 0 && <p className="inventory-empty">暂无备用。继续战斗、拾取掉落武器后可在这里换装。</p>}
        {missingWeapons.length > 0 && <p className="inventory-missing">尚未获得：{missingWeapons.map((weapon) => weapon.name).join(' / ')}。未获得的武器不能装入槽位。</p>}
        <p className="inventory-selection" role="status">{selectedReserve ? `已选择 ${WEAPONS[selectedReserve].name}，请点击上方槽位。` : '经验自动强化优先武器，换装后继续作战。'}</p><button type="button" className="primary-button" onClick={closeInventory}>返回战场 <span>ESC / B</span></button><p className="dialog-hint">Tab / Shift+Tab 正常切换焦点 · 换装期间时间与冷却均冻结</p>
      </>}
      {status === 'summonSelect' && <>
        <div className="dialog-eyebrow"><Icon name="bolt" size={16}/> 硅谷通灵术 · 能量 {Math.floor(snapshot.energy)}%</div><h2 id="dialog-title" tabIndex={-1}>选择本次召唤盟友</h2><p id="summon-description" className="dialog-description">战场完全暂停。数字 1–4、方向键或点击选中，再单独确认召唤。<br/>每次都可更换；Esc 或取消保留全部能量。</p>
        <div className="summon-options" role="group" aria-label="四位可召唤盟友">{SUMMON_OPTIONS.map((option, index) => <button type="button" key={option.id} data-ally={option.id} className={`ally-option summon-card ${selectedAlly === option.id ? 'selected' : ''}`} aria-pressed={selectedAlly === option.id} onClick={() => setSelectedAlly(option.id)} style={{ '--ally-color': option.color } as CSSProperties}><span className="summon-card-heading"><AllyPortrait ally={option.id}/><span><strong>{option.name}</strong><small>{option.skill}</small></span></span><span className="summon-card-description">{option.description}</span><span className="summon-card-quote">“{option.quote}”</span>{hasReckless && option.id === 'aegis' && <span className="summon-warning">{RECKLESS_WARNING}</span>}<i>{index + 1} · {selectedAlly === option.id ? '已选' : '选择'}</i></button>)}</div>
        <div className="summon-selection-summary" aria-live="polite" aria-atomic="true"><p>{selectedAlly ? `本次选择：${ALLIES[selectedAlly].name} · ${ALLIES[selectedAlly].skill}` : '尚未选择盟友；选择卡片不会自动释放。'}</p>{hasReckless && selectedAlly === 'aegis' && <p id="summon-warning" className="summon-warning">{RECKLESS_WARNING}。墙不会升起，也不会反弹；仍可确认，消耗全部能量。</p>}</div><div className="summon-actions"><button type="button" className="primary-button" disabled={!selectedAlly} onClick={confirmSummon} aria-describedby={hasReckless && selectedAlly === 'aegis' ? 'summon-warning' : undefined}>确认召唤 <Icon name="bolt" size={18}/></button><button type="button" className="text-button" onClick={cancelSummon}>取消 · 保留能量</button></div>
      </>}
      {status === 'hex' && <>
        <div className="dialog-eyebrow"><Icon name="diamond" size={16}/> HEXTECH {snapshot.hexRound + 1} / {HEX_TIMES.length} · 战场暂停</div><h2 id="dialog-title" tabIndex={-1}>选择你的海克斯科技</h2><p className="dialog-description">三选一，永久生效。每张可独立刷新一次。</p>
        <div className="hex-options">{snapshot.hexChoices.map((card, slot) => <article className={`hex-card tier-${card.tier}`} key={slot}>
          <button type="button" className="hex-pick" onClick={() => chooseHex(card.id)} aria-label={`选择 ${card.name}：${card.description} ${card.detail}`}>
            <span className="hex-art"><HexArtwork id={card.id}/><span className="hex-tier">{TIER_LABELS[card.tier]}</span></span>
            <span className="hex-copy"><strong className="hex-name">{card.name}</strong><span className="hex-short">{HEX_SUMMARIES[card.id]}</span><span className="choose-label">选择此强化 <Icon name="arrow" size={18}/></span></span>
          </button>
          <details className="hex-details" key={card.id}><summary>完整效果</summary><p>{card.description}</p><p>{card.detail}</p></details>
          <button type="button" className="hex-reroll" aria-disabled={snapshot.hexRerolls[slot]} aria-label={`候选槽 ${slot + 1}：${snapshot.hexRerolls[slot] ? '已刷新' : '刷新1次'}`} onClick={() => rerollHex(slot)}><Icon name="replay" size={15}/>{snapshot.hexRerolls[slot] ? '已刷新' : '刷新1次'}</button>
        </article>)}</div>
      </>}
      {status === 'paused' && <><span className="result-symbol"><Icon name="pause" size={34}/></span><div className="dialog-eyebrow">PAUSED</div><h2 id="dialog-title" tabIndex={-1}>游戏已暂停</h2><p className="dialog-description">战场与倒计时已冻结。<br/>切换窗口也会自动暂停。</p><button className="primary-button" onClick={resume}>继续突围 <Icon name="arrow"/></button><button className="text-button" onClick={() => start(true)}>同种子、同起手重试</button><button className="text-button" onClick={() => lobby()}>{pendingHash !== null ? '返回起手并载入当前链接' : '返回起手选择'}</button></>}
      {(status === 'victory' || status === 'defeat') && <>
        {status === 'victory' ? <><div className="newspaper-masthead">硅谷科技周刊<span>THE SILICON VALLEY WEEKLY · 高塔特别刊</span></div><div className="newspaper-dateline"><span>头版号外</span><span>SEED {seedLabel(snapshot.seed)}</span><span>神殿纪元 004</span></div><h2 id="dialog-title" className="victory-headline" tabIndex={-1}>皮衣归来，<br/>神殿易主。</h2><p className="newspaper-deck">三层高塔全线突破，资本长老会主席倒下。最高管理员权限重归老J。</p><blockquote className="chairman-epitaph">“看来……没能让老J使出全力啊。”</blockquote><div className="result-verdict">{difficulty.name} · 三层高塔 · 胜利</div></> : <><div className="dialog-eyebrow">{snapshot.endless ? `ENDLESS / ${dungeon.floor}F 无尽败北` : `DEFEAT / ${dungeon.floor}F 突围失败`} · {difficulty.name}</div><h2 id="dialog-title" tabIndex={-1} className="defeat-title">跌</h2><p className="dialog-description">{DEFEAT_QUOTE}</p>{snapshot.defeatReason === 'timeout' && <p className="defeat-reason">{difficulty.name}难度的战斗时间已达 {formatTime(runTimeLimit)}，高塔尚未突破。再选一套构筑杀回来。</p>}{snapshot.endless && <p className="defeat-reason">无尽深渊挑战止于 {dungeon.floor}F，累计突破 {dungeon.floorsCleared} 层。</p>}</>}
        <div className="result-stats"><div><strong>{formatTime(report?.time ?? snapshot.time)}</strong><span>{snapshot.endless ? '累计生存时间' : '战斗时间'}</span></div><div><strong>{report?.kills ?? snapshot.kills}</strong><span>击杀敌人</span></div><div><strong>{report?.level ?? snapshot.level}</strong><span>本局等级</span></div></div>
        {report && <BuildSummary report={report}/>}
        <div className="result-actions"><button type="button" className="secondary-button" disabled={!report || posterBusy} onClick={() => void downloadPoster()}><Icon name="download" size={17}/>{posterBusy ? '本地绘制中…' : '下载战报 PNG'}</button><button type="button" className="secondary-button" disabled={!report} onClick={() => void copyChallenge()}><Icon name="link" size={17}/>复制地牢挑战链接</button>{status === 'victory' && <button type="button" className="primary-button endless-button" onClick={enterEndless}>深入无尽地牢 · 4F AI 奇点核心 <Icon name="arrow" size={18}/></button>}<button type="button" className="secondary-button" onClick={() => start(true)}><Icon name="replay" size={17}/>同种子、同起手重试</button><button type="button" className="secondary-button" onClick={() => lobby()}>{pendingHash !== null ? '回起手，载入当前链接' : '返回起手选择'}</button></div>
        <p className="report-message" role="status">{reportMessage || (!report ? '引擎尚未提供最终战报，暂不能导出或分享。' : '全本地生成；挑战目标未经验证，非服务器排名。')}</p>{manualLink && <label className="manual-copy">手动复制挑战链接<input ref={copyInput} readOnly value={manualLink} onFocus={(event) => event.currentTarget.select()} aria-label="只读挑战链接，按 Ctrl+C 或长按复制"/><span>Ctrl+C / 长按复制；复制完成后可继续选择结算操作。</span></label>}<p className="result-seed mono">SEED {seedLabel(snapshot.seed)} · 起手 {WEAPONS[snapshot.initialWeapon].name} · {difficulty.name}<br/>同种子、同难度、同路线、同决策复现地图、候选与掉落；不包含自动回放。</p>
      </>}
    </dialog>
    {showIntro && !inRun && <IntroCutscene initialWeapon={snapshot.initialWeapon} onComplete={finishIntro} onUnlock={unlockIntro} onRise={playIntroRise}/>}
  </div>;
}
