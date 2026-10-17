// Renseigne les effets secondaires des attaques offensives à partir de leur description française.
// Ex. "Peut aussi le brûler." -> effect: "STAT_BRU", effect_chance: 10
// Ne touche qu'aux attaques dont "effect" est vide. Rejouable sans risque.
// Usage : node tools/enrich-move-effects.mjs
import fs from 'fs';

const FILES = ['data/physical_moves.json', 'data/special_moves.json'];

const STATUS_PATTERNS = [
    [/peut[^.]*br[ûu]ler/i, 'STAT_BRU'],
    [/peut[^.]*paralys/i, 'STAT_PAR'],
    [/peut[^.]*empoisonn/i, 'STAT_PSN'],
    [/peut[^.]*endorm/i, 'STAT_SOM'],
    [/peut[^.]*(?:geler|gel)/i, 'STAT_GEL'],
    [/peut[^.]*confus/i, 'STAT_CONF'],
    [/peut[^.]*(?:apeur|effray)/i, 'STAT_FLINCH'],
];

// Ordre important : "Attaque Spéciale" avant "Attaque"
const STAT_NAMES = [
    [/attaque sp[ée]/i, 'SPA'], [/d[ée]fense sp[ée]/i, 'SPD'],
    [/attaque/i, 'ATK'], [/d[ée]fense/i, 'DEF'], [/vitesse/i, 'SPE'], [/pr[ée]cision/i, 'PRE'],
];

function statFrom(text) {
    const found = STAT_NAMES.find(([re]) => re.test(text));
    return found ? found[1] : null;
}

function inferEffect(move) {
    const d = move.description_fr || '';
    const chance = /souvent/i.test(d) ? 30 : (/peut aussi|peut l|peut [a-z]/i.test(d) ? 10 : 100);

    for (const [re, id] of STATUS_PATTERNS) {
        if (re.test(d)) return { effect: id, effect_chance: id === 'STAT_FLINCH' ? 20 : chance };
    }

    const lower = d.match(/peut[^.]*baisser? ([^.]*)/i);
    if (lower) {
        const stat = statFrom(lower[1]);
        if (stat) return { effect: stat === 'PRE' ? 'MOD_PRE' : 'MOD_STAT', effect_target_stat: stat, v_stat_count: -1, effect_chance: chance };
    }

    const raise = d.match(/peut[^.]*augmenter? ([^.]*) du lanceur/i);
    if (raise) {
        const stat = statFrom(raise[1]);
        if (stat && stat !== 'PRE') return { effect: 'MOD_STAT', effect_target_stat: stat, v_stat_count: 1, effect_chance: chance, effect_self: true };
    }
    return null;
}

let total = 0;
for (const file of FILES) {
    const raw = fs.readFileSync(file, 'utf8');
    const moves = JSON.parse(raw);
    let count = 0;
    for (const move of Object.values(moves)) {
        if (move.effect || !(move.power > 0)) continue;
        const inferred = inferEffect(move);
        if (!inferred) continue;
        Object.assign(move, inferred);
        count++;
    }
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(file, JSON.stringify(moves, null, 2).replace(/\n/g, eol) + eol);
    console.log(`${file} : ${count} effets ajoutés`);
    total += count;
}
console.log(`Total : ${total}`);
