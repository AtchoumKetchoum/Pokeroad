/**
 * tips.js - Prise en main : une visite guidée la première fois qu'on ouvre chaque écran.
 *
 * L'écran s'assombrit, un projecteur éclaire un élément à la fois et une bulle l'explique
 * (Suivant / Passer, compteur d'étapes). Les étapes dont l'élément n'est pas affiché sont sautées.
 * Chaque visite n'est montrée qu'une fois (mémorisé sur l'appareil) ;
 * Paramètres › « Revoir les astuces » les remet à zéro.
 */
const Tips = (() => {
    const KEY = 'pokeroad_tips_seen';
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { seen = {}; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch { /* sans stockage */ } };

    // [sélecteur (null = bulle au centre), titre, texte]
    const TOURS = {
        home: [
            [null, 'Bienvenue au bourg', 'Une petite visite pour trouver tes repères. Tu peux la passer à tout moment.'],
            ['.hub-adventure', 'L\'aventure', 'Lance la route : des vagues de combats, avec un boss tous les 10 combats.'],
            ['.hub-building[data-building="center"]', 'Centre Pokémon', 'Tous tes Pokémon. Une pastille rouge sur une vignette : une amélioration faisable tout de suite.'],
            ['.hub-building[data-building="dojo"]', 'Entraînement', 'Monte le niveau, le Grade, les IV, les EV, la nature et les attaques de tes Pokémon.'],
            ['.hub-building[data-building="atelier"]', 'Atelier', 'Améliore tes objets tenus et tes baies, pour tous leurs exemplaires.'],
            ['.hub-building[data-building="shop"]', 'Boutique', 'Œufs, incubateurs, baies, CT et objets de combat.'],
            ['.hub-building[data-building="labo"]', 'Laboratoire', 'Fais éclore tes œufs dans les incubateurs.'],
            ['.hub-dock', 'Pokédex et sacs', 'Ton Pokédex, tes œufs et tes objets, toujours sous le pouce.'],
            [null, 'Deux gestes utiles', '<b>Appui long sur un Pokémon</b>, où qu\'il soit : sa fiche s\'ouvre.<br><b>Survole ou touche une icône</b> en combat : une bulle l\'explique.'],
        ],
        'battle-prep': [
            ['#player-grid', 'Ton équipe', 'Une grille de 3 × 3, cases 1 à 9 (1-2-3 devant). Ta colonne fait face à la colonne ennemie : au contact, tu frappes le premier ennemi de ta colonne ; à distance, ta colonne et les voisines.'],
            ['#enemy-grid', 'Les adversaires', 'Leur placement compte aussi : protège tes Pokémon fragiles derrière.'],
            ['#selection-banner', 'Composer l\'équipe', 'Touche un Pokémon pour le placer ou le retirer.'],
            ['#start-battle-btn', 'C\'est parti', 'Lance le combat quand ton équipe est prête.'],
        ],
        battle: [
            ['#turnOrderSidebar', 'Ordre des tours', 'Chacun agit quand sa jauge d\'action est pleine. La jauge Z monte à chaque coup : à 100 %, l\'attaque Z part.'],
            ['#movesRow', 'Tes attaques', 'Choisis une attaque, appuie sur une cible pour voir la zone touchée, relâche pour attaquer. Appui long (ou survol) : le détail de l\'attaque.'],
            ['#view-battle .synergy-panel.synergy-player', 'Synergies', 'Plusieurs Pokémon du même type renforcent leurs attaques de ce type. Touche l\'icône pour le détail.'],
            ['#view-battle .status-icons', 'Effets', 'Bleu : un bonus. Rouge : un malus. Touche une vignette pour savoir ce qu\'elle fait.'],
            ['.speed-controls', 'Vitesse', 'Accélère le combat ou laisse-le se jouer tout seul.'],
        ],
        center: [
            ['#pokemon-list', 'Ta boîte', 'Touche un Pokémon pour sa fiche. La pastille rouge et les petites icônes montrent ce que tu peux améliorer tout de suite.'],
            ['#center-sidebar', 'Trier et filtrer', 'Retrouve vite un Pokémon par type, rareté ou niveau.'],
            [null, 'Dans la fiche', 'La section <b>À faire</b> regroupe les améliorations possibles. Chaque Pokémon porte 1 objet et 1 baie, puis 2 au Grade 3 et 3 au Grade 5.'],
        ],
        training: [
            ['#refinement-modal .pokemon-grid', 'Choisis un Pokémon', 'Toute l\'amélioration se fait Pokémon par Pokémon.'],
            ['#refinement-modal .refinement-options', 'Ce qui se monte', 'Niveau, Grade, IV, EV, nature, attaques : chacun par niveaux, avec un palier (étoile) tous les 20 niveaux.'],
            ['#refinement-modal .cost-display', 'Le coût', 'De plus en plus cher. Dès ★3, il faut aussi un objet de déblocage gagné sur les boss.'],
        ],
        workshop: [
            ['#view-atelier .atelier-card', 'Améliorer les objets', 'Un niveau d\'objet vaut pour tous ses exemplaires, présents et futurs.'],
            ['#refinement-modal .refinement-content', 'Niveaux et paliers', 'Chaque niveau coûte de l\'argent et des exemplaires de l\'objet. L\'effet grandit jusqu\'à un plafond.'],
        ],
        labo: [
            ['#view-labo .lab-column', 'Incubateur', 'Place un œuf : plus il est rare, plus il est long à éclore.'],
            ['#view-labo .lab-column:nth-child(2)', 'Sac d\'œufs', 'Choisis les œufs à incuber, ou recycle les doublons contre de l\'argent.'],
        ],
        shop: [
            ['#shop-pockets', 'Les poches', 'Œufs et incubateurs, baies, CT, objets de combat…'],
            ['#shop-families', 'Les familles', 'Les objets de combat sont rangés par famille : attaque, défense, soin…'],
            ['#shop-grid', 'Acheter', 'Touche un objet pour son effet et son prix. Une CT apprend une attaque et améliore les attaques de son type.'],
        ],
        bag: [
            ['#item-bag-pockets', 'Les poches', 'Tes objets, rangés comme à la boutique.'],
            ['#item-bag-grid', 'Tes objets', 'Touche un objet pour son effet, l\'améliorer à l\'Atelier ou le vendre.'],
            ['#bag-sell-dupes', 'Recyclage', 'Vend les doublons de la poche et garde un exemplaire de chaque objet.'],
        ],
        worldmap: [
            ['#map-container', 'La carte', 'Chaque zone a 10 vagues de 10 combats. Le rang indique sa difficulté.'],
            [null, 'Les boss', 'Ils donnent les objets de déblocage des paliers : Morceau d\'Étoile, Fragment Comète, Couronne Antique.'],
        ],
    };

    // --- Affichage ---
    let layer = null, steps = [], idx = 0, current = null, screen = null;
    function visible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== 'hidden';
    }
    function build() {
        layer = document.createElement('div');
        layer.className = 'tour-layer no-minfont';
        layer.innerHTML = `<div class="tour-spot"></div>
            <div class="tour-card" role="dialog" aria-live="polite">
                <div class="tour-dots"></div>
                <h3 class="tour-title"></h3>
                <div class="tour-text"></div>
                <div class="tour-actions"><button class="tour-skip">Passer</button><button class="tour-next">Suivant</button></div>
            </div>`;
        layer.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            if (e.target.closest('.tour-skip')) end();
            else if (e.target.closest('.tour-next') || !e.target.closest('.tour-card')) next();
        }, true);
        ['pointerdown', 'pointerup', 'touchstart'].forEach(t => layer.addEventListener(t, (e) => e.stopPropagation()));
        document.body.appendChild(layer);
        window.addEventListener('resize', () => { if (layer?.classList.contains('on')) render(); });
        document.addEventListener('keydown', (e) => {
            if (!layer?.classList.contains('on')) return;
            if (e.key === 'Escape') end();
            else if (e.key === 'Enter' || e.key === 'ArrowRight') next();
        });
    }
    function render() {
        const [sel, title, text] = steps[idx];
        const el = sel ? [...document.querySelectorAll(sel)].find(visible) : null;
        const spot = layer.querySelector('.tour-spot'), card = layer.querySelector('.tour-card');
        layer.querySelector('.tour-dots').innerHTML = steps.length > 1 ? steps.map((_, i) => `<i class="${i === idx ? 'on' : i < idx ? 'done' : ''}"></i>`).join('') + `<span>${idx + 1} / ${steps.length}</span>` : '';
        layer.querySelector('.tour-title').textContent = title;
        layer.querySelector('.tour-text').innerHTML = text;
        layer.querySelector('.tour-next').textContent = idx === steps.length - 1 ? 'Compris' : 'Suivant';
        layer.classList.toggle('centered', !el);
        const W = window.innerWidth, H = window.innerHeight, m = 12;
        if (!el) {
            spot.style.cssText = `left:${W / 2}px;top:${H / 2}px;width:0;height:0`;
            card.style.left = `${Math.max(m, (W - card.offsetWidth) / 2)}px`;
            card.style.top = `${Math.max(m, (H - card.offsetHeight) / 2)}px`;
            return;
        }
        const r = el.getBoundingClientRect(), pad = 6;
        const box = { l: Math.max(4, r.left - pad), t: Math.max(4, r.top - pad), r: Math.min(W - 4, r.right + pad), b: Math.min(H - 4, r.bottom + pad) };
        spot.style.cssText = `left:${box.l}px;top:${box.t}px;width:${box.r - box.l}px;height:${box.b - box.t}px`;
        // La bulle va là où il y a le plus de place, au-dessus ou en dessous
        const cw = card.offsetWidth, ch = card.offsetHeight;
        const below = H - box.b >= box.t;
        let top = below ? box.b + 14 : box.t - ch - 14;
        top = Math.max(m, Math.min(H - ch - m, top));
        const left = Math.max(m, Math.min(W - cw - m, (box.l + box.r) / 2 - cw / 2));
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
        card.classList.toggle('below', below);
        card.style.setProperty('--arrow-x', `${Math.max(18, Math.min(cw - 18, (box.l + box.r) / 2 - left))}px`);
    }
    function next() {
        idx++;
        if (idx >= steps.length) { end(); return; }
        render();
    }
    function end() {
        layer?.classList.remove('on');
        current = null;
        setTimeout(check, 300); // un autre écran a pu s'ouvrir pendant la visite
    }

    function start(key, force = false) {
        if (!TOURS[key] || current || (seen[key] && !force)) return false;
        // Seulement les étapes visibles maintenant (les bulles au centre restent)
        steps = TOURS[key].filter(([sel]) => !sel || [...document.querySelectorAll(sel)].some(visible));
        if (!steps.some(([sel]) => sel)) return false; // l'écran n'est pas encore prêt
        seen[key] = true; save();
        if (!layer) build();
        if (typeof InfoTip !== 'undefined') InfoTip.hide();
        current = key; idx = 0; screen = screenId();
        layer.classList.add('on');
        render();
        requestAnimationFrame(render); // la bulle connaît sa taille après le premier rendu
        return true;
    }
    const show = start;
    function reset() {
        seen = {}; save();
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('Les visites guidées reviendront à la première ouverture de chaque écran.');
        setTimeout(check, 400);
    }

    // Écrans : vue active ; fenêtres : affichées
    const VIEWS = { 'view-home': 'home', 'view-center': 'center', 'view-labo': 'labo', 'view-worldmap': 'worldmap', 'view-atelier': 'workshop' };
    const MODALS = { 'shop-modal': 'shop', 'item-bag-modal': 'bag' };
    let pending = null;
    // L'écran (ou la fenêtre) affiché : la visite s'arrête si on le quitte
    function screenId() {
        const open = [...document.querySelectorAll('.modal')].filter(m => m.style.display === 'flex').map(m => m.id).join(',');
        return `${document.querySelector('.spa-view.active')?.id || ''}|${open}`;
    }
    function check() {
        if (current && screenId() !== screen) { layer.classList.remove('on'); current = null; }
        clearTimeout(pending);
        pending = setTimeout(() => {
            if (current) return;
            const title = document.querySelector('.title-screen');
            if (title && !title.hidden && getComputedStyle(title).display !== 'none') return;
            if (document.getElementById('info-modal')?.style.display === 'flex') return;
            for (const [id, key] of Object.entries(MODALS)) { const m = document.getElementById(id); if (m && m.style.display === 'flex') { start(key); return; } }
            const ref = document.getElementById('refinement-modal');
            if (ref && ref.style.display === 'flex') { start(/Entraînement/.test(ref.querySelector('h2')?.textContent || '') ? 'training' : 'workshop'); return; }
            if (document.querySelector('.modal[style*="flex"]')) return; // une autre fenêtre est ouverte
            const active = document.querySelector('.spa-view.active');
            if (!active) return;
            if (active.id === 'view-battle') {
                if (visible(document.getElementById('start-battle-btn'))) start('battle-prep');
                else if (document.querySelector('#movesRow .move-btn')) start('battle'); // attend que les attaques soient là
                return;
            }
            if (VIEWS[active.id]) start(VIEWS[active.id]);
        }, 700);
    }
    function init() {
        const mo = new MutationObserver(check);
        document.querySelectorAll('.spa-view, .modal').forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));
        // Fenêtres créées plus tard (Atelier / entraînement) et attaques qui apparaissent en combat
        new MutationObserver(() => {
            const r = document.getElementById('refinement-modal');
            if (r && !r.__tipsObserved) { r.__tipsObserved = true; mo.observe(r, { attributes: true, attributeFilter: ['style'] }); }
        }).observe(document.body, { childList: true, subtree: true });
        const moves = document.getElementById('movesRow');
        if (moves) new MutationObserver(check).observe(moves, { childList: true });
        document.addEventListener('click', check, true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { show, start, reset };
})();
window.Tips = Tips;
