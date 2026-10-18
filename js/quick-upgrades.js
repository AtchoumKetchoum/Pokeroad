/**
 * quick-upgrades.js - Améliorations rapides : ce que le joueur peut faire tout de suite.
 *
 * Le jeu repère les améliorations faisables (CT apprenable, évolution prête, emplacement d'objet
 * vide alors qu'on a l'objet, bonbon utilisable, entraînement IV/EV/nature payable, capacité
 * améliorable, Grade possible, objet améliorable à l'Atelier, œufs prêts ou incubateur libre)
 * et les propose en un toucher :
 *  - au bourg : bouton « Améliorations » avec le nombre en pastille ;
 *  - après une victoire : bouton dans le récapitulatif ;
 *  - dans la fiche d'un Pokémon : section « À faire ».
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
        if (typeof PokeSheet !== 'undefined') PokeSheet.open(pk.instanceId).then?.(() => setTimeout(() => switchDetailTab?.(tab), 100));
        else { openPokemonDetail(pk); switchDetailTab?.(tab); }
    }
    function openTraining(pk, tab) {
        InfoModal.close();
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
            refreshBadges();
        }));
    }

    // Pastille du bourg
    function refreshBadges() {
        const n = (() => { try { return all().length; } catch { return 0; } })();
        const btn = document.getElementById('quick-upgrades-btn');
        if (btn) { btn.querySelector('.qu-badge').textContent = n; btn.classList.toggle('has-items', n > 0); }
        return n;
    }
    function addHubButton() {
        const row = document.querySelector('.hub-top-row');
        if (!row || document.getElementById('quick-upgrades-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'quick-upgrades-btn';
        btn.className = 'quick-upgrades-btn panel-pop';
        btn.title = 'Améliorations disponibles';
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V6M6 12l6-6 6 6"/></svg><span class="qu-badge">0</span>`;
        btn.addEventListener('click', () => show());
        row.insertBefore(btn, document.getElementById('settings-btn'));
        refreshBadges();
    }

    function init() {
        addHubButton();
        // Recompte quand on revient au bourg
        const home = document.getElementById('view-home');
        if (home && 'MutationObserver' in window) new MutationObserver(() => { if (home.classList.contains('active')) refreshBadges(); }).observe(home, { attributes: true, attributeFilter: ['class'] });
        setTimeout(refreshBadges, 1500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    return { all, forPokemon, show, refreshBadges };
})();
window.QuickUpgrades = QuickUpgrades;
