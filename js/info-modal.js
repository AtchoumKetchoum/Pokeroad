/**
 * info-modal.js - Fenêtres d'information et d'action partout dans le jeu.
 *
 * Une seule fenêtre plein écran (#info-modal, barre Retour en bas), ouverte à la demande.
 * Contenus disponibles :
 *  - synergies (bandeaux) → toutes les synergies de types, bonus et paliers ;
 *  - rang de zone (écusson) → l'échelle des rangs ;
 *  - progression (zone, vague, combat) → la zone, ses boss et ses récompenses ;
 *  - frise des tours, vignettes d'effets → la fiche de combat du Pokémon ;
 *  - pastille de type → forces, faiblesses et immunités ;
 *  - objet porté en combat → son effet et sa valeur actuelle ;
 */
const InfoModal = (() => {
    const TYPE_FR = { normal: 'Normal', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Electrik', ice: 'Glace', fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte', rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée' };
    const LABEL = (t) => (typeof formatTypeLabel === 'function' ? formatTypeLabel(t) : (TYPE_FR[t] || t));
    const chip = (t) => `<span class="chip type-${t}">${LABEL(t)}</span>`;

    function ensure() {
        let m = document.getElementById('info-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'info-modal';
        m.className = 'modal';
        m.innerHTML = `<div class="modal-content info-modal-content">
            <span class="close-btn" onclick="InfoModal.close()">&times;</span>
            <h2 id="info-modal-title"></h2>
            <div id="info-modal-body"></div>
            <div id="info-modal-actions" class="info-modal-actions"></div>
        </div>`;
        const anchor = document.getElementById('refinement-modal');
        (anchor?.parentElement || document.body).insertBefore(m, anchor || null);
        return m;
    }

    function open({ title = '', html = '', actions = [] } = {}) {
        const m = ensure();
        m.querySelector('#info-modal-title').textContent = title;
        m.querySelector('#info-modal-body').innerHTML = html;
        m.querySelector('#info-modal-actions').innerHTML = actions.map((a, i) => `<button class="pk-btn-action" data-action="${i}">${a.label}</button>`).join('');
        m.querySelectorAll('#info-modal-actions [data-action]').forEach(btn => btn.addEventListener('click', () => actions[+btn.dataset.action].run()));
        m.style.display = 'flex';
        m.querySelector('.modal-content').scrollTop = 0;
    }
    function close() { const m = document.getElementById('info-modal'); if (m) m.style.display = 'none'; }

    // Le panneau d'infos du combat sait déjà dessiner fiches et attaques : on reprend son contenu
    function fromPanel(title, draw) {
        const panel = typeof dom !== 'undefined' ? dom.infoDisplayPanel : null;
        if (!panel) return;
        try {
            draw();
            const html = panel.innerHTML;
            if (typeof showTerrainInfo === 'function') showTerrainInfo();
            open({ title, html: `<div class="info-from-panel">${html}</div>` });
        } catch (err) { console.error('[InfoModal]', err); }
    }

    // --- Contenus ---
    function synergies(side) {
        const units = ((typeof grid !== 'undefined' && grid[side]) || []).filter(u => u && !u.isKO);
        const counts = BattleRules.synergyCounts(units);
        const rows = Object.entries(BattleRules.SYNERGY_PERKS).map(([type, perk]) => {
            const n = counts[type] || 0, tier = BattleRules.synergyTier(n);
            return `<div class="syn-row ${tier ? 'on' : ''}">${chip(type)}<b>${n}</b>
                <span>+10 % / +20 % / +30 % de dégâts ${LABEL(type)} (2 / 3 / 4 Pokémon) · dès 3 : ${perk.desc}${tier ? ` · <strong>actif : +${tier * 10} %</strong>` : ''}</span></div>`;
        }).join('');
        open({
            title: side === 'player' ? 'Tes synergies' : 'Synergies ennemies',
            html: `<p class="info-lede">Placer plusieurs Pokémon d'un même type renforce leurs attaques de ce type. Les plaques tenues comptent comme un Pokémon du type.</p><div class="syn-list">${rows}</div>`,
        });
    }
    function ranks() {
        const z = typeof zoneIndex !== 'undefined' ? zoneIndex : 1;
        const cur = Epic.rankFor(z);
        const rows = Epic.RANKS.map((r, i) => {
            const next = Epic.RANKS[i + 1];
            return `<div class="rank-row ${r.key === cur.key ? 'on' : ''}">${Epic.emblem(r, 30)}<b>${r.label}</b><span>Zones ${r.from}${next ? ` à ${next.from - 1}` : ' et plus'}</span></div>`;
        }).join('');
        open({ title: `Rang ${cur.label}`, html: `<p class="info-lede">Le rang indique la difficulté de la zone : ennemis plus forts, objets et étoiles en plus, arène plus épique.</p><div class="rank-list">${rows}</div>` });
    }
    function zone() {
        const z = typeof zoneIndex !== 'undefined' ? zoneIndex : 1;
        const info = typeof getZoneInfo === 'function' ? getZoneInfo(z) : null;
        const w = typeof waveIndex !== 'undefined' ? waveIndex : 1, b = typeof battleIndex !== 'undefined' ? battleIndex : 1;
        open({
            title: info?.name || `Zone ${z}`,
            html: `<div class="zone-facts">
                <div><b>Vague</b><span>${w} / 10</span></div><div><b>Combat</b><span>${b} / 10</span></div><div><b>Rang</b><span>${Epic.rankChip(z)}</span></div>
            </div>
            <ul class="info-list">
                <li>Chaque 10ᵉ combat d'une vague est un <b>boss</b> : PV renforcés, œuf garanti et un <b>Morceau d'Étoile</b>.</li>
                <li>Le boss de la 10ᵉ vague donne aussi un <b>Fragment Comète</b> (et parfois une Couronne Antique dans les zones avancées).</li>
                <li>Les ennemis portent plus d'objets et de baies à mesure que la zone avance.</li>
                <li>Après chaque victoire : argent, un objet, une baie, parfois une CT ou un œuf.</li>
            </ul>`,
            actions: [{ label: 'Carte de la zone', run: () => { close(); if (typeof leaveBattleToHome === 'function') leaveBattleToHome(true); } }],
        });
    }
    async function type(t) {
        if (typeof loadTypesDB === 'function') await loadTypesDB();
        const fr = TYPE_FR[t];
        const atk = (typeof TypesDB !== 'undefined' && TypesDB?.[fr]) || {};
        const types = Object.keys(TYPE_FR);
        const toFr = (x) => TYPE_FR[x];
        const strong = types.filter(x => atk[toFr(x)] === 2), weak = types.filter(x => atk[toFr(x)] === 0.5), none = types.filter(x => atk[toFr(x)] === 0);
        const def = (x) => (TypesDB?.[toFr(x)] || {})[fr];
        const hurts = types.filter(x => def(x) === 2), resists = types.filter(x => def(x) === 0.5), immune = types.filter(x => def(x) === 0);
        const line = (label, list) => `<div class="type-line"><b>${label}</b><span>${list.length ? list.map(chip).join(' ') : '—'}</span></div>`;
        open({
            title: `Type ${LABEL(t)}`,
            html: `<h4>En attaque</h4>${line('Super efficace sur', strong)}${line('Peu efficace sur', weak)}${line('Sans effet sur', none)}
                <h4>En défense</h4>${line('Faible contre', hurts)}${line('Résiste à', resists)}${line('Immunisé contre', immune)}`,
        });
    }
    function item(unit, id) {
        const it = typeof GameData !== 'undefined' ? GameData.getItem(id) : null;
        const v = typeof HeldItems !== 'undefined' && HeldItems.spec(id) ? Math.round(HeldItems.valueOf(unit, id) * 10) / 10 : null;
        const used = unit?._usedItems?.has(id);
        open({
            title: it?.name_fr || id,
            html: `<div class="item-hero">${Art.item(id, 64)}</div>
                <p>${it?.effect_fr || ''}</p>
                ${v != null ? `<p class="info-lede">Valeur actuelle : <b>${v}</b> (base ${HeldItems.spec(id).base}, plafond ${HeldItems.spec(id).cap}).</p>` : ''}
                ${used ? '<p class="info-warn">Déjà utilisé dans ce combat : il reviendra au prochain.</p>' : ''}`,
        });
    }

    // Les explications au toucher / survol sont maintenant des infobulles (info-tip.js) ;
    // cette fenêtre reste pour les contenus longs et les actions (améliorations rapides…).

    return { open, close, fromPanel, synergies, ranks, zone, type, item };
})();
window.InfoModal = InfoModal;
