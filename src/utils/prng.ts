import type { AllyId, DifficultyId, HexId, RunChallenge, RunReport, WeaponId } from '../types/game.ts';

const WEAPON_IDS: WeaponId[] = ['gpu', 'spatula', 'cuda', 'pulse', 'duck'];
const HEX_IDS: HexId[] = ['echo', 'chrono', 'chair', 'hoard', 'armor', 'parry', 'reckless', 'vampire', 'overwork', 'wide', 'network'];
const ALLY_IDS: AllyId[] = ['patch', 'ember', 'aegis', 'clock'];
const DIFFICULTY_IDS: DifficultyId[] = ['casual', 'standard', 'hard', 'nightmare'];

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export function encodeChallenge(report: RunReport): string {
  const payload: unknown[] = [
    report.seed, WEAPON_IDS.indexOf(report.initialWeapon), report.kills, report.level, Math.round(report.time * 1000),
    report.weapons.map((weapon) => [WEAPON_IDS.indexOf(weapon.id), weapon.level, Number(weapon.evolved)]),
    report.equipped.map((id) => id === null ? -1 : WEAPON_IDS.indexOf(id)),
    report.hexes.map((id) => HEX_IDS.indexOf(id)),
    report.summonHistory.slice(-128).map((id) => ALLY_IDS.indexOf(id)),
  ];
  const hasDungeon = report.dungeonBranch !== undefined || report.floorsCleared !== undefined || report.highestFloor !== undefined || report.endless !== undefined;
  const hasDifficulty = report.difficulty !== undefined;
  if (hasDungeon || hasDifficulty) payload.push(
    report.dungeonBranch === 'cryo' ? 0 : report.dungeonBranch === 'darknet' ? 1 : -1,
    report.floorsCleared ?? (report.victory ? 3 : 0),
    report.highestFloor ?? (report.victory ? 3 : 1),
    Number(report.endless ?? false),
  );
  if (hasDifficulty) payload.push(DIFFICULTY_IDS.indexOf(report.difficulty!));
  return `#run=${hasDifficulty ? 'v4' : hasDungeon ? 'v3' : 'v2'}_${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

export function decodeChallenge(hash: unknown): RunChallenge | null {
  if (typeof hash !== 'string' || hash.length > 4096 || !/^#run=v[234]_[A-Za-z0-9_-]+$/.test(hash)) return null;
  try {
    const version = hash.startsWith('#run=v4_') ? 4 : hash.startsWith('#run=v3_') ? 3 : 2;
    const encoded = hash.slice(8).replace(/-/g, '+').replace(/_/g, '/');
    const data: unknown = JSON.parse(atob(encoded));
    if (!Array.isArray(data) || data.length !== (version === 4 ? 14 : version === 3 ? 13 : 9)) return null;
    const [seed, initial, kills, level, milliseconds, weapons, equipped, hexes, summons] = data as unknown[];
    const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
    if (!integer(seed, 0, 0xffffffff) || !integer(initial, 0, 4) || !integer(kills, 0, 10_000_000) || !integer(level, 1, 1_000_000) || !integer(milliseconds, 0, 86_400_000)) return null;
    if (!Array.isArray(weapons) || weapons.length < 1 || weapons.length > 5) return null;
    const parsedWeapons: RunReport['weapons'] = [];
    for (const weapon of weapons) {
      if (!Array.isArray(weapon) || weapon.length !== 3 || !integer(weapon[0], 0, 4) || !integer(weapon[1], 1, 5) || !integer(weapon[2], 0, 1) || (weapon[2] === 1 && weapon[1] !== 5)) return null;
      const id = WEAPON_IDS[weapon[0]];
      if (parsedWeapons.some((item) => item.id === id)) return null;
      parsedWeapons.push({ id, level: weapon[1], evolved: weapon[2] === 1 });
    }
    if (!parsedWeapons.some((weapon) => weapon.id === WEAPON_IDS[initial])) return null;
    if (!Array.isArray(equipped) || equipped.length !== 3 || !equipped.every((id: unknown) => integer(id, -1, 4))) return null;
    const equippedIndices = equipped as number[];
    const active = equippedIndices.filter((id) => id >= 0);
    if (active.length === 0 || new Set(active).size !== active.length || !active.every((id) => parsedWeapons.some((weapon) => weapon.id === WEAPON_IDS[id]))) return null;
    if (!Array.isArray(hexes) || hexes.length > 3 || !hexes.every((id: unknown) => integer(id, 0, 10)) || new Set(hexes).size !== hexes.length) return null;
    if (!Array.isArray(summons) || summons.length > 128 || !summons.every((id: unknown) => integer(id, 0, 3))) return null;
    const [branchIndex, floorsCleared, highestFloor, endless] = data.slice(9) as unknown[];
    if (version >= 3 && (!integer(branchIndex, -1, 1) || !integer(floorsCleared, 0, 1_000_000) || !integer(highestFloor, 1, 1_000_000) || floorsCleared > highestFloor || !integer(endless, 0, 1))) return null;
    const difficultyIndex: unknown = data[13];
    if (version === 4 && !integer(difficultyIndex, 0, 3)) return null;
    return {
      version, seed, initialWeapon: WEAPON_IDS[initial],
      ...(version === 4 ? { difficulty: DIFFICULTY_IDS[difficultyIndex as number] } : {}),
      ...(version >= 3 ? { dungeonBranch: branchIndex === 0 ? 'cryo' as const : branchIndex === 1 ? 'darknet' as const : null } : {}),
      target: { kills, level, time: milliseconds / 1000, weapons: parsedWeapons,
        equipped: equippedIndices.map((id) => id < 0 ? null : WEAPON_IDS[id]),
        hexes: (hexes as number[]).map((id) => HEX_IDS[id]), summonHistory: (summons as number[]).map((id) => ALLY_IDS[id]),
        ...(version >= 3 ? { floorsCleared: floorsCleared as number, highestFloor: highestFloor as number, endless: endless === 1 } : {}),
      },
    };
  } catch {
    return null;
  }
}

export function challengeLink(report: RunReport, base: string): string {
  const url = new URL(base);
  url.search = '';
  url.hash = encodeChallenge(report);
  return url.href;
}
