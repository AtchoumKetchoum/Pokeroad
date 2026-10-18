/**
 * info-modal.js - Fenêtres d'information et d'action partout dans le jeu.
 *
 * Une seule fenêtre plein écran (#info-modal, barre Retour en bas) que l'on remplit selon
 * ce qu'on touche :
 *  - synergies (bandeaux) → toutes les synergies de types, bonus et paliers ;
 *  - rang de zone (écusson) → l'échelle des rangs ;
 *  - progression (zone, vague, combat) → la zone, ses boss et ses récompenses ;
 *  - frise des tours, vignettes d'effets → la fiche de combat du Pokémon ;
 *  - pastille de type → forces, faiblesses et immunités ;
 *  - objet porté en combat → son effet et sa valeur actuelle ;
 *  - appui long sur une attaque → sa fiche complète (zone, effets, version Z).
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

    // --- Déclencheurs ---
    let lpTimer = null, lpFired = false;
    function onClick(e) {
        if (lpFired) { lpFired = false; e.stopPropagation(); e.preventDefault(); return; }
        const t = e.target;
        const inBattle = !!t.closest('#view-battle');
        const syn = t.closest('#view-battle .synergy-panel');
        if (syn) { e.stopPropagation(); synergies(syn.classList.contains('synergy-enemy') ? 'enemy' : 'player'); return; }
        if (inBattle && t.closest('.rank-chip')) { e.stopPropagation(); ranks(); return; }
        if (t.closest('#view-battle #hudProgress')) { e.stopPropagation(); zone(); return; }
        const held = t.closest('.held-chip[data-item]');
        if (held) { e.stopPropagation(); const u = unitFromEl(held); item(u, held.dataset.item); return; }
        const tile = t.closest('#view-battle .status-icons');
        if (tile && !document.querySelector('#enemy-grid.is-targeting')) { e.stopPropagation(); const u = unitFromEl(tile); if (u) fromPanel(u.name, () => showPokemonDetails(u)); return; }
        const tl = t.closest('#view-battle .timeline-unit-container');
        if (tl?.__unit) {
            e.stopPropagation();
            // La frise travaille sur des copies : on retrouve le vrai combattant sur la grille
            const c = tl.__unit;
            const pool = [...(grid.player || []), ...(grid.enemy || [])].filter(Boolean);
            const u = pool.find(x => x === c) || pool.find(x => c._instanceId && x._instanceId === c._instanceId)
                || pool.find(x => x.name === c.name && (!c._side || x._side === c._side) && (c._index == null || x._index === c._index))
                || pool.find(x => x.name === c.name) || c;
            fromPanel(u.name, () => showPokemonDetails(u));
            return;
        }
        const typeChip = t.closest('.chip[class*="type-"]');
        if (typeChip && !t.closest('#info-modal .type-line')) {
            const m = [...typeChip.classList].find(c => c.startsWith('type-'));
            const key = m && m.slice(5);
            if (key && TYPE_FR[key]) { e.stopPropagation(); type(key); }
        }
    }
    // Retrouve le combattant à partir d'un élément de la grille ou de la fiche de combat
    function unitFromEl(el) {
        if (el.dataset.side) return grid[el.dataset.side]?.[+el.dataset.index] || null;
        const slot = el.closest('.unit-slot');
        if (!slot) return null;
        const side = slot.closest('#player-grid') ? 'player' : 'enemy';
        const idx = [...slot.parentElement.children].indexOf(slot);
        return grid[side]?.[idx] || null;
    }
    // Appui long sur une attaque : sa fiche complète
    function onDown(e) {
        const btn = e.target.closest('#view-battle .move-btn');
        if (!btn || !btn.__move) return;
        clearTimeout(lpTimer);
        lpTimer = setTimeout(() => { lpFired = true; fromPanel(btn.__move.name || 'Attaque', () => showMoveDetails(btn.__move, btn.__unit, false)); }, 450);
    }
    const cancelLp = () => clearTimeout(lpTimer);

    function init() {
        document.addEventListener('click', onClick, true);
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('pointerup', cancelLp, true);
        document.addEventListener('pointercancel', cancelLp, true);
        document.addEventListener('pointermove', (e) => { if (lpTimer && Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancelLp(); }, true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { open, close, synergies, ranks, zone, type, item };
})();
window.InfoModal = InfoModal;
