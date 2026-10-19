// Effets exécutables de la refonte des capacités (lus par js/move-rework.js en combat).
// Chaque effet est une « op » : { op, target, ... } — mêmes ops que js/battle-rules.js executeOps,
// plus les nouvelles de la refonte : ap (jauge), regen, project / push / pull / relay / teleport / lock,
// fieldFlag, reflectDamage, shapeHeal / shapeShield (formes de soutien).
//
// Cibles : self, allies, otherAllies, enemies, targets (cibles touchées), target (cible principale),
// neighbors (voisins de ligne du lanceur), mostWoundedAlly, frontEnemies, all.

const S = (stats, target = 'self') => ({ op: 'stat', target, stats });
const shield = (pct, target = 'self') => ({ op: 'shield', target, pct });
const heal = (pct, target = 'self') => ({ op: 'heal', target, pct });
const ap = (amount, target = 'self') => ({ op: 'ap', target, amount });
const regen = (pct, turns, target = 'self') => ({ op: 'regen', target, pct, turns });
const flag = (id, turns, target = 'self', label) => ({ op: 'flag', target, id, turns, ...(label ? { label } : {}) });
const weather = (type, rounds) => ({ op: 'weather', type, rounds });
const terrain = (type, rounds) => ({ op: 'terrain', type, rounds });
const room = (type, rounds) => ({ op: 'room', type, rounds });
const cleanse = (target = 'self') => ({ op: 'cleanse', target });
const status = (id, target = 'targets', chance = 100) => ({ op: 'status', target, id, chance });

