// Base « avant / après » des capacités de PokéRoad et proposition de refonte.
//  - avant  : données officielles de la série (data/moves_official.json, tools/build-moves-official.mjs)
//  - actuel : ce que fait la capacité aujourd'hui dans PokéRoad (data/*_moves.json)
//  - après  : proposition adaptée au combat ATB en grille 3×3 (4 emplacements, passifs compris)
// Principe : on colle à l'effet officiel, on le traduit en mécaniques du jeu (jauge d'action,
// boucliers, soins, régénération) et on ajoute des soins / régénérations là où l'idée s'y prête.
// Les passifs occupent un emplacement, ne se lancent jamais et se déclenchent seuls ; un Pokémon
// qui n'a que des passifs ne joue pas. Chaque capacité a une version Z (jauge Z pleine).
// Sortie : data/moves_db.json. Usage : node tools/propose-moves.mjs
import fs from 'fs';
import { PASSIVE_OPS, TACTIC_OPS, ATTACK_POSITION_OPS, DIVE_MOVES, SNIPE_MOVES, FACE_MOVES, DELAYED_MOVES, Z_TYPE_OPS, Z_TYPE_SUPPORT_OPS, AILMENT_STATUS } from './rework-ops.mjs';

const FILES = { physical: 'data/physical_moves.json', special: 'data/special_moves.json', status: 'data/status_moves.json' };
const game = {};
for (const [cls, file] of Object.entries(FILES)) {
    for (const [key, m] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) game[key] = { ...m, _key: key, _file: cls };
}
const official = JSON.parse(fs.readFileSync('data/moves_official.json', 'utf8'));

// --- Qui apprend quoi : par niveau (pokedex.json) et par CT (items.json) ---
const pokedex = Object.values(JSON.parse(fs.readFileSync('data/pokedex.json', 'utf8')));
const learners = {};
pokedex.forEach(p => (p.moves || []).forEach(m => { (learners[m.name] = learners[m.name] || []).push(p.name); }));
const ctByName = {};
Object.values(JSON.parse(fs.readFileSync('data/items.json', 'utf8'))).filter(i => i.pocket === 'ct').forEach(i => {
    const m = /Apprend (.+?) à un Pokémon/.exec(i.effect_fr || '');
    if (m) ctByName[m[1].trim().toLowerCase()] = i.name_fr;
});

// ---------------------------------------------------------------------------
// Vocabulaire
// ---------------------------------------------------------------------------
const TYPE_FR = { normal: 'Normal', fire: 'Feu', water: 'Eau', electric: 'Électrik', grass: 'Plante', ice: 'Glace', fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte', rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée', shadow: 'Ombre' };
const AOE_FR = {
    single: 'une cible', splash_v: 'la cible et ses voisins de ligne', random_single: 'un ennemi au hasard',
    diagonal_x: 'la cible et ses diagonales (X)', line_of_2: 'la cible et celui derrière elle', row: 'une ligne entière',
    cross: 'la cible et ses 4 voisins (croix)', frontline: 'la ligne de front ennemie', all: 'tous les ennemis', column: 'une colonne entière',
    midline: 'la ligne du milieu', backline: 'la ligne arrière',
};
const AOE_UP = { single: 'cross', splash_v: 'row', random_single: 'all', diagonal_x: 'all', line_of_2: 'column', row: 'all', cross: 'all', frontline: 'all', column: 'all', all: 'all', midline: 'all', backline: 'all' };
const STAT_FR = { HP: 'PV', ATK: 'Attaque', DEF: 'Défense', SPA: 'Atq. Spé.', SPD: 'Déf. Spé.', SPE: 'Vitesse', PRE: 'Précision', EVA: 'Esquive' };
const AILMENT_FR = {
    paralysis: 'paralysie', sleep: 'sommeil', freeze: 'gel', burn: 'brûlure', poison: 'empoisonnement', confusion: 'confusion',
    infatuation: 'attraction (Attaque −1 et 30 % de chance de rater son tour)', trap: 'piège (6 % de PV par tour, ne peut pas changer de ligne)',
    nightmare: 'cauchemar (perd 12 % de PV par tour s\'il dort)', torment: 'tourmente (ne peut pas lancer deux fois la même attaque)',
    disable: 'entrave (sa dernière attaque est bloquée 2 tours)', yawn: 'bâillement (s\'endort au tour suivant)', 'heal-block': 'anti-soin (ne peut plus être soigné 3 tours)',
    'no-type-immunity': 'perte d\'immunité de type', 'leech-seed': 'Vampigraine', embargo: 'embargo (objet tenu inutilisable)', 'perish-song': 'Requiem',
    ingrain: 'enracinement', silence: 'silence (capacités sonores bloquées)', 'tar-shot': 'goudron (Vitesse −1 et ×2 dégâts de Feu)', protect: 'protection',
};
const TARGET_FR = {
    user: 'Lanceur', ally: 'Un allié', 'user-or-ally': 'Lanceur ou un allié', 'user-and-allies': "Toute l'équipe", 'all-allies': "Toute l'équipe",
    'users-field': 'Camp allié', 'opponents-field': 'Camp ennemi', 'entire-field': 'Terrain', 'selected-pokemon': 'Une cible', 'all-opponents': 'Tous les ennemis',
    'all-other-pokemon': 'Tous les autres Pokémon', 'random-opponent': 'Un ennemi au hasard', 'all-pokemon': 'Tout le terrain', 'specific-move': 'Spécial',
    'selected-pokemon-me-first': 'Une cible', 'fainting-pokemon': 'Allié K.O.',
};
const SELF_TARGETS = ['user', 'user-and-allies', 'all-allies', 'users-field', 'ally', 'user-or-ally'];
const sgn = n => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const stages = list => list.map(([s, v]) => `${STAT_FR[s] || s} ${sgn(v)}`).join(', ');
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const zoneText = (m, aoe = m.aoe) => {
    if (m.zone === 'self') return 'Lanceur';
    if (m.zone === 'ally') return aoe === 'all' ? "Toute l'équipe" : 'Un allié';
    if (m.zone === 'all') return 'Tout le terrain';
    return cap(AOE_FR[aoe] || 'une cible');
};
const isContact = m => m._file === 'physical' && (m.power || 0) > 0 && !['all', 'random_single'].includes(m.aoe);

// Bonus de la version Z selon le type : c'est là qu'on ajoute soins, régénération, boucliers et jauge
const Z_TYPE_BONUS = {
    normal: '+20 % de jauge pour le lanceur.',
    fire: '50 % de chance de brûler chaque cible.',
    water: "Régénération de 5 % des PV par tour pendant 3 tours pour toute l'équipe.",
    electric: "+25 % de jauge pour toute l'équipe.",
    grass: "Draine 25 % des dégâts, répartis sur toute l'équipe.",
    ice: 'Chaque cible perd 30 % de jauge.',
    fighting: 'Attaque +1 pour le lanceur.',
    poison: '50 % de chance d\'empoisonner chaque cible.',
    ground: 'Précision −1 pour chaque cible.',
    flying: '+30 % de jauge pour le lanceur.',
    psychic: 'Les cibles perdent leurs bonus de stats.',
    bug: 'Attaque et Atq. Spé. −1 pour chaque cible.',
    rock: 'Bouclier de 20 % des PV pour le lanceur.',
    ghost: 'Chaque cible perd 25 % de jauge.',
    dragon: "Taux de critique +1 pour toute l'équipe.",
    dark: 'Vole les bonus de stats des cibles.',
    steel: "Bouclier de 12 % des PV pour toute l'équipe.",
    fairy: "Soigne 20 % des PV de toute l'équipe.",
    shadow: 'Les cibles subissent ×1,2 dégâts pendant 2 tours.',
};

// Variante pour les tactiques (souvent sans cible ennemie)
const Z_TYPE_SUPPORT = {
    normal: '+20 % de jauge pour le lanceur.', fire: 'Attaque et Atq. Spé. +1 pour le lanceur.',
    water: "Régénération de 5 % des PV par tour pendant 3 tours pour toute l'équipe.", electric: "+25 % de jauge pour toute l'équipe.",
    grass: "Régénération de 4 % des PV par tour pendant 3 tours pour toute l'équipe.", ice: 'Tous les ennemis perdent 15 % de jauge.',
    fighting: 'Attaque +1 pour le lanceur.', poison: "30 % de chance d'empoisonner chaque ennemi.", ground: 'Bouclier de 10 % des PV pour le lanceur.',
    flying: '+30 % de jauge pour le lanceur.', psychic: 'Atq. Spé. +1 pour le lanceur.', bug: "+15 % de jauge pour toute l'équipe.",
    rock: 'Bouclier de 20 % des PV pour le lanceur.', ghost: 'Tous les ennemis perdent 20 % de jauge.', dragon: "Taux de critique +1 pour toute l'équipe.",
    dark: "Vole le meilleur bonus de stats d'un ennemi.", steel: "Bouclier de 12 % des PV pour toute l'équipe.", fairy: "Soigne 20 % des PV de toute l'équipe.",
    shadow: 'Tous les ennemis subissent ×1,2 dégâts pendant 2 tours.',
};

