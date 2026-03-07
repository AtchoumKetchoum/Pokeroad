// ID de la modale actuellement ouverte
let currentOpenModalId = null;



function updateIncubatorBadge() {
    const incubatorColumn = document.querySelector('.lab-column:first-child');
    if (!incubatorColumn) return;

    // Supprimer le badge existant
    const existingBadge = incubatorColumn.querySelector('.notification-badge');
    if (existingBadge) existingBadge.remove();

    const incubatorEggs = GameData.getIncubatorEggs ? GameData.getIncubatorEggs() : [];
    const readyEggsCount = incubatorEggs.filter(egg => Date.now() >= egg.endTime).length;

    if (readyEggsCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.textContent = readyEggsCount;
        badge.title = `${readyEggsCount} œuf(s) prêt(s) à éclore !`;
        incubatorColumn.appendChild(badge);
    }
}

window.initLabo = async () => {
    // On s'assure que GameData est initialisé pour avoir accès aux données de sauvegarde
    await GameData.init();

    updateIncubatorBadge();

    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', (event) => {
            // Ferme la modale si l'on clique sur l'arrière-plan (l'overlay)
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    // Gestion de l'ouverture automatique via URL (ex: ?open=incubator)
    const urlParams = new URLSearchParams(window.location.search);
    const focus = urlParams.get('open');
    if (focus === 'incubator') {
        openModal('incubator-modal');
    }
};

// --- MODAL MANAGEMENT ---

/**
 * Ouvre une modale en utilisant son ID.
 * @param {string} modalId L'ID de la modale à ouvrir.
 */
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        if (modalId === 'incubator-modal') {
            displayIncubator();
        }

        modal.style.display = 'flex';
        currentOpenModalId = modalId;
        // Le bouton de fermeture est maintenant dans la modale elle-même
    }
}

/**
 * Ferme une modale.
 * @param {string} modalId L'ID de la modale à fermer.
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        currentOpenModalId = null;
        if (modalId === 'incubator-modal') {
            updateIncubatorBadge();
        }
    }
}

/**
 * Ferme la modale actuellement ouverte.
 */
function closeCurrentModal() {
    if (currentOpenModalId) {
        closeModal(currentOpenModalId);
    }
}

/**
 * Redirige l'utilisateur vers la page d'accueil.
 */
function goToHome() {
    ViewManager.show('home');
}

// --- UI RENDERING ---

function createPokemonCard(pokemon, onClick) {
    const card = document.createElement('div');
    card.className = 'pokemon-card-lab';
    if (onClick) card.onclick = onClick;
    
    const grade = pokemon.grade || 0;
    let stars = '';
    for(let i = 0; i < grade; i++) {
        stars += '⭐';
    }

    card.innerHTML = `
        <img src="${pokemon.sprite}" alt="${pokemon.name}">
        <p>${pokemon.name}</p>
        <p>Lv. ${pokemon.level}</p>
        <p>${stars || 'Grade 0'}</p>
    `;
    return card;
}

/**
 * Met à jour l'affichage de l'incubateur.
 * @returns {void}
 */