// ---------------------------------------------------------------------------
// PASSIFS : déclencheur + ops (normal) + ops d'Éveil (version Z)
// Déclencheurs : start (premier tour), turn (chaque tour du porteur), low (sous 50 % de PV, une fois),
// hit (après avoir subi des dégâts), status (après une altération), statusTarget (visé par un statut),
// fatal (coup fatal, une fois), aura (permanent, voisins), end (fin du combat), enemyBoost (bonus ennemi)
// ---------------------------------------------------------------------------
export const PASSIVE_OPS = {
    'harden': { trigger: 'start', ops: [S({ DEF: 1 }), shield(10)], z: [shield(25), S({ DEF: 1 })] },
    'defense-curl': { trigger: 'start', ops: [S({ DEF: 1 }), flag('curl', 99)], z: [shield(20), flag('curl', 99)] },
    'sharpen': { trigger: 'start', ops: [S({ ATK: 1 })], z: [S({ ATK: 2, CRIT: 1 })] },
    'meditate': { trigger: 'start', ops: [S({ ATK: 1 }), flag('noConfusion', 99)], z: [S({ ATK: 2 }), cleanse('allies')] },
    'growth': { trigger: 'start', ops: [S({ ATK: 1, SPA: 1 })], z: [S({ ATK: 2, SPA: 2 }), heal(20)] },
    'howl': { trigger: 'start', ops: [S({ ATK: 1 }, 'allies')], z: [S({ ATK: 1 }, 'allies'), ap(25, 'allies')] },
    'hone-claws': { trigger: 'start', ops: [S({ ATK: 1, PRE: 1 })], z: [S({ ATK: 2 }), flag('sureHit', 3)] },
    'focus-energy': { trigger: 'start', ops: [S({ CRIT: 2 })], z: [flag('nextCrit', 3)] },
    'double-team': { trigger: 'start', ops: [S({ EVA: 1 })], z: [S({ EVA: 2 }), ap(30)] },
    'minimize': { trigger: 'start', ops: [S({ EVA: 2 }), flag('minimized', 99)], z: [S({ EVA: 3 })] },
    'lock-on': { trigger: 'start', ops: [flag('sureHit', 99)], z: [flag('pierce', 1)] },
    'mind-reader': { trigger: 'start', ops: [flag('sureHit', 99)], z: [flag('pierce', 1)] },
    'foresight': { trigger: 'start', ops: [flag('sureHit', 99), flag('scrappy', 99)], z: [S({ DEF: -2 }, 'enemies')] },
    'odor-sleuth': { trigger: 'start', ops: [flag('sureHit', 99), flag('scrappy', 99)], z: [S({ DEF: -2 }, 'enemies')] },
    'miracle-eye': { trigger: 'start', ops: [flag('sureHit', 99)], z: [S({ SPD: -2 }, 'enemies')] },
    'magnet-rise': { trigger: 'start', ops: [flag('levitate', 99)], z: [flag('levitate', 99), ap(40)] },
    'camouflage': { trigger: 'start', ops: [{ op: 'setType', target: 'self', mode: 'terrain' }], z: [{ op: 'setType', target: 'self', mode: 'resistTarget' }] },
    'conversion': { trigger: 'start', ops: [{ op: 'setType', target: 'self', mode: 'firstMove' }], z: [{ op: 'setType', target: 'self', mode: 'firstMove' }, S({ ATK: 1, SPA: 1 })] },
    'dragon-cheer': { trigger: 'start', ops: [S({ CRIT: 1 }, 'allies')], z: [S({ CRIT: 2 }, 'allies'), ap(20, 'allies')] },
    'safeguard': { trigger: 'start', ops: [flag('safeguard', 4, 'allies', 'Rune Protect')], z: [cleanse('allies'), flag('safeguard', 4, 'allies')] },
    'mist': { trigger: 'start', ops: [flag('mist', 4, 'allies', 'Brume')], z: [{ op: 'clearNegativeStages', target: 'allies' }, flag('mist', 4, 'allies')] },
    'lucky-chant': { trigger: 'start', ops: [flag('noCrit', 4, 'allies', 'Air Veinard')], z: [flag('noCrit', 6, 'allies'), shield(10, 'allies')] },
    'follow-me': { trigger: 'start', ops: [flag('provoke', 2, 'self', 'Par Ici !')], z: [flag('provoke', 3), shield(20)] },
    'rage-powder': { trigger: 'start', ops: [flag('provoke', 2, 'self', 'Poudre Fureur')], z: [flag('provoke', 3), shield(20)] },
    'spikes': { trigger: 'start', ops: [{ op: 'hazard', type: 'spikes' }], z: [{ op: 'hazard', type: 'spikes' }, { op: 'hazard', type: 'spikes' }, { op: 'hazard', type: 'spikes' }] },
    'toxic-spikes': { trigger: 'start', ops: [{ op: 'hazard', type: 'toxic' }], z: [status('STAT_PSN', 'enemies')] },
    'stealth-rock': { trigger: 'start', ops: [{ op: 'hazard', type: 'rock' }], z: [{ op: 'rockBlast', target: 'enemies', pct: 12 }] },
    'sticky-web': { trigger: 'start', ops: [{ op: 'hazard', type: 'web' }], z: [S({ SPE: -2 }, 'enemies'), ap(-40, 'enemies')] },
    'rain-dance': { trigger: 'start', ops: [weather('rain', 4)], z: [weather('rain', 6), { op: 'heal', target: 'alliesOfType', type: 'water', pct: 15 }] },
    'sunny-day': { trigger: 'start', ops: [weather('sun', 4)], z: [weather('sun', 6), { op: 'ap', target: 'alliesOfType', type: ['fire', 'grass'], amount: 20 }] },
    'sandstorm': { trigger: 'start', ops: [weather('sand', 4)], z: [weather('sand', 6), { op: 'shield', target: 'alliesOfType', type: 'rock', pct: 15 }] },
    'hail': { trigger: 'start', ops: [weather('hail', 4)], z: [weather('hail', 6), { op: 'ap', target: 'alliesOfType', type: 'ice', amount: 30 }] },
    'snowscape': { trigger: 'start', ops: [weather('snow', 4)], z: [weather('snow', 6), { op: 'shield', target: 'alliesOfType', type: 'ice', pct: 15 }] },
    'shadow-sky': { trigger: 'start', ops: [weather('shadow', 4)], z: [weather('shadow', 6), { op: 'stat', target: 'alliesOfType', type: 'shadow', stats: { SPA: 1 } }] },
    'grassy-terrain': { trigger: 'start', ops: [terrain('grassy', 4)], z: [terrain('grassy', 6), heal(20, 'allies')] },
    'electric-terrain': { trigger: 'start', ops: [terrain('electric', 4)], z: [terrain('electric', 6), ap(25, 'allies')] },
    'misty-terrain': { trigger: 'start', ops: [terrain('misty', 4)], z: [terrain('misty', 6), cleanse('allies')] },
    'psychic-terrain': { trigger: 'start', ops: [terrain('psychic', 4)], z: [terrain('psychic', 6), S({ SPA: 1 }, 'allies')] },
    'trick-room': { trigger: 'start', ops: [room('trick', 4)], z: [room('trick', 6), { op: 'ap', target: 'slowestAlly', amount: 30 }] },
    'wonder-room': { trigger: 'start', ops: [room('wonder', 4)], z: [room('wonder', 6)] },
    'magic-room': { trigger: 'start', ops: [room('magic', 4)], z: [room('magic', 6)] },
    'gravity': { trigger: 'start', ops: [room('gravity', 4)], z: [room('gravity', 6), ap(-20, 'enemies')] },
    'mud-sport': { trigger: 'start', ops: [{ op: 'fieldFlag', id: 'mudSport', rounds: 4 }], z: [{ op: 'fieldFlag', id: 'mudSport', rounds: 6 }, S({ SPE: -1 }, 'enemies')] },
    'water-sport': { trigger: 'start', ops: [{ op: 'fieldFlag', id: 'waterSport', rounds: 4 }], z: [{ op: 'fieldFlag', id: 'waterSport', rounds: 6 }, regen(4, 3, 'allies')] },
    'fairy-lock': { trigger: 'start', ops: [{ op: 'fieldFlag', id: 'noMove', rounds: 2 }], z: [{ op: 'fieldFlag', id: 'noMove', rounds: 3 }, ap(-20, 'enemies')] },
    'aqua-ring': { trigger: 'turn', ops: [heal(6)], z: [regen(6, 4, 'allies')] },
    'ingrain': { trigger: 'turn', ops: [heal(8), flag('rooted', 2)], z: [heal(40), cleanse()] },
    'laser-focus': { trigger: 'turn', ops: [{ op: 'chance', pct: 33, then: [flag('nextCrit', 1)] }], z: [flag('nextCrit', 2)] },
    'helping-hand': { trigger: 'aura', aura: { damage: 0.2 }, ops: [], z: [flag('helped', 3, 'allies')] },
    'aromatic-mist': { trigger: 'start', ops: [S({ SPD: 1 }, 'neighbors'), regen(3, 99, 'neighbors')], z: [S({ SPD: 1 }, 'allies'), regen(5, 3, 'allies')] },
    'withdraw': { trigger: 'low', ops: [S({ DEF: 1 }), shield(30)], z: [shield(40), heal(15)] },
    'recycle': { trigger: 'low', ops: [{ op: 'recycleBerry', fallbackHeal: 20 }], z: [heal(35), { op: 'recycleBerry' }] },
    'stuff-cheeks': { trigger: 'low', ops: [S({ DEF: 2 }), heal(20)], z: [S({ DEF: 2 }), heal(40)] },
    'rage': { trigger: 'hit', ops: [{ op: 'statCapped', target: 'self', stats: { ATK: 1 }, max: 3 }], z: [S({ ATK: 3 }), ap(30)] },
    'counter': { trigger: 'hit', ops: [{ op: 'reflectDamage', pct: 75, cls: 'physical' }], z: [flag('counterBoost', 2)] },
    'mirror-coat': { trigger: 'hit', ops: [{ op: 'reflectDamage', pct: 75, cls: 'special' }], z: [flag('counterBoost', 2)] },
    'metal-burst': { trigger: 'hit', ops: [{ op: 'reflectDamage', pct: 50 }], z: [flag('counterBoost', 2)] },
    'comeuppance': { trigger: 'hit', ops: [{ op: 'reflectDamage', pct: 50 }], z: [flag('counterBoost', 2)] },
    'bide': { trigger: 'hit', ops: [{ op: 'storeDamage' }], every: 3, release: [{ op: 'releaseDamage', mult: 1.5, target: 'nearestEnemy' }], z: [{ op: 'releaseDamage', mult: 2, target: 'enemies' }] },
    'shell-trap': { trigger: 'hit', contactOnly: true, ops: [{ op: 'blast', target: 'frontEnemies', power: 40, type: 'fire' }], z: [{ op: 'blast', target: 'enemies', power: 40, type: 'fire' }] },
    'beak-blast': { trigger: 'hit', contactOnly: true, ops: [status('STAT_BRU', 'attacker')], z: [status('STAT_BRU', 'frontEnemies')] },
    'refresh': { trigger: 'status', cooldown: 3, ops: [cleanse(), heal(10)], z: [cleanse('allies'), heal(20, 'allies')] },
    'magic-coat': { trigger: 'statusTarget', cooldown: 3, ops: [], z: [flag('magicCoat', 3)] },
    'snatch': { trigger: 'enemyBoost', once: true, ops: [], z: [{ op: 'stealPositiveStages', target: 'enemies' }] },
    'endure': { trigger: 'fatal', once: true, ops: [], z: [heal(30)] },
    'destiny-bond': { trigger: 'start', ops: [flag('destinyBond', 99)], z: [flag('destinyBond', 2)] },
    'grudge': { trigger: 'start', ops: [flag('grudge', 99)], z: [flag('grudge', 99)] },
    'happy-hour': { trigger: 'start', ops: [{ op: 'money', mult: 2 }], z: [{ op: 'money', mult: 3 }] },
};