// Précisions d'attaques particulières (effets officiels que les règles générales ne couvrent pas)
// Placement et portée sur la grille (la formation ne bouge que par ces capacités)
const POSITION = {
    'dragon-tail': { rule: 'R19', text: "Projection : repousse la cible au fond de sa colonne ; si la case derrière est occupée, les deux Pokémon prennent 15 % de leurs PV max dans le choc.", z: "Projette toute la ligne visée au fond de ses colonnes." },
    'circle-throw': { rule: 'R19', text: "Projection : repousse la cible au fond de sa colonne ; si la case derrière est occupée, les deux Pokémon prennent 15 % de leurs PV max dans le choc.", z: "Projette toute la ligne visée au fond de ses colonnes." },
    'storm-throw': { rule: 'R19', text: "Projection : repousse la cible au fond de sa colonne ; si la case derrière est occupée, les deux Pokémon prennent 15 % de leurs PV max dans le choc.", z: "Projette toute la ligne visée au fond de ses colonnes." },
    'gust': { rule: 'R19', text: "Bourrasque : repousse la cible d'une case vers l'arrière (choc de 10 % si la case est occupée).", z: "Repousse toute la ligne visée d'une case." },
    'hurricane': { rule: 'R19', text: "Repousse la cible d'une case vers l'arrière (choc de 10 % si la case est occupée).", z: "Repousse tous les ennemis touchés." },
    'force-palm': { rule: 'R19', text: "Repousse la cible d'une case vers l'arrière.", z: "Projette la cible au fond de sa colonne." },
    'vine-whip': { rule: 'R19', text: "Attraction : vise n'importe quelle case et tire la cible d'une ligne vers l'avant (elle échange sa place avec celui qui s'y trouve).", z: "Attire la cible jusque sur la ligne avant." },
    'power-whip': { rule: 'R19', text: "Attraction : vise n'importe quelle case et tire la cible d'une ligne vers l'avant (elle échange sa place avec celui qui s'y trouve).", z: "Attire la cible jusque sur la ligne avant." },
    'anchor-shot': { rule: 'R19', text: "Attraction : vise n'importe quelle case et tire la cible d'une ligne vers l'avant (elle échange sa place avec celui qui s'y trouve). Elle ne peut plus être déplacée pendant 3 tours.", z: "Attire la cible jusque sur la ligne avant et l'y bloque." },
    'spirit-shackle': { rule: 'R19', text: "Attraction : vise n'importe quelle case et tire la cible d'une ligne vers l'avant (elle échange sa place avec celui qui s'y trouve). Elle ne peut plus être déplacée pendant 3 tours.", z: "Attire la cible jusque sur la ligne avant et l'y bloque." },
    'smack-down': { rule: 'R19', text: "Anti-Air : fait retomber une cible en Plongée ou en lévitation et la ramène sur la ligne avant.", z: "Fait retomber tous les ennemis en vol ou en Plongée." },
    'thousand-arrows': { rule: 'R19', text: "Fait retomber les ennemis en Plongée ou en lévitation (ils peuvent de nouveau être touchés).", z: "Ramène aussi les ennemis touchés sur la ligne avant." },
    'jaw-lock': { rule: 'R19', text: "Crocs Fatals : ni le lanceur ni la cible ne peuvent être déplacés pendant 3 tours.", z: "Bloque toute la ligne de la cible." },
    'u-turn': { rule: 'R19', text: "Relais : après l'attaque, le lanceur échange sa place avec l'allié de sa colonne qui a le plus de PV.", z: "Relais, et l'allié qui prend sa place gagne +40 % de jauge." },
    'volt-switch': { rule: 'R19', text: "Relais : après l'attaque, le lanceur échange sa place avec l'allié de sa colonne qui a le plus de PV.", z: "Relais, et l'allié qui prend sa place gagne +40 % de jauge." },
    'flip-turn': { rule: 'R19', text: "Relais : après l'attaque, le lanceur échange sa place avec l'allié de sa colonne qui a le plus de PV.", z: "Relais, et l'allié qui prend sa place gagne +40 % de jauge." },
    'fly': { rule: 'R20', text: "Plongée : disparaît, intouchable jusqu'à son prochain tour, puis frappe n'importe quelle case (même à l'arrière au contact).", z: "Frappe tout de suite, sans tour de préparation." },
    'bounce': { rule: 'R20', text: "Plongée : disparaît, intouchable jusqu'à son prochain tour, puis frappe n'importe quelle case (même à l'arrière au contact).", z: "Frappe tout de suite, sans tour de préparation." },
    'dig': { rule: 'R20', text: "Plongée : disparaît, intouchable jusqu'à son prochain tour, puis frappe n'importe quelle case (même à l'arrière au contact).", z: "Frappe tout de suite, sans tour de préparation." },
    'dive': { rule: 'R20', text: "Plongée : disparaît, intouchable jusqu'à son prochain tour, puis frappe n'importe quelle case (même à l'arrière au contact).", z: "Frappe tout de suite, sans tour de préparation." },
    'phantom-force': { rule: 'R20', text: "Plongée : disparaît, intouchable jusqu'à son prochain tour, puis frappe n'importe quelle case (même à l'arrière au contact). Traverse Abri et boucliers.", z: "Frappe tout de suite, sans tour de préparation." },
    'shadow-force': { rule: 'R20', text: "Plongée : disparaît, intouchable jusqu'à son prochain tour, puis frappe n'importe quelle case (même à l'arrière au contact). Traverse Abri et boucliers.", z: "Frappe tout de suite, sans tour de préparation." },
    'sky-drop': { rule: 'R20', text: "Plongée : emporte la cible dans les airs (aucun des deux n'agit ni n'est touché) puis la lâche à son prochain tour.", z: "Frappe tout de suite et projette la cible au fond de sa colonne." },
    'snipe-shot': { rule: 'R20', text: "Tir de précision : vise n'importe quelle case, ignore la Provocation et ne rate jamais.", z: "Touche aussi la case derrière la cible." },
    'aura-sphere': { rule: 'R20', text: "Tir de précision : vise n'importe quelle case, ignore la Provocation et ne rate jamais.", z: "Touche aussi la case derrière la cible." },
    'aerial-ace': { rule: 'R20', text: "Tir de précision : vise n'importe quelle case, ignore la Provocation et ne rate jamais.", z: "Touche aussi la case derrière la cible." },
    'magical-leaf': { rule: 'R20', text: "Tir de précision : vise n'importe quelle case, ignore la Provocation et ne rate jamais.", z: "Touche aussi la case derrière la cible." },
    'feint-attack': { rule: 'R20', text: "Tir de précision : vise n'importe quelle case, ignore la Provocation et ne rate jamais.", z: "Touche aussi la case derrière la cible." },
    'shadow-punch': { rule: 'R20', text: "Tir de précision : vise n'importe quelle case, ignore la Provocation et ne rate jamais.", z: "Touche aussi la case derrière la cible." },
    'magnet-bomb': { rule: 'R20', text: "Tir de précision : vise n'importe quelle case, ignore la Provocation et ne rate jamais.", z: "Touche aussi la case derrière la cible." },
    'swift': { rule: 'R20', text: "Ne rate jamais et ignore la Provocation.", z: "Ne rate jamais." },
    'revenge': { rule: 'R21', text: "En face : puissance ×1,3 si la cible est dans le même couloir que le lanceur. ×2 s'il vient d'être touché par elle.", z: "Bonus « en face » sur toute la colonne." },
    'avalanche': { rule: 'R21', text: "En face : puissance ×1,3 si la cible est dans le même couloir que le lanceur. ×2 s'il vient d'être touché par elle.", z: "Bonus « en face » sur toute la colonne." },
    'payback': { rule: 'R21', text: "En face : puissance ×1,3 si la cible est dans le même couloir que le lanceur. ×2 si la cible a agi avant lui.", z: "Bonus « en face » sur toute la colonne." },
    'pursuit': { rule: 'R21', text: "En face : puissance ×1,3 si la cible est dans le même couloir que le lanceur. ×2 sur une cible qui vient de changer de place.", z: "Frappe aussi toute cible déplacée pendant 2 tours." },
    'retaliate': { rule: 'R21', text: "En face : puissance ×1,3 si la cible est dans le même couloir que le lanceur. ×2 si un allié a été mis K.O. juste avant.", z: "Bonus « en face » sur toute la colonne." },
};

const ATTACK_NOTES = {
    'fake-out': { text: 'Seulement à son premier tour.', drop: ['recharge'] },
    'first-impression': { text: 'Seulement à son premier tour.', drop: ['recharge'] },
    'rapid-spin': { text: 'Retire les pièges posés dans son camp et libère le lanceur des pièges.', drop: ['trap'] },
    'mortal-spin': { text: 'Retire les pièges posés dans son camp et libère le lanceur des pièges.', drop: ['trap'] },
    'knock-off': { text: "Fait tomber l'objet tenu par la cible (dégâts ×1,5 si elle en tenait un)." },
    'thief': { text: "Vole l'objet tenu par la cible si le lanceur n'en a pas." },
    'covet': { text: "Vole l'objet tenu par la cible si le lanceur n'en a pas." },
    'pluck': { text: 'Mange la baie de la cible et en profite.' },
    'bug-bite': { text: 'Mange la baie de la cible et en profite.' },
    'brick-break': { text: "Brise d'abord les boucliers et murs (Protection, Mur Lumière) de la cible." },
    'psychic-fangs': { text: "Brise d'abord les boucliers et murs (Protection, Mur Lumière) de la cible." },
    'feint': { text: 'Passe à travers Abri et retire 30 % du bouclier de la cible.' },
};

