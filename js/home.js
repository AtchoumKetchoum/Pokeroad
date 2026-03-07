/**
 * home.js - Logique de la page d'accueil
 * Gère la navigation, les missions, le sac à œufs et les paramètres
 */

const TYPE_FR = {
    normal: 'Normal', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', ice: 'Glace',
    fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte',
    rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée',
    shadow: 'Ombre'
};

function formatTypeLabel(code) { return TYPE_FR[code.toLowerCase()] || code; }

let missionTeamSelection = [];
let missionUpdateInterval;

window.initHome = async () => {
    // Initialisation des données de jeu (appelé une fois globalement, mais sécurisé ici)
    const gameState = await GameData.init();
    updateHud(gameState.data);
    updateHomeHUD();
};

// Suppression du listener automatique pour éviter le double appel en SPA
// document.addEventListener('DOMContentLoaded', window.initHome);

function updateHud(data) {
    if (!data) return;
    
    // Basiques
    document.getElementById('player-name').textContent = data.playerName;
    document.getElementById('player-money').textContent = `${data.money.toLocaleString('fr-FR')} $`;
}


let missionHudInterval;

function updateHomeHUD() {
    const mission = GameData.getMission();
    const missionBtn = document.getElementById('mission-btn');
    const label = document.getElementById('mission-btn-label');
    const teamPreview = document.getElementById('mission-btn-team-preview');
    const timerEl = document.getElementById('mission-btn-timer');

    if (!missionBtn) return;

    if (mission && mission.active) {
        missionBtn.classList.add('active');
        
        // Update Team Preview (only once or if changed)
        if (teamPreview.children.length === 0) {
            const allPokemons = GameData.getPokemons();
            const teamMembers = mission.team
                .map(id => allPokemons.find(p => p.instanceId === id))
                .filter(p => p !== undefined);

            teamPreview.innerHTML = teamMembers.map(pk => `<img src="${pk.sprite}" title="${pk.name}">`).join('');
        }

        const remaining = mission.endTime - Date.now();
        if (remaining <= 0) {
            missionBtn.classList.add('finished');
            label.textContent = "CONCLURE LA MISSION";
            timerEl.textContent = "TERMINÉE !";
            if (missionHudInterval) {
                 // We can keep it running if we want real-time updates for other things, 
                 // but for this specific mission it's done.
            }
        } else {
            missionBtn.classList.remove('finished');
            label.textContent = "Mission en cours...";
            timerEl.textContent = formatTime(remaining);
            
            // Start interval if not already running
            if (!missionHudInterval) {
                missionHudInterval = setInterval(updateHomeHUD, 1000);
            }
        }
    } else {
        missionBtn.classList.remove('active', 'finished');
        label.textContent = "Missions";
        teamPreview.innerHTML = '';
        timerEl.textContent = '';
        if (missionHudInterval) {
            clearInterval(missionHudInterval);
            missionHudInterval = null;
        }
    }

    // Badge pour le sac à œufs (Keep existing logic)
    updateEggBagBadge();
}

function updateEggBagBadge() {
    const eggs = GameData.getEggs();
    const eggBagBtn = document.getElementById('egg-bag-btn');
    if (!eggBagBtn) return;
    const existingBadge = eggBagBtn.querySelector('.notification-badge');
    if (eggs.length > 0) {
        if (existingBadge) {
            existingBadge.textContent = eggs.length;
        } else {
            const badge = document.createElement('span');
            badge.className = 'notification-badge';
            badge.textContent = eggs.length;
            eggBagBtn.appendChild(badge);
        }
    } else {
        if (existingBadge) existingBadge.remove();
    }
}

// --- Navigation ---
function ouvrirCentrePokemon() {
    window.location.href = 'center.html';
}

function allerAuLabo(focus) {
    if (focus === 'incubator') {
        window.location.href = 'labo.html?open=incubator';
    } else {
        window.location.href = 'labo.html';
    }
}

function allerALaventure() {
    window.location.href = 'worldmap.html';
}

function openPokedex() {
    window.location.href = 'pokedex.html';
}

let selectedMissionId = null;

