/**
 * move-rework.js - Refonte des capacités en combat (données : `rw` dans data/*_moves.json,
 * générées par tools/propose-moves.mjs puis tools/apply-rework.mjs).
 *
 *  - Formes de zone pondérées sur la grille 3×3 (éclaboussure, perçante, onde, ricochet, salve…)
 *  - Effets : jauge d'action, boucliers, régénération, piège, exécution, placement (projection,
 *    attraction, relais, téléport, blocage), Plongée, tir de précision, « en face »
 *  - Passifs : occupent un emplacement, ne se lancent jamais, se déclenchent seuls
 *  - Versions Z : forme et puissance propres, effets garantis, bonus de type
 *
 * Orientation des formes (data/move_shapes.json) : grille ennemie vue à l'écran, l'arrière en haut
 * et la ligne avant en bas ; formes alliées (side: 'ally') : ta ligne avant en haut.
 */
const MoveRework = (() => {
    let SHAPES = {};
    const extra = { fieldFlags: {} }; // drapeaux de terrain propres à la refonte (Lance-Boue, Tourniquet…)

    async function load() {
        if (Object.keys(SHAPES).length) return;
        try { SHAPES = await loadJSON('data/move_shapes.json'); } catch (e) { console.warn('Formes de zone indisponibles', e); }
    }

    const R = () => BattleRules;
    const foeSide = side => (side === 'player' ? 'enemy' : 'player');
    const alive = side => (grid[side] || []).filter(u => u && !u.isKO);
    const isRw = move => !!(move && move.rw);
    const isPassive = move => move?.rw?.kind === 'passive';
    const say = (unit, text, kind = 'info') => { if (typeof spawnEffectText === 'function') spawnEffectText(unit, text, kind); };

    // ------------------------------------------------------------------
    // PRÉPARATION DES CAPACITÉS
    // ------------------------------------------------------------------
    // Applique la spec à une capacité chargée (copie) : puissance, forme, mécaniques conservées ou retirées
    function normalize(move) {
        if (!isRw(move) || move._rwApplied) return move;
        const rw = move.rw;
        move._rwApplied = true;
        if (rw.kind === 'attack') {
            move.power = rw.power;
            move.mech = { ...(move.mech || {}) };
            (rw.drop || []).forEach(k => delete move.mech[k]);
            if (rw.hits) move.mech.multihit = rw.hits;
            if (rw.execute) delete move.mech.ohko;
            if (rw.crit) move.crit_rate_stage = rw.crit;
            move.effect = ''; // les effets secondaires passent par rw.fx
            if (rw.snipe) move.accuracy = null; // ne rate jamais
        } else if (rw.kind === 'tactic') {
            if (rw.keepOriginal) move.ops = [...(move.ops || []), ...(rw.extraOps || [])];
            else { move.ops = rw.ops || []; move.effect = ''; }
        } else if (rw.kind === 'passive') {
            move._passive = true;
        }
        return move;
    }

    // Capacités qu'un Pokémon peut lancer (les passifs ne se lancent jamais)
    function actionMoves(unit) {
        return (unit.moves || []).filter(m => m && !isPassive(m));
    }
    const hasOnlyPassives = unit => (unit.moves || []).length > 0 && actionMoves(unit).length === 0;

    // ------------------------------------------------------------------
    // FORMES ET CIBLAGE
    // ------------------------------------------------------------------
    const shapeOf = (move) => move?._isBoosted && move.rw?.z?.shape ? move.rw.z.shape : move?.rw?.shape;

    // Contact : seulement la ligne de front (pas pour les tirs, la Plongée et les grandes zones)
    const RANGED_SHAPES = ['onde', 'tempete', 'front', 'salve', 'hasard', 'explosion', 'onde_forte', 'tempete_forte', 'salve_z', 'explosion_z'];
    function isContact(move) {
        if (!isRw(move)) return null; // laisse la règle d'origine décider
        if (move.rw.anyCell || move.rw.dive) return false;
        return move.damage_class === 'physical' && (move.power || 0) > 0 && !RANGED_SHAPES.includes(shapeOf(move));
    }

    // Cases touchées : [{ unit, mult }] (une même unité peut apparaître plusieurs fois : salve, doublé seul…)
    function hitList(move, attacker, primary) {
        const side = primary._side;
        const id = shapeOf(move) || 'cible';
        const s = SHAPES[id];
        const targetable = u => u && !u.isKO && !u.flags?.diving;
        const at = (depth, lane) => (depth >= 0 && depth <= 2 && lane >= 0 && lane <= 2) ? grid[side][R().indexAt(side, depth, lane)] : null;
        const foes = alive(side).filter(targetable);
        if (!s) return targetable(primary) ? [{ unit: primary, mult: 1 }] : [];

        if (id === 'hasard') { const u = foes[Math.floor(Math.random() * foes.length)]; return u ? [{ unit: u, mult: 1 }] : []; }
        if (s.hits) { // salve
            const out = [];
            const per = id === 'salve_z' ? 0.5 : 0.45;
            for (let i = 0; i < s.hits && foes.length; i++) out.push({ unit: foes[Math.floor(Math.random() * foes.length)], mult: per });
            return out;
        }
        const d0 = R().depthOf(primary), l0 = R().laneOf(primary._index);
        if (id === 'duo' || id === 'trio') {
            const out = [{ unit: primary, mult: 1 }];
            const sides = [at(d0, l0 + 1), at(d0, l0 - 1)].filter(targetable);
            if (id === 'duo') out.push({ unit: sides[0] || primary, mult: 1 });
            else sides.forEach(u => out.push({ unit: u, mult: 1 }));
            return out;
        }
        if (id.startsWith('ricochet')) {
            const values = (s.order || []).map(([r, c]) => s.grid[r][c] / 100);
            const out = [{ unit: primary, mult: values[0] || 1 }];
            const hit = new Set([primary]);
            let from = primary;
            for (let i = 1; i < values.length; i++) {
                const next = foes.filter(u => !hit.has(u)).sort((a, b) => dist(a, from) - dist(b, from))[0];
                if (!next) break;
                out.push({ unit: next, mult: values[i] });
                hit.add(next); from = next;
            }
            return out;
        }
        // Grilles : avec point d'impact (100) relatif à la cible, sinon par ligne de profondeur
        const cells = [];
        let r0 = -1, c0 = -1;
        s.grid.forEach((row, r) => row.forEach((v, c) => { if (v === 100 && r0 < 0) { r0 = r; c0 = c; } }));
        const absolute = r0 < 0 || ['onde', 'tempete', 'front', 'onde_forte', 'tempete_forte'].includes(id);
        s.grid.forEach((row, r) => row.forEach((v, c) => {
            if (!v) return;
            const u = absolute ? at(2 - r, c) : at(d0 + (r0 - r), l0 + (c - c0));
            if (targetable(u)) cells.push({ unit: u, mult: v / 100 });
        }));
        // L'impact est toujours sur la cible choisie (même si la forme est au bord)
        if (!absolute && !cells.some(h => h.unit === primary) && targetable(primary)) cells.unshift({ unit: primary, mult: 1 });
        return cells;
    }
    const dist = (a, b) => Math.abs(R().depthOf(a) - R().depthOf(b)) + Math.abs(R().laneOf(a._index) - R().laneOf(b._index));

    // Aperçu pour l'IA : mêmes cases, sans hasard (salve et hasard comptés en moyenne)
    function previewHits(move, attacker, primary) {
        const id = shapeOf(move);
        if (id === 'hasard' || SHAPES[id]?.hits) {
            const foes = alive(primary._side);
            const total = id === 'hasard' ? 1 : SHAPES[id].hits * (id === 'salve_z' ? 0.5 : 0.45);
            return foes.map(u => ({ unit: u, mult: total / Math.max(1, foes.length) }));
        }
        return hitList(move, attacker, primary);
    }

    // Motif d'affichage d'une forme (vignette) : 9 valeurs en % dans l'ordre de l'écran
    function displayPattern(move) {
        const s = SHAPES[shapeOf(move)];
        if (!s || !s.grid) return null;
        return { values: s.grid.flat(), ally: s.side === 'ally', name: s.name, hits: s.hits || 0 };
    }

    // ------------------------------------------------------------------
    // MULTIPLICATEURS DE DÉGÂTS
    // ------------------------------------------------------------------
    function damageMult(attacker, defender, move, moveType) {
        let m = 1;
        // En face : même couloir
        if (move.rw?.face && R().laneOf(attacker._index) === R().laneOf(defender._index)) m *= move.rw.face;
        // Attaque à distance depuis la ligne arrière (le contact depuis l'avant est déjà dans les règles de ligne)
        if (move.damage_class === 'special' && R().rowOf(attacker) === 'back') m *= 1.1;
        // Coup de Main (aura) : un voisin de ligne du lanceur l'a en passif
        if (neighborsOf(attacker).some(u => passivesOf(u).some(p => p.rw.aura?.damage))) m *= 1.2;
        if (attacker.flags?.helped) m *= 1.3;
        // Murs
        if (defender.flags?.reflect && move.damage_class === 'physical') m *= 0.7;
        if (defender.flags?.lightScreen && move.damage_class === 'special') m *= 0.7;
        if (defender.flags?.vulnerable) m *= 1.2;
        if (extra.fieldFlags.mudSport > 0 && moveType === 'electric') m *= 0.5;
        if (extra.fieldFlags.waterSport > 0 && moveType === 'fire') m *= 0.5;
        return m;
    }

    // ------------------------------------------------------------------
    // CIBLES DES OPS
    // ------------------------------------------------------------------
    const neighborsOf = unit => {
        if (!unit) return [];
        const d = R().depthOf(unit), l = R().laneOf(unit._index);
        return [l - 1, l + 1].filter(x => x >= 0 && x <= 2).map(x => grid[unit._side][R().indexAt(unit._side, d, x)]).filter(u => u && !u.isKO);
    };
    function resolve(spec, attacker, ctx) {
        const allies = alive(attacker._side), foes = alive(foeSide(attacker._side));
        const t = ctx.target;
        switch (spec) {
            case 'self': return [attacker];
            case 'allies': return allies;
            case 'otherAllies': return allies.filter(u => u !== attacker);
            case 'enemies': return foes;
            case 'all': return [...allies, ...foes];
            case 'targets': return (ctx.targets && ctx.targets.length ? ctx.targets : (t ? [t] : [])).filter(u => u && !u.isKO);
            case 'target': return t && !t.isKO ? [t] : [];
            case 'attacker': return ctx.source && !ctx.source.isKO ? [ctx.source] : [];
            case 'neighbors': return neighborsOf(attacker);
            case 'column': return allies.filter(u => R().laneOf(u._index) === R().laneOf(attacker._index));
            case 'targetLine': return t ? alive(t._side).filter(u => R().depthOf(u) === R().depthOf(t)) : [];
            case 'frontEnemies': return R().frontLineUnits(foeSide(attacker._side));
            case 'mostWoundedAlly': { const l = allies.filter(u => u !== attacker); return l.length ? [l.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))] : []; }
            case 'bestAlly': { const l = allies.filter(u => u !== attacker); return l.length ? [l.reduce((a, b) => (Math.max(a.attack, a.spatk) >= Math.max(b.attack, b.spatk) ? a : b))] : []; }
            case 'behindAlly': { const d = R().depthOf(attacker); const u = d < 2 ? grid[attacker._side][R().indexAt(attacker._side, d + 1, R().laneOf(attacker._index))] : null; return u && !u.isKO ? [u] : []; }
            case 'alliesOfType': { const types = [].concat(ctx.op?.type || []); return allies.filter(u => (u.types || []).some(x => types.includes(x))); }
            case 'slowestAlly': return allies.length ? [allies.reduce((a, b) => ((a.speed || 0) <= (b.speed || 0) ? a : b))] : [];
            case 'fastestEnemy': return foes.length ? [foes.reduce((a, b) => ((a.speed || 0) >= (b.speed || 0) ? a : b))] : [];
            case 'healthiestEnemy': return foes.length ? [foes.reduce((a, b) => (a.hp >= b.hp ? a : b))] : [];
            case 'bestEnemy': return foes.length ? [foes.reduce((a, b) => (Object.values(a.statMods || {}).reduce((x, y) => x + Math.max(0, y), 0) >= Object.values(b.statMods || {}).reduce((x, y) => x + Math.max(0, y), 0) ? a : b))] : [];
            case 'nearestEnemy': return foes.length ? [foes.sort((a, b) => R().depthOf(a) - R().depthOf(b))[0]] : [];
            case 'swapped': return ctx.swapped ? [ctx.swapped] : [];
            default: return t && !t.isKO ? [t] : [];
        }
    }

    // ------------------------------------------------------------------
    // DÉPLACEMENTS SUR LA GRILLE
    // ------------------------------------------------------------------
    const canMove = u => u && !u.isKO && !u.flags?.locked && !u.flags?.rooted && !(extra.fieldFlags.noMove > 0) && !u._trap && !(typeof HeldItems !== 'undefined' && HeldItems.isImmovable(u));
    function moveTo(unit, idx) {
        const side = unit._side;
        if (grid[side][idx]) return false;
        const el = getSlotEl(side, unit._index)?.querySelector('.unit');
        grid[side][unit._index] = null; grid[side][idx] = unit; unit._index = idx;
        const to = getSlotEl(side, idx);
        if (el && to) to.appendChild(el);
        if (typeof HeldItems !== 'undefined') HeldItems.onMoved(unit);
        return true;
    }
    function swap(a, b) {
        if (!a || !b || a === b || a._side !== b._side) return false;
        const side = a._side, ia = a._index, ib = b._index;
        const elA = getSlotEl(side, ia)?.querySelector('.unit'), elB = getSlotEl(side, ib)?.querySelector('.unit');
        grid[side][ia] = b; grid[side][ib] = a; a._index = ib; b._index = ia;
        if (elA) getSlotEl(side, ib)?.appendChild(elA);
        if (elB) getSlotEl(side, ia)?.appendChild(elB);
        if (typeof HeldItems !== 'undefined') { HeldItems.onMoved(a); HeldItems.onMoved(b); }
        return true;
    }
    function collide(a, b, pct) {
        say(a, 'Choc !', 'debuff');
        R().damage(a, a.maxHp * pct / 100, null);
        if (b) R().damage(b, b.maxHp * pct / 100, null);
    }
    // Recule de `steps` cases dans sa colonne ; choc si une case occupée l'arrête
    function pushBack(unit, steps, collision) {
        if (!canMove(unit)) { say(unit, 'Ne bouge pas', 'info'); return; }
        const side = unit._side, lane = R().laneOf(unit._index);
        for (let i = 0; i < steps; i++) {
            const d = R().depthOf(unit);
            if (d >= 2) break;
            const idx = R().indexAt(side, d + 1, lane);
            const occupant = grid[side][idx];
            if (occupant && !occupant.isKO) { collide(unit, occupant, collision); break; }
            if (occupant && occupant.isKO) { swap(unit, occupant); continue; }
            moveTo(unit, idx);
        }
        say(unit, 'Repoussé', 'debuff');
    }
    // Avance d'une ligne (échange avec l'occupant s'il y en a un)
    function pullForward(unit, toFront) {
        if (!canMove(unit)) { say(unit, 'Ne bouge pas', 'info'); return; }
        const side = unit._side, lane = R().laneOf(unit._index);
        do {
            const d = R().depthOf(unit);
            if (d <= 0) break;
            const idx = R().indexAt(side, d - 1, lane);
            const occupant = grid[side][idx];
            if (!occupant) moveTo(unit, idx);
            else if (occupant.isKO || canMove(occupant)) swap(unit, occupant);
            else break;
        } while (toFront);
        say(unit, 'Attiré', 'debuff');
    }

    // ------------------------------------------------------------------
    // OPS
    // ------------------------------------------------------------------
    // Exécute des ops : nouvelles ops ici, les autres via BattleRules.executeOps (cibles déjà résolues)
    async function runOps(attacker, ops, ctx = {}) {
        for (const raw of ops || []) {
            if (!raw || attacker.isKO && raw.op !== 'selfKo') continue;
            const op = raw;
            if (op.chance != null && op.chance < 100 && !ctx.guaranteed) {
                // chance tirée par cible pour les effets sur les cibles touchées
                if (op.target === 'targets' || op.target === 'enemies') {
                    const list = resolve(op.target, attacker, { ...ctx, op }).filter(() => Math.random() * 100 < op.chance);
                    if (!list.length) continue;
                    await runOps(attacker, [{ ...op, chance: null, target: '_list' }], { ...ctx, list });
                    continue;
                }
                if (Math.random() * 100 >= op.chance) continue;
            }
            const list = op.target === '_list' ? ctx.list : resolve(op.target, attacker, { ...ctx, op });
            await runOne(attacker, op, list, ctx);
        }
    }

    // Indication affichée pour chaque drapeau posé (un effet ne doit jamais être invisible)
    const FLAG_LABEL = {
        sureHit: 'Ne rate plus', nextCrit: 'Prochain coup critique', noCrit: 'Air Veinard', curl: 'Boul’Armure', noConfusion: 'Esprit clair',
        minimized: 'Lilliput', pierce: 'Perce-défense', scrappy: 'Clairvoyance', levitate: 'Lévitation', counterBoost: 'Riposte ×2',
        magicCoat: 'Reflet Magik', destinyBond: 'Lien du Destin', grudge: 'Rancune', rooted: 'Enraciné', helped: 'Coup d’Main',
        vulnerable: 'Vulnérable', locked: 'Bloqué', noEvasion: 'Esquive bloquée', substitute: 'Clone', provoke: 'Provocation',
        safeguard: 'Rune Protect', mist: 'Brume', reflect: 'Protection', lightScreen: 'Mur Lumière', wideGuard: 'Garde Large',
        quickGuard: 'Prévention', matBlock: 'Tatamigaeshi', craftyShield: 'Vigilance', leechSeed: 'Vampigraine',
    };

    // Amélioration de la capacité (entraînement, CT améliorée) : renforce aussi ses boucliers et soins
    const refOf = (ctx) => ctx?.move?._refMult || 1;

    async function runOne(attacker, op, list, ctx) {
        switch (op.op) {
            case 'flag':
                list.forEach(u => {
                    u.flags = u.flags || {};
                    u.flags[op.id] = { turns: op.turns || 3, value: op.fromAttacker ? attacker : (op.value ?? true) };
                    const label = op.label || FLAG_LABEL[op.id];
                    if (label) say(u, label, op.debuff || ['vulnerable', 'locked', 'noEvasion', 'leechSeed'].includes(op.id) ? 'debuff' : 'status');
                });
                return;
            case 'ap':
                list.forEach(u => {
                    u.actionPoints = Math.max(0, (u.actionPoints || 0) + op.amount);
                    if (typeof updateActionPointsUI === 'function') updateActionPointsUI(u);
                    say(u, op.amount > 0 ? `Jauge +${op.amount} %` : `Jauge ${op.amount} %`, op.amount > 0 ? 'buff' : 'debuff');
                });
                if (typeof updateTurnOrderDisplay === 'function') updateTurnOrderDisplay();
                return;
            case 'stat':
                list.forEach(u => applyStages(u, op.stats, attacker));
                return;
            case 'statCapped':
                list.forEach(u => {
                    const stats = Object.fromEntries(Object.entries(op.stats).filter(([k]) => (u.statMods[k] || 0) < op.max));
                    applyStages(u, stats, attacker);
                });
                return;
            case 'shield':
                list.forEach(u => {
                    let value = (op.of === 'user' ? attacker.maxHp : u.maxHp) * op.pct / 100 * refOf(ctx) * (typeof HeldItems !== 'undefined' && HeldItems.itemsOf(attacker).includes('light-clay') ? 1 + HeldItems.valueOf(attacker, 'light-clay') / 100 : 1);
                    if (R().roleActive(attacker, 'support')) value *= 1.5;
                    u.shield = (u.shield || 0) + Math.round(value);
                    say(u, 'Bouclier', 'buff');
                });
                return;
            case 'clearShield': list.forEach(u => { if (u.shield > 0) say(u, 'Bouclier perdu', 'debuff'); u.shield = 0; }); return;
            case 'heal': list.forEach(u => R().heal(u, u.maxHp * op.pct / 100 * refOf(ctx), attacker)); return;
            case 'regen':
                list.forEach(u => { (u._regens = u._regens || []).push({ pct: Math.round(op.pct * refOf(ctx) * 10) / 10, turns: op.turns }); say(u, 'Régénération', 'buff'); });
                return;
            case 'delayedHeal':
                list.forEach(u => { (u._delayedHeals = u._delayedHeals || []).push({ amount: (op.of === 'user' ? attacker.maxHp : u.maxHp) * op.pct / 100 * refOf(ctx), turns: op.turns }); say(u, 'Vœu', 'buff'); });
                return;
            case 'trap':
                list.forEach(u => {
                    if (typeof HeldItems !== 'undefined' && HeldItems.shedsTrap(u)) { say(u, 'Carapace Mue', 'info'); return; }
                    if (!u._trap) { u._trap = { turns: (op.turns || 3) + (typeof HeldItems !== 'undefined' ? HeldItems.trapTurnsBonus(attacker) : 0), pct: typeof HeldItems !== 'undefined' ? HeldItems.trapDamagePct(attacker) : 6 }; say(u, 'Piégé', 'debuff'); }
                });
                return;
            case 'status':
                list.forEach(u => {
                    if (u._side !== attacker._side && (u.flags?.safeguard || (u.flags?.substitute && u.shield > 0))) { say(u, 'Protégé', 'info'); return; }
                    if (op.force && u.activeEffects) u.activeEffects = u.activeEffects.filter(e => RulesDB?.[e.id]?.category !== 'Majeur');
                    if (R().addStatus(u, op.id, attacker, 100)) onStatus(u);
                });
                return;
            case 'cleanse':
                list.forEach(u => { u.activeEffects = (u.activeEffects || []).filter(e => !['Majeur', 'Mineur'].includes(RulesDB?.[e.id]?.category)); u._trap = null; updateStatusIcons(u); say(u, 'Soigné', 'buff'); });
                return;
            case 'clearNegativeStages':
                list.forEach(u => { Object.keys(u.statMods || {}).forEach(k => { if (u.statMods[k] < 0) u.statMods[k] = 0; }); say(u, 'Malus annulés', 'buff'); });
                return;
            case 'fieldFlag':
                extra.fieldFlags[op.id] = (op.rounds || 4) * Math.max(2, alive('player').length + alive('enemy').length) / 2;
                BattleAnimation.say({ mudSport: 'Lance-Boue !', waterSport: 'Tourniquet !', noMove: 'Verrou Enchanté !' }[op.id] || '');
                return;
            case 'project': list.forEach(u => pushBack(u, 2, op.collision || 15)); return;
            case 'push': list.forEach(u => pushBack(u, 1, op.collision || 10)); return;
            case 'pull': list.forEach(u => pullForward(u, !!op.toFront)); return;
            case 'ground': list.forEach(u => { if (u.flags) { delete u.flags.levitate; delete u.flags.diving; } pullForward(u, true); }); return;
            case 'relay': {
                if (!canMove(attacker)) return;
                const mates = alive(attacker._side).filter(u => u !== attacker && R().laneOf(u._index) === R().laneOf(attacker._index) && canMove(u));
                const best = mates.sort((a, b) => b.hp - a.hp)[0];
                if (best) { swap(attacker, best); say(attacker, 'Relais', 'info'); ctx.swapped = best; }
                return;
            }
            case 'teleport': {
                if (!canMove(attacker)) return;
                const free = [...Array(9).keys()].filter(i => !grid[attacker._side][i]);
                if (free.length) moveTo(attacker, free[Math.floor(Math.random() * free.length)]);
                else { const back = alive(attacker._side).filter(u => u !== attacker).sort((a, b) => R().depthOf(b) - R().depthOf(a))[0]; if (back) swap(attacker, back); }
                say(attacker, 'Téléport', 'info');
                return;
            }
            case 'swapAlly': {
                if (!canMove(attacker)) return;
                let mate = null;
                if (op.with === 'behind') mate = resolve('behindAlly', attacker, ctx)[0];
                else if (op.with === 'back') mate = alive(attacker._side).filter(u => u !== attacker).sort((a, b) => R().depthOf(b) - R().depthOf(a))[0];
                else mate = resolve('bestAlly', attacker, ctx)[0];
                if (mate && canMove(mate)) {
                    if (op.transferStages) { Object.assign(mate.statMods, attacker.statMods); Object.keys(attacker.statMods).forEach(k => { attacker.statMods[k] = 0; }); }
                    swap(attacker, mate); ctx.swapped = mate; say(attacker, 'Échange', 'info');
                }
                return;
            }
            case 'moveToBack': if (canMove(attacker)) pushBack(attacker, 2, 0); return;
            case 'copyStagesTo': list.forEach(u => { if (u !== attacker) { Object.entries(attacker.statMods || {}).forEach(([k, v]) => { if (v > 0) u.statMods[k] = Math.max(u.statMods[k] || 0, v); }); say(u, 'Bonus transmis', 'buff'); } }); return;
            case 'swapAP': list.forEach(u => { const a = attacker.actionPoints; attacker.actionPoints = u.actionPoints; u.actionPoints = a; updateActionPointsUI(u); updateActionPointsUI(attacker); say(u, 'Jauges échangées', 'status'); }); return;
            case 'shapeHeal': return shapeSupport(attacker, op, 'heal');
            case 'shapeShield': return shapeSupport(attacker, op, 'shield');
            case 'drainTeam': {
                const amount = (ctx.dealt || 0) * op.pct / 100;
                const allies = alive(attacker._side);
                allies.forEach(u => R().heal(u, amount / Math.max(1, allies.length), null));
                return;
            }
            case 'chance': if (Math.random() * 100 < op.pct) await runOps(attacker, op.then, ctx); return;
            case 'repeat': if (ctx.baseOps) await runOps(attacker, ctx.baseOps, ctx); return;
            case 'reflectDamage': {
                const src = ctx.source;
                if (!src || src.isKO || !ctx.damage) return;
                if (op.cls && ctx.move?.damage_class !== op.cls) return;
                const boost = attacker.flags?.counterBoost ? 2 : 1;
                R().damage(src, ctx.damage * op.pct / 100 * boost, 'Riposte !');
                return;
            }
            case 'storeDamage': attacker._bide = (attacker._bide || 0) + (ctx.damage || 0); say(attacker, `Patience (${attacker._bide})`, 'status'); return;
            case 'releaseDamage': {
                const stored = attacker._bide || 0;
                if (!stored) return;
                attacker._bide = 0;
                list.forEach(u => R().damage(u, stored * op.mult, 'Patience !'));
                return;
            }
            case 'blast': list.forEach(u => {
                const res = computeDamage(attacker, u, { power: op.power, type: op.type, damage_class: 'special', name: 'Déflagration' });
                R().damage(u, res.damage, null);
            }); return;
            case 'rockBlast': list.forEach(u => {
                const eff = (u.types || []).reduce((m, t) => m * getTypeModifier('rock', t), 1);
                R().damage(u, u.maxHp * op.pct / 100 * eff, 'Piège de Roc');
            }); return;
            case 'recycleBerry':
                if (attacker._consumedBerry && attacker._usedItems?.has(attacker._consumedBerry)) { attacker._usedItems.delete(attacker._consumedBerry); say(attacker, 'Recyclage', 'buff'); }
                else if (op.fallbackHeal) R().heal(attacker, attacker.maxHp * op.fallbackHeal / 100, attacker);
                return;
            case 'eatBerry': list.forEach(u => {
                const berry = (typeof HeldItems !== 'undefined' ? HeldItems.itemsOf(u) : []).find(id => /-berry$/.test(id));
                if (!berry) return;
                (u._usedItems = u._usedItems || new Set()).add(berry); u._consumedBerry = berry;
                R().heal(u, u.maxHp * 0.15, null); say(u, 'Baie croquée', 'buff');
            }); return;
            case 'stockpile': {
                const n = Math.min(3, (attacker._stock || 0) + (op.count || 1)) - (attacker._stock || 0);
                if (n <= 0) { say(attacker, 'Stockage plein', 'info'); return; }
                attacker._stock = (attacker._stock || 0) + n;
                applyStages(attacker, { DEF: n, SPD: n }, attacker);
                attacker.shield = (attacker.shield || 0) + Math.round(attacker.maxHp * 0.05 * n);
                say(attacker, `Stockage ×${attacker._stock}`, 'buff');
                return;
            }
            case 'swallow': {
                const n = attacker._stock || 0;
                if (!n) { say(attacker, 'Rien à avaler', 'info'); return; }
                R().heal(attacker, attacker.maxHp * [0, 0.25, 0.5, 1][n], attacker);
                applyStages(attacker, { DEF: -n, SPD: -n }, attacker);
                attacker._stock = 0;
                return;
            }
            default: {
                // Ops déjà connues du moteur (météo, champs, pièges, abris, statuts, échanges…)
                const targets = list && list.length ? list : (ctx.target ? [ctx.target] : []);
                await R().executeOps(attacker, targets[0] || ctx.target, { ...(ctx.move || {}), ops: [{ ...op, target: 'targets' }] }, targets);
                // Effets de terrain qui peuvent ne rien changer : on l'indique quand même
                const QUIET = { swapHazards: 'Pièges échangés', clearHazards: 'Pièges dissipés', invertStages: 'Stats inversées', giveItem: 'Passe-Cadeau' };
                if (QUIET[op.op]) say(targets[0] || attacker, QUIET[op.op], 'status');
            }
        }
    }

    // Modification de stats avec Brume (protège des baisses) et Saisie (vole un bonus)
    function applyStages(unit, stats, source) {
        const fromFoe = source && source._side !== unit._side;
        if (fromFoe && typeof HeldItems !== 'undefined') stats = HeldItems.filterEnemyDrops(unit, stats || {});
        const entries = Object.entries(stats || {});
        const negative = entries.some(([, v]) => v < 0);
        if (negative && fromFoe && typeof HeldItems !== 'undefined') setTimeout(() => HeldItems.afterEnemyDrops(unit), 0);
        if (negative && source && source._side !== unit._side && unit.flags?.mist) { say(unit, 'Brume', 'info'); return; }
        const positive = Object.fromEntries(entries.filter(([, v]) => v > 0));
        if (Object.keys(positive).length && source === unit) {
            const thief = alive(foeSide(unit._side)).find(u => passivesOf(u).some(p => p.move.id === 'snatch' && !p.used));
            if (thief) {
                passivesOf(thief).find(p => p.move.id === 'snatch').used = true;
                R().addStages(thief, positive, true);
                say(thief, 'Saisie !', 'buff');
                const rest = Object.fromEntries(entries.filter(([, v]) => v < 0));
                if (Object.keys(rest).length) R().addStages(unit, rest, true);
                return;
            }
        }
        R().addStages(unit, stats, true);
    }

    // Soins et boucliers en forme, sur la grille du lanceur (ligne avant en haut de la forme)
    function shapeSupport(attacker, op, kind) {
        const s = SHAPES[op.shape];
        const allies = alive(attacker._side);
        if (!s || !allies.length) return;
        const apply = (u, f) => {
            if (!u || u.isKO || f <= 0) return;
            if (kind === 'heal') R().heal(u, u.maxHp * op.pct / 100 * f, attacker);
            else if (op.pct > 0) { u.shield = (u.shield || 0) + Math.round(u.maxHp * op.pct / 100 * f * (R().roleActive(attacker, 'support') ? 1.5 : 1)); say(u, 'Bouclier', 'buff'); }
        };
        if (op.shape === 'soin_cible' || op.shape === 'soin_eclabous') {
            const target = allies.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
            apply(target, 1);
            if (op.shape === 'soin_eclabous') neighborsOf(target).concat(columnNeighbors(target)).forEach(u => apply(u, 0.4));
            return;
        }
        if (op.shape === 'garde_colonne') return; // effet porté par le drapeau wideGuard
        // Formes par ligne : ligne 0 de la forme = ligne avant du camp
        allies.forEach(u => apply(u, (s.grid[R().depthOf(u)]?.[R().laneOf(u._index)] || 0) / 100));
    }
    const columnNeighbors = unit => {
        const d = R().depthOf(unit), l = R().laneOf(unit._index);
        return [d - 1, d + 1].filter(x => x >= 0 && x <= 2).map(x => grid[unit._side][R().indexAt(unit._side, x, l)]).filter(u => u && !u.isKO);
    };

    // ------------------------------------------------------------------
    // ATTAQUES : avant / après
    // ------------------------------------------------------------------
    // Renvoie false si l'action échoue (Bluff après le premier tour…)
    function canUse(attacker, move) {
        if (move.rw?.firstTurnOnly && !move._isBoosted && (attacker._turnsTaken || 0) > 0) { say(attacker, 'Échec', 'info'); return false; }
        return true;
    }

    // Plongée : premier temps (disparaît), le coup part à son prochain tour
    function startDive(attacker, move, target) {
        if (!move.rw?.dive || move._isBoosted || move._diveStrike) return false;
        attacker.flags = attacker.flags || {};
        attacker.flags.diving = { turns: 2, value: { move, target } };
        const el = getSlotEl(attacker._side, attacker._index)?.querySelector('.unit');
        if (el) el.classList.add('is-diving');
        say(attacker, 'Disparaît !', 'info');
        BattleAnimation.say(`${attacker.name} disparaît !`);
        return true;
    }
    // Début de tour d'un plongeur : le coup part sur la cible (ou une autre si elle est tombée)
    function pendingDive(unit) {
        const d = unit.flags?.diving?.value;
        if (!d) return null;
        delete unit.flags.diving;
        getSlotEl(unit._side, unit._index)?.querySelector('.unit')?.classList.remove('is-diving');
        let target = d.target;
        if (!target || target.isKO) target = alive(foeSide(unit._side))[0];
        return target ? { move: { ...d.move, _diveStrike: true }, target } : null;
    }

    // Après les dégâts d'une attaque de la refonte
    async function afterAttack(attacker, move, primary, results) {
        const rw = move.rw;
        if (!rw) return;
        const targets = results.map(r => r.target).filter(u => u && !u.isKO);
        const dealt = results.reduce((a, r) => a + (r.dmg || 0), 0);
        const ctx = { target: primary, targets, move, dealt, guaranteed: !!move._isBoosted };
        if (rw.kind === 'attack') {
            // En face : bonus affiché quand la cible est dans le couloir du lanceur
            if (rw.face && primary && R().laneOf(primary._index) === R().laneOf(attacker._index)) say(primary, 'En face !', 'debuff');
            await runOps(attacker, rw.fx, ctx);
            if (rw.priorityAP && !attacker.isKO) { attacker.actionPoints += rw.priorityAP; updateActionPointsUI(attacker); say(attacker, `Rapide ! Jauge +${rw.priorityAP} %`, 'buff'); }
            if (rw.slowAP && !attacker.isKO) { attacker.actionPoints = Math.max(0, attacker.actionPoints - rw.slowAP); updateActionPointsUI(attacker); say(attacker, `Lent : jauge −${rw.slowAP} %`, 'debuff'); }
        }
        if (move._isBoosted) {
            await runOps(attacker, rw.z?.ops || [], ctx);
            if (rw.z?.replay && !attacker.isKO) { attacker.actionPoints += 100; updateActionPointsUI(attacker); }
        }
    }

    // Surplus d'un drain : devient un bouclier
    function drainOverflow(attacker, move, expected, gained) {
        if (!move.rw?.drainShield) return;
        const over = Math.floor(expected - gained);
        if (over > 0) { attacker.shield = (attacker.shield || 0) + over; say(attacker, 'Bouclier', 'buff'); }
    }

    // Exécution : met K.O. sous le seuil, sinon null (dégâts normaux)
    function executeDamage(attacker, target, move) {
        const ex = move.rw?.execute;
        if (!ex) return null;
        const pct = target.isBoss ? (move._isBoosted ? 20 : ex.boss) : (move._isBoosted ? 35 : ex.pct);
        return target.hp <= target.maxHp * pct / 100 ? target.hp : null;
    }

    // ------------------------------------------------------------------
    // VERSIONS Z
    // ------------------------------------------------------------------
    // Prépare la version Z d'une capacité de la refonte (ou null si ce n'en est pas une)
    function zVersion(base) {
        if (!isRw(base)) return null;
        const rw = base.rw;
        const mv = normalize({ ...base, rw: { ...rw } });
        mv._isBoosted = true;
        mv.accuracy = null; // une version Z ne rate jamais
        if (rw.kind === 'attack') {
            mv.power = rw.z?.power || mv.power;
            mv.mech = { ...(mv.mech || {}) };
            delete mv.mech.recharge; delete mv.mech.recoil; delete mv.mech.selfKo;
            mv.accuracy = null;
        } else {
            mv._zBaseOps = mv.ops || [];
            mv.ops = []; // les effets Z sont lancés par afterAttack / runPassiveZ
        }
        return mv;
    }

    // Lance une version Z de tactique ou l'Éveil d'un passif
    async function runSupportZ(unit, move, target) {
        const ctx = { target, targets: target ? [target] : [], move, baseOps: move._zBaseOps || move.rw?.ops || [], guaranteed: true };
        await runOps(unit, move.rw?.z?.ops || [], ctx);
    }

    // ------------------------------------------------------------------
    // PASSIFS
    // ------------------------------------------------------------------
    const passivesOf = unit => unit?._passives || [];

    async function onBattleStart() {
        extra.fieldFlags = {};
        const units = [...alive('player'), ...alive('enemy')];
        units.forEach(u => {
            u._turnsTaken = 0; u._regens = []; u._delayedHeals = []; u._trap = null; u._bide = 0; u._stock = 0;
            u._passives = (u.moves || []).filter(isPassive).map(move => ({ move, rw: move.rw, used: false, cd: 0, turns: 0 }));
        });
        for (const u of units) {
            // Aura (Coup d'Main) : affichée au premier tour
            passivesOf(u).filter(p => p.rw.trigger === 'aura').forEach(p => say(u, `${p.move.name || p.move.name_fr} (aura)`, 'buff'));
            for (const p of passivesOf(u).filter(p => p.rw.trigger === 'start')) {
                say(u, p.move.name || p.move.name_fr, 'buff');
                await runOps(u, p.rw.ops, { target: null, move: p.move });
            }
        }
    }

    // Début de tour du porteur : passifs « chaque tour », régénérations, piège, vœux, Patience
    async function onTurnStart(unit) {
        if (unit.isKO) return;
        unit._turnsTaken = (unit._turnsTaken || 0);
        // Régénérations
        unit._regens = (unit._regens || []).filter(r => {
            R().heal(unit, unit.maxHp * r.pct / 100, null);
            return --r.turns > 0;
        });
        // Vœux
        unit._delayedHeals = (unit._delayedHeals || []).filter(h => {
            if (--h.turns > 0) return true;
            R().heal(unit, h.amount, null); say(unit, 'Vœu exaucé', 'buff');
            return false;
        });
        // Piège : 6 % des PV par tour
        if (unit._trap) {
            R().damage(unit, unit.maxHp * (unit._trap.pct || 6) / 100, 'Piégé');
            if (--unit._trap.turns <= 0) unit._trap = null;
        }
        // Drapeaux de terrain
        Object.keys(extra.fieldFlags).forEach(k => { if (--extra.fieldFlags[k] <= 0) delete extra.fieldFlags[k]; });
        for (const p of passivesOf(unit)) {
            if (p.cd > 0) p.cd--;
            p.turns++;
            if (p.rw.trigger === 'turn') { say(unit, p.move.name || p.move.name_fr, 'buff'); await runOps(unit, p.rw.ops, { move: p.move }); }
            if (p.rw.every && p.turns % p.rw.every === 0) await runOps(unit, p.rw.release || [], { move: p.move });
        }
    }

    // Un Pokémon vient d'agir
    function onAction(unit) { unit._turnsTaken = (unit._turnsTaken || 0) + 1; }

    // Dégâts reçus d'une attaque (déclencheur « après avoir subi des dégâts »)
    async function onDamaged(target, source, move, damage) {
        if (!target || target.isKO || !damage) return;
        for (const p of passivesOf(target).filter(p => p.rw.trigger === 'hit')) {
            if (p.rw.contactOnly && !R().isContact(move)) continue;
            say(target, p.move.name || p.move.name_fr, 'buff');
            await runOps(target, p.rw.ops, { source, move, damage, target: source });
        }
    }

    // Après la mise à jour des PV : « sous 50 % » (une fois) et « coup fatal » (une fois)
    function beforeHpLoss(unit, pending) {
        if (pending < unit.hp) return pending;
        const p = passivesOf(unit).find(x => x.rw.trigger === 'fatal' && !x.used);
        if (p) { p.used = true; say(unit, 'Ténacité !', 'buff'); return Math.max(0, unit.hp - 1); }
        return pending;
    }
    function afterHpLoss(unit, before) {
        if (unit.isKO || unit.hp <= 0) return;
        if (before > unit.maxHp / 2 && unit.hp <= unit.maxHp / 2) {
            passivesOf(unit).filter(p => p.rw.trigger === 'low' && !p.used).forEach(p => {
                p.used = true;
                say(unit, p.move.name || p.move.name_fr, 'buff');
                runOps(unit, p.rw.ops, { move: p.move });
            });
        }
    }

    // Une altération vient d'être infligée
    function onStatus(unit) {
        passivesOf(unit).filter(p => p.rw.trigger === 'status' && p.cd <= 0).forEach(p => {
            p.cd = p.rw.cooldown || 0;
            say(unit, p.move.name || p.move.name_fr, 'buff');
            runOps(unit, p.rw.ops, { move: p.move });
        });
    }

    // Reflet Magik : la capacité de statut ennemie échoue sur ce porteur
    function blocksStatusMove(target, attacker, move) {
        if (!target || target._side === attacker._side || move.damage_class !== 'status') return false;
        if (target.flags?.magicCoat) { say(target, 'Reflet Magik', 'info'); return true; }
        const p = passivesOf(target).find(x => x.rw.trigger === 'statusTarget' && x.cd <= 0);
        if (!p) return false;
        p.cd = p.rw.cooldown || 3;
        say(target, 'Reflet Magik', 'info');
        return true;
    }

    // Pendant la phase de ciblage : un plongeur ne peut pas être visé
    const untargetable = u => !!u?.flags?.diving;

    return {
        load, normalize, isPassive, actionMoves, hasOnlyPassives, isContact, hitList, previewHits, displayPattern,
        damageMult, runOps, afterAttack, drainOverflow, executeDamage, zVersion, runSupportZ, canUse, startDive, pendingDive,
        onBattleStart, onTurnStart, onAction, onDamaged, pushUnit: (u, steps, collision) => pushBack(u, steps, collision), swapUnits: (a, b) => swap(a, b), beforeHpLoss, afterHpLoss, onStatus, blocksStatusMove, untargetable,
        get shapes() { return SHAPES; },
    };
})();
window.MoveRework = MoveRework;