// ---------------------------------------------------------------------------
// FORMES DE ZONE sur la grille ennemie 3×3, avec des dégâts qui décroissent autour de l'impact.
// grid : 3 lignes affichées comme à l'écran (en haut l'arrière ennemi, en bas la ligne avant,
// face à ton équipe), valeurs = % de la puissance ; la case à 100 est le point d'impact.
// order : ordre des coups pour le ricochet ; hits : nombre de projectiles pour la salve.
// ---------------------------------------------------------------------------
const SHAPES = {
    cible: { name: 'Cible unique', grid: [[0, 0, 0], [0, 100, 0], [0, 0, 0]], text: '100 % sur la cible seule.' },
    duo: { name: 'Doublé (2 cibles)', grid: [[0, 0, 0], [0, 100, 100], [0, 0, 0]], order: [[1, 1], [1, 2]], text: "Un coup sur la cible, puis un coup sur un deuxième ennemi voisin de sa ligne (100 % chacun) ; s'il est seul, les deux coups le touchent." },
    hasard: { name: 'Au hasard', grid: null, text: '100 % sur un ennemi tiré au hasard.' },
    eclabous: { name: 'Éclaboussure', grid: [[0, 35, 0], [35, 100, 35], [0, 35, 0]], text: '100 % sur la cible, 35 % sur ses 4 voisins.' },
    croix: { name: 'Croix', grid: [[0, 60, 0], [60, 100, 60], [0, 60, 0]], text: '100 % sur la cible, 60 % sur ses 4 voisins.' },
    diag: { name: 'Diagonales (X)', grid: [[50, 0, 50], [0, 100, 0], [50, 0, 50]], text: '100 % sur la cible, 50 % sur ses 4 diagonales.' },
    explosion: { name: 'Explosion', grid: [[30, 55, 30], [55, 100, 55], [30, 55, 30]], text: '100 % sur la cible, 55 % sur ses voisins, 30 % dans les coins.' },
    ligne: { name: 'Balayage (ligne)', grid: [[0, 0, 0], [75, 100, 75], [0, 0, 0]], text: '100 % sur la cible, 75 % sur les deux autres cases de sa ligne.' },
    percee: { name: 'Perçante (colonne)', grid: [[0, 45, 0], [0, 70, 0], [0, 100, 0]], text: 'Traverse en profondeur : 100 % sur la cible, 70 % sur la case derrière, 45 % encore derrière.' },
    cone: { name: 'Cône (souffle)', grid: [[0, 0, 0], [50, 50, 50], [0, 100, 0]], text: "100 % sur la cible, 50 % sur les 3 cases de la ligne derrière elle." },
    onde: { name: 'Onde', grid: [[30, 30, 30], [50, 50, 50], [70, 70, 70]], text: "Tous les ennemis : 70 % sur la ligne avant, 50 % au milieu, 30 % à l'arrière." },
    tempete: { name: 'Tempête', grid: [[50, 50, 50], [50, 50, 50], [50, 50, 50]], text: '50 % sur chaque ennemi, quelle que soit sa ligne.' },
    front: { name: 'Ligne de front', grid: [[0, 0, 0], [0, 0, 0], [70, 70, 70]], text: 'Toute la ligne avant ennemie : 70 % chacun.' },
    ricochet: { name: 'Ricochet', grid: [[0, 0, 35], [0, 100, 60], [0, 0, 0]], order: [[1, 1], [1, 2], [0, 2]], text: "100 % sur la cible, puis rebondit sur l'ennemi le plus proche pas encore touché (60 %), puis sur un autre (35 %)." },
    salve: { name: 'Salve', grid: null, hits: 3, text: '3 projectiles sur des cases au hasard, 45 % chacun (une case peut être touchée plusieurs fois).' },
    // Versions Z (forme élargie)
    explosion_z: { name: 'Grande explosion', grid: [[60, 80, 60], [80, 100, 80], [60, 80, 60]], text: '100 % sur la cible, 80 % sur ses voisins, 60 % dans les coins.' },
    percee_large: { name: 'Perçante large', grid: [[25, 45, 25], [35, 70, 35], [50, 100, 50]], text: 'Traverse 3 colonnes : 100 / 70 / 45 % au centre, la moitié sur les colonnes voisines.' },
    cone_large: { name: 'Grand souffle', grid: [[40, 40, 40], [70, 70, 70], [0, 100, 0]], text: '100 % sur la cible, 70 % sur la ligne derrière, 40 % tout au fond.' },
    onde_forte: { name: 'Raz-de-marée', grid: [[50, 50, 50], [75, 75, 75], [100, 100, 100]], text: "Tous les ennemis : 100 % sur la ligne avant, 75 % au milieu, 50 % à l'arrière." },
    tempete_forte: { name: 'Ouragan', grid: [[80, 80, 80], [80, 80, 80], [80, 80, 80]], text: '80 % sur chaque ennemi.' },
    ricochet_z: { name: 'Ricochet en chaîne', grid: [[25, 45, 65], [0, 100, 80], [0, 0, 0]], order: [[1, 1], [1, 2], [0, 2], [0, 1], [0, 0]], text: "100 % sur la cible, puis 4 rebonds (80, 65, 45, 25 %)." },
    trio: { name: 'Triplé (3 cibles)', grid: [[0, 0, 0], [100, 100, 100], [0, 0, 0]], order: [[1, 1], [1, 2], [1, 0]], text: 'Un coup sur la cible puis un sur chacun de ses voisins de ligne (100 % chacun).' },
    salve_z: { name: 'Déluge', grid: null, hits: 6, text: '6 projectiles sur des cases au hasard, 50 % chacun.' },
};
SHAPES.encercle = { name: 'Encerclement', grid: [[0, 40, 0], [40, 100, 40], [0, 40, 0]], text: "100 % sur la cible, 40 % sur ses 4 voisins ; toute la zone est piégée 3 tours (6 % de PV par tour, impossible d'en déplacer les Pokémon)." };
// Formes de soutien, sur TA grille : ta ligne avant est en haut (face aux ennemis)
SHAPES.soin_cible = { name: 'Soin ciblé', side: 'ally', grid: [[0, 0, 0], [0, 100, 0], [0, 0, 0]], text: "Soigne l'allié le plus blessé." };
SHAPES.soin_eclabous = { name: 'Soin en éclaboussure', side: 'ally', grid: [[0, 40, 0], [40, 100, 40], [0, 40, 0]], text: "100 % du soin sur l'allié le plus blessé, 40 % sur ses 4 voisins." };
SHAPES.soin_onde = { name: 'Onde de soin', side: 'ally', grid: [[100, 100, 100], [80, 80, 80], [60, 60, 60]], text: "Toute l'équipe : 100 % du soin sur la ligne avant, 80 % au milieu, 60 % à l'arrière." };
SHAPES.bouclier_front = { name: 'Mur de la ligne avant', side: 'ally', grid: [[100, 100, 100], [60, 60, 60], [30, 30, 30]], text: "Bouclier complet sur la ligne avant, 60 % au milieu, 30 % à l'arrière." };
SHAPES.garde_colonne = { name: 'Garde de colonne', side: 'ally', grid: [[0, 100, 0], [0, 100, 0], [0, 100, 0]], text: 'Protège toute la colonne du lanceur.' };
const SHAPE_UP = {
    encercle: 'explosion', soin_cible: 'soin_eclabous', soin_eclabous: 'soin_onde', soin_onde: 'soin_onde', bouclier_front: 'bouclier_front', garde_colonne: 'bouclier_front',
    cible: 'duo', duo: 'trio', hasard: 'salve', eclabous: 'explosion', croix: 'explosion', diag: 'explosion', explosion: 'explosion_z',
    ligne: 'onde', percee: 'percee_large', cone: 'cone_large', onde: 'onde_forte', tempete: 'tempete_forte', front: 'onde',
    ricochet: 'ricochet_z', salve: 'salve_z',
};
// Forme selon la nature de l'attaque (rayon, bombe, éclair, séisme, souffle…), sinon d'après la zone actuelle du jeu
const SHAPE_LISTS = {
    duo: 'double-kick double-hit dual-chop twineedle bonemerang gear-grind double-iron-bash dragon-darts dual-wingbeat',
    salve: 'rock-slide swift make-it-rain diamond-storm glacial-lance draco-meteor stone-axe ceaseless-edge',
    ricochet: 'thunderbolt thunder-shock thunder shock-wave electro-ball bullet-seed pin-missile icicle-spear rock-blast water-shuriken scale-shot spike-cannon',
    percee: 'hydro-pump drill-peck drill-run horn-attack megahorn smart-strike hyper-drill snipe-shot mirror-shot psystrike psyshock spacial-rend sacred-sword ice-shard water-gun',
    eclabous: 'sludge sludge-bomb octazooka flame-burst seed-flare gunk-shot aura-sphere focus-blast mud-slap water-pulse dark-pulse dragon-pulse terrain-pulse egg-bomb seed-bomb magnet-bomb mud-bomb syrup-bomb shadow-ball energy-ball weather-ball mist-ball pyro-ball',
    explosion: 'explosion self-destruct misty-explosion mind-blown searing-shot blast-burn',
    croix: 'fire-blast twister cross-chop hurricane leaf-tornado',
    encercle: 'fire-spin whirlpool sand-tomb magma-storm infestation thunder-cage snap-trap bind wrap clamp',
    diag: 'x-scissor cross-poison',
    cone: 'dragon-breath frost-breath flamethrower inferno smog acid bubble powder-snow incinerate burning-jealousy',
    ligne: 'razor-leaf air-cutter razor-wind breaking-swipe electroweb struggle-bug icy-wind mortal-spin brutal-swing core-enforcer',
    onde: 'earthquake magnitude bulldoze surf muddy-water hyper-voice boomburst disarming-voice snarl relic-song clanging-scales clangorous-soulblaze overdrive sparkling-aria synchronoise sludge-wave lava-plume discharge parabolic-charge eruption water-spout origin-pulse precipice-blades thousand-arrows thousand-waves lands-wrath dazzling-gleam glaciate petal-blizzard splishy-splash dragon-energy shadow-wave',
    tempete: 'blizzard heat-wave fiery-wrath astral-barrage bleakwind-storm wildbolt-storm sandsear-storm springtide-storm tera-starstorm shadow-storm shadow-rave shadow-half',
};
// Corps à corps : la forme suit le geste (tranche qui balaie, charge qui traverse, coup au sol qui éclabousse…)
const PHYSICAL_SHAPE_LISTS = {
    ligne: 'slash cut night-slash leaf-blade psycho-cut sacred-sword aqua-cutter kowtow-cleave low-sweep rolling-kick iron-tail aqua-tail poison-tail rapid-spin spin-out razor-shell behemoth-blade steel-roller ice-spinner steamroller rollout',
    percee: 'take-down double-edge giga-impact head-smash wild-charge flare-blitz volt-tackle brave-bird skull-bash wave-crash head-charge headlong-rush collision-course raging-bull dragon-rush horn-attack megahorn drill-run smart-strike',
    eclabous: 'stomp body-slam heavy-slam heat-crash stomping-tantrum high-horsepower hammer-arm ice-hammer crabhammer wood-hammer dragon-hammer gigaton-hammer icicle-crash dynamic-punch body-press dig mountain-gale',
    ricochet: 'fury-swipes fury-attack comet-punch arm-thrust double-slap triple-kick triple-axel surging-strikes population-bomb bone-rush tail-slap',
    diag: 'dragon-claw shadow-claw metal-claw crush-claw dire-claw x-scissor cross-poison',
    croix: 'cross-chop stone-edge rock-tomb',
    explosion: 'rock-wrecker avalanche',
    salve: 'barrage',
};
const SHAPE_OF = {};
[SHAPE_LISTS, PHYSICAL_SHAPE_LISTS].forEach(lists => Object.entries(lists).forEach(([shape, keys]) => keys.split(' ').forEach(k => { SHAPE_OF[k] = shape; })));
const FROM_GAME_AOE = { single: 'cible', splash_v: 'eclabous', row: 'percee', column: 'ligne', cross: 'croix', diagonal_x: 'diag', line_of_2: 'percee', frontline: 'front', random_single: 'hasard', all: 'onde', midline: 'ligne', backline: 'ligne' };
function shapeFor(m, o) {
    if (DELAYED_MOVES[m._key]) return 'cible'; // retardement : une seule cible, comme l'officiel
    if (POSITION[m._key]?.rule === 'R20') return 'cible'; // Plongée et tir de précision : une cible, n'importe où
    if (SHAPE_OF[m._key]) return SHAPE_OF[m._key];
    if (m._key.startsWith('max-')) return 'explosion';
    if (o.target === 'random-opponent') return 'hasard';
    if (['all-opponents', 'all-other-pokemon', 'opponents-field'].includes(o.target)) return 'onde';
    if (m._file === 'physical') return 'cible'; // corps à corps : une seule cible, sur la ligne de front
    return FROM_GAME_AOE[m.aoe] || 'cible';
}

// ---------------------------------------------------------------------------
// INDICE DE VALEUR d'une attaque : puissance × coups × précision × (1 + effets) × couverture.
// Sert à garder l'équilibre entre l'officiel et la proposition, et entre physique et spéciale :
// une forme large touche plus de monde, donc sa puissance au point d'impact baisse.
// ---------------------------------------------------------------------------
const OCCUPANCY = 0.6;          // part des cases ennemies occupées en moyenne
const NEIGHBOR_HIT = 0.8;       // chance qu'un voisin existe pour un rebond / un 2e coup
const AOE_BONUS = 0.05;         // léger bonus d'une zone large (+5 % par cible supplémentaire attendue) : focaliser une cible reste aussi utile que d'arroser
const Z_MULT = 3.2;             // une version Z vaut 3,2 fois la version normale, quelle que soit sa forme
function coverageOf(id) {
    const sh = SHAPES[id];
    if (id === 'salve') return 3 * 0.45;
    if (id === 'salve_z') return 6 * 0.5;
    if (id === 'hasard' || id === 'cible') return 1;
    if (sh.side === 'ally') return 1;
    if (id === 'duo') return 2;
    if (id === 'trio') return 1 + 2 * NEIGHBOR_HIT;
    if (id.startsWith('ricochet')) return 1 + NEIGHBOR_HIT * (sh.grid.flat().reduce((a, b) => a + b, 0) - 100) / 100;
    const sum = sh.grid.flat().reduce((a, b) => a + b, 0);
    if (!sh.grid.flat().includes(100) || ['onde', 'tempete', 'front', 'onde_forte', 'tempete_forte'].includes(id)) {
        return Math.max(1, (id === 'front' ? 0.8 : OCCUPANCY) * sum / 100);
    }
    return 1 + OCCUPANCY * (sum - 100) / 100;
}
const AILMENT_VALUE = { paralysis: 0.35, sleep: 0.5, freeze: 0.4, burn: 0.3, poison: 0.25, confusion: 0.2, infatuation: 0.15, trap: 0.2 };
function effectValue(o, mech = {}) {
    let v = 0;
    if (o.ailment && AILMENT_VALUE[o.ailment]) v += AILMENT_VALUE[o.ailment] * ((o.ailment_chance || 100) / 100);
    if (o.flinch_chance) v += 0.25 * o.flinch_chance / 100;
    if (o.stat_changes.length) {
        const self = o.category === 'damage-raise';
        const stagesSum = o.stat_changes.reduce((a, [, n]) => a + n, 0);
        const sign = self ? Math.sign(stagesSum) : -Math.sign(stagesSum); // bonus pour soi ou malus pour l'ennemi = positif
        v += sign * 0.1 * Math.abs(stagesSum) * ((o.stat_chance || 100) / 100);
    }
    if (o.drain > 0) v += 0.25 * o.drain / 50;
    if (o.drain < 0) v -= 0.2 * (-o.drain) / 33;
    if (o.priority > 0) v += 0.15;
    if (o.priority < 0) v -= 0.1;
    if (o.crit_rate) v += 0.1 * o.crit_rate;
    if (mech.recharge) v -= 0.5;
    if (mech.selfKo) v -= 0.6;
    return Math.max(-0.8, v);
}
const avgHits = h => (!h ? 1 : h[0] === 2 && h[1] === 5 ? 3.1 : (h[0] + h[1]) / 2);