function openMissionModal() {
    const missionModal = document.getElementById('mission-modal');
    const mission = GameData.getMission();

    // Reset Views
    document.getElementById('mission-board-view').style.display = 'block';
    document.getElementById('mission-team-view').style.display = 'none';
    document.getElementById('mission-report-view').style.display = 'none';

    if (mission && mission.active) {
        if (Date.now() >= mission.endTime) {
            // Directement au rapport si terminé
            completeMission();
        } else {
            // En cours
            renderActiveMissionStatus(mission);
        }
    } else {
        // Pas de mission active -> Tableau de bord
        document.getElementById('active-mission-status').style.display = 'none';
        renderMissionBoard();
    }
    missionModal.style.display = 'flex';
}

function closeMissionModal() {
    document.getElementById('mission-modal').style.display = 'none';
    if (missionUpdateInterval) clearInterval(missionUpdateInterval);
    updateHomeHUD();
}

function renderActiveMissionStatus(mission) {
    const statusContainer = document.getElementById('active-mission-status');
    const cardsContainer = document.getElementById('mission-cards-container');
    
    statusContainer.style.display = 'block';
    cardsContainer.style.display = 'none'; // Cacher les autres missions

    const missionName = mission.details ? mission.details.typeName : "Mission Mystère";
    document.getElementById('active-mission-name').textContent = missionName;

    const timerEl = document.getElementById('mission-timer-large');
    const returnBtn = document.getElementById('mission-return-btn');

    if (missionUpdateInterval) clearInterval(missionUpdateInterval);

    const updateTimer = () => {
        const remaining = mission.endTime - Date.now();
        if (remaining <= 0) {
            timerEl.textContent = "Mission Terminée !";
            returnBtn.style.display = 'inline-block';
            clearInterval(missionUpdateInterval);
            updateHomeHUD(); // Sync home button too
        } else {
            timerEl.textContent = formatTime(remaining);
            returnBtn.style.display = 'none';
        }
    };

    updateTimer(); // Immediate check
    missionUpdateInterval = setInterval(updateTimer, 1000);
}

function renderMissionBoard() {
    const container = document.getElementById('mission-cards-container');
    container.style.display = 'flex';
    container.innerHTML = '';
    
    const missions = GameData.getAvailableMissions();
    
    if (missions.length === 0) {
        container.innerHTML = "<p>Aucune mission disponible pour le moment. Revenez plus tard !</p>";
        return;
    }

    missions.forEach(mission => {
        const card = document.createElement('div');
        card.className = 'mission-card';
        card.onclick = () => selectMission(mission);
        
        let stars = "⭐".repeat(mission.difficulty);
        
        card.innerHTML = `
            <h3>${mission.typeName}</h3>
            <div class="mission-badges">
                <span class="badge difficulty-${mission.difficulty}">${stars}</span>
                <span class="badge duration">${mission.duration}h</span>
                <span class="badge affinity">${mission.affinityName}</span>
            </div>
            <p>Climat : ${mission.affinityName}</p>
        `;
        container.appendChild(card);
    });
}

function selectMission(mission) {
    selectedMissionIds = mission.id;
    missionTeamSelection = [];

    document.getElementById('mission-board-view').style.display = 'none';
    document.getElementById('mission-team-view').style.display = 'block';

    document.getElementById('selected-mission-title').textContent = `Mission : ${mission.typeName} (${mission.duration}h)`;
    document.getElementById('mission-affinity-badge').textContent = `Biome : ${mission.affinityName}`;
    const translatedTypes = mission.affinityTypes.map(t => formatTypeLabel(t).toUpperCase());
    document.getElementById('mission-affinity-types').textContent = translatedTypes.join(', ');

    renderTeamSelectionGrid(mission);
    updateTeamPreview();
}

function backToMissionBoard() {
    document.getElementById('mission-team-view').style.display = 'none';
    document.getElementById('mission-board-view').style.display = 'block';
    selectedMissionId = null;
}