function displayIncubator() {
    const container = document.getElementById('incubator-slots-container');
    container.innerHTML = ''; 

    const unlockedCount = GameData.getUnlockedIncubators();
    const incubatorEggs = GameData.getIncubatorEggs();
    const now = Date.now();
    let readyEggsCount = 0;

    // Header avec bouton "Tout éclore"
    const headerRow = document.createElement('div');
    headerRow.className = 'incubator-header-row';
    
    incubatorEggs.forEach(egg => { if (now >= egg.endTime) readyEggsCount++; });

    headerRow.innerHTML = `
        <div class="stats-info">
            <span>🔋 ${unlockedCount}/10 Incubateurs actifs</span>
        </div>
        ${readyEggsCount > 0 ? `
            <button class="hatch-all-premium" onclick="hatchAll()">
                ✨ Faire tout éclore (${readyEggsCount})
            </button>
        ` : ''}
    `;
    container.appendChild(headerRow);

    const grid = document.createElement('div');
    grid.id = 'incubator-grid-premium';

    for (let i = 0; i < 10; i++) {
        const slot = document.createElement('div');
        slot.className = 'incubator-slot-premium';
        
        if (i < unlockedCount) {
            const egg = incubatorEggs[i];
            if (egg) {
                const rarityKey = (egg.rarity || 'commun').toLowerCase().replace(/ /g, '').replace(/[éèê]/g, 'e');
                // On essaie d'abord l'image spécifique, sinon une par défaut
                const eggSprite = `assets/egg_${rarityKey}.png`;
                const isReady = now >= egg.endTime;
                
                if (isReady) {
                    slot.classList.add('ready');
                    slot.innerHTML = `
                        <div class="incubator-base">
                            <img src="assets/incubateur.png" class="incubator-img">
                            <div class="egg-container ready-glow">
                                <img src="${eggSprite}" class="egg-img floating" onerror="this.src='assets/egg.png'">
                            </div>
                        </div>
                        <div class="slot-status ready-text">PRÊT !</div>
                    `;
                    slot.onclick = () => hatchEgg(egg.instanceId);
                } else {
                    const remainingTime = egg.endTime - now;
                    const totalTime = egg.endTime - egg.startTime;
                    const progress = totalTime > 0 ? ((totalTime - remainingTime) / totalTime) * 100 : 0;
                    
                    slot.innerHTML = `
                        <div class="incubator-base">
                            <img src="assets/incubateur.png" class="incubator-img incubating">
                            <div class="egg-container">
                                <img src="${eggSprite}" class="egg-img rotating" onerror="this.src='assets/egg.png'">
                            </div>
                        </div>
                        <div class="progress-container">
                            <div class="progress-fill" style="width: ${progress}%"></div>
                        </div>
                        <div class="slot-timer">${formatTime(remainingTime)}</div>
                    `;
                }
            } else {
                slot.classList.add('empty');
                slot.innerHTML = `
                    <div class="incubator-base">
                        <img src="assets/incubateur.png" class="incubator-img empty">
                    </div>
                    <div class="slot-status">VIDE</div>
                `;
                slot.onclick = () => openEggBagModal();
            }
        } else {
            slot.classList.add('locked');
            const COSTS = [0, 5000, 15000, 30000, 75000, 150000, 300000, 600000, 1200000, 2500000];
            const cost = COSTS[i] || 0;
            slot.innerHTML = `
                <div class="incubator-base">
                    <img src="assets/incubateur.png" class="incubator-img locked">
                    <div class="lock-shine"></div>
                </div>
                <div class="lock-details">
                    <span class="lock-icon">🔒</span>
                    <span class="lock-price">${cost.toLocaleString('fr-FR')} $</span>
                </div>
            `;
            if (i === unlockedCount) {
                slot.classList.add('next-unlock');
                slot.onclick = () => buyIncubatorSlot();
            }
        }
        grid.appendChild(slot);
    }
    container.appendChild(grid);
}

function buyIncubatorSlot() {
    const result = GameData.buyIncubatorSlot();
    if (result.success) {
        alert(`Incubateur débloqué pour ${result.cost.toLocaleString('fr-FR')} $ ! Vous avez maintenant ${result.newCount} incubateurs.`);
        displayIncubator(); // Rafraîchir la vue
    } else {
        alert(`Échec : ${result.reason}`);
    }
}

function formatTime(ms) {
    if (ms <= 0) return "00:00:00";
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);
    seconds %= 60;
    minutes %= 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function hatchEgg(eggInstanceId) {
    const result = GameData.hatchEgg(eggInstanceId);
    if (result.success) {
        const pk = result.pokemon;
        alert(`Félicitations ! Votre œuf a éclos et a révélé un ${pk.name} !`);
        displayIncubator(); // Rafraîchir la vue
    } else {
        alert(`Éclosion échouée : ${result.reason}`);
    }
}

async function hatchAll() {
    const result = GameData.hatchAllReadyEggs();
    if (result.success && result.hatchedPokemons.length > 0) {
        const names = result.hatchedPokemons.map(p => p.name).join(', ');
        alert(`Félicitations ! Vous avez fait éclore ${result.hatchedPokemons.length} Pokémon : ${names}`);
        displayIncubator(); // Rafraîchir la vue
    } else {
        alert(`Éclosion échouée : ${result.reason || "Aucun œuf prêt."}`);
    }
}

