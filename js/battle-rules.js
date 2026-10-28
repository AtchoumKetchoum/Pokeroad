/**
 * battle-rules.js - Règles stratégiques du combat
 *
 *  - Lignes : écran en portrait, ennemis en haut et joueur en bas. Dans chaque grille 3×3
 *    (index = rangée × 3 + couloir, rangée 0 en haut de l'écran), la rangée la plus proche du
 *    centre de l'arène est l'AVANT, la plus éloignée l'ARRIÈRE.
 *    Cases numérotées de 1 à 9 (1-2-3 à l'avant, de gauche à droite) : les colonnes se font face.
 *    Le contact ne frappe que le premier ennemi de sa colonne (ou de la colonne occupée la plus proche) ;
 *    la distance passe par-dessus, dans sa colonne et les colonnes voisines.
 *  - Rôles : Tank, Attaquant, Lanceur, Rapide, Soutien (stats de base + attaques équipées),
 *    avec un bonus quand le Pokémon est sur une ligne qui lui convient.
 *  - Synergies : 2 / 3 / 4 Pokémon d'un même type dans l'équipe déployée donnent des bonus.
 *  - Terrain : météo, champs, salles, pièges au sol, abris, effets sur la durée.
 *  - « ops » : petites opérations déclaratives qui décrivent l'effet des capacités (data/*.json).
 */