function renderTeamSelectionGrid(mission) {
    const grid = document.getElementById('mission-selection-grid');
    grid.innerHTML = '';
    const pokemons = GameData.getPokemons();

    pokemons.forEach(pk => {
        const card = createPokemonCard(pk, () => toggleMissionSelection(pk.instanceId, card));
        card.dataset.instanceId = pk.instanceId;
        
        // Check Affinity
        const pTypes = [];
        if (pk.type) pTypes.push(pk.type);
        if (pk.types) pTypes.push(...pk.types);
        
        const hasAffinity = pTypes.some(t => t && mission.affinityTypes.includes(t.toLowerCase()));
        
        if (hasAffinity) {
            const badge = document.createElement('div');
            badge.className = 'pk-card-affinity-bonus';
            badge.textContent = '★';
            badge.title = "Bonus de biome !";
            card.appendChild(badge);
            card.style.borderColor = "#2ecc71"; // Visual hint
        }

        const currentStatus = pk.status || 'ready';
        if (currentStatus !== 'ready') {
            card.classList.add('disabled');
            card.onclick = null;
            card.title = `Statut : ${currentStatus === 'on_mission' ? 'En mission' : 'Épuisé'}`;
        }
        grid.appendChild(card);
    });
}

function toggleMissionSelection(instanceId, card) {
    const index = missionTeamSelection.indexOf(instanceId);
    if (index > -1) {
        missionTeamSelection.splice(index, 1);
        card.classList.remove('selected');
    } else {
        if (missionTeamSelection.length < 5) {
            missionTeamSelection.push(instanceId);
            card.classList.add('selected');
        } else {
            alert("Vous ne pouvez sélectionner que 5 Pokémon.");
        }
    }
    updateTeamPreview();
}

function updateTeamPreview() {
    const container = document.getElementById('team-preview-bar');
    const startBtn = document.getElementById('start-mission-btn');
    
    container.innerHTML = '';
    const pokemons = GameData.getPokemons();
    
    missionTeamSelection.forEach(id => {
        const pk = pokemons.find(p => p.instanceId === id);
        if(pk) {
            const img = document.createElement('img');
            img.src = pk.sprite;
            img.style.width = '32px';
            container.appendChild(img);
        }
    });

    startBtn.disabled = missionTeamSelection.length !== 5;
}

function confirmStartMission() {
    if (missionTeamSelection.length !== 5) return;
    
    const result = GameData.startMission(selectedMissionIds, missionTeamSelection);
    if (result.success) {
        // Switch to Active View
        openMissionModal(); 
    } else {
        alert(`Erreur : ${result.reason}`);
    }
}

function completeMission() {
    console.log("Completing mission...");
    const mission = GameData.getMission();
    if (!mission) {
        console.error("No mission found!");
        return;
    }
    
    try {
        if (!mission.rewards) {
            console.log("Calculating rewards...");
            GameData.calculateAndSetMissionRewards();
        }
        renderMissionReport();
        
        // Ensure the modal is open if we call this from outside openMissionModal
        document.getElementById('mission-modal').style.display = 'flex';
    } catch (e) {
        console.error("Error in completeMission:", e);
        alert("Une erreur est survenue lors du chargement du rapport de mission.");
    }
}

