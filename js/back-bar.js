/**
 * back-bar.js - Le bouton de retour des écrans (Centre, Labo, Pokédex, Atelier, cartes)
 * devient une grande barre « Retour » en bas, sous le pouce, comme dans les fenêtres.
 * Le bouton est simplement déplacé en fin d'écran : son action d'origine est conservée.
 * Le combat garde son bouton « Carte » en haut.
 */
(() => {
    function start() {
        document.querySelectorAll('.spa-view:not(#view-battle) .scaler-view').forEach(view => {
            const btn = view.querySelector('.view-bar .exit-btn, .map-header .exit-btn');
            if (!btn) return;
            btn.classList.add('view-back-btn');
            view.appendChild(btn);
            view.classList.add('has-back-bar');
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
