/**
 * field-fx.js - Le terrain du combat montre vraiment ce qui s'y passe.
 *
 *  - météo : une couche animée sur le plateau (pluie, soleil, sable, grêle, neige, ciel ombre) ;
 *  - champ : le sol des deux camps prend la couleur du champ (herbu, électrifié, psychique, brumeux) ;
 *  - pièges : picots, rochers, pics toxiques ou toile posés sur le sol du camp concerné
 *    (plus nombreux à chaque couche) ;
 *  - zones (Distorsion, Zone Étrange…) : une teinte sur la scène.
 * Mis à jour à chaque changement du terrain (showTerrainInfo) et à chaque tour.
 */
const FieldFx = (() => {
    const scene = () => document.querySelector('#view-battle .scaler-view');
    let last = '';

    // Icônes de pièges (posées au sol, elles tournent avec la grille)
    const HAZARD_SVG = {
        spikes: '<svg viewBox="0 0 24 24"><path d="M3 20 8 6l5 14z" fill="#9aa3ad" stroke="#2b2118" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 20l5-11 5 11z" fill="#c4cbd2" stroke="#2b2118" stroke-width="1.6" stroke-linejoin="round"/></svg>',
        toxic: '<svg viewBox="0 0 24 24"><path d="M3 20 8 6l5 14z" fill="#9b5fc0" stroke="#2b2118" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 20l5-11 5 11z" fill="#c08ae0" stroke="#2b2118" stroke-width="1.6" stroke-linejoin="round"/></svg>',
        rock: '<svg viewBox="0 0 24 24"><path d="M4 19l2-8 6-5 7 4 1 9z" fill="#a98a62" stroke="#2b2118" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11l4 2 3-3" fill="none" stroke="#6e5638" stroke-width="1.4"/></svg>',
        web: '<svg viewBox="0 0 24 24" fill="none" stroke="#f4f1e8" stroke-width="1.3"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/></svg>',
    };
    // Emplacements des pièges sur la grille (%), répartis sans tomber sur les Pokémon
    const SPOTS = [[8, 30], [52, 18], [90, 34], [30, 62], [72, 60], [12, 90], [50, 88], [88, 92], [32, 8], [70, 6], [6, 60], [94, 64]];

    function hazardLayer(gridEl) {
        let layer = gridEl.querySelector(':scope > .hazard-layer');
        if (!layer) { layer = document.createElement('div'); layer.className = 'hazard-layer'; gridEl.prepend(layer); }
        return layer;
    }
    function weatherLayer(sc) {
        let el = sc.querySelector(':scope > #field-weather');
        if (!el) {
            // Juste au-dessus du décor : la météo passe derrière le plateau, les Pokémon et leurs infos
            el = document.createElement('div'); el.id = 'field-weather';
            const decor = sc.querySelector(':scope > #battle-scene');
            if (decor) decor.after(el); else sc.prepend(el);
        }
        return el;
    }

    function update() {
        const sc = scene();
        if (typeof BattleRules === 'undefined' || !sc) return;
        const f = BattleRules.field || {};
        const key = JSON.stringify([f.weather?.type, f.terrain?.type, f.room?.type, f.hazards]);
        if (key === last) return;
        last = key;
        // Météo
        const w = weatherLayer(sc);
        w.className = f.weather ? `fw-${f.weather.type}` : '';
        // Champ et zone : classes sur la scène
        [...sc.classList].filter(c => c.startsWith('terrain-') || c.startsWith('room-')).forEach(c => sc.classList.remove(c));
        if (f.terrain) sc.classList.add(`terrain-${f.terrain.type}`);
        if (f.room) sc.classList.add(`room-${f.room.type}`);
        // Pièges de chaque camp
        ['player', 'enemy'].forEach(side => {
            const gridEl = document.getElementById(`${side}-grid`);
            if (!gridEl) return;
            const list = f.hazards?.[side] || [];
            const icons = [];
            list.forEach((h, k) => {
                const n = Math.min(SPOTS.length, 3 * Math.max(1, h.layers || 1));
                for (let i = 0; i < n; i++) {
                    const [x, y] = SPOTS[(i * 5 + k * 3) % SPOTS.length];
                    icons.push(`<span class="hz hz-${h.type}" style="left:${x}%;top:${y}%">${HAZARD_SVG[h.type] || ''}</span>`);
                }
            });
            hazardLayer(gridEl).innerHTML = icons.join('');
        });
    }
    // Nouveau combat : on repart d'un terrain propre
    function reset() { last = ''; update(); }

    return { update, reset };
})();
window.FieldFx = FieldFx;
