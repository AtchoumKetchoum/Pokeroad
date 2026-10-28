/**
 * balance-bench.js - Banc d'équilibrage : joue de vrais combats PokéRoad en accéléré.
 *
 *  - Le jeu complet est chargé (index.html et ses scripts), mais :
 *    · la sauvegarde vit en mémoire (localStorage remplacé) : la vraie partie n'est jamais touchée ;
 *    · les minuteurs passent en temps virtuel (un minuteur par tâche, dans l'ordre) : un combat dure ~0,1 s ;
 *    · Math.random est à graine pour chaque combat : avant/après se comparent sur les mêmes tirages.
 *  - Une équipe joueur « type » est construite pour chaque zone (niveau, Grade, entraînement, objets),
 *    contre les équipes de js/enemy-gen.js, avec ou sans objets de chaque côté.
 *  - Style de jeu : « appliqué » (la meilleure action à chaque tour, comme un bon joueur en manuel)
 *    ou « réflexe » (le combat automatique du jeu, volontairement simple).
 *
 * Console : await Bench.run({ zones: [1, 2], seeds: 3 }) ; Bench.lastResults ; Bench.budget(zone).
 */
(() => {
    // ------------------------------------------------------------------
    // 1. Sauvegarde en mémoire
    // ------------------------------------------------------------------
    const mem = new Map();
    Storage.prototype.getItem = function (k) { return mem.has(String(k)) ? mem.get(String(k)) : null; };
    Storage.prototype.setItem = function (k, v) { mem.set(String(k), String(v)); };
    Storage.prototype.removeItem = function (k) { mem.delete(String(k)); };
    Storage.prototype.clear = function () { mem.clear(); };

    // ------------------------------------------------------------------
    // 2. Temps virtuel : chaque minuteur part dans sa propre tâche, au plus tôt, dans l'ordre de leur échéance
    // ------------------------------------------------------------------
    let vnow = 0, nextId = 1, pending = false;
    const timers = new Map();
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        pending = false;
        let best = null;
        for (const t of timers.values()) if (!best || t.at < best.at || (t.at === best.at && t.id < best.id)) best = t;
        if (!best) return;
        vnow = Math.max(vnow, best.at);
        if (best.every) best.at = vnow + best.every; else timers.delete(best.id);
        try { best.fn(...best.args); } catch (e) { console.error(e); }
        if (timers.size) kick();
    };
    const kick = () => { if (!pending) { pending = true; channel.port2.postMessage(0); } };
    window.setTimeout = (fn, ms = 0, ...args) => {
        if (typeof fn !== 'function') return 0;
        const id = nextId++;
        timers.set(id, { id, fn, args, at: vnow + Math.max(0, +ms || 0) });
        kick();
        return id;
    };
    window.setInterval = (fn, ms = 0, ...args) => {
        const id = nextId++;
        const every = Math.max(10, +ms || 0);
        timers.set(id, { id, fn, args, at: vnow + every, every });
        kick();
        return id;
    };
    window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
    window.requestAnimationFrame = (fn) => window.setTimeout(() => fn(vnow), 16);
    window.cancelAnimationFrame = (id) => timers.delete(id);

    // Hasard à graine (mulberry32)
    const realRandom = Math.random;
    function seedRandom(seed) {
        let a = seed >>> 0;
        Math.random = () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const $ = (id) => document.getElementById(id);
    const log = (msg) => { const el = $('log'); el.textContent += msg + '\n'; el.scrollTop = el.scrollHeight; };
    const setStatus = (msg) => { $('status').textContent = msg; };

    // ------------------------------------------------------------------
    // 3. Chargement du jeu
    // ------------------------------------------------------------------
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error(`${src} introuvable`));
            document.body.appendChild(s);
        });
    }
    async function boot() {
        const html = await (await fetch('index.html', { cache: 'no-store' })).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const scripts = [...doc.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).filter(src => !/pwa\.js/.test(src));
        doc.querySelectorAll('script').forEach(s => s.remove());
        $('game-root').innerHTML = doc.body.innerHTML;
        for (const src of scripts) await loadScript(src);

        // Pas de sprites ni de mises en scène longues : seul le déroulé du combat compte
        PmdSprite.markup = ({ alt = '' } = {}) => `<img class="sprite" alt="${alt}">`;
        PmdSprite.hydrate = () => {};
        PmdSprite.play = () => {};
        PmdSprite.setSpeed = () => {};
        Epic.bossIntro = async () => {};
        if (Epic.zMoveCutin) Epic.zMoveCutin = async () => {};
        if (typeof ViewManager !== 'undefined') ViewManager.show = () => {};

        await GameData.init();
        await Promise.all([loadMovesDB(), loadTypesDB(), loadPokedexDB(), loadRulesDB()]);
        // Le combat automatique du jeu (réflexe), et un joueur appliqué qui choisit la meilleure action
        reflexPlay = window.choosePlayerAutoAction;
        skilledPlay = async (unit) => {
            if (!unit || unit.isKO) return;
            const action = chooseBestAction(unit);
            if (action) { clearActionUI(); await attack(unit, action.target, action.move); }
        };
        initGlobals();
        createGrids();
        window.isAutoBattle = true;
        isAutoBattle = true;
    }

    // ------------------------------------------------------------------
    // 4. Équipe joueur type
    // ------------------------------------------------------------------
    // Lignées des starters + Racaillou : rôles variés (Tank, Attaquant, Lanceur, Rapide)
    // Équipe par défaut (aussi celle des « mauvais choix ») et vivier dans lequel le joueur attentif choisit selon la zone
    const LINES = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [16, 17, 18], [74, 75, 76]];
    const ROSTER = [...LINES, [25, 26, 26], [63, 64, 65], [66, 67, 68], [92, 93, 94]];
    const EVOLVE_AT = [16, 36];
    const frToEn = (fr) => Object.keys(TYPE_FR).find(en => TYPE_FR[en] === fr);
    const speciesAt = (line, lvl) => line[lvl >= EVOLVE_AT[1] ? 2 : lvl >= EVOLVE_AT[0] ? 1 : 0];
    // Les 5 lignées les mieux adaptées aux types de la zone : bonne couverture offensive, peu de faiblesses
    function linesForZone(zone, lvl) {
        const zoneTypes = getZoneInfo(zone).types.map(frToEn).filter(Boolean);
        if (!zoneTypes.length) return LINES;
        const score = (line) => {
            const pk = PokedexDB[speciesAt(line, lvl)];
            const types = pk.types.map(t => t.toLowerCase());
            // Couverture offensive : types des attaques choisies (bonus du même type), pas seulement ceux du Pokémon
            const hitTypes = pickMoves(pk, lvl).map(m => MovesDB[m]).filter(mv => (mv?.power || 0) > 1).map(mv => mv.type.toLowerCase());
            const offense = Math.max(0, ...hitTypes.map(t => (types.includes(t) ? 1.5 : 1) * zoneTypes.reduce((a, z) => a + getTypeModifier(t, z), 0) / zoneTypes.length));
            const defense = zoneTypes.reduce((a, z) => a + types.reduce((m, t) => m * getTypeModifier(z, t), 1), 0) / zoneTypes.length;
            const bst = Object.values(pk.stats).reduce((a, b) => a + b, 0);
            // Personne n'envoie au combat un Pokémon sans attaque (Abra et Téléport)
            return offense - 0.6 * defense + bst / 400 - (hitTypes.length ? 0 : 100);
        };
        return [...ROSTER].sort((a, b) => score(b) - score(a)).slice(0, 5);
    }
    const DEPTH_PREF = { tank: [0, 1, 2], attacker: [0, 1, 2], speedster: [1, 0, 2], caster: [2, 1, 0], support: [2, 1, 0] };
    const TYPE_BOOSTER = {
        normal: 'silk-scarf', fire: 'charcoal', water: 'mystic-water', grass: 'miracle-seed', flying: 'sharp-beak',
        poison: 'poison-barb', ground: 'soft-sand', rock: 'hard-stone', electric: 'magnet', ice: 'never-melt-ice',
        fighting: 'black-belt', dragon: 'dragon-fang', ghost: 'spell-tag', steel: 'metal-coat', psychic: 'twisted-spoon', bug: 'silver-powder',
        dark: 'black-glasses', fairy: 'fairy-feather',
    };
    // Objets « raisonnables » selon le rôle (ce qu'un joueur attentif équipe), dans l'ordre des emplacements
    function playerItemsFor(role, mainType) {
        const booster = TYPE_BOOSTER[mainType] || 'muscle-band';
        return {
            tank: { items: ['leftovers', 'assault-vest', 'rocky-helmet'], berries: ['sitrus-berry', 'lum-berry', 'enigma-berry'] },
            support: { items: ['leftovers', 'light-clay', 'soothe-bell'], berries: ['sitrus-berry', 'lum-berry', 'enigma-berry'] },
            speedster: { items: [booster, 'scope-lens', 'life-orb'], berries: ['salac-berry', 'lum-berry', 'sitrus-berry'] },
            attacker: { items: [booster, 'life-orb', 'expert-belt'], berries: ['liechi-berry', 'sitrus-berry', 'lum-berry'] },
            caster: { items: [booster, 'life-orb', 'expert-belt'], berries: ['petaya-berry', 'sitrus-berry', 'lum-berry'] },
        }[role];
    }

    // Mauvais choix : objets d'un autre rôle (objet de type qui ne sert pas, objets offensifs sur un Tank…)
    const BAD_KIT = {
        tank: { items: ['wise-glasses', 'scope-lens', 'quick-claw'], berries: ['liechi-berry', 'petaya-berry', 'salac-berry'] },
        support: { items: ['muscle-band', 'razor-claw', 'expert-belt'], berries: ['liechi-berry', 'petaya-berry', 'salac-berry'] },
        speedster: { items: ['leftovers', 'light-clay', 'iron-ball'], berries: ['kee-berry', 'maranga-berry', 'oran-berry'] },
        attacker: { items: ['wise-glasses', 'light-clay', 'soothe-bell'], berries: ['petaya-berry', 'maranga-berry', 'oran-berry'] },
        caster: { items: ['muscle-band', 'rocky-helmet', 'soothe-bell'], berries: ['liechi-berry', 'kee-berry', 'oran-berry'] },
    };

    // Progression attendue par zone : Grade, entraînement (niveaux de piste), Atelier, attaques
    // ev/iv : niveaux sur la stat offensive principale, puis PV ; nature : niveaux ; item/move : niveau (étoiles au-delà de 20)
    // Équipe « type » : ce qu'on peut financer avec l'argent des combats (Bench.budget ≈ 80-100 % des gains),
    // les CT venant surtout du butin. Les vitamines (10 000 $) rendent les EV chers : ils restent un luxe.
    const PROFILES = {
        1: { grade: 1, ev: 0, evHp: 0, iv: 0, nature: 0, item: 1, move: 1 },
        2: { grade: 2, ev: 0, evHp: 0, iv: 2, nature: 0, item: 2, move: 2 },
        4: { grade: 3, ev: 0, evHp: 0, iv: 6, nature: 2, item: 3, move: 3 },
        6: { grade: 3, ev: 1, evHp: 0, iv: 10, nature: 3, item: 4, move: 4 },
        8: { grade: 4, ev: 2, evHp: 0, iv: 12, nature: 4, item: 5, move: 5 },
        10: { grade: 5, ev: 3, evHp: 1, iv: 14, nature: 5, item: 6, move: 6 },
    };
    // Équipe « améliorée » (prête pour un boss) : +3 niveaux (dans la limite du Grade) et un petit cran d'entraînement en plus,
    // de l'ordre d'un quart à la moitié des gains d'une zone (voir Bench.budget(zone, 'upgraded'))
    const UPGRADE = { levels: 3, iv: 4, ev: 0, evHp: 0, nature: 2, item: 2, move: 1 };
    const profileFor = (zone, kind = 'standard') => {
        const base = PROFILES[zone] || PROFILES[Object.keys(PROFILES).map(Number).filter(z => z <= zone).pop() || 1];
        if (kind !== 'upgraded') return { ...base, levels: 0 };
        const out = { ...base };
        Object.entries(UPGRADE).forEach(([k, v]) => { out[k] = (base[k] || 0) + v; });
        return out;
    };
    // Niveaux cumulés : 1 à 100 sans étoile, puis une étoile tous les 10 niveaux (Refinement)
    const starsFor = (n) => Refinement.starsForLevel(n);
    const track = (n) => ({ level: n, stars: starsFor(n) });
    const refLevel = (n) => ({ level: Math.max(1, n), stars: starsFor(n) });

    // 3 meilleures attaques (STAB, couverture) + un effet utile, comme le générateur ennemi
    function pickMoves(pk, level) {
        const learn = (pk.moves || []).filter(m => typeof m?.name === 'string' && (m.level == null || m.level <= level) && MovesDB?.[m.name]);
        const unique = [...new Map(learn.map(m => [m.name, MovesDB[m.name]])).entries()];
        const score = ([, mv]) => (mv.power || 0) * (pk.types.includes((mv.type || '').toLowerCase()) ? 1.5 : 1) * ((mv.accuracy ?? 100) / 100);
        const damaging = unique.filter(([, mv]) => (mv.power || 0) > 1).sort((a, b) => score(b) - score(a));
        const utility = unique.filter(([, mv]) => mv.damage_class === 'status' && (mv.effect || mv.ops));
        const chosen = [], usedTypes = new Set();
        for (const [id, mv] of damaging) {
            if (chosen.length >= 3) break;
            if (usedTypes.has(mv.type) && chosen.length >= 1 && damaging.length > 3) continue;
            chosen.push(id); usedTypes.add(mv.type);
        }
        if (utility.length) chosen.push(utility[0][0]);
        for (const [id] of damaging) { if (chosen.length >= 4) break; if (!chosen.includes(id)) chosen.push(id); }
        return chosen.slice(0, 4);
    }

    function buildTeam(zone, level, { withItems = true, profile = 'standard', choices = 'good' } = {}) {
        const prof = { ...profileFor(zone, profile) };
        // Le Grade fixe le niveau maximal (10 niveaux par Grade) : l'équipe type a celui qu'il faut pour suivre sa vague
        while (Refinement.getMaxLevel(prof.grade, 0) < level + prof.levels && prof.grade < 10) prof.grade++;
        const cap = Refinement.getMaxLevel(prof.grade, 0);
        // L'équipe de départ éclot au niveau 5 ; ensuite le joueur suit le niveau des ennemis (plus en équipe améliorée)
        const lvl = Math.max(5, Math.min(cap, level + prof.levels));
        const bad = choices === 'bad';
        const data = GameData._load();
        data.pokemons = [];
        data.itemRefinements = {};
        data.money = 0;
        const slots = GameData.getHoldSlots({ refinementLevel: prof.grade });
        seedRandom(zone * 7919 + 17);
        const team = (bad ? LINES : linesForZone(zone, lvl)).map(line => {
            const pk = GameData.createInstance(speciesAt(line, lvl), lvl);
            pk.isShiny = false;
            pk.refinementLevel = prof.grade;
            pk.ivs = { hp: 15, atk: 15, def: 15, spatk: 15, spdef: 15, speed: 15 }; // IV moyens d'un œuf
            const base = PokedexDB[pk.id].stats;
            const main = base.atk >= base.spatk ? 'atk' : 'spatk';
            const other = main === 'atk' ? 'spatk' : 'atk';
            pk.nature = { name: 'Bench', plus: main, minus: other };
            pk.training = {
                iv: { [main]: track(prof.iv) },
                ev: { [main]: track(prof.ev), hp: track(prof.evHp) },
                nature: track(prof.nature),
            };
            // Mauvais choix : les 4 premières attaques apprises (ce que le jeu met par défaut)
            pk.selectedMoves = bad
                ? [...new Set((pk.moves || []).filter(m => typeof m?.name === 'string' && (m.level == null || m.level <= lvl) && MovesDB?.[m.name]).map(m => m.name))].slice(0, 4)
                : pickMoves(pk, lvl);
            pk.moveRefinements = Object.fromEntries(pk.selectedMoves.map(m => [m, refLevel(prof.move)]));
            const moves = pk.selectedMoves.map(id => ({ ...MovesDB[id], id }));
            pk._role = BattleRules.computeRole(base, moves);
            // Objet de type : celui de la meilleure attaque du type du Pokémon (STAB)
            const stabMove = pk.selectedMoves.find(m => (MovesDB[m]?.power || 0) > 1 && pk.types.includes((MovesDB[m].type || '').toLowerCase()));
            const mainType = (MovesDB[stabMove || pk.selectedMoves[0]]?.type || pk.types[0]).toLowerCase();
            // Bench.kitOverride : même objet pour toute l'équipe (comparaison des objets entre eux)
            const kit = Bench.kitOverride || (bad ? BAD_KIT[pk._role] : playerItemsFor(pk._role, mainType));
            pk._badPlacement = bad;
            pk.heldItems = withItems ? kit.items.slice(0, slots.items) : [];
            pk.berries = withItems ? kit.berries.slice(0, slots.berries) : [];
            [...pk.heldItems, ...pk.berries].forEach(id => { data.itemRefinements[id] = refLevel(prof.item); });
            return pk;
        });
        data.pokemons = team;
        GameData._save(data);
        team.forEach(pk => { pk.stats = GameData.calculateStats(pk); });
        GameData._save(data);
        Math.random = realRandom;
        return team;
    }

    function placeTeam(team) {
        const grid = $('player-grid');
        const slots = [...grid.querySelectorAll('.unit-slot')];
        slots.forEach(s => { s.innerHTML = ''; });
        const taken = new Set();
        // Tanks et attaquants devant, lanceurs derrière ; les lignes du milieu en priorité pour les couloirs
        team.forEach(pk => {
            let idx = null;
            const pref = DEPTH_PREF[pk._role] || [0, 1, 2];
            for (const depth of (pk._badPlacement ? [...pref].reverse() : pref)) {
                for (const lane of [1, 0, 2]) { const i = BattleRules.indexAt('player', depth, lane); if (!taken.has(i)) { idx = i; break; } }
                if (idx !== null) break;
            }
            taken.add(idx);
            const unit = document.createElement('div');
            unit.className = 'unit';
            unit.dataset.instanceId = pk.instanceId;
            unit.innerHTML = `<div class="hp-box"><div class="status-icons"></div><div class="status-main-row"><span class="lvl-badge">Lv.${pk.level}</span>
                <div class="hp-container-minimal"><div class="ap-bar"><div class="ap-fill"></div></div><div class="hp-bar-bg"><div class="hp-fill"></div></div></div>
                <span class="charge-text">0%</span></div></div><div class="shadow"></div><img class="sprite" alt="">`;
            slots[idx].appendChild(unit);
        });
    }

    // ------------------------------------------------------------------
    // 5. Un combat
    // ------------------------------------------------------------------
    const MAX_TURNS = 600; // sécurité : l'épuisement (battle.js) termine les combats après 100 tours
    let reflexPlay = null, skilledPlay = null;
    let turnCount = { player: 0, enemy: 0 };
    let finish = null;
    function installHooks() {
        const origTurn = window.handleStartOfTurnEffects;
        window.handleStartOfTurnEffects = async (unit) => {
            turnCount[unit._side] = (turnCount[unit._side] || 0) + 1;
            if (turnCount.player + turnCount.enemy > MAX_TURNS) window.isRunning = false;
            return origTurn(unit);
        };
        const origWin = window.checkWinCondition;
        window.checkWinCondition = async () => { await origWin(); if (finish) { const f = finish; finish = null; f(); } };
    }

    async function fight({ zone, wave, battle, seed, playerItems = true, enemyItems = true, profile = 'standard', choices = 'good', play = 'skilled' }) {
        window.zoneIndex = zone; window.waveIndex = wave; window.battleIndex = battle;
        window.choosePlayerAutoAction = play === 'reflex' ? reflexPlay : skilledPlay;
        const enemyLevel = getEnemyLevel();
        // Le joueur suit le niveau des combats ordinaires de la vague (pas celui du boss)
        const saved = window.battleIndex; window.battleIndex = Math.min(9, battle);
        const playerLevel = getEnemyLevel();
        window.battleIndex = saved;
        const team = buildTeam(zone, playerLevel, { withItems: playerItems, profile, choices });
        placeTeam(team);
        prepareEnemyGridForNewBattle();
        if (!enemyItems) {
            document.querySelectorAll('#enemy-grid .unit').forEach(u => {
                const t = JSON.parse(u.dataset.tier || '{}');
                t.items = []; t.berries = []; t.item = null;
                u.dataset.tier = JSON.stringify(t);
            });
        }
        const before = GameData._load().money || 0;
        turnCount = { player: 0, enemy: 0 };
        seedRandom(seed);
        const done = new Promise(res => { finish = res; });
        await beginBattleSequence();
        await done;
        Math.random = realRandom;
        const players = grid.player.filter(Boolean), enemies = grid.enemy.filter(Boolean);
        const hpLeft = (units) => units.reduce((a, u) => a + Math.max(0, u.hp), 0) / Math.max(1, units.reduce((a, u) => a + u.maxHp, 0));
        const win = enemies.every(u => u.isKO) && players.some(u => !u.isKO);
        return {
            zone, wave, battle, seed, playerItems, enemyItems, enemyLevel, playerLevel: team[0].level,
            win, timeout: !win && players.some(u => !u.isKO) && enemies.some(u => !u.isKO),
            turns: turnCount.player + turnCount.enemy, playerTurns: turnCount.player,
            hpLeft: hpLeft(players), enemyHpLeft: hpLeft(enemies),
            survivors: players.filter(u => !u.isKO).length, enemiesKo: enemies.filter(u => u.isKO).length, enemies: enemies.length,
            bossHpLeft: enemies.some(u => u.isBoss) ? Math.max(0, enemies.find(u => u.isBoss).hp) / enemies.find(u => u.isBoss).maxHp : null,
            escortsLeft: enemies.filter(u => !u.isBoss && !u.isKO).length,
            reward: (GameData._load().money || 0) - before,
        };
    }

    // ------------------------------------------------------------------
    // 6. Campagne : zones × combats × graines × objets
    // ------------------------------------------------------------------
    // 12 équipes ordinaires et 4 boss par zone (le boss de la vague 10 est le boss final)
    const NORMAL = [1, 4, 7, 10].flatMap(w => [2, 5, 8].map(b => [w, b]));
    const BOSSES = [[3, 10], [5, 10], [8, 10], [10, 10]];
    const SCENARIOS = [
        { key: 'std', label: 'Équipe type (bons choix, objets des deux côtés), jeu appliqué' },
        { key: 'auto', label: 'Équipe type en combat automatique (réflexe)', play: 'reflex' },
        { key: 'upg', label: 'Équipe améliorée', profile: 'upgraded' },
        { key: 'bad', label: 'Mauvais choix (même investissement)', choices: 'bad' },
        { key: 'noPlayer', label: 'Joueur sans objets', playerItems: false },
        { key: 'noEnemy', label: 'Ennemis sans objets', enemyItems: false },
        { key: 'none', label: 'Aucun objet', playerItems: false, enemyItems: false },
    ];

    function summarize(rows) {
        const n = rows.length || 1;
        const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / n;
        const wins = rows.filter(r => r.win);
        return {
            n: rows.length,
            winRate: avg(r => r.win ? 1 : 0),
            turns: avg(r => r.turns),
            hpLeft: wins.length ? wins.reduce((a, r) => a + r.hpLeft, 0) / wins.length : 0,
            enemyHpLeft: avg(r => r.enemyHpLeft),
            timeouts: rows.filter(r => r.timeout).length,
        };
    }

    async function run({ zones = [1, 2, 4, 6, 8, 10], seeds = 2, scenarios = ['std', 'auto', 'upg', 'bad', 'noPlayer', 'noEnemy'], battles = null } = {}) {
        const rows = [];
        const t0 = performance.now();
        for (const zone of zones) {
            for (const sc of SCENARIOS.filter(s => scenarios.includes(s.key))) {
                for (const [wave, battle] of battles || [...NORMAL, ...BOSSES]) {
                    for (let s = 0; s < seeds; s++) {
                        const seed = zone * 1000003 + wave * 1009 + battle * 101 + s * 7;
                        try {
                            rows.push({ scenario: sc.key, ...(await fight({ zone, wave, battle, seed, playerItems: sc.playerItems ?? true, enemyItems: sc.enemyItems ?? true, profile: sc.profile, choices: sc.choices, play: sc.play })) });
                        } catch (e) { console.error(e); log(`Erreur z${zone} v${wave} c${battle} : ${e.message}`); }
                    }
                }
                setStatus(`Zone ${zone} · ${sc.label} · ${rows.length} combats (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
            }
        }
        Bench.lastRows = rows;
        Bench.lastResults = report(rows);
        render(Bench.lastResults);
        setStatus(`Terminé : ${rows.length} combats en ${((performance.now() - t0) / 1000).toFixed(0)} s`);
        return Bench.lastResults;
    }

    function report(rows) {
        const out = [];
        const zones = [...new Set(rows.map(r => r.zone))];
        for (const zone of zones) {
            for (const sc of SCENARIOS) {
                const zr = rows.filter(r => r.zone === zone && r.scenario === sc.key);
                if (!zr.length) continue;
                const normal = zr.filter(r => r.battle !== 10), boss = zr.filter(r => r.battle === 10);
                const finalBoss = zr.filter(r => r.battle === 10 && r.wave === 10);
                out.push({
                    zone, scenario: sc.key,
                    levels: `${Math.min(...zr.map(r => r.playerLevel))}-${Math.max(...zr.map(r => r.playerLevel))} vs ${Math.min(...zr.map(r => r.enemyLevel))}-${Math.max(...zr.map(r => r.enemyLevel))}`,
                    normal: summarize(normal), boss: summarize(boss), finalBoss: summarize(finalBoss),
                });
            }
        }
        return out;
    }

    const pct = (x) => `${Math.round(x * 100)} %`;
    function render(results) {
        const byScenario = (key) => results.filter(r => r.scenario === key);
        const label = Object.fromEntries(SCENARIOS.map(s => [s.key, s.label]));
        $('results').innerHTML = [...new Set(results.map(r => r.scenario))].map(key => `
            <h2 style="font-size:16px">${label[key]}</h2>
            <table><thead><tr><th>Zone</th><th>Niveaux</th><th>Victoires</th><th>Actions</th><th>PV restants</th><th>Boss</th><th>Boss final</th><th>Actions boss</th><th>PV boss</th></tr></thead>
            <tbody>${byScenario(key).map(r => `<tr><td>${r.zone}</td><td>${r.levels}</td>
                <td class="${r.normal.winRate >= 0.5 ? 'w' : 'l'}">${pct(r.normal.winRate)}</td><td>${r.normal.turns.toFixed(0)}</td><td>${pct(r.normal.hpLeft)}</td>
                <td class="${r.boss.winRate >= 0.5 ? 'w' : 'l'}">${pct(r.boss.winRate)}</td><td>${pct(r.finalBoss.winRate)}</td><td>${r.boss.turns.toFixed(0)}</td><td>${pct(r.boss.hpLeft)}</td></tr>`).join('')}</tbody></table>`).join('');
    }

    // ------------------------------------------------------------------
    // 7. Budget : coût de l'équipe type comparé à l'argent gagné en combat jusqu'à la zone
    // ------------------------------------------------------------------
    function income(upToZone) {
        let total = 0;
        const saved = [window.zoneIndex, window.waveIndex, window.battleIndex];
        for (let z = 1; z <= upToZone; z++) for (let w = 1; w <= 10; w++) for (let b = 1; b <= 10; b++) {
            window.zoneIndex = z; window.waveIndex = w; window.battleIndex = b;
            total += battleMoneyReward(getEnemyLevel()) * (typeof bossRewardMult === 'function' ? bossRewardMult() : 1);
        }
        [window.zoneIndex, window.waveIndex, window.battleIndex] = saved;
        return total;
    }
    function budget(zone, kind = 'standard') {
        const prof = profileFor(zone, kind);
        const items = GameData.getItems();
        const price = (id) => items[id]?.cost || 1000;
        window.zoneIndex = zone; window.waveIndex = 10; window.battleIndex = 9;
        const lvl = Math.min(Refinement.getMaxLevel(prof.grade, 0), getEnemyLevel() + prof.levels);
        let levels = 0; for (let l = 1; l < lvl; l++) levels += GameData.levelUpCost(l);
        const trackCost = (kind, n, itemPrice) => {
            let c = 0;
            for (let i = 0; i < n; i++) {
                const stars = starsFor(i + 1);
                if (i >= Refinement.FREE_LEVELS && i % Refinement.LEVELS_PER_STAR === 0) c += GameData.trainingCost(kind, 'atk', { level: i, stars: stars - 1 }).money; // étoile (hors matériau rare)
                const k = GameData.trainingCost(kind, 'atk', { level: i, stars });
                c += k.money + k.count * itemPrice;
            }
            return c;
        };
        const perPk = trackCost('ev', prof.ev, price('protein')) + trackCost('ev', prof.evHp, price('hp-up')) + trackCost('iv', prof.iv, price('muscle-wing'));
        let natureCost = 0; for (let i = 0; i < prof.nature; i++) natureCost += GameData.natureCost({ level: i, stars: 0 }).money + price('strawberry-sweet');
        // Atelier : les exemplaires de chaque objet porté (achetés en boutique) + l'argent, objets partagés par l'équipe
        let itemCost = 0;
        const slots = GameData.getHoldSlots({ refinementLevel: prof.grade });
        const kits = ['tank', 'attacker', 'caster', 'speedster', 'attacker'].map(r => playerItemsFor(r, 'fire'));
        const distinct = new Set(kits.flatMap(k => [...k.items.slice(0, slots.items), ...k.berries.slice(0, slots.berries)]));
        distinct.forEach(id => {
            itemCost += price(id);
            for (let l = 1; l < prof.item; l++) itemCost += Refinement.getMoneyCost('item', l, starsFor(l)) + Refinement.getRequiredCopies(l) * price(id);
        });
        // Attaques : 1 CT du type par niveau, 4 attaques par Pokémon ; le butin donne une CT sur 5 victoires, on achète le reste
        let moveCost = 0; for (let l = 1; l < prof.move; l++) moveCost += Refinement.getMoneyCost('move', l, starsFor(l));
        const tmBought = Math.max(0, 20 * Math.max(0, prof.move - 1) - 20 * zone) * price('tm01');
        const total = 5 * (levels + perPk + natureCost + 4 * moveCost) + itemCost + tmBought;
        const earned = income(zone);
        return { zone, level: lvl, income: earned, levels: 5 * levels, training: 5 * (perPk + natureCost), items: itemCost, moves: 20 * moveCost + tmBought, total, ratio: +(total / earned).toFixed(2) };
    }

    // Résumé texte : victoires, actions et PV restants (combats ordinaires | boss | boss final)
    function text(results = Bench.lastResults) {
        const f = (s) => `${String(Math.round(s.winRate * 100)).padStart(3)} % ${s.turns.toFixed(0).padStart(3)} act. ${String(Math.round(s.hpLeft * 100)).padStart(3)} % PV${s.timeouts ? ` (${s.timeouts} nuls)` : ''}`;
        return (results || []).map(r => `z${String(r.zone).padEnd(2)} ${r.scenario.padEnd(8)} ${r.levels.padEnd(14)} Ordinaires ${f(r.normal)} | Boss ${f(r.boss)} | Final ${Math.round(r.finalBoss.winRate * 100)} %`).join('\n');
    }

    // Détail par combat (zone|vague|scénario) : victoires et PV restants du boss
    function detail(rows = Bench.lastRows) {
        const keys = [...new Set(rows.map(r => `${r.zone}|${r.wave}|${r.battle}|${r.scenario}`))];
        return keys.map(k => {
            const rr = rows.filter(r => `${r.zone}|${r.wave}|${r.battle}|${r.scenario}` === k);
            const boss = rr[0].bossHpLeft != null ? ` boss ${Math.round(rr.reduce((a, r) => a + (r.bossHpLeft || 0), 0) / rr.length * 100)} %` : '';
            return `${k.padEnd(14)} ${rr.filter(r => r.win).length}/${rr.length}${boss}`;
        }).join('\n');
    }
    // Boss : victoires par zone et par vague (lancer run avec battles: les 10 boss)
    function bossSummary(rows = Bench.lastRows) {
        const out = [];
        for (const z of [...new Set(rows.map(r => r.zone))]) for (const sc of [...new Set(rows.map(r => r.scenario))]) {
            const rr = rows.filter(r => r.zone === z && r.scenario === sc && r.battle === 10);
            if (!rr.length) continue;
            const waves = [...Array(10)].map((_, i) => { const w = rr.filter(r => r.wave === i + 1); return `${w.filter(r => r.win).length}/${w.length}`; });
            out.push(`z${z} ${sc}: ${Math.round(rr.filter(r => r.win).length / rr.length * 100)} % | ${waves.join(' ')}`);
        }
        return out.join('\n');
    }
    const ALL_BOSSES = [...Array(10)].map((_, i) => [i + 1, 10]);
    // Attente de la fin d'une campagne lancée sans await (pour la console des outils)
    async function wait(ms = 40000) {
        const s0 = performance.now();
        while (performance.now() - s0 < ms && !/Terminé/.test($('status').textContent)) {
            await new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
        }
        return $('status').textContent;
    }

    window.Bench = { kitOverride: null, run, fight, buildTeam, budget, income, report, render, text, detail, bossSummary, ALL_BOSSES, wait, SCENARIOS, PROFILES, UPGRADE, lastResults: null, lastRows: null };

    boot().then(() => {
        installHooks();
        setStatus('Prêt');
        $('run-all').onclick = () => run({ seeds: +$('seeds').value || 2 });
    }).catch(e => { console.error(e); setStatus('Erreur : ' + e.message); });
})();
