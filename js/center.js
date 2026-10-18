/**
 * center.js - Logique du Centre Pokémon
 * Gère l'affichage des Pokémon, les détails et la gestion des capacités
 */

// Dictionnaire des types -> Français
// Fallback minimal FR si moves.json indisponible
const MOVES_FR_FALLBACK = {
    "scratch": { name_fr: "Griffe", type: "normal" },
    "growl": { name_fr: "Rugissement", type: "normal" },
    "ember": { name_fr: "Flammèche", type: "fire" },
    "dragon-breath": { name_fr: "Draco-Souffle", type: "dragon" },
    "vine-whip": { name_fr: "Fouet Lianes", type: "grass" },
    "razor-leaf": { name_fr: "Tranch'Herbe", type: "grass" },
    "water-gun": { name_fr: "Pistolet à O", type: "water" },
    "bite": { name_fr: "Morsure", type: "dark" },
    "tail-whip": { name_fr: "Mimi-Queue", type: "normal" },
    "tackle": { name_fr: "Charge", type: "normal" }
};

let CURRENT_POKEMON = null;
let CURRENT_AVAILABLE_MOVES = [];
const selectionState = { selected: [], boosted: null };
let MOVES_FR = {};
let allItemsData = null;

// --- LOCKER STATE ---
let currentItemSort = 'category';
let currentItemCategoryFilter = 'all';
let itemCategories = [];

// --- STATE ---
let healUpdateInterval;

window.initCenter = async () => {
    // Même dictionnaire d'attaques que le combat (chargé une seule fois)
    const [, movesDict] = await Promise.all([ GameData.init(), loadMovesDB() ]);
    MOVES_FR = movesDict || {};

    // Direct initialization
    renderPCView();
    renderHealingSidebar();
};

function renderPCView() {
    const pokemons = GameData.getPokemons();
    renderPokemonList(pokemons);
}

function renderHealingSidebar() {
    const container = document.getElementById('heal-status-container');
    if (!container) return;
    
    const pokemons = GameData.getPokemons();
    const exhaustedPokemons = pokemons.filter(p => p.status === 'exhausted');
    const healingPokemons = pokemons.filter(p => p.status === 'healing');

    if (exhaustedPokemons.length === 0 && healingPokemons.length === 0) {
        container.innerHTML = '<p style="font-size:10px; color:#666; text-align:center; padding: 20px;">Aucun Pokémon en soin.</p>';
        return;
    }

    let html = '';
    [...exhaustedPokemons, ...healingPokemons].forEach(pk => {
        html += createHealCard(pk);
    });
    container.innerHTML = html;

    if (healUpdateInterval) clearInterval(healUpdateInterval);
    if (healingPokemons.length > 0) {
        updateHealingTimers();
        healUpdateInterval = setInterval(updateHealingTimers, 1000);
    }
}

function openPCModal() {
    const modal = document.getElementById('pc-modal');
    if (modal) {
        const pokemons = GameData.getPokemons();
        renderPokemonList(pokemons, 'pc-modal-list');
        modal.style.display = 'flex';
    }
}