// ---------------------------------------------------------------------------
// RÈGLES (écrites dans la base pour que chaque proposition cite la sienne)
// ---------------------------------------------------------------------------
const RULES = {
    R1: "Attaques : effets secondaires officiels conservés (altération, chance, stats, drain, coups multiples, critique).",
    R2: "Peur → la cible perd 30 % de jauge d'action (même chance qu'avant).",
    R3: "Bonus de Vitesse du lanceur → aussi +20 % de jauge tout de suite (+30 % pour une capacité de statut) : on peut passer devant l'ennemi.",
    R4: 'Baisse de Vitesse de la cible → aussi −15 % de jauge (−20 % pour une capacité de statut).',
    R5: 'Bonus de Défense / Déf. Spé. du lanceur → aussi un bouclier (10 % des PV par palier, 15 % pour +2 et plus).',
    R6: "Priorité positive → passe devant et rend 25 % de jauge après l'attaque. Priorité négative → le lanceur perd 20 % de jauge après coup.",
    R7: "Drain → le soin qui dépasse les PV max devient un bouclier.",
    R8: 'Soins de statut → soin officiel + régénération de 5 % par tour pendant 2 tours.',
    R9: "K.O. en un coup → Exécution : achève une cible sous 25 % de PV (boss : 15 %), sinon dégâts normaux.",
    R10: "Expulsion (Hurlement, Cyclone…) → repousse la cible au fond de sa colonne et lui retire 30 % de jauge.",
    R11: 'Effets de terrain durables (météo, champs, salles, pièges, protections d\'équipe) → passifs déclenchés au premier tour, 4 tours.',
    R12: "Version Z des attaques : vaut 3,2 fois la version normale (indice), forme élargie d'un cran (Cible unique → Doublé sur 2 ennemis, Doublé → Triplé, Éclaboussure → Explosion, Perçante → Perçante large, Onde → Raz-de-marée…), brise boucliers et Abri, effet secondaire garanti, sans recharge ni contrecoup, + bonus de son type.",
    R13: "Version Z des tactiques : effet renforcé d'un cran et étendu (lanceur → équipe, cible → tous les ennemis), + bonus de son type.",
    R14: "Version Z des passifs : « Éveil » — quand la jauge Z est pleine, le passif déclenche un effet actif immédiat.",
    R17: "Équilibre : indice = puissance × coups × précision × (1 + valeur des effets) × couverture de la forme. La puissance au point d'impact est recalculée pour garder la valeur officielle (×0,5, échelle du jeu), avec seulement +5 % par cible supplémentaire attendue : une attaque de zone frappe moins fort au centre qu'une attaque à cible unique.",
    R16: "Zones : chaque attaque reçoit une forme sur la grille 3×3 selon sa nature (rayon perçant, bombe qui éclabousse, éclair qui ricoche, séisme en onde, souffle en cône, rochers en salve, corps à corps sur une seule cible), avec des dégâts qui diminuent autour du point d'impact. ",
    R19: "Placement : seules certaines capacités déplacent les Pokémon. Projection (repousse au fond de la colonne, choc de 15 % si la case est occupée), Bourrasque (recule d'une case), Attraction (ramène d'une ligne vers l'avant), Relais et Téléport (le lanceur change de case), Barrage (la cible ne peut plus être déplacée).",
    R20: "Portée : Plongée (intouchable jusqu'à son prochain tour, puis frappe n'importe quelle case, même l'arrière au contact) ; Tir de précision (vise n'importe quelle case, ignore la Provocation, ne rate jamais).",
    R21: "En face : certaines ripostes font ×1,3 quand la cible est dans le même couloir que le lanceur.",
    R22: "Soutien : les soins et boucliers ont aussi une forme, sur ta grille (ligne avant en haut) : soin ciblé, éclaboussure de soin, onde de soin, mur de la ligne avant, garde de colonne.",
    R23: "Position : une attaque de contact fait +10 % depuis la ligne avant, une attaque à distance +10 % depuis la ligne arrière.",
    R24: "Retardement (Prescience, Vœu Destructeur) : une seule cible, l'impact arrive au début du 2e tour suivant de la cible, même si le lanceur est K.O. entre-temps. Une seule à la fois sur une même cible. La version Z frappe tout de suite.",
    R18: "Vignettes de zone en jeu (écran vertical) : grille ennemie avec l'arrière en haut et la ligne avant en bas, face à ton équipe ; pour une capacité qui vise ton camp, ta ligne avant est en haut de ta grille, la vignette est donc retournée.",
    R15: 'Bonus de type de la version Z : Eau régénère, Plante draine pour l\'équipe, Fée soigne, Acier et Roche donnent des boucliers, Électrik / Vol / Normal accélèrent, Glace / Spectre ralentissent…',
};

