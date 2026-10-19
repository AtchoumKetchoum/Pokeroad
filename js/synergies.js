/**
 * synergies.js - Synergies de types : 18 effets différents, un par type.
 *
 * Paliers : 2 / 3 / 4 Pokémon du même type dans l'équipe (les plaques tenues comptent).
 * Chaque type a son propre effet, qui grandit à chaque palier. Selon le type, l'effet profite
 * aux Pokémon de ce type (« type ») ou à toute l'équipe (« équipe »).
 */
const Synergies = (() => {
    const THRESHOLDS = [2, 3, 4];
    const tierOf = (n) => (n >= 4 ? 3 : n >= 3 ? 2 : n >= 2 ? 1 : 0);
    const R = () => BattleRules;
    const say = (u, text, kind = 'buff') => { if (typeof spawnEffectText === 'function') spawnEffectText(u, text, kind); };
    const gauge = (u, pct) => {
        u.actionPoints = Math.max(0, Math.min(150, (u.actionPoints || 0) + pct));
        if (typeof updateActionPointsUI === 'function') updateActionPointsUI(u);
    };
    const pct = (v) => `${v} %`;

    // name : nom de la synergie ; scope : 'type' (les Pokémon du type) ou 'team' (toute l'équipe)
    // values : valeur par palier ; text(v) : effet lisible pour une valeur
    const DEFS = {
        normal:   { name: 'Polyvalence', icon: 'heart',  scope: 'team', values: [6, 12, 20],  text: v => `PV max +${pct(v)}` },
        fire:     { name: 'Brasier',     icon: 'flame',  scope: 'type', values: [10, 20, 30], text: v => `${pct(v)} de chance de brûler avec une attaque Feu` },
        water:    { name: 'Marée',       icon: 'drop',   scope: 'team', values: [2, 4, 6],    text: v => `Régénère ${pct(v)} des PV à chaque tour` },
        grass:    { name: 'Photosynthèse', icon: 'leaf', scope: 'type', values: [8, 15, 25],  text: v => `Récupère ${pct(v)} des dégâts infligés` },
        electric: { name: 'Survolté',    icon: 'bolt',   scope: 'type', values: [20, 40, 60], text: v => `Commence avec ${pct(v)} de jauge d'action` },
        ice:      { name: 'Givre',       icon: 'snow',   scope: 'type', values: [15, 25, 35], text: v => `${pct(v)} de chance de retirer 30 % de jauge à la cible` },
        fighting: { name: 'Riposte',     icon: 'fist',   scope: 'type', values: [15, 25, 40], text: v => `Renvoie ${pct(v)} des dégâts reçus au contact` },
        poison:   { name: 'Toxines',     icon: 'skull',  scope: 'type', values: [15, 25, 35], text: v => `${pct(v)} de chance d'empoisonner en frappant` },
        ground:   { name: 'Ancrage',     icon: 'mount',  scope: 'type', values: [8, 15, 22],  text: v => `Dégâts reçus −${pct(v)}` },
        flying:   { name: 'Voltige',     icon: 'wing',   scope: 'type', values: [8, 15, 22],  text: v => `Esquive +${pct(v)}` },
        psychic:  { name: 'Prescience',  icon: 'eye',    scope: 'team', values: [25, 50, 75], text: v => `Jauge Z +${pct(v)} plus vite` },
        bug:      { name: 'Essaim',      icon: 'swarm',  scope: 'type', values: [20, 35, 50], text: v => `Quand l'équipe met un ennemi K.O. : +${pct(v)} de jauge d'action` },
        rock:     { name: 'Rempart',     icon: 'shield', scope: 'type', values: [10, 18, 26], text: v => `Bouclier de ${pct(v)} des PV au départ` },
        ghost:    { name: 'Hantise',     icon: 'ghost',  scope: 'type', values: [0, 15, 25],  text: v => `Ignore la ligne de front${v ? ` · ${pct(v)} de chance d'apeurer` : ''}` },
        dragon:   { name: 'Fureur',      icon: 'claw',   scope: 'type', values: [1, 1, 2],    text: (v, t) => `Attaque et Att. Spé. +${v}${t === 3 ? ' · Vitesse +1' : ''}` },
        dark:     { name: 'Sournois',    icon: 'moon',   scope: 'type', values: [1, 2, 3],    text: v => `Critique +${v} palier${v > 1 ? 's' : ''}` },
        steel:    { name: 'Blindage',    icon: 'bolt2',  scope: 'type', values: [20, 35, 50], text: v => `Dégâts super efficaces reçus −${pct(v)}` },
        fairy:    { name: 'Bénédiction', icon: 'sparkle', scope: 'team', values: [20, 35, 50], text: v => `${pct(v)} de chance d'éviter une altération de statut` },
    };

    // Compte par type (types du Pokémon + plaques tenues)
    function typesOf(u) {
        return [...(u.types || []), ...(typeof HeldItems !== 'undefined' ? HeldItems.extraTypes(u) : [])];
    }
    function counts(units) {
        const c = {};
        units.forEach(u => typesOf(u).forEach(t => { c[t] = (c[t] || 0) + 1; }));
        return c;
    }
    // Liste lisible pour l'interface : actives d'abord, puis celles à un Pokémon d'être actives
    function describe(units) {
        return Object.entries(counts(units)).filter(([t]) => DEFS[t]).map(([type, count]) => {
            const tier = tierOf(count), d = DEFS[type];
            const next = THRESHOLDS.find(n => n > count) || null;
            return {
                type, count, tier, name: d.name, scope: d.scope, next,
                effect: tier ? d.text(d.values[tier - 1], tier) : '',
                nextEffect: tier < 3 ? d.text(d.values[tier], tier + 1) : '',
                levels: d.values.map((v, i) => d.text(v, i + 1)),
            };
        }).sort((a, b) => b.tier - a.tier || b.count - a.count);
    }

    // Valeur de la synergie d'un type pour un Pokémon (0 s'il n'en profite pas)
    const val = (u, type) => {
        const t = u?._syn?.[type];
        if (!t) return 0;
        const d = DEFS[type];
        if (d.scope === 'type' && !typesOf(u).includes(type)) return 0;
        return d.values[t - 1];
    };

    // Début du combat : effets immédiats
    function setup(units, cnt) {
        units.forEach(u => {
            u._syn = {};
            u.synergyTypeBonus = {};
            Object.entries(cnt).forEach(([type, n]) => { const t = tierOf(n); if (t && DEFS[type]) u._syn[type] = t; });
            let v;
            if ((v = val(u, 'normal'))) { u.maxHp = Math.round(u.maxHp * (1 + v / 100)); u.hp = u.maxHp; }
            if ((v = val(u, 'electric'))) u.actionPoints = (u.actionPoints || 0) + v;
            if ((v = val(u, 'grass'))) u.lifesteal = (u.lifesteal || 0) + v / 100;
            if ((v = val(u, 'rock'))) u.shield = (u.shield || 0) + Math.round(u.maxHp * v / 100);
            if (u._syn.ghost && typesOf(u).includes('ghost')) u.ignoresFrontline = true;
            if ((v = val(u, 'dragon'))) R().addStages(u, u._syn.dragon === 3 ? { ATK: v, SPA: v, SPE: 1 } : { ATK: v, SPA: v });
            if ((v = val(u, 'dark'))) R().addStages(u, { CRIT: v });
            if ((v = val(u, 'psychic'))) u.zGainMult = (u.zGainMult || 1) * (1 + v / 100);
        });
    }

    // Dégâts reçus : Ancrage (Sol), Blindage (Acier)
    function defenseMult(d, ctx) {
        let m = 1;
        const g = val(d, 'ground'); if (g) m *= 1 - g / 100;
        const s = val(d, 'steel'); if (s && ctx.typeMod > 1) m *= 1 - s / 100;
        return m;
    }
    // Esquive : Voltige (Vol)
    const evasionMult = (d) => 1 - val(d, 'flying') / 100;
    // Altérations de statut : Bénédiction (Fée)
    function blocksStatus(u, id) {
        const v = val(u, 'fairy');
        if (!v || RulesDB?.[id]?.category !== 'Majeur') return false;
        if (Math.random() * 100 < v) { say(u, 'Bénédiction', 'info'); return true; }
        return false;
    }
    // Coup reçu : Riposte (Combat)
    function onHit(t, a, dmg, ctx) {
        if (!t || !a || t._side === a._side || !dmg || a.isKO) return;
        const v = val(t, 'fighting');
        if (v && ctx.contact) R().damage(a, dmg * v / 100, 'Riposte');
    }
    // Après l'action de l'attaquant : Brasier, Givre, Toxines, Hantise, Essaim
    function afterAction(a, move, ctx) {
        if (!a || !(move.power > 0) || move.damage_class === 'status') return;
        const hits = (ctx.damages || []).filter(d => d.dmg > 0 && d.target && d.target._side !== a._side);
        const roll = (v) => v && Math.random() * 100 < v;
        hits.forEach(({ target }) => {
            if (target.isKO) return;
            if (ctx.moveType === 'fire' && roll(val(a, 'fire'))) R().addStatus(target, 'STAT_BRU', a);
            if (roll(val(a, 'poison'))) R().addStatus(target, 'STAT_PSN', a);
            if (roll(val(a, 'ice'))) { gauge(target, -30); say(target, 'Givre', 'debuff'); }
        });
        if (ctx.primary && !ctx.primary.isKO && roll(val(a, 'ghost'))) R().addStatus(ctx.primary, 'STAT_FLINCH', a);
        // Essaim : un K.O. relance les Insectes de l'équipe
        if (hits.some(h => h.target.isKO)) {
            (grid[a._side] || []).filter(x => x && !x.isKO).forEach(x => { const v = val(x, 'bug'); if (v) { gauge(x, v); say(x, 'Essaim', 'buff'); } });
        }
    }
    // Début de tour : Marée (Eau)
    function onTurnStart(u) {
        const v = val(u, 'water');
        if (v && u.hp < u.maxHp && !u.isKO) R().heal(u, u.maxHp * v / 100, null);
    }

    return { DEFS, THRESHOLDS, tierOf, counts, describe, setup, defenseMult, evasionMult, blocksStatus, onHit, afterAction, onTurnStart };
})();
window.Synergies = Synergies;