function closePCModal() {
    const modal = document.getElementById('pc-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function openLocker() {
    let modal = document.getElementById('locker-modal');
    if (modal) {
        await displayLocker();
        modal.style.display = 'flex';
    } else {
        console.warn("La modale du casier n'est pas dans le HTML. Création dynamique pour corriger.");
        modal = document.createElement('div');
        modal.id = 'locker-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-button" onclick="closeLockerModal()">&times;</span>
                <div id="locker-content"></div>
            </div>
        `;
        document.body.appendChild(modal);
        await displayLocker();
        modal.style.display = 'flex';
    }
}

function closeLockerModal() {
    const modal = document.getElementById('locker-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function displayLocker() {
    const container = document.getElementById('locker-content');
    if (!container) return;

    if (!allItemsData) {
        try {
            allItemsData = await loadJSON('data/items.json');
            const categories = new Set(Object.values(allItemsData).map(item => item.category || 'Inconnu'));
            itemCategories = ['all', ...Array.from(categories).sort()];
        } catch (e) {
            console.error("Erreur critique lors du chargement du casier :", e);
            container.innerHTML = "<p>Erreur de chargement des données des objets. Vérifiez que le fichier <code>/data/items.json</code> est accessible.</p>";
            return;
        }
    }

    let categoryOptions = itemCategories.map(cat => `<option value="${cat}">${cat === 'all' ? 'Toutes les catégories' : cat}</option>`).join('');

    container.innerHTML = `
        <h2>Casier à Objets</h2>
        <div id="locker-filters">
            <div class="filter-group">
                <label for="sort-items">Trier par :</label>
                <select id="sort-items"><option value="category">Catégorie</option><option value="name">Nom (A-Z)</option></select>
            </div>
            <div class="filter-group">
                <label for="filter-category">Filtrer :</label>
                <select id="filter-category">${categoryOptions}</select>
            </div>
        </div>
        <div id="locker-grid"></div>
    `;

    document.getElementById('sort-items').addEventListener('change', (e) => { currentItemSort = e.target.value; renderLockerGrid(); });
    document.getElementById('filter-category').addEventListener('change', (e) => { currentItemCategoryFilter = e.target.value; renderLockerGrid(); });

    renderLockerGrid();
}

/**
 * Redirige l'utilisateur vers la page d'accueil.
 */
function renderLockerGrid() {
    const grid = document.getElementById('locker-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const inventory = GameData.getInventory().items || {}; // This is fine
    let items = Object.entries(GameData.getItems()).map(([key, value]) => ({ ...value, key })); // Use GameData's item catalog

    // 1. Filter
    if (currentItemCategoryFilter !== 'all') {
        items = items.filter(item => (item.category || 'Inconnu') === currentItemCategoryFilter);
    }

    // 2. Sort
    if (currentItemSort === 'name') {
        items.sort((a, b) => a.name_fr.localeCompare(b.name_fr));
    } else { // 'category'
        items.sort((a, b) => {
            const catA = a.category || 'Z';
            const catB = b.category || 'Z';
            if (catA < catB) return -1;
            if (catA > catB) return 1;
            return a.name_fr.localeCompare(b.name_fr);
        });
    }

    // 3. Render
    if (items.length === 0) {
        grid.innerHTML = '<p class="empty-message">Aucun objet ne correspond à ces filtres.</p>';
        return;
    }

    items.forEach(item => {
        const ownedCount = inventory[item.key] || 0;
        const card = document.createElement('div');
        card.className = 'item-card';
        if (ownedCount === 0) card.classList.add('unowned');

        const sprite = item.sprite || Art.FALLBACK;

        card.innerHTML = `
            ${ownedCount > 0 ? `<div class="item-owned-count">x${ownedCount}</div>` : ''}
            <img src="${sprite}" alt="${item.name_fr}" class="item-sprite" onerror="this.src=Art.FALLBACK">
            <p class="item-name">${typeof itemLabel === 'function' ? itemLabel(item) : item.name_fr}</p>
        `;
        
        card.addEventListener('click', () => showItemDetails(item));
        grid.appendChild(card);
    });
}

function showItemDetails(item) {
    const effect = item.effect_fr ? `\nEffet: ${item.effect_fr}` : '';
    const description = item.description_fr || "Pas de description.";
    alert(`[${item.category || 'Inconnu'}] ${item.name_fr}\n\n${description}${effect}`);
}

function formatHealTime(ms) {
    if (ms <= 0) return "Guéri !";
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    seconds %= 60;
    minutes %= 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function openHealModal() {
    const modal = document.getElementById('heal-modal');
    if (modal) {
        renderHealModal();
        modal.style.display = 'flex';
    }
}

function closeHealModal() {
    const modal = document.getElementById('heal-modal');
    if (modal) {
        modal.style.display = 'none';
        if (healUpdateInterval) clearInterval(healUpdateInterval);
    }
}

function renderHealModal() {
    const container = document.getElementById('heal-view-container');
    const pokemons = GameData.getPokemons();
    const exhaustedPokemons = pokemons.filter(p => p.status === 'exhausted');
    const healingPokemons = pokemons.filter(p => p.status === 'healing');

    let html = '<h3>Pokémon Épuisés</h3>';
    if (exhaustedPokemons.length > 0) {
        html += '<div id="exhausted-pokemon-grid" class="pokemon-grid-heal">';
        exhaustedPokemons.forEach(pk => {
            html += createHealCard(pk);
        });
        html += '</div>';
        html += '<button class="pk-btn-action" onclick="healAllExhausted()">Lancer les soins (6h)</button>';
    } else {
        html += '<p>Aucun Pokémon n\'est épuisé.</p>';
    }

    html += '<h3>Pokémon en Soin</h3>';
    if (healingPokemons.length > 0) {
        html += '<div id="healing-pokemon-grid" class="pokemon-grid-heal">';
        healingPokemons.forEach(pk => {
            html += createHealCard(pk);
        });
        html += '</div>';
    } else {
        html += '<p>Aucun Pokémon n\'est actuellement en soin.</p>';
    }

    container.innerHTML = html;

    if (healUpdateInterval) clearInterval(healUpdateInterval);
    if (healingPokemons.length > 0) {
        updateHealingTimers();
        healUpdateInterval = setInterval(updateHealingTimers, 1000);
    }
}

// Met à jour les minuteurs de soin affichés ; rafraîchit la liste quand un soin se termine
function updateHealingTimers() {
    const timers = document.querySelectorAll('.timer[data-instance-id]');
    let someoneHealed = false;
    timers.forEach(el => {
        const pk = GameData.getPokemons().find(p => p.instanceId === el.dataset.instanceId);
        const remaining = pk && pk.healingEndTime ? pk.healingEndTime - Date.now() : 0;
        el.textContent = formatHealTime(remaining);
        if (remaining <= 0) someoneHealed = true;
    });
    if (someoneHealed || timers.length === 0) {
        clearInterval(healUpdateInterval);
        healUpdateInterval = null;
        if (someoneHealed) {
            const modal = document.getElementById('heal-modal');
            if (modal && modal.style.display !== 'none') renderHealModal();
            renderHealingSidebar();
        }
    }
}

function closePokemonDetail() {
    const modal = document.getElementById('center-pokemon-detail-modal');
    if (modal) modal.style.display = 'none';
}

function createHealCard(pokemon) {
    let statusInfo = '';
    if (pokemon.status === 'healing') {
        const remaining = pokemon.healingEndTime - Date.now();
        statusInfo = `<div class="timer" data-instance-id="${pokemon.instanceId}">${formatHealTime(remaining)}</div>`;
    } else if (pokemon.status === 'exhausted') {
        statusInfo = `<div class="status-text exhausted">Épuisé</div>`;
    }

    return `
        <div class="pokemon-card-heal ${pokemon.status}">
            <img src="${pokemon.sprite}" alt="${pokemon.name}">
            <div class="heal-info">
                <p class="name">${pokemon.name}</p>
                ${statusInfo}
            </div>
        </div>
    `;
}

function healAllExhausted() {
    const result = GameData.healAllPokemon();
    if (result.success) {
        alert(`${result.count} Pokémon ont été placés en soin pour 6 heures.`);
        // Rafraîchit tout de suite l'infirmerie affichée et la boîte
        renderHealingSidebar();
        renderPCView();
    } else {
        alert(result.reason || "Une erreur est survenue.");
    }
}

function renderPokemonList(pokemons, targetId = 'pokemon-list') {
    const listeElement = document.getElementById(targetId);
    if (!listeElement) return;
    
    listeElement.innerHTML = ''; // Vide la liste
    
    if (!pokemons || pokemons.length === 0) {
        listeElement.innerHTML = "<p>Aucun Pokémon dans la boîte.</p>";
        return;
    }

    // Sort: Favorites first, then Level
    const sorted = [...pokemons].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return (b.level || 0) - (a.level || 0);
    });
    
    sorted.forEach(pokemon => {
        if (!pokemon || !pokemon.name) return;
        const name = safeName(pokemon);
        const level = (typeof pokemon.level === 'number' && pokemon.level > 0) ? pokemon.level : 5;
        const spriteUrl = pokemon.sprite || '';

        const item = document.createElement('div');
        item.classList.add('pokemon-item');
        if (pokemon.isShiny) item.classList.add('shiny');
        
        item.innerHTML = `
            ${pokemon.isFavorite ? '<span class="favorite-star">★</span>' : ''}
            <span class="level-badge">Lv.${level}</span>
            <div class="mini-shadow"></div>
            <img src="${spriteUrl}" alt="${name}" onerror="this.style.display='none'">
            <div class="name">${name}</div>
        `;
        item.addEventListener('click', () => openPokemonDetail(pokemon)); // Ajout du gestionnaire de clic
        listeElement.appendChild(item);
    });
}

// --- DÉTAIL ---
function formatType(t) { return `<span class="chip type-${t}">${formatTypeLabel(t)}</span>`; }
function formatMoveName(n) { return (n || '').replace(/-/g, ' ').toUpperCase(); }

// Onglets de la fiche Pokémon
function switchDetailTab(tab) {
    document.querySelectorAll('#pokemon-detail-card .sheet-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('#pokemon-detail-card .sheet-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
}

// Rôle de combat (Tank, Attaquant…) calculé comme en combat, à partir des stats et des attaques équipées
function renderDetailRole(pokemon) {
    const el = document.getElementById('detail-role');
    if (!el || typeof BattleRules === 'undefined') return;
    const base = GameData.getPokedexSubset().find(p => p.id === pokemon.id);
    const moves = selectionState.selected.map(id => ({ ...(MOVES_FR[id] || {}), id }));
    const roleKey = BattleRules.computeRole(base?.stats, moves);
    const role = BattleRules.ROLES[roleKey];
    const rows = role.rows.map(r => BattleRules.ROW_LABEL[r]).join(', ');
    const height = base?.height ? `${String(base.height).replace('.', ',')} m` : '';
    el.innerHTML = `
        <div class="sheet-role-head"><span class="role-badge role-${roleKey} well-placed">${role.label}</span><small>Lignes : ${rows}</small></div>
        <div class="sheet-role-desc">${role.desc}</div>
        ${height ? `<div class="sheet-role-size">Taille : ${height}</div>` : ''}`;
}

function openPokemonDetail(pokemon) {
    try {
        if (!pokemon) return;
    CURRENT_POKEMON = pokemon;
    const name = safeName(pokemon);
    const level = (typeof pokemon.level === 'number' && pokemon.level > 0) ? pokemon.level : 5;
    
    // Header with Favorite toggle
    document.getElementById('detail-title').innerHTML = `
        ${name} 
        <span class="favorite-toggle ${pokemon.isFavorite ? 'active' : ''}" 
              onclick="event.stopPropagation(); handleToggleFavorite('${pokemon.instanceId}')"
              title="Mettre en favori">
              ${pokemon.isFavorite ? '★' : '☆'}
        </span>
    `;

    const spriteEl = document.getElementById('detail-sprite');
    spriteEl.src = pokemon.sprite || '';
    spriteEl.style.display = pokemon.sprite ? 'block' : 'none';
    if (pokemon.isShiny) spriteEl.classList.add('shiny-glow');
    else spriteEl.classList.remove('shiny-glow');

    document.getElementById('detail-level').textContent = `Niveau: ${level}`;
    const types = Array.isArray(pokemon.types) ? pokemon.types : [];
    document.getElementById('detail-types').innerHTML = types.map(formatType).join('');
    
    // Customization info (Nature, Ability, Shiny)
    let traitHtml = `
        <div class="pokemon-traits">
            <div class="trait-item"><strong>Nature :</strong> ${pokemon.nature?.name || pokemon.nature || 'Inconnue'}</div>
            <div class="trait-item"><strong>Talent :</strong> ${pokemon.ability || 'Aucun'}</div>
            ${pokemon.isShiny ? `<div class="trait-item shiny-badge">${Art.item('shiny-charm', 20)} SHINY</div>` : ''}
        </div>
    `;
    
    document.getElementById('detail-description').innerHTML = (pokemon.description || '') + traitHtml;


    // Moves <= level
    const moves = Array.isArray(pokemon.moves) ? pokemon.moves.filter(m => (m && typeof m.level === 'number' ? m.level : 0) <= level) : [];
    // Attaques apprises par CT
    (pokemon.ctMoves || []).forEach(name => { if (!moves.some(m => m.name === name)) moves.push({ name, level: 0, ct: true }); });
    CURRENT_AVAILABLE_MOVES = moves;

    // Équipées: initialiser la sélection
    const availableNames = moves.map(m => m.name);
    const equipped = Array.isArray(pokemon.selectedMoves) ? pokemon.selectedMoves : [];
    selectionState.selected = equipped.length ? equipped.filter(n => availableNames.includes(n)).slice(0, 4) : availableNames.slice(0, Math.min(4, availableNames.length));

    // Filtre les capacités de statut pour la sélection du Z-Move
    const nonStatusEquippedMoves = selectionState.selected.filter(moveName => {
        const moveData = MOVES_FR[moveName] || {};
        return moveData.damage_class !== 'status';
    });

    // Vérifie si le Z-Move actuel est valide (pas un statut)
    const currentBoostedIsValid = pokemon.boostedMove && nonStatusEquippedMoves.includes(pokemon.boostedMove);

    selectionState.boosted = currentBoostedIsValid ? pokemon.boostedMove : (nonStatusEquippedMoves[0] || null);

    // Sauvegarde immédiate de la sélection de Z-move par défaut ou corrigée
    if (pokemon.boostedMove !== selectionState.boosted) {
        GameData.setPokemonMoves(pokemon.instanceId, selectionState.selected, selectionState.boosted);
        pokemon.boostedMove = selectionState.boosted;
    }
    
    renderMovesManager();
    renderStatsTable(pokemon);
    renderDetailRole(pokemon);
    switchDetailTab('stats');

    // Item Management
    renderItemSlot(pokemon);
    
    // Boosters Management
    renderBoosters(pokemon);

    // Évolution
    let evoText = 'Aucune évolution connue.';
    const evoActions = document.getElementById('evolution-actions');
    if (evoActions) evoActions.innerHTML = '';

    const possibleEvolutions = GameData.checkEvolution ? GameData.checkEvolution(pokemon.instanceId) : null;
    
    if (possibleEvolutions) {
        evoText = 'Évolution possible !';
        possibleEvolutions.forEach(evo => {
            const container = document.createElement('div');
            container.style.marginTop = "5px";

            const btn = document.createElement('button');
            btn.className = 'pk-btn-action';
            btn.textContent = `Évoluer en ${evo.targetName}`;
            btn.style.width = "100%";
            
            if (!evo.canEvolve) {
                btn.disabled = true;
                btn.style.opacity = "0.5";
                btn.style.cursor = "not-allowed";
                btn.title = evo.reason;
            } else {
                btn.onclick = () => triggerEvolution(pokemon.instanceId, evo.targetId);
            }
            container.appendChild(btn);

            if (evo.reason) {
                const info = document.createElement('div');
                info.style.fontSize = "10px";
                info.style.color = evo.canEvolve ? "green" : "red";
                info.textContent = evo.reason;
                container.appendChild(info);
            }
            if (evoActions) evoActions.appendChild(container);
        });
    } else if (pokemon.evolution) {
        // Fallback pour affichage informatif si pas de checkEvolution ou pas prêt
         const evo = pokemon.evolution;
         const subset = GameData.getPokedexSubset ? GameData.getPokedexSubset() : [];
         const target = Array.isArray(subset) ? subset.find(p => p.id === evo.targetId) : null;
         const evoName = target ? safeName(target) : (evo.name || `#${evo.targetId}`);
         evoText = `Évolue en ${evoName} (Conditions non remplies)`;
    }

    document.getElementById('detail-evolution').textContent = evoText;

    document.getElementById('center-pokemon-detail-modal').style.display = 'flex';
    } catch (e) {
        console.error("Erreur openPokemonDetail:", e);
        alert("Erreur lors de l'ouverture du détail: " + e.message);
    }
}