// ---------------------------------------------------------------------------
// PASSIFS : déclencheur, effet, Éveil (version Z). Un Pokémon peut en équiper autant
// qu'il veut parmi ses 4 emplacements, mais sans action il ne joue pas.
// ---------------------------------------------------------------------------
const P = (trigger, standard, z, target = 'Lanceur') => ({ trigger, standard, z, target });
const PASSIVES = {
    // Premier tour
    'harden': P('Premier tour', 'Défense +1 et bouclier de 10 % des PV.', 'Bouclier de 25 % des PV et Défense +1 en plus.'),
    'defense-curl': P('Premier tour', 'Défense +1 ; ses attaques qui roulent (Roulade, Ball\'Glace) font ×1,5.', 'Bouclier de 20 % des PV ; ses attaques qui roulent font ×2 pendant 3 tours.'),
    'sharpen': P('Premier tour', 'Attaque +1.', 'Attaque +2 et taux de critique +1.'),
    'meditate': P('Premier tour', 'Attaque +1 ; insensible à la confusion.', "Attaque +2 et purge les altérations de l'équipe."),
    'growth': P('Premier tour', 'Attaque et Atq. Spé. +1 (+2 sous le Soleil).', 'Attaque et Atq. Spé. +2 et soigne 20 % des PV.'),
    'howl': P('Premier tour', "Attaque +1 pour toute l'équipe.", "Attaque +1 et +25 % de jauge pour toute l'équipe.", "Toute l'équipe"),
    'hone-claws': P('Premier tour', 'Attaque +1 et Précision +1.', 'Attaque +2 ; ses attaques ne ratent plus pendant 3 tours.'),
    'focus-energy': P('Premier tour', 'Taux de critique +2.', 'Ses 3 prochaines attaques sont des coups critiques.'),
    'double-team': P('Premier tour', 'Esquive +1.', 'Esquive +2 et +30 % de jauge.'),
    'minimize': P('Premier tour', 'Esquive +2, mais subit ×2 des attaques qui écrasent (Plaquage, Écrasement…).', 'Esquive +3 pendant 3 tours.'),
    'lock-on': P('Premier tour', 'Ses attaques ne ratent jamais.', 'Sa prochaine attaque ignore boucliers et Abri.'),
    'mind-reader': P('Premier tour', 'Ses attaques ne ratent jamais.', 'Sa prochaine attaque ignore boucliers et Abri.'),
    'foresight': P('Premier tour', "Ignore l'esquive des ennemis ; ses attaques Normal et Combat touchent les Spectre.", 'Défense −2 pour l\'ennemi le plus résistant.'),
    'odor-sleuth': P('Premier tour', "Ignore l'esquive des ennemis ; ses attaques Normal et Combat touchent les Spectre.", 'Défense −2 pour l\'ennemi le plus résistant.'),
    'miracle-eye': P('Premier tour', "Ignore l'esquive des ennemis ; ses attaques Psy touchent les Ténèbres.", 'Déf. Spé. −2 pour l\'ennemi le plus résistant.'),
    'magnet-rise': P('Premier tour', 'Lévite : immunisé contre les attaques Sol et les pièges au sol.', 'Lévite et gagne +40 % de jauge.'),
    'camouflage': P('Premier tour', 'Prend le type du terrain ou de la météo en cours (Normal par défaut).', "Prend un type qui résiste à l'ennemi le plus fort."),
    'conversion': P('Premier tour', 'Prend le type de sa première attaque.', 'Prend le type de sa première attaque et Attaque, Atq. Spé. +1.'),
    'dragon-cheer': P('Premier tour', "Taux de critique +1 pour l'équipe (+2 pour les Dragon).", "Taux de critique +2 pour l'équipe et +20 % de jauge.", "Toute l'équipe"),
    'safeguard': P('Premier tour', "L'équipe est immunisée contre les altérations d'état pendant 4 tours.", "Purge l'équipe et l'immunise 4 tours de plus.", "Toute l'équipe"),
    'mist': P('Premier tour', "Les stats de l'équipe ne peuvent pas être baissées pendant 4 tours.", "Annule les baisses de stats de l'équipe et l'en protège 4 tours.", "Toute l'équipe"),
    'lucky-chant': P('Premier tour', "L'équipe ne subit pas de coups critiques pendant 4 tours.", "Protection 6 tours et bouclier de 10 % pour l'équipe.", "Toute l'équipe"),
    'follow-me': P('Premier tour', 'Provocation : les attaques ennemies à une cible le visent pendant 2 tours.', 'Provocation 3 tours et bouclier de 20 % des PV.'),
    'rage-powder': P('Premier tour', 'Provocation : les attaques ennemies à une cible le visent pendant 2 tours.', 'Provocation 3 tours et bouclier de 20 % des PV.'),
    // Pièges posés d'entrée : passifs qui blessent
    'spikes': P('Premier tour', 'Pose 1 couche de Picots : chaque ennemi perd 3 % de PV à chacun de ses tours.', "Pose 3 couches de Picots d'un coup.", 'Camp ennemi'),
    'toxic-spikes': P('Premier tour', 'Pose des Pics Toxik : les ennemis de la ligne de front sont empoisonnés.', 'Empoisonne gravement tous les ennemis.', 'Camp ennemi'),
    'stealth-rock': P('Premier tour', 'Pose un Piège de Roc : chaque ennemi perd 8 % de PV (×efficacité Roche) à son premier tour.', 'Inflige tout de suite 12 % des PV (×efficacité Roche) à chaque ennemi.', 'Camp ennemi'),
    'sticky-web': P('Premier tour', 'Pose une Toile Gluante : chaque ennemi perd 1 palier de Vitesse et 20 % de jauge à son premier tour.', 'Tous les ennemis : Vitesse −2 et −40 % de jauge.', 'Camp ennemi'),
    // Météo, champs, salles
    'rain-dance': P('Premier tour', 'Pluie 4 tours : Eau ×1,5, Feu ×0,5 ; les Eau alliés régénèrent 4 % par tour.', 'Relance la Pluie 6 tours et soigne 15 % des PV des Eau alliés.', 'Terrain'),
    'sunny-day': P('Premier tour', 'Soleil 4 tours : Feu ×1,5, Eau ×0,5.', 'Relance le Soleil 6 tours et +20 % de jauge aux Feu et Plante alliés.', 'Terrain'),
    'sandstorm': P('Premier tour', 'Tempête de sable 4 tours : 6 % de dégâts par tour sauf Roche, Sol, Acier ; Déf. Spé. des Roche ×1,5.', 'Relance la tempête 6 tours ; les Roche alliés gagnent un bouclier de 15 %.', 'Terrain'),
    'hail': P('Premier tour', 'Grêle 4 tours : 6 % de dégâts par tour sauf aux Glace.', 'Relance la grêle 6 tours ; les Glace alliés gagnent +30 % de jauge.', 'Terrain'),
    'snowscape': P('Premier tour', 'Neige 4 tours : Défense des Glace ×1,5.', 'Relance la neige 6 tours ; les Glace alliés gagnent un bouclier de 15 %.', 'Terrain'),
    'shadow-sky': P('Premier tour', 'Ciel Ombre 4 tours : 6 % de dégâts par tour aux non-Ombre.', 'Relance le Ciel Ombre 6 tours et Atq. Spé. +1 aux Ombre alliés.', 'Terrain'),
    'grassy-terrain': P('Premier tour', 'Champ Herbu 4 tours : tous les Pokémon régénèrent 6 % par tour ; Plante ×1,3.', "Relance le Champ Herbu 6 tours et soigne 20 % des PV de l'équipe.", 'Terrain'),
    'electric-terrain': P('Premier tour', "Champ Électrifié 4 tours : personne ne s'endort ; Électrik ×1,3.", "Relance le champ 6 tours et +25 % de jauge pour l'équipe.", 'Terrain'),
    'misty-terrain': P('Premier tour', "Champ Brumeux 4 tours : aucune altération d'état ; Dragon ×0,5.", "Relance le champ 6 tours et purge les altérations de l'équipe.", 'Terrain'),
    'psychic-terrain': P('Premier tour', 'Champ Psychique 4 tours : les attaques prioritaires échouent ; Psy ×1,3.', "Relance le champ 6 tours et Atq. Spé. +1 pour l'équipe.", 'Terrain'),
    'trick-room': P('Premier tour', 'Distorsion 4 tours : les plus lents remplissent leur jauge le plus vite.', "Relance la Distorsion 6 tours et +30 % de jauge à l'allié le plus lent.", 'Terrain'),
    'wonder-room': P('Premier tour', 'Zone Étrange 4 tours : Défense et Déf. Spé. sont inversées.', 'Relance la zone 6 tours.', 'Terrain'),
    'magic-room': P('Premier tour', "Zone Magique 4 tours : les objets tenus n'ont plus d'effet.", 'Relance la zone 6 tours.', 'Terrain'),
    'gravity': P('Premier tour', 'Gravité 4 tours : Précision +2 pour tous, plus de lévitation.', 'Relance la Gravité 6 tours ; les ennemis perdent 20 % de jauge.', 'Terrain'),
    'mud-sport': P('Premier tour', 'Lance-Boue 4 tours : attaques Électrik ×0,5 pour tous.', 'Lance-Boue 6 tours et Vitesse −1 aux ennemis.', 'Terrain'),
    'water-sport': P('Premier tour', 'Tourniquet 4 tours : attaques Feu ×0,5 pour tous.', 'Tourniquet 6 tours et régénération de 4 % par tour pour l\'équipe.', 'Terrain'),
    'fairy-lock': P('Premier tour', 'Verrou Enchanté 2 tours : personne ne peut changer de ligne.', 'Verrou 3 tours et −20 % de jauge aux ennemis.', 'Terrain'),
    // Chaque tour : régénération
    'aqua-ring': P('Chaque tour', 'Régénère 6 % de ses PV max.', "Toute l'équipe régénère 6 % des PV par tour pendant 4 tours."),
    'ingrain': P('Chaque tour', 'Régénère 8 % de ses PV max ; ne peut pas être déplacé ni repoussé.', 'Soigne 40 % des PV et purge ses altérations.'),
    'laser-focus': P('Chaque tour', '1 chance sur 3 que sa prochaine attaque soit un coup critique.', 'Ses 2 prochaines attaques sont des coups critiques.'),
    // Aura permanente pour les voisins
    'helping-hand': P('Aura', 'Ses voisins de ligne font +20 % de dégâts.', 'Toute l\'équipe fait +30 % de dégâts pendant 3 tours.', 'Voisins de ligne'),
    'aromatic-mist': P('Aura', 'Ses voisins de ligne ont Déf. Spé. +1 et régénèrent 3 % par tour.', "Déf. Spé. +1 et régénération de 5 % par tour pour l'équipe pendant 3 tours.", 'Voisins de ligne'),
    // Sous 50 % de PV (une fois)
    'withdraw': P('Sous 50 % de PV (1 fois)', 'Se retire dans sa carapace : Défense +1 et bouclier de 30 % des PV.', 'Bouclier de 40 % des PV et soigne 15 %.'),
    'recycle': P('Sous 50 % de PV (1 fois)', 'Remange sa baie déjà consommée (sinon soigne 20 % des PV).', 'Soigne 35 % des PV et récupère sa baie.'),
    'stuff-cheeks': P('Sous 50 % de PV (1 fois)', 'Mange sa baie : Défense +2 et soigne 20 % des PV.', 'Défense +2 et soigne 40 % des PV.'),
    // Après avoir subi des dégâts
    'rage': P('Après avoir subi des dégâts', 'Frénésie : Attaque +1 (jusqu\'à +3).', 'Attaque +3 et +30 % de jauge.'),
    'counter': P('Après avoir subi des dégâts', 'Riposte : renvoie 75 % des dégâts physiques reçus à leur auteur.', 'Riposte ×2 pendant 2 tours.'),
    'mirror-coat': P('Après avoir subi des dégâts', 'Voile Miroir : renvoie 75 % des dégâts spéciaux reçus à leur auteur.', 'Renvoie ×2 pendant 2 tours.'),
    'metal-burst': P('Après avoir subi des dégâts', 'Renvoie 50 % de tous les dégâts reçus à leur auteur.', 'Renvoie 100 % des dégâts pendant 2 tours.'),
    'comeuppance': P('Après avoir subi des dégâts', 'Renvoie 50 % des dégâts reçus à leur auteur.', 'Renvoie 100 % des dégâts pendant 2 tours.'),
    'bide': P('Après avoir subi des dégâts', "Accumule les dégâts reçus ; tous les 3 tours, les renvoie ×1,5 à l'ennemi le plus proche.", "Relâche aussitôt l'énergie accumulée ×2 sur tous les ennemis."),
    'shell-trap': P('Après avoir subi des dégâts', 'Piège Carapace : touché au contact, il explose (dégâts Feu sur la ligne de front ennemie).', 'Explose aussitôt sur tous les ennemis.'),
    'beak-blast': P('Après avoir subi des dégâts', 'Bec-Canon chauffé : tout attaquant au contact est brûlé.', 'Brûle tous les ennemis de la ligne de front.'),
    // Altérations, statut et K.O.
    'refresh': P('Après une altération', 'Purge aussitôt son altération et soigne 10 % des PV (une fois tous les 3 tours).', "Purge et soigne 20 % des PV de toute l'équipe."),
    'magic-coat': P('Quand il est visé par un statut', "Renvoie la première capacité de statut qui le vise (une fois tous les 3 tours).", "Renvoie toutes les capacités de statut ennemies pendant 3 tours."),
    'snatch': P('Premier bonus ennemi', 'Vole le premier bonus de stats que se donne un ennemi.', 'Vole tous les bonus de stats des ennemis.'),
    'endure': P('Coup fatal (1 fois)', 'Survit avec 1 PV.', 'Survit avec 1 PV puis récupère 30 % de ses PV.'),
    'destiny-bond': P('À sa mise K.O. (1 fois)', 'Son agresseur est mis K.O. avec lui (boss : perd 40 % de ses PV max).', 'Effet immédiat sur le prochain attaquant pendant 2 tours.'),
    'grudge': P('À sa mise K.O.', "L'attaque qui l'a mis K.O. devient inutilisable pour l'agresseur.", 'Toutes les attaques de son agresseur sont bloquées 2 tours.'),
    // Fin du combat
    'happy-hour': P('Fin du combat', "L'argent gagné est doublé.", "L'argent gagné est triplé.", "Toute l'équipe"),
};

