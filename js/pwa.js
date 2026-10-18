/**
 * pwa.js - Installation de PokéRoad en appli sur mobile (écran d'accueil, plein écran)
 * Enregistre le service worker (sw.js) et propose « Installer l'appli » dans les Paramètres :
 * - Android / Chrome : vraie fenêtre d'installation (événement beforeinstallprompt) ;
 * - iPhone / Safari : pas d'installation automatique, on explique Partager > Sur l'écran d'accueil.
 */
const PWA = (() => {
    let deferredPrompt = null;
    const isStandalone = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
    const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }

    function refresh() {
        const group = document.getElementById('install-group');
        if (!group) return;
        const btn = document.getElementById('install-app-btn');
        const hint = document.getElementById('install-hint');
        if (isStandalone()) { group.hidden = true; return; } // déjà installée
        if (deferredPrompt) {
            group.hidden = false; btn.hidden = false; hint.textContent = '';
        } else if (isIOS()) {
            group.hidden = false; btn.hidden = true;
            hint.textContent = "Sur iPhone : touche le bouton Partager de Safari, puis « Sur l'écran d'accueil ».";
        } else {
            group.hidden = true;
        }
    }

    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault(); // on garde la fenêtre pour le bouton des Paramètres
        deferredPrompt = event;
        refresh();
    });
    window.addEventListener('appinstalled', () => { deferredPrompt = null; refresh(); });
    document.addEventListener('DOMContentLoaded', refresh);

    async function install() {
        if (!deferredPrompt) return refresh();
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
        refresh();
    }

    return { install, refresh, isStandalone };
})();
