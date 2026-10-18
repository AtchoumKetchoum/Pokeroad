/**
 * quick-upgrades.js - Améliorations rapides : ce que le joueur peut faire tout de suite.
 *
 * Le jeu repère les améliorations faisables (CT apprenable, évolution prête, emplacement d'objet
 * vide alors qu'on a l'objet, bonbon utilisable, entraînement IV/EV/nature payable, capacité
 * améliorable, Grade possible, objet améliorable à l'Atelier, œufs prêts ou incubateur libre)
 * et les propose en un toucher, Pokémon par Pokémon :
 *  - dans la fiche du Pokémon : section « À faire » (onglet Stats) ;
 *  - au Centre : sur la vignette du Pokémon, le nombre d'actions et l'aperçu des premières.
 */
const QuickUpgrades = (() => {
    const MAX_LIST = 40;

    // Pokémon prioritaires : l'équipe de la route d'abord, puis par niveau
    function pokemonsByPriority() {
        const team = new Set((GameData.getLastRoadTeam?.() || []).map(x => (typeof x === 'object' ? x.instanceId : x)));
        return GameData.getPokemons().slice().sort((a, b) => (team.has(b.instanceId) - team.has(a.instanceId)) || (b.level - a.level));
    }

    // Toutes les actions possibles pour un Pokémon
    function forPokemon(pk, data = GameData._load()) {
        const out = [];
        const inv = data?.inventory?.items || {};
        const money = data?.money || 0;
        const name = pk.name;
        const add = (kind, label, run, icon = '') => out.push({ kind, pokemon: pk, label, run, icon, who: name });

        // Évolution prête
        (GameData.checkEvolution(pk.instanceId) || []).filter(e => e.canEvolve).forEach(e =>
            add('evolve', `Évoluer en ${e.targetName}`, () => triggerEvolution(pk.instanceId, e.targetId), e.targetSprite ? `<img src="${e.targetSprite}" alt="">` : ''));
        // CT apprenables
        GameData.getLearnableCTs(pk).slice(0, 3).forEach(id => {
            const it = GameData.getItem(id);
            const mv = (typeof MovesDB !== 'undefined' && MovesDB?.[it.move]) || {};
            add('ct', `Apprendre ${mv.name_fr || it.move} (${it.name_fr})`, () => GameData.learnCT(pk.instanceId, id), Art.item(it.sprite?.split('/').pop().replace('.png', '') || 'tm-normal', 26));
        });
        // Emplacements vides alors qu'on a des objets ou des baies
        const slots = GameData.getHoldSlots(pk);
        const pockets = GameData.getItemsByPocket();
        const ownedOf = (list) => (list || []).filter(i => inv[i.id] > 0 && (!i.species_only || i.species_only.includes(pk.id)));
        if ((pk.heldItems || []).length < slots.items && ownedOf(pockets.battle).length) add('equip', `Équiper un objet (${(pk.heldItems || []).length}/${slots.items})`, () => openSheet(pk, 'item'), Art.item('leftovers', 26));
        if ((pk.berries || []).length < slots.berries && ownedOf(pockets.berries).length) add('equip', `Équiper une baie (${(pk.berries || []).length}/${slots.berries})`, () => openSheet(pk, 'item'), Art.item('sitrus-berry', 26));
        // Bonbons
        const maxLevel = Refinement.getMaxLevel(pk.refinementLevel || 1, pk.refinementStars || 0);
        if (pk.level < maxLevel) {
            const candy = ['exp-candy-xl', 'exp-candy-l', 'exp-candy-m', 'exp-candy-s', 'rare-candy', 'exp-candy-xs'].find(k => inv[k] > 0);
            if (candy) add('candy', `Utiliser ${GameData.getItem(candy)?.name_fr || candy} (Nv ${pk.level}/${maxLevel})`, () => GameData.useCandy(pk.instanceId, candy, 1), Art.item(candy, 26));
        }
        // Grade possible (niveau maximum atteint) ou étoile
        if (pk.level >= maxLevel) add('grade', `Monter en Grade (niveau max ${maxLevel} atteint)`, () => openTraining(pk, 'pokemon'), Art.stars ? Art.stars(1, 18) : '');
        const star = GameData.pokemonStarCost(pk, data);
        if (star.ok) add('grade', `Ajouter une étoile (+20 % de stats)`, () => GameData.refinePokemonStar(pk.instanceId), Art.stars ? Art.stars(1, 18) : '');
        // Entraînement IV / EV payable (le pas le moins cher)
        ['iv', 'ev'].forEach(kind => {
            const steps = GameData.STAT_KEYS.map(stat => ({ stat, cost: GameData.trainingCost(kind, stat, GameData.statTrack(pk, kind, stat)) }))
                .filter(s => money >= s.cost.money && GameData.countTrainingItem(s.cost.item) >= s.cost.count && !(s.cost.key && (inv[s.cost.key.item] || 0) < s.cost.key.count))
                .sort((a, b) => a.cost.money - b.cost.money);
            if (steps.length) add('train', `Entraîner les ${kind.toUpperCase()} (${steps.length} stat${steps.length > 1 ? 's' : ''} possible${steps.length > 1 ? 's' : ''})`, () => openTraining(pk, kind), Art.item(kind === 'iv' ? 'health-wing' : 'protein', 26));
        });
        // Nature
        const nature = GameData.getNature(pk);
        if (nature?.plus) {
            const c = GameData.natureCost(GameData.natureTrack(pk));
            if (money >= c.money && GameData.countTrainingItem(c.item) >= c.count && !(c.key && (inv[c.key.item] || 0) < c.key.count)) add('train', `Renforcer la nature ${nature.name}`, () => openTraining(pk, 'nature'), Art.item('star-sweet', 26));
        }
        // Capacités équipées améliorables (CT du type ou PP Plus)
        (pk.selectedMoves || []).forEach(key => {
            const ref = pk.moveRefinements?.[key] || { level: 1, stars: 0 };
            const c = GameData.moveTrainingCost(key, ref);
            const cost = Refinement.getRefinementCost('move', Refinement.levelOf(ref), Refinement.starsOf(ref));
            const ok = money >= cost.money && (c.star ? c.haveJoker >= c.count : (c.haveCt + c.haveJoker) >= c.count) && !(c.key && (inv[c.key.item] || 0) < c.key.count);
            const mv = (typeof MovesDB !== 'undefined' && MovesDB?.[key]) || {};
            if (ok) add('move', `Améliorer ${mv.name_fr || key}`, () => openTraining(pk, 'moves'), Art.item(`tm-${c.type || 'normal'}`, 26));
        });
        return out;
    }

    // Actions hors Pokémon : Atelier, œufs
    function general(data = GameData._load()) {
        const out = [];
        const inv = data?.inventory?.items || {};
        const now = Date.now();
        const ready = (data?.inventory?.incubators || []).filter(e => e && now >= e.endTime).length;
        if (ready) out.push({ kind: 'egg', label: `Faire éclore ${ready} œuf${ready > 1 ? 's' : ''}`, run: () => { ViewManager.show('labo'); setTimeout(() => openModal?.('incubator-modal'), 300); }, icon: Art.egg ? Art.egg('Commun', 26) : '' });
        const free = (data?.unlockedIncubators || 1) - (data?.inventory?.incubators || []).filter(Boolean).length;
        if (free > 0 && (data?.inventory?.eggs || []).length) out.push({ kind: 'egg', label: `Incuber un œuf (${free} incubateur${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''})`, run: () => openEggBagModal?.(), icon: Art.egg ? Art.egg('Rare', 26) : '' });
        // Objets portés par tes Pokémon et améliorables à l'Atelier (exemplaires et argent suffisants)
        const worn = new Set((data?.pokemons || []).flatMap(p => [...(p.heldItems || []), ...(p.berries || [])]));
        const refinable = [...worn].filter(id => inv[id] > 0 && Refinement.isRefinable({ ...(GameData.getItem(id) || {}), id }));
        refinable.forEach(id => {
            const ref = GameData.getGlobalItemRefinement(id);
            const atMax = Refinement.levelOf(ref) >= Refinement.getMaxRefineLevel(Refinement.starsOf(ref));
            const check = atMax ? Refinement.canRefineAddStar(ref, inv[id], data.money, 'item') : Refinement.canRefineLevelUp(ref, inv[id], data.money, 'item');
            if (check.possible) out.push({ kind: 'workshop', label: `Améliorer ${GameData.getItem(id)?.name_fr || id} à l'Atelier`, run: () => RefinementUI.open(id, 'item'), icon: Art.item(id, 26) });
        });
        return out;
    }

    // Ordre : évolutions et œufs prêts, puis les Pokémon (équipe d'abord), puis l'Atelier (3 au plus)
    function all() {
        const data = GameData._load();
        const gen = general(data);
        const list = [];
        const perPokemon = [];
        for (const pk of pokemonsByPriority()) {
            perPokemon.push(...forPokemon(pk, data));
            if (perPokemon.length >= MAX_LIST) break;
        }
        list.push(...perPokemon.filter(a => a.kind === 'evolve'), ...gen.filter(a => a.kind === 'egg'));
        list.push(...perPokemon.filter(a => a.kind !== 'evolve'));
        list.push(...gen.filter(a => a.kind === 'workshop').slice(0, 3));
        return list.slice(0, MAX_LIST);
    }

    // Navigation
    function openSheet(pk, tab) {
        InfoModal.close();
        // Déjà dans la fiche de ce Pokémon : on change seulement d'onglet
        const sheet = document.getElementById('center-pokemon-detail-modal');
        if (sheet && sheet.style.display !== 'none' && typeof CURRENT_POKEMON !== 'undefined' && CURRENT_POKEMON?.instanceId === pk.instanceId) { switchDetailTab?.(tab); return; }
        if (typeof PokeSheet !== 'undefined') PokeSheet.open(pk.instanceId).then?.(() => setTimeout(() => switchDetailTab?.(tab), 100));
        else { openPokemonDetail(pk); switchDetailTab?.(tab); }
    }
    function openTraining(pk, tab) {
        InfoModal.close();
        if (typeof closePokemonDetail === 'function') closePokemonDetail();
        const fresh = GameData.getPokemons().find(p => p.instanceId === pk.instanceId) || pk;
        RefinementUI.open(fresh, 'pokemon');
        RefinementUI.switchTab(tab);
    }

    // Fenêtre « Améliorations disponibles »
    function show(filterPk = null) {
        const list = filterPk ? forPokemon(filterPk) : all();
        const rows = list.map((a, i) => `<div class="qu-row qu-${a.kind}">
            <span class="qu-icon">${a.icon || ''}</span>
            <span class="qu-text">${a.who ? `<b>${a.who}</b> · ` : ''}${a.label}</span>
            <button class="pk-btn-action small" data-qu="${i}">${['evolve', 'ct', 'candy'].includes(a.kind) || (a.kind === 'grade' && a.label.startsWith('Ajouter')) ? 'Faire' : 'Ouvrir'}</button>
        </div>`).join('');
        InfoModal.open({
            title: filterPk ? `À faire : ${filterPk.name}` : 'Améliorations disponibles',
            html: list.length ? `<p class="info-lede">Tout ce que tu peux faire tout de suite, en un toucher.</p><div class="qu-list">${rows}</div>`
                : '<p class="info-lede">Rien à faire pour l\'instant : continue la route pour gagner argent, objets et CT.</p>',
        });
        document.querySelectorAll('#info-modal [data-qu]').forEach(btn => btn.addEventListener('click', async () => {
            const a = list[+btn.dataset.qu];
            const res = await a.run();
            if (res && res.success === false && res.reason) alert(res.reason);
            // Action faite sur place : on rafraîchit la liste ; navigation : la fenêtre est déjà fermée
            if (document.getElementById('info-modal')?.style.display !== 'none') show(filterPk);
        }));
    }

    // Section « À faire » de la fiche du Pokémon
    let lastSheet = null;
    const doesItHere = (a) => ['evolve', 'ct', 'candy'].includes(a.kind) || (a.kind === 'grade' && a.label.startsWith('Ajouter'));
    function sheetHtml(pk) {
        const list = forPokemon(pk);
        lastSheet = { pk, list };
        if (!list.length) return '';
        return `<div class="section-title">À faire (${list.length})</div>
            <div class="qu-inline">${list.map((a, i) => `<div class="qu-row qu-${a.kind}">
                <span class="qu-icon">${a.icon || ''}</span><span class="qu-text">${a.label}</span>
                <button class="pk-btn-action small" onclick="QuickUpgrades.runSheet(${i})">${doesItHere(a) ? 'Faire' : 'Ouvrir'}</button>
            </div>`).join('')}</div>`;
    }
    async function runSheet(i) {
        const a = lastSheet?.list[i];
        if (!a) return;
        const res = await a.run();
        if (res && res.success === false && res.reason) alert(res.reason);
        // Action faite sur place : la fiche se met à jour
        const sheet = document.getElementById('center-pokemon-detail-modal');
        if (doesItHere(a) && sheet && sheet.style.display !== 'none') {
            const fresh = GameData.getPokemons().find(p => p.instanceId === a.pokemon.instanceId);
            if (fresh) openPokemonDetail(fresh);
        }
        if (typeof renderPCView === 'function') renderPCView();
    }
    // Vignettes du Centre : nombre d'actions et aperçu des 3 premières (calculé sans bloquer l'affichage)
    function badgeCards(root = document) {
        const cards = [...root.querySelectorAll('.pokemon-item[data-instance-id]')];
        if (!cards.length) return;
        const data = GameData._load();
        const byId = new Map(GameData.getPokemons().map(p => [p.instanceId, p]));
        let i = 0;
        const step = () => {
            const end = Math.min(cards.length, i + 12);
            for (; i < end; i++) {
                const card = cards[i], pk = byId.get(card.dataset.instanceId);
                card.querySelectorAll('.qu-dot, .qu-preview').forEach(el => el.remove());
                if (!pk) continue;
                const list = forPokemon(pk, data);
                if (!list.length) continue;
                card.title = list.map(a => '• ' + a.label).join('\n');
                card.insertAdjacentHTML('beforeend', `<span class="qu-dot">${list.length}</span><span class="qu-preview">${list.slice(0, 3).map(a => `<i class="qu-mini qu-${a.kind}">${a.icon || ''}</i>`).join('')}</span>`);
            }
            if (i < cards.length) setTimeout(step, 0);
        };
        setTimeout(step, 0);
    }

    return { all, forPokemon, show, sheetHtml, runSheet, badgeCards };
})();
window.QuickUpgrades = QuickUpgrades;