// ---------------------------------------------------------------------------
// TACTIQUES réécrites : ops normales et ops Z (sans le bonus de type, ajouté à part)
// ---------------------------------------------------------------------------
export const TACTIC_OPS = {
    'agility': { ops: [S({ SPE: 2 }), ap(40)], z: [S({ SPE: 3 }), ap(100)] },
    'rock-polish': { ops: [S({ SPE: 2 }), ap(40)], z: [S({ SPE: 3 }), ap(100)] },
    'autotomize': { ops: [S({ SPE: 2 }), ap(40), { op: 'hpCost', pct: 10 }], z: [S({ SPE: 3 }), ap(100)] },
    'tailwind': { ops: [S({ SPE: 1 }, 'allies'), ap(30, 'allies')], z: [S({ SPE: 2 }, 'allies'), ap(50, 'allies')] },
    'after-you': { ops: [ap(100, 'bestAlly')], z: [ap(100, 'bestAlly'), ap(100, 'mostWoundedAlly')] },
    'instruct': { ops: [ap(100, 'bestAlly')], z: [ap(100, 'bestAlly'), ap(50, 'bestAlly')] },
    'quash': { ops: [ap(-60, 'target')], z: [ap(-50, 'enemies')] },
    'speed-swap': { ops: [{ op: 'swapSpeed', target: 'target' }, { op: 'swapAP', target: 'target' }], z: [{ op: 'swapSpeed', target: 'fastestEnemy' }, ap(100)] },
    'teleport': { ops: [{ op: 'teleport' }, ap(30)], z: [{ op: 'teleport' }, ap(30, 'allies')] },
    'shift-gear': { ops: [S({ ATK: 1, SPE: 2 }), ap(30)], z: [S({ ATK: 2, SPE: 3 }), ap(100)] },
    'dragon-dance': { ops: [S({ ATK: 1, SPE: 1 }), ap(20)], z: [S({ ATK: 2, SPE: 2 }), ap(100)] },
    'quiver-dance': { ops: [S({ SPA: 1, SPD: 1, SPE: 1 }), ap(20)], z: [S({ SPA: 2, SPD: 2, SPE: 2 }), ap(100)] },
    'shell-smash': { ops: [S({ ATK: 2, SPA: 2, SPE: 2, DEF: -1, SPD: -1 }), { op: 'clearShield', target: 'self' }], z: [S({ ATK: 2, SPA: 2, SPE: 2 }), ap(50)] },
    'reflect': { ops: [{ op: 'shapeShield', shape: 'bouclier_front', pct: 12 }, flag('reflect', 4, 'allies', 'Protection')], z: [{ op: 'shapeShield', shape: 'bouclier_front', pct: 25 }, flag('reflect', 6, 'allies')] },
    'light-screen': { ops: [{ op: 'shapeShield', shape: 'bouclier_front', pct: 12 }, flag('lightScreen', 4, 'allies', 'Mur Lumière')], z: [{ op: 'shapeShield', shape: 'bouclier_front', pct: 25 }, flag('lightScreen', 6, 'allies')] },
    'aurora-veil': { ops: [{ op: 'shapeShield', shape: 'bouclier_front', pct: 15 }, flag('reflect', 4, 'allies'), flag('lightScreen', 4, 'allies')], z: [{ op: 'shapeShield', shape: 'bouclier_front', pct: 30 }, flag('reflect', 6, 'allies'), flag('lightScreen', 6, 'allies')] },
    'substitute': { ops: [{ op: 'hpCost', pct: 20 }, shield(35), flag('substitute', 99)], z: [shield(50), flag('substitute', 99)] },
    'shelter': { ops: [S({ DEF: 2 }), shield(15)], z: [shield(30), shield(30, 'neighbors')] },
    'wide-guard': { ops: [{ op: 'shapeShield', shape: 'garde_colonne', pct: 0 }, flag('wideGuard', 1, 'column', 'Garde Large')], z: [flag('wideGuard', 2, 'allies'), shield(15, 'allies')] },
    'quick-guard': { ops: [flag('quickGuard', 1, 'allies', 'Prévention')], z: [flag('quickGuard', 2, 'allies'), ap(20, 'allies')] },
    'mat-block': { ops: [flag('matBlock', 1, 'allies', 'Tatamigaeshi')], z: [flag('matBlock', 2, 'allies'), shield(15, 'allies')] },
    'crafty-shield': { ops: [flag('craftyShield', 1, 'allies', 'Vigilance')], z: [flag('craftyShield', 3, 'allies'), cleanse('allies')] },
    'shed-tail': { ops: [{ op: 'hpCost', pct: 50 }, { op: 'shield', target: 'behindAlly', pct: 50, of: 'user' }, { op: 'swapAlly', with: 'behind' }], z: [{ op: 'shield', target: 'behindAlly', pct: 50, of: 'user' }, { op: 'swapAlly', with: 'behind' }] },
    'heal-pulse': { ops: [{ op: 'shapeHeal', shape: 'soin_cible', pct: 50 }], z: [{ op: 'shapeHeal', shape: 'soin_cible', pct: 75 }, cleanse('mostWoundedAlly')] },
    'floral-healing': { ops: [{ op: 'shapeHeal', shape: 'soin_cible', pct: 50 }], z: [{ op: 'shapeHeal', shape: 'soin_cible', pct: 80 }] },
    'life-dew': { ops: [{ op: 'shapeHeal', shape: 'soin_onde', pct: 25 }], z: [{ op: 'shapeHeal', shape: 'soin_onde', pct: 40 }, cleanse('allies')] },
    'jungle-healing': { ops: [{ op: 'shapeHeal', shape: 'soin_onde', pct: 25 }, cleanse('allies')], z: [{ op: 'shapeHeal', shape: 'soin_onde', pct: 40 }, cleanse('allies'), regen(5, 3, 'allies')] },
    'lunar-blessing': { ops: [{ op: 'shapeHeal', shape: 'soin_onde', pct: 25 }, cleanse('allies')], z: [{ op: 'shapeHeal', shape: 'soin_onde', pct: 40 }, shield(10, 'allies')] },
    'heal-bell': { ops: [cleanse('allies'), regen(3, 3, 'allies')], z: [cleanse('allies'), heal(25, 'allies')] },
    'aromatherapy': { ops: [cleanse('allies'), regen(3, 3, 'allies')], z: [cleanse('allies'), heal(25, 'allies')] },
    'wish': { ops: [{ op: 'delayedHeal', target: 'mostWoundedAlly', pct: 50, of: 'user', turns: 2 }], z: [heal(30, 'allies')] },
    'rest': { ops: [cleanse(), heal(100), { op: 'status', target: 'self', id: 'STAT_SOM', chance: 100, force: true }], z: [cleanse(), heal(100)] },
    'purify': { ops: [cleanse('target'), heal(50)], z: [cleanse('allies'), heal(50)] },
    'healing-wish': { ops: [{ op: 'healMostWounded', pct: 100, cleanse: true }, { op: 'selfKo' }], z: [heal(50, 'otherAllies'), { op: 'selfKo' }] },
    'lunar-dance': { ops: [{ op: 'healMostWounded', pct: 100, cleanse: true }, ap(50, 'mostWoundedAlly'), { op: 'selfKo' }], z: [heal(50, 'otherAllies'), ap(30, 'otherAllies'), { op: 'selfKo' }] },
    'revival-blessing': { ops: [{ op: 'revive', pct: 50 }], z: [{ op: 'revive', pct: 100 }] },
    'strength-sap': { ops: [{ op: 'healByTargetAtk' }], z: [{ op: 'healByTargetAtk' }, S({ ATK: -1 }, 'enemies')] },
    'pain-split': { ops: [{ op: 'splitHp', target: 'target' }], z: [{ op: 'splitHp', target: 'healthiestEnemy' }, shield(15)] },
    'leech-seed': { ops: [{ ...flag('leechSeed', 99, 'target', 'Vampigraine'), fromAttacker: true }], z: [{ ...flag('leechSeed', 99, 'enemies', 'Vampigraine'), fromAttacker: true }] },
    'teatime': { ops: [{ op: 'eatBerry', target: 'all' }, heal(15, 'allies')], z: [{ op: 'eatBerry', target: 'allies' }, heal(30, 'allies')] },
    'swallow': { ops: [{ op: 'swallow' }], z: [heal(100)] },
    'stockpile': { ops: [{ op: 'stockpile' }], z: [{ op: 'stockpile', count: 3 }, shield(20)] },
    // Placement
    'ally-switch': { ops: [{ op: 'swapAlly', with: 'best' }, ap(20)], z: [{ op: 'swapAlly', with: 'best' }, ap(40), ap(40, 'swapped')] },
    'baton-pass': { ops: [{ op: 'swapAlly', with: 'back', transferStages: true }], z: [{ op: 'copyStagesTo', target: 'column' }, { op: 'moveToBack' }] },
    'parting-shot': { ops: [S({ ATK: -1, SPA: -1 }, 'target'), { op: 'relay' }], z: [S({ ATK: -1, SPA: -1 }, 'targetLine'), { op: 'relay' }] },
    'chilly-reception': { ops: [weather('snow', 4), { op: 'relay' }], z: [weather('snow', 6), { op: 'relay' }] },
    'whirlwind': { ops: [{ op: 'project', target: 'target' }, ap(-30, 'target')], z: [{ op: 'project', target: 'frontEnemies' }] },
    'roar': { ops: [{ op: 'project', target: 'target' }, ap(-30, 'target')], z: [{ op: 'project', target: 'frontEnemies' }, ap(-40, 'frontEnemies')] },
    'telekinesis': { ops: [{ op: 'pull', target: 'target' }, flag('noEvasion', 3, 'target')], z: [{ op: 'pull', target: 'target', toFront: true }, S({ DEF: -1 }, 'target')] },
    'block': { ops: [flag('locked', 4, 'target', 'Bloqué'), ap(-10, 'target')], z: [flag('locked', 4, 'targetLine', 'Bloqué')] },
    'mean-look': { ops: [flag('locked', 4, 'target', 'Bloqué'), ap(-10, 'target')], z: [flag('locked', 4, 'targetLine', 'Bloqué')] },
    'spider-web': { ops: [flag('locked', 4, 'target', 'Bloqué'), S({ SPE: -1 }, 'target'), ap(-20, 'target')], z: [flag('locked', 4, 'targetLine'), S({ SPE: -1 }, 'targetLine'), ap(-20, 'targetLine')] },
};

