/**
 * tips.js - Prise en main : une astuce courte la première fois qu'on ouvre chaque écran.
 *
 * Chaque écran (bourg, combat, Centre, entraînement, Atelier, Labo, boutique, sac, carte…)
 * a sa fiche d'explication, affichée une seule fois (mémorisée sur l'appareil).
 * Paramètres › « Revoir les astuces » les remet à zéro.
 */
const Tips = (() => {
    const KEY = 'pokeroad_tips_seen';
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { seen = {}; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* sans stockage */ } };
    const li = (items) => `<ul class="info-list">${items.map(t => `<li>${t}</li>`).join('')}</ul>`;

    const TIPS = {
        home: ['Bienvenue au bourg', li([
            'Les bâtiments vont du plus utilisé (en bas, sous le pouce) au moins utilisé (en haut).',
            '<b>Aventure</b> lance la route : des vagues de combats, avec un boss tous les 10 combats.',
            '<b>Appui long sur un Pokémon</b>, où qu\'il soit : sa fiche s\'ouvre.',
            'Une pastille rouge signale ce qui t\'attend (œufs prêts, missions terminées…).',
        ])],
        battle: ['Le combat', li([
            'Deux grilles de 3 × 3 : <b>avant</b>, <b>centre</b>, <b>arrière</b>. Les attaques au contact ne visent que la ligne avant.',
            'Chacun agit quand sa <b>jauge d\'action</b> est pleine (frise en haut). La <b>jauge Z</b> monte à chaque coup : à 100 %, l\'attaque Z part.',
            'Choisis une attaque, <b>appuie sur une cible</b> pour voir la zone touchée en rouge, <b>relâche</b> pour attaquer.',
            'Touche les synergies, le rang, une pastille de type ou une vignette d\'effet pour une explication. <b>Appui long sur une attaque</b> : sa fiche complète.',
        ])],
        center: ['Le Centre Pokémon', li([
            'La <b>Boîte</b> contient tous tes Pokémon. La pastille rouge d\'une vignette = des améliorations possibles tout de suite.',
            'Dans la fiche : <b>À faire</b>, les attaques (et les CT à apprendre), les objets tenus, l\'évolution.',
            'Chaque Pokémon porte 1 objet et 1 baie, puis 2 au Grade 3 et 3 au Grade 5.',
        ])],
        training: ['L\'entraînement', li([
            '<b>Niveau</b> : argent, bonbons ou Pokémon donnés en nourriture. Le niveau maximum dépend du Grade.',
            '<b>Grade</b> : +20 niveaux maximum et des emplacements d\'objets. <b>Étoiles</b> : +20 % sur toutes les stats.',
            '<b>IV, EV, nature, capacités</b> : chacun monte par niveaux, avec un palier (étoile) tous les 20 niveaux.',
            'Les paliers ★3 et plus demandent des objets de déblocage (Morceau d\'Étoile, Fragment Comète, Couronne Antique) gagnés sur les boss.',
        ])],
        workshop: ['L\'Atelier', li([
            'Améliore un <b>objet tenu</b> ou une <b>baie</b> pour <b>tous ses exemplaires</b>, présents et futurs.',
            'Chaque niveau coûte de l\'argent et des exemplaires de l\'objet ; un palier tous les 20 niveaux.',
            'La valeur de l\'effet grandit avec le niveau, jusqu\'à un plafond.',
        ])],
        labo: ['Le Laboratoire', li([
            'Place les œufs dans les <b>incubateurs</b> : plus l\'œuf est rare, plus il est long à éclore.',
            'Recycle les œufs en double contre de l\'argent. D\'autres incubateurs s\'achètent à la boutique.',
        ])],
        shop: ['La boutique', li([
            'Les poches en bas : œufs et incubateurs, baies, CT, objets de combat (triés par famille)…',
            'Une <b>CT</b> apprend une attaque et sert aussi à améliorer les attaques de son type.',
        ])],
        bag: ['Le sac', li([
            'Touche un objet pour son effet, l\'améliorer à l\'Atelier ou le vendre.',
            '<b>Vendre les doublons</b> garde un exemplaire de chaque objet de la poche.',
        ])],
        worldmap: ['La carte', li([
            'Chaque zone a 10 vagues de 10 combats. Le rang (Bronze, Argent…) indique sa difficulté.',
            'Les boss donnent les objets de déblocage des paliers.',
        ])],
    };

    function show(key, force = false) {
        if (!TIPS[key] || (seen[key] && !force) || typeof InfoModal === 'undefined') return;
        seen[key] = true; save();
        const [title, html] = TIPS[key];
        InfoModal.open({ title: `Astuce · ${title}`, html, actions: [{ label: 'Compris', run: () => InfoModal.close() }] });
    }
    function reset() { seen = {}; save(); alert('Les astuces s\'afficheront de nouveau à la première visite de chaque écran.'); }

    // Écrans : vue active ; fenêtres : affichées
    const VIEWS = { 'view-home': 'home', 'view-battle': 'battle', 'view-center': 'center', 'view-labo': 'labo', 'view-worldmap': 'worldmap', 'view-atelier': 'workshop' };
    const MODALS = { 'shop-modal': 'shop', 'item-bag-modal': 'bag' };
    let pending = null;
    function check() {
        clearTimeout(pending);
        pending = setTimeout(() => {
            if (document.querySelector('.title-screen:not([hidden])') && getComputedStyle(document.querySelector('.title-screen')).display !== 'none') return;
            if (document.getElementById('info-modal')?.style.display === 'flex') return;
            for (const [id, key] of Object.entries(MODALS)) { const m = document.getElementById(id); if (m && m.style.display === 'flex') { show(key); return; } }
            const ref = document.getElementById('refinement-modal');
            if (ref && ref.style.display === 'flex') { show(/Entraînement/.test(ref.querySelector('h2')?.textContent || '') ? 'training' : 'workshop'); return; }
            const active = document.querySelector('.spa-view.active');
            if (active && VIEWS[active.id]) show(VIEWS[active.id]);
        }, 600);
    }
    function init() {
        const mo = new MutationObserver(check);
        document.querySelectorAll('.spa-view, .modal').forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));
        // Fenêtres créées plus tard (Atelier / entraînement)
        new MutationObserver(() => { const r = document.getElementById('refinement-modal'); if (r && !r.__tipsObserved) { r.__tipsObserved = true; mo.observe(r, { attributes: true, attributeFilter: ['style'] }); } }).observe(document.body, { childList: true, subtree: true });
        document.addEventListener('click', check, true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { show, reset };
})();
window.Tips = Tips;
