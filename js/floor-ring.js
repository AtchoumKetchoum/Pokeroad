/**
 * floor-ring.js - Les jauges d'un Pokémon en combat dessinées sur le rond au sol de sa case.
 *
 *  - anneau extérieur (sur le bord du rond) : les PV (vert, jaune, rouge), qui se vident de l'arrière vers l'avant ;
 *  - liseré clair par-dessus : le bouclier ;
 *  - anneau intérieur : jauge d'action à gauche, jauge Z à droite.
 * L'anneau reprend exactement la place du rond de la case (son ::before), dans toutes les vues.
 * Les barres d'origine (.hp-fill, .ap-fill, .z-fill, .hp-shield) restent la source : on les observe
 * et l'anneau suit, sans toucher au moteur de combat.
 */
const FloorRing = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    // Repère 0-100 étiré sur le rond : le trait garde son épaisseur (non-scaling-stroke)
    const half = (rx, ry, side) => `M 50 ${50 + ry} A ${rx} ${ry} 0 0 ${side === 'left' ? 1 : 0} 50 ${50 - ry}`;
    const RINGS = { hp: [48.4, 46], shield: [48.4, 46], gauge: [38, 30] };

    function build() {
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'floor-ring');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        const [hx, hy] = RINGS.hp, [sx, sy] = RINGS.shield, [gx, gy] = RINGS.gauge;
        svg.innerHTML = `
            <ellipse class="fr-track" cx="50" cy="50" rx="${hx}" ry="${hy}"/>
            <ellipse class="fr-track fr-track-in" cx="50" cy="50" rx="${gx}" ry="${gy}"/>
            <path class="fr-hp" pathLength="100" d="${half(hx, hy, 'left')}"/>
            <path class="fr-hp" pathLength="100" d="${half(hx, hy, 'right')}"/>
            <path class="fr-shield" pathLength="100" d="${half(sx, sy, 'left')}"/>
            <path class="fr-shield" pathLength="100" d="${half(sx, sy, 'right')}"/>
            <path class="fr-ap" pathLength="100" d="${half(gx, gy, 'left')}"/>
            <path class="fr-z" pathLength="100" d="${half(gx, gy, 'right')}"/>`;
        return svg;
    }
    const pct = (el) => (el ? Math.max(0, Math.min(100, parseFloat(el.style.width) || 0)) : 0);
    const dash = (paths, v) => paths.forEach(p => p.setAttribute('stroke-dasharray', `${v} 100`));

    // Même place que le rond de la case
    function place(slot, svg) {
        const cs = getComputedStyle(slot, '::before');
        ['left', 'right', 'top', 'bottom', 'width', 'height'].forEach(k => { svg.style[k] = cs[k]; });
        svg.style.transform = cs.transform === 'none' ? '' : cs.transform;
    }
    function sync(slot, box, svg) {
        place(slot, svg);
        const hpFill = box.querySelector('.hp-fill');
        const hp = hpFill ? (hpFill.style.width ? pct(hpFill) : 100) : 0;
        dash(svg.querySelectorAll('.fr-hp'), hp);
        // Seuils : jaune sous 50 %, rouge sous 25 % (et l'anneau pulse)
        svg.classList.toggle('mid', hp < 50 && hp >= 25);
        svg.classList.toggle('low', hp < 25);
        dash(svg.querySelectorAll('.fr-shield'), pct(box.querySelector('.hp-shield')));
        dash(svg.querySelectorAll('.fr-ap'), pct(box.querySelector('.ap-fill')));
        const z = pct(box.querySelector('.z-fill'));
        dash(svg.querySelectorAll('.fr-z'), z);
        svg.classList.toggle('z-full', z >= 100);
    }

    function attach(unitEl) {
        const box = unitEl?.querySelector('.hp-box');
        const slot = unitEl?.closest('.unit-slot');
        if (!box || !slot) return;
        let svg = slot.querySelector(':scope > .floor-ring');
        if (svg && svg.__box === box) { sync(slot, box, svg); return; }
        if (!svg) { svg = build(); slot.prepend(svg); }
        // Case réattribuée (Pokémon déplacé) : on suit le nouveau
        svg.__observer?.disconnect();
        svg.__box = box;
        let queued = false;
        const update = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync(slot, box, svg); }); };
        svg.__observer = new MutationObserver(update);
        svg.__observer.observe(box, { subtree: true, attributes: true, attributeFilter: ['style', 'class'], childList: true });
        sync(slot, box, svg);
    }
    // Changement de vue (iso, légère…) ou de taille : on recale tous les anneaux
    function refreshAll() {
        document.querySelectorAll('.unit-slot > .floor-ring').forEach(svg => { if (svg.__box) sync(svg.parentElement, svg.__box, svg); });
    }
    window.addEventListener('resize', () => requestAnimationFrame(refreshAll));

    return { attach, refreshAll };
})();
window.FloorRing = FloorRing;