// ---------------------------------------------------------------------------
// TACTIQUES ajustées à la main (soins, boucliers, jauge, vitesse)
// ---------------------------------------------------------------------------
const T = (standard, z, target) => ({ standard, z, target });
// Formes des soins et boucliers sur ta propre grille
const SUPPORT_SHAPE = {
    'heal-pulse': 'soin_cible', 'floral-healing': 'soin_cible', 'wish': 'soin_cible', 'pollen-puff': 'soin_eclabous',
    'life-dew': 'soin_onde', 'jungle-healing': 'soin_onde', 'lunar-blessing': 'soin_onde',
    'reflect': 'bouclier_front', 'light-screen': 'bouclier_front', 'aurora-veil': 'bouclier_front', 'mat-block': 'bouclier_front',
    'wide-guard': 'garde_colonne',
};
// Déplacements par des capacités de statut (formation qui bouge sous l'effet des capacités)
const MOVE_TACTICS = {
    'teleport': ["Téléport : le lanceur se téléporte sur une case libre de son camp (ou échange sa place avec l'allié le plus en arrière) et gagne +30 % de jauge.", "Téléporte tout le monde : chaque allié peut changer de case, et l'équipe gagne +30 % de jauge."],
    'ally-switch': ["Interversion : échange sa place avec n'importe quel allié et gagne +20 % de jauge.", "Échange sa place avec un allié, et tous deux gagnent +40 % de jauge."],
    'baton-pass': ["Relais : échange sa place avec l'allié le plus en arrière et lui transmet ses bonus de stats.", "Transmet ses bonus à toute sa colonne puis passe à l'arrière."],
    'parting-shot': ["Dernier Mot : Attaque et Atq. Spé. −1 à la cible, puis le lanceur échange sa place avec l'allié de sa colonne qui a le plus de PV.", "Malus sur toute la ligne de la cible, puis relais."],
    'shed-tail': ["Queulonage : sacrifie 50 % de ses PV, l'allié de derrière reçoit un bouclier de 50 % de ses PV, puis ils échangent leur place.", 'Sans coût en PV.'],
    'chilly-reception': ["Accueil Glacial : déclenche la neige 4 tours, puis le lanceur échange sa place avec l'allié de sa colonne qui a le plus de PV.", 'Neige 6 tours et relais.'],
    'whirlwind': ["Cyclone : projette la cible au fond de sa colonne et lui retire 30 % de jauge ; si la case derrière est occupée, choc de 15 % des PV max pour les deux.", 'Souffle toute la ligne avant ennemie au fond de ses colonnes.'],
    'roar': ["Hurlement : projette la cible au fond de sa colonne et lui retire 30 % de jauge ; si la case derrière est occupée, choc de 15 % des PV max pour les deux.", 'Repousse toute la ligne avant ennemie et lui retire 40 % de jauge.'],
    'telekinesis': ["Lévikinésie : soulève une cible de n'importe quelle case, la ramène d'une ligne vers l'avant ; elle ne peut plus esquiver pendant 3 tours.", 'Attire la cible jusque sur la ligne avant et Défense −1.'],
    'block': ["Barrage : la cible ne peut plus être déplacée ni changer de place pendant 4 tours, et perd 10 % de jauge.", 'Bloque toute la ligne de la cible.'],
    'mean-look': ["Regard Noir : la cible ne peut plus être déplacée ni changer de place pendant 4 tours, et perd 10 % de jauge.", 'Bloque toute la ligne de la cible.'],
    'spider-web': ["Toile : la cible ne peut plus être déplacée pendant 4 tours ; Vitesse −1 et −20 % de jauge.", 'Bloque et ralentit toute la ligne de la cible.'],
};
const TACTICS = {
    'agility': T('Vitesse +2 et +40 % de jauge tout de suite.', 'Vitesse +3 et rejoue immédiatement (jauge à 100 %).'),
    'rock-polish': T('Vitesse +2 et +40 % de jauge tout de suite.', 'Vitesse +3 et rejoue immédiatement (jauge à 100 %).'),
    'autotomize': T('Vitesse +2 et +40 % de jauge ; perd 10 % de PV max (allègement).', 'Vitesse +3 et rejoue immédiatement.'),
    'tailwind': T("Arrière-vent 4 tours : Vitesse +1 et +30 % de jauge tout de suite pour l'équipe.", "Arrière-vent 6 tours : Vitesse +2 et +50 % de jauge pour l'équipe.", "Toute l'équipe"),
    'after-you': T('Un allié agit immédiatement (sa jauge passe à 100 %).', 'Deux alliés agissent immédiatement.', 'Un allié'),
    'instruct': T("L'allié qui vient d'agir rejoue sa dernière attaque tout de suite.", "L'allié rejoue sa dernière attaque deux fois.", 'Un allié'),
    'quash': T('La cible perd 60 % de sa jauge.', 'Tous les ennemis perdent 50 % de jauge.', 'Une cible'),
    'speed-swap': T("Échange sa Vitesse et sa jauge d'action avec la cible.", "Échange sa Vitesse avec l'ennemi le plus rapide et rejoue tout de suite."),
    'teleport': T("Se replie à l'arrière et gagne +30 % de jauge.", "Se replie et toute l'équipe gagne +30 % de jauge."),
    'shift-gear': T('Attaque +1, Vitesse +2 et +30 % de jauge.', 'Attaque +2, Vitesse +3 et rejoue immédiatement.'),
    'dragon-dance': T('Attaque +1, Vitesse +1 et +20 % de jauge.', 'Attaque +2, Vitesse +2 et rejoue immédiatement.'),
    'quiver-dance': T('Atq. Spé., Déf. Spé. et Vitesse +1, +20 % de jauge.', 'Atq. Spé., Déf. Spé. et Vitesse +2, rejoue immédiatement.'),
    'shell-smash': T('Attaque, Atq. Spé. et Vitesse +2 ; Défense et Déf. Spé. −1 ; perd son bouclier.', 'Mêmes bonus sans les baisses, et +50 % de jauge.'),
    'reflect': T("Protection 4 tours : bouclier de 12 % des PV pour l'équipe et dégâts physiques reçus ×0,7.", "Bouclier de 25 % pour l'équipe et dégâts physiques ×0,6 pendant 6 tours.", "Toute l'équipe"),
    'light-screen': T("Mur Lumière 4 tours : bouclier de 12 % des PV pour l'équipe et dégâts spéciaux reçus ×0,7.", "Bouclier de 25 % pour l'équipe et dégâts spéciaux ×0,6 pendant 6 tours.", "Toute l'équipe"),
    'aurora-veil': T("Voile Aurore 4 tours (sous Grêle/Neige) : bouclier de 15 % et tous les dégâts ×0,7 pour l'équipe.", "Fonctionne sans grêle, bouclier de 30 % pour l'équipe.", "Toute l'équipe"),
    'substitute': T('Sacrifie 20 % de ses PV pour un bouclier de 35 % de ses PV max (bloque aussi les altérations).', 'Clone gratuit : bouclier de 50 % des PV, sans coût en PV.'),
    'shelter': T('Défense +2 et bouclier de 15 % des PV.', 'Bouclier de 30 % des PV pour lui et ses voisins de ligne.'),
    'wide-guard': T("Garde Large : bloque les attaques de zone qui touchent la colonne du lanceur jusqu'à son prochain tour.", "Garde Large 2 tours et bouclier de 15 % pour l'équipe.", "Toute l'équipe"),
    'quick-guard': T("Prévention : bloque les attaques prioritaires visant l'équipe jusqu'à son prochain tour.", "Prévention 2 tours et +20 % de jauge pour l'équipe.", "Toute l'équipe"),
    'mat-block': T("Tatamigaeshi : bloque les attaques visant l'équipe (seulement à son premier tour).", "Bloque 2 tours et bouclier de 15 % pour l'équipe.", "Toute l'équipe"),
    'crafty-shield': T("Vigilance : l'équipe est protégée des capacités de statut jusqu'à son prochain tour.", "Protection 3 tours et purge les altérations de l'équipe.", "Toute l'équipe"),
    'shed-tail': T("Sacrifie 50 % de ses PV : l'allié derrière lui reçoit un bouclier de 50 % de ses PV, puis ils échangent leur place.", 'Sans coût en PV.'),
    'heal-pulse': T("Soigne 50 % des PV de l'allié le plus blessé.", "Soigne 75 % des PV de l'allié le plus blessé et le purge.", 'Allié le plus blessé'),
    'floral-healing': T("Soigne 50 % des PV de l'allié le plus blessé (66 % sur Champ Herbu).", "Soigne 80 % des PV de l'allié le plus blessé.", 'Allié le plus blessé'),
    'life-dew': T("Soigne 25 % des PV de toute l'équipe.", "Soigne 40 % des PV de l'équipe et purge les altérations.", "Toute l'équipe"),
    'jungle-healing': T("Soigne 25 % des PV de l'équipe et purge les altérations.", "Soigne 40 %, purge et régénère 5 % par tour pendant 3 tours.", "Toute l'équipe"),
    'lunar-blessing': T("Soigne 25 % des PV de l'équipe et purge les altérations.", "Soigne 40 % des PV de l'équipe et bouclier de 10 %.", "Toute l'équipe"),
    'heal-bell': T("Purge les altérations de l'équipe et régénère 3 % par tour pendant 3 tours.", "Purge l'équipe et soigne 25 % des PV.", "Toute l'équipe"),
    'aromatherapy': T("Purge les altérations de l'équipe et régénère 3 % par tour pendant 3 tours.", "Purge l'équipe et soigne 25 % des PV.", "Toute l'équipe"),
    'wish': T("Vœu : dans 2 tours, l'allié le plus blessé récupère 50 % des PV max du lanceur.", "Vœu immédiat pour toute l'équipe (30 % des PV).", 'Allié le plus blessé'),
    'rest': T('Récupère 100 % des PV et purge ses altérations, puis dort 2 tours.', "Récupère 100 % des PV sans s'endormir."),
    'purify': T('Purge la cible de ses altérations ; le lanceur récupère 50 % de ses PV.', "Purge toute l'équipe et le lanceur récupère 50 %."),
    'healing-wish': T("Se sacrifie : l'allié le plus blessé récupère tous ses PV et est purgé.", "Se sacrifie : toute l'équipe récupère 50 % des PV."),
    'lunar-dance': T("Se sacrifie : l'allié le plus blessé récupère tous ses PV, est purgé et gagne +50 % de jauge.", "Se sacrifie : l'équipe récupère 50 % des PV et +30 % de jauge."),
    'revival-blessing': T('Ranime un allié K.O. avec 50 % de ses PV.', 'Ranime un allié K.O. avec tous ses PV.', 'Allié K.O.'),
    'strength-sap': T("Récupère des PV égaux à l'Attaque de la cible, puis Attaque −1 pour la cible.", 'Même effet sur tous les ennemis (soin plafonné à 100 %).'),
    'pain-split': T('Partage les PV : le lanceur et la cible prennent la moyenne de leurs PV.', "Partage avec l'ennemi qui a le plus de PV, et bouclier de 15 %."),
    'leech-seed': T("Vampigraine : la cible perd 8 % de PV par tour, rendus au lanceur (ou à l'allié le plus blessé).", 'Plante une Vampigraine sur tous les ennemis.'),
    'teatime': T('Chaque Pokémon mange sa baie ; les alliés récupèrent en plus 15 % des PV.', 'Seuls les alliés mangent leur baie et récupèrent 30 % des PV.', 'Tout le terrain'),
    'swallow': T('Avale : soigne 25 / 50 / 100 % des PV selon le nombre de Stockage (1 / 2 / 3).', 'Soigne 100 % des PV et garde ses Stockages.'),
    'stockpile': T('Stockage (3 max) : Défense et Déf. Spé. +1 et bouclier de 5 % par Stockage.', '3 Stockages d\'un coup et bouclier de 20 %.'),
};

// ---------------------------------------------------------------------------
// Texte « avant » (officiel), lisible
// ---------------------------------------------------------------------------
function officialSummary(o) {
    if (!o) return '';
    const bits = [];
    if (o.power) bits.push(`Puissance ${o.power}`);
    if (o.accuracy) bits.push(`Préc. ${o.accuracy} %`);
    if (o.priority) bits.push(`Priorité ${sgn(o.priority)}`);
    if (o.hits) bits.push(`${o.hits[0] === o.hits[1] ? o.hits[0] : `${o.hits[0]}–${o.hits[1]}`} coups`);
    if (o.ailment && o.ailment_chance) bits.push(`${cap(AILMENT_FR[o.ailment]?.split(' (')[0] || o.ailment)} ${o.ailment_chance} %`);
    else if (o.ailment) bits.push(cap(AILMENT_FR[o.ailment]?.split(' (')[0] || o.ailment));
    if (o.flinch_chance) bits.push(`Peur ${o.flinch_chance} %`);
    if (o.stat_changes.length) bits.push(`${stages(o.stat_changes)}${o.stat_chance && o.stat_chance < 100 ? ` (${o.stat_chance} %)` : ''}`);
    if (o.drain > 0) bits.push(`Drain ${o.drain} %`);
    if (o.drain < 0) bits.push(`Contrecoup ${-o.drain} %`);
    if (o.healing > 0) bits.push(`Soin ${o.healing} %`);
    if (o.crit_rate) bits.push(`Critique +${o.crit_rate}`);
    bits.push(TARGET_FR[o.target] || o.target);
    return bits.join(' · ');
}

