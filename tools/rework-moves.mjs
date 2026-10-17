// Donne un comportement réel à chaque capacité dans le moteur de PokéRoad.
//  - capacités de statut sans effet : « ops » déclaratives (js/battle-rules.js)
//  - attaques offensives : « mech » (multi-coups, vol de vie, contrecoup, priorité, recharge, piège…)
//  - description_game : ce que fait réellement la capacité dans PokéRoad (affichée en jeu)
// Rejouable : les valeurs sont recalculées à chaque exécution.
// Usage : node tools/rework-moves.mjs
import fs from 'fs';

const FILES = ['data/physical_moves.json', 'data/special_moves.json', 'data/status_moves.json'];

// ---------------------------------------------------------------------------
// Capacités de statut : ops + description en jeu (+ zone/aoe si nécessaire)
// ---------------------------------------------------------------------------
const S = (stats) => ({ op: 'stat', target: 'self', stats });
const T = (stats) => ({ op: 'stat', target: 'target', stats });
const A = (stats) => ({ op: 'stat', target: 'allies', stats });
const FIELD = { zone: 'self', aoe: 'single', accuracy: null };

const STATUS = {
    'splash': { ops: [{ op: 'gainZ', target: 'self', amount: 20 }], game: "Ne fait rien… à part remplir un peu la jauge Z du lanceur.", ...FIELD },
    'metronome': { ops: [{ op: 'callMove', mode: 'random' }], game: 'Utilise une attaque offensive tirée au hasard.' },
    'transform': { ops: [{ op: 'transform' }], game: 'Copie les stats, les types, les attaques et les bonus de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'mirror-move': { ops: [{ op: 'callMove', mode: 'targetLast' }], game: 'Utilise la dernière capacité employée par la cible.', zone: 'enemy', aoe: 'single' },
    'curse': { ops: [{ op: 'ifType', who: 'self', type: 'ghost', then: [{ op: 'hpCost', pct: 50 }, { op: 'flag', target: 'target', id: 'curse', turns: 99, label: 'Maudit', debuff: true }], else: [S({ SPE: -1, ATK: 1, DEF: 1 })] }], game: "Spectre : sacrifie 50 % de ses PV pour maudire la cible (−25 % PV par tour). Autres : Vitesse −1, Attaque et Défense +1.", zone: 'enemy', aoe: 'single', accuracy: null },
    'perish-song': { ops: [{ op: 'flag', target: 'all', id: 'perish', turns: 3, label: 'Requiem' }], game: 'Dans 3 tours, chaque Pokémon sur le terrain perd la moitié de ses PV max.', ...FIELD },
    'spikes': { ops: [{ op: 'hazard', type: 'spikes' }], game: "Pose des Picots chez l'adversaire : chaque ennemi perd 3 % de PV par couche à chacun de ses tours (3 couches max).", ...FIELD },
    'conversion': { ops: [{ op: 'setType', target: 'self', mode: 'firstMove' }], game: 'Le lanceur prend le type de sa première attaque.', ...FIELD },
    'sketch': { ops: [{ op: 'callMove', mode: 'last' }], game: 'Reproduit la dernière capacité utilisée sur le terrain.', ...FIELD },
    'conversion-2': { ops: [{ op: 'setType', target: 'self', mode: 'resistTarget' }], game: 'Le lanceur prend un type qui résiste au type principal de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'destiny-bond': { ops: [{ op: 'flag', target: 'self', id: 'destinyBond', turns: 1, label: 'Lien du Destin' }], game: "Jusqu'à son prochain tour, si le lanceur est mis K.O., son agresseur l'est aussi.", ...FIELD },
    'baton-pass': { ops: [{ op: 'swapAlly', with: 'back', transferStages: true }], game: "Échange sa place avec l'allié le plus en arrière et lui transmet ses bonus de stats.", ...FIELD },
    'psych-up': { ops: [{ op: 'copyStages', target: 'target' }], game: 'Copie les modifications de stats de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'sleep-talk': { ops: [{ op: 'callMove', mode: 'own' }], game: 'Utilise une de ses attaques offensives au hasard.', ...FIELD },
    'rain-dance': { ops: [{ op: 'weather', type: 'rain', rounds: 5 }], game: 'Pluie pendant 5 tours : attaques Eau ×1,5, attaques Feu ×0,5.', ...FIELD },
    'sunny-day': { ops: [{ op: 'weather', type: 'sun', rounds: 5 }], game: 'Soleil pendant 5 tours : attaques Feu ×1,5, attaques Eau ×0,5.', ...FIELD },
    'hail': { ops: [{ op: 'weather', type: 'hail', rounds: 5 }], game: 'Grêle pendant 5 tours : tout Pokémon non Glace perd 6 % de PV à chaque tour.', ...FIELD },
    'sandstorm': { ops: [{ op: 'weather', type: 'sand', rounds: 5 }], effect: '', game: 'Tempête de sable pendant 5 tours : 6 % de dégâts par tour sauf Roche, Sol et Acier ; Déf. Spé. des Roche ×1,5.', ...FIELD },
    'snowscape': { ops: [{ op: 'weather', type: 'snow', rounds: 5 }], game: 'Neige pendant 5 tours : Défense des Pokémon Glace ×1,5.', ...FIELD },
    'chilly-reception': { ops: [{ op: 'weather', type: 'snow', rounds: 5 }, { op: 'moveToBack' }], game: 'Déclenche la neige pour 5 tours puis le lanceur se replie à l\'arrière.', ...FIELD },
    'shadow-sky': { ops: [{ op: 'weather', type: 'shadow', rounds: 5 }], game: 'Ciel Ombre pendant 5 tours : tout Pokémon non Obscur-Ombre perd 6 % de PV par tour.', ...FIELD },
    'pain-split': { ops: [{ op: 'splitHp', target: 'target' }], game: 'Le lanceur et la cible partagent équitablement leurs PV actuels.', zone: 'enemy', aoe: 'single', accuracy: null },
    'assist': { ops: [{ op: 'callMove', mode: 'ally' }], game: "Utilise au hasard une attaque offensive d'un allié.", ...FIELD },
    'trick': { ops: [{ op: 'swapItems', target: 'target' }], game: 'Échange son objet tenu avec celui de la cible.', zone: 'enemy', aoe: 'single' },
    'switcheroo': { ops: [{ op: 'swapItems', target: 'target' }], game: 'Échange son objet tenu avec celui de la cible.', zone: 'enemy', aoe: 'single' },
    'bestow': { ops: [{ op: 'giveItem' }], game: "Donne son objet tenu à l'allié le plus blessé qui n'en a pas.", ...FIELD },
    'role-play': { ops: [{ op: 'role', mode: 'copy' }], game: 'Copie le rôle de la cible (Tank, Attaquant…) pour le reste du combat.', zone: 'enemy', aoe: 'single', accuracy: null },
    'skill-swap': { ops: [{ op: 'role', mode: 'swap' }], game: 'Échange son rôle avec celui de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'doodle': { ops: [{ op: 'role', mode: 'spread' }], game: 'Tous les alliés prennent le rôle de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'nature-power': { ops: [{ op: 'callMove', mode: 'byTerrain' }], game: 'Lance une attaque qui dépend du champ : Éco-Sphère, Tonnerre, Psyko, Pouvoir Lunaire, ou Triplattaque sans champ.', ...FIELD },
    'grudge': { ops: [{ op: 'flag', target: 'self', id: 'grudge', turns: 1, label: 'Rancune' }], game: "Si le lanceur est mis K.O. avant son prochain tour, l'agresseur perd sa jauge Z et 2 paliers d'Attaque et d'Att. Spé.", ...FIELD },
    'snatch': { ops: [{ op: 'stealPositiveStages', target: 'target' }], game: 'Vole tous les bonus de stats de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'imprison': { ops: [{ op: 'imprison', turns: 3 }], game: 'Pendant 3 tours, les ennemis ne peuvent pas utiliser les capacités que le lanceur connaît.', ...FIELD },
    'gravity': { ops: [{ op: 'room', type: 'gravity', rounds: 5 }], game: 'Gravité pendant 5 tours : précision de toutes les attaques ×1,3.', ...FIELD },
    'psycho-shift': { ops: [{ op: 'transferStatus', target: 'target' }], game: 'Transfère son statut (poison, brûlure…) à la cible et en guérit.', zone: 'enemy', aoe: 'single' },
    'healing-wish': { ops: [{ op: 'healMostWounded', pct: 100, cleanse: true }, { op: 'selfKo' }], game: "Le lanceur tombe K.O. pour soigner entièrement l'allié le plus blessé et ses statuts.", ...FIELD },
    'lunar-dance': { ops: [{ op: 'healMostWounded', pct: 100, cleanse: true }, { op: 'selfKo' }], game: "Le lanceur tombe K.O. pour soigner entièrement l'allié le plus blessé et ses statuts.", ...FIELD },
    'power-swap': { ops: [{ op: 'swapStages', target: 'target', stats: ['ATK', 'SPA'] }], game: "Échange les modifications d'Attaque et d'Att. Spé. avec la cible.", zone: 'enemy', aoe: 'single', accuracy: null },
    'guard-swap': { ops: [{ op: 'swapStages', target: 'target', stats: ['DEF', 'SPD'] }], game: 'Échange les modifications de Défense et de Déf. Spé. avec la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'heart-swap': { ops: [{ op: 'swapStages', target: 'target' }], game: 'Échange toutes les modifications de stats avec la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'worry-seed': { ops: [{ op: 'flag', target: 'target', id: 'healBlock', turns: 3, label: 'Anti-Soin', debuff: true }], game: 'La cible ne peut plus être soignée pendant 3 tours.', zone: 'enemy', aoe: 'single' },
    'me-first': { ops: [{ op: 'callMove', mode: 'targetBest', powerMult: 1.5 }], game: "Utilise l'attaque la plus puissante de la cible avec 50 % de puissance en plus.", zone: 'enemy', aoe: 'single' },
    'toxic-spikes': { ops: [{ op: 'hazard', type: 'toxic' }], game: "Pose des Pics Toxik chez l'adversaire : chaque ennemi est empoisonné à son prochain tour.", ...FIELD },
    'copycat': { ops: [{ op: 'callMove', mode: 'last' }], game: 'Reproduit la dernière capacité utilisée sur le terrain.', ...FIELD },
    'power-trick': { ops: [{ op: 'swapOwnStats', a: 'atk', b: 'def' }], game: 'Le lanceur échange son Attaque et sa Défense.', ...FIELD },
    'power-shift': { ops: [{ op: 'swapOwnStats', a: 'atk', b: 'def' }, { op: 'swapOwnStats', a: 'spa', b: 'spd' }], game: 'Le lanceur échange ses stats offensives avec ses stats défensives.', ...FIELD },
    'gastro-acid': { ops: [{ op: 'clearPositiveStages', target: 'target' }], game: 'Annule tous les bonus de stats de la cible.', zone: 'enemy', aoe: 'single' },
    'trick-room': { ops: [{ op: 'room', type: 'trick', rounds: 5 }], game: 'Distorsion pendant 5 tours : les Pokémon les plus lents agissent en premier. Relancer l\'annule.', ...FIELD },
    'wonder-room': { ops: [{ op: 'room', type: 'wonder', rounds: 5 }], game: 'Zone Étrange pendant 5 tours : Défense et Déf. Spé. sont inversées.', ...FIELD },
    'magic-room': { ops: [{ op: 'room', type: 'magic', rounds: 5 }], game: 'Zone Magique pendant 5 tours : les objets tenus sont sans effet.', ...FIELD },
    'defog': { ops: [{ op: 'clearHazards', side: 'both', alsoShields: true }, { op: 'stat', target: 'enemies', stats: { EVA: -1 } }], game: 'Balaye les pièges des deux camps et les boucliers ennemis ; Esquive des ennemis −1.', ...FIELD },
    'stealth-rock': { ops: [{ op: 'hazard', type: 'rock' }], game: "Pose un Piège de Roc chez l'adversaire : chaque ennemi perd 8 % de PV (selon son type) à son prochain tour.", ...FIELD },
    'entrainment': { ops: [{ op: 'flag', target: 'target', id: 'taunt', turns: 3, label: 'Provoqué', debuff: true }], game: "Pendant 3 tours, la cible ne peut utiliser que des attaques offensives.", zone: 'enemy', aoe: 'single' },
    'power-split': { ops: [{ op: 'splitStats', target: 'target', stats: ['atk', 'spa'] }], game: "Fait la moyenne de l'Attaque et de l'Att. Spé. du lanceur et de la cible.", zone: 'enemy', aoe: 'single', accuracy: null },
    'guard-split': { ops: [{ op: 'splitStats', target: 'target', stats: ['def', 'spd'] }], game: 'Fait la moyenne de la Défense et de la Déf. Spé. du lanceur et de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'soak': { ops: [{ op: 'setType', target: 'target', types: ['water'] }], game: 'La cible devient de type Eau.', zone: 'enemy', aoe: 'single' },
    'magic-powder': { ops: [{ op: 'setType', target: 'target', types: ['psychic'] }], game: 'La cible devient de type Psy.', zone: 'enemy', aoe: 'single' },
    'after-you': { ops: [{ op: 'gainAP', target: 'bestAlly', amount: 100 }], game: "L'allié le plus offensif joue immédiatement.", ...FIELD },
    'instruct': { ops: [{ op: 'gainAP', target: 'bestAlly', amount: 100 }], game: "L'allié le plus offensif joue immédiatement.", ...FIELD },
    'simple-beam': { ops: [{ op: 'flag', target: 'target', id: 'simple', turns: 99, label: 'Simple', debuff: true }], game: 'Toutes les modifications de stats de la cible comptent double (bonus comme malus).', zone: 'enemy', aoe: 'single' },
    'reflect-type': { ops: [{ op: 'setType', target: 'self', mode: 'copyTarget' }], game: 'Le lanceur prend les types de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'ally-switch': { ops: [{ op: 'swapAlly', with: 'any' }], game: 'Échange sa place avec un allié.', ...FIELD },
    'grassy-terrain': { ops: [{ op: 'terrain', type: 'grassy', rounds: 5 }], game: 'Champ Herbu pendant 5 tours : chacun récupère 6 % de PV par tour ; attaques Plante ×1,3.', ...FIELD },
    'electric-terrain': { ops: [{ op: 'terrain', type: 'electric', rounds: 5 }], game: 'Champ Électrifié pendant 5 tours : attaques Électrik ×1,3, personne ne peut s\'endormir.', ...FIELD },
    'psychic-terrain': { ops: [{ op: 'terrain', type: 'psychic', rounds: 5 }], game: 'Champ Psychique pendant 5 tours : attaques Psy ×1,3.', ...FIELD },
    'misty-terrain': { ops: [{ op: 'terrain', type: 'misty', rounds: 5 }], game: 'Champ Brumeux pendant 5 tours : aucun statut majeur ; attaques Dragon ×0,5.', ...FIELD },
    'protect': { ops: [{ op: 'protect', variant: 'basic' }], effect: '', game: "Bloque toutes les attaques jusqu'à son prochain tour.", ...FIELD },
    'detect': { ops: [{ op: 'protect', variant: 'basic' }], effect: '', game: "Bloque toutes les attaques jusqu'à son prochain tour.", ...FIELD },
    'kings-shield': { ops: [{ op: 'protect', variant: 'kings' }], game: "Bloque les attaques jusqu'à son prochain tour ; un agresseur au contact perd 1 palier d'Attaque.", ...FIELD },
    'spiky-shield': { ops: [{ op: 'protect', variant: 'spiky' }], game: "Bloque les attaques jusqu'à son prochain tour ; un agresseur au contact perd 1/8 de ses PV.", ...FIELD },
    'baneful-bunker': { ops: [{ op: 'protect', variant: 'baneful' }], game: "Bloque les attaques jusqu'à son prochain tour ; un agresseur au contact est empoisonné.", ...FIELD },
    'obstruct': { ops: [{ op: 'protect', variant: 'obstruct' }], game: "Bloque les attaques jusqu'à son prochain tour ; un agresseur au contact perd 2 paliers de Défense.", ...FIELD },
    'silk-trap': { ops: [{ op: 'protect', variant: 'silk' }], game: "Bloque les attaques jusqu'à son prochain tour ; un agresseur au contact perd 1 palier de Vitesse.", ...FIELD },
    'burning-bulwark': { ops: [{ op: 'protect', variant: 'burning' }], game: "Bloque les attaques jusqu'à son prochain tour ; un agresseur au contact est brûlé.", ...FIELD },
    'trick-or-treat': { ops: [{ op: 'addType', target: 'target', type: 'ghost' }], game: 'Ajoute le type Spectre à la cible.', zone: 'enemy', aoe: 'single' },
    'forests-curse': { ops: [{ op: 'addType', target: 'target', type: 'grass' }], game: 'Ajoute le type Plante à la cible.', zone: 'enemy', aoe: 'single' },
    'parting-shot': { ops: [T({ ATK: -1, SPA: -1 }), { op: 'moveToBack' }], game: "Attaque et Att. Spé. de la cible −1, puis le lanceur se replie à l'arrière.", zone: 'enemy', aoe: 'single' },
    'electrify': { ops: [{ op: 'flag', target: 'target', id: 'electrify', turns: 2, label: 'Électrisé', debuff: true }], game: 'La prochaine attaque de la cible devient de type Électrik.', zone: 'enemy', aoe: 'single' },
    'venom-drench': { ops: [{ op: 'ifStatus', target: 'targets', status: 'STAT_PSN', then: [{ op: 'stat', target: 'targets', stats: { ATK: -1, SPA: -1, SPE: -1 } }], else: [{ op: 'stat', target: 'targets', stats: { SPE: -1 } }] }], game: 'Ennemis empoisonnés : Attaque, Att. Spé. et Vitesse −1. Les autres : Vitesse −1.' },
    'fairy-lock': { ops: [{ op: 'stat', target: 'enemies', stats: { EVA: -1 } }], game: 'Enchaîne le terrain : Esquive de tous les ennemis −1.', ...FIELD },
    'ion-deluge': { ops: [{ op: 'ionDeluge' }], game: 'Pendant un tour, les attaques Normal deviennent Électrik.', ...FIELD },
    'sticky-web': { ops: [{ op: 'hazard', type: 'web' }], game: "Pose une Toile Gluante chez l'adversaire : Vitesse −1 pour chaque ennemi à son prochain tour.", ...FIELD },
    'topsy-turvy': { ops: [{ op: 'invertStages', target: 'target' }], game: 'Inverse toutes les modifications de stats de la cible.', zone: 'enemy', aoe: 'single' },
    'powder': { ops: [{ op: 'flag', target: 'target', id: 'powder', turns: 3, label: 'Poudre', debuff: true }], game: 'Si la cible utilise une attaque Feu dans les 3 tours, elle échoue et la cible perd 25 % de ses PV.', zone: 'enemy', aoe: 'single' },
    'magnetic-flux': { ops: [A({ DEF: 1, SPD: 1 })], game: 'Défense et Déf. Spé. de toute l\'équipe +1.', ...FIELD },
    'gear-up': { ops: [A({ ATK: 1, SPA: 1 })], game: 'Attaque et Att. Spé. de toute l\'équipe +1.', ...FIELD },
    'happy-hour': { ops: [{ op: 'money', mult: 2 }], game: "Double l'argent gagné à la fin du combat.", ...FIELD },
    'celebrate': { ops: [{ op: 'gainZ', target: 'allies', amount: 10 }], game: "Fait la fête : la jauge Z de toute l'équipe augmente.", ...FIELD },
    'hold-hands': { ops: [A({ CRIT: 1 })], game: "Taux de critique de toute l'équipe +1.", ...FIELD },
    'geomancy': { ops: [S({ SPA: 2, SPD: 2, SPE: 2 }), { op: 'flag', target: 'self', id: 'recharge', turns: 1 }], game: 'Att. Spé., Déf. Spé. et Vitesse +2, mais le lanceur passe son tour suivant.', ...FIELD },
    'speed-swap': { ops: [{ op: 'swapSpeed', target: 'target' }], game: 'Échange sa Vitesse avec celle de la cible.', zone: 'enemy', aoe: 'single', accuracy: null },
    'strength-sap': { ops: [{ op: 'healByTargetAtk' }], game: "Récupère autant de PV que l'Attaque de la cible, puis baisse son Attaque d'un palier.", zone: 'enemy', aoe: 'single' },
    'no-retreat': { ops: [S({ ATK: 1, DEF: 1, SPA: 1, SPD: 1, SPE: 1 })], game: 'Toutes les stats du lanceur +1.', ...FIELD },
    'stuff-cheeks': { ops: [{ op: 'heal', target: 'self', pct: 25 }, S({ DEF: 2 })], game: 'Mange une baie : récupère 25 % de ses PV et Défense +2.', ...FIELD },
    'teatime': { ops: [{ op: 'heal', target: 'all', pct: 15 }], game: 'Tous les Pokémon du terrain récupèrent 15 % de leurs PV.', ...FIELD },
    'clangorous-soul': { ops: [{ op: 'hpCost', pct: 33 }, S({ ATK: 1, DEF: 1, SPA: 1, SPD: 1, SPE: 1 })], game: 'Sacrifie 33 % de ses PV : toutes ses stats +1.', ...FIELD },
    'octolock': { ops: [{ op: 'status', target: 'target', id: 'STAT_TRAP' }, { op: 'flag', target: 'target', id: 'octolock', turns: 4, label: 'Octoprise', debuff: true }], game: 'Piège la cible : à chacun de ses tours (4 tours), elle perd PV, Défense et Déf. Spé.', zone: 'enemy', aoe: 'single' },
    'court-change': { ops: [{ op: 'swapHazards' }], game: 'Échange les pièges posés dans les deux camps.', ...FIELD },
    'fillet-away': { ops: [{ op: 'hpCost', pct: 50 }, S({ ATK: 2, SPA: 2, SPE: 2 })], game: 'Sacrifie 50 % de ses PV : Attaque, Att. Spé. et Vitesse +2.', ...FIELD },
    'tidy-up': { ops: [{ op: 'clearHazards', side: 'both' }, S({ ATK: 1, SPE: 1 })], game: 'Balaye les pièges des deux camps ; Attaque et Vitesse +1.', ...FIELD },
    'spicy-extract': { ops: [T({ ATK: 2, DEF: -2 })], game: 'Attaque de la cible +2 mais sa Défense −2.', zone: 'enemy', aoe: 'single', accuracy: null },
    'shed-tail': { ops: [{ op: 'hpCost', pct: 50 }, { op: 'shield', target: 'mostWoundedAlly', pct: 50, of: 'user' }], game: "Sacrifie 50 % de ses PV pour donner un bouclier équivalent à l'allié le plus blessé.", ...FIELD },
    'shadow-shed': { ops: [{ op: 'clearHazards', side: 'both', alsoShields: true }], game: 'Balaye les pièges des deux camps et les boucliers ennemis.', ...FIELD },

    // Classiques dont l'effet d'origine était approximatif
    'taunt': { ops: [{ op: 'flag', target: 'target', id: 'taunt', turns: 3, label: 'Provoqué', debuff: true }], effect: '', game: 'Pendant 3 tours, la cible ne peut utiliser que des attaques offensives.' },
    'follow-me': { ops: [{ op: 'flag', target: 'self', id: 'provoke', turns: 2, label: 'Par Ici !' }], effect: '', game: "Jusqu'à son prochain tour, les ennemis concentrent leurs attaques sur le lanceur.", ...FIELD },
    'rage-powder': { ops: [{ op: 'flag', target: 'self', id: 'provoke', turns: 2, label: 'Poudre Fureur' }], effect: '', game: "Jusqu'à son prochain tour, les ennemis concentrent leurs attaques sur le lanceur.", ...FIELD },
    'memento': { ops: [T({ ATK: -2, SPA: -2 }), { op: 'selfKo' }], effect: '', game: "Attaque et Att. Spé. de la cible −2, puis le lanceur tombe K.O.", zone: 'enemy', aoe: 'single' },
    'haze': { ops: [{ op: 'resetStages', target: 'all' }], effect: '', game: 'Annule toutes les modifications de stats de tous les Pokémon.', ...FIELD },
    'leech-seed': { ops: [{ op: 'flag', target: 'target', id: 'leechSeed', turns: 99, label: 'Vampigraine', debuff: true, fromAttacker: true }], effect: '', game: "La cible perd 1/8 de ses PV à chacun de ses tours, et le lanceur les récupère." },
    'rest': { ops: [{ op: 'cleanse', target: 'self' }, { op: 'heal', target: 'self', pct: 100 }, { op: 'status', target: 'self', id: 'STAT_SOM' }], effect: '', game: 'Récupère tous ses PV et guérit ses statuts, puis s\'endort.', ...FIELD },
    'counter': { ops: [{ op: 'flag', target: 'self', id: 'counterPhys', turns: 1, label: 'Riposte' }], game: "Jusqu'à son prochain tour, renvoie le double des dégâts physiques reçus.", ...FIELD },
    'mirror-coat': { ops: [{ op: 'flag', target: 'self', id: 'counterSpec', turns: 1, label: 'Voile Miroir' }], game: "Jusqu'à son prochain tour, renvoie le double des dégâts spéciaux reçus.", ...FIELD },
    'bide': { ops: [{ op: 'flag', target: 'self', id: 'counterAll', turns: 1, label: 'Patience' }], game: "Jusqu'à son prochain tour, renvoie le double de tous les dégâts reçus.", ...FIELD },
    'revival-blessing': { ops: [{ op: 'revive', pct: 50 }], effect: '', game: "Ressuscite l'allié K.O. le plus récent avec 50 % de ses PV.", ...FIELD },
};

// ---------------------------------------------------------------------------
// Attaques offensives : mécaniques déduites de la description française
// ---------------------------------------------------------------------------
const MECH_OVERRIDES = {
    'explosion': { power: 50, mech: { selfKo: true }, game: 'Le lanceur explose : dégâts à tous les ennemis, puis il tombe K.O.' },
    'self-destruct': { power: 40, mech: { selfKo: true }, game: 'Le lanceur explose : dégâts à tous les ennemis, puis il tombe K.O.' },
    'misty-explosion': { mech: { selfKo: true } },
    'fake-out': { mech: { priority: true }, effect: 'STAT_FLINCH', effect_chance: 100, game: 'Frappe en priorité et apeure la cible.' },
    'u-turn': { mech: { retreat: true }, game: "Frappe puis le lanceur se replie à l'arrière." },
    'volt-switch': { mech: { retreat: true }, game: "Frappe puis le lanceur se replie à l'arrière." },
    'flip-turn': { mech: { retreat: true }, game: "Frappe puis le lanceur se replie à l'arrière." },
    'facade': { mech: { doubleIf: 'userStatus' }, game: 'Puissance doublée si le lanceur a un statut (poison, brûlure, paralysie).' },
    'hex': { mech: { doubleIf: 'targetStatus' }, game: 'Puissance doublée si la cible a un statut.' },
    'venoshock': { mech: { doubleIf: 'targetStatus' }, game: 'Puissance doublée si la cible a un statut.' },
    'brine': { mech: { doubleIf: 'targetHalfHp' }, game: 'Puissance doublée si la cible a moins de la moitié de ses PV.' },
    'reversal': { mech: { doubleIf: 'userLowHp' }, game: 'Puissance doublée si le lanceur a moins d\'un tiers de ses PV.' },
    'flail': { mech: { doubleIf: 'userLowHp' }, game: 'Puissance doublée si le lanceur a moins d\'un tiers de ses PV.' },
};

// Attaques à puissance variable dans les jeux : mécanique dédiée (js/battle-rules.js)
// et puissance de base = puissance officielle × facteur de zone (voir AOE_FACTOR)
const AOE_FACTOR = { single: 1, random_single: 1.15, splash_v: 0.5, line_of_2: 0.65, frontline: 0.45, row: 0.48, column: 0.48, cross: 0.32, diagonal_x: 0.3, all: 0.2 };
const OHKO = { mech: { ohko: true }, game: 'K.O. en un coup si le lanceur est au moins du niveau de la cible (sans effet sur un boss).' };
const VARIABLE = {
    'horn-drill': OHKO, 'guillotine': OHKO, 'fissure': OHKO, 'sheer-cold': OHKO,
    'seismic-toss': { mech: { fixed: 'level' }, game: 'Inflige des dégâts égaux au niveau du lanceur.' },
    'night-shade': { mech: { fixed: 'level' }, game: 'Inflige des dégâts égaux au niveau du lanceur.' },
    'psywave': { mech: { fixed: 'levelRandom' }, game: 'Inflige entre 50 % et 150 % du niveau du lanceur en dégâts.' },
    'sonic-boom': { mech: { fixed: 'value', value: 20 }, game: 'Inflige toujours 20 points de dégâts.' },
    'dragon-rage': { mech: { fixed: 'value', value: 40 }, game: 'Inflige toujours 40 points de dégâts.' },
    'super-fang': { mech: { fixed: 'halfTarget' }, game: 'Divise par deux les PV actuels de la cible (un quart sur un boss).' },
    'natures-madness': { mech: { fixed: 'halfTarget' }, game: 'Divise par deux les PV actuels de la cible (un quart sur un boss).' },
    'guardian-of-alola': { mech: { fixed: 'threeQuarters' }, game: 'Retire 75 % des PV actuels de la cible (un tiers sur un boss).' },
    'endeavor': { mech: { fixed: 'endeavor' }, game: 'Réduit les PV de la cible au niveau de ceux du lanceur.' },
    'final-gambit': { mech: { fixed: 'userHp', selfKo: true }, game: 'Inflige autant de dégâts que les PV du lanceur, qui tombe K.O.' },
    'low-kick': { canon: 60, mech: { weight: 'target' }, game: 'Plus la cible est lourde, plus la puissance est élevée.' },
    'grass-knot': { canon: 60, mech: { weight: 'target' }, game: 'Plus la cible est lourde, plus la puissance est élevée.' },
    'heavy-slam': { canon: 60, mech: { weight: 'ratio' }, game: 'Plus le lanceur est lourd par rapport à la cible, plus la puissance est élevée.' },
    'heat-crash': { canon: 60, mech: { weight: 'ratio' }, game: 'Plus le lanceur est lourd par rapport à la cible, plus la puissance est élevée.' },
    'gyro-ball': { canon: 60, mech: { speed: 'gyro' }, game: 'Plus le lanceur est lent par rapport à la cible, plus la puissance est élevée.' },
    'electro-ball': { canon: 60, mech: { speed: 'electro' }, game: 'Plus le lanceur est rapide par rapport à la cible, plus la puissance est élevée.' },
    'crush-grip': { canon: 110, mech: { hpRatio: 'target' }, game: 'Plus la cible a de PV restants, plus la puissance est élevée.' },
    'wring-out': { canon: 110, mech: { hpRatio: 'target' }, game: 'Plus la cible a de PV restants, plus la puissance est élevée.' },
    'hard-press': { canon: 100, mech: { hpRatio: 'target' }, game: 'Plus la cible a de PV restants, plus la puissance est élevée.' },
    'reversal': { canon: 80 }, 'flail': { canon: 80 },
    'return': { canon: 102, game: 'Une attaque fidèle et puissante.' },
    'frustration': { canon: 102, game: 'Une attaque rageuse et puissante.' },
    'magnitude': { canon: 70, mech: { randomPower: [0.15, 2.1] }, game: 'Puissance aléatoire, de très faible à énorme.' },
    'present': { canon: 80, mech: { randomPower: [0.5, 1.5] }, game: 'Un cadeau piégé à la puissance aléatoire.' },
    'beat-up': { canon: 10, mech: { beatUp: true }, game: "Chaque allié encore debout ajoute un coup à l'attaque." },
    'natural-gift': { canon: 80, game: 'Une attaque puisée dans la nature.' },
    'fling': { canon: 70, game: "Lance un objet sur l'ennemi." },
    'punishment': { canon: 60, mech: { stagesBonus: true }, game: 'Plus la cible a de bonus de stats, plus la puissance est élevée.' },
    'spit-up': { canon: 100, game: "Libère une puissante énergie accumulée." },
    'trump-card': { canon: 80, game: 'Une attaque joker qui ne rate jamais.', accuracy: null },
    'metal-burst': { ops: [{ op: 'flag', target: 'self', id: 'counterAll', turns: 1, label: 'Fulmifer' }], game: "Jusqu'à son prochain tour, renvoie le double de tous les dégâts reçus." },
    'shadow-half': { ops: [{ op: 'halfHpAll' }], game: 'Divise par deux les PV actuels de tous les Pokémon du terrain.' },
    'veevee-volley': { canon: 102 }, 'pika-papow': { canon: 102 },
};
const isZMove = (id) => /--(physical|special)$/.test(id);

function inferMech(m) {
    const d = m.description_fr || '';
    const mech = {};
    const notes = [];
    if (!m.multihit) {
        if (/deux à cinq/i.test(d)) { mech.multihit = [2, 5]; notes.push('frappe 2 à 5 fois'); }
        else if (/trois fois|trois coups/i.test(d)) { mech.multihit = [3, 3]; notes.push('frappe 3 fois'); }
        else if (/deux fois|deux coups|à deux reprises/i.test(d)) { mech.multihit = [2, 2]; notes.push('frappe 2 fois'); }
    }
    if (/moitié des dégâts|récupère|convertit .* en PV|draine|absorbe .*PV/i.test(d)) { mech.drain = 0.5; notes.push('rend au lanceur 50 % des dégâts infligés'); }
    if (/contrecoup|blesse aussi (gravement )?le lanceur|se blesse|dégâts au lanceur/i.test(d) && !/baisse/i.test(d)) {
        mech.recoil = /gravement|énorme|moitié/i.test(d) ? 0.33 : 0.25; notes.push(`le lanceur subit ${Math.round(mech.recoil * 100)} % des dégâts infligés`);
    }
    if (/en premier|en priorité|priorit|si rapidement|vitesse fulgurante|toujours avant/i.test(d)) { mech.priority = true; notes.push('agit plus vite au tour suivant'); }
    if (/doit se reposer|se repose au tour suivant|premier tour|second tour|au tour suivant/i.test(d)) { mech.recharge = true; notes.push('le lanceur passe son tour suivant'); }
    if (/ligot|emprisonn|piège .*(tours)|quatre à cinq tours|tourbillon de/i.test(d)) { mech.trap = true; notes.push('piège la cible : 1/16 de ses PV par tour'); }
    const drop = d.match(/(?:baisse|diminue) (?:beaucoup |fortement )?(?:l'|la |le |les )?([^.]*?) du lanceur/i);
    if (drop) {
        const big = /beaucoup|fortement/i.test(d) ? -2 : -1;
        const stats = {};
        if (/attaque sp/i.test(drop[1])) stats.SPA = big; else if (/attaque/i.test(drop[1])) stats.ATK = big;
        if (/défense sp/i.test(drop[1])) stats.SPD = big; else if (/défense/i.test(drop[1])) stats.DEF = big;
        if (/vitesse/i.test(drop[1])) stats.SPE = big;
        if (Object.keys(stats).length) { mech.selfStat = stats; notes.push('baisse les stats du lanceur'); }
    }
    return { mech, notes };
}

// ---------------------------------------------------------------------------
let report = { status: 0, mech: 0, stillEmpty: [] };
for (const file of FILES) {
    const raw = fs.readFileSync(file, 'utf8');
    const moves = JSON.parse(raw);
    for (const [id, m] of Object.entries(moves)) {
        delete m.ops; delete m.mech; delete m.description_game;
        // Précision 0 dans les données d'origine : la capacité ne ratait jamais dans les jeux
        if (m.accuracy === 0) m.accuracy = null;
        // Zone « tout le terrain » : facteur ×0,03 erroné dans les données d'origine -> ×0,2
        if (m.aoe === 'all' && m.damage_class !== 'status' && (m.power || 0) > 0 && m.power < 10 && !m._allFixed) {
            m.power = Math.round(m.power * 6);
            m._allFixed = true;
        }
        const v = VARIABLE[id] || (isZMove(id) ? { canon: 160, game: 'Une attaque Z dévastatrice.' } : null);
        if (v) {
            if (v.canon && !(m.power > 0)) m.power = Math.max(1, Math.round(v.canon * (AOE_FACTOR[m.aoe || 'single'] ?? 1)));
            if (v.mech && !(m.power > 0)) m.power = 1; // la puissance est calculée en combat
            if (v.ops) m.ops = v.ops;
            if ('accuracy' in v) m.accuracy = v.accuracy;
            if (v.game) m.description_game = v.game;
        }
        const st = STATUS[id];
        if (st) {
            const { ops, game, ...rest } = st;
            m.ops = ops;
            m.description_game = game;
            Object.assign(m, rest);
            report.status++;
        }
        if ((m.power || 0) > 0 && m.damage_class !== 'status') {
            const { mech, notes } = inferMech(m);
            if (v?.mech) Object.assign(mech, v.mech);
            const ov = MECH_OVERRIDES[id];
            if (ov) {
                const { mech: om, game, ...rest } = ov;
                Object.assign(mech, om || {});
                Object.assign(m, rest);
                if (game) m.description_game = game;
            }
            if (Object.keys(mech).length) {
                m.mech = mech;
                if (!m.description_game && notes.length) m.description_game = `${m.description_fr} (Dans PokéRoad : ${notes.join(', ')}.)`;
                report.mech++;
            }
        }
        const hasBehaviour = (m.power || 0) > 0 || (m.effect && m.effect !== '') || (m.ops && m.ops.length);
        if (!hasBehaviour) report.stillEmpty.push(id);
    }
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(file, JSON.stringify(moves, null, 2).replace(/\n/g, eol) + eol);
}
console.log(`ops ajoutées : ${report.status}, mécaniques offensives : ${report.mech}`);
console.log(`capacités toujours sans comportement : ${report.stillEmpty.length}`, report.stillEmpty.join(', '));
