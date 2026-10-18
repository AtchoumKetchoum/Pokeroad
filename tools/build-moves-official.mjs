// Extrait les données officielles des capacités (série principale) depuis les CSV de PokeAPI
// (https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv) vers data/moves_official.json.
// C'est la colonne « avant » de la base de refonte (tools/propose-moves.mjs).
// Usage : node tools/build-moves-official.mjs <dossier des CSV>
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
if (!dir) { console.error('Usage : node tools/build-moves-official.mjs <dossier des CSV PokeAPI>'); process.exit(1); }

// Lecteur CSV (guillemets, virgules et retours à la ligne dans les champs)
function readCsv(name) {
    const text = fs.readFileSync(path.join(dir, `${name}.csv`), 'utf8');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const [head, ...body] = rows;
    return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const num = v => (v === '' || v === undefined ? null : Number(v));
const byId = (rows, key = 'id') => Object.fromEntries(rows.map(r => [r[key], r]));

const FR = '5', EN = '9';
const categories = byId(readCsv('move_meta_categories'));
const ailments = byId(readCsv('move_meta_ailments'));
const targets = byId(readCsv('move_targets'));
const STAT = { 1: 'HP', 2: 'ATK', 3: 'DEF', 4: 'SPA', 5: 'SPD', 6: 'SPE', 7: 'PRE', 8: 'EVA' };
const DAMAGE_CLASS = { 1: 'status', 2: 'physical', 3: 'special' };

const meta = byId(readCsv('move_meta'), 'move_id');
const statChanges = {};
readCsv('move_meta_stat_changes').forEach(r => { (statChanges[r.move_id] = statChanges[r.move_id] || []).push([STAT[r.stat_id], Number(r.change)]); });

const prose = {};
readCsv('move_effect_prose').forEach(r => {
    const p = (prose[r.move_effect_id] = prose[r.move_effect_id] || {});
    if (r.local_language_id === FR) p.fr = r.short_effect;
    if (r.local_language_id === EN) p.en = r.short_effect;
});
const namesFr = {};
readCsv('move_names').forEach(r => { if (r.local_language_id === FR) namesFr[r.move_id] = r.name; });
// Texte de description français le plus récent
const flavorFr = {};
readCsv('move_flavor_text').forEach(r => {
    if (r.language_id !== FR) return;
    const prev = flavorFr[r.move_id];
    if (!prev || Number(r.version_group_id) > prev.vg) flavorFr[r.move_id] = { vg: Number(r.version_group_id), text: r.flavor_text.replace(/\s+/g, ' ').trim() };
});

const out = {};
readCsv('moves').forEach(m => {
    const mm = meta[m.id] || {};
    const effectChance = num(m.effect_chance);
    const p = prose[m.effect_id] || {};
    out[m.identifier] = {
        id: Number(m.id),
        name_fr: namesFr[m.id] || null,
        generation: num(m.generation_id),
        power: num(m.power),
        accuracy: num(m.accuracy),
        pp: num(m.pp),
        priority: num(m.priority),
        damage_class: DAMAGE_CLASS[m.damage_class_id] || null,
        target: targets[m.target_id]?.identifier || null,
        category: categories[mm.meta_category_id]?.identifier || null,
        ailment: ['none', 'unknown', undefined].includes(ailments[mm.meta_ailment_id]?.identifier) ? null : ailments[mm.meta_ailment_id].identifier,
        ailment_chance: num(mm.ailment_chance),
        flinch_chance: num(mm.flinch_chance),
        stat_chance: num(mm.stat_chance),
        stat_changes: statChanges[m.id] || [],
        drain: num(mm.drain),       // % des dégâts (négatif = contrecoup)
        healing: num(mm.healing),   // % des PV max
        crit_rate: num(mm.crit_rate),
        hits: mm.min_hits ? [num(mm.min_hits), num(mm.max_hits)] : null,
        turns: mm.min_turns ? [num(mm.min_turns), num(mm.max_turns)] : null,
        effect_chance: effectChance,
        effect_fr: p.fr ? p.fr.replace(/\$effect_chance/g, effectChance ?? '') : null,
        effect_en: p.en ? p.en.replace(/\$effect_chance/g, effectChance ?? '') : null,
        flavor_fr: flavorFr[m.id]?.text || null,
    };
});
fs.writeFileSync('data/moves_official.json', JSON.stringify(out, null, 1));
console.log(`${Object.keys(out).length} capacités officielles -> data/moves_official.json`);
