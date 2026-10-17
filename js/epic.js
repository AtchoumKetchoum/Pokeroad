/**
 * epic.js - Plus on avance, plus c'est épique
 *  - rangs selon la zone (Bronze → Mythe), affichés au combat et au bourg
 *  - auras des ennemis et ambiance d'arène qui s'intensifient avec le rang
 *  - entrée en scène des boss et cut-in des attaques Z façon anime
 */

const Epic = (() => {
    const RANKS = [
        { key: 'bronze',   label: 'Bronze',   from: 1,   color: '#c8834a', glow: 'rgba(200, 131, 74, .55)' },
        { key: 'silver',   label: 'Argent',   from: 5,   color: '#c9d3e0', glow: 'rgba(201, 211, 224, .6)' },
        { key: 'gold',     label: 'Or',       from: 10,  color: '#ffcb05', glow: 'rgba(255, 203, 5, .6)' },
        { key: 'platinum', label: 'Platine',  from: 20,  color: '#7fe3d8', glow: 'rgba(127, 227, 216, .6)' },
        { key: 'diamond',  label: 'Diamant',  from: 35,  color: '#7fb8ff', glow: 'rgba(127, 184, 255, .65)' },
        { key: 'master',   label: 'Maître',   from: 50,  color: '#c77dff', glow: 'rgba(199, 125, 255, .7)' },
        { key: 'legend',   label: 'Légende',  from: 75,  color: '#ff5a5a', glow: 'rgba(255, 90, 90, .7)' },
        { key: 'myth',     label: 'Mythe',    from: 100, color: '#ffffff', glow: 'rgba(255, 255, 255, .8)' },
    ];

    function rankFor(zone) {
        let rank = RANKS[0];
        for (const r of RANKS) if (zone >= r.from) rank = r;
        return { ...rank, index: RANKS.indexOf(rank) };
    }

    function emblem(rank, size = 22) {
        return `<svg class="rank-emblem" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l7 4v6c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-4z" fill="${rank.color}" stroke="#1b1f3b" stroke-width="2"/>
            <path d="M12 7l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 15.2 8.8 16.9l.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" opacity=".85"/>
        </svg>`;
    }

    function rankChip(zone, { short = false } = {}) {
        const r = rankFor(zone);
        return `<span class="rank-chip rank-${r.key}" style="--rank-color:${r.color}" title="Rang ${r.label}">${emblem(r, 18)}<span>${short ? r.label : `Rang ${r.label}`}</span></span>`;
    }

    // Ambiance de l'arène : le rang pilote l'éclairage et les particules (css/epic.css)
    function applyArena(zone) {
        const screen = document.querySelector('#view-battle .scaler-view');
        if (!screen) return;
        const r = rankFor(zone);
        screen.dataset.rank = r.key;
        screen.style.setProperty('--rank-color', r.color);
        screen.style.setProperty('--rank-glow', r.glow);
        let fx = screen.querySelector('.arena-fx');
        if (!fx) {
            fx = document.createElement('div');
            fx.className = 'arena-fx';
            screen.querySelector('#battle-scene')?.after(fx);
        }
    }

    // Aura derrière les ennemis : plus forte selon les étoiles, maximale pour le boss
    function decorateEnemy(unitEl, tier, isBoss) {
        const stars = tier?.stars || 0;
        if (!stars && !isBoss) return;
        unitEl.classList.add('has-aura');
        unitEl.style.setProperty('--aura-strength', Math.min(1, 0.35 + stars * 0.08 + (isBoss ? 0.4 : 0)).toFixed(2));
    }

    const wait = (ms) => new Promise(r => setTimeout(r, ms / (typeof battleSpeed !== 'undefined' ? Math.min(battleSpeed, 4) : 1)));

    function overlay(className, html) {
        const screen = document.querySelector('#view-battle .scaler-view');
        if (!screen) return null;
        const el = document.createElement('div');
        el.className = `epic-overlay ${className}`;
        el.innerHTML = html;
        screen.appendChild(el);
        return el;
    }

    // Écran d'alerte avant un boss
    async function bossIntro(boss) {
        if (!boss) return;
        const r = rankFor(zoneIndex);
        const sprite = boss.spriteSrc || '';
        const el = overlay('boss-intro', `
            <div class="boss-stripes"></div>
            <div class="boss-warning">⚠ ATTENTION ⚠</div>
            <div class="boss-card" style="--rank-color:${r.color}">
                <img src="${sprite}" alt="">
                <div class="boss-text">
                    <div class="boss-label">BOSS · Rang ${r.label}</div>
                    <div class="boss-name">${boss.name}</div>
                    <div class="boss-level">Niv. ${boss.level}</div>
                </div>
            </div>`);
        if (!el) return;
        await wait(1900);
        el.classList.add('leaving');
        await wait(350);
        el.remove();
    }

    // Cut-in d'attaque Z : lignes de vitesse, portrait et nom, façon anime
    async function zMoveCutin(unit, moveName) {
        const side = unit._side === 'player' ? 'from-left' : 'from-right';
        const el = overlay(`z-cutin ${side}`, `
            <div class="z-lines"></div>
            <div class="z-band">
                <img src="${unit.spriteSrc || ''}" alt="">
                <div class="z-text"><small>${unit.name} déchaîne sa puissance</small><span>${moveName}</span></div>
            </div>`);
        if (!el) return;
        await wait(1100);
        el.classList.add('leaving');
        await wait(250);
        el.remove();
    }

    // Taille du chiffre de dégâts selon la part de PV retirée
    function damageClass(damage, maxHp) {
        const ratio = maxHp ? damage / maxHp : 0;
        if (ratio >= 0.6) return 'dmg-massive';
        if (ratio >= 0.3) return 'dmg-big';
        return '';
    }

    return { RANKS, rankFor, rankChip, emblem, applyArena, decorateEnemy, bossIntro, zMoveCutin, damageClass };
})();