// ---------------------------------------------------------------------------
// Proposition pour une attaque (dégâts)
// ---------------------------------------------------------------------------
function attack(m, o) {
    const rules = new Set(['R1', 'R12']);
    const parts = [];
    const note = ATTACK_NOTES[m._key];
    const mech = { ...(m.mech || {}) };
    (note?.drop || []).forEach(k => delete mech[k]);
    if (POSITION[m._key]?.rule === 'R20') delete mech.recharge; // Plongée / tir : plus de recharge héritée
    if (mech.trap && o.ailment !== 'trap') delete mech.trap; // le piège ne vient que de l'effet officiel
    const chance = c => (c && c < 100 ? `${c} % de chance` : 'Toujours');
    const shapeId = shapeFor(m, o);
    const shape = SHAPES[shapeId];
    const hitsAvg = avgHits(o.hits);
    const hitsNew = shapeId === 'duo' ? 1 : hitsAvg;      // le Doublé répartit les 2 coups sur 2 cibles
    const cov = coverageOf(shapeId);
    const aoeEff = 1 + AOE_BONUS * (cov - 1);
    // Même valeur totale que l'officiel (×0,5 = échelle du jeu), à un petit bonus de zone près
    const power = o.power ? Math.max(1, Math.round(0.5 * o.power * hitsAvg * aoeEff / (hitsNew * cov))) : (o.category === 'ohko' || (m.mech || {}).ohko) ? 40 : m.power;
    rules.add('R16'); rules.add('R17');
    if (o.category === 'ohko' || mech.ohko) { rules.add('R9'); parts.push('Exécution : achève une cible sous 25 % de PV (boss : 15 %), sinon dégâts normaux.'); }
    else parts.push(power > 0 ? `Puissance ${power} ${shape.hits ? 'par projectile' : shapeId === 'duo' ? 'par coup' : shape.grid ? "au point d'impact" : ''}. ${shape.text}`.replace(' .', '.') : `Dégâts fixes. ${shape.text}`);
    const hits = o.hits; // nombre de coups officiel (le jeu actuel simulait parfois d'autres effets avec des coups multiples)
    if (hits && shapeId !== 'duo') parts.push(`Frappe ${hits[0] === hits[1] ? hits[0] : `${hits[0]} à ${hits[1]}`} fois (chaque coup entame les boucliers).`);
    if (o.priority > 0 || mech.priority) { rules.add('R6'); parts.push("Prioritaire : passe devant et rend 25 % de jauge après l'attaque."); }
    if (o.priority < 0) { rules.add('R6'); parts.push('Lente : le lanceur perd 20 % de jauge après coup.'); }
    if (o.crit_rate) parts.push(`Taux de critique +${o.crit_rate}.`);
    if (o.drain > 0) { rules.add('R7'); parts.push(`Draine ${o.drain} % des dégâts ; l'excédent devient un bouclier.`); }
    if (o.drain < 0) parts.push(`Contrecoup : ${-o.drain} % des dégâts infligés.`);
    if (o.healing > 0) parts.push(`Soigne ${o.healing} % des PV du lanceur.`);
    if (mech.recharge) parts.push('Recharge : le lanceur perd son prochain tour.');
    if (mech.selfKo) parts.push('Le lanceur est mis K.O.');
    if (mech.retreat && !POSITION[m._key]) parts.push("Le lanceur se replie à l'arrière après l'attaque.");
    if (mech.doubleIf) parts.push({ userLowHp: 'Puissance ×2 si le lanceur a moins de 50 % de PV.', userStatus: 'Puissance ×2 si le lanceur a une altération.', targetStatus: 'Puissance ×2 si la cible a une altération.', targetHalf: 'Puissance ×2 si la cible a moins de 50 % de PV.' }[mech.doubleIf] || 'Puissance ×2 sous condition.');
    if (o.ailment && o.ailment !== 'trap') parts.push(`${chance(o.ailment_chance)} : ${AILMENT_FR[o.ailment] || o.ailment}.`);
    if (o.ailment === 'trap' || mech.trap) parts.push('Piège 3 tours : la cible perd 6 % de PV par tour et ne peut pas changer de ligne.');
    if (o.flinch_chance) { rules.add('R2'); parts.push(`${chance(o.flinch_chance)} : la cible perd 30 % de jauge (peur).`); }
    if (o.stat_changes.length) {
        const self = o.category === 'damage-raise' || (o.category === 'unique' && o.stat_changes.every(([, v]) => v > 0)) || (mech.selfStat && true);
        const c = chance(o.stat_chance);
        const extra = [];
        if (self && o.stat_changes.some(([s, v]) => (s === 'DEF' || s === 'SPD') && v > 0)) { rules.add('R5'); extra.push('bouclier de 10 % des PV'); }
        if (self && o.stat_changes.some(([s, v]) => s === 'SPE' && v > 0)) { rules.add('R3'); extra.push('+20 % de jauge'); }
        if (!self && o.stat_changes.some(([s, v]) => s === 'SPE' && v < 0)) { rules.add('R4'); extra.push('−15 % de jauge'); }
        parts.push(`${c} : ${stages(o.stat_changes)}${extra.length ? ` et ${extra.join(', ')}` : ''} ${self ? 'pour le lanceur' : 'pour la cible'}.`);
    }
    if (DELAYED_MOVES[m._key]) { rules.add('R24'); parts.push(`Frappe ${DELAYED_MOVES[m._key]} tours plus tard, au début du ${DELAYED_MOVES[m._key]}e tour suivant de la cible, même si le lanceur est K.O. entre-temps. Une seule à la fois sur une même cible.`); }
    if (note) parts.push(note.text);
    const pos = POSITION[m._key];
    if (pos) { parts.push(pos.text); rules.add(pos.rule); }
    // Description d'origine du jeu seulement (pas celle déjà écrite par la refonte : la relance resterait propre)
    if (o.category === 'unique' && !note && !DELAYED_MOVES[m._key] && m.description_game && !/^(Puissance|Dégâts fixes|Exécution)/.test(m.description_game)) parts.push(`Effet spécial : ${m.description_game.replace(/\s*\(Dans PokéRoad[^)]*\)/, '')}`);

    // Version Z
    const zShapeId = SHAPE_UP[shapeId] || shapeId;
    const zShape = SHAPES[zShapeId];
    const zHits = zShapeId === 'duo' || zShapeId === 'trio' ? 1 : hitsNew;
    const zPower = power > 0 ? Math.max(1, Math.round(Z_MULT * power * hitsNew * cov / (zHits * coverageOf(zShapeId)))) : 0;
    const z = [];
    z.push(o.category === 'ohko' || mech.ohko ? 'Exécute toutes les cibles sous 35 % de PV (boss : 20 %).' : power > 0 ? `Puissance ${zPower} ${['duo', 'trio'].includes(zShapeId) ? 'par coup' : zShape.hits ? 'par projectile' : "au point d'impact"}. ${zShape.text}` : `Dégâts fixes ×2. ${zShape.text}`);
    z.push('Brise boucliers et Abri.');
    if (o.ailment || o.flinch_chance || o.stat_changes.length) z.push('Effet secondaire garanti.');
    if (mech.recharge) z.push('Sans recharge.');
    if (o.drain < 0 || mech.selfKo) z.push('Sans contrecoup.');
    if (o.priority > 0 || mech.priority) z.push('Le lanceur rejoue aussitôt.');
    if (POSITION[m._key]) z.push(POSITION[m._key].z);
    if (DELAYED_MOVES[m._key]) z.push('Frappe tout de suite.');
    z.push(Z_TYPE_BONUS[m.type] || '');
    rules.add('R15');

    const adapted = [...rules].some(r => !['R1', 'R12', 'R15', 'R16', 'R17'].includes(r));
    const acc = (o.accuracy || 100) / 100;
    const eff = effectValue(o, m.mech || {});

    // Spec exécutable (js/move-rework.js)
    const fx = [];
    const ch = c => (c && c < 100 ? c : 100); // chance en %
    if (o.ailment && AILMENT_STATUS[o.ailment] && o.ailment !== 'trap') fx.push({ op: 'status', target: 'targets', id: AILMENT_STATUS[o.ailment], chance: ch(o.ailment_chance) });
    if (o.ailment === 'infatuation') fx.push({ op: 'stat', target: 'targets', stats: { ATK: -1 }, chance: ch(o.ailment_chance) });
    if (o.ailment === 'trap' || mech.trap || shapeId === 'encercle') fx.push({ op: 'trap', target: 'targets', turns: 3 });
    if (o.flinch_chance) fx.push({ op: 'ap', target: 'targets', amount: -30, chance: ch(o.flinch_chance) });
    if (o.stat_changes.length) {
        const self = o.category === 'damage-raise' || (o.category === 'unique' && o.stat_changes.every(([, v]) => v > 0));
        const stats = Object.fromEntries(o.stat_changes.map(([k, v]) => [k, v]));
        const c = ch(o.stat_chance);
        fx.push({ op: 'stat', target: self ? 'self' : 'targets', stats, chance: c });
        if (self && o.stat_changes.some(([k, v]) => (k === 'DEF' || k === 'SPD') && v > 0)) fx.push({ op: 'shield', target: 'self', pct: 10, chance: c });
        if (self && o.stat_changes.some(([k, v]) => k === 'SPE' && v > 0)) fx.push({ op: 'ap', target: 'self', amount: 20, chance: c });
        if (!self && o.stat_changes.some(([k, v]) => k === 'SPE' && v < 0)) fx.push({ op: 'ap', target: 'targets', amount: -15, chance: c });
    }
    if (o.healing > 0) fx.push({ op: 'heal', target: 'self', pct: o.healing });
    (ATTACK_POSITION_OPS[m._key] || []).forEach(op => fx.push(op));
    const rw = {
        kind: 'attack', power, shape: shapeId, zShape: zShapeId, zPower,
        hits: shapeId === 'duo' ? null : (o.hits || null),
        fx,
        drainShield: o.drain > 0,
        priorityAP: o.priority > 0 || mech.priority ? 25 : 0,
        slowAP: o.priority < 0 ? 20 : 0,
        crit: o.crit_rate || 0,
        execute: o.category === 'ohko' || mech.ohko ? { pct: 25, boss: 15 } : null,
        anyCell: DIVE_MOVES.includes(m._key) || SNIPE_MOVES.includes(m._key) || POSITION[m._key]?.text?.startsWith('Attraction') || false,
        dive: DIVE_MOVES.includes(m._key),
        snipe: SNIPE_MOVES.includes(m._key),
        face: FACE_MOVES[m._key] || null,
        firstTurnOnly: ['fake-out', 'first-impression'].includes(m._key),
        ...(DELAYED_MOVES[m._key] ? { delay: DELAYED_MOVES[m._key] } : {}),
        drop: [...(note?.drop || []), ...(POSITION[m._key]?.rule === 'R20' ? ['recharge'] : []), ...(o.hits ? [] : ['multihit']), ...(o.ailment === 'trap' ? [] : ['trap']), ...(o.priority > 0 ? ['priority'] : [])],
        z: { power: zPower, shape: zShapeId, ops: Z_TYPE_OPS[m.type] || [], guaranteed: true, noRecharge: true, noRecoil: true, replay: o.priority > 0 || !!mech.priority },
    };
    const zCov = coverageOf(zShapeId);
    const index = o.power ? {
        official: +(0.5 * o.power * hitsAvg * acc * (1 + eff)).toFixed(1),
        proposal: +(power * hitsNew * cov * acc * (1 + eff)).toFixed(1),
        z: +(zPower * zHits * zCov * (1 + Math.max(eff, 0))).toFixed(1),
        coverage: +cov.toFixed(2), effect: +eff.toFixed(2),
    } : null;
    return {
        kind: 'Attaque',
        rw,
        zPower,
        index,
        target: shape.name + (POSITION[m._key]?.rule === 'R20' ? " (n'importe quelle case)" : shapeId === 'cible' && m._file === 'physical' ? ' (contact : ligne de front)' : ''),
        shape: shapeId,
        zShape: zShapeId,
        power,
        standard: parts.join(' '),
        zTarget: zShape.name,
        z: z.filter(Boolean).join(' '),
        change: adapted ? 'Adapté' : 'Fidèle',
        rules: [...rules],
    };
}

