// apply-item-evolutions.mjs — Reporte data/item_evolutions.json dans le catalogue d'objets :
//  - ajoute les objets d'évolution absents (poche « misc », catégorie Évolution, image officielle) ;
//  - écrit sur chaque objet concerné la ligne « Évolution : Onix → Steelix… » (remplacée à chaque passage),
//    y compris sur les objets tenus (Peau Métal) et les sucreries, qui gardent leur premier usage.
// Usage : node tools/fetch-item-evolutions.mjs && node tools/apply-item-evolutions.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const items = read('items.json');
const { evolutions, items: missing } = read('item_evolutions.json');
const dexRaw = read('pokedex.json');
const nameOf = Object.fromEntries((Array.isArray(dexRaw) ? dexRaw : Object.values(dexRaw)).map(p => [p.id, p.name]));
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/';

let added = 0;
for (const [slug, { name_fr, cost }] of Object.entries(missing)) {
    if (items[slug]) continue;
    items[slug] = {
        id: null, name_fr, cost: Math.max(cost, 2000), sprite: `${SPRITES}${slug}.png`,
        category: 'Évolution', pocket: 'misc', attributes: [], effect_fr: '', description_fr: '',
    };
    added++;
}

// Une ligne par objet : toutes les évolutions qu'il déclenche
const byItem = {};
for (const [from, list] of Object.entries(evolutions)) {
    for (const { targetId, item } of list) (byItem[item] = byItem[item] || []).push(`${nameOf[from]} → ${nameOf[targetId]}`);
}
const MARK = ' Évolution : ';
let described = 0;
for (const [slug, lines] of Object.entries(byItem)) {
    const it = items[slug];
    if (!it) continue;
    // Objet d'évolution : la liste complète remplace l'ancien texte ; un objet qui a un autre usage
    // (objet tenu, sucrerie = matériau d'entraînement) le garde, sans l'ancienne phrase sur l'évolution
    const previous = (it.effect_fr || '').split(MARK)[0].replace(/^Évolution : .*$/, '').trim();
    const base = it.category === 'Évolution' && !/^Matériau/.test(previous) ? '' : previous.replace(/\s*Sert aussi à faire évoluer[^.]*\./, '');
    const evo = `Évolution : ${[...new Set(lines)].join(', ')}.`;
    it.effect_fr = base ? `${base}${MARK}${evo.slice('Évolution : '.length)}` : evo;
    described++;
}

const text = JSON.stringify(items, null, 2).replace(/\[\n\s+([^\[\]{}]*?)\n\s+\]/g, (_, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`);
writeFileSync(new URL('../data/items.json', import.meta.url), text + '\n');
console.log(`${added} objets ajoutés, ${described} objets avec leur ligne d'évolution.`);
