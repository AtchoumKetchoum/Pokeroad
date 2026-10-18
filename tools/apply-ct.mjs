// apply-ct.mjs — Rend chaque CT utile : attaque apprise, description, prix et icône.
//
// Entrées : data/ct_map.json (CT → attaque officielle, voir tools/build-ct-data.mjs),
//           data/*_moves.json (base de capacités du jeu), data/moves_official.json (puissance officielle).
// Sortie  : data/items.json (fiches des CT réécrites).
//
// Prix : selon le genre de la capacité refondue et sa puissance officielle.
//   attaque : 500 + 50 × puissance × précision, arrondi à 100 (Charge ≈ 2 500 $, Séisme ≈ 5 500 $)
//   tactique : 3 000 $ ; passif : 4 000 $ ; attaques à dégâts fixes ou K.O. direct : 6 000 $
// Usage : node tools/apply-ct.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = f => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const items = read('items.json');
const ctMap = read('ct_map.json');
const official = read('moves_official.json');
const moves = { ...read('status_moves.json'), ...read('special_moves.json'), ...read('physical_moves.json') };

const round100 = n => Math.round(n / 100) * 100;
const TYPE_FR = { normal: 'Normal', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', ice: 'Glace', fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte', rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée' };
function price(slug) {
    const m = moves[slug] || {};
    const kind = m.rw?.kind;
    if (kind === 'passive') return 4000;
    if (kind === 'tactic') return 3000;
    const off = official[slug] || {};
    const power = off.power || m.power || 0;
    if (!power) return 6000; // dégâts fixes, K.O. en un coup…
    const acc = (off.accuracy || 100) / 100;
    return Math.max(1500, round100(500 + 50 * power * acc));
}

let done = 0;
for (const [id, entry] of Object.entries(ctMap)) {
    if (id.startsWith('_') || !items[id]) continue;
    const m = moves[entry.move];
    if (!m) continue;
    const it = items[id];
    it.move = entry.move;
    it.move_type = m.type || 'normal';
    it.effect_fr = `Apprend ${m.name_fr} à un Pokémon compatible. Sert aussi à améliorer les capacités de type ${TYPE_FR[it.move_type] || it.move_type}.`;
    it.description_fr = m.description_game || m.description_fr || '';
    it.cost = price(entry.move);
    it.sprite = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/tm-${m.type || 'normal'}.png`;
    done++;
}

// Même mise en forme que le fichier d'origine : indentation de 2, petits tableaux sur une ligne
const text = JSON.stringify(items, null, 2).replace(/\[\n\s+([^\[\]{}]*?)\n\s+\]/g, (_, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`);
writeFileSync(new URL('../data/items.json', import.meta.url), text + '\n');
console.log(`${done} CT mises à jour.`);
