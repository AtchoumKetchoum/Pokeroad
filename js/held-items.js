/**
 * held-items.js - Objets tenus et baies en combat (3 objets + 3 baies par Pokémon).
 *
 * Chaque objet a une fiche d'effets (SPEC) : valeur de base, plafond et mécanique.
 * Valeur en combat = base × multiplicateur d'Atelier (1 + (niveau − 1)/100 + 0,2 × étoiles), plafonnée.
 * Règles de cumul (data/held_items_rules.json) :
 *  - un même effet sur plusieurs objets : 100 % du meilleur, 60 % du 2e, 30 % du 3e ;
 *  - le total des multiplicateurs d'objets sur un coup est plafonné à ×2 ;
 *  - les chances se combinent (1 − Π(1 − p)), plafonnées à 60 %.
 * Les objets à usage unique (baies, gemmes, Ceinture Force…) servent une fois par combat
 * et reviennent après (les combattants sont reconstruits à chaque combat).
 *
 * Points d'accroche dans le moteur : battle.js (dégâts, précision, PV, début de tour, après l'action,
 * jauge Z, récompenses), battle-rules.js (mise en place, altérations, déplacements, météo),
 * move-rework.js (baisses de stats, échanges d'objets), gamedata.js (bonus de stats sur la fiche).
 */
