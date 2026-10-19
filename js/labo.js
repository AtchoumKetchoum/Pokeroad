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
// --- UI RENDERING ---

function createLabPokemonCard(pokemon, onClick) {
    const card = document.createElement('div');
    card.className = 'pokemon-card-lab';
    if (onClick) card.onclick = onClick;
    
    const grade = pokemon.grade || 0;
    let stars = '';
    for(let i = 0; i < grade; i++) {
        stars += Art.stars(1, 14);
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
            <span>${Art.item('cell-battery', 22)} ${unlockedCount}/10 Incubateurs actifs</span>
        </div>
        ${readyEggsCount > 0 ? `
            <button class="hatch-all-premium" onclick="hatchAll()">
                ${Art.item('shiny-stone', 22)} Faire tout éclore (${readyEggsCount})
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
                const isReady = now >= egg.endTime;
                
                if (isReady) {
                    slot.classList.add('ready');
                    slot.innerHTML = `
                        <div class="incubator-base">
                            <span class="incubator-img">${Art.incubator('ready')}</span>
                            <div class="egg-container ready-glow">
                                <span class="egg-img floating">${Art.egg(egg.rarity, 44)}</span>
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
                            <span class="incubator-img incubating">${Art.incubator('busy')}</span>
                            <div class="egg-container">
                                <span class="egg-img rotating">${Art.egg(egg.rarity, 44)}</span>
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
                        <span class="incubator-img empty">${Art.incubator('empty')}</span>
                    </div>
                    <div class="slot-status">VIDE</div>
                `;
                slot.onclick = () => openEggBagModal();
            }
        } else {
            slot.classList.add('locked');
            const COSTS = [0, 1500, 4000, 10000, 25000, 60000, 150000, 400000, 1000000, 2500000];
            const cost = COSTS[i] || 0;
            slot.innerHTML = `
                <div class="incubator-base">
                    <span class="incubator-img locked">${Art.incubator('locked')}</span>
                    <div class="lock-shine"></div>
                </div>
                <div class="lock-details">
                    <span class="lock-icon">${Art.icon('lock', 18)}</span>
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

    const rarities = ["Commun", "Peu Commun", "Rare", "Bébé", "Très Rare", "Légendaire", "Mythique"];
    
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
                <span class="egg-sprite">${Art.egg(r, 34)}</span>
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
                <span>${Art.egg('commun', 48)}</span>
                <p>${currentEggRarityFilter === 'all' ? 'Votre sac est vide.' : 'Aucun œuf de cette rareté.'}</p>
            </div>
        `;
        return;
    }

    // Recyclage groupé de la rareté affichée
    if (currentEggRarityFilter !== 'all') {
        const bulk = document.createElement('div');
        bulk.className = 'egg-bulk-recycle';
        const total = eggs.length * GameData.getEggRecycleValue(currentEggRarityFilter);
        bulk.innerHTML = `<button class="pk-btn-action small danger-btn" onclick="recycleEggRarity('${currentEggRarityFilter}')">Recycler les ${eggs.length} œufs ${currentEggRarityFilter} (+${total.toLocaleString('fr-FR')} $)</button>`;
        grid.appendChild(bulk);
    }

    eggs.forEach(egg => {
        const card = document.createElement('div');
        const rarityClass = normalizeRarity(egg.rarity);
        card.className = `egg-pick-card rarity-${rarityClass}`;

        card.innerHTML = `
            <span class="egg-sprite">${Art.egg(egg.rarity, 52)}</span>
            <div class="egg-rarity-pill bg-${rarityClass}">${egg.rarity}</div>
            <h5>Œuf ${egg.rarity}</h5>
            <button class="pk-btn-action small" onclick="startIncubation('${egg.instanceId}')">Incuber</button>
            <button class="egg-recycle-btn" onclick="recycleEgg('${egg.instanceId}')" title="Recycler contre ${GameData.getEggRecycleValue(egg.rarity)} $">♻ ${GameData.getEggRecycleValue(egg.rarity)} $</button>
        `;
        grid.appendChild(card);
    });
}

async function recycleEgg(instanceId) {
    const res = GameData.recycleEggs({ instanceId });
    if (res.success) UI.toast(`Œuf recyclé : +${res.gained.toLocaleString('fr-FR')} $`, 'success');
    renderEggRarityFilters();
    renderEggSelectionGrid();
    if (typeof updatePlayerHud === 'function') updatePlayerHud(GameData._load());
    if (typeof updateHomeHUD === 'function') updateHomeHUD();
}

async function recycleEggRarity(rarity) {
    const count = GameData.getEggs().filter(e => e.rarity === rarity).length;
    const ok = await UI.confirm(`Recycler ${count} œufs ${rarity} contre ${(count * GameData.getEggRecycleValue(rarity)).toLocaleString('fr-FR')} $ ?`, { title: 'Recyclage', okLabel: 'Recycler' });
    if (!ok) return;
    const res = GameData.recycleEggs({ rarity });
    if (res.success) UI.toast(`${res.count} œufs recyclés : +${res.gained.toLocaleString('fr-FR')} $`, 'success');
    currentEggRarityFilter = 'all';
    renderEggRarityFilters();
    renderEggSelectionGrid();
    if (typeof updatePlayerHud === 'function') updatePlayerHud(GameData._load());
    if (typeof updateHomeHUD === 'function') updateHomeHUD();
}

function startIncubation(eggInstanceId) {
    const result = GameData.addEggToIncubator(eggInstanceId);
    if (result.success) {
        alert("L'œuf a été placé dans un incubateur !");
        closeEggBagModal();
        // Le sac à œufs s'ouvre depuis l'accueil et depuis le labo : on rafraîchit les deux
        if (typeof displayIncubator === 'function') displayIncubator();
        if (typeof updateHomeHUD === 'function') updateHomeHUD();
    } else {
        alert(result.reason || "Impossible d'incuber cet œuf.");
    }
}

function closeEggBagModal() {
    const modal = document.getElementById('egg-bag-modal');
    if (modal) modal.style.display = 'none';
}

