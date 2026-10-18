// apply-held-items.mjs — Ajoute au catalogue les objets tenus et baies de la proposition validée.
//
// Entrée : data/held_items_proposal.json (voir tools/fetch-held-items.mjs)
// Sortie : data/items.json — poche « battle » (objets tenus) ou « berries » (baies),
//          prix, image officielle, effet en jeu (valeur au niveau 1), restriction d'espèce.
// Les effets eux-mêmes sont programmés dans js/held-items.js (même identifiants).
// Usage : node tools/apply-held-items.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const items = read('items.json');
const proposal = read('held_items_proposal.json');
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR');

let added = 0, updated = 0;
for (const p of proposal) {
    if (!p.keep || p.group) continue;
    const isBerry = p.category === 'baie';
    const value = typeof p.base_value === 'number' ? fmt(p.base_value) : '';
    const effect = (p.game_effect_fr || '').replace(/\{v\}/g, value);
    const entry = {
        ...(items[p.slug] || {}),
        id: items[p.slug]?.id ?? 20000 + added,
        name_fr: p.name_fr,
        cost: p.price_suggestion || 1000,
        sprite: p.sprite,
        category: isBerry ? 'Baies' : 'Objets tenus',
        pocket: isBerry ? 'berries' : 'battle',
        attributes: ['holdable'],
        effect_fr: `${effect}${typeof p.cap === 'number' && value ? ` Amélioration à l'Atelier : jusqu'à ${fmt(p.cap)}.` : ''}`,
        description_fr: p.official_effect_fr || '',
    };
    if (Array.isArray(p.species_only) && p.species_only.length) entry.species_only = p.species_only.map(s => s.id);
    if (p.exclusive_group) entry.exclusive_group = p.exclusive_group;
    entry.family = isBerry ? 'baie' : p.category; // famille pour le tri en boutique et dans le sac
    if (p.unique) entry.unique = true;
    if (items[p.slug]) updated++; else added++;
    items[p.slug] = entry;
}

const text = JSON.stringify(items, null, 2).replace(/\[\n\s+([^\[\]{}]*?)\n\s+\]/g, (_, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`);
writeFileSync(new URL('../data/items.json', import.meta.url), text + '\n');
console.log(`${added} objets ajoutés, ${updated} mis à jour.`);