// Effets « placement / portée / en face » des attaques (en plus des dégâts)
export const ATTACK_POSITION_OPS = {
    'dragon-tail': [{ op: 'project', target: 'target' }], 'circle-throw': [{ op: 'project', target: 'target' }], 'storm-throw': [{ op: 'project', target: 'target' }],
    'gust': [{ op: 'push', target: 'target', collision: 10 }], 'hurricane': [{ op: 'push', target: 'target', collision: 10 }], 'force-palm': [{ op: 'push', target: 'target', collision: 10 }],
    'vine-whip': [{ op: 'pull', target: 'target' }], 'power-whip': [{ op: 'pull', target: 'target' }],
    'anchor-shot': [{ op: 'pull', target: 'target' }, flag('locked', 3, 'target')], 'spirit-shackle': [{ op: 'pull', target: 'target' }, flag('locked', 3, 'target')],
    'smack-down': [{ op: 'ground', target: 'target' }], 'thousand-arrows': [{ op: 'ground', target: 'targets' }],
    'jaw-lock': [flag('locked', 3, 'target'), flag('locked', 3, 'self')],
    'u-turn': [{ op: 'relay' }], 'volt-switch': [{ op: 'relay' }], 'flip-turn': [{ op: 'relay' }],
};
// Plongée (charge intouchable, puis frappe n'importe où) et tirs de précision
export const DIVE_MOVES = ['fly', 'bounce', 'dig', 'dive', 'phantom-force', 'shadow-force', 'sky-drop'];
export const SNIPE_MOVES = ['snipe-shot', 'aura-sphere', 'aerial-ace', 'magical-leaf', 'feint-attack', 'shadow-punch', 'magnet-bomb', 'swift', 'vital-throw'];
export const FACE_MOVES = { revenge: 1.3, avalanche: 1.3, payback: 1.3, pursuit: 1.3, retaliate: 1.3 };
// Attaques à retardement (officiel : « touche la cible deux tours plus tard ») : nombre de tours du lanceur avant l'impact
export const DELAYED_MOVES = { 'future-sight': 2, 'doom-desire': 2 };

