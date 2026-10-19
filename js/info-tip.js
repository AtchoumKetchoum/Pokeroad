/**
 * info-tip.js - Infobulles : une petite bulle près de l'élément, au survol (souris) ou au toucher.
 *
 * Synergies, rang, progression de zone, pastilles de type, objets portés, vignettes d'effets,
 * frise des tours et attaques (survol, ou appui long sur mobile) ont chacun leur bulle courte.
 * Un toucher ailleurs ou la sortie du survol la ferme.
 */
const InfoTip = (() => {
    const TYPE_FR = { normal: 'Normal', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Electrik', ice: 'Glace', fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte', rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée' };
    const LABEL = (t) => (typeof formatTypeLabel === 'function' ? formatTypeLabel(t) : (TYPE_FR[t] || t));
    const chip = (t) => `<span class="tip-type type-${t}">${LABEL(t)}</span>`;
    const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    // --- Bulle ---
    let bubble = null, anchor = null;
    function ensure() {
        if (bubble) return bubble;
        bubble = document.createElement('div');
        bubble.className = 'info-tip no-minfont';
        bubble.setAttribute('role', 'tooltip');
        document.body.appendChild(bubble);
        return bubble;
    }
    function show(el, html) {
        if (!html) return;
        const b = ensure();
        anchor = el;
        b.innerHTML = html;
        b.classList.add('visible');
        place();
    }
    // Au-dessus de l'élément s'il y a la place, sinon en dessous ; toujours dans l'écran
    function place() {
        if (!bubble || !anchor) return;
        const r = anchor.getBoundingClientRect();
        const bw = bubble.offsetWidth, bh = bubble.offsetHeight, m = 8;
        let top = r.top - bh - 10, below = false;
        if (top < m) { top = r.bottom + 10; below = true; }
        top = Math.min(top, window.innerHeight - bh - m);
        const left = Math.max(m, Math.min(window.innerWidth - bw - m, r.left + r.width / 2 - bw / 2));
        bubble.style.left = `${left}px`;
        bubble.style.top = `${Math.max(m, top)}px`;
        bubble.classList.toggle('below', below);
        bubble.style.setProperty('--arrow-x', `${Math.max(12, Math.min(bw - 12, r.left + r.width / 2 - left))}px`);
    }
    function hide() { bubble?.classList.remove('visible'); anchor = null; }

    // --- Contenus ---
    function synergies(side) {
        const units = ((typeof grid !== 'undefined' && grid[side]) || []).filter(u => u && !u.isKO);
        if (side === 'enemy' && typeof zoneIndex !== 'undefined' && zoneIndex <= 1) return '<b>Synergies ennemies</b><div>Aucune en zone 1 : les ennemis les gagnent dès la zone 2.</div>';
        const list = Synergies.describe(units);
        const rows = list.map(s => `<div class="tip-syn ${s.tier ? 'on' : ''}">
                <div class="tip-row">${chip(s.type)} <b>${esc(s.name)}</b> <span class="tip-count">${s.count} / ${s.next || 4}</span>${s.scope === 'team' ? '<span class="tip-label">équipe</span>' : ''}</div>
                ${s.tier ? `<div>${esc(s.effect)}</div>` : ''}
                ${s.tier < 3 ? `<small>${s.next ? `À ${s.next} : ${esc(s.nextEffect)}` : ''}</small>` : '<small>Palier maximum</small>'}
            </div>`).join('');
        return `<b>${side === 'player' ? 'Tes synergies' : 'Synergies ennemies'}</b>${rows || '<div>Aucun Pokémon.</div>'}
            <small>Paliers à 2, 3 et 4 Pokémon du même type (les plaques comptent). « Équipe » : profite à tous, sinon aux Pokémon du type.</small>`;
    }
    function rank() {
        const z = typeof zoneIndex !== 'undefined' ? zoneIndex : 1;
        const r = Epic.rankFor(z), next = Epic.RANKS[(r.index ?? Epic.RANKS.findIndex(x => x.key === r.key)) + 1];
        return `<b>Rang ${r.label}</b><div>Difficulté de la zone ${z}.${next ? ` Prochain rang (${next.label}) dès la zone ${next.from}.` : ''}</div>
            <small>Plus le rang monte, plus les ennemis ont d'étoiles, d'objets et de baies.</small>`;
    }
    function zone() {
        const z = typeof zoneIndex !== 'undefined' ? zoneIndex : 1;
        const info = typeof getZoneInfo === 'function' ? getZoneInfo(z) : null;
        const w = typeof waveIndex !== 'undefined' ? waveIndex : 1, b = typeof battleIndex !== 'undefined' ? battleIndex : 1;
        return `<b>${esc(info?.name || `Zone ${z}`)}</b><div>Vague ${w} / 10 · combat ${b} / 10</div>
            <small>Boss au 10ᵉ combat : œuf et Morceau d'Étoile. Boss de la 10ᵉ vague : Fragment Comète.</small>`;
    }
    function type(t) {
        const fr = TYPE_FR[t];
        const db = (typeof TypesDB !== 'undefined' && TypesDB) || null;
        if (!db) { if (typeof loadTypesDB === 'function') loadTypesDB(); return `<b>Type ${LABEL(t)}</b>`; }
        const all = Object.keys(TYPE_FR);
        const atk = db[fr] || {};
        const strong = all.filter(x => atk[TYPE_FR[x]] === 2);
        const weak = all.filter(x => (db[TYPE_FR[x]] || {})[fr] === 2);
        const immune = all.filter(x => (db[TYPE_FR[x]] || {})[fr] === 0);
        const line = (l, list) => list.length ? `<div class="tip-row"><span class="tip-label">${l}</span> ${list.map(chip).join(' ')}</div>` : '';
        return `<b>Type ${LABEL(t)}</b>${line('Fort contre', strong)}${line('Faible contre', weak)}${line('Immunisé', immune)}`;
    }
    function heldItem(unit, id) {
        const it = typeof GameData !== 'undefined' ? GameData.getItem(id) : null;
        const v = typeof HeldItems !== 'undefined' && HeldItems.spec(id) && unit ? Math.round(HeldItems.valueOf(unit, id) * 10) / 10 : null;
        return `<b>${esc(it?.name_fr || id)}</b><div>${esc((it?.effect_fr || '').replace(/ Amélioration à l'Atelier.*$/, ''))}</div>
            ${v != null ? `<small>Valeur actuelle : ${v}${unit?._usedItems?.has(id) ? ' · déjà utilisé ce combat' : ''}</small>` : ''}`;
    }
    function unitSummary(u) {
        if (!u) return '';
        const items = [...(u.heldItems || []), ...(u.berries || [])].length;
        return `<b>${esc(u.name)}</b> <small>Nv ${u.level}</small>
            <div>PV ${Math.max(0, u.hp)} / ${u.maxHp}${u.shield ? ` · bouclier ${u.shield}` : ''}</div>
            <div>Jauge Z ${Math.round(Math.min(100, u.boostGauge || 0))} %${items ? ` · ${items} objet(s)` : ''}</div>`;
    }
    function move(mv, unit) {
        if (!mv) return '';
        const rw = mv.rw || {};
        const kind = rw.kind === 'passive' ? `Passif · ${rw.triggerLabel || ''}` : rw.kind === 'tactic' ? 'Tactique' : (mv.zone_label || 'Attaque').replace(/\s*\(.*\)$/, '');
        const power = rw.kind === 'attack' ? Math.round((rw.power || mv.power || 0) * (mv._refMult || 1)) : null;
        return `<b>${esc(mv.name)}</b> ${chip((mv.type || 'normal').toLowerCase())}
            <div>${esc(kind)}${power ? ` · puissance ${power}` : ''}${mv.accuracy ? ` · préc. ${mv.accuracy}` : ''}</div>
            <small>${esc(mv.description_game || mv.description || '')}</small>`;
    }

    // --- Ce qui a une bulle, et son contenu ---
    function contentFor(el) {
        const syn = el.closest('#view-battle .synergy-panel');
        if (syn) return [syn, synergies(syn.classList.contains('synergy-enemy') ? 'enemy' : 'player')];
        const rk = el.closest('#view-battle .rank-chip');
        if (rk) return [rk, rank()];
        const hud = el.closest('#view-battle #hudProgress');
        if (hud) return [hud, zone()];
        const lvlEl = el.closest('#view-battle .unit .lvl-badge');
        if (lvlEl) {
            const star = lvlEl.parentElement?.querySelector('.star-badge');
            const stars = star && !star.hidden ? star.textContent.replace('★', '') : 0;
            return [lvlEl, `<b>Niveau ${esc(lvlEl.textContent)}</b><div>Grade ${esc(lvlEl.dataset.grade || 1)}${stars ? ` · ${stars} étoile${stars > 1 ? 's' : ''}` : ''}</div><small>La couleur du rond indique le grade.</small>`];
        }
        const roleEl = el.closest('#view-battle .role-badge');
        if (roleEl) {
            const key = [...roleEl.classList].find(c => c.startsWith('role-') && c !== 'role-badge')?.slice(5);
            const r = BattleRules.ROLES[key];
            if (r) return [roleEl, `<b>Rôle : ${r.label}</b><div>${esc(r.desc)}</div><small>${roleEl.classList.contains('misplaced') ? 'Mal placé : bonus inactif.' : 'Bien placé : bonus actif.'} Le rôle dépend des stats de base et des attaques.</small>`];
        }
        const held = el.closest('.held-chip[data-item]');
        if (held) return [held, heldItem(unitFromEl(held), held.dataset.item)];
        const tile = el.closest('#view-battle .ut-tile');
        if (tile) return [tile, `<div>${esc(tile.dataset.tip || tile.getAttribute('title') || '')}</div>`];
        const tl = el.closest('#view-battle .timeline-unit-container');
        if (tl?.__unit) return [tl, unitSummary(realUnit(tl.__unit))];
        const mvBtn = el.closest('#view-battle .move-btn');
        if (mvBtn?.__move) return [mvBtn, move(mvBtn.__move, mvBtn.__unit)];
        const typeChip = el.closest('.chip[class*="type-"]');
        if (typeChip) {
            const key = [...typeChip.classList].find(c => c.startsWith('type-') && TYPE_FR[c.slice(5)])?.slice(5);
            if (key) return [typeChip, type(key)];
        }
        return null;
    }
    function realUnit(c) {
        const pool = [...(grid.player || []), ...(grid.enemy || [])].filter(Boolean);
        return pool.find(x => x === c) || pool.find(x => x.name === c.name && (!c._side || x._side === c._side)) || c;
    }
    function unitFromEl(el) {
        if (el.dataset.side) return grid[el.dataset.side]?.[+el.dataset.index] || null;
        const slot = el.closest('.unit-slot');
        if (!slot) return null;
        const side = slot.closest('#player-grid') ? 'player' : 'enemy';
        return grid[side]?.[[...slot.parentElement.children].indexOf(slot)] || null;
    }

    // --- Déclencheurs ---
    // Souris : survol (petit délai) ; tactile : toucher (et appui long sur une attaque)
    let hoverTimer = null, lpTimer = null, lpFired = false;
    const isTargeting = () => !!document.querySelector('#enemy-grid.is-targeting');
    function onOver(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const hit = contentFor(e.target);
        clearTimeout(hoverTimer);
        if (!hit) return;
        hoverTimer = setTimeout(() => show(hit[0], hit[1]), 220);
    }
    function onOut(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        clearTimeout(hoverTimer);
        if (anchor && !anchor.contains(e.relatedTarget)) hide();
    }
    function onClick(e) {
        if (lpFired) { lpFired = false; e.stopPropagation(); e.preventDefault(); return; }
        if (e.target.closest('.info-tip')) return;
        // Les attaques et les cibles gardent leur action au toucher (la bulle de l'attaque : appui long)
        if (e.target.closest('#view-battle .move-btn') || isTargeting()) { hide(); return; }
        const hit = contentFor(e.target);
        if (!hit) { hide(); return; }
        // Toucher sur mobile : la bulle remplace l'action (les vignettes, la frise, les bandeaux n'en ont pas d'autre)
        if (e.pointerType === 'mouse' && !hit[0].matches('.held-chip, .ut-tile, .role-badge, .lvl-badge')) return;
        e.stopPropagation();
        if (anchor === hit[0] && bubble?.classList.contains('visible')) { hide(); return; }
        show(hit[0], hit[1]);
    }
    function onDown(e) {
        const btn = e.target.closest('#view-battle .move-btn');
        if (!btn?.__move || e.pointerType === 'mouse') return;
        clearTimeout(lpTimer);
        lpTimer = setTimeout(() => { lpFired = true; show(btn, move(btn.__move, btn.__unit)); }, 450);
    }
    const cancelLp = () => clearTimeout(lpTimer);

    function init() {
        document.addEventListener('pointerover', onOver, true);
        document.addEventListener('pointerout', onOut, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('pointerup', cancelLp, true);
        document.addEventListener('pointercancel', cancelLp, true);
        window.addEventListener('scroll', () => hide(), true);
        window.addEventListener('resize', () => hide());
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { show, hide };
})();
window.InfoTip = InfoTip;
