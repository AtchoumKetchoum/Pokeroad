/**
 * ui.js - Notifications et confirmations dans le style du jeu
 * Remplace les alert() / confirm() natifs du navigateur.
 */

const UI = (() => {
    const ERROR_HINT = /pas assez|impossible|erreur|échou|introuvable|aucun|déjà|doit|vous devez|non trouvé|invalide|pas prêt|insuffisant/i;
    const SUCCESS_HINT = /félicitations|acheté|réussi|succès|évolué|éclore|placé|obtenu|récupér|amélior|bravo|sauvegard/i;

    function stack() {
        let el = document.getElementById('toast-stack');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast-stack';
            document.body.appendChild(el);
        }
        return el;
    }

    function guessType(message) {
        if (ERROR_HINT.test(message)) return 'error';
        if (SUCCESS_HINT.test(message)) return 'success';
        return 'info';
    }

    function toast(message, type) {
        const text = String(message ?? '');
        const kind = type || guessType(text);
        const iconName = kind === 'error' ? 'close' : (kind === 'success' ? 'check' : 'star');
        const el = document.createElement('div');
        el.className = `toast ${kind}`;
        el.innerHTML = `<span class="toast-icon">${Art.icon(iconName, 18)}</span><span class="toast-text"></span>`;
        el.querySelector('.toast-text').textContent = text;
        el.addEventListener('click', () => dismiss(el));
        stack().appendChild(el);
        const life = Math.min(7000, 2200 + text.length * 35);
        setTimeout(() => dismiss(el), life);
        return el;
    }

    function dismiss(el) {
        if (!el.isConnected || el.classList.contains('leaving')) return;
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 220);
    }

    // Promesse résolue à true (Confirmer) ou false (Annuler)
    function confirm(message, { okLabel = 'Confirmer', cancelLabel = 'Annuler', title = 'Confirmation' } = {}) {
        return new Promise(resolve => {
            let modal = document.getElementById('confirm-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'confirm-modal';
                modal.innerHTML = `<div class="modal-content"><h2></h2><div class="confirm-text"></div>
                    <div class="confirm-actions"><button class="btn-pop" data-answer="no"></button><button class="btn-pop red" data-answer="yes"></button></div></div>`;
                document.body.appendChild(modal);
            }
            modal.querySelector('h2').textContent = title;
            modal.querySelector('.confirm-text').textContent = message;
            modal.querySelector('[data-answer="no"]').textContent = cancelLabel;
            modal.querySelector('[data-answer="yes"]').textContent = okLabel;
            modal.classList.add('open');
            const onClick = (e) => {
                const answer = e.target.closest('[data-answer]')?.dataset.answer;
                if (!answer && e.target !== modal) return;
                modal.classList.remove('open');
                modal.removeEventListener('click', onClick);
                resolve(answer === 'yes');
            };
            modal.addEventListener('click', onClick);
        });
    }

    return { toast, confirm };
})();

// Toutes les alertes existantes deviennent des notifications non bloquantes
window.alert = (message) => { UI.toast(message); };