// Bonus de type de la version Z (attaques, sur les cibles touchées) et des tactiques / passifs
export const Z_TYPE_OPS = {
    normal: [ap(20)], fire: [status('STAT_BRU', 'targets', 50)], water: [regen(5, 3, 'allies')], electric: [ap(25, 'allies')],
    grass: [{ op: 'drainTeam', pct: 25 }], ice: [ap(-30, 'targets')], fighting: [S({ ATK: 1 })], poison: [status('STAT_PSN', 'targets', 50)],
    ground: [S({ PRE: -1 }, 'targets')], flying: [ap(30)], psychic: [{ op: 'clearPositiveStages', target: 'targets' }],
    bug: [S({ ATK: -1, SPA: -1 }, 'targets')], rock: [shield(20)], ghost: [ap(-25, 'targets')], dragon: [S({ CRIT: 1 }, 'allies')],
    dark: [{ op: 'stealPositiveStages', target: 'targets' }], steel: [shield(12, 'allies')], fairy: [heal(20, 'allies')],
    shadow: [flag('vulnerable', 2, 'targets')],
};
export const Z_TYPE_SUPPORT_OPS = {
    normal: [ap(20)], fire: [S({ ATK: 1, SPA: 1 })], water: [regen(5, 3, 'allies')], electric: [ap(25, 'allies')],
    grass: [regen(4, 3, 'allies')], ice: [ap(-15, 'enemies')], fighting: [S({ ATK: 1 })], poison: [status('STAT_PSN', 'enemies', 30)],
    ground: [shield(10)], flying: [ap(30)], psychic: [S({ SPA: 1 })], bug: [ap(15, 'allies')], rock: [shield(20)],
    ghost: [ap(-20, 'enemies')], dragon: [S({ CRIT: 1 }, 'allies')], dark: [{ op: 'stealPositiveStages', target: 'bestEnemy' }],
    steel: [shield(12, 'allies')], fairy: [heal(20, 'allies')], shadow: [flag('vulnerable', 2, 'enemies')],
};

export const AILMENT_STATUS = { paralysis: 'STAT_PAR', sleep: 'STAT_SOM', freeze: 'STAT_GEL', burn: 'STAT_BRU', poison: 'STAT_PSN', confusion: 'STAT_CONF', trap: 'STAT_TRAP', yawn: 'STAT_SOM' };
