// fetch-item-evolutions.mjs — Évolutions officielles qui passent par un objet (pierre, objet tenu à l'échange,
// sucrerie, armure…), depuis PokeAPI. Le Pokédex du jeu ne garde qu'une évolution par espèce et a changé
// les échanges en « niveau 36 » : ces évolutions par objet s'ajoutent en option (js/gamedata.js).
//
// Sortie : data/item_evolutions.json — { evolutions: { "<id>": [{ targetId, item }] }, items: { slug: { name_fr, cost } } }
//          (items : objets requis absents du catalogue, ajoutés par tools/apply-item-evolutions.mjs)
// Usage : node tools/fetch-item-evolutions.mjs && node tools/apply-item-evolutions.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const API = 'https://pokeapi.co/api/v2/';
// Formes régionales seulement (Ramoloss de Galar) : sans objet dans le jeu
const SKIP_ITEMS = new Set(['galarica-cuff', 'galarica-wreath']);

const get = async (url) => {
    for (let i = 0; i < 4; i++) {
        try { const r = await fetch(url); if (r.ok) return r.json(); } catch { /* nouvel essai */ }
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
    throw new Error(`PokeAPI injoignable : ${url}`);
};
const idOf = url => +url.split('/').filter(Boolean).pop();
const items = read('items.json');
const dexRaw = read('pokedex.json');
const dex = new Set((Array.isArray(dexRaw) ? dexRaw : Object.values(dexRaw)).map(p => p.id));

const evolutions = {};
const add = (from, to, item) => {
    if (!dex.has(from) || !dex.has(to) || SKIP_ITEMS.has(item)) return;
    const list = evolutions[from] = evolutions[from] || [];
    if (!list.some(e => e.targetId === to && e.item === item)) list.push({ targetId: to, item });
};
const walk = node => {
    const from = idOf(node.species.url);
    for (const next of node.evolves_to) {
        for (const d of next.evolution_details) {
            const item = d.item?.name || d.held_item?.name;
            if (item) add(from, idOf(next.species.url), item);
        }
        walk(next);
    }
};
const chains = (await get(API + 'evolution-chain/?limit=2000')).results.map(r => r.url);
for (let i = 0; i < chains.length; i += 20) (await Promise.all(chains.slice(i, i + 20).map(get))).forEach(c => walk(c.chain));

const needed = new Set(Object.values(evolutions).flat().map(e => e.item));
const missing = {};
for (const slug of [...needed].filter(s => !items[s]).sort()) {
    const it = await get(API + 'item/' + slug);
    missing[slug] = { name_fr: it.names.find(n => n.language.name === 'fr')?.name || slug, cost: it.cost || 1000 };
}
const sorted = Object.fromEntries(Object.entries(evolutions).sort((a, b) => a[0] - b[0]));
writeFileSync(new URL('../data/item_evolutions.json', import.meta.url), JSON.stringify({ evolutions: sorted, items: missing }, null, 1) + '\n');
console.log(`${Object.keys(sorted).length} espèces, ${Object.values(sorted).flat().length} évolutions par objet ; objets à ajouter : ${Object.keys(missing).join(', ') || 'aucun'}`);
