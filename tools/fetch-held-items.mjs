// Récupère depuis PokeAPI les objets tenus utiles au combat (nom FR, effet officiel, sprite).
// Usage : node tools/fetch-held-items.mjs [sortie.json]
// Sortie par défaut : held_items_raw.json dans le dossier courant (données brutes, non versionnées).
import { writeFile } from 'node:fs/promises';

const API = 'https://pokeapi.co/api/v2';
const CATEGORIES = [
    'held-items', 'choice', 'type-enhancement', 'plates', 'jewels', 'bad-held-items',
    'in-a-pinch', 'picky-healing', 'type-protection', 'medicine', 'other', 'effort-drop',
    'species-specific', 'effort-training', 'training', 'scarves', 'memories', 'z-crystals', 'mega-stones',
];
// Objets tenus rangés dans d'autres catégories PokeAPI
const EXTRA = ['berry-juice'];
const SPRITE = slug => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;

async function getJson(url, tries = 3) {
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(url);
            if (r.ok) return r.json();
        } catch { /* nouvel essai */ }
        await new Promise(res => setTimeout(res, 500 * (i + 1)));
    }
    throw new Error(`Échec : ${url}`);
}

async function pool(list, n, fn) {
    const out = [];
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => {
        while (i < list.length) { const k = i++; out[k] = await fn(list[k]); }
    }));
    return out;
}

const pick = (arr, lang, key) => (arr || []).find(x => x.language?.name === lang)?.[key];

const out = [];
const groups = CATEGORIES.map(cat => ({ cat, refs: null }));
groups.push({ cat: 'extra', refs: EXTRA.map(slug => ({ url: `${API}/item/${slug}` })) });
for (const { cat, refs } of groups) {
    const list = refs || (await getJson(`${API}/item-category/${cat}`)).items;
    const items = await pool(list, 8, async ref => {
        const it = await getJson(ref.url);
        const flavorFr = (it.flavor_text_entries || []).filter(f => f.language.name === 'fr').pop()?.text;
        return {
            slug: it.name,
            category_api: cat,
            name_fr: pick(it.names, 'fr', 'name') || null,
            name_en: pick(it.names, 'en', 'name') || it.name,
            cost: it.cost,
            fling_power: it.fling_power,
            attributes: (it.attributes || []).map(a => a.name),
            effect_en: pick(it.effect_entries, 'en', 'short_effect') || null,
            flavor_fr: flavorFr ? flavorFr.replace(/\s+/g, ' ').trim() : null,
            sprite: SPRITE(it.name),
        };
    });
    out.push(...items);
    console.log(`${cat} : ${items.length}`);
}

const dest = process.argv[2] || 'held_items_raw.json';
await writeFile(dest, JSON.stringify(out, null, 2));
console.log(`${out.length} objets -> ${dest}`);
