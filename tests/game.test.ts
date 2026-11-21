import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine/GameEngine.ts';
import { initialStory } from '../src/engine/StorySystem.ts';
import { decodeChallenge, encodeChallenge, mulberry32 } from '../src/utils/prng.ts';
import { STORY_EVENTS } from '../src/data/events.ts';
import { HEXTECH } from '../src/data/hextech.ts';
import { WEAPONS } from '../src/data/weapons.ts';
import { FIXED_STEP, HEX_TIMES, MAX_PROJECTILES, RUN_DURATION, WORLD_WIDTH, WORLD_HEIGHT } from '../src/types/game.ts';
import type { RunReport, WeaponId } from '../src/types/game.ts';

const weaponIds = Object.values(WEAPONS).map(({ id }) => id);

function simulate(engine: GameEngine, seconds: number, step = FIXED_STEP) {
  for (let i = 0; i < Math.round(seconds / step); i++) engine.advance(step);
}

function weapon(engine: GameEngine, id: WeaponId) {
  const found = engine.state.weapons.find((item) => item.id === id);
  assert.ok(found);
  return found;
}

// Reuse a real enemy's ID and the complete story defaults; isolate only the Boss scenario.
function isolateBoss(engine: GameEngine) {
  const s = engine.state;
  const boss = s.enemies[0];
  assert.ok(boss);
  boss.kind = 'boss';
  boss.hp = boss.maxHp = 5600;
  boss.radius = 46;
  boss.speed = 64;
  boss.spawnGrace = 0;
  boss.x = s.player.x + 200;
  boss.y = s.player.y;
  s.enemies = [boss];
  s.story = { ...initialStory(), bossId: boss.id };
  for (const item of s.weapons) item.nextFireTime = RUN_DURATION + 1;
  return boss;
}