function renderMissionReport() {
    console.log("Rendering mission report...");
    const reportView = document.getElementById('mission-report-view');
    if (!reportView) {
         console.error("mission-report-view not found!");
         return;
    }

    document.getElementById('mission-board-view').style.display = 'none';
    document.getElementById('mission-team-view').style.display = 'none';
    reportView.style.display = 'block';

    const mission = GameData.getMission();
    if (!mission || !mission.rewards) {
        console.error("Mission or rewards missing in renderMissionReport");
        return;
    }
    const rewards = mission.rewards;

    // Team Display
    const teamContainer = document.getElementById('mission-report-team');
    // We need to fetch Pokemons. GameData.getPokemons() returns all, we filter by mission.team list
    const allPokemons = GameData.getPokemons();
    const teamMembers = mission.team
        .map(id => allPokemons.find(p => p.instanceId === id))
        .filter(p => p !== undefined);

    teamContainer.innerHTML = teamMembers.map(pk => `
        <div style="text-align: center;">
            <img src="${pk.sprite}" style="width: 48px; height: 48px;">
            <div style="font-size: 10px;">${pk.name}</div>
        </div>
    `).join('');

    // Logs
    const logsContainer = document.getElementById('mission-logs');
    logsContainer.innerHTML = (rewards.logs || []).map(log => `<div class="log-entry">> ${log}</div>`).join('');

    // Rewards
    const rewardsList = document.getElementById('mission-rewards-list');
    rewardsList.innerHTML = '';
    
    let rewardsHtml = '';
    // Money
    rewardsHtml += `
        <div class="reward-item">
            <span style="font-size:24px">💰</span>
            <span>${rewards.money} $</span>
        </div>
    `;
    
    // Eggs
    if (rewards.eggs && rewards.eggs.length > 0) {
        const eggGroups = {};
        rewards.eggs.forEach(egg => {
            eggGroups[egg.rarity] = (eggGroups[egg.rarity] || 0) + 1;
        });
    
        Object.entries(eggGroups).forEach(([rarity, count]) => {
            const rarityKey = rarity.toLowerCase().replace(/ /g, '').replace(/[éèê]/g, 'e');
            const eggSprite = `assets/egg_${rarityKey}.png`;
            rewardsHtml += `
                <div class="reward-item">
                    <img src="${eggSprite}" class="reward-icon" onerror="this.src='assets/egg_commun.png'">
                    <span>${rarity} x${count}</span>
                </div>
            `;
        });
    }
    
    // Items
    if (rewards.items && rewards.items.length > 0) {
        rewards.items.forEach(item => {
            // Tentative de trouver l'image de l'item si possible, sinon icone générique
            // On utilise une icone sac par défaut
            rewardsHtml += `
                <div class="reward-item">
                    <span style="font-size:24px">🎒</span>
                    <small>${item.name}</small>
                </div>
            `;
        });
    }

    rewardsList.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 15px; justify-content: center;">${rewardsHtml}</div>`;
}

function claimRewardsAndClose() {
    const result = GameData.claimMissionRewards();
    if (result.success) {
        closeMissionModal();
        updateHud(GameData._load());
    } else {
        alert("Erreur lors de la récupération des récompenses.");
    }
}

function createPokemonCard(pokemon, onClick) {
    const card = document.createElement('div');
    card.className = 'pokemon-card-mission';
    if (onClick) card.onclick = onClick;
    
    card.innerHTML = `
        <img src="${pokemon.sprite}" alt="${pokemon.name}" style="width: 64px; height: 64px;">
        <p>${pokemon.name}</p>
        <p>Lv. ${pokemon.level}</p>
    `;
    return card;
}

// --- MODAL SAC A OEUFS ---
let currentEggRarityFilter = 'all';

function openEggBagModal() {
    const modal = document.getElementById('egg-bag-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    currentEggRarityFilter = 'all'; // Reset filter when opening
    
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
    document.getElementById('egg-bag-total-count').textContent = `${eggs.length} œuf(s) au total`;
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
        openEggBagModal(); // Refresh view
        updateHomeHUD();
    } else {
        alert(result.reason || "Impossible d'incuber cet œuf.");
    }
}

function closeEggBagModal() {
    document.getElementById('egg-bag-modal').style.display = 'none';
}

/**
 * Normalise une chaîne de rareté pour correspondre au nom de fichier de l'œuf.
 * ex: "Peu Commun" -> "peucommun"
 * @param {string} rarity - La rareté à normaliser.
 * @returns {string} La chaîne normalisée.
 */
function normalizeRarity(rarity) {
    return (rarity || 'commun').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
}

// --- MODAL SAC A OBJETS ---
let currentItemBagPocket = 'battle';