const BattleRules = (() => {

    // ------------------------------------------------------------------
    // LIGNES
    // ------------------------------------------------------------------
    const ROW_LABEL = { front: 'Avant', middle: 'Centre', back: 'Arrière' };
    const DEPTHS = ['front', 'middle', 'back'];

    // Couloir (0 = gauche de l'écran) et profondeur (0 = avant, 2 = arrière) d'une case
    const laneOf = (index) => index % 3;
    // Le joueur est en bas : son avant est sa rangée du haut. L'ennemi est en haut : son avant est sa rangée du bas.
    const depthOfIndex = (side, index) => (side === 'player' ? Math.floor(index / 3) : 2 - Math.floor(index / 3));
    const indexAt = (side, depth, lane) => (side === 'player' ? depth : 2 - depth) * 3 + lane;
    // Les trois cases d'une ligne (même profondeur), de gauche à droite
    const lineIndexes = (side, depth) => [0, 1, 2].map(lane => indexAt(side, depth, lane));

    const rowOfIndex = (side, index) => DEPTHS[depthOfIndex(side, index)];
    const rowOf = (unit) => rowOfIndex(unit._side, unit._index);
    const depthOf = (unit) => depthOfIndex(unit._side, unit._index);

    // Unités vivantes de la première ligne occupée (la « ligne de front » réelle)
    function frontLineUnits(side) {
        const units = (grid[side] || []).filter(u => u && !u.isKO);
        for (let depth = 0; depth < 3; depth++) {
            const inLine = units.filter(u => depthOf(u) === depth);
            if (inLine.length) return inLine;
        }
        return [];
    }

    // Attaque de contact : physique, avec une cible choisie (pas « tout le monde » ni « au hasard »)
    function isContact(move) {
        const rw = typeof MoveRework !== 'undefined' ? MoveRework.isContact(move) : null;
        if (rw !== null) return rw;
        return move && move.damage_class === 'physical' && (move.power || 0) > 0
            && !['all', 'random_single'].includes(move.aoe || 'single');
    }

    // Numéro de case (1 à 9) : 1-2-3 à l'avant, 4-5-6 au centre, 7-8-9 à l'arrière, de gauche à droite.
    // Les colonnes se font face : le 1 est en face du 1.
    const slotNumber = (side, index) => depthOfIndex(side, index) * 3 + laneOf(index) + 1;
    const slotOf = (unit) => slotNumber(unit._side, unit._index);
    const targetableFoes = (side) => (grid[side] || []).filter(u => u && !u.isKO && !u.flags?.diving);
    // Colonnes occupées, de la plus proche de `lane` à la plus lointaine (à égalité, le plus petit numéro)
    function lanesByDistance(side, lane) {
        const occupied = [...new Set(targetableFoes(side).map(u => laneOf(u._index)))];
        return occupied.sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane) || a - b);
    }
    // Contact : seulement le premier ennemi de sa colonne ; colonne vide → la colonne occupée la plus proche
    function contactTarget(attacker, side) {
        const lane = lanesByDistance(side, laneOf(attacker._index))[0];
        if (lane === undefined) return null;
        return targetableFoes(side).filter(u => laneOf(u._index) === lane).sort((a, b) => depthOf(a) - depthOf(b))[0];
    }
    // Distance : par-dessus le premier, dans sa colonne et les colonnes voisines ; si elles sont vides, les plus proches
    function rangedLanes(attacker, side) {
        const lane = laneOf(attacker._index);
        const ordered = lanesByDistance(side, lane);
        const near = ordered.filter(l => Math.abs(l - lane) <= 1);
        if (near.length) return near;
        return ordered.filter(l => Math.abs(l - lane) === Math.abs(ordered[0] - lane));
    }
    // Ignore le placement : synergie Spectre, Gant de Boxe…
    const ignoresPlacement = (attacker) => !!attacker.ignoresFrontline || (typeof HeldItems !== 'undefined' && HeldItems.ignoresContact(attacker));

    function canTarget(attacker, move, target) {
        if (!target || target.isKO) return false;
        if (target.flags?.diving && target._side !== attacker._side) return false; // Plongée : intouchable
        if (move?.rw?.anyCell) return true; // Plongée, tir de précision, attraction : n'importe quelle case
        if (target._side === attacker._side) return true;
        if (attacker._index == null || ignoresPlacement(attacker)) return true;
        if (isContact(move)) return contactTarget(attacker, target._side) === target;
        return rangedLanes(attacker, target._side).includes(laneOf(target._index));
    }
    // Cible permise la plus proche de celle visée (même colonne d'abord, puis la plus à l'avant)
    function retarget(attacker, move, preferred) {
        if (!preferred) return null;
        const lane = laneOf(preferred._index);
        return targetableFoes(preferred._side).filter(u => canTarget(attacker, move, u))
            .sort((a, b) => Math.abs(laneOf(a._index) - lane) - Math.abs(laneOf(b._index) - lane) || depthOf(a) - depthOf(b))[0] || null;
    }

    // ------------------------------------------------------------------
    // RÔLES
    // ------------------------------------------------------------------
    const ROLES = {
        tank:      { label: 'Tank',      short: 'TNK', rows: ['front'],                  desc: "À l'avant : −25 % de dégâts reçus, et les ennemis le visent en priorité." },
        attacker:  { label: 'Attaquant', short: 'ATQ', rows: ['front', 'middle'],        desc: "À l'avant ou au centre : +20 % de dégâts physiques." },
        caster:    { label: 'Lanceur',   short: 'LAN', rows: ['middle', 'back'],         desc: "Au centre ou à l'arrière : +20 % de dégâts spéciaux." },
        speedster: { label: 'Rapide',    short: 'RAP', rows: ['front', 'middle', 'back'], desc: 'Partout : démarre avec 50 % de jauge d\'action et +1 palier de critique.' },
        support:   { label: 'Soutien',   short: 'SOU', rows: ['middle', 'back'],         desc: "Au centre ou à l'arrière : soins et boucliers ×1,5." },
    };

    const SUPPORT_OPS = ['heal', 'shield', 'healMostWounded', 'cleanse', 'protect'];
    function isSupportMove(move) {
        if (!move || move.damage_class !== 'status') return false;
        if (move.zone === 'ally') return true;
        const effects = (typeof getMoveEffects === 'function') ? getMoveEffects(move) : [];
        if (effects.some(e => ['HEAL_HP', 'BUFF_REG', 'BUFF_SHIELD', 'ACTION_REVIVE'].includes(e))) return true;
        return (move.ops || []).some(op => SUPPORT_OPS.includes(op.op) || (op.op === 'stat' && ['allies', 'self'].includes(op.target) && Object.values(op.stats || {}).some(v => v > 0)));
    }

    function computeRole(base, moves = []) {
        if (moves.filter(isSupportMove).length >= 2) return 'support';
        if (!base) return 'attacker';
        const bulk = ((base.hp || 0) + (base.def || 0) + (base.spdef || 0)) / 3;
        const offense = Math.max(base.atk || 0, base.spatk || 0);
        if (bulk > offense * 1.1 && bulk >= (base.speed || 0)) return 'tank';
        // Rapide : seulement si la Vitesse domine nettement (sinon presque tous les Pokémon de base le seraient)
        if ((base.speed || 0) >= Math.max(offense, bulk) * 1.2) return 'speedster';
        return (base.atk || 0) >= (base.spatk || 0) ? 'attacker' : 'caster';
    }

    const isWellPlaced = (unit) => !!unit.role && ROLES[unit.role].rows.includes(rowOf(unit));
    const roleActive = (unit, role) => unit.role === role && isWellPlaced(unit);

    // ------------------------------------------------------------------
    // SYNERGIES DE TYPES
    // ------------------------------------------------------------------
    // Un effet propre à chaque type (js/synergies.js), paliers à 2 / 3 / 4 Pokémon du type.
    const SYNERGY_PERKS = Object.fromEntries(Object.entries(Synergies.DEFS).map(([t, d]) => [t, { desc: `${d.name} : ${d.text(d.values[1], 2)}` }]));
    const synergyCounts = (units) => Synergies.counts(units);
    const synergyTier = (count) => Synergies.tierOf(count);
    const describeSynergies = (units) => Synergies.describe(units);

    // ------------------------------------------------------------------
    // ÉTAT DU TERRAIN
    // ------------------------------------------------------------------
    let field;
    let lastMove = null;          // dernière capacité utilisée (Photocopie, Mimique…)
    const lastMoveBy = new Map(); // unité -> dernière capacité utilisée

    function resetField() {
        field = { weather: null, terrain: null, room: null, hazards: { player: [], enemy: [] }, ionDeluge: 0, moneyMult: 1 };
        lastMove = null;
        lastMoveBy.clear();
    }
    resetField();

    const WEATHER = {
        rain: { label: 'Pluie', boost: 'water', weaken: 'fire' },
        sun:  { label: 'Soleil', boost: 'fire', weaken: 'water' },
        sand: { label: 'Tempête de sable', chip: 6, immune: ['rock', 'ground', 'steel'] },
        hail: { label: 'Grêle', chip: 6, immune: ['ice'] },
        snow: { label: 'Neige', iceDefense: true },
        shadow: { label: 'Ciel Ombre', chip: 6, immune: ['shadow'] },
    };
    const TERRAIN = {
        grassy:   { label: 'Champ Herbu', boost: 'grass', heal: 6 },
        electric: { label: 'Champ Électrifié', boost: 'electric', noSleep: true },
        psychic:  { label: 'Champ Psychique', boost: 'psychic' },
        misty:    { label: 'Champ Brumeux', weaken: 'dragon', noStatus: true },
    };
    const ROOM = {
        trick:  { label: 'Distorsion' },   // les plus lents agissent en premier
        wonder: { label: 'Zone Étrange' }, // Défense et Déf. Spé. inversées
        magic:  { label: 'Zone Magique' }, // objets tenus sans effet
        gravity:{ label: 'Gravité' },      // précision +, le type Vol perd son immunité Sol
    };
    const HAZARD_LABEL = { spikes: 'Picots', rock: 'Piège de Roc', toxic: 'Pics Toxik', web: 'Toile Gluante' };

    const aliveCount = () => [...(grid.player || []), ...(grid.enemy || [])].filter(u => u && !u.isKO).length;
    // Les durées sont exprimées en « tours de table » : chaque Pokémon joue environ une fois par tour
    const roundsToActions = (rounds) => Math.max(1, rounds * aliveCount());

    function describeField() {
        const parts = [];
        parts.push(`Météo : ${field.weather ? WEATHER[field.weather.type].label : 'Clair'}`);
        parts.push(`Terrain : ${field.terrain ? TERRAIN[field.terrain.type].label : 'Normal'}`);
        if (field.room) parts.push(ROOM[field.room.type].label);
        ['player', 'enemy'].forEach(side => {
            const h = field.hazards[side];
            if (h.length) parts.push(`${side === 'player' ? 'Chez toi' : 'Chez l\'ennemi'} : ${h.map(x => HAZARD_LABEL[x.type] + (x.layers > 1 ? ` ×${x.layers}` : '')).join(', ')}`);
        });
        return parts;
    }

    // ------------------------------------------------------------------
    // OUTILS
    // ------------------------------------------------------------------
    const foesOf = (unit) => (grid[unit._side === 'player' ? 'enemy' : 'player'] || []).filter(u => u && !u.isKO);
    const alliesOf = (unit) => (grid[unit._side] || []).filter(u => u && !u.isKO);

    function addStages(unit, stats, announce = false) {
        if (typeof HeldItems !== 'undefined' && HeldItems.freezesStages(unit)) { if (announce) spawnEffectText(unit, 'Pierre Stase', 'info'); return; }
        const gains = {};
        Object.entries(stats).forEach(([stat, delta]) => {
            const key = stat.toUpperCase();
            const mult = unit.flags?.simple ? 2 : 1;
            const before = unit.statMods[key] || 0;
            const after = clamp(before + delta * mult, -6, 6);
            unit.statMods[key] = after;
            if (delta > 0 && after > before) gains[key] = delta;
            if (announce && after !== before && typeof spawnEffectText === 'function') {
                spawnEffectText(unit, `${delta > 0 ? '+' : '-'}${key}`, delta > 0 ? 'buff' : 'debuff');
            }
        });
        // Herbe Miroir des ennemis : ils copient ces bonus
        if (typeof HeldItems !== 'undefined') HeldItems.onStagesGained(unit, gains);
    }

    function heal(unit, amount, source) {
        if (!unit || unit.isKO || amount <= 0) return 0;
        if (unit.flags?.healBlock) { spawnEffectText(unit, 'Soin bloqué', 'info'); return 0; }
        let value = Math.floor(amount);
        if (source && roleActive(source, 'support')) value = Math.floor(value * 1.5);
        const before = unit.hp;
        unit.hp = Math.min(unit.maxHp, unit.hp + value);
        const gained = unit.hp - before;
        if (gained > 0) {
            animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
            BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), -gained);
        }
        return gained;
    }

    function damage(unit, amount, label) {
        if (!unit || unit.isKO || amount <= 0) return 0;
        unit._pendingDamage = (unit._pendingDamage || 0) + Math.max(1, Math.floor(amount));
        if (label) spawnEffectText(unit, label, 'status');
        BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), Math.max(1, Math.floor(amount)));
        applyDamageGrid(unit);
        return amount;
    }

    function setFlag(unit, name, turns = 1, value = true) {
        unit.flags = unit.flags || {};
        unit.flags[name] = { turns, value };
    }
    const hasFlag = (unit, name) => !!unit.flags?.[name];

    function addStatus(target, id, source, chance = 100) {
        if (!target || target.isKO || !RulesDB?.[id]) return false;
        if (Math.random() * 100 >= chance) return false;
        const rule = RulesDB[id];
        if (field.terrain?.type === 'misty' && rule.category === 'Majeur') { spawnEffectText(target, 'Protégé par la brume', 'info'); return false; }
        if (id === 'STAT_SOM' && (field.terrain?.type === 'electric' || hasFlag(target, 'insomnia'))) return false;
        if (rule.category === 'Majeur' && target.activeEffects.some(e => RulesDB[e.id]?.category === 'Majeur')) return false;
        if (target.activeEffects.some(e => e.id === id)) return false;
        if (rule.category === 'Majeur' && target.flags?.safeguard) { spawnEffectText(target, 'Rune Protect', 'info'); return false; }
        if (id === 'STAT_CONF' && target.flags?.noConfusion) return false;
        if (typeof HeldItems !== 'undefined' && HeldItems.blocksStatus(target, id)) return false;
        if (Synergies.blocksStatus(target, id)) return false;
        target.activeEffects.push({ id, duration: getEffectDuration(id, rule, {}), source: source?.id });
        spawnEffectText(target, rule.name, 'status');
        updateStatusIcons(target);
        if (typeof HeldItems !== 'undefined') HeldItems.onStatus(target, id, source);
        return true;
    }

    function swapPlaces(a, b) {
        if (!a || !b || a._side !== b._side || a === b) return false;
        const side = a._side, ia = a._index, ib = b._index;
        const slotA = getSlotEl(side, ia), slotB = getSlotEl(side, ib);
        const elA = slotA?.querySelector('.unit'), elB = slotB?.querySelector('.unit');
        grid[side][ia] = b; grid[side][ib] = a;
        a._index = ib; b._index = ia;
        if (elA && slotB) slotB.appendChild(elA);
        if (elB && slotA) slotA.appendChild(elB);
        return true;
    }

    function moveToBack(unit) {
        const side = unit._side;
        // Case libre la plus en arrière, dans son couloir d'abord
        const lanes = [laneOf(unit._index), ...[0, 1, 2].filter(l => l !== laneOf(unit._index))];
        for (const depth of [2, 1, 0]) {
            if (depth <= depthOf(unit)) return false;
            for (const lane of lanes) {
                const idx = indexAt(side, depth, lane);
                const occupant = grid[side][idx];
                if (!occupant) {
                    const slotFrom = getSlotEl(side, unit._index), slotTo = getSlotEl(side, idx);
                    const el = slotFrom?.querySelector('.unit');
                    grid[side][unit._index] = null; grid[side][idx] = unit; unit._index = idx;
                    if (el && slotTo) slotTo.appendChild(el);
                    return true;
                }
            }
        }
        return false;
    }

    // ------------------------------------------------------------------
    // MISE EN PLACE DU COMBAT
    // ------------------------------------------------------------------
    function setupBattle() {
        resetField();
        ['player', 'enemy'].forEach(side => {
            const units = (grid[side] || []).filter(Boolean);
            units.forEach(u => {
                u.flags = {};
                u.shield = u.shield || 0;
                if (typeof HeldItems !== 'undefined') HeldItems.prepare(u);
                const base = (typeof PokedexDB !== 'undefined' && PokedexDB) ? PokedexDB[u._pokemonId]?.stats : null;
                u.role = (typeof HeldItems !== 'undefined' && HeldItems.forcedRole(u)) || computeRole(base, u.moves);
                if (roleActive(u, 'speedster')) { u.actionPoints += 50; addStages(u, { CRIT: 1 }); }
            });
            // Synergies : un effet par type (js/synergies.js)
            // Zone 1 = apprentissage : les ennemis n'ont pas encore de synergies
            const counts = (side === 'enemy' && typeof zoneIndex !== 'undefined' && zoneIndex <= 1) ? {} : synergyCounts(units);
            Synergies.setup(units, counts);
            // Boss : PV multipliés et mécanique de phase
            units.filter(u => u.isBoss).forEach(u => {
                // PV ×1,2 en zone 1, puis plus robustes jusqu'à ×1,8 à partir de la zone 7
                // (moins qu'avant : le boss a désormais 4 escortes, 5 contre 5, et les ennemis sont plus forts)
                const bossHp = Math.min(1.8, 1.2 + (Math.max(1, zoneIndex) - 1) * 0.1);
                u.maxHp = Math.round(u.maxHp * bossHp); u.hp = u.maxHp; u._bossHpMult = bossHp;
                u.bossPhase = 1;
                spawnEffectText(u, 'BOSS', 'debuff', -70);
            });
            if (typeof HeldItems !== 'undefined') units.forEach(u => { HeldItems.onBattleStart(u); HeldItems.primeFirstCrit(u); });
            units.forEach(u => { animateHpGrid(u._side, u._index, u.maxHp, u.hp, u.maxHp); updateStatusIcons(u); });
        });
        if (typeof FormationUI !== 'undefined') FormationUI.refresh();
        // Refonte : passifs du premier tour (météo, pièges, bonus…)
        if (typeof MoveRework !== 'undefined') MoveRework.onBattleStart();
    }

    // ------------------------------------------------------------------
    // DÉGÂTS
    // ------------------------------------------------------------------
    function moveTypeFor(attacker, move) {
        let type = (move.type || 'normal').toLowerCase();
        if (attacker?._normalTo && type === 'normal') type = attacker._normalTo;
        if (hasFlag(attacker, 'electrify')) type = 'electric';
        if (field.ionDeluge > 0 && type === 'normal') type = 'electric';
        return type;
    }

    function damageMultiplier(attacker, defender, move, moveType) {
        let m = 1;
        const physical = move.damage_class === 'physical';
        // Lignes
        if (physical && rowOf(attacker) === 'front') m *= 1.1;
        if (rowOf(defender) === 'back') m *= 0.85;
        // Rôles
        if (physical && roleActive(attacker, 'attacker')) m *= 1.2;
        if (!physical && roleActive(attacker, 'caster')) m *= 1.2;
        if (roleActive(defender, 'tank')) m *= 0.75;
        // Météo et champs
        const w = field.weather && WEATHER[field.weather.type];
        const umbrella = typeof HeldItems !== 'undefined' && (HeldItems.ignoresWeather(attacker) || HeldItems.ignoresWeather(defender));
        if (!umbrella && w?.boost === moveType) m *= 1.5;
        if (!umbrella && w?.weaken === moveType) m *= 0.5;
        if (w?.iceDefense && physical && (defender.types || []).includes('ice')) m *= 0.67;
        if (field.weather?.type === 'sand' && !physical && (defender.types || []).includes('rock')) m *= 0.67;
        const t = field.terrain && TERRAIN[field.terrain.type];
        if (t?.boost === moveType) m *= 1.3;
        if (t?.weaken === moveType) m *= 0.5;
        // Poudre : une attaque Feu explose au visage du lanceur (géré dans beforeAttack)
        // Boss en phase 2 : frappe plus fort
        if (attacker.isBoss && attacker.bossPhase === 2) m *= 1.3;
        // Refonte : en face, distance, Coup de Main, murs, Lance-Boue…
        if (typeof MoveRework !== 'undefined') m *= MoveRework.damageMult(attacker, defender, move, moveType);
        return m;
    }

    // Statistique défensive (Zone Étrange inverse Défense et Déf. Spé.)
    function defenseStat(defender, physical) {
        const useDef = field.room?.type === 'wonder' ? !physical : physical;
        return useDef ? (defender.defense || 10) : (defender.spdef || 10);
    }

    const itemsDisabled = () => field.room?.type === 'magic';
    const speedInverted = () => field.room?.type === 'trick';

    // ------------------------------------------------------------------
    // AVANT / APRÈS UNE ATTAQUE
    // ------------------------------------------------------------------
    // Retourne la capacité réellement utilisée (ou null si l'action échoue)
    function beforeAttack(attacker, move) {
        if (hasFlag(attacker, 'taunt') && move.damage_class === 'status') {
            spawnEffectText(attacker, 'Provoqué !', 'info');
            return null;
        }
        if (hasFlag(attacker, 'imprisoned') && attacker.flags.imprisoned.value?.includes?.(move.id)) {
            spawnEffectText(attacker, 'Possessif !', 'info');
            return null;
        }
        if (hasFlag(attacker, 'powder') && moveTypeFor(attacker, move) === 'fire') {
            delete attacker.flags.powder;
            damage(attacker, attacker.maxHp * 0.25, 'Nuée de Poudre');
            return null;
        }
        return move;
    }

    function recordMove(attacker, move) {
        // Les capacités qui en appellent une autre (Photocopie, Métronome…) ne sont pas mémorisées
        if (move && !move._isCalled && !move.ops?.some(o => o.op === 'callMove')) { lastMove = move; lastMoveBy.set(attacker, move); }
    }

    // Protection (Abri et variantes) : renvoie true si la cible bloque l'attaque
    function checkProtect(attacker, target, move) {
        if (!target.protect || target._side === attacker._side) return false;
        const variant = target.protect;
        spawnEffectText(target, 'Se protège !', 'info');
        if (isContact(move)) {
            if (variant === 'spiky') damage(attacker, attacker.maxHp / 8, 'Pico-Défense');
            if (variant === 'baneful') addStatus(attacker, 'STAT_PSN', target);
            if (variant === 'burning') addStatus(attacker, 'STAT_BRU', target);
            if (variant === 'kings') addStages(attacker, { ATK: -1 }, true);
            if (variant === 'obstruct') addStages(attacker, { DEF: -2 }, true);
            if (variant === 'silk') addStages(attacker, { SPE: -1 }, true);
        }
        return true;
    }

    // Mécaniques des attaques offensives, appliquées après les dégâts
    function afterDamage(attacker, move, results) {
        const mech = move.mech || {};
        const dealt = results.reduce((sum, r) => sum + (r.dmg || 0), 0);
        if (dealt > 0) {
            const drain = (mech.drain || 0) + (attacker.lifesteal || 0);
            if (drain > 0) {
                const gained = heal(attacker, dealt * drain, null);
                if (typeof MoveRework !== 'undefined') MoveRework.drainOverflow(attacker, move, dealt * drain, gained);
            }
            if (mech.recoil) damage(attacker, dealt * mech.recoil, 'Contrecoup');
        }
        // Riposte / Voile Miroir / Patience / Fulmifer : renvoient le double des dégâts reçus
        results.forEach(r => {
            if (!r.dmg || attacker.isKO) return;
            const f = r.target.flags || {};
            const phys = move.damage_class === 'physical';
            if (f.counterAll || (f.counterPhys && phys) || (f.counterSpec && !phys)) damage(attacker, r.dmg * 2, 'Riposte !');
        });
        if (mech.selfKo && !attacker.isKO) damage(attacker, attacker.hp, null);
        if (mech.retreat && !attacker.isKO) moveToBack(attacker);
        if (mech.selfStat) addStages(attacker, mech.selfStat, true);
        if (mech.recharge) setFlag(attacker, 'recharge', 1);
        if (mech.priority) attacker.actionPoints += 40;
        results.forEach(r => {
            if (!r.dmg || r.target.isKO) return;
            if (mech.trap) addStatus(r.target, 'STAT_TRAP', attacker);
            if (attacker.onHitStatus && isContact(move)) addStatus(r.target, attacker.onHitStatus.id, attacker, attacker.onHitStatus.chance);
        });
        // Lien du Destin / Rancune : déclenchés quand le porteur tombe
        results.forEach(r => {
            if (!r.target.isKO) return;
            if (hasFlag(r.target, 'destinyBond') && !attacker.isKO) damage(attacker, attacker.hp, 'Lien du Destin');
            if (hasFlag(r.target, 'grudge')) { attacker.boostGauge = 0; addStages(attacker, { ATK: -2, SPA: -2 }, true); }
        });
    }

    const weightOf = (unit) => (typeof PokedexDB !== 'undefined' && PokedexDB?.[unit._pokemonId]?.weight) || 30;

    // Puissance calculée en combat (poids, vitesse, PV, bonus de la cible…) ou null
    function dynamicPower(attacker, target, move) {
        const m = move.mech || {};
        const base = move.power || 60;
        if (m.weight === 'target') { const w = weightOf(target); return w < 10 ? 20 : w < 25 ? 40 : w < 50 ? 60 : w < 100 ? 80 : w < 200 ? 100 : 120; }
        if (m.weight === 'ratio') { const r = weightOf(attacker) / Math.max(1, weightOf(target)); return r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; }
        if (m.speed === 'gyro') return Math.min(150, Math.max(1, Math.floor(25 * (target.speed || 1) / Math.max(1, attacker.speed || 1)) + 1));
        if (m.speed === 'electro') { const r = (attacker.speed || 1) / Math.max(1, target.speed || 1); return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; }
        if (m.hpRatio === 'target') return Math.max(1, Math.round(base * target.hp / target.maxHp));
        if (m.randomPower) return Math.max(1, Math.round(base * (m.randomPower[0] + Math.random() * (m.randomPower[1] - m.randomPower[0]))));
        if (m.stagesBonus) return base + 20 * Object.values(target.statMods || {}).filter(v => v > 0).reduce((a, b) => a + b, 0);
        if (m.beatUp) return base * Math.max(1, alliesOf(attacker).length);
        return null;
    }

    // Dégâts qui ne suivent pas la formule (Frappe Atlas, Croc Fatal, K.O. en un coup…) ou null
    function fixedDamage(attacker, target, move) {
        const m = move.mech || {};
        if (m.ohko) return (attacker.level >= target.level && !target.isBoss) ? target.hp : 0;
        switch (m.fixed) {
            case 'level': return attacker.level;
            case 'levelRandom': return Math.max(1, Math.floor(attacker.level * (0.5 + Math.random())));
            case 'value': return m.value;
            case 'halfTarget': return Math.max(1, Math.floor(target.hp / (target.isBoss ? 4 : 2)));
            case 'threeQuarters': return Math.max(1, Math.floor(target.hp * (target.isBoss ? 0.33 : 0.75)));
            case 'endeavor': return Math.max(0, target.hp - attacker.hp);
            case 'userHp': return attacker.hp;
        }
        return null;
    }

    // Puissance modifiée par la mécanique (Façade, Châtiment…)
    function powerMultiplier(attacker, target, move) {
        const cond = move.mech?.doubleIf;
        if (!cond) return 1;
        if (cond === 'targetStatus' && target.activeEffects.some(e => RulesDB?.[e.id]?.category === 'Majeur')) return 2;
        if (cond === 'userStatus' && attacker.activeEffects.some(e => RulesDB?.[e.id]?.category === 'Majeur')) return 2;
        if (cond === 'targetHalfHp' && target.hp <= target.maxHp / 2) return 2;
        if (cond === 'userLowHp' && attacker.hp <= attacker.maxHp / 3) return 2;
        return 1;
    }

    // ------------------------------------------------------------------
    // DÉBUT DE TOUR
    // ------------------------------------------------------------------
    async function onTurnStart(unit) {
        let canAct = true;
        // Abri : dure jusqu'au prochain tour du lanceur
        unit.protect = null;

        // Durées du terrain (en actions)
        ['weather', 'terrain', 'room'].forEach(key => {
            if (field[key] && --field[key].left <= 0) {
                if (key === 'room' && field.room.type === 'magic') restoreItems();
                field[key] = null;
                showTerrainInfo();
            }
        });
        if (field.ionDeluge > 0) field.ionDeluge--;

        if (hasFlag(unit, 'recharge')) { spawnEffectText(unit, 'Doit se reposer', 'info'); canAct = false; }

        // Météo
        const w = field.weather && WEATHER[field.weather.type];
        if (w?.chip && !(unit.types || []).some(t => w.immune.includes(t))) damage(unit, unit.maxHp * w.chip / 100, w.label);
        // Champ Herbu
        if (field.terrain?.type === 'grassy' && !unit.isKO) heal(unit, unit.maxHp * TERRAIN.grassy.heal / 100, null);
        // Régénération (synergie Eau)
        if (unit.regen && !unit.isKO) heal(unit, unit.maxHp * unit.regen / 100, null);

        // Pièges posés dans son camp
        field.hazards[unit._side].forEach(h => {
            if (unit.isKO || (typeof HeldItems !== 'undefined' && HeldItems.ignoresHazards(unit))) return; // Grosses Bottes
            h.applied = h.applied || new Set();
            if (h.type === 'spikes') damage(unit, unit.maxHp * 0.03 * h.layers, 'Picots');
            if (h.applied.has(unit.id)) return;
            h.applied.add(unit.id);
            if (h.type === 'rock') {
                const eff = (unit.types || []).reduce((m, t) => m * getTypeModifier('rock', t), 1);
                damage(unit, unit.maxHp * 0.08 * eff, 'Piège de Roc');
            }
            if (h.type === 'toxic') addStatus(unit, 'STAT_PSN', null);
            if (h.type === 'web') addStages(unit, { SPE: -1 }, true);
        });

        // Ligotage, malédiction, requiem
        if (unit.activeEffects.some(e => e.id === 'STAT_TRAP')) damage(unit, unit.maxHp / 16, 'Piégé');
        if (hasFlag(unit, 'curse')) damage(unit, unit.maxHp / 4, 'Malédiction');
        if (hasFlag(unit, 'leechSeed') && !unit.isKO) {
            const drained = Math.max(1, Math.floor(unit.maxHp / 8));
            damage(unit, drained, 'Vampigraine');
            const seeder = unit.flags.leechSeed?.value;
            if (seeder && !seeder.isKO) heal(seeder, drained, null);
        }
        if (hasFlag(unit, 'perish') && unit.flags.perish.turns <= 1) damage(unit, unit.maxHp * 0.5, 'Requiem');
        if (hasFlag(unit, 'octolock')) addStages(unit, { DEF: -1, SPD: -1 }, true);

        // Boss : sous 50 % de PV, passe en phase 2 (se soigne un peu, gagne un bouclier et frappe plus fort)
        if (unit.isBoss && unit.bossPhase === 1 && unit.hp <= unit.maxHp / 2 && !unit.isKO) {
            unit.bossPhase = 2;
            unit.shield = (unit.shield || 0) + Math.round(unit.maxHp * 0.2);
            addStages(unit, { ATK: 1, SPA: 1, SPE: 1 }, true);
            spawnEffectText(unit, 'FUREUR !', 'debuff', -70);
            BattleAnimation.say(`${unit.name} entre en fureur !`);
        }

        // Décompte des effets temporaires
        Object.keys(unit.flags || {}).forEach(name => {
            if (--unit.flags[name].turns <= 0) delete unit.flags[name];
        });

        if (unit.isKO) canAct = false;
        await sleep(unit.isKO ? 200 : 0);
        return { canAct };
    }

    function restoreItems() {
        [...(grid.player || []), ...(grid.enemy || [])].forEach(u => {
            if (u && u._itemsOff) delete u._itemsOff;
        });
    }

    // ------------------------------------------------------------------
    // EXÉCUTION DES « OPS » D'UNE CAPACITÉ
    // ------------------------------------------------------------------
    function resolveOpTargets(spec, attacker, target, targets) {
        switch (spec) {
            case 'self': return [attacker];
            case 'allies': return alliesOf(attacker);
            case 'otherAllies': return alliesOf(attacker).filter(u => u !== attacker);
            case 'enemies': return foesOf(attacker);
            case 'all': return [...alliesOf(attacker), ...foesOf(attacker)];
            case 'mostWoundedAlly': {
                const list = alliesOf(attacker).filter(u => u !== attacker);
                return list.length ? [list.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))] : [];
            }
            case 'targets': return targets && targets.length ? targets : (target ? [target] : []);
            case 'bestAlly': {
                const list = alliesOf(attacker).filter(u => u !== attacker);
                return list.length ? [list.reduce((a, b) => (Math.max(a.attack, a.spatk) >= Math.max(b.attack, b.spatk) ? a : b))] : [];
            }
            default: return target ? [target] : [];
        }
    }

    const STAT_KEYS = { atk: 'attack', def: 'defense', spa: 'spatk', spd: 'spdef', spe: 'speed' };
    let callDepth = 0;

    async function executeOps(attacker, target, move, targets) {
        const ops = move.ops || [];
        for (const op of ops) {
            if (attacker.isKO && !['selfKo'].includes(op.op)) break;
            const list = resolveOpTargets(op.target, attacker, target, targets);
            switch (op.op) {
                case 'stat': list.forEach(u => addStages(u, op.stats, true)); break;
                case 'heal': list.forEach(u => heal(u, u.maxHp * op.pct / 100, attacker)); break;
                case 'hpCost': damage(attacker, attacker.maxHp * op.pct / 100, null); break;
                case 'shield': list.forEach(u => {
                    let value = (op.of === 'user' ? attacker.maxHp : u.maxHp) * op.pct / 100;
                    if (roleActive(attacker, 'support')) value *= 1.5;
                    u.shield = (u.shield || 0) + Math.round(value);
                    spawnEffectText(u, 'Bouclier', 'buff');
                }); break;
                case 'status': list.forEach(u => addStatus(u, op.id, attacker, op.chance ?? 100)); break;
                case 'cleanse': list.forEach(u => { u.activeEffects = u.activeEffects.filter(e => !['Majeur', 'Mineur'].includes(RulesDB?.[e.id]?.category)); updateStatusIcons(u); spawnEffectText(u, 'Soigné', 'buff'); }); break;
                case 'weather': field.weather = { type: op.type, left: roundsToActions((op.rounds || 5) + (typeof HeldItems !== 'undefined' ? HeldItems.weatherBonus(attacker, op.type) : 0)) }; BattleAnimation.say(`${WEATHER[op.type].label} !`); if (typeof HeldItems !== 'undefined') HeldItems.onWeatherChange(); showTerrainInfo(); break;
                case 'terrain': field.terrain = { type: op.type, left: roundsToActions((op.rounds || 5) + (typeof HeldItems !== 'undefined' ? HeldItems.terrainBonus(attacker) : 0)) }; BattleAnimation.say(`${TERRAIN[op.type].label} !`); showTerrainInfo(); break;
                case 'room': {
                    if (field.room?.type === op.type) { if (op.type === 'magic') restoreItems(); field.room = null; }
                    else {
                        if (op.type === 'magic') [...(grid.player || []), ...(grid.enemy || [])].forEach(u => { if (u) u._itemsOff = true; });
                        field.room = { type: op.type, left: roundsToActions(op.rounds || 5) };
                        BattleAnimation.say(`${ROOM[op.type].label} !`);
                    }
                    showTerrainInfo(); break;
                }
                case 'hazard': {
                    const side = attacker._side === 'player' ? 'enemy' : 'player';
                    const existing = field.hazards[side].find(h => h.type === op.type);
                    if (existing) existing.layers = Math.min(3, existing.layers + 1);
                    else field.hazards[side].push({ type: op.type, layers: 1 });
                    BattleAnimation.say(`${HAZARD_LABEL[op.type]} posés chez l'adversaire !`); showTerrainInfo(); break;
                }
                case 'clearHazards': {
                    const sides = op.side === 'both' ? ['player', 'enemy'] : [attacker._side];
                    sides.forEach(s => { field.hazards[s] = []; });
                    if (op.alsoShields) foesOf(attacker).forEach(u => { u.shield = 0; u.protect = null; });
                    showTerrainInfo(); break;
                }
                case 'swapHazards': { const tmp = field.hazards.player; field.hazards.player = field.hazards.enemy; field.hazards.enemy = tmp; showTerrainInfo(); break; }
                case 'protect': attacker.protect = op.variant || 'basic'; spawnEffectText(attacker, 'Abri', 'buff'); break;
                case 'flag': list.forEach(u => { setFlag(u, op.id, op.turns || 3, op.fromAttacker ? attacker : (op.value ?? true)); if (op.label) spawnEffectText(u, op.label, op.debuff ? 'debuff' : 'status'); }); break;
                case 'imprison': foesOf(attacker).forEach(u => setFlag(u, 'imprisoned', op.turns || 3, (attacker.moves || []).map(m => m.id))); spawnEffectText(attacker, 'Possessif', 'status'); break;
                case 'swapStages': list.forEach(u => (op.stats || ['ATK', 'DEF', 'SPA', 'SPD', 'SPE', 'PRE', 'EVA']).forEach(s => {
                    const a = attacker.statMods[s] || 0; attacker.statMods[s] = u.statMods[s] || 0; u.statMods[s] = a;
                })); spawnEffectText(attacker, 'Échange', 'buff'); break;
                case 'copyStages': list.forEach(u => { Object.assign(attacker.statMods, u.statMods); }); spawnEffectText(attacker, 'Copie', 'buff'); break;
                case 'invertStages': list.forEach(u => Object.keys(u.statMods).forEach(s => { u.statMods[s] = -(u.statMods[s] || 0); spawnEffectText(u, 'Inversion', 'status'); })); break;
                case 'clearPositiveStages': list.forEach(u => Object.keys(u.statMods).forEach(s => { if (u.statMods[s] > 0) u.statMods[s] = 0; })); list.forEach(u => spawnEffectText(u, 'Bonus annulés', 'debuff')); break;
                case 'stealPositiveStages': list.forEach(u => Object.keys(u.statMods).forEach(s => { if (u.statMods[s] > 0) { attacker.statMods[s] = clamp((attacker.statMods[s] || 0) + u.statMods[s], -6, 6); u.statMods[s] = 0; } })); spawnEffectText(attacker, 'Vole les bonus', 'buff'); break;
                case 'splitStats': list.forEach(u => (op.stats || []).forEach(s => {
                    const k = STAT_KEYS[s]; const avg = Math.round(((attacker[k] || 0) + (u[k] || 0)) / 2); attacker[k] = avg; u[k] = avg;
                })); spawnEffectText(attacker, 'Partage', 'buff'); break;
                case 'splitHp': list.forEach(u => {
                    const avg = Math.round((attacker.hp + u.hp) / 2);
                    attacker.hp = Math.min(attacker.maxHp, avg); u.hp = Math.min(u.maxHp, avg);
                    [attacker, u].forEach(x => animateHpGrid(x._side, x._index, x.maxHp, x.hp, x.maxHp));
                }); spawnEffectText(attacker, 'Balance', 'buff'); break;
                case 'swapOwnStats': { const a = STAT_KEYS[op.a], b = STAT_KEYS[op.b]; const tmp = attacker[a]; attacker[a] = attacker[b]; attacker[b] = tmp; spawnEffectText(attacker, 'Échange', 'buff'); break; }
                case 'swapSpeed': list.forEach(u => { const tmp = attacker.speed; attacker.speed = u.speed; u.speed = tmp; }); spawnEffectText(attacker, 'Vitesse échangée', 'buff'); break;
                case 'setType': list.forEach(u => {
                    let types = op.types;
                    if (op.mode === 'firstMove') types = [moveTypeFor(attacker, (attacker.moves || []).find(m => !m?._passive) || move)];
                    if (op.mode === 'terrain') types = [({ grassy: 'grass', electric: 'electric', misty: 'fairy', psychic: 'psychic' })[field.terrain?.type] || ({ rain: 'water', sun: 'fire', sand: 'rock', hail: 'ice', snow: 'ice' })[field.weather?.type] || 'normal'];
                    if (op.mode === 'copyTarget') { types = [...(target?.types || [])]; u = attacker; }
                    if (op.mode === 'resistTarget') {
                        const threat = (target?.types || ['normal'])[0];
                        types = [Object.keys(TYPE_FR).filter(t => t !== 'shadow').find(t => getTypeModifier(threat, t) < 1) || 'steel'];
                        u = attacker;
                    }
                    u.types = types; u.type = types[0];
                    spawnEffectText(u, `Type ${types.map(t => formatTypeLabel(t)).join('/')}`, 'status');
                }); break;
                case 'addType': list.forEach(u => { if (!u.types.includes(op.type)) u.types = [...u.types, op.type]; spawnEffectText(u, `+ type ${formatTypeLabel(op.type)}`, 'status'); }); break;
                case 'selfKo': damage(attacker, attacker.hp, null); break;
                case 'healMostWounded': {
                    const ally = resolveOpTargets('mostWoundedAlly', attacker)[0];
                    if (ally) { heal(ally, ally.maxHp * (op.pct || 100) / 100, attacker); if (op.cleanse) ally.activeEffects = []; updateStatusIcons(ally); }
                    break;
                }
                case 'moveToBack': moveToBack(attacker); spawnEffectText(attacker, 'Repli', 'info'); break;
                case 'swapAlly': {
                    const ally = op.with === 'back'
                        ? alliesOf(attacker).filter(u => u !== attacker).sort((a, b) => depthOf(b) - depthOf(a))[0]
                        : alliesOf(attacker).find(u => u !== attacker);
                    if (ally) {
                        if (op.transferStages) { Object.assign(ally.statMods, attacker.statMods); Object.keys(attacker.statMods).forEach(s => { attacker.statMods[s] = 0; }); }
                        swapPlaces(attacker, ally);
                        spawnEffectText(attacker, 'Relais', 'info');
                    }
                    break;
                }
                case 'swapItems': list.forEach(u => {
                    if (typeof HeldItems !== 'undefined' && (HeldItems.protectsItems(u) || HeldItems.protectsItems(attacker))) return;
                    const a = (attacker.heldItems || []), b = (u.heldItems || []);
                    const ia = a.findIndex(Boolean), ib = b.findIndex(Boolean);
                    const ta = ia >= 0 ? a[ia] : null, tb = ib >= 0 ? b[ib] : null;
                    if (!ta && !tb) return;
                    if (ia >= 0) a.splice(ia, 1); if (ib >= 0) b.splice(ib, 1);
                    if (tb) a.push(tb); if (ta) b.push(ta);
                    attacker.heldItems = a; u.heldItems = b;
                    attacker.itemMults = attacker.itemMults || {}; u.itemMults = u.itemMults || {};
                    if (tb) attacker.itemMults[tb] = u.itemMults[tb] || 1;
                    if (ta) u.itemMults[ta] = attacker.itemMults[ta] || 1;
                    spawnEffectText(u, 'Objets échangés', 'status');
                }); break;
                case 'giveItem': {
                    const ally = resolveOpTargets('mostWoundedAlly', attacker)[0];
                    const item = (attacker.heldItems || [])[0];
                    if (ally && item && (ally.heldItems || []).length < 3) {
                        attacker.heldItems = attacker.heldItems.slice(1); ally.heldItems = [...(ally.heldItems || []), item];
                        (ally.itemMults = ally.itemMults || {})[item] = attacker.itemMults?.[item] || 1;
                        spawnEffectText(ally, 'Objet reçu', 'buff');
                    }
                    break;
                }
                case 'gainZ': list.forEach(u => { u.boostGauge = Math.min(100, (u.boostGauge || 0) + op.amount * 2); spawnEffectText(u, 'Jauge Z +', 'buff'); }); updateZMoveIndicators(); break;
                case 'gainAP': list.forEach(u => { u.actionPoints += op.amount; updateActionPointsUI(u); spawnEffectText(u, 'Accélère', 'buff'); }); break;
                case 'money': field.moneyMult = Math.max(field.moneyMult, op.mult || 2); spawnEffectText(attacker, 'Argent ×2 !', 'buff'); break;
                case 'ionDeluge': field.ionDeluge = roundsToActions(1); BattleAnimation.say('Les capacités Normal deviennent Électrik !'); break;
                case 'transform': if (target) {
                    ['attack', 'defense', 'spatk', 'spdef', 'speed'].forEach(k => { attacker[k] = target[k]; });
                    attacker.types = [...target.types]; attacker.moves = (target.moves || []).map(m => ({ ...m }));
                    Object.assign(attacker.statMods, target.statMods);
                    spawnEffectText(attacker, 'Morphing', 'buff');
                } break;
                case 'role': {
                    if (op.mode === 'copy' && target) attacker.role = target.role;
                    if (op.mode === 'swap' && target) { const r = attacker.role; attacker.role = target.role; target.role = r; }
                    if (op.mode === 'spread' && target) alliesOf(attacker).forEach(u => { u.role = target.role; });
                    if (op.mode === 'set' && target) target.role = op.role;
                    spawnEffectText(attacker, `Rôle : ${ROLES[attacker.role]?.label}`, 'status');
                    if (typeof FormationUI !== 'undefined') FormationUI.refresh();
                    break;
                }
                case 'callMove': {
                    if (callDepth > 1) break;
                    const called = pickCalledMove(attacker, target, op.mode);
                    if (!called) { spawnEffectText(attacker, 'Échec', 'info'); break; }
                    const finalMove = { ...called, _isCalled: true, power: called.power ? Math.round(called.power * (op.powerMult || 1)) : called.power };
                    const finalTarget = pickTargetFor(attacker, finalMove, target);
                    if (!finalTarget) break;
                    BattleAnimation.say(`${attacker.name} utilise ${finalMove.name} !`);
                    callDepth++;
                    try { await attack(attacker, finalTarget, finalMove); } finally { callDepth--; }
                    break;
                }
                case 'ifStatus': {
                    const ok = list.some(u => u.activeEffects.some(e => op.status === 'any' ? RulesDB?.[e.id]?.category === 'Majeur' : e.id === op.status));
                    await executeOps(attacker, target, { ...move, ops: ok ? op.then : (op.else || []) }, targets);
                    break;
                }
                case 'ifType': {
                    const ok = (op.who === 'self' ? attacker : target)?.types?.includes(op.type);
                    await executeOps(attacker, target, { ...move, ops: ok ? op.then : (op.else || []) }, targets);
                    break;
                }
                case 'ifField': {
                    const ok = op.weather ? field.weather?.type === op.weather : !!field.terrain;
                    await executeOps(attacker, target, { ...move, ops: ok ? op.then : (op.else || []) }, targets);
                    break;
                }
                case 'transferStatus': {
                    const major = attacker.activeEffects.find(e => RulesDB?.[e.id]?.category === 'Majeur');
                    if (major) {
                        attacker.activeEffects = attacker.activeEffects.filter(e => e !== major);
                        list.forEach(u => addStatus(u, major.id, attacker));
                        updateStatusIcons(attacker);
                    } else spawnEffectText(attacker, 'Échec', 'info');
                    break;
                }
                case 'resetStages': list.forEach(u => { Object.keys(u.statMods).forEach(k => { u.statMods[k] = 0; }); }); spawnEffectText(attacker, 'Stats remises à zéro', 'status'); break;
                case 'halfHpAll': [...alliesOf(attacker), ...foesOf(attacker)].forEach(u => damage(u, Math.floor(u.hp / 2), null)); break;
                case 'revive': {
                    const fallen = (grid[attacker._side] || []).filter(u => u && u.isKO && !u.activeEffects.some(e => e.id === 'STAT_NO_REVIVE'));
                    const ally = fallen[fallen.length - 1];
                    if (!ally) { spawnEffectText(attacker, 'Personne à ranimer', 'info'); break; }
                    ally.isKO = false;
                    ally.hp = Math.max(1, Math.floor(ally.maxHp * (op.pct || 50) / 100));
                    ally.activeEffects = [];
                    const el = getSlotEl(ally._side, ally._index)?.querySelector('.unit');
                    if (el) {
                        el.classList.remove('is-ko');
                        el.querySelectorAll('.sprite, .hp-box, .ap-bar').forEach(x => { x.style.display = ''; });
                    }
                    animateHpGrid(ally._side, ally._index, ally.maxHp, ally.hp, ally.maxHp);
                    spawnEffectText(ally, 'Ranimé !', 'buff');
                    break;
                }
                case 'healByTargetAtk': if (target) { heal(attacker, Math.max(1, target.attack * getStatMultiplier(target.statMods.ATK || 0)), attacker); addStages(target, { ATK: -1 }, true); } break;
            }
        }
    }

    function pickCalledMove(attacker, target, mode) {
        const dbMoves = Object.entries(MovesDB || {}).filter(([id, m]) => !m.ops?.some(o => o.op === 'callMove'));
        const toMove = ([id, info]) => ({ ...info, id, name: info.name_fr || id, type: (info.type || 'normal').toLowerCase() });
        switch (mode) {
            case 'random': {
                const damaging = dbMoves.filter(([, m]) => (m.power || 0) > 0);
                return toMove(damaging[Math.floor(Math.random() * damaging.length)]);
            }
            case 'last': return lastMove && !lastMove.ops?.some(o => o.op === 'callMove') ? lastMove : null;
            case 'targetLast': return target ? lastMoveBy.get(target) || null : null;
            case 'ally': {
                const pool = alliesOf(attacker).filter(u => u !== attacker).flatMap(u => u.moves || []).filter(m => (m.power || 0) > 0);
                return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
            }
            case 'own': {
                const pool = (attacker.moves || []).filter(m => (m.power || 0) > 0);
                return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
            }
            case 'targetBest': {
                const pool = (target?.moves || []).filter(m => (m.power || 0) > 0);
                return pool.length ? pool.reduce((a, b) => ((a.power || 0) >= (b.power || 0) ? a : b)) : null;
            }
            case 'byTerrain': {
                const byTerrain = { grassy: 'energy-ball', electric: 'thunderbolt', psychic: 'psychic', misty: 'moonblast' };
                const id = byTerrain[field.terrain?.type] || 'tri-attack';
                return MovesDB?.[id] ? toMove([id, MovesDB[id]]) : null;
            }
        }
        return null;
    }

    // Cible cohérente pour une capacité appelée par une autre
    function pickTargetFor(attacker, move, preferred) {
        if (move.zone === 'self' || move.zone === 'ally') return attacker;
        const foes = foesOf(attacker).filter(u => canTarget(attacker, move, u));
        if (preferred && preferred._side !== attacker._side && foes.includes(preferred)) return preferred;
        return foes[0] || null;
    }

    // ------------------------------------------------------------------
    // ÉVALUATION POUR L'IA
    // ------------------------------------------------------------------
    function scoreOps(unit, move, target) {
        let score = 0;
        const hpRatio = unit.hp / unit.maxHp;
        for (const op of move.ops || []) {
            switch (op.op) {
                case 'heal': score += Math.max(0, (1 - (op.target === 'self' ? hpRatio : (target ? target.hp / target.maxHp : 1))) - 0.25); break;
                case 'healMostWounded': { const a = resolveOpTargets('mostWoundedAlly', unit)[0]; if (a) score += Math.max(0, 1 - a.hp / a.maxHp - 0.3); break; }
                case 'shield': score += 0.15; break;
                case 'protect': score += hpRatio < 0.5 ? 0.25 : 0.05; break;
                case 'weather': score += field.weather?.type === op.type ? 0 : 0.2; break;
                case 'terrain': score += field.terrain?.type === op.type ? 0 : 0.2; break;
                case 'room': score += field.room ? 0 : 0.12; break;
                case 'hazard': { const side = unit._side === 'player' ? 'enemy' : 'player'; const h = field.hazards[side].find(x => x.type === op.type); score += !h ? 0.25 : (op.type === 'spikes' && h.layers < 3 ? 0.1 : 0); break; }
                case 'stat': { const pos = Object.values(op.stats).some(v => v > 0); score += pos ? 0.12 : 0.1; break; }
                case 'status': score += target && !target.activeEffects.some(e => e.id === op.id) ? 0.2 : 0; break;
                case 'callMove': score += 0.3; break;
                case 'flag': score += 0.12; break;
                case 'selfKo': score += hpRatio < 0.25 ? 0.4 : -1; break;
                case 'hpCost': score -= hpRatio < 0.5 ? 0.5 : 0.05; break;
                case 'gainZ': case 'gainAP': score += 0.1; break;
                default: score += 0.08;
            }
        }
        return score;
    }

    return {
        ROLES, ROW_LABEL, SYNERGY_PERKS,
        rowOf, rowOfIndex, depthOf, depthOfIndex, laneOf, indexAt, lineIndexes, frontLineUnits, isContact, canTarget, computeRole,
        slotNumber, slotOf, contactTarget, rangedLanes, retarget, isWellPlaced, roleActive,
        synergyCounts, synergyTier, describeSynergies, describeField,
        setupBattle, resetField, moveTypeFor, damageMultiplier, defenseStat, itemsDisabled, speedInverted,
        beforeAttack, recordMove, checkProtect, afterDamage, powerMultiplier, dynamicPower, fixedDamage, onTurnStart, executeOps, scoreOps,
        addStatus, heal, damage, addStages,
        get field() { return field; },
    };
})();
