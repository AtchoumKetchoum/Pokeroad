/**
 * long-press.js - Appui long sur un Pokémon, n'importe où : sa fiche s'ouvre.
 *
 * Tout élément portant data-instance-id (Centre, combat, missions, entraînement…) réagit.
 * La fiche (#center-pokemon-detail-modal) est sortie de l'écran du Centre au démarrage
 * pour pouvoir s'afficher par-dessus n'importe quel écran.
 * Un appui long n'enclenche pas le clic habituel (sélection, attaque…).
 */
const PokeSheet = (() => {
    const DELAY = 450;   // ms avant ouverture
    const SLOP = 12;     // px de tolérance avant d'annuler (défilement)
    let timer = null, start = null, target = null, fired = false;

    // La fiche s'affiche au-dessus de tous les écrans
    function hoist() {
        const sheet = document.getElementById('center-pokemon-detail-modal');
        const anchor = document.getElementById('refinement-modal');
        if (sheet && anchor && sheet.parentElement !== anchor.parentElement) anchor.parentElement.insertBefore(sheet, anchor);
    }

    // Ouvre la fiche d'un Pokémon du joueur (les capacités sont chargées si besoin)
    async function open(instanceId) {
        const pk = GameData.getPokemons().find(p => p.instanceId === instanceId);
        if (!pk || typeof openPokemonDetail !== 'function') return;
        if (typeof MOVES_FR !== 'undefined' && (!MOVES_FR || !Object.keys(MOVES_FR).length) && typeof loadMovesDB === 'function') {
            MOVES_FR = (await loadMovesDB()) || {};
        }
        hoist();
        openPokemonDetail(pk);
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive) { try { navigator.vibrate(15); } catch { /* sans vibration */ } }
    }

    function cancel() {
        clearTimeout(timer); timer = null;
        target?.classList.remove('lp-pressing');
        target = null;
    }

    function onDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        const el = e.target.closest('[data-instance-id]');
        if (!el || el.matches('.timer')) return;
        // Une case de la grille ennemie n'a pas de fiche ; un Pokémon du joueur si
        const id = el.dataset.instanceId;
        if (!id || !GameData.getPokemons().some(p => p.instanceId === id)) return;
        cancel();
        fired = false;
        target = el; start = { x: e.clientX, y: e.clientY };
        el.classList.add('lp-pressing');
        timer = setTimeout(() => { fired = true; target?.classList.remove('lp-pressing'); open(id); target = null; }, DELAY);
    }
    function onMove(e) {
        if (!timer || !start) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) cancel();
    }
    // Après un appui long, le relâchement ne doit pas déclencher le clic de l'élément
    function onClickCapture(e) {
        if (!fired) return;
        fired = false;
        e.stopPropagation(); e.preventDefault();
    }

    function init() {
        hoist();
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', () => { if (timer) cancel(); }, true);
        document.addEventListener('pointercancel', cancel, true);
        document.addEventListener('click', onClickCapture, true);
        // Pas de menu contextuel du navigateur sur un Pokémon (appui long sur mobile)
        document.addEventListener('contextmenu', e => { if (e.target.closest('[data-instance-id]')) e.preventDefault(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { open };
})();
window.PokeSheet = PokeSheet;
