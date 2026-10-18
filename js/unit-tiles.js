/**
 * unit-tiles.js - Vignettes d'effets au-dessus des Pokémon en combat (à la Summoners War).
 *
 * Petites vignettes carrées à pictogramme, lisibles d'un coup d'œil :
 *  - fond bleu : effet bénéfique (hausse de stat, bouclier, régénération, Abri…)
 *  - fond rouge : effet néfaste (baisse de stat, altération, piège, Vampigraine…)
 *  - chevrons ▲ / ▼ sur le bord droit : nombre de paliers de la stat (1 à 3+)
 * Chaque vignette a son explication (survol, et fiche du Pokémon au toucher).
 * Les vignettes se mettent à jour seules dès que l'état du Pokémon change.
 */
const UnitTiles = (() => {
    const MAX_TILES = 12; // 2 rangées de 6 ; au-delà : vignette « +N »

    // Pictogrammes 24×24 (trait blanc sur la vignette)
    const F = 'fill="currentColor" stroke="none"';
    const SHIELD = 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z';
    const SKULL = `<path ${F} d="M12 3c-4.5 0-7 3-7 7 0 2.5 1.2 4 3 5v4h8v-4c1.8-1 3-2.5 3-5 0-4-2.5-7-7-7z"/><circle cx="9.3" cy="10.5" r="1.8" fill="rgba(0,0,0,.6)" stroke="none"/><circle cx="14.7" cy="10.5" r="1.8" fill="rgba(0,0,0,.6)" stroke="none"/>`;
    const STAR = `<path ${F} d="M12 2l2.6 6.4 6.9.5-5.3 4.4 1.7 6.7L12 16.3 6.1 20l1.7-6.7L2.5 8.9l6.9-.5z"/>`;
    const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
    const HOURGLASS = '<path d="M6 3h12M6 21h12M7 3c0 6 10 8 10 18M17 3c0 6-10 8-10 18"/>';
    const SPIRAL = '<path d="M12 12a2 2 0 1 1 2-2c0 3-2 5-5 5a5 5 0 0 1-5-5 8 8 0 0 1 8-8 8 8 0 0 1 8 8 9 9 0 0 1-9 9"/>';
    const CROSSHAIR = '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>';
    const ICON = {
        // Stats
        ATK: '<path d="M20 4 10 14"/><path d="M6.5 10.5l7 7"/><path d="M8.5 15.5 4 20"/>',
        DEF: `<path d="${SHIELD}"/>`,
        SPA: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
        SPD: `<path d="${SHIELD}"/><circle cx="12" cy="11" r="2.6" ${F}/>`,
        SPE: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
        PRE: CROSSHAIR,
        EVA: `<path d="M5 20c2-6 7-11 14-13"/><path d="M5 14c2-3 4-5 7-6" opacity=".6"/><circle cx="18" cy="5" r="2.2" ${F}/>`,
        CRIT: STAR,
        // Altérations
        burn: `<path ${F} d="M12 22c-4 0-7-3-7-6.5C5 11 9 9 9 3c3 2 5.5 5 5.5 8.5 1-1 1.5-2.2 1.5-3.5 2 1.8 3 4.2 3 7 0 3.8-3 7-7 7z"/>`,
        par: `<path ${F} d="M13.5 2 5 13.5h6L10 22l9-12h-6.2z"/>`,
        psn: SKULL,
        frz: '<path d="M12 2v20M3.4 7l17.2 10M3.4 17l17.2-10M9 4l3 2.2L15 4M9 20l3-2.2 3 2.2"/>',
        slp: '<path d="M3 11h6l-6 7h6M12 4h8l-8 9h8"/>',
        cnf: SPIRAL,
        flinch: `<path d="M12 4v10"/><circle cx="12" cy="19.5" r="1.8" ${F}/>`,
        healBlock: '<path d="M12 5v14M5 12h14" stroke-width="4"/><path d="M4 4l16 16" stroke="rgba(0,0,0,.55)" stroke-width="3"/>',
        // Bénéfiques
        shield: '<path d="M3 18a9 9 0 0 1 18 0"/><path d="M2.5 18h19"/><path d="M8 12a5 5 0 0 1 3-2.5"/>',
        protect: `<path ${F} d="${SHIELD}"/>`,
        regen: `<path ${F} d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>`,
        wish: `<path ${F} d="M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10z"/>`,
        stock: '<path d="M5 19h14M5 14h14M5 9h14"/><path d="M8 4h8"/>',
        bide: HOURGLASS,
        followMe: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" ${F}/>`,
        substitute: '<circle cx="12" cy="6" r="3"/><path d="M12 9v7M7 12h10M9 21l3-5 3 5"/>',
        immunity: '<path d="M12 9C9 5 5.5 4 2 5c1 5 4 9.5 10 12 6-2.5 9-7 10-12-3.5-1-7 0-10 4z"/>',
        mist: '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4.2 4.2 0 0 1 17 18z"/>',
        critGuard: `<path d="${SHIELD}"/><path ${F} d="M12 7.5l1.2 2.7 2.9.3-2.2 1.9.7 2.9L12 13.8l-2.6 1.5.7-2.9-2.2-1.9 2.9-.3z"/>`,
        reflect: `<path d="${SHIELD}"/><path d="M9 9l6 6"/>`,
        lightScreen: `<path d="${SHIELD}"/><path d="M12 7.5v7M8.5 11h7"/>`,
        wideGuard: '<path d="M2 6h20v4c0 5-5 9-10 10C7 19 2 15 2 10z"/>',
        quickGuard: `<path d="${SHIELD}"/><path ${F} d="M13 7l-4 5h3l-1 5 4-5.5h-3z"/>`,
        wall: '<path d="M3 5h18v14H3zM3 12h18M9 5v7M15 12v7"/>',
        craftyShield: `<path d="${SHIELD}"/><circle cx="12" cy="11.5" r="2.4"/>`,
        sureHit: CROSSHAIR,
        nextCrit: STAR,
        levitate: '<path d="M12 18V5M7 10l5-5 5 5"/><path d="M5 21h14"/>',
        rooted: '<path d="M12 3v10M12 13c-3 0-5 3-6 7M12 13c3 0 5 3 6 7M12 13v8"/>',
        helped: '<path d="M12 4v16M4 12h16"/>',
        counter: '<path d="M4 4l16 16M20 4 4 20M4 4h4M4 4v4M20 4h-4M20 4v4"/>',
        bounce: '<path d="M4 20 12 7l8 5"/><path d="M15.5 8.5 20 12l-5.5 1"/>',
        chain: '<rect x="2.5" y="9" width="11" height="6" rx="3"/><rect x="10.5" y="9" width="11" height="6" rx="3"/>',
        skull: SKULL,
        noConfusion: `${SPIRAL}<path d="M4 4l16 16" stroke="rgba(0,0,0,.55)" stroke-width="3"/>`,
        diving: '<path d="M2 9c3-3 6 3 10 0s7 3 10 0M2 15c3-3 6 3 10 0s7 3 10 0"/>',
        // Néfastes
        lock: LOCK,
        seed: '<path d="M12 21v-9"/><path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 3-5 7-5 0 3-3 5-7 5z"/>',
        broken: `<path d="${SHIELD}"/><path d="M12 6l-2 5 4 2-2 6"/>`,
        perish: `<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3" ${F}/><circle cx="17" cy="16" r="3" ${F}/>`,
        eye: `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" ${F}/>`,
        angry: '<circle cx="12" cy="12" r="9"/><path d="M7 8l3 2M17 8l-3 2M8 17c2.5-2.5 5.5-2.5 8 0"/>',
        recharge: HOURGLASS,
        trap: '<path d="M2 15l3.3-5 3.3 5 3.4-5 3.4 5 3.3-5L22 15"/><path d="M2 19h20"/>',
    };

    const STAT = {
        ATK: 'Attaque', DEF: 'Défense', SPA: 'Attaque Spéciale', SPD: 'Défense Spéciale',
        SPE: 'Vitesse', PRE: 'Précision', EVA: 'Esquive', CRIT: 'Taux de critique',
    };
    // Altérations : [pictogramme, explication]
    const STATUS = {
        STAT_BRU: ['burn', 'Brûlure : perd des PV à chaque tour, attaque physique réduite'],
        STAT_PAR: ['par', 'Paralysie : Vitesse réduite, peut rater son tour'],
        STAT_PSN: ['psn', 'Poison : perd des PV à chaque tour'],
        STAT_GEL: ['frz', 'Gel : ne peut pas agir tant qu’il ne dégèle pas'],
        STAT_SOM: ['slp', 'Sommeil : ne peut pas agir tant qu’il dort'],
        STAT_CONF: ['cnf', 'Confusion : peut se blesser au lieu d’agir'],
        STAT_FLINCH: ['flinch', 'Peur : perd son prochain tour'],
        STAT_NO_REVIVE: ['healBlock', 'Anti-soin : ne peut plus être soigné'],
    };
    // Drapeaux : [pictogramme, bon/mauvais, explication]
    const FLAG = {
        provoke: ['followMe', 'good', 'Par Ici : attire les attaques ennemies'],
        substitute: ['substitute', 'good', 'Clone : bouclier qui bloque aussi les altérations'],
        safeguard: ['immunity', 'good', 'Rune Protect : immunisé contre les altérations'],
        mist: ['mist', 'good', 'Brume : ses stats ne peuvent pas baisser'],
        noCrit: ['critGuard', 'good', 'Air Veinard : ne subit pas de coup critique'],
        reflect: ['reflect', 'good', 'Protection : dégâts physiques reçus réduits'],
        lightScreen: ['lightScreen', 'good', 'Mur Lumière : dégâts spéciaux reçus réduits'],
        wideGuard: ['wideGuard', 'good', 'Garde Large : bloque les attaques de zone'],
        quickGuard: ['quickGuard', 'good', 'Prévention : bloque les attaques prioritaires'],
        matBlock: ['wall', 'good', 'Tatamigaeshi : bloque les attaques'],
        craftyShield: ['craftyShield', 'good', 'Vigilance : bloque les capacités de statut'],
        sureHit: ['sureHit', 'good', 'Ne rate plus ses attaques'],
        nextCrit: ['nextCrit', 'good', 'Prochaine attaque : coup critique'],
        levitate: ['levitate', 'good', 'Lévitation : immunisé contre le Sol'],
        rooted: ['rooted', 'good', 'Enraciné : régénère, ne peut pas être déplacé'],
        helped: ['helped', 'good', 'Coup d’Main : dégâts augmentés'],
        counterBoost: ['counter', 'good', 'Riposte renforcée'],
        magicCoat: ['bounce', 'good', 'Reflet Magik : renvoie les capacités de statut'],
        destinyBond: ['chain', 'good', 'Lien du Destin : emporte son agresseur s’il tombe'],
        grudge: ['skull', 'good', 'Rancune : bloque l’attaque qui le met K.O.'],
        noConfusion: ['noConfusion', 'good', 'Insensible à la confusion'],
        diving: ['diving', 'good', 'Plongée : intouchable jusqu’à son prochain tour'],
        locked: ['lock', 'bad', 'Bloqué : ne peut pas être déplacé'],
        leechSeed: ['seed', 'bad', 'Vampigraine : perd des PV au profit d’un ennemi'],
        vulnerable: ['broken', 'bad', 'Vulnérable : subit plus de dégâts'],
        curse: ['skull', 'bad', 'Malédiction : perd beaucoup de PV à chaque tour'],
        perish: ['perish', 'bad', 'Requiem : perd la moitié de ses PV à la fin du décompte'],
        noEvasion: ['eye', 'bad', 'Esquive bloquée'],
        taunt: ['angry', 'bad', 'Provoc : ne peut utiliser que des attaques'],
        imprisoned: ['lock', 'bad', 'Possessif : certaines attaques sont bloquées'],
        recharge: ['recharge', 'bad', 'Doit se reposer : perd son prochain tour'],
        healBlock: ['healBlock', 'bad', 'Anti-soin : ne peut plus être soigné'],
        octolock: ['lock', 'bad', 'Prise de pieuvre : Défense et Déf. Spé. baissent à chaque tour'],
    };

    const turnsText = t => (Number.isFinite(t) && t < 50 ? ` (encore ${t} tour${t > 1 ? 's' : ''})` : '');

    // Liste des vignettes d'un Pokémon : { good, icon, stage, title }
    function tilesFor(unit) {
        const tiles = [];
        // Altérations
        (unit.activeEffects || []).forEach(e => {
            const s = STATUS[e.id];
            if (s) tiles.push({ good: false, icon: s[0], title: s[1] + turnsText(e.duration) });
        });
        // Effets de la refonte
        if (unit._trap) tiles.push({ good: false, icon: 'trap', title: `Piégé : perd 6 % de PV par tour et ne peut pas bouger${turnsText(unit._trap.turns)}` });
        if (unit.shield > 0) tiles.push({ good: true, icon: 'shield', title: `Bouclier : absorbe ${unit.shield} dégâts avant les PV` });
        if (unit.protect) tiles.push({ good: true, icon: 'protect', title: 'Abri : bloque les attaques jusqu’à son prochain tour' });
        const regen = (unit._regens || []).reduce((a, r) => a + r.pct, 0) + (unit.regen || 0);
        if (regen > 0) tiles.push({ good: true, icon: 'regen', title: `Régénération : récupère ${regen} % de ses PV à chaque tour` });
        if ((unit._delayedHeals || []).length) tiles.push({ good: true, icon: 'wish', title: 'Vœu : sera soigné bientôt' });
        if (unit._stock) tiles.push({ good: true, icon: 'stock', title: `Stockage ×${unit._stock}` });
        if (unit._bide) tiles.push({ good: true, icon: 'bide', title: `Patience : ${unit._bide} dégâts accumulés à renvoyer` });
        // Drapeaux
        Object.entries(unit.flags || {}).forEach(([id, f]) => {
            const d = FLAG[id];
            if (d) tiles.push({ good: d[1] === 'good', icon: d[0], title: d[2] + turnsText(f?.turns) });
        });
        // Stats : bleu ▲ hausse, rouge ▼ baisse
        Object.entries(unit.statMods || {}).forEach(([k, v]) => {
            if (!v || !STAT[k]) return;
            const n = Math.abs(v);
            tiles.push({ good: v > 0, icon: k, stage: v, title: `${STAT[k]} ${v > 0 ? 'augmentée' : 'baissée'} de ${n} palier${n > 1 ? 's' : ''}` });
        });
        // Néfastes d'abord, puis bénéfiques
        return tiles.sort((a, b) => a.good - b.good);
    }

    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // Chevrons des paliers (1 à 3) sur le bord droit
    function stageSvg(v) {
        const n = Math.min(3, Math.abs(v));
        const top = 12 - n * 3.5;
        let d = '';
        for (let i = 0; i < n; i++) {
            const y = top + i * 7;
            d += v > 0 ? `M1 ${y + 4}l3-3.5 3 3.5` : `M1 ${y}l3 3.5 3-3.5`;
        }
        return `<svg class="ut-stg" viewBox="0 0 8 24" aria-hidden="true"><path d="${d}"/></svg>`;
    }
    const tileHtml = t => `<div class="ut-tile ${t.good ? 'ut-good' : 'ut-bad'}" title="${esc(t.title)}">`
        + `<svg class="ut-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[t.icon] || ''}</svg>`
        + (t.stage ? stageSvg(t.stage) : '') + '</div>';

    function render(unit) {
        const slot = getSlotEl(unit._side, unit._index);
        const box = slot?.querySelector('.status-icons');
        if (!box) return;
        if (unit.isKO) { box.innerHTML = ''; box.style.display = 'none'; return; }
        box.style.display = '';
        const tiles = tilesFor(unit);
        const shown = tiles.length > MAX_TILES ? tiles.slice(0, MAX_TILES - 1) : tiles;
        box.innerHTML = shown.map(tileHtml).join('') + (tiles.length > shown.length
            ? `<div class="ut-tile ut-more" title="${esc(tiles.slice(shown.length).map(t => t.title).join(' · '))}">+${tiles.length - shown.length}</div>` : '');
        // Bouclier visible sur la barre de PV
        const bar = slot.querySelector('.hp-bar-bg');
        if (bar) {
            let sh = bar.querySelector('.hp-shield');
            if (!sh) { sh = document.createElement('div'); sh.className = 'hp-shield'; bar.appendChild(sh); }
            const hpPct = Math.max(0, unit.hp / unit.maxHp * 100);
            const shPct = Math.min(100 - hpPct, (unit.shield || 0) / unit.maxHp * 100);
            sh.style.left = `${hpPct}%`;
            sh.style.width = `${Math.max(0, shPct)}%`;
        }
    }

    // Liste lisible pour la fiche du Pokémon
    function describe(unit) {
        const tiles = tilesFor(unit);
        if (!tiles.length) return '<span class="ut-none">Aucun effet</span>';
        return `<div class="ut-legend">${tiles.map(t => `<div class="ut-row">${tileHtml(t)}<span>${esc(t.title)}</span></div>`).join('')}</div>`;
    }

    // Mise à jour automatique : on ne redessine que les Pokémon dont l'état a changé
    const signatures = new WeakMap();
    function signature(u) {
        return JSON.stringify([u.isKO, u.hp, u.shield, u.statMods, (u.activeEffects || []).map(e => e.id + e.duration), Object.keys(u.flags || {}), u._regens, u._trap, u._stock, u._bide, (u._delayedHeals || []).length, !!u.protect, u.regen]);
    }
    function refreshAll() {
        if (typeof grid === 'undefined') return;
        [...(grid.player || []), ...(grid.enemy || [])].forEach(u => {
            if (!u) return;
            const sig = signature(u);
            if (signatures.get(u) === sig) return;
            signatures.set(u, sig);
            render(u);
        });
    }
    setInterval(refreshAll, 250);

    return { tilesFor, render, describe, refreshAll };
})();