function renderStatsTable(pokemon) {
    const container = document.getElementById('detail-stats-container');
    if (!container) return;

    const stats = pokemon.stats || {};
    const ivs = pokemon.ivs || {};
    const evs = pokemon.evs || {};
    const nature = (typeof pokemon.nature === 'string') 
        ? GameData._load().pokemons.find(p => p.instanceId === pokemon.instanceId)?.nature // Fallback check or get from NATURES
        : pokemon.nature;
    
    // Find nature impact for colors
    // We can assume GameData has the NATURES list or we re-map it here
    const NATURES_MAP = [
        { name: "Hardi", plus: null, minus: null }, { name: "Solo", plus: "atk", minus: "def" },
        { name: "Brave", plus: "atk", minus: "speed" }, { name: "Rigide", plus: "atk", minus: "spatk" },
        { name: "Mauvais", plus: "atk", minus: "spdef" }, { name: "Assuré", plus: "def", minus: "atk" },
        { name: "Docile", plus: null, minus: null }, { name: "Relax", plus: "def", minus: "speed" },
        { name: "Malin", plus: "def", minus: "spatk" }, { name: "Lâche", plus: "def", minus: "spdef" },
        { name: "Timide", plus: "speed", minus: "atk" }, { name: "Pressé", plus: "speed", minus: "def" },
        { name: "Sérieux", plus: null, minus: null }, { name: "Jovial", plus: "speed", minus: "spatk" },
        { name: "Naïf", plus: "speed", minus: "spdef" }, { name: "Modeste", plus: "spatk", minus: "atk" },
        { name: "Doux", plus: "spatk", minus: "def" }, { name: "Discret", plus: "spatk", minus: "speed" },
        { name: "Pudique", plus: null, minus: null }, { name: "Foufou", plus: "spatk", minus: "spdef" },
        { name: "Calme", plus: "spdef", minus: "atk" }, { name: "Gentil", plus: "spdef", minus: "def" },
        { name: "Malpoli", plus: "spdef", minus: "speed" }, { name: "Prudent", plus: "spdef", minus: "spatk" },
        { name: "Bizarre", plus: null, minus: null }
    ];

    const currentNature = (typeof pokemon.nature === 'object' && pokemon.nature.name) ? pokemon.nature : NATURES_MAP.find(n => n.name === pokemon.nature);

    const statRows = [
        { key: 'hp', label: 'PV' },
        { key: 'atk', label: 'Attaque' },
        { key: 'def', label: 'Défense' },
        { key: 'spatk', label: 'Att. Spé.' },
        { key: 'spdef', label: 'Déf. Spé.' },
        { key: 'speed', label: 'Vitesse' }
    ];

    let html = `
        <table class="stats-table detailed-stats">
            <thead>
                <tr>
                    <th class="stat-name">Stat</th>
                    <th>Total</th>
                    <th class="stat-detail-header" title="Base Stats">Base</th>
                    <th class="stat-detail-header" title="Individual Values">IV</th>
                    <th class="stat-detail-header" title="Effort Values">EV</th>
                </tr>
            </thead>
            <tbody>
    `;

    statRows.forEach(row => {
        let valClass = '';
        if (currentNature) {
            if (currentNature.plus === row.key) valClass = 'stat-bonus';
            else if (currentNature.minus === row.key) valClass = 'stat-penalty';
        }

        // We need base stats from pokedex if not in instance
        const baseVal = (pokemon.stats && pokemon.stats[row.key]) || 0; 
        
        // Base stats lookup
        const subset = GameData.getPokedexSubset();
        const basePk = subset.find(p => p.id === pokemon.id);
        const actualBase = basePk ? basePk.stats[row.key] : '--';
        
        // IV/EV
        const ivVal = ivs[row.key] !== undefined ? ivs[row.key] : '--';
        const evVal = evs[row.key] !== undefined ? evs[row.key] : '--';

        html += `
            <tr>
                <td class="stat-name">${row.label}</td>
                <td class="stat-val ${valClass}">${stats[row.key] || '--'}</td>
                <td class="stat-detail">${actualBase}</td>
                <td class="stat-detail">${ivVal}</td>
                <td class="stat-detail">${evVal}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    container.innerHTML = html;
}

async function triggerEvolution(instanceId, targetId) {
    const ok = await UI.confirm("Faire évoluer ce Pokémon ? C'est irréversible et l'objet requis sera consommé.", { title: 'Évolution', okLabel: 'Évoluer' });
    if (!ok) return;

    const result = GameData.evolvePokemon(instanceId, targetId);
    if (result.success) {
        alert(`Félicitations ! Votre Pokémon a évolué en ${result.newPokemon.name} !`);
        closePokemonDetail();
        // Refresh PC List
        const pokemons = GameData.getPokemons();
        renderPokemonList(pokemons);
        // Re-open detail to show new form
        setTimeout(() => openPokemonDetail(result.newPokemon), 100);
    } else {
        alert(result.reason);
    }
}

function getMoveDetails(moveName) {
    const moveData = (MOVES_FR && MOVES_FR[moveName]) || MOVES_FR_FALLBACK[moveName] || {};
    const nameFr = moveData.name_fr || formatMoveName(moveName);
    const type = moveData.type || 'normal';
    const power = moveData.power ?? '--';
    const accuracy = moveData.accuracy ?? '--';
    const damage_class = moveData.damage_class ? (
        { physical: 'Phys.', special: 'Spé.', status: 'Statut' }[moveData.damage_class] || moveData.damage_class
    ) : '--';
    return { nameFr, type, power, accuracy, damage_class };
}

function renderMovesManager() {
    const equippedContainer = document.getElementById('equipped-moves-list');
    const availableContainer = document.getElementById('available-moves-list');
    equippedContainer.innerHTML = '';
    availableContainer.innerHTML = '';

    document.getElementById('equipped-count').textContent = selectionState.selected.length;

    CURRENT_AVAILABLE_MOVES.forEach(move => {
        const moveData = (MOVES_FR && MOVES_FR[move.name]) || {};
        const { nameFr, type, power, accuracy, damage_class } = getMoveDetails(move.name);
        const isSelected = selectionState.selected.includes(move.name);
        const isBoosted = selectionState.boosted === move.name;
        const isStatusMove = moveData.damage_class === 'status';
        // Refonte : chaque capacité a une version Z (attaques, tactiques et Éveil des passifs)
        const rw = moveData.rw || null;

        const moveItem = document.createElement('div');
        moveItem.className = 'move-item';

        let actionHtml = '';
        if (isSelected) {
            let boostRadioHtml = '';
            if (!isStatusMove || rw) {
                boostRadioHtml = `
                    <div class="boost-radio">
                        <input type="radio" name="boosted-move" id="boost-${move.name}" 
                               onchange="setBoostedMove('${move.name}')" 
                               ${isBoosted ? 'checked' : ''}>
                        <label for="boost-${move.name}" title="Attaque Z">Z</label>
                    </div>
                `;
            }
            actionHtml = `
                ${boostRadioHtml}
                <button class="move-action-btn btn-unequip" onclick="unequipMove('${move.name}')">Retirer</button>
            `;
        } else {
            actionHtml = `
                <button class="move-action-btn btn-equip" onclick="equipMove('${move.name}')" 
                        ${selectionState.selected.length >= 4 ? 'disabled' : ''}>
                    Équiper
                </button>
            `;
        }

        const ref = CURRENT_POKEMON?.moveRefinements?.[move.name];
        const refLevel = ref ? Refinement.levelOf(ref) : 1;
        const refStars = ref ? Refinement.starsOf(ref) : 0;
        const refMult = Refinement.getMultiplier(refLevel, refStars);
        const basePower = rw?.kind === 'attack' ? rw.power : power;
        const shownPower = typeof basePower === 'number' && basePower > 1 ? Math.round(basePower * refMult) : basePower;
        const reach = typeof BattleRules !== 'undefined' && (moveData.power || 0) > 0 && moveData.damage_class !== 'status'
            ? (BattleRules.isContact(moveData) ? 'Contact' : 'Distance') : '';
        moveItem.title = (moveData.description_game || moveData.description_fr || '') + (moveData.description_z ? `
Version Z : ${moveData.description_z}` : '');
        // Genre de la capacité : un passif occupe un emplacement mais ne se lance jamais
        const kindHtml = rw ? `<span class="move-kind kind-${rw.kind}">${rw.kind === 'passive' ? `Passif · ${rw.triggerLabel || ''}` : rw.kind === 'tactic' ? 'Tactique' : (moveData.zone_label || 'Attaque').replace(/\s*\(.*\)$/, '')}</span>` : '';
        moveItem.innerHTML = `
            <div class="move-header">
                <span class="move-name">${nameFr}</span>
                <span class="type-badge type-${type}">${formatTypeLabel(type)}</span>
            </div>
            <div class="move-details">
                <div class="move-stats">
                    ${kindHtml}
                    ${rw?.kind === 'passive' ? '' : `<span>Puiss. ${shownPower}</span>`}
                    <span>Préc. ${accuracy}</span>
                    <span>${damage_class}</span>
                    ${reach ? `<span class="move-reach ${reach === 'Contact' ? 'contact' : 'ranged'}">${reach}</span>` : ''}
                    ${refLevel > 1 || refStars ? `<span class="move-ref">Nv ${refLevel}${refStars ? ' ' + '★'.repeat(Math.min(refStars, 3)) + (refStars > 3 ? refStars : '') : ''}</span>` : ''}
                </div>
                <div class="move-actions">
                    ${actionHtml}
                </div>
            </div>
            <div class="move-level">${move.ct ? 'Appris par CT' : `Appris Lv. ${move.level}`}</div>
        `;

        if (isSelected) {
            equippedContainer.appendChild(moveItem);
        } else {
            availableContainer.appendChild(moveItem);
        }
    });
    renderLearnableCTs(availableContainer);
}

// CT du sac que ce Pokémon peut apprendre : une touche pour l'apprendre (la CT est consommée)
function renderLearnableCTs(container) {
    if (!CURRENT_POKEMON || typeof GameData.getLearnableCTs !== 'function') return;
    const cts = GameData.getLearnableCTs(CURRENT_POKEMON);
    if (!cts.length) return;
    const block = document.createElement('div');
    block.className = 'ct-learn-block';
    block.innerHTML = `<h4>CT compatibles</h4>` + cts.map(id => {
        const it = GameData.getItem(id);
        const mv = (MOVES_FR && MOVES_FR[it.move]) || {};
        return `<div class="move-item ct-learn">
            <div class="move-header"><span class="move-name">${mv.name_fr || it.move}</span><span class="type-badge type-${mv.type || 'normal'}">${formatTypeLabel(mv.type || 'normal')}</span></div>
            <div class="move-details"><div class="move-stats"><span>${it.name_fr}</span></div>
            <div class="move-actions"><button class="move-action-btn btn-equip" onclick="learnCtMove('${id}')">Apprendre</button></div></div>
        </div>`;
    }).join('');
    container.appendChild(block);
}

function learnCtMove(itemId) {
    const res = GameData.learnCT(CURRENT_POKEMON.instanceId, itemId);
    if (!res.success) { alert(res.reason); return; }
    const fresh = GameData.getPokemons().find(p => p.instanceId === CURRENT_POKEMON.instanceId);
    if (fresh) openPokemonDetail(fresh);
    switchDetailTab('moves');
}

function equipMove(moveName) {
    if (selectionState.selected.length < 4 && !selectionState.selected.includes(moveName)) {
        selectionState.selected.push(moveName);
        if (!selectionState.boosted) selectionState.boosted = selectionState.selected[0];
        GameData.setPokemonMoves(CURRENT_POKEMON.instanceId, selectionState.selected, selectionState.boosted);
        renderMovesManager();
        renderDetailRole(CURRENT_POKEMON);
    }
}

function unequipMove(moveName) {
    selectionState.selected = selectionState.selected.filter(name => name !== moveName);
    if (selectionState.boosted === moveName) {
        // Trouve la première capacité non-statut pour la définir comme Z-Move par défaut
        const nonStatusEquippedMoves = selectionState.selected.filter(name => {
            const moveData = MOVES_FR[name] || {};
            return moveData.damage_class !== 'status';
        });
        selectionState.boosted = nonStatusEquippedMoves[0] || null;
    }
    GameData.setPokemonMoves(CURRENT_POKEMON.instanceId, selectionState.selected, selectionState.boosted);
    renderMovesManager();
    renderDetailRole(CURRENT_POKEMON);
}

function setBoostedMove(moveName) {
    if (selectionState.selected.includes(moveName)) {
        selectionState.boosted = moveName;
        GameData.setPokemonMoves(CURRENT_POKEMON.instanceId, selectionState.selected, selectionState.boosted);
        renderMovesManager();
    }
}


function renderItemSlot(pokemon) {
    let detailRight = document.querySelector('.detail-right');
    if (!detailRight) return;

    // Check if slot already exists
    let existingSlot = document.getElementById('item-management-section');
    if (existingSlot) existingSlot.remove();

    const slotDiv = document.createElement('div');
    slotDiv.id = 'item-management-section';
    slotDiv.innerHTML = `
        <div class="section-title">Objet Tenu</div>
        <div class="item-slot-container">
            <div id="held-item-display" class="held-item-info">
                ${pokemon.heldItem ? renderHeldItem(pokemon.heldItem) : '<span class="none">Aucun objet</span>'}
            </div>
            <button class="pk-btn-action small" onclick="pickItemForEquip('${pokemon.instanceId}')">Changer</button>
            ${pokemon.heldItem ? `<button class="pk-btn-action small btn-unequip" onclick="handleUnequip('${pokemon.instanceId}')">Retirer</button>` : ''}
        </div>
    `;
    
    // Append to detail-right instead of trying to insert before sibling
    detailRight.appendChild(slotDiv);
}

function renderHeldItem(itemId) {
    const item = GameData.getItem(itemId); // Use GameData's getItem
    if (!item) return `<span class="none">${itemId}</span>`;
    return `
        <img src="${item.sprite || Art.FALLBACK}" style="width:24px; vertical-align:middle;">
        <span>${item.name_fr}</span>
    `;
}

function handleUnequip(instanceId) {
    const result = GameData.unequipItem(instanceId);
    if (result.success) {
        renderItemSlot(result.pokemon);
    } else {
        alert(result.reason);
    }
}

async function pickItemForEquip(instanceId) {
    // We can reuse displayLocker logic or a simpler pick list
    const inventory = GameData.getInventory().items || {};
    // Seuls les objets de combat et les baies se tiennent
    const pockets = GameData.getItemsByPocket();
    const holdable = new Set([...(pockets.battle || []), ...(pockets.berries || [])].map(i => i.id));
    const ownedItems = Object.entries(inventory).filter(([id, count]) => count > 0 && holdable.has(id));
    
    if (ownedItems.length === 0) {
        alert("Aucun objet à tenir dans ton sac (baies et objets de combat).");
        return;
    }

    let listHtml = ownedItems.map(([id, count]) => { // This uses allItemsData
        const item = GameData.getItem(id); // Use GameData's getItem
        return `
            <div class="item-pick-option" onclick="confirmEquip('${instanceId}', '${id}')">
                <img src="${item.sprite || Art.FALLBACK}" style="width:32px;">
                <span>${item.name_fr} (x${count})</span>
            </div>
        `;
    }).join('');

    // Modal temporaire pour choix
    const pickerModal = document.createElement('div');
    pickerModal.id = 'item-picker-temporary';
    pickerModal.className = 'modal';
    pickerModal.style.display = 'flex';
    pickerModal.style.zIndex = '300';
    pickerModal.innerHTML = `
        <div class="modal-content" style="max-width:400px;">
            <span class="close-button" onclick="this.closest('.modal').remove()">&times;</span>
            <h3>Choisir un objet</h3>
            <div class="item-picker-list">${listHtml}</div>
        </div>
    `;
    document.body.appendChild(pickerModal);
}

window.confirmEquip = function(instanceId, itemId) {
    const result = GameData.equipItem(instanceId, itemId);
    if (result.success) {
        document.getElementById('item-picker-temporary')?.remove();
        renderItemSlot(result.pokemon);
    } else {
        alert(result.reason);
    }
};

function handleToggleFavorite(instanceId) {
    const res = GameData.toggleFavorite(instanceId);
    if (res.success) {
        // Find the pokemon object to update CURRENT_POKEMON
        const p = GameData.getPokemonByInstanceId(instanceId);
        if (p) {
            openPokemonDetail(p); // Refresh modal
            renderPCView(); // Refresh list to update sort
        }
    }
}


// Objets utilisables depuis la fiche : capsules, natures, Mochi Renouveau ; et accès à l'entraînement IV/EV
const STAT_SHORT = { hp: 'PV', atk: 'ATQ', def: 'DÉF', spatk: 'ASP', spdef: 'DSP', speed: 'VIT' };
function renderBoosters(pokemon) {
    const container = document.getElementById('detail-boosters-container');
    if (!container) return;
    const inv = GameData.getInventory().items || {};
    const uses = [
        { key: 'gold-bottle-cap', label: 'Toutes les IV de base à 31' },
        { key: 'silver-bottle-cap', label: 'Une IV de base à 31', pick: true },
        { key: 'ability-capsule', label: 'Nature au hasard' },
        { key: 'ability-patch', label: 'Nature : + la stat choisie', pick: true, noHp: true },
        { key: 'fresh-start-mochi', label: 'Remise à zéro des EV (remboursés)' },
        { key: 'rare-candy', label: '+1 niveau', candy: true },
        { key: 'exp-candy-xs', label: '+100 XP (500 XP = 1 niveau)', candy: true },
        { key: 'exp-candy-s', label: '+500 XP', candy: true },
        { key: 'exp-candy-m', label: '+1 500 XP', candy: true },
        { key: 'exp-candy-l', label: '+5 000 XP', candy: true },
        { key: 'exp-candy-xl', label: '+15 000 XP', candy: true },
    ].filter(u => inv[u.key] > 0);
    container.style.display = 'block';
    container.innerHTML = `
        <div class="section-title">Entraînement</div>
        <div class="train-shortcuts">
            <button class="pk-btn-action small" onclick="openStatTraining('${pokemon.instanceId}', 'iv')">IV</button>
            <button class="pk-btn-action small" onclick="openStatTraining('${pokemon.instanceId}', 'ev')">EV</button>
            <button class="pk-btn-action small" onclick="openStatTraining('${pokemon.instanceId}', 'moves')">Capacités</button>
        </div>
        ${uses.length ? `<div class="section-title">Objets</div>
        <div class="boosters-list">
            ${uses.map(u => `
                <div class="booster-item">
                    <span class="booster-emoji">${Art.item(u.key === 'silver-bottle-cap' ? 'bottle-cap' : u.key, 32)}</span>
                    <span class="booster-name">${GameData.getItem(u.key)?.name_fr || u.key} (x${inv[u.key]})<small>${u.label}</small></span>
                    <span class="booster-actions">${u.pick
                        ? Object.keys(STAT_SHORT).filter(k => !(u.noHp && k === 'hp')).map(k => `<button class="pk-btn-action small" onclick="applyBooster('${u.key}', '${pokemon.instanceId}', '${k}')">${STAT_SHORT[k]}</button>`).join('')
                        : `<button class="pk-btn-action small" onclick="applyBooster('${u.key}', '${pokemon.instanceId}')">Utiliser</button>${u.candy && inv[u.key] >= 10 ? `<button class="pk-btn-action small" onclick="applyBooster('${u.key}', '${pokemon.instanceId}', null, 10)">×10</button>` : ''}`}</span>
                </div>`).join('')}
        </div>` : ''}
    `;
}

function openStatTraining(instanceId, tab) {
    const pk = GameData.getPokemons().find(p => p.instanceId === instanceId);
    if (!pk || typeof RefinementUI === 'undefined') return;
    closePokemonDetail();
    RefinementUI.open(pk, 'pokemon');
    RefinementUI.switchTab(tab);
}

function applyBooster(itemKey, pokemonId, stat = null, count = 1) {
    let res;
    if (GameData.CANDY_XP?.[itemKey]) res = GameData.useCandy(pokemonId, itemKey, count);
    else if (itemKey === 'silver-bottle-cap') res = GameData.useBottleCap(pokemonId, stat);
    else if (itemKey === 'ability-capsule' || itemKey === 'ability-patch') res = GameData.changeNature(pokemonId, itemKey, stat);
    else if (itemKey === 'fresh-start-mochi') res = GameData.resetEvTraining(pokemonId);
    else res = GameData.useItemOnPokemon(itemKey, pokemonId);
    if (!res?.success) { alert(res?.reason || 'Impossible.'); return; }
    if (res.nature) alert(`Nouvelle nature : ${res.nature.name}`);
    refreshDetail(pokemonId);
}

function refreshDetail(pokemonId) {
    const data = GameData._load();
    const pokemon = data.pokemons.find(p => p.instanceId === pokemonId);
    if (pokemon) {
        openPokemonDetail(pokemon);
        renderPCView(); // Refresh the grid too
    }
}
