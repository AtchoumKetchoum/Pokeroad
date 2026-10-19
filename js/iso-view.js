/**
 * iso-view.js - Vue du combat : iso léger, la seule vue.
 *
 * Le sol des deux grilles est incliné en perspective (lignes horizontales) ; les deux grilles
 * tournent autour d'un même point, comme un seul plateau.
 * Les Pokémon et leurs infos restent face à l'écran (rotation inverse, « billboard »).
 */
const IsoView = (() => {
    const MODES = { light: { label: 'Iso léger', tilt: 34, spin: 0, scale: 0.82 } };
    const mode = 'light';
    try { localStorage.removeItem('pokeroad_battle_view'); } catch { /* sans stockage */ }

    const screen = () => document.querySelector('#view-battle .scaler-view');
    const grids = () => ['enemy-grid', 'player-grid'].map(id => document.getElementById(id)).filter(Boolean);

    // Rotation inverse en un seul axe-angle (propriété CSS « rotate ») : Rz(-spin) · Rx(-tilt)
    function billboard(tiltDeg, spinDeg) {
        const t = -tiltDeg * Math.PI / 180, s = -spinDeg * Math.PI / 180;
        // Quaternions : qz(s) * qx(t)
        const qz = [Math.cos(s / 2), 0, 0, Math.sin(s / 2)];
        const qx = [Math.cos(t / 2), Math.sin(t / 2), 0, 0];
        const [w1, x1, y1, z1] = qz, [w2, x2, y2, z2] = qx;
        const w = w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2;
        const x = w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2;
        const y = w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2;
        const z = w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2;
        const angle = 2 * Math.acos(Math.max(-1, Math.min(1, w))) * 180 / Math.PI;
        const n = Math.hypot(x, y, z) || 1;
        return `${(x / n).toFixed(4)} ${(y / n).toFixed(4)} ${(z / n).toFixed(4)} ${angle.toFixed(2)}deg`;
    }

    function apply() {
        const sc = screen();
        if (!sc) return;
        if (typeof FloorRing !== 'undefined') requestAnimationFrame(FloorRing.refreshAll); // anneaux recalés sur les ronds
        sc.classList.add('view-light');
        sc.classList.remove('view-classic', 'view-iso');
        const gs = grids();
        const cfg = MODES[mode];
        // Centre commun aux deux grilles (coordonnées de la scène, avant transformation)
        const boxes = gs.map(g => ({ g, x: g.offsetLeft, y: g.offsetTop, w: g.offsetWidth, h: g.offsetHeight }));
        const top = Math.min(...boxes.map(b => b.y)), bottom = Math.max(...boxes.map(b => b.y + b.h));
        const left = Math.min(...boxes.map(b => b.x)), right = Math.max(...boxes.map(b => b.x + b.w));
        const cx = (left + right) / 2, cy = (top + bottom) / 2;
        const place = (dx, dy) => boxes.forEach(b => {
            b.g.style.transformOrigin = `${cx - b.x}px ${cy - b.y}px`;
            b.g.style.transform = `translate(${dx}px, ${dy}px) scale(${cfg.scale}) rotateX(${cfg.tilt}deg) rotateZ(${cfg.spin}deg)`;
        });
        place(0, 0);
        sc.style.setProperty('--iso-billboard', billboard(cfg.tilt, cfg.spin));
        // Perspective centrée sur le plateau (iso léger)
        sc.style.perspectiveOrigin = `${cx}px ${cy}px`;
        // Recentrage : le plateau transformé est replacé au centre de la zone de jeu
        const slots = gs.flatMap(g => [...g.querySelectorAll('.unit-slot')]).map(el => el.getBoundingClientRect());
        const scr = sc.getBoundingClientRect();
        if (slots.length && scr.width) {
            const k = sc.offsetWidth / scr.width; // pixels d'écran → pixels de scène
            const midX = (Math.min(...slots.map(r => r.left)) + Math.max(...slots.map(r => r.right))) / 2;
            const midY = (Math.min(...slots.map(r => r.top)) + Math.max(...slots.map(r => r.bottom))) / 2;
            const gridMidY = scr.top + (cy / sc.offsetHeight) * scr.height;
            place((scr.left + scr.width / 2 - midX) * k, (gridMidY - midY) * k);
        }
    }

    function init() {
        document.getElementById('battle-view-btn')?.remove();
        apply();
        // Les grilles bougent avec la taille de la scène : on recalcule le centre
        window.addEventListener('resize', () => requestAnimationFrame(apply));
        const sc = screen();
        if (sc && 'ResizeObserver' in window) new ResizeObserver(() => apply()).observe(sc);
        // À l'affichage du combat (changement d'écran)
        document.addEventListener('click', () => setTimeout(apply, 0), { capture: true, passive: true, once: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { apply, get mode() { return mode; }, MODES };
})();
window.IsoView = IsoView;
