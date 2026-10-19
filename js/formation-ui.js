/**
 * formation-ui.js - Lecture de la formation avant et pendant le combat
 *  - étiquettes AVANT / CENTRE / ARRIÈRE à gauche de chaque ligne
 *  - badge de rôle sur chaque Pokémon (vif s'il est bien placé, grisé sinon)
 *  - synergies de types actives des deux équipes
 */

const FormationUI = (() => {
    const ROLE_ICON = { tank: 'shield', attacker: 'sword', caster: 'star', speedster: 'bolt', support: 'heart' };

    function movesOfPlayerPokemon(pk) {
        const keys = (pk.selectedMoves && pk.selectedMoves.length) ? pk.selectedMoves
            : (pk.moves || []).filter(m => (m.level ?? 0) <= (pk.level || 1)).map(m => m.name).slice(0, 4);
        return keys.map(id => ({ ...(MovesDB?.[id] || {}), id }));
    }

    // Rôle et types d'une unité affichée (données du combat si en cours, sinon calculées)
    function describeUnit(side, index, unitEl) {
        const actor = window.isRunning ? grid[side]?.[index] : null;
        if (actor) return { role: actor.role, types: actor.types || [] };
        const id = unitEl.dataset.pokemonId || GameData.getPokemons().find(p => p.instanceId === unitEl.dataset.instanceId)?.id;
        const base = PokedexDB?.[id];
        let moves = [];
        if (side === 'enemy') moves = (unitEl.dataset.moves || '').split(',').filter(Boolean).map(m => ({ ...(MovesDB?.[m] || {}), id: m }));
        else {
            const pk = GameData.getPokemons().find(p => p.instanceId === unitEl.dataset.instanceId);
            if (pk) moves = movesOfPlayerPokemon(pk);
        }
        return { role: BattleRules.computeRole(base?.stats, moves), types: base?.types || [] };
    }

    function ensureRowLabels(gridEl, side) {
        if (!gridEl || gridEl.querySelector('.row-labels')) return;
        // Rangées de haut en bas : l'ennemi (en haut) a son avant en bas, le joueur (en bas) en haut
        const order = [0, 1, 2].map(row => BattleRules.rowOfIndex(side, row * 3));
        const bar = document.createElement('div');
        bar.className = 'row-labels';
        bar.innerHTML = order.map(r => `<span class="row-label row-${r}">${BattleRules.ROW_LABEL[r]}</span>`).join('');
        gridEl.appendChild(bar);
    }

    function refreshSide(side) {
        const gridEl = document.getElementById(`${side}-grid`);
        if (!gridEl) return [];
        ensureRowLabels(gridEl, side);
        const units = [];
        gridEl.querySelectorAll('.unit-slot').forEach((slot, index) => {
            const unitEl = slot.querySelector('.unit');
            if (!unitEl) return;
            if (unitEl.classList.contains('is-ko')) return;
            const info = describeUnit(side, index, unitEl);
            units.push(info);
            const role = BattleRules.ROLES[info.role];
            if (!role) return;
            const well = role.rows.includes(BattleRules.rowOfIndex(side, index));
            let badge = unitEl.querySelector('.role-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'role-badge';
                (unitEl.querySelector('.hp-box') || unitEl).prepend(badge);
            }
            badge.className = `role-badge role-${info.role} ${well ? 'well-placed' : 'misplaced'}`;
            badge.innerHTML = `${Art.icon(ROLE_ICON[info.role] || 'star', 11)}<span>${role.label}</span>`;
            badge.removeAttribute('title'); // explication dans l'infobulle (info-tip.js)
        });
        return units;
    }

    // Pictogramme « synergie » (maillons) à la place du titre, pour laisser la place aux bonus
    const synergyIcon = (side) => `<span class="synergy-title synergy-icon" title="${side === 'player' ? 'Tes synergies de types' : 'Synergies ennemies'}"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="2.5" y="8" width="11" height="8" rx="4"/><rect x="10.5" y="8" width="11" height="8" rx="4"/></svg></span>`;

    function renderSynergies(side, units) {
        const footer = document.getElementById('view-battle')?.querySelector('.scaler-view');
        if (!footer) return;
        let panel = document.getElementById(`synergy-${side}`);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = `synergy-${side}`;
            panel.className = `synergy-panel synergy-${side}`;
            footer.appendChild(panel);
        }
        // Zone 1 (apprentissage) : les ennemis n'ont pas de synergies, comme dans les règles du combat
        if (side === 'enemy' && typeof zoneIndex !== 'undefined' && zoneIndex <= 1) {
            panel.innerHTML = `${synergyIcon(side)}<div class="synergy-empty">Aucune en zone 1</div>`;
            return;
        }
        // Une seule ligne : types actifs (étiquette + pastilles de palier 2 / 3 / 4), puis les autres en petits points.
        // Le nom et l'effet de chaque synergie sont dans l'infobulle.
        const list = BattleRules.describeSynergies(units);
        const pips = (n) => Synergies.THRESHOLDS.map(t => `<i class="${n >= t ? 'on' : ''}"></i>`).join('');
        const label = (t) => formatTypeLabel(t);
        const active = list.filter(s => s.tier), waiting = list.filter(s => !s.tier);
        panel.classList.remove('compact');
        panel.innerHTML = synergyIcon(side)
            + active.map(s => `<div class="synergy-chip active tier-${s.tier}"><span class="chip type-${s.type}"><span class="lbl-long">${label(s.type)}</span><span class="lbl-short">${label(s.type).slice(0, 3)}</span></span><span class="syn-pips">${pips(s.count)}</span></div>`).join('')
            + (waiting.length ? `<div class="syn-waiting">${waiting.map(s => `<span class="syn-dot type-${s.type}"></span>`).join('')}</div>` : '')
            + (!list.length ? '<div class="synergy-empty">Aucun Pokémon</div>' : '');
        // Trop large : étiquettes courtes
        requestAnimationFrame(() => { if (panel.scrollWidth > panel.clientWidth + 1) panel.classList.add('compact'); });
    }

    function refresh() {
        if (typeof BattleRules === 'undefined' || !document.getElementById('player-grid')) return;
        const player = refreshSide('player');
        const enemy = refreshSide('enemy');
        renderSynergies('player', player);
        renderSynergies('enemy', enemy);
    }

    return { refresh };
})();
