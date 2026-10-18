// Reporte la refonte validée (data/moves_db.json, tools/propose-moves.mjs) dans les données du jeu :
// chaque capacité reçoit `rw` (spec exécutée par js/move-rework.js), sa description en jeu
// (description_game) et celle de sa version Z (description_z). Le reste des champs est gardé.
// Les formes de zone sont écrites dans data/move_shapes.json.
// Rejouable. Usage : node tools/propose-moves.mjs && node tools/apply-rework.mjs
import fs from 'fs';

const db = JSON.parse(fs.readFileSync('data/moves_db.json', 'utf8'));
const byKey = Object.fromEntries(db.moves.map(m => [m.key, m]));
const FILES = ['data/physical_moves.json', 'data/special_moves.json', 'data/status_moves.json'];
let count = 0;
for (const file of FILES) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [key, move] of Object.entries(data)) {
        const row = byKey[key];
        if (!row) continue;
        const p = row.proposal;
        move.rw = { ...p.rw, label: p.kind, triggerLabel: p.trigger || null };
        move.description_game = p.standard;
        move.description_z = p.z;
        move.zone_label = p.target;
        count++;
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 1));
}
fs.writeFileSync('data/move_shapes.json', JSON.stringify(db.shapes, null, 1));
console.log(`${count} capacités mises à jour, ${Object.keys(db.shapes).length} formes de zone.`);