// ---------------------------------------------------------------------------
// Proposition pour une tactique (capacité de statut)
// ---------------------------------------------------------------------------
function tactic(m, o) {
    const rules = new Set(['R13', 'R15']);
    const target = TARGET_FR[o.target] || zoneText(m);
    let standard = '', z = '';
    const self = SELF_TARGETS.includes(o.target);
    const who = { user: 'le lanceur', 'user-and-allies': "toute l'équipe", 'all-allies': "toute l'équipe", ally: 'un allié', 'user-or-ally': 'le lanceur ou un allié', 'all-opponents': 'tous les ennemis' }[o.target] || 'la cible';
    if (o.category === 'heal') {
        rules.add('R8');
        const of = { 'le lanceur': 'du lanceur', 'la cible': 'de la cible' }[who] || `de ${who}`;
        standard = `Soigne ${o.healing || 50} % des PV ${of}, puis régénère 5 % par tour pendant 2 tours.`;
        z = `Soigne 100 % des PV ${of}, purge les altérations et bouclier de 10 %.`;
    } else if (o.category === 'ailment' || o.category === 'swagger') {
        const st = AILMENT_FR[o.ailment] || o.ailment;
        standard = `Inflige ${st}${o.accuracy ? ` (précision ${o.accuracy} %)` : ''} à ${who}.`;
        if (o.stat_changes.length) standard += ` La cible gagne aussi ${stages(o.stat_changes)}.`;
        z = `Inflige ${(st || '').split(' (')[0]} à tous les ennemis, réussite garantie.`;
    } else if (o.category === 'net-good-stats' && o.stat_changes.length) {
        const up = o.stat_changes.every(([, v]) => v > 0);
        const extra = [];
        if (self && o.stat_changes.some(([s, v]) => s === 'SPE' && v > 0)) { rules.add('R3'); extra.push('+30 % de jauge tout de suite'); }
        if (self && o.stat_changes.some(([s, v]) => (s === 'DEF' || s === 'SPD') && v > 0)) {
            rules.add('R5'); const big = o.stat_changes.some(([, v]) => v >= 2); extra.push(`bouclier de ${big ? 15 : 10} % des PV`);
        }
        if (!self && o.stat_changes.some(([s, v]) => s === 'SPE' && v < 0)) { rules.add('R4'); extra.push('−20 % de jauge'); }
        standard = `${stages(o.stat_changes)}${extra.length ? `, ${extra.join(', ')}` : ''} pour ${who}.`;
        z = up
            ? `${stages(o.stat_changes.map(([s, v]) => [s, v + 1]))} pour ${who}${self && o.target === 'user' ? ' et +1 pour ses voisins de ligne' : ''}, bouclier de 20 %.`
            : `${stages(o.stat_changes.map(([s, v]) => [s, v - 1]))} pour tous les ennemis.`;
    } else if (o.category === 'force-switch') {
        rules.add('R10');
        rules.add('R19');
        standard = "Projection : repousse la cible au fond de sa colonne et lui retire 30 % de jauge ; si la case derrière est occupée, les deux prennent 15 % de leurs PV max dans le choc.";
        z = 'Repousse toute la ligne de front ennemie et lui retire 40 % de jauge.';
    } else {
        standard = (m.description_game || m.description_fr || o.effect_fr || '').replace(/\s*\(Dans PokéRoad[^)]*\)/, '');
        z = "Effet doublé (durée ou puissance) et +30 % de jauge pour le lanceur.";
    }
    z = `${z} ${Z_TYPE_SUPPORT[m.type] || ''}`.trim();
    // Spec exécutable : le comportement actuel du jeu (effect / ops) est gardé, on ajoute les adaptations
    const tgt = { user: 'self', 'user-and-allies': 'allies', 'all-allies': 'allies', ally: 'bestAlly', 'user-or-ally': 'self', 'all-opponents': 'enemies' }[o.target] || 'target';
    const extraOps = [], zOps = [];
    if (o.category === 'heal') {
        extraOps.push({ op: 'regen', target: tgt, pct: 5, turns: 2 });
        zOps.push({ op: 'heal', target: tgt, pct: 100 }, { op: 'cleanse', target: tgt }, { op: 'shield', target: tgt, pct: 10 });
    } else if (o.category === 'ailment' || o.category === 'swagger') {
        const id = AILMENT_STATUS[o.ailment];
        if (id) zOps.push({ op: 'status', target: 'enemies', id, chance: 100 });
        if (o.stat_changes.length) zOps.push({ op: 'stat', target: 'enemies', stats: Object.fromEntries(o.stat_changes) });
    } else if (o.category === 'net-good-stats' && o.stat_changes.length) {
        const up = o.stat_changes.every(([, v]) => v > 0);
        if (self && o.stat_changes.some(([k, v]) => k === 'SPE' && v > 0)) extraOps.push({ op: 'ap', target: tgt, amount: 30 });
        if (self && o.stat_changes.some(([k, v]) => (k === 'DEF' || k === 'SPD') && v > 0)) extraOps.push({ op: 'shield', target: tgt, pct: o.stat_changes.some(([, v]) => v >= 2) ? 15 : 10 });
        if (!self && o.stat_changes.some(([k, v]) => k === 'SPE' && v < 0)) extraOps.push({ op: 'ap', target: tgt === 'target' ? 'target' : 'enemies', amount: -20 });
        if (up) zOps.push({ op: 'stat', target: tgt, stats: Object.fromEntries(o.stat_changes.map(([k, v]) => [k, v + 1])) }, ...(o.target === 'user' ? [{ op: 'stat', target: 'neighbors', stats: Object.fromEntries(o.stat_changes.map(([k]) => [k, 1])) }] : []), { op: 'shield', target: tgt, pct: 20 });
        else zOps.push({ op: 'stat', target: 'enemies', stats: Object.fromEntries(o.stat_changes.map(([k, v]) => [k, v - 1])) });
    } else if (o.category === 'force-switch') {
        extraOps.push({ op: 'project', target: 'target' }, { op: 'ap', target: 'target', amount: -30 });
        zOps.push({ op: 'project', target: 'frontEnemies' }, { op: 'ap', target: 'frontEnemies', amount: -40 });
    } else {
        zOps.push({ op: 'repeat' }, { op: 'ap', target: 'self', amount: 30 });
    }
    zOps.push(...(Z_TYPE_SUPPORT_OPS[m.type] || []));
    const rw = { kind: 'tactic', keepOriginal: true, extraOps, z: { ops: zOps } };
    const adapted = [...rules].some(r => !['R13', 'R15'].includes(r));
    return { kind: 'Tactique', rw, target, standard, zTarget: target, z, change: adapted ? 'Adapté' : 'Fidèle', rules: [...rules] };
}

// ---------------------------------------------------------------------------
const rows = [];
for (const m of Object.values(game)) {
    const o = official[m._key];
    let p;
    if (PASSIVES[m._key]) {
        const pa = PASSIVES[m._key];
        const po = PASSIVE_OPS[m._key] || { trigger: 'start', ops: [], z: [] };
        const rwPassive = { kind: 'passive', ...po, z: { ops: [...(po.z || []), ...(Z_TYPE_SUPPORT_OPS[m.type] || [])] } };
        p = { kind: 'Passif', rw: rwPassive, trigger: pa.trigger, target: pa.target, standard: pa.standard, zTarget: pa.target, z: `Éveil : ${pa.z}`, change: m._file === 'status' ? 'Devient passif' : 'Attaque → passif', rules: ['R11', 'R14'].filter(r => r === 'R14' || pa.trigger === 'Premier tour') };
    } else if (TACTICS[m._key] && !MOVE_TACTICS[m._key]) {
        const t = TACTICS[m._key];
        const target = t.target || TARGET_FR[o.target] || zoneText(m);
        const shape = SUPPORT_SHAPE[m._key] || null;
        const to = TACTIC_OPS[m._key];
        const rwTactic = to ? { kind: 'tactic', ops: to.ops, z: { ops: [...to.z, ...(Z_TYPE_SUPPORT_OPS[m.type] || [])] } } : { kind: 'tactic', keepOriginal: true, extraOps: [], z: { ops: [{ op: 'repeat' }, ...(Z_TYPE_SUPPORT_OPS[m.type] || [])] } };
        p = { kind: 'Tactique', rw: rwTactic, target: shape ? SHAPES[shape].name : target, shape, zShape: shape ? (SHAPE_UP[shape] || shape) : null, standard: t.standard + (shape ? ` ${SHAPES[shape].text}` : ''), zTarget: shape ? SHAPES[SHAPE_UP[shape] || shape].name : target, z: `${t.z} ${Z_TYPE_SUPPORT[m.type] || ''}`.trim(), change: 'Adapté', rules: ['R13', 'R15', ...(shape ? ['R22'] : [])] };
    } else if (MOVE_TACTICS[m._key]) {
        const [standard, z] = MOVE_TACTICS[m._key];
        const to = TACTIC_OPS[m._key] || { ops: [], z: [] };
        p = { kind: 'Tactique', rw: { kind: 'tactic', ops: to.ops, z: { ops: [...to.z, ...(Z_TYPE_SUPPORT_OPS[m.type] || [])] } }, target: TARGET_FR[o.target] || zoneText(m), standard, zTarget: TARGET_FR[o.target] || zoneText(m), z: `${z} ${Z_TYPE_SUPPORT[m.type] || ''}`.trim(), change: 'Adapté', rules: ['R19', 'R13', 'R15'] };
    } else if (o.damage_class === 'status' && !(m.power > 0)) {
        p = tactic(m, o);
    } else {
        p = attack(m, o);
    }
    rows.push({
        key: m._key,
        name: m.name_fr || o.name_fr,
        type: TYPE_FR[m.type] || m.type,
        category: { physical: 'Physique', special: 'Spéciale', status: 'Statut' }[m._file],
        learners: (learners[m._key] || []).length,
        ct: ctByName[(m.name_fr || '').toLowerCase()] || null,
        official: { summary: officialSummary(o), effect: o.effect_fr || o.effect_en || '', flavor: o.flavor_fr || '', generation: o.generation, raw: o },
        current: {
            power: m.power ?? null, accuracy: m.accuracy ?? null, aoe: m.aoe, zone: m.zone, target: zoneText(m),
            effect: m.effect || null, effect_chance: m.effect_chance ?? null, mech: m.mech || null, ops: m.ops || null,
            description: (m.description_game || m.description_fr || '').replace(/\s*\(Dans PokéRoad[^)]*\)/, ''),
        },
        proposal: p,
    });
}
rows.sort((a, b) => a.type.localeCompare(b.type, 'fr') || a.name.localeCompare(b.name, 'fr'));
const balance = {};
['Physique', 'Spéciale'].forEach(cat => {
    const list = rows.filter(r => r.category === cat && r.proposal.index);
    const avg = f => +(list.reduce((a, r) => a + f(r), 0) / list.length).toFixed(1);
    balance[cat] = {
        count: list.length,
        officialIndex: avg(r => r.proposal.index.official),
        proposalIndex: avg(r => r.proposal.index.proposal),
        zIndex: avg(r => r.proposal.index.z),
        impactPower: avg(r => r.proposal.power || 0),
        coverage: avg(r => r.proposal.index.coverage),
        zone: +(list.filter(r => r.proposal.index.coverage > 1).length / list.length * 100).toFixed(0),
    };
});
fs.writeFileSync('data/moves_db.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 10), rules: RULES, shapes: SHAPES, balance, moves: rows }, null, 1));
console.log('Équilibre :', JSON.stringify(balance));

const count = (f) => rows.filter(f).length;
console.log(`${rows.length} capacités : ${count(r => r.proposal.kind === 'Attaque')} attaques, ${count(r => r.proposal.kind === 'Tactique')} tactiques, ${count(r => r.proposal.kind === 'Passif')} passifs.`);
console.log(`Fidèles : ${count(r => r.proposal.change === 'Fidèle')} · adaptées : ${count(r => r.proposal.change === 'Adapté')} · passifs : ${count(r => r.proposal.kind === 'Passif')}`);