// --- MODAL SAC A OEUFS (SÉLECTION) ---
let currentEggRarityFilter = 'all';

function openEggBagModal() {
    const modal = document.getElementById('egg-bag-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    currentEggRarityFilter = 'all';
    
    renderEggRarityFilters();
    renderEggSelectionGrid();
}

function renderEggRarityFilters() {
    const container = document.getElementById('egg-rarity-filters');
    if (!container) return;

    const eggs = GameData.getEggs();
    const counts = { all: eggs.length };
    eggs.forEach(egg => {
        counts[egg.rarity] = (counts[egg.rarity] || 0) + 1;
    });

    const rarities = ["Commun", "Peu commun", "Rare", "Bébé", "Très rare", "Légendaire", "Mythique"];
    
    let html = `
        <div class="egg-filter-item ${currentEggRarityFilter === 'all' ? 'active' : ''}" onclick="setEggBagFilter('all')" title="Tous les œufs">
            <div class="egg-filter-name">Tous</div>
            <div class="egg-filter-count">${counts.all}</div>
        </div>
    `;

    rarities.forEach(r => {
        const normalizedRarity = normalizeRarity(r);
        html += `
            <div class="egg-filter-item ${currentEggRarityFilter === r ? 'active' : ''}" onclick="setEggBagFilter('${r}')" title="Œufs de rareté ${r}">
                <img src="assets/egg_${normalizedRarity}.png" alt="Œuf ${r}" class="egg-sprite" onerror="this.src='assets/egg_commun.png'">
                <div class="egg-filter-name">${r}</div>
                <div class="egg-filter-count">${counts[r] || 0}</div>
            </div>
        `;
    });

    container.innerHTML = html;
    const totalCountEl = document.getElementById('egg-bag-total-count');
    if (totalCountEl) totalCountEl.textContent = `${eggs.length} œuf(s) au total`;
}

function setEggBagFilter(rarity) {
    currentEggRarityFilter = rarity;
    renderEggRarityFilters();
    renderEggSelectionGrid();
}

function renderEggSelectionGrid() {
    const grid = document.getElementById('egg-selection-grid');
    if (!grid) return;

    let eggs = GameData.getEggs();
    
    if (currentEggRarityFilter !== 'all') {
        eggs = eggs.filter(e => e.rarity === currentEggRarityFilter);
    }

    grid.innerHTML = '';

    if (eggs.length === 0) {
        grid.innerHTML = `
            <div class="egg-empty-state">
                <span>🥚</span>
                <p>${currentEggRarityFilter === 'all' ? 'Votre sac est vide.' : 'Aucun œuf de cette rareté.'}</p>
            </div>
        `;
        return;
    }

    eggs.forEach(egg => {
        const card = document.createElement('div');
        const rarityClass = normalizeRarity(egg.rarity);
        card.className = `egg-pick-card rarity-${rarityClass}`;

        card.innerHTML = `
            <img src="assets/egg_${rarityClass}.png" alt="Œuf ${egg.rarity}" class="egg-sprite" onerror="this.src='assets/egg_commun.png'">
            <div class="egg-rarity-pill bg-${rarityClass}">${egg.rarity}</div>
            <h5>Œuf ${egg.rarity}</h5>
            <button class="pk-btn-action small" onclick="startIncubation('${egg.instanceId}')">Incuber</button>
        `;
        grid.appendChild(card);
    });
}

function startIncubation(eggInstanceId) {
    const result = GameData.addEggToIncubator(eggInstanceId);
    if (result.success) {
        alert("L'œuf a été placé dans un incubateur !");
        closeEggBagModal();
        displayIncubator(); // Refresh incubator view
    } else {
        alert(result.reason || "Impossible d'incuber cet œuf.");
    }
}

function closeEggBagModal() {
    const modal = document.getElementById('egg-bag-modal');
    if (modal) modal.style.display = 'none';
}

function normalizeRarity(rarity) {
    return (rarity || 'commun').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
}
