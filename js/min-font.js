/**
 * min-font.js - Taille de police minimale pour TOUS les textes du jeu.
 *
 * La scène fait 720 px de large et est réduite à environ la moitié sur téléphone :
 * un texte de 12 px dans le CSS y devient illisible. Ce script relève à MIN_FONT
 * (unités de la scène) tout texte plus petit, y compris ceux ajoutés en cours de jeu
 * (combat, fenêtres, notifications). Les textes masqués exprès (taille 0) et les
 * dessins SVG ne sont pas touchés.
 */
const MinFont = (() => {
    const MIN_FONT = 22; // ≈ 12 px réels sur un téléphone de 390 px de large
    const FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

    const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());

    function fixElement(el) {
        if (!(el instanceof HTMLElement) || el.closest('svg, .no-minfont')) return;
        if (!hasOwnText(el) && !FIELDS.has(el.tagName)) return;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size > 0 && size < MIN_FONT) el.style.setProperty('font-size', `${MIN_FONT}px`, 'important');
    }

    function fixTree(root) {
        if (!(root instanceof HTMLElement)) return;
        fixElement(root);
        root.querySelectorAll('*').forEach(fixElement);
    }

    // Les nouveaux éléments sont traités par lot, une fois par image
    let pending = new Set();
    let scheduled = false;
    function schedule(node) {
        const el = node.nodeType === 3 ? node.parentElement : node;
        if (el) pending.add(el);
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            const batch = pending;
            pending = new Set();
            scheduled = false;
            batch.forEach(fixTree);
        });
    }

    function start() {
        fixTree(document.body);
        new MutationObserver(records => records.forEach(r => {
            if (r.type === 'characterData') schedule(r.target);
            r.addedNodes.forEach(schedule);
        })).observe(document.body, { childList: true, subtree: true, characterData: true });
        // Les polices web changent parfois les tailles calculées : un second passage une fois chargées
        if (document.fonts?.ready) document.fonts.ready.then(() => fixTree(document.body));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    return { MIN_FONT, fixTree };
})();
