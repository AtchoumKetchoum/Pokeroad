/**
 * view-manager.js
 * Gère le passage entre les différentes "pages" (vues) du jeu sans rechargement.
 */

const ViewManager = (() => {
    const views = {
        home: 'view-home',
        battle: 'view-battle',
        pokedex: 'view-pokedex',
        labo: 'view-labo',
        center: 'view-center',
        worldmap: 'view-worldmap',
        modes: 'view-modes',
        atelier: 'view-atelier'
    };

    let currentView = null;

    function init() {
        // Cacher toutes les vues au démarrage sauf Home (ou selon l'URL/état)
        Object.values(views).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Déterminer la vue initiale
        const params = new URLSearchParams(window.location.search);
        const startView = params.get('view') || 'home';
        show(startView);
    }

    function show(viewName) {
        if (!views[viewName]) {
            console.error(`Vue inconnue : ${viewName}`);
            return;
        }

        console.log(`Transition vers la vue : ${viewName}`);

        // Cacher la vue actuelle
        // (la classe .active force l'affichage : on la retire de toutes les vues)
        Object.values(views).forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.classList.remove('active'); el.style.display = 'none'; }
        });

        // Afficher la nouvelle vue
        const newEl = document.getElementById(views[viewName]);
        if (newEl) {
            newEl.style.display = 'block';
            newEl.classList.add('active');
            currentView = viewName;
            
            // Mettre à jour le scaling immédiatement
            if (window.MobileManager) {
                window.MobileManager.updateScaling();
            }

            // Déclencher l'initialisation spécifique si nécessaire
            triggerViewInit(viewName);
        }
    }

    function triggerViewInit(viewName) {
        switch (viewName) {
            case 'home':
                if (window.initHome) window.initHome();
                break;
            case 'battle':
                // Les paramètres de combat peuvent être passés via un état global ou l'URL
                if (window.initBattle) window.initBattle();
                break;
            case 'pokedex':
                if (window.initPokedex) window.initPokedex();
                break;
            case 'labo':
                if (window.initLabo) window.initLabo();
                break;
            case 'center':
                if (window.initCenter) window.initCenter();
                break;
            case 'worldmap':
                if (window.initWorldmap) window.initWorldmap();
                break;
            case 'modes':
                if (window.initModes) window.initModes();
                break;
        }
    }

    return { init, show };
})();

document.addEventListener('DOMContentLoaded', () => {
    // Le ViewManager s'initialise après que les autres scripts soient chargés
    setTimeout(ViewManager.init, 10);
});