test('same seed produces identical random sequences in [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 500; i++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

test('v2 challenge codes round-trip all starters and unsigned seed boundaries', () => {
  for (const seed of [0, 42, 0xffffffff]) {
    for (const initialWeapon of weaponIds) {
      const report: RunReport = {
        seed, initialWeapon, kills: 321, level: 12, time: 179.125, victory: true,
        weapons: weaponIds.map((id) => ({ id, level: id === initialWeapon ? 5 : 2, evolved: id === initialWeapon })),
        equipped: [initialWeapon, null, weaponIds.find((id) => id !== initialWeapon)!],
        hexes: ['echo', 'reckless', 'network'], summonHistory: ['patch', 'ember', 'aegis', 'clock'],
      };
      const encoded = encodeChallenge(report);
      assert.match(encoded, /^#run=v2_[A-Za-z0-9_-]+$/);
      assert.deepEqual(decodeChallenge(encoded), {
        version: 2, seed, initialWeapon,
        target: {
          kills: report.kills, level: report.level, time: report.time, weapons: report.weapons,
          equipped: report.equipped, hexes: report.hexes, summonHistory: report.summonHistory,
        },
      });
    }
  }
});

test('v2 challenge decoder rejects malformed, oversized and invalid loadout payloads', () => {
  const pack = (payload: unknown) => `#run=v2_${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  const valid: unknown[] = [0, 0, 0, 1, 0, [[0, 1, 0]], [0, -1, -1], [], []];
  assert.ok(decodeChallenge(pack(valid)));
  for (const [index, value] of [
    [0, -1], [0, 0x100000000], [1, 5],
    [5, [[5, 1, 0]]], [5, [[0, 4, 1]]],
    [6, [5, -1, -1]], [6, [-2, 0, -1]], [6, [0, 0, -1]], [6, [0, 1, -1]],
    [7, [0, 0]], [7, [11]],
  ] as const) {
    const payload = [...valid];
    payload[index] = value;
    assert.equal(decodeChallenge(pack(payload)), null);
  }
  for (const hash of ['', '#run=v2_%%%', '#run=v2_bm90LWpzb24', '#run=v2_' + 'A'.repeat(4097),
    pack(valid).replace('v2_', 'v1_'), pack(valid).replace('v2_', 'v3_'), pack({}), pack(valid.slice(1))]) {
    assert.equal(decodeChallenge(hash), null);
  }
});

test('each of the five weapons can be the sole starting weapon, only in the lobby', () => {
  assert.deepEqual(weaponIds, ['gpu', 'spatula', 'cuda', 'pulse', 'duck']);
  for (const id of weaponIds) {
    const engine = new GameEngine(7);
    assert.equal(engine.selectInitialWeapon(id), true);
    assert.equal(engine.state.initialWeapon, id);
    assert.equal(engine.state.priorityWeapon, id);
    assert.deepEqual(engine.state.equipped, [id, null, null]);
    assert.deepEqual(engine.state.weapons, weaponIds.map((weaponId) => ({
      id: weaponId, level: weaponId === id ? 1 : 0, evolved: false, nextFireTime: 0,
    })));
    engine.start();
    const before = structuredClone(engine.state);
    assert.equal(engine.selectInitialWeapon('gpu'), false);
    assert.deepEqual(engine.state, before);
    const constructed = new GameEngine(7, undefined, id);
    constructed.start();
    assert.deepEqual(engine.state, constructed.state);
  }
});

test('fixed simulation gives the same state at 30, 60 and 120 FPS', () => {
  const engines = [new GameEngine(42), new GameEngine(42), new GameEngine(42)];
  engines.forEach((engine, index) => {
    engine.start();
    engine.setMovement(0.6, 0.8);
    simulate(engine, 5, [1 / 30, 1 / 60, 1 / 120][index]);
  });
  assert.deepEqual(engines[0].state, engines[1].state);
  assert.deepEqual(engines[1].state, engines[2].state);
});

test('large dt is clamped and pause freezes all simulation state', () => {
  const engine = new GameEngine(8);
  engine.start();
  engine.advance(12);
  assert.ok(engine.state.time <= 0.05 + 1e-9);
  engine.pause();
  const state = structuredClone(engine.state);
  simulate(engine, 20);
  assert.deepEqual(engine.state, state);
  assert.equal(engine.requestSummon(), false);
  engine.resume();
  simulate(engine, 1);
  assert.ok(engine.state.time > state.time);
});

test('diagonal motion is normalized and world bounds are enforced', () => {
  const engine = new GameEngine(8);
  engine.start();
  const before = { ...engine.state.player };
  engine.setMovement(1, 1);
  simulate(engine, 1);
  assert.ok(Math.abs(Math.hypot(engine.state.player.x - before.x, engine.state.player.y - before.y) - before.speed) < 1e-6);
  engine.state.player.hp = 100000;
  simulate(engine, 5);
  assert.ok(engine.state.player.x <= WORLD_WIDTH - 38);
  assert.ok(engine.state.player.y <= WORLD_HEIGHT - 38);
});

test('automatic fire hits enemies and drops collectible experience', () => {
  const engine = new GameEngine(17);
  engine.start();
  simulate(engine, 8);
  assert.ok(engine.state.kills > 0);
  assert.ok(engine.state.crystals.length > 0 || engine.state.xp > 0 || engine.state.level > 1);
  assert.equal(engine.state.status, 'playing');
  assert.equal(engine.state.bossDefeated, false);
});

test('XP upgrades the selected priority weapon automatically and preserves overflow without pausing', () => {
  const engine = new GameEngine(22);
  engine.start();
  weapon(engine, 'duck').level = 1;
  assert.equal(engine.openInventory(), true);
  assert.equal(engine.equipWeapon('duck', 1), true);
  assert.equal(engine.setPriority(1), true);
  engine.closeInventory();
  engine.state.xp = 100;
  engine.advance(FIXED_STEP);
  assert.equal(engine.state.status, 'playing');
  assert.equal(engine.state.level, 4);
  assert.equal(engine.state.xp, 26); // 100 - 12 - 28 - 34
  assert.equal(engine.state.xpNeeded, 40);
  assert.equal(weapon(engine, 'duck').level, 4);
  assert.equal(weapon(engine, 'gpu').level, 1);
  const time = engine.state.time;
  engine.advance(FIXED_STEP);
  assert.ok(engine.state.time > time);
});

test('level five evolves before priority falls back; fully evolved slots receive overflow damage', () => {
  const engine = new GameEngine(100);
  engine.start();
  const gpu = weapon(engine, 'gpu');
  const duck = weapon(engine, 'duck');
  gpu.level = 5;
  duck.level = 1;
  engine.state.equipped = ['gpu', 'duck', null];
  engine.state.xp = engine.state.xpNeeded;
  const damage = engine.state.damage;
  engine.advance(FIXED_STEP);
  assert.equal(gpu.evolved, true);
  assert.equal(gpu.level, 5);
  assert.equal(engine.state.priorityWeapon, 'duck');
  assert.equal(engine.setPriority(0), false);
  assert.equal(engine.state.damage, damage);
  engine.state.xp = engine.state.xpNeeded;
  engine.advance(FIXED_STEP);
  assert.equal(duck.level, 2);
  duck.level = 5;
  duck.evolved = true;
  engine.state.xp = engine.state.xpNeeded + 7;
  engine.advance(FIXED_STEP);
  assert.equal(engine.state.status, 'playing');
  assert.equal(engine.state.priorityWeapon, null);
  assert.equal(engine.state.xp, 7);
  assert.equal(engine.state.damage, damage * 1.1);
});

test('inventory freezes the whole state and three-slot swaps preserve every weapon timer and evolution', () => {
  const engine = new GameEngine(31);
  engine.start();
  engine.advance(FIXED_STEP);
  assert.equal(engine.equipWeapon('gpu', 1), false);
  assert.equal(engine.openInventory(), true);
  assert.equal(engine.equipWeapon('duck', 1), false); // Not owned yet.
  engine.state.weapons.forEach((item, index) => {
    item.level = index % 2 === 0 ? 5 : 3;
    item.evolved = index % 2 === 0;
    item.nextFireTime = 12.5 + index;
  });
  const weapons = structuredClone(engine.state.weapons);
  assert.equal(engine.equipWeapon('spatula', 1), true);
  assert.equal(engine.equipWeapon('cuda', 2), true);
  assert.deepEqual(engine.state.equipped, ['gpu', 'spatula', 'cuda']);
  const frozen = structuredClone(engine.state);
  simulate(engine, 10);
  assert.deepEqual(engine.state, frozen);
  assert.equal(engine.requestSummon(), false);
  for (const slot of [-1, 3, 0.5]) assert.equal(engine.equipWeapon('duck', slot), false);
  assert.equal(engine.equipWeapon('spatula', 2), false);
  assert.equal(engine.equipWeapon('duck', 0), true);
  assert.equal(engine.equipWeapon('pulse', 2), true);
  assert.deepEqual(engine.state.equipped, ['duck', 'spatula', 'pulse']);
  assert.equal(engine.equipWeapon('gpu', 0), true);
  assert.equal(engine.equipWeapon('cuda', 2), true);
  engine.closeInventory();
  assert.equal(engine.state.status, 'playing');
  assert.deepEqual(engine.state.equipped, ['gpu', 'spatula', 'cuda']);
  assert.deepEqual(engine.state.weapons, weapons);
  assert.equal(engine.state.time, frozen.time);
});

test('reopening inventory changes neither the hex schedule nor the four fixed weapon supplies', () => {
  const engines = [new GameEngine(73), new GameEngine(73)];
  const schedule = structuredClone(engines[0].state.hexSchedule);
  const supplies: WeaponId[][] = [[], []];
  engines.forEach((engine, index) => {
    engine.start();
    engine.state.hexRound = HEX_TIMES.length;
    for (const item of engine.state.weapons) item.nextFireTime = RUN_DURATION + 1;
    for (const at of [25, 55, 70, 110]) {
      if (index === 0) {
        for (let repeat = 0; repeat < 4; repeat++) {
          assert.equal(engine.openInventory(), true);
          engine.closeInventory();
        }
      }
      // Skip unrelated past events, but let the real timed supply execute through advance.
      engine.state.story = { ...initialStory(), fired: STORY_EVENTS.filter((event) => event.at < at).map((event) => event.id) };
      engine.state.time = at - FIXED_STEP;
      engine.state.enemies = [];
      engine.state.weaponDrops = [];
      engine.advance(FIXED_STEP);
      const drops = engine.state.weaponDrops.filter((drop) => drop.weapon !== null);
      assert.equal(drops.length, 1);
      supplies[index].push(drops[0].weapon!);
      assert.deepEqual(engine.state.hexSchedule, schedule);
    }
  });
  assert.deepEqual(supplies[0], supplies[1]);
  assert.deepEqual([...supplies[0]].sort(), weaponIds.filter((id) => id !== 'gpu').sort());
});

test('each hex round grants three independent single-slot rerolls, with reproducible unseen choices', () => {
  const a = new GameEngine(88);
  const b = new GameEngine(88);
  a.start(); b.start();
  simulate(a, 0.5);
  simulate(b, 2); // Combat activity must not consume the draft stream.
  const schedule = structuredClone(a.state.hexSchedule);
  assert.deepEqual(b.state.hexSchedule, schedule);
  for (const at of HEX_TIMES) {
    for (const engine of [a, b]) {
      engine.state.player.invincible = 10;
      engine.state.time = at - FIXED_STEP;
      engine.advance(FIXED_STEP);
      assert.equal(engine.state.status, 'hex');
      assert.deepEqual(engine.state.hexRerolls, [false, false, false]);
    }
    assert.deepEqual(a.state.hexChoices, b.state.hexChoices);
    const seen = new Set(a.state.hexChoices.map((card) => card.id));
    assert.equal(seen.size, 3);
    assert.ok([...seen].every((id) => !a.state.hexes.includes(id)));
    for (const slot of [-1, 3, 0.5]) assert.equal(a.rerollHex(slot), false);
    for (let slot = 0; slot < 3; slot++) {
      const before = structuredClone(a.state.hexChoices);
      assert.equal(a.rerollHex(slot), true);
      assert.equal(b.rerollHex(slot), true);
      assert.deepEqual(a.state.hexChoices.filter((_, index) => index !== slot), before.filter((_, index) => index !== slot));
      const replacement = a.state.hexChoices[slot].id;
      assert.equal(seen.has(replacement), false);
      assert.equal(a.state.hexes.includes(replacement), false);
      seen.add(replacement);
      assert.equal(a.chooseHex(before[slot].id), false);
      const rerolled = structuredClone(a.state);
      assert.equal(a.rerollHex(slot), false);
      assert.deepEqual(a.state, rerolled);
      assert.deepEqual(a.state.hexChoices, b.state.hexChoices);
    }
    assert.equal(seen.size, 6);
    assert.deepEqual(a.state.hexRerolls, [true, true, true]);
    const choice = a.state.hexChoices[a.state.hexRound].id;
    assert.equal(a.chooseHex(choice), true);
    assert.equal(b.chooseHex(choice), true);
    assert.equal(a.chooseHex(choice), false);
    assert.deepEqual(a.state.hexes, b.state.hexes);
    assert.deepEqual(a.state.hexSchedule, schedule);
  }
  assert.equal(a.state.hexRound, 3);
  assert.equal(new Set(a.state.hexes).size, 3);
});

test('unequipped CUDA and duck stop new attacks, while existing duck projectiles can keep flying', () => {
  for (const id of ['cuda', 'duck'] as const) {
    for (const evolved of [false, true]) {
      const engine = new GameEngine(17, undefined, id);
      engine.start();
      const s = engine.state;
      const active = weapon(engine, id);
      active.level = evolved ? 5 : 1;
      active.evolved = evolved;
      const target = s.enemies[0];
      target.x = s.player.x + (id === 'cuda' ? 50 : 180);
      target.y = s.player.y;
      target.hp = target.maxHp = 10000;
      target.speed = target.spawnGrace = 0;
      s.enemies = [target];
      engine.advance(FIXED_STEP);
      assert.ok(active.nextFireTime > s.time);
      if (id === 'cuda') assert.ok(target.hp < target.maxHp);
      else assert.ok(s.projectiles.some((shot) => shot.weapon === 'duck'));
      weapon(engine, 'gpu').level = 1;
      weapon(engine, 'gpu').nextFireTime = RUN_DURATION + 1;
      assert.equal(engine.openInventory(), true);
      assert.equal(engine.equipWeapon('gpu', 0), true);
      engine.closeInventory();
      active.nextFireTime = s.time; // Make an unequipped attack due on the next tick.
      const due = active.nextFireTime;
      const hp = target.hp;
      const shots = structuredClone(s.projectiles);
      engine.advance(FIXED_STEP);
      if (id === 'duck') assert.ok(s.projectiles.some((shot) => shots.some((old) => old.id === shot.id && (old.x !== shot.x || old.y !== shot.y))));
      simulate(engine, 0.5);
      assert.equal(active.nextFireTime, due);
      assert.ok(s.projectiles.every((shot) => shots.some((old) => old.id === shot.id)));
      if (id === 'cuda') assert.equal(target.hp, hp);
    }
  }
});

test('summon selection pauses without spending energy and confirms exactly once', () => {
  const engine = new GameEngine(8);
  engine.start();
  engine.state.energy = 99;
  assert.equal(engine.requestSummon(), false);
  engine.state.energy = 100;
  engine.state.player.hp = 50;
  assert.equal(engine.summon('patch'), false);
  assert.equal(engine.requestSummon(), true);
  const pending = structuredClone(engine.state);
  simulate(engine, 5);
  assert.deepEqual(engine.state, pending);
  assert.equal(engine.state.energy, 100);
  engine.cancelSummon();
  assert.equal(engine.state.status, 'playing');
  assert.equal(engine.state.energy, 100);
  assert.equal(engine.state.summons, 0);
  const enemies = engine.state.enemies.length;
  assert.equal(engine.requestSummon(), true);
  assert.equal(engine.summon('patch'), true);
  assert.equal(engine.state.kills, enemies);
  assert.equal(engine.state.enemies.length, 0);
  assert.equal(engine.state.player.hp, 65);
  assert.equal(engine.state.summons, 1);
  assert.equal(engine.state.status, 'playing');
  assert.equal(engine.openInventory(), false);
  assert.equal(engine.summon('patch'), false);
  engine.state.energy = 100;
  engine.requestSummon();
  assert.equal(engine.summon('clock'), true);
  assert.deepEqual(engine.state.summonHistory, ['patch', 'clock']);
  assert.equal(engine.state.effects.freeze, 4.5);
});

test('damage has an invulnerability window; zero health ends the run', () => {
  const engine = new GameEngine(9);
  engine.start();
  engine.state.enemies[0].x = engine.state.player.x;
  engine.state.enemies[0].y = engine.state.player.y;
  engine.state.enemies[0].hp = 9999;
  engine.state.enemies[0].spawnGrace = 0;
  engine.advance(FIXED_STEP);
  assert.equal(engine.state.player.hp, 88);
  engine.advance(FIXED_STEP);
  assert.equal(engine.state.player.hp, 88);
  engine.state.player.hp = 0;
  engine.advance(FIXED_STEP);
  assert.equal(engine.state.status, 'defeat');
  assert.equal(engine.state.defeatReason, 'health');
  assert.equal(engine.state.report?.victory, false);
  assert.equal(engine.enterEndless(), false);
  const state = structuredClone(engine.state);
  simulate(engine, 2);
  assert.deepEqual(engine.state, state);
});

test('180 seconds without a Boss kill is timeout defeat, and restart resets the run', () => {
  const engine = new GameEngine(9);
  engine.start();
  engine.state.time = RUN_DURATION - FIXED_STEP;
  engine.advance(FIXED_STEP);
  assert.equal(engine.state.status, 'defeat');
  assert.equal(engine.state.defeatReason, 'timeout');
  assert.equal(engine.state.bossDefeated, false);
  assert.equal(engine.state.report?.victory, false);
  assert.equal(engine.state.time, RUN_DURATION);
  assert.equal(engine.requestSummon(), false);
  assert.equal(engine.enterEndless(), false);
  engine.restart();
  const fresh = new GameEngine(9);
  fresh.start();
  assert.deepEqual(engine.state, fresh.state);
});

test('only a Boss kill grants victory after a frozen 0.4s finish, then endless crosses 180 seconds', () => {
  const engine = new GameEngine(9);
  engine.start();
  const boss = isolateBoss(engine);
  assert.equal(engine.enterEndless(), false);
  boss.hp = 1;
  engine.state.energy = 100;
  assert.equal(engine.requestSummon(), true);
  assert.equal(engine.summon('patch'), true);
  assert.equal(engine.state.bossDefeated, true);
  assert.equal(engine.state.status, 'finishing');
  assert.equal(engine.state.blackFlash, 0.4);
  assert.equal(engine.state.report?.victory, true);
  assert.equal(engine.enterEndless(), false);
  const finishing = structuredClone(engine.state);
  simulate(engine, 0.4 - FIXED_STEP);
  assert.equal(engine.state.status, 'finishing');
  assert.deepEqual({ ...engine.state, blackFlash: finishing.blackFlash }, finishing);
  engine.advance(FIXED_STEP);
  assert.equal(engine.state.status, 'victory');
  const victory = structuredClone(engine.state);
  simulate(engine, 1);
  assert.deepEqual(engine.state, victory);
  assert.equal(engine.enterEndless(), true);
  assert.equal(engine.state.endless, true);
  assert.equal(engine.state.player.hp, engine.state.player.maxHp);
  assert.equal(engine.state.status, 'playing');
  assert.equal(engine.enterEndless(), false);
  engine.state.time = RUN_DURATION - FIXED_STEP;
  simulate(engine, FIXED_STEP * 3);
  assert.ok(engine.state.time > RUN_DURATION);
  assert.equal(engine.state.status, 'playing');
  assert.equal(engine.state.story.event, 'endless');
  assert.deepEqual(engine.state.report, victory.report);
});

test('Aegis blocks damage and clears ordinary enemies but never directly kills the Boss; reckless removes it', () => {
  const reckless = HEXTECH.find((card) => card.id === 'reckless');
  assert.ok(reckless);
  for (const abandonShield of [false, true]) {
    const engine = new GameEngine(9);
    engine.start();
    const s = engine.state;
    const ordinary = s.enemies[1];
    const boss = isolateBoss(engine);
    boss.x = s.player.x + 40;
    ordinary.x = s.player.x + 30;
    ordinary.y = s.player.y;
    ordinary.spawnGrace = 0;
    s.enemies.push(ordinary);
    s.energy = 100;
    assert.equal(engine.requestSummon(), true);
    assert.equal(engine.summon('aegis'), true);
    assert.equal(s.effects.wall, 7);
    if (abandonShield) {
      s.status = 'hex';
      s.hexChoices = [reckless];
      assert.equal(engine.chooseHex(reckless.id), true);
      assert.equal(s.effects.wall, 0);
      s.energy = 100;
      assert.equal(engine.requestSummon(), true);
      assert.equal(engine.summon('aegis'), true);
      assert.equal(s.effects.wall, 0);
    }
    engine.advance(FIXED_STEP);
    assert.equal(boss.hp, boss.maxHp);
    assert.equal(s.bossDefeated, false);
    assert.equal(s.status, 'playing');
    if (abandonShield) {
      assert.ok(s.player.hp < s.player.maxHp);
      assert.ok(ordinary.hp > 0);
    } else {
      assert.equal(s.player.hp, s.player.maxHp);
      assert.ok(ordinary.hp <= 0);
      assert.ok(s.effects.wall > 0);
    }
  }
});

test('clock freezes Boss movement, firing and cut timers but not the simulation clock', () => {
  for (const phase of [1, 2] as const) {
    const engine = new GameEngine(9);
    engine.start();
    const s = engine.state;
    const cutId = s.enemies[1].id;
    const boss = isolateBoss(engine);
    s.story.bossPhase = phase;
    if (phase === 2) boss.hp = boss.maxHp * 0.4;
    s.story.cuts = [
      { id: boss.id, x: s.player.x, y: s.player.y, angle: 0, length: WORLD_WIDTH, width: 18, delay: 0.5, life: 0.25, hit: false },
      { id: cutId, x: s.player.x, y: s.player.y, angle: 1, length: WORLD_HEIGHT, width: 18, delay: 0, life: 0.25, hit: true },
    ];
    s.energy = 100;
    assert.equal(engine.requestSummon(), true);
    assert.equal(engine.summon('clock'), true);
    const frozenBoss = structuredClone(boss);
    const frozenStory = structuredClone(s.story);
    const shots = structuredClone(s.enemyProjectiles);
    simulate(engine, 1);
    assert.ok(s.time > 0);
    assert.ok(s.effects.freeze > 0 && s.effects.freeze < 4.5);
    assert.deepEqual(boss, frozenBoss);
    assert.deepEqual(s.story, frozenStory);
    assert.deepEqual(s.enemyProjectiles, shots);
    s.effects.freeze = 0;
    engine.advance(FIXED_STEP);
    assert.ok(boss.x < frozenBoss.x);
    const timer = phase === 1 ? 'bossShotTimer' : 'bossCutTimer';
    assert.ok(s.story[timer] < frozenStory[timer]);
    assert.ok(s.story.cuts[0].delay < frozenStory.cuts[0].delay);
    assert.ok(s.story.cuts[1].life < frozenStory.cuts[1].life);
  }
});

test('clock does not postpone a scheduled story event', () => {
  const engine = new GameEngine(9);
  engine.start();
  const event = STORY_EVENTS.find((item) => item.id === 'blackout-105');
  assert.ok(event);
  engine.state.story = { ...initialStory(), fired: STORY_EVENTS.filter((item) => item.at < event.at).map((item) => item.id) };
  engine.state.hexRound = HEX_TIMES.length;
  engine.state.time = event.at - FIXED_STEP;
  engine.state.energy = 100;
  assert.equal(engine.requestSummon(), true);
  assert.equal(engine.summon('clock'), true);
  engine.advance(FIXED_STEP);
  assert.ok(Math.abs(engine.state.time - event.at) < 1e-8);
  assert.ok(engine.state.effects.freeze > 0);
  assert.ok(engine.state.story.fired.includes(event.id));
  assert.equal(engine.state.story.event, 'blackout');
});

test('enemies never spawn directly on a player at the world boundary', () => {
  for (let seed = 0; seed < 100; seed++) {
    const engine = new GameEngine(seed);
    engine.state.player.x = 38;
    engine.state.player.y = 38;
    engine.start();
    for (const enemy of engine.state.enemies) {
      assert.ok(Math.hypot(enemy.x - 38, enemy.y - 38) > engine.state.player.radius + enemy.radius);
      assert.ok(enemy.spawnGrace > 0);
    }
  }
});

test('a full run stays finite with bounded combat entities and settles according to the Boss outcome', () => {
  const engine = new GameEngine(2026);
  engine.start();
  engine.state.player.hp = 10000;
  engine.state.player.maxHp = 10000;
  for (let tick = 0; tick < Math.ceil((RUN_DURATION + 0.5) / FIXED_STEP); tick++) {
    if (engine.state.status === 'hex') engine.chooseHex(engine.state.hexChoices[0].id);
    const s = engine.state;
    const target = s.crystals[0] ?? { x: WORLD_WIDTH / 2 + Math.cos(s.time / 8) * 250, y: WORLD_HEIGHT / 2 + Math.sin(s.time / 8) * 200 };
    const dx = target.x - s.player.x;
    const dy = target.y - s.player.y;
    const d = Math.hypot(dx, dy) || 1;
    engine.setMovement(dx / d, dy / d);
    if (s.energy >= 100 && engine.requestSummon()) engine.summon('patch');
    engine.advance(FIXED_STEP);
    assert.ok(Number.isFinite(s.player.x) && Number.isFinite(s.player.y));
    // Story-controlled Boss, guards and ring members are not ordinary spawn-budget entities.
    assert.ok(s.enemies.filter((enemy) => enemy.kind !== 'boss' && enemy.kind !== 'guard' && !enemy.ringMember).length <= 140);
    assert.ok(s.enemies.every((enemy) => [enemy.x, enemy.y, enemy.hp].every(Number.isFinite)));
    assert.ok(s.crystals.length <= 180 && s.particles.length <= 180 && s.projectiles.length <= MAX_PROJECTILES);
    assert.ok(s.enemyProjectiles.length <= 100 && s.weaponDrops.length <= 12);
  }
  assert.equal(engine.state.status, engine.state.bossDefeated ? 'victory' : 'defeat');
  assert.equal(engine.state.report?.victory, engine.state.bossDefeated);
  if (!engine.state.bossDefeated) assert.equal(engine.state.defeatReason, 'timeout');
  assert.ok(engine.state.level > 1);
  assert.ok(engine.state.summons > 0);
});
