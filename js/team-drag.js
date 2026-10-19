/**
 * team-drag.js - Placer ses Pokémon avant le combat en les soulevant, au doigt comme à la souris.
 *
 * Le glisser-déposer natif ne marche pas au toucher et se perd sur le plateau incliné :
 * ici, on suit le pointeur. On appuie sur un Pokémon, on bouge : il se soulève et suit le doigt,
 * la case visée s'allume ; on relâche pour le poser (échange si la case est occupée).
 * Un simple toucher garde son action (retirer le Pokémon du terrain).
 */
const TeamDrag = (() => {
    let st = null, ghost = null, over = null, swallowClick = false;
    const inCombat = () => document.body.classList.contains('combat-active');
    const slotAt = (x, y) => document.elementFromPoint(x, y)?.closest('#player-grid .unit-slot') || null;

    function makeGhost(unit) {
        const g = document.createElement('div');
        g.className = 'team-drag-ghost no-minfont';
        const frame = unit.querySelector('.pmd-sprite[data-pmd-state="ready"] .pmd-frame');
        const canvas = frame && typeof drawFrameToCanvas === 'function' ? drawFrameToCanvas(frame, 3) : null;
        if (canvas) g.appendChild(canvas);
        else {
            const img = unit.querySelector('img');
            if (img) { const c = img.cloneNode(); c.style.cssText = 'width:96px;height:96px;object-fit:contain'; g.appendChild(c); }
        }
        document.body.appendChild(g);
        return g;
    }
    function moveGhost(x, y) { if (ghost) ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -70%)`; }
    function highlight(slot) {
        if (over === slot) return;
        over?.classList.remove('drag-over');
        over = slot && slot !== st?.unit.parentElement ? slot : null;
        over?.classList.add('drag-over');
    }

    function onDown(e) {
        if (e.button > 0 || inCombat()) return;
        const unit = e.target.closest('#player-grid .unit');
        if (!unit) return;
        unit.draggable = false; // pas de glisser natif en parallèle
        st = { unit, id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
    }
    function onMove(e) {
        if (!st || e.pointerId !== st.id) return;
        if (!st.dragging) {
            if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 10) return;
            st.dragging = true;
            st.unit.classList.add('is-dragging');
            document.body.classList.add('team-dragging');
            ghost = makeGhost(st.unit);
            if (typeof InfoTip !== 'undefined') InfoTip.hide();
        }
        e.preventDefault();
        moveGhost(e.clientX, e.clientY);
        highlight(slotAt(e.clientX, e.clientY));
    }
    function end(e, cancel) {
        if (!st || (e && e.pointerId !== st.id)) return;
        if (st.dragging) {
            const target = !cancel && e ? slotAt(e.clientX, e.clientY) : null;
            const from = st.unit.parentElement;
            if (target && target !== from) {
                const existing = target.querySelector('.unit');
                if (existing) from.appendChild(existing); // échange
                target.appendChild(st.unit);
                if (typeof FormationUI !== 'undefined') FormationUI.refresh();
            }
            st.unit.classList.remove('is-dragging');
            document.body.classList.remove('team-dragging');
            ghost?.remove(); ghost = null;
            highlight(null);
            swallowClick = true; // le relâchement ne doit pas compter comme un toucher
            setTimeout(() => { swallowClick = false; }, 0);
        }
        st = null;
    }
    function onClick(e) {
        if (swallowClick && e.target.closest('#player-grid')) { e.stopPropagation(); e.preventDefault(); swallowClick = false; }
    }

    function init() {
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('pointermove', onMove, { capture: true, passive: false });
        document.addEventListener('pointerup', (e) => end(e, false), true);
        document.addEventListener('pointercancel', (e) => end(e, true), true);
        document.addEventListener('click', onClick, true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return {};
})();
window.TeamDrag = TeamDrag;
