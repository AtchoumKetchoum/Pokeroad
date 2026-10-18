// Build data/ct_map.json (CT item -> move) and data/ct_compat.json (move -> species ids)
// from official machine data on PokeAPI.
//
// Usage: node tools/build-ct-data.mjs
//
// Raw PokeAPI responses are cached gzip-compressed under tools/.cache/ (pokemon
// responses are ~250 KB each, ~1350 of them), so re-runs are offline and fast.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const CACHE = path.join(ROOT, 'tools', '.cache');
const API = 'https://pokeapi.co/api/v2/';
const CONCURRENCY = 8;

fs.mkdirSync(CACHE, { recursive: true });

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

// ---------- HTTP with cache + concurrency limit ----------
let active = 0;
const queue = [];
function limit(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      active++;
      try { resolve(await fn()); } catch (e) { reject(e); }
      finally { active--; if (queue.length) queue.shift()(); }
    };
    if (active < CONCURRENCY) run(); else queue.push(run);
  });
}

function cachePath(url) {
  const rel = url.replace(API, '').replace(/\/+$/, '').replace(/[^a-z0-9._-]+/gi, '_');
  return path.join(CACHE, rel + '.json.gz');
}

async function get(url) {
  if (!url.startsWith('http')) url = API + url;
  const file = cachePath(url);
  if (fs.existsSync(file)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  return limit(async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        fs.writeFileSync(file, zlib.gzipSync(text));
        return JSON.parse(text);
      } catch (e) {
        if (attempt >= 4) throw new Error(`${url}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  });
}

// ---------- Local data ----------
const items = readJson('items.json');
const moveDb = { ...readJson('physical_moves.json'), ...readJson('special_moves.json'), ...readJson('status_moves.json') };
const pokedex = readJson('pokedex.json');
const speciesIds = new Set(pokedex.map((p) => p.id));

const ctIds = Object.keys(items).filter((k) => items[k].pocket === 'ct');
const kindOrder = { tm: 0, hm: 1, tr: 2 };
const parseId = (id) => ({ kind: id.slice(0, 2), num: parseInt(id.slice(2), 10) });
ctIds.sort((a, b) => {
  const A = parseId(a), B = parseId(b);
  return kindOrder[A.kind] - kindOrder[B.kind] || A.num - B.num;
});

// Version-group preference per machine family (first = primary, rest = fallbacks).
const PREF = {
  tm: ['scarlet-violet', 'the-indigo-disk', 'legends-za', 'sword-shield', 'brilliant-diamond-shining-pearl',
       'ultra-sun-ultra-moon', 'sun-moon', 'lets-go-pikachu-lets-go-eevee', 'omega-ruby-alpha-sapphire', 'x-y',
       'black-2-white-2', 'black-white', 'heartgold-soulsilver', 'platinum', 'diamond-pearl',
       'firered-leafgreen', 'emerald', 'ruby-sapphire', 'xd', 'colosseum', 'crystal', 'gold-silver',
       'yellow', 'red-blue', 'red-green-japan', 'blue-japan'],
  tm00: ['sword-shield'],
  tr: ['sword-shield'],
  hm: ['diamond-pearl', 'platinum', 'heartgold-soulsilver', 'brilliant-diamond-shining-pearl',
       'black-2-white-2', 'black-white', 'omega-ruby-alpha-sapphire', 'x-y', 'firered-leafgreen', 'emerald',
       'ruby-sapphire', 'crystal', 'gold-silver', 'yellow', 'red-blue'],
};

// PokeAPI item names are tm01..tm99, tm100..tm229 (all gens share one item); tm001 is a defensive fallback.
function apiItemNames(id) {
  const { kind, num } = parseId(id);
  const names = [id];
  if (kind === 'tm' && num < 100) names.push('tm' + String(num).padStart(3, '0'));
  return names;
}

async function mapCt(id) {
  const { kind, num } = parseId(id);
  const pref = kind === 'tm' && num === 0 ? PREF.tm00 : PREF[kind];
  let item = null;
  for (const n of apiItemNames(id)) { item = await get('item/' + n); if (item) break; }
  if (!item) return { id, error: 'item not found on PokeAPI' };
  const byVg = new Map(item.machines.map((m) => [m.version_group.name, m.machine.url]));
  const tried = [];
  for (const vg of pref) {
    if (!byVg.has(vg)) continue;
    const machine = await get(byVg.get(vg));
    const slug = machine.move.name;
    if (moveDb[slug]) return { id, move: slug, name_fr: moveDb[slug].name_fr, source: vg };
    tried.push(`${vg}:${slug}`);
  }
  return { id, error: tried.length ? 'moves not in DB: ' + tried.join(', ') : 'no machine in preferred version groups', available: [...byVg.keys()] };
}

// ---------- Step 1: CT map ----------
console.log(`Mapping ${ctIds.length} CT items...`);
const results = await Promise.all(ctIds.map(mapCt));
const ctMap = {};
const missing = [];
for (const r of results) {
  if (r.error) missing.push({ id: r.id, reason: r.error, ...(r.available ? { available: r.available } : {}) });
  else ctMap[r.id] = { move: r.move, name_fr: r.name_fr, source: r.source };
}
ctMap._missing = missing;
fs.writeFileSync(path.join(DATA, 'ct_map.json'), JSON.stringify(ctMap, null, 1) + '\n');
console.log(`ct_map: ${ctIds.length - missing.length} mapped, ${missing.length} missing`);

// ---------- Step 2: compat (species that learn each move by "machine" in any version group) ----------
const ctMoves = new Set(Object.values(ctMap).filter((v) => v && v.move).map((v) => v.move));
const list = await get('pokemon?limit=5000');
console.log(`Scanning ${list.results.length} pokemon entries for machine learnsets...`);
const compat = Object.fromEntries([...ctMoves].sort().map((m) => [m, new Set()]));
let done = 0;
await Promise.all(list.results.map(async ({ url }) => {
  const p = await get(url);
  if (++done % 200 === 0) console.log(`  ${done}/${list.results.length}`);
  if (!p) return;
  const sid = parseInt(p.species.url.match(/\/(\d+)\/?$/)[1], 10); // forms -> base species
  if (!speciesIds.has(sid)) return;
  for (const m of p.moves) {
    if (!compat[m.move.name]) continue;
    if (m.version_group_details.some((d) => d.move_learn_method.name === 'machine')) compat[m.move.name].add(sid);
  }
}));
const compatOut = Object.fromEntries(Object.entries(compat).map(([m, s]) => [m, [...s].sort((a, b) => a - b)]));
fs.writeFileSync(path.join(DATA, 'ct_compat.json'), JSON.stringify(compatOut) + '\n');
const sizes = Object.values(compatOut).map((a) => a.length);
console.log(`ct_compat: ${sizes.length} moves, avg ${(sizes.reduce((a, b) => a + b, 0) / sizes.length).toFixed(1)} species/move, empty: ${Object.entries(compatOut).filter(([, a]) => !a.length).map(([m]) => m).join(', ') || 'none'}`);