async function openItemBagModal() {
    const modal = document.getElementById('item-bag-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    renderItemBag();
}

function renderItemBag() {
    const grid = document.getElementById('item-bag-grid');
    if (!grid) return;
    grid.innerHTML = 'Chargement...';

    renderItemBagPockets();

    const inventory = GameData.getInventory().items || {};
    const itemsByPocket = GameData.getItemsByPocket();
    const pocketItems = itemsByPocket[currentItemBagPocket] || [];

    if (pocketItems.length === 0) {
        grid.innerHTML = "<p>Aucun objet dans cette catégorie.</p>";
        return;
    }

    grid.innerHTML = pocketItems.map(item => {
        const count = inventory[item.id] || 0;
        const isLocked = count === 0;
        const sprite = item.sprite || 'assets/bag.png';
        
        return `
            <div class="item-card-home ${isLocked ? 'locked' : ''}" onclick="showItemInfo('${item.id}')" style="cursor: pointer;">
                <div class="item-owned-count">x${count}</div>
                <img src="${sprite}" alt="${item.name_fr}" class="item-sprite-home" onerror="this.src='assets/bag.png'">
                <p class="item-name-home">${item.name_fr || item.id}</p>
            </div>
        `;
    }).join('');
}

function showItemInfo(itemId) {
    const item = GameData.getItem(itemId);
    if (!item) return;

    const modal = document.getElementById('item-info-modal');
    const content = document.getElementById('item-info-content');
    if (!modal || !content) return;

    const inventory = GameData.getInventory().items || {};
    const count = inventory[itemId] || 0;
    const sprite = item.sprite || 'assets/bag.png';

    content.innerHTML = `
        <img src="${sprite}" alt="${item.name_fr}" style="width: 64px; height: 64px; margin-bottom: 15px;" onerror="this.src='assets/bag.png'">
        <h3 style="margin-bottom: 5px;">${item.name_fr}</h3>
        <p style="color: #666; font-size: 12px; margin-bottom: 15px;">${item.category} | ${POCKET_LABELS[item.pocket] || item.pocket}</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; text-align: left; margin-bottom: 15px;">
            <p style="font-size: 13px; line-height: 1.4;">${item.description_fr || item.effect_fr || 'Aucune description disponible.'}</p>
        </div>
        <p style="font-weight: bold; color: #2ecc71;">Possédé : x${count}</p>
    `;

    modal.style.display = 'flex';
}

function closeItemInfoModal() {
    document.getElementById('item-info-modal').style.display = 'none';
}

function renderItemBagPockets() {
    const container = document.getElementById('item-bag-pockets');
    if (!container) return;

    const itemsByPocket = GameData.getItemsByPocket();
    const pockets = Object.keys(itemsByPocket).sort();

    if (!pockets.includes(currentItemBagPocket) && pockets.length > 0) {
        currentItemBagPocket = pockets[0];
    }

    container.innerHTML = pockets.map(p => `
        <button class="pocket-tab ${currentItemBagPocket === p ? 'active' : ''}" onclick="switchItemBagPocket('${p}')">
            ${POCKET_LABELS[p] || p}
        </button>
    `).join('');
}

function switchItemBagPocket(pocket) {
    currentItemBagPocket = pocket;
    renderItemBag();
}

function closeItemBagModal() {
    document.getElementById('item-bag-modal').style.display = 'none';
}

// --- SETTINGS MODAL ---
function updateHud(data) {
    if (!data) return;
    document.getElementById('player-name').textContent = data.playerName;
    document.getElementById('player-money').textContent = `${data.money.toLocaleString('fr-FR')} $`;
    
    const avatarImg = document.getElementById('player-avatar-img');
    if (avatarImg) {
        avatarImg.src = data.playerGender === 'girl' ? 'assets/girl.png' : 'assets/boy.png';
    }
}

function saveProfile() {
    const name = document.getElementById('edit-player-name').value;
    const genderNode = document.querySelector('input[name="player-gender"]:checked');
    const gender = genderNode ? genderNode.value : 'boy';

    const result = GameData.updateProfile(name, gender);
    if (result.success) {
        alert("Profil mis à jour !");
        updateHud(result.data);
        closeSettings();
    } else {
        alert("Erreur lors de la mise à jour du profil.");
    }
}

function openSettings() {
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        const playerData = GameData.getPlayerData();
        if (playerData) {
            document.getElementById('edit-player-name').value = playerData.name;
            const genderRadio = document.querySelector(`input[name="player-gender"][value="${playerData.gender}"]`);
            if (genderRadio) genderRadio.checked = true;
        }
        settingsModal.style.display = 'flex';
    }
}

function closeSettings() {
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }
}