const HeldItems = (() => {
    const TYPES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
    const STAT_FR = { ATK: 'Attaque', DEF: 'Défense', SPA: 'Att. Spé.', SPD: 'Déf. Spé.', SPE: 'Vitesse', EVA: 'Esquive', PRE: 'Précision', CRIT: 'Critique' };

    // ------------------------------------------------------------------
    // FICHES D'EFFETS
    // ------------------------------------------------------------------
    const S = {};
    const def = (slug, base, cap, fx) => { S[slug] = { base, cap, ...fx }; };

    // Objets de type (+{v} % sur les attaques du type)
    const BOOSTERS = { 'silk-scarf': 'normal', charcoal: 'fire', 'mystic-water': 'water', 'miracle-seed': 'grass', magnet: 'electric', 'never-melt-ice': 'ice', 'black-belt': 'fighting', 'poison-barb': 'poison', 'soft-sand': 'ground', 'sharp-beak': 'flying', 'twisted-spoon': 'psychic', 'silver-powder': 'bug', 'hard-stone': 'rock', 'spell-tag': 'ghost', 'dragon-fang': 'dragon', 'black-glasses': 'dark', 'metal-coat': 'steel', 'fairy-feather': 'fairy' };
    Object.entries(BOOSTERS).forEach(([slug, type]) => def(slug, 20, 60, { types: [type] }));
    // Plaques : comptent comme un Pokémon du type pour les synergies, +{v} % au type
    const PLATES = { 'flame-plate': 'fire', 'splash-plate': 'water', 'zap-plate': 'electric', 'meadow-plate': 'grass', 'icicle-plate': 'ice', 'fist-plate': 'fighting', 'toxic-plate': 'poison', 'earth-plate': 'ground', 'sky-plate': 'flying', 'mind-plate': 'psychic', 'insect-plate': 'bug', 'stone-plate': 'rock', 'spooky-plate': 'ghost', 'draco-plate': 'dragon', 'dread-plate': 'dark', 'iron-plate': 'steel', 'pixie-plate': 'fairy', 'blank-plate': 'normal' };
    Object.entries(PLATES).forEach(([slug, type]) => def(slug, 10, 30, { types: [type], plate: type }));
    def('legend-plate', 15, 45, { species: [493], legendPlate: true });
    // Gemmes : première attaque du type +{v} % (une fois)
    TYPES.forEach(t => def(`${t}-gem`, 50, 120, { gem: t, consumable: true }));
    // Encens
    def('sea-incense', 15, 45, { types: ['water'], rainRegen: 3 });
    def('wave-incense', 15, 45, { types: ['water'], waveSplash: 0.15 });
    def('odd-incense', 15, 45, { types: ['psychic'], hitStatus: { id: 'STAT_CONF', chance: 10, type: 'psychic' } });
    def('rock-incense', 15, 45, { types: ['rock'], startStages: { DEF: 1 } });
    def('rose-incense', 15, 45, { types: ['grass'], roseIncense: 10 });
    // Dégâts généraux
    def('muscle-band', 10, 35, { cls: 'physical' });
    def('wise-glasses', 10, 35, { cls: 'special' });
    def('choice-band', 50, 100, { statPct: { atk: 'v' }, choice: true });
    def('choice-specs', 50, 100, { statPct: { spatk: 'v' }, choice: true });
    def('choice-scarf', 50, 100, { statPct: { speed: 'v' }, choice: true });
    def('expert-belt', 20, 60, { superEffective: true });
    def('life-orb', 30, 70, { allDmg: true, lifeOrb: 10 });
    def('metronome', 10, 25, { metronome: 5 });
    def('scope-lens', 10, 50, { crit: 1, critDmg: true });
    def('razor-claw', 50, 100, { crit: 1, critPierce: true });
    def('kings-rock', 10, 30, { flinch: true });
    def('razor-fang', 8, 25, { gaugeCut: 25 });
    def('wide-lens', 10, 30, { acc: true });
    def('zoom-lens', 15, 40, { zoom: true });
    def('loaded-dice', 50, 100, { extraHit: true });
    def('punching-glove', 70, 100, { glove: true });
    def('protective-pads', 10, 30, { pads: true });
    // Objets de pouvoir (Vitesse −50 %)
    def('power-bracer', 30, 70, { statPct: { atk: 'v', speed: -50 } });
    def('power-belt', 30, 70, { statPct: { def: 'v', speed: -50 } });
    def('power-lens', 30, 70, { statPct: { spatk: 'v', speed: -50 } });
    def('power-band', 30, 70, { statPct: { spdef: 'v', speed: -50 } });
    def('power-weight', 30, 70, { statPct: { hp: 'v', speed: -50 } });
    def('power-anklet', 15, 40, { statPct: { speed: -50 }, hitGauge: true });
    def('macho-brace', 12, 35, { statPct: { atk: 'v', def: 'v', spatk: 'v', spdef: 'v', speed: -50 } });
    // Défense
    def('assault-vest', 50, 100, { statPct: { spdef: 'v' }, noTactics: true });
    def('eviolite', 50, 100, { statPct: { def: 'v', spdef: 'v' }, needsEvolution: true });
    def('air-balloon', 8, 25, { balloon: true, consumable: true });
    def('heavy-duty-boots', 5, 15, { statPct: { speed: 'v' }, boots: true });
    def('safety-goggles', 15, 45, { goggles: true });
    def('utility-umbrella', 8, 25, { umbrella: true });
    def('bright-powder', 8, 20, { evasion: true });
    def('lax-incense', 5, 15, { evasion: true, dodgeGauge: 15 });
    def('rocky-helmet', 16, 30, { helmet: true });
    def('focus-sash', 10, 30, { sash: true, consumable: true });
    def('focus-band', 10, 35, { band: true });
    def('ring-target', 10, 30, { aggro: true, startShield: true });
    def('smoke-ball', 20, 50, { smoke: true, consumable: true });
    def('everstone', 10, 30, { statPct: { def: 'v', spdef: 'v' }, freezeStages: true });
    def('float-stone', 15, 40, { floatStone: true });
    // Soin
    def('leftovers', 6.25, 15, { regenTurn: true, regenGroup: true });
    def('black-sludge', 10, 20, { regenTurn: true, sludge: true, regenGroup: true });
    def('shell-bell', 12.5, 30, { shellBell: true });
    def('big-root', 30, 80, { bigRoot: true });
    def('soothe-bell', 2, 6, { sootheBell: true });
    def('cleanse-tag', 20, 60, { cleanseTag: true });
    def('pure-incense', 2, 5, { pureIncense: true });
    def('full-incense', 4, 10, { statPct: { speed: -25 }, fullIncense: true });
    // Boucliers et champs
    def('light-clay', 20, 60, { shieldBoost: true, screenTurns: 3 });
    def('electric-seed', 15, 35, { seed: { terrain: 'electric', stat: 'DEF' }, consumable: true });
    def('grassy-seed', 15, 35, { seed: { terrain: 'grassy', stat: 'DEF' }, consumable: true });
    def('psychic-seed', 15, 35, { seed: { terrain: 'psychic', stat: 'SPD' }, consumable: true });
    def('misty-seed', 15, 35, { seed: { terrain: 'misty', stat: 'SPD' }, consumable: true });
    def('ability-shield', 10, 30, { itemShield: true });
    def('absorb-bulb', 15, 35, { typeReact: { type: 'water', stages: { SPA: 1 }, heal: true }, consumable: true });
    def('cell-battery', 25, 60, { typeReact: { type: 'electric', stages: { ATK: 1 }, gauge: true }, consumable: true });
    def('luminous-moss', 15, 35, { typeReact: { type: 'water', stages: { SPD: 1 }, shield: true }, consumable: true });
    def('snowball', 25, 60, { typeReact: { type: 'ice', stages: { ATK: 1 }, z: true }, consumable: true });
    // Vitesse et jauge d'action
    def('quick-claw', 18.75, 45, { quickClaw: true });
    def('lagging-tail', 30, 60, { statPct: { speed: '-v' } });
    def('iron-ball', 10, 30, { statPct: { def: 'v', speed: -50 }, immovable: true });
    def('adrenaline-orb', 25, 60, { adrenaline: true, consumable: true });
    def('room-service', 30, 70, { roomService: true, consumable: true });
    def('blunder-policy', 25, 60, { blunder: true, consumable: true });
    def('exp-share', 20, 50, { expShare: true });
    // Cristaux Z
    const Z_TYPES = { normalium: 'normal', firium: 'fire', waterium: 'water', electrium: 'electric', grassium: 'grass', icium: 'ice', fightinium: 'fighting', poisonium: 'poison', groundium: 'ground', flyinium: 'flying', psychium: 'psychic', buginium: 'bug', rockium: 'rock', ghostium: 'ghost', dragonium: 'dragon', darkinium: 'dark', steelium: 'steel', fairium: 'fairy' };
    Object.entries(Z_TYPES).forEach(([name, type]) => def(`${name}-z--held`, 50, 150, { zType: type }));
    const Z_SPECIES = {
        'pikanium-z--held': { species: [25], zType: 'electric', zEffect: 'paralyze' },
        'pikashunium-z--held': { species: [25], zType: 'electric', zEffect: 'crit' },
        'aloraichium-z--held': { species: [26], zType: 'electric', zEffect: 'line' },
        'decidium-z--held': { species: [724], zType: 'ghost', zEffect: 'anyCell' },
        'incinium-z--held': { species: [727], zType: 'dark', zEffect: 'pierce' },
        'primarium-z--held': { species: [730], zType: 'water', zEffect: 'wave' },
        'tapunium-z--held': { species: [785, 786, 787, 788], zType: 'fairy', zEffect: 'halfHp' },
        'marshadium-z--held': { species: [802], zType: 'ghost', zEffect: 'stealStages' },
        'snorlium-z--held': { species: [143], zType: 'normal', zEffect: 'shield' },
        'eevium-z--held': { species: [133], zType: 'normal', zEffect: 'allStats' },
        'mewnium-z--held': { species: [151], zType: 'psychic', zEffect: 'terrain' },
    };
    Object.entries(Z_SPECIES).forEach(([slug, fx]) => def(slug, 30, 80, { ...fx, zStart: true }));
    def('booster-energy', 25, 50, { boosterEnergy: true, consumable: true });
    def('power-herb', 30, 60, { powerHerb: true, consumable: true });
    def('throat-spray', 15, 40, { throatSpray: true });
    def('weakness-policy', 30, 100, { weaknessPolicy: true, consumable: true });
    // Altérations
    def('flame-orb', 30, 60, { orb: 'STAT_BRU', guts: true });
    def('toxic-orb', 8, 15, { orb: 'STAT_PSN', poisonHeal: true });
    def('mental-herb', 2, 5, { mentalHerb: true, consumable: true });
    def('white-herb', 15, 40, { whiteHerb: true, consumable: true });
    def('mirror-herb', 1, 3, { mirrorHerb: true });
    def('covert-cloak', 5, 15, { cloak: true });
    def('clear-amulet', 10, 30, { clearAmulet: true });
    def('destiny-knot', 30, 60, { destinyKnot: true });
    // Placement
    def('shed-shell', 20, 50, { shedShell: true });
    def('eject-button', 30, 70, { ejectButton: true, consumable: true });
    def('red-card', 20, 50, { redCard: true, consumable: true });
    def('eject-pack', 20, 50, { ejectPack: true, consumable: true });
    // Autres
    def('sticky-barb', 12.5, 25, { stickyBarb: true });
    def('grip-claw', 10, 30, { trapTurns: 2 });
    def('binding-band', 9, 15, { trapDamage: true });
    def('heat-rock', 10, 30, { weatherRock: 'sun' });
    def('damp-rock', 10, 30, { weatherRock: 'rain' });
    def('smooth-rock', 10, 30, { weatherRock: 'sand' });
    def('icy-rock', 10, 30, { weatherRock: 'hail' });
    def('terrain-extender', 10, 30, { terrainExtender: true });
    def('amulet-coin', 50, 150, { money: true });
    def('luck-incense', 80, 200, { money: true, moneyIfAlive: true });
    def('lucky-egg', 15, 50, { luckyEgg: true });
    const SCARVES = { 'red-scarf': 'attacker', 'blue-scarf': 'speedster', 'pink-scarf': 'support', 'green-scarf': 'caster', 'yellow-scarf': 'tank' };
    Object.entries(SCARVES).forEach(([slug, role]) => def(slug, 25, 75, { role }));
    // Objets d'espèce
    def('light-ball', 100, 150, { species: [25], statPct: { atk: 'v', spatk: 'v' } });
    def('thick-club', 100, 150, { species: [104, 105], statPct: { atk: 'v' } });
    def('stick', 20, 60, { species: [83, 865], crit: 2, critDmg: true });
    def('lucky-punch', 20, 50, { species: [113], crit: 2, critZ: true });
    def('metal-powder', 50, 100, { species: [132], statPct: { def: 'v', spdef: 'v' } });
    def('quick-powder', 100, 150, { species: [132], statPct: { speed: 'v' } });
    def('deep-sea-tooth', 100, 150, { species: [366], statPct: { spatk: 'v' } });
    def('deep-sea-scale', 100, 150, { species: [366], statPct: { spdef: 'v' } });
    def('soul-dew', 20, 60, { species: [380, 381], types: ['psychic', 'dragon'] });
    def('adamant-orb', 20, 60, { species: [483], types: ['dragon', 'steel'] });
    def('lustrous-orb', 20, 60, { species: [484], types: ['water', 'dragon'] });
    def('griseous-orb', 20, 60, { species: [487], types: ['ghost', 'dragon'] });
    def('rusted-sword', 30, 70, { species: [888], statPct: { atk: 'v' }, firstCrit: true });
    def('rusted-shield', 20, 50, { species: [889], startStages: { DEF: 1 }, startShield: true });
    const MEMORY = ['fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy'];
    MEMORY.forEach(t => def(`${t}-memory`, 10, 30, { species: [773], typeSet: [t], normalTo: t, types: [t] }));
    const DRIVES = { 'douse-drive': 'water', 'shock-drive': 'electric', 'burn-drive': 'fire', 'chill-drive': 'ice' };
    Object.entries(DRIVES).forEach(([slug, t]) => def(slug, 15, 45, { species: [649], normalTo: t, types: [t] }));
    const NECTARS = { 'red-nectar': 'fire', 'yellow-nectar': 'electric', 'pink-nectar': 'psychic', 'purple-nectar': 'ghost' };
    Object.entries(NECTARS).forEach(([slug, t]) => def(slug, 10, 30, { species: [741], typeSet: [t, 'flying'], types: [t] }));
    const MASKS = { 'wellspring-mask': 'water', 'hearthflame-mask': 'fire', 'cornerstone-mask': 'rock' };
    Object.entries(MASKS).forEach(([slug, t]) => def(slug, 20, 50, { species: [1017], typeSet: ['grass', t], allDmg: true }));

    // --- Baies -----------------------------------------------------------
    const RESIST = { 'occa-berry': ['fire', { immune: ['STAT_BRU'] }], 'passho-berry': ['water', { regen: 3 }], 'wacan-berry': ['electric', { immune: ['STAT_PAR'] }], 'rindo-berry': ['grass', { immune: ['STAT_SOM'] }], 'yache-berry': ['ice', { immune: ['STAT_GEL'] }], 'chople-berry': ['fighting', { stages: { ATK: 1 } }], 'kebia-berry': ['poison', { immune: ['STAT_PSN'] }], 'shuca-berry': ['ground', { anchor: true }], 'coba-berry': ['flying', { stages: { EVA: 1 } }], 'payapa-berry': ['psychic', { immune: ['STAT_CONF'] }], 'tanga-berry': ['bug', { gauge: 15 }], 'charti-berry': ['rock', { stages: { DEF: 1 } }], 'kasib-berry': ['ghost', { z: 15 }], 'haban-berry': ['dragon', { stages: { SPA: 1 } }], 'colbur-berry': ['dark', { immune: ['taunt'] }], 'babiri-berry': ['steel', { shield: 10 }], 'roseli-berry': ['fairy', { stages: { SPD: 1 } }] };
    Object.entries(RESIST).forEach(([slug, [type, after]]) => def(slug, 50, 75, { resist: type, after, consumable: true, berry: true }));
    def('chilan-berry', 50, 75, { resist: 'normal', anyEffectiveness: true, after: { stages: { SPE: 1 } }, consumable: true, berry: true });
    const PINCH = {
        'liechi-berry': [20, 60, { at: 0.5, stages: { ATK: 1 }, nextBoost: true }],
        'petaya-berry': [20, 60, { at: 0.5, stages: { SPA: 1 }, nextBoost: true }],
        'ganlon-berry': [10, 30, { at: 0.5, stages: { DEF: 1 }, shield: true }],
        'apicot-berry': [10, 30, { at: 0.5, stages: { SPD: 1 }, shield: true }],
        'salac-berry': [30, 70, { at: 0.5, stages: { SPE: 1 }, gauge: true }],
        'lansat-berry': [15, 50, { at: 0.5, stages: { CRIT: 2 }, critBoost: true }],
        'starf-berry': [25, 60, { at: 0.5, starf: true }],
        'micle-berry': [20, 50, { at: 0.5, micle: true }],
        'custap-berry': [25, 50, { atV: true, custap: true }],
        'oran-berry': [10, 25, { at: 0.75, heal: true }],
        'sitrus-berry': [25, 50, { at: 0.5, heal: true }],
        'berry-juice': [6, 15, { at: 0.5, regen: true }],
        'figy-berry': [33, 60, { at: 0.25, heal: true, stages: { ATK: 1 } }],
        'wiki-berry': [33, 60, { at: 0.25, heal: true, stages: { SPA: 1 } }],
        'mago-berry': [33, 60, { at: 0.25, heal: true, gaugeFlat: 25 }],
        'aguav-berry': [33, 60, { at: 0.25, heal: true, shieldFlat: 10 }],
        'iapapa-berry': [33, 60, { at: 0.25, heal: true, stages: { DEF: 1 } }],
    };
    Object.entries(PINCH).forEach(([slug, [base, cap, fx]]) => def(slug, base, cap, { pinch: fx, consumable: true, berry: true }));
    def('enigma-berry', 25, 50, { enigma: true, consumable: true, berry: true });
    def('jaboca-berry', 12.5, 30, { retaliate: 'physical', consumable: true, berry: true });
    def('rowap-berry', 12.5, 30, { retaliate: 'special', consumable: true, berry: true });
    def('kee-berry', 8, 25, { guard: 'physical', stages: { DEF: 1 }, consumable: true, berry: true });
    def('maranga-berry', 8, 25, { guard: 'special', stages: { SPD: 1 }, consumable: true, berry: true });
    def('leppa-berry', 30, 80, { leppa: true, consumable: true, berry: true });
    const CURE = { 'cheri-berry': ['STAT_PAR', { gauge: true }], 'chesto-berry': ['STAT_SOM', { z: true }], 'pecha-berry': ['STAT_PSN', { regen: true }], 'rawst-berry': ['STAT_BRU', { shield: true }], 'aspear-berry': ['STAT_GEL', { nextBoost: true }], 'persim-berry': ['STAT_CONF', { acc: true }] };
    Object.entries(CURE).forEach(([slug, [id, then]]) => def(slug, { 'cheri-berry': 25, 'chesto-berry': 25, 'pecha-berry': 4, 'rawst-berry': 10, 'aspear-berry': 20, 'persim-berry': 15 }[slug], { 'cheri-berry': 60, 'chesto-berry': 60, 'pecha-berry': 10, 'rawst-berry': 30, 'aspear-berry': 50, 'persim-berry': 40 }[slug], { cure: [id], then, consumable: true, berry: true }));
    def('lum-berry', 5, 20, { cure: 'all', then: { heal: true }, consumable: true, berry: true });
    def('pomeg-berry', 8, 20, { firstHit: { healBlock: true, heal: true }, consumable: true, berry: true });
    const EVB = { 'kelpsy-berry': 'ATK', 'qualot-berry': 'DEF', 'hondew-berry': 'SPA', 'grepa-berry': 'SPD', 'tamato-berry': 'SPE' };
    Object.entries(EVB).forEach(([slug, stat]) => def(slug, 15, 40, { firstHit: { lower: stat, gauge: stat !== 'SPE', foeGauge: stat === 'SPE' }, consumable: true, berry: true }));

    // ------------------------------------------------------------------
    // OUTILS
    // ------------------------------------------------------------------
    const B = () => BattleRules;
    const say = (u, text, kind = 'buff') => { if (typeof spawnEffectText === 'function') spawnEffectText(u, text, kind); };
    const nameOf = (id) => (typeof GameData !== 'undefined' && GameData.getItem(id)?.name_fr) || id;
    const allUnits = () => [...(grid.player || []), ...(grid.enemy || [])].filter(u => u && !u.isKO);
    const allies = (u) => (grid[u._side] || []).filter(x => x && !x.isKO && x !== u);
    const foes = (u) => (grid[u._side === 'player' ? 'enemy' : 'player'] || []).filter(x => x && !x.isKO);
    const adjacent = (u) => allies(u).filter(x => Math.abs(B().laneOf(x._index) - B().laneOf(u._index)) + Math.abs(B().depthOfIndex(x._side, x._index) - B().depthOfIndex(u._side, u._index)) === 1);
    const speciesOk = (u, s) => !s.species || s.species.includes(u._pokemonId ?? u.id);

    // Objets actifs d'un combattant (objets puis baies, hors consommés et hors Zone Magique)
    function itemsOf(u) {
        if (!u || u._itemsOff) return [];
        const list = [...(u.heldItems || []), ...(u.berries || [])];
        if (!list.length && u.heldItem) list.push(u.heldItem);
        return list.filter(id => S[id] && !(u._usedItems && u._usedItems.has(id)) && speciesOk(u, S[id]));
    }
    const has = (u, key) => itemsOf(u).filter(id => S[id][key] !== undefined && S[id][key] !== false);
    function valueOf(u, id) {
        const s = S[id];
        const mult = u?.itemMults?.[id] || (u?.heldItem === id ? u.itemMult : 0) || 1;
        return Math.min(s.cap ?? Infinity, s.base * mult);
    }
    // Même effet sur plusieurs objets : 100 % / 60 % / 30 %
    function stacked(values) {
        const w = [1, 0.6, 0.3];
        return [...values].sort((a, b) => b - a).reduce((a, v, i) => a + v * (w[i] ?? 0), 0);
    }
    const combineChance = (ps) => Math.min(0.6, 1 - ps.reduce((a, p) => a * (1 - p), 1));
    function consume(u, id, label = true) {
        (u._usedItems = u._usedItems || new Set()).add(id);
        if (S[id]?.berry) u._consumedBerry = id;
        if (label) say(u, nameOf(id), 'buff');
        if (typeof updateStatusIcons === 'function') updateStatusIcons(u);
    }
    const addGauge = (u, pct) => {
        u.actionPoints = Math.max(0, Math.min(150, (u.actionPoints || 0) + pct));
        if (typeof updateActionPointsUI === 'function') updateActionPointsUI(u);
    };
    const addZ = (u, pct) => { u.boostGauge = Math.min(100, (u.boostGauge || 0) + pct); if (typeof updateZMoveIndicators === 'function') updateZMoveIndicators(); };
    const addShield = (u, pct) => {
        const boost = 1 + stacked(has(u, 'shieldBoost').map(id => valueOf(u, id))) / 100;
        u.shield = (u.shield || 0) + Math.round(u.maxHp * Math.min(50, pct * boost) / 100);
        say(u, 'Bouclier', 'buff');
    };
    const healPct = (u, pct, src = null) => B().heal(u, u.maxHp * pct / 100 * (1 + stacked(has(u, 'bigRoot').map(id => valueOf(u, id))) / 100 * (src === 'regen' ? 1 : 0)), null);
    const addRegen = (u, pct, turns) => { (u._regens = u._regens || []).push({ pct: Math.round(pct * 10) / 10, turns }); say(u, 'Régénération', 'buff'); };
    const stages = (u, st) => B().addStages(u, st, true);

    // ------------------------------------------------------------------
    // MISE EN PLACE (BattleRules.setupBattle)
    // ------------------------------------------------------------------
    // Avant le calcul du rôle et des synergies : types, rôles, verrous de capacités, stats des ennemis
    function prepare(u) {
        if (!u) return;
        u._usedItems = new Set();
        u._metronome = { move: null, count: 0 };
        const ids = itemsOf(u);
        ids.forEach(id => {
            const s = S[id];
            if (s.typeSet) u.types = [...s.typeSet];
            if (s.normalTo) u._normalTo = s.normalTo;
            if (s.plate) (u._extraTypes = u._extraTypes || []).push(s.plate);
        });
        // Arceus et la Plaque Légende : type le plus efficace contre l'ennemi le plus menaçant
        if (ids.some(id => S[id].legendPlate)) {
            const threat = foes(u).sort((a, b) => (b.attack + b.spatk) - (a.attack + a.spatk))[0];
            if (threat && typeof getTypeModifier === 'function') {
                const best = TYPES.reduce((acc, t) => {
                    const m = (threat.types || []).reduce((x, dt) => x * getTypeModifier(t, dt), 1);
                    return m > acc.m ? { t, m } : acc;
                }, { t: 'normal', m: 0 });
                u.types = [best.t]; u._normalTo = best.t; u._legendType = best.t;
            }
        }
        // Verrous : objets Choix (1re attaque seulement) et Veste de Combat (pas de tactiques)
        const isPassive = (m) => typeof MoveRework !== 'undefined' && MoveRework.isPassive(m);
        if (ids.some(id => S[id].choice) && Array.isArray(u.moves)) {
            const firstAttack = u.moves.find(m => !isPassive(m) && (m.power || 0) > 0);
            if (firstAttack) u.moves = u.moves.filter(m => m === firstAttack || isPassive(m));
        }
        if (ids.some(id => S[id].noTactics) && Array.isArray(u.moves)) {
            const kept = u.moves.filter(m => isPassive(m) || (m.power || 0) > 0);
            if (kept.length) u.moves = kept;
        }
        if (ids.some(id => S[id].glove)) u._glove = true;
        if (ids.some(id => S[id].pads)) u._pads = true;
        if (ids.some(id => S[id].immovable)) u._immovable = true;
        if (ids.some(id => S[id].aggro)) u._aggro = true;
        if (ids.some(id => S[id].balloon)) { u.flags = u.flags || {}; u._balloon = true; }
        // Ennemis : leurs stats ne passent pas par la fiche, on applique ici les bonus de stats d'objets
        if (u._side === 'enemy') {
            const pct = statBonusFor({ id: u._pokemonId, heldItems: u.heldItems, berries: u.berries }, id => valueOf(u, id));
            const apply = (key, stat) => { if (pct[stat]) u[key] = Math.max(1, Math.round(u[key] * (1 + pct[stat] / 100))); };
            apply('attack', 'atk'); apply('defense', 'def'); apply('spatk', 'spatk'); apply('spdef', 'spdef'); apply('speed', 'speed');
            if (pct.hp) { u.maxHp = Math.round(u.maxHp * (1 + pct.hp / 100)); u.hp = u.maxHp; }
        }
    }
    // Rôle imposé par un foulard
    function forcedRole(u) {
        const id = itemsOf(u).find(x => S[x].role);
        return id ? S[id].role : null;
    }
    const roleBoost = (u) => { const id = itemsOf(u).find(x => S[x].role); return id && u.role === S[id].role ? valueOf(u, id) / 100 : 0; };
    // Après les synergies : boucliers, jauges et paliers de départ
    function onBattleStart(u) {
        if (!u || u.isKO) return;
        itemsOf(u).forEach(id => {
            const s = S[id], v = valueOf(u, id);
            if (s.startStages) stages(u, s.startStages);
            if (s.startShield) addShield(u, v);
            if (s.zStart) { addZ(u, v); }
            if (s.boosterEnergy) {
                const best = [['ATK', u.attack], ['DEF', u.defense], ['SPA', u.spatk], ['SPD', u.spdef], ['SPE', u.speed]].sort((a, b) => b[1] - a[1])[0][0];
                stages(u, { [best]: 1 }); addZ(u, v); consume(u, id);
            }
            if (s.pureIncense) u._statusImmuneTurns = Math.round(v);
            if (s.quickClaw && Math.random() * 100 < v) { u.actionPoints = Math.max(u.actionPoints || 0, 40); say(u, 'Vive Griffe', 'buff'); }
            if (s.role && roleBoost(u)) u._roleBoost = roleBoost(u);
        });
        if (u._legendType) say(u, `Type ${u._legendType}`, 'buff');
    }
    // Synergies : les plaques comptent comme un Pokémon du type
    const extraTypes = (u) => itemsOf(u).filter(id => S[id].plate).map(id => S[id].plate);

    // ------------------------------------------------------------------
    // STATS (fiche du Pokémon et ennemis)
    // ------------------------------------------------------------------
    // Bonus en % par stat des objets portés ; valueFn(id) donne la valeur améliorée de l'objet
    function statBonusFor(pokemon, valueFn) {
        const out = {};
        [...(pokemon.heldItems || []), ...(pokemon.berries || [])].forEach(id => {
            const s = S[id];
            if (!s?.statPct || !speciesOk(pokemon, s)) return;
            if (s.needsEvolution && !canEvolve(pokemon.id)) return;
            const v = valueFn(id);
            Object.entries(s.statPct).forEach(([k, raw]) => {
                const pct = raw === 'v' ? v : raw === '-v' ? -v : raw;
                out[k] = (out[k] || 0) + pct;
            });
        });
        return out;
    }
    function canEvolve(id) {
        const list = (typeof GameData !== 'undefined' && GameData.getPokedexSubset) ? GameData.getPokedexSubset() : [];
        return list.some(p => (typeof p.evolves_from === 'object' ? p.evolves_from?.id : p.evolves_from) === id);
    }

    // ------------------------------------------------------------------
    // DÉGÂTS (computeDamage)
    // ------------------------------------------------------------------
    // Multiplicateur offensif des objets de l'attaquant (cumul plafonné à ×2)
    function offenseMult(a, d, move, ctx) {
        const ids = itemsOf(a);
        if (!ids.length) return 1;
        const type = ctx.moveType;
        const groups = {}; // même effet : rendements décroissants
        const push = (k, v) => (groups[k] = groups[k] || []).push(v);
        ids.forEach(id => {
            const s = S[id], v = valueOf(a, id);
            if (s.types && s.types.includes(type)) push('type', v);
            if (s.cls && s.cls === move.damage_class) push('cls', v);
            if (s.superEffective && ctx.typeMod > 1) push('se', v);
            if (s.allDmg) push(`all:${id}`, v);
            if (s.critDmg && ctx.isCrit) push('crit', v);
            if (s.zoom && (d.effectiveSpeed || 0) > (a.effectiveSpeed || 0)) push('zoom', v);
            if (s.pads && ctx.contact) push('pads', v);
            if (s.weatherRock && B().field.weather?.type === s.weatherRock) push('weather', v);
            if (s.terrainExtender && B().field.terrain && ({ grassy: 'grass', electric: 'electric', psychic: 'psychic', misty: 'fairy' })[B().field.terrain.type] === type) push('terrain', v);
            if (s.guts && a.activeEffects?.some(e => ['STAT_BRU', 'STAT_PSN', 'STAT_PAR'].includes(e.id))) push('guts', v);
            if (s.metronome && a._metronome?.move === move.id) push('metro', v * Math.min(s.metronome, a._metronome.count));
            if (s.zType && move._isBoosted && s.zType === type) push('z', 20);
            if (s.gem === type && !ctx.estimate && !(move.damage_class === 'status')) { push('gem', v); consume(a, id); }
        });
        if (a._nextBoost && !ctx.estimate) { push('next', a._nextBoost); }
        if (a._critBoost && ctx.isCrit) push('critBoost', a._critBoost);
        if (a._roleBoost && ((a.role === 'attacker' && move.damage_class === 'physical') || (a.role === 'caster' && move.damage_class === 'special'))) push('role', a._roleBoost * 20);
        let mult = 1;
        Object.values(groups).forEach(vals => { mult *= 1 + stacked(vals) / 100; });
        if (a._glove && ctx.contactMove) mult *= Math.max(0.7, Math.min(1, ids.filter(id => S[id].glove).map(id => valueOf(a, id))[0] / 100));
        return Math.min(2, mult);
    }
    // Multiplicateur défensif des objets du défenseur (baies de résistance, Lunettes Filtre, Pare-Effet)
    function defenseMult(d, a, move, ctx) {
        const ids = itemsOf(d);
        if (!ids.length) return 1;
        let mult = 1;
        ids.forEach(id => {
            const s = S[id];
            if (s.resist && s.resist === ctx.moveType && (ctx.typeMod > 1 || s.anyEffectiveness) && ctx.typeMod > 0) {
                mult *= 1 - valueOf(d, id) / 100;
                if (!ctx.estimate) { consume(d, id); afterResist(d, s.after || {}); }
            }
            if (s.goggles && ctx.cellMult != null && ctx.cellMult < 1) mult *= 1 - valueOf(d, id) / 100;
            if (s.cloak && (move.effect || (move.rw?.fx || []).length)) mult *= 1 - valueOf(d, id) / 100;
        });
        if (d._balloon && ctx.moveType === 'ground' && !d._usedItems?.has('air-balloon')) mult = 0;
        return mult;
    }
    function afterResist(u, after) {
        if (after.immune) u._immune = { ids: after.immune, turns: 3 };
        if (after.regen) addRegen(u, after.regen, 3);
        if (after.stages) stages(u, after.stages);
        if (after.anchor) u._anchorTurns = 3;
        if (after.gauge) addGauge(u, after.gauge);
        if (after.z) addZ(u, after.z);
        if (after.shield) addShield(u, after.shield);
    }
    // Paliers de critique apportés (maximum +2 par les objets)
    const critStages = (u) => Math.min(2, itemsOf(u).reduce((a, id) => a + (S[id].crit || 0), 0)) + (u._critBerry || 0);
    const critShieldPierce = (u) => Math.max(0, ...itemsOf(u).filter(id => S[id].critPierce).map(id => valueOf(u, id)));
    // Précision (Loupe, Lentille Zoom, Baie Micle, Baie Kika) et esquive (Poudre Claire, Encens Doux)
    function accuracyMult(a, d) {
        if (a._sureHitOnce) return Infinity;
        let bonus = 0;
        itemsOf(a).forEach(id => {
            const s = S[id];
            if (s.acc) bonus += valueOf(a, id);
            if (s.zoom && (d.effectiveSpeed || 0) > (a.effectiveSpeed || 0)) bonus += valueOf(a, id);
        });
        bonus += a._accBonus || 0;
        const evasion = stacked(itemsOf(d).filter(id => S[id].evasion).map(id => valueOf(d, id)));
        return (1 + bonus / 100) * (1 - Math.min(40, evasion) / 100);
    }
    // Jauge Z : cristaux du type de l'attaque
    function zGainMult(u, type) {
        return Math.min(2.5, 1 + stacked(itemsOf(u).filter(id => S[id].zType === type).map(id => valueOf(u, id))) / 100);
    }

    // ------------------------------------------------------------------
    // PV : survie, seuils de PV (applyDamageGrid et dégâts sur la durée)
    // ------------------------------------------------------------------
    // Ceinture Force (à PV pleins) et Bandeau (chance) : survivre à 1 PV
    function beforeHpLoss(u, dmg) {
        if (dmg < u.hp) return dmg;
        const sash = itemsOf(u).find(id => S[id].sash);
        if (sash && u.hp === u.maxHp) {
            consume(u, sash);
            u._afterSash = valueOf(u, sash);
            return u.hp - 1;
        }
        const bands = itemsOf(u).filter(id => S[id].band).map(id => valueOf(u, id) / 100);
        if (bands.length && Math.random() < combineChance(bands)) { say(u, nameOf('focus-band'), 'buff'); return u.hp - 1; }
        return dmg;
    }
    // Baies et objets « sous X % de PV » : se déclenchent toutes au même seuil, dans l'ordre des emplacements
    function afterHpLoss(u, hpBefore) {
        if (!u || u.isKO || u.hp <= 0) return;
        if (u._afterSash) { addShield(u, u._afterSash); delete u._afterSash; }
        const ratio = u.hp / u.maxHp, before = hpBefore / u.maxHp;
        itemsOf(u).forEach(id => {
            const s = S[id], p = s.pinch;
            if (!p) return;
            const at = p.atV ? valueOf(u, id) / 100 : p.at;
            if (!(ratio <= at && before > at) && !(ratio <= at && !u._pinchSeen?.has(id))) return;
            (u._pinchSeen = u._pinchSeen || new Set()).add(id);
            const v = valueOf(u, id);
            consume(u, id);
            if (p.heal) healPct(u, v);
            if (p.regen) addRegen(u, v, 4);
            if (p.stages) stages(u, p.stages);
            if (p.nextBoost) u._nextBoost = v;
            if (p.shield) addShield(u, v);
            if (p.shieldFlat) addShield(u, p.shieldFlat);
            if (p.gauge) addGauge(u, v);
            if (p.gaugeFlat) addGauge(u, p.gaugeFlat);
            if (p.critBoost) u._critBoost = v;
            if (p.micle) { u._sureHitOnce = true; u._accBonus = (u._accBonus || 0) + v; }
            if (p.custap) { u.actionPoints = Math.max(u.actionPoints || 0, 100); addGauge(u, 0); }
            if (p.starf) {
                const keys = ['ATK', 'DEF', 'SPA', 'SPD', 'SPE'];
                const k1 = keys[Math.floor(Math.random() * keys.length)];
                stages(u, { [k1]: 2 });
                if (Math.random() * 100 < v) { const k2 = keys.filter(k => k !== k1)[Math.floor(Math.random() * 4)]; stages(u, { [k2]: 1 }); }
            }
        });
    }

    // ------------------------------------------------------------------
    // RÉACTIONS AUX COUPS REÇUS (après chaque cible touchée)
    // ------------------------------------------------------------------
    async function onHit(t, a, move, dmg, ctx) {
        if (!t || !a || t._side === a._side) return;
        const contact = ctx.contact && !a._pads && !a._glove;
        for (const id of itemsOf(t)) {
            const s = S[id], v = valueOf(t, id);
            if (s.helmet && contact && !a.isKO) B().damage(a, a.maxHp * v / 100, nameOf(id));
            if (s.balloon && dmg > 0) { consume(t, id, false); say(t, 'Ballon éclaté', 'info'); t._balloon = false; addShield(t, v); }
            if (s.smoke && !t.isKO) { consume(t, id); [t, ...adjacent(t).filter(x => B().depthOfIndex(x._side, x._index) === B().depthOfIndex(t._side, t._index))].forEach(x => stages(x, { EVA: 1 })); addGauge(t, v); }
            if (s.hitGauge && !t.isKO) addGauge(t, v);
            if (s.weaknessPolicy && ctx.typeMod > 1 && !t.isKO) { consume(t, id); stages(t, { ATK: 2, SPA: 2 }); addZ(t, v); }
            if (s.typeReact && s.typeReact.type === ctx.moveType && !t.isKO) {
                consume(t, id); stages(t, s.typeReact.stages);
                if (s.typeReact.heal) healPct(t, v);
                if (s.typeReact.gauge) addGauge(t, v);
                if (s.typeReact.shield) addShield(t, v);
                if (s.typeReact.z) addZ(t, v);
            }
            if (s.enigma && ctx.typeMod > 1 && !t.isKO) { consume(t, id); healPct(t, v); }
            if (s.retaliate && s.retaliate === move.damage_class && !a.isKO) { consume(t, id); B().damage(a, a.maxHp * v / 100, nameOf(id)); }
            if (s.guard && s.guard === move.damage_class && !t.isKO) { consume(t, id); stages(t, s.stages); addShield(t, v); }
            if (s.firstHit && !t.isKO) {
                consume(t, id);
                const f = s.firstHit;
                if (f.healBlock) { a.flags = a.flags || {}; a.flags.healBlock = { turns: 2 }; healPct(t, v); }
                if (f.lower) stages(a, { [f.lower]: -1 });
                if (f.gauge) addGauge(t, v);
                if (f.foeGauge) addGauge(a, -v);
            }
            if (s.stickyBarb && contact && !a.isKO && !a._usedItems?.has(id)) {
                const freeSlot = (a.heldItems || []).length < 3;
                if (freeSlot) { a.heldItems = [...(a.heldItems || []), id]; (t._usedItems = t._usedItems || new Set()).add(id); (a.itemMults = a.itemMults || {})[id] = t.itemMults?.[id] || 1; B().damage(a, a.maxHp * v / 100, nameOf(id)); }
            }
            if (s.ejectButton && !t.isKO) {
                const back = allies(t).sort((x, y) => B().depthOfIndex(y._side, y._index) - B().depthOfIndex(x._side, x._index))[0];
                if (back && !t._immovable && !back._immovable && typeof MoveRework !== 'undefined' && MoveRework.swapUnits) {
                    consume(t, id); MoveRework.swapUnits(t, back); addGauge(back, v);
                }
            }
            if (s.redCard && !a.isKO && !a._immovable && typeof MoveRework !== 'undefined' && MoveRework.pushUnit) {
                consume(t, id); MoveRework.pushUnit(a, 2, true); addGauge(a, -v);
            }
        }
        // Lunettes Filtre et Destinée ne sont pas des réactions au coup ; la Baie Micle s'arrête après un coup
        if (a._sureHitOnce) delete a._sureHitOnce;
    }

    // ------------------------------------------------------------------
    // APRÈS L'ACTION DE L'ATTAQUANT
    // ------------------------------------------------------------------
    const SOUND = new Set(['hyper-voice', 'boomburst', 'bug-buzz', 'snarl', 'round', 'echoed-voice', 'disarming-voice', 'overdrive', 'sparkling-aria', 'uproar', 'chatter', 'relic-song', 'clanging-scales', 'clangorous-soul', 'torch-song', 'alluring-voice', 'psychic-noise', 'growl', 'roar', 'sing', 'supersonic', 'screech', 'snore', 'perish-song', 'heal-bell', 'noble-roar', 'parting-shot', 'confide', 'metal-sound', 'grass-whistle', 'eerie-spell']);
    async function afterAction(a, move, ctx) {
        if (!a) return;
        const damaging = (move.power || 0) > 0 && move.damage_class !== 'status';
        const dealt = (ctx.damages || []).reduce((s, d) => s + (d.dmg || 0), 0);
        delete a._nextBoost;
        // Métronome : compteur d'utilisations consécutives
        if (a._metronome) a._metronome = a._metronome.move === move.id ? { move: move.id, count: a._metronome.count + 1 } : { move: move.id, count: 1 };
        for (const id of itemsOf(a)) {
            const s = S[id], v = valueOf(a, id);
            if (s.lifeOrb && damaging && dealt > 0 && !a.isKO) { B().damage(a, a.maxHp * s.lifeOrb / 100, nameOf(id)); }
            if (s.shellBell && dealt > 0) B().heal(a, dealt * v / 100, null);
            if (s.roseIncense && dealt > 0 && ctx.moveType === 'grass') {
                const hurt = [a, ...allies(a)].filter(x => x.hp < x.maxHp).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
                if (hurt) B().heal(hurt, dealt * s.roseIncense / 100, null);
            }
            if (s.flinch && damaging && ctx.primary && !ctx.primary.isKO && Math.random() * 100 < v) B().addStatus(ctx.primary, 'STAT_FLINCH', a);
            if (s.gaugeCut && damaging) (ctx.damages || []).forEach(d => { if (!d.target.isKO && Math.random() * 100 < v) addGauge(d.target, -s.gaugeCut); });
            if (s.hitStatus && damaging && ctx.moveType === s.hitStatus.type && ctx.primary && Math.random() * 100 < s.hitStatus.chance) B().addStatus(ctx.primary, s.hitStatus.id, a);
            if (s.quickClaw && Math.random() * 100 < v) { a.actionPoints = Math.max(a.actionPoints || 0, 40); say(a, 'Vive Griffe', 'buff'); }
            if (s.fullIncense && !a.isKO) healPct(a, v, 'regen');
            if (s.expShare && (ctx.damages || []).some(d => d.target.isKO && d.target._side !== a._side)) adjacent(a).forEach(x => addGauge(x, v));
            if (s.blunder && ctx.missed) { consume(a, id); stages(a, { SPE: 2 }); addGauge(a, v); }
            if (s.powerHerb) { consume(a, id); addZ(a, v); }
            if (s.throatSpray && SOUND.has(move.id)) {
                if (!a._throat) { a._throat = true; stages(a, { SPA: 1 }); }
                addZ(a, v);
            }
            if (s.critZ && ctx.crit) addZ(a, v);
            if (s.firstCrit && a.flags) delete a.flags.nextCrit;
        }
        if (a._accBonus && a._accBonusTurns !== undefined && --a._accBonusTurns <= 0) delete a._accBonus;
    }
    // Épée Rouillée : premier coup critique
    function primeFirstCrit(u) {
        if (itemsOf(u).some(id => S[id].firstCrit)) { u.flags = u.flags || {}; u.flags.nextCrit = { turns: 99 }; }
    }

    // ------------------------------------------------------------------
    // DÉBUT DE TOUR
    // ------------------------------------------------------------------
    async function onTurnStart(u) {
        if (!u || u.isKO) return;
        if (u._statusImmuneTurns > 0) u._statusImmuneTurns--;
        if (u._immune && --u._immune.turns <= 0) delete u._immune;
        if (u._anchorTurns > 0) u._anchorTurns--;
        u._turns = (u._turns || 0) + 1;
        // Régénération passive : le meilleur objet compte (Restes et Boue Noire ne se cumulent pas)
        const regenIds = itemsOf(u).filter(id => S[id].regenTurn);
        if (regenIds.length) {
            const sludge = regenIds.find(id => S[id].sludge);
            if (sludge && !(u.types || []).includes('poison')) B().damage(u, u.maxHp * 0.125, nameOf(sludge));
            else if (u.hp < u.maxHp) { const best = Math.max(...regenIds.map(id => valueOf(u, id))); if (healPct(u, best, 'regen') > 0) say(u, nameOf(regenIds[0]), 'buff'); }
        }
        for (const id of itemsOf(u)) {
            const s = S[id], v = valueOf(u, id);
            if (s.rainRegen && B().field.weather?.type === 'rain') healPct(u, s.rainRegen, 'regen');
            if (s.sootheBell) adjacent(u).forEach(x => healPct(x, v, 'regen'));
            if (s.cleanseTag && Math.random() * 100 < v) {
                const sick = adjacent(u).find(x => x.activeEffects?.some(e => RulesDB?.[e.id]?.category === 'Majeur'));
                if (sick) { sick.activeEffects = sick.activeEffects.filter(e => RulesDB?.[e.id]?.category !== 'Majeur'); say(sick, 'Purifié', 'buff'); updateStatusIcons(sick); }
            }
            if (s.stickyBarb) B().damage(u, u.maxHp * 0.125, nameOf(id));
            if (s.orb && u._turns === 2 && !u.activeEffects?.some(e => e.id === s.orb)) { u._orbApplying = true; B().addStatus(u, s.orb, u); u._orbApplying = false; }
            if (s.seed && B().field.terrain?.type === s.seed.terrain) { consume(u, id); stages(u, { [s.seed.stat]: 1 }); addShield(u, v); }
            if (s.roomService && B().field.room?.type === 'trick') { consume(u, id); stages(u, { SPE: -1 }); addGauge(u, v); }
            if (u.isKO) return;
        }
    }
    // Orbe Toxique : le poison soigne au lieu de blesser
    const poisonHeals = (u) => itemsOf(u).some(id => S[id].poisonHeal);
    const poisonHealPct = (u) => Math.max(...itemsOf(u).filter(id => S[id].poisonHeal).map(id => valueOf(u, id)));
    // Orbe Flamme : la brûlure ne réduit plus les dégâts
    const ignoresBurnPenalty = (u) => itemsOf(u).some(id => S[id].guts);

    // ------------------------------------------------------------------
    // ALTÉRATIONS ET STATS
    // ------------------------------------------------------------------
    // Immunités temporaires (Encens Pur, baies de résistance) et Herbe Mental contre la confusion
    function blocksStatus(u, id) {
        if (u._orbApplying) return false;
        if (u._statusImmuneTurns > 0 && RulesDB?.[id]?.category === 'Majeur') { say(u, 'Encens Pur', 'info'); return true; }
        if (u._immune?.ids.includes(id)) { say(u, 'Immunisé', 'info'); return true; }
        const herb = itemsOf(u).find(x => S[x].mentalHerb);
        if (herb && id === 'STAT_CONF') { consume(u, herb); u._immune = { ids: ['STAT_CONF'], turns: Math.round(valueOf(u, herb)) }; return true; }
        return false;
    }
    // Baies de soin d'altération, Nœud Destin
    function onStatus(u, id, source) {
        if (!u || u.isKO) return;
        for (const it of itemsOf(u)) {
            const s = S[it], v = valueOf(u, it);
            if (s.destinyKnot && source && source !== u && source._side !== u._side && Math.random() * 100 < v) B().addStatus(source, id, u);
            if (!s.cure) continue;
            if (s.cure !== 'all' && !s.cure.includes(id)) continue;
            consume(u, it);
            u.activeEffects = (u.activeEffects || []).filter(e => s.cure === 'all' ? RulesDB?.[e.id]?.category !== 'Majeur' && e.id !== 'STAT_CONF' : e.id !== id);
            const t = s.then || {};
            if (t.heal) healPct(u, v);
            if (t.gauge) addGauge(u, v);
            if (t.z) addZ(u, v);
            if (t.regen) addRegen(u, v, 3);
            if (t.shield) addShield(u, v);
            if (t.nextBoost) u._nextBoost = v;
            if (t.acc) { u._accBonus = (u._accBonus || 0) + v; u._accBonusTurns = 3; }
            if (typeof updateStatusIcons === 'function') updateStatusIcons(u);
            break;
        }
    }
    // Baisse de stats infligée par l'ennemi : Pierre Stase et Amulette Pure la bloquent ; Herbe Blanche,
    // Bouton Fuite et Orbe Adrénaline réagissent. Renvoie les stats réellement appliquées.
    function filterEnemyDrops(u, statsDelta) {
        const ids = itemsOf(u);
        const negative = Object.entries(statsDelta).filter(([, v]) => v < 0);
        if (!negative.length) return statsDelta;
        if (ids.some(id => S[id].freezeStages) || ids.some(id => S[id].clearAmulet)) {
            const amulet = ids.find(id => S[id].clearAmulet);
            if (amulet) addZ(u, valueOf(u, amulet));
            say(u, 'Stats protégées', 'info');
            return Object.fromEntries(Object.entries(statsDelta).filter(([, v]) => v > 0));
        }
        return statsDelta;
    }
    function afterEnemyDrops(u) {
        for (const id of itemsOf(u)) {
            const s = S[id], v = valueOf(u, id);
            if (s.whiteHerb) {
                consume(u, id);
                Object.keys(u.statMods).forEach(k => { if (u.statMods[k] < 0) u.statMods[k] = 0; });
                addGauge(u, v); break;
            }
            if (s.ejectPack && typeof MoveRework !== 'undefined' && MoveRework.pushUnit && !u._immovable) {
                consume(u, id); MoveRework.pushUnit(u, 2, false);
                Object.keys(u.statMods).forEach(k => { if (u.statMods[k] < 0) u.statMods[k] = 0; });
                addGauge(u, v); break;
            }
            if (s.adrenaline) { consume(u, id); stages(u, { SPE: 1 }); addGauge(u, v); break; }
        }
    }
    // Pierre Stase : les stats ne montent pas non plus
    const freezesStages = (u) => itemsOf(u).some(id => S[id].freezeStages);

    // ------------------------------------------------------------------
    // DÉPLACEMENTS, CIBLAGE, OBJETS VOLÉS
    // ------------------------------------------------------------------
    const isImmovable = (u) => !!(u && (u._immovable || u._anchorTurns > 0));
    const shedsTrap = (u) => itemsOf(u).some(id => S[id].shedShell);
    function onMoved(u) {
        const id = itemsOf(u).find(x => S[x].floatStone);
        if (id) addGauge(u, valueOf(u, id));
    }
    const isAggro = (u) => !!u?._aggro;
    // Bouclier Talent : objets protégés
    function protectsItems(u) {
        const id = itemsOf(u).find(x => S[x].itemShield);
        if (!id) return false;
        addShield(u, valueOf(u, id)); say(u, nameOf(id), 'info');
        return true;
    }
    // Durées : roches météo, Extension Terrain, Lumargile (+3 tours)
    const weatherBonus = (u, type) => itemsOf(u).some(id => S[id].weatherRock === type || (S[id].weatherRock === 'hail' && type === 'snow')) ? 3 : 0;
    const terrainBonus = (u) => itemsOf(u).some(id => S[id].terrainExtender) ? 3 : 0;
    const screenBonus = (u) => itemsOf(u).some(id => S[id].screenTurns) ? 3 : 0;
    // Piège : Accro Griffe (durée) et Bande Étreinte (dégâts)
    const trapTurnsBonus = (u) => itemsOf(u).some(id => S[id].trapTurns) ? 2 : 0;
    const trapDamagePct = (u) => { const id = itemsOf(u).find(x => S[x].trapDamage); return id ? valueOf(u, id) : 6; };
    // Baie Mepo : la jauge Z repart à {v} % après la première capacité Z
    function afterZMove(u) {
        const id = itemsOf(u).find(x => S[x].leppa);
        if (id) { consume(u, id); u.boostGauge = Math.round(valueOf(u, id)); }
    }
    // Dé Pipé : un coup de plus sur les attaques à coups multiples
    const extraHitPct = (u) => { const id = itemsOf(u).find(x => S[x].extraHit); return id ? valueOf(u, id) : 0; };
    // Encens Vague : +15 points sur les cases secondaires de ses zones
    const waveSplash = (u, type) => itemsOf(u).some(id => S[id].waveSplash) && type === 'water' ? 0.15 : 0;
    // Gant de boxe : le contact n'est plus du contact
    const ignoresContact = (u) => !!u?._glove;
    const critPierce = critShieldPierce;

    // ------------------------------------------------------------------
    // RÉCOMPENSES
    // ------------------------------------------------------------------
    function rewardBonus(playerUnits) {
        let money = 0, loot = 0;
        (playerUnits || []).forEach(u => {
            itemsOf(u).forEach(id => {
                const s = S[id];
                if (s.money && (!s.moneyIfAlive || !u.isKO)) money = Math.max(money, valueOf(u, id));
                if (s.luckyEgg) loot = combineChance([loot, valueOf(u, id) / 100]);
            });
        });
        return { moneyMult: 1 + money / 100, extraLootChance: loot };
    }

    // ------------------------------------------------------------------
    // TEXTES (fiche, boutique)
    // ------------------------------------------------------------------
    const SPECIAL_Z = { paralyze: 'paralyse toutes les cibles', crit: 'est toujours un coup critique', line: 'frappe toute la ligne', anyCell: 'vise n\'importe quelle case', pierce: 'ignore boucliers et Abri', wave: 'prend la forme Onde', halfHp: 'retire 50 % des PV actuels', stealStages: 'vole les bonus de stats', shield: 'donne un bouclier de 20 %', allStats: 'monte toutes les stats', terrain: 'lance le Champ Psychique' };
    const spec = (id) => S[id] || null;
    const valueAt = (id, mult) => (S[id] ? Math.min(S[id].cap ?? Infinity, S[id].base * mult) : null);

    return {
        SPECS: S, spec, valueAt, valueOf, itemsOf, statBonusFor, canEvolve,
        prepare, forcedRole, onBattleStart, extraTypes, primeFirstCrit,
        offenseMult, defenseMult, critStages, critPierce, accuracyMult, zGainMult,
        beforeHpLoss, afterHpLoss, onHit, afterAction, onTurnStart,
        poisonHeals, poisonHealPct, ignoresBurnPenalty,
        blocksStatus, onStatus, filterEnemyDrops, afterEnemyDrops, freezesStages,
        isImmovable, shedsTrap, onMoved, isAggro, protectsItems, ignoresContact,
        weatherBonus, terrainBonus, screenBonus, trapTurnsBonus, trapDamagePct,
        afterZMove, extraHitPct, waveSplash, rewardBonus, SPECIAL_Z,
    };
})();
window.HeldItems = HeldItems;