function resetGame() {
    if (confirm("Êtes-vous sûr de vouloir effacer toutes vos données de sauvegarde ? Cette action est irréversible !")) {
        if (confirm("Vraiment sûr ? Toutes vos données seront perdues.")) {
            GameData.clearSaveData();
            alert("Données effacées. Le jeu va redémarrer.");
            window.location.reload(); // Reload the page to start fresh
        }
    }
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function exportSave() {
    GameData.exportData();
    alert("Sauvegarde exportée !");
}

function importSave(event) {
    const file = event.target.files[0];
    if (!file) return;

    GameData.importData(file, () => {
        alert("Sauvegarde importée avec succès ! Le jeu va redémarrer.");
        // Recharger la page pour appliquer la nouvelle sauvegarde
        window.location.reload();
    });
}

function eraseData() {
    if (confirm("Êtes-vous sûr de vouloir effacer toutes vos données de sauvegarde ? Cette action est irréversible.")) {
        if (confirm("VRAIMENT sûr ? Toutes vos captures, votre progression et votre argent seront perdus pour toujours.")) {
            GameData.clearSaveData();
            alert("Données effacées. Le jeu va redémarrer.");
            window.location.reload();
        }
    }
}

// Fermer le modal si on clique en dehors
window.onclick = function(event) {
    const eggBagModal = document.getElementById('egg-bag-modal');
    const itemBagModal = document.getElementById('item-bag-modal');
    if (event.target == settingsModal) {
        closeSettings();
    }
    if (event.target == missionModal) {
        closeMissionModal();
    }
    if (event.target == eggBagModal) {
        closeEggBagModal();
    }
    if (event.target == itemBagModal) {
        closeItemBagModal();
    }
    const shopModal = document.getElementById('shop-modal');
    if (event.target == shopModal) {
        closeShopModal();
    }
}

// --- BOUTIQUE ---
let currentShopTab = 'upgrades';
const POCKET_LABELS = {
    'ct': '💿 CT',
    'vitamins': '💊 Vitamines',
    'feathers': '🪶 Plumes',
    'battle': '⚔️ Combat',
    'berries': '🍒 Baies',
    'evolution': '✨ Évolution',
    'exp': '🍬 Bonbons EXP',
    'mega': '💎 Méga-Gemmes',
    'misc': '📦 Divers',
    'loot': '💰 Butin'
};

function openShopModal() {
    document.getElementById('shop-modal').style.display = 'flex';
    currentShopPocket = 'ct'; // Default to CTs now
    renderShop();
}

function closeShopModal() {
    document.getElementById('shop-modal').style.display = 'none';
}

function switchShopTab(tab) {
    currentShopTab = tab;
    
    // Update active tab UI
    document.querySelectorAll('.shop-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${tab}'`));
    });
    
    const pocketContainer = document.getElementById('shop-pockets');
    if (tab === 'items') {
        pocketContainer.style.display = 'flex';
        // Set default pocket based on what exists
        const pockets = Object.keys(GameData.getItemsByPocket());
        if (pockets.includes('ct')) currentShopPocket = 'ct';
        else if (pockets.length > 0) currentShopPocket = pockets[0];
        
        renderShopPockets();
    } else {
        pocketContainer.style.display = 'none';
    }
    
    renderShop();
}

function renderShopPockets() {
    const container = document.getElementById('shop-pockets');
    if (!container) return;

    const itemsByPocket = GameData.getItemsByPocket();
    const pockets = Object.keys(itemsByPocket).sort();

    if (pockets.length === 0) {
        container.innerHTML = '<p>Aucun objet disponible.</p>';
        return;
    }

    // S'assurer que la poche actuelle est valide, sinon prendre la première
    if (!pockets.includes(currentShopPocket)) {
        currentShopPocket = pockets[0];
    }

    container.innerHTML = pockets.map(p => `
        <button class="pocket-tab ${currentShopPocket === p ? 'active' : ''}" onclick="switchShopPocket('${p}')">
            ${POCKET_LABELS[p] || p}
        </button>
    `).join('');
}

function switchShopPocket(pocket) {
    currentShopPocket = pocket;
    renderShopPockets();
    renderShop();
}

async function renderShop() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    grid.innerHTML = 'Chargement...';

    const data = GameData._load();
    const money = data.money;

    if (currentShopTab === 'upgrades') {
        const slots = data.unlockedIncubators || 1;
        const costs = [0, 5000, 15000, 50000, 150000, 500000];
        const nextCost = costs[slots];
        
        grid.innerHTML = (slots < 6) ? `
            <div class="shop-item-card">
                <div class="item-icon-text">🏗️</div>
                <div class="item-name">Slot d'Incubateur</div>
                <div class="item-desc">Ajoute un slot supplémentaire pour faire éclore plus d'œufs simultanément.</div>
                <div class="item-price">${nextCost.toLocaleString('fr-FR')}</div>
                <button class="pk-btn-action small" onclick="buySlot()">Acheter</button>
            </div>
        ` : `<p style="grid-column: 1/-1; text-align: center;">Tous les slots sont débloqués !</p>`;
    } 
    else if (currentShopTab === 'eggs') {
        const eggItems = [
            { rarity: 'Commun', price: 500, desc: 'Un œuf simple contenant un Pokémon de rareté commune.' },
            { rarity: 'Peu commun', price: 2500, desc: 'Un œuf contenant un Pokémon un peu plus rare.' },
            { rarity: 'Rare', price: 10000, desc: 'Un œuf précieux pouvant contenir des Pokémon puissants.' }
        ];

        grid.innerHTML = eggItems.map(egg => `
            <div class="shop-item-card">
                <div class="egg-sprite rarity-${egg.rarity.toLowerCase().replace(/ /g, '-')}"></div>
                <div class="item-name">Œuf ${egg.rarity}</div>
                <div class="item-desc">${egg.desc}</div>
                <div class="item-price">${egg.price.toLocaleString('fr-FR')}</div>
                <button class="pk-btn-action small" onclick="buyEggItem('${egg.rarity}', ${egg.price})">Acheter</button>
            </div>
        `).join('');
    }
    else if (currentShopTab === 'items') {
        const itemsByPocket = GameData.getItemsByPocket();
        const shopItems = itemsByPocket[currentShopPocket] || [];

        if (shopItems.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Aucun objet dans cette catégorie.</p>';
            return;
        }

        grid.innerHTML = shopItems.map(item => {
            const sprite = item.sprite || 'assets/bag.png';
            return `
                <div class="shop-item-card" onclick="showItemInfo('${item.id}')" style="cursor: pointer;">
                    <img src="${sprite}" class="item-icon" loading="lazy" onerror="this.src='assets/bag.png'">
                    <div class="item-name">${item.name_fr || item.id}</div>
                    <div class="item-desc" style="font-size: 10px; margin: 10px 0;">${(item.description_fr || item.effect_fr || 'Pas de description.').substring(0, 60)}...</div>
                    <div class="item-price">${(item.cost || 1000).toLocaleString('fr-FR')} $</div>
                    <button class="pk-btn-action small" onclick="event.stopPropagation(); buyShopItem('${item.id}', ${item.cost || 1000}, '${item.name_fr.replace(/'/g, "\\'")}')">Acheter</button>
                </div>
            `;
        }).join('');
    }
}

// Helper pour l'achat d'objets (centralisé)
function buyShopItem(itemId, price, itemName) {
    const data = GameData._load();
    if (data.money < price) {
        alert("Vous n'avez pas assez d'argent !");
        return;
    }

    GameData.addMoney(-price);
    GameData.addItem(itemId, 1);
    
    updateHomeHUD();
    alert(`Vous avez acheté : ${itemName} !`);
    renderShop();
}

function buySlot() {
    const res = GameData.buyIncubatorSlot();
    if (res.success) {
        alert("Slot débloqué !");
        updateHud(GameData._load());
        renderShop();
    } else {
        alert(res.reason);
    }
}

function buyEggItem(rarity, price) {
    const res = GameData.buyEgg(rarity, price);
    if (res.success) {
        alert(`Œuf ${rarity} acheté !`);
        updateHud(GameData._load());
        updateEggBagBadge();
    } else {
        alert(res.reason);
    }
}

function buyShopItem(key, price) {
    const res = GameData.buyItem(key, price);
    if (res.success) {
        alert("Objet acheté !");
        updateHud(GameData._load());
    } else {
        alert(res.reason);
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
