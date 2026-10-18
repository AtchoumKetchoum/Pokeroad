/**
 * home.js - Logique de la page d'accueil
 * Gère la navigation, les missions, le sac à œufs et les paramètres
 */

let missionTeamSelection = [];
let missionUpdateInterval;

window.initHome = async () => {
    // Initialisation des données de jeu (appelé une fois globalement, mais sécurisé ici)
    const gameState = await GameData.init();
    updatePlayerHud(gameState.data);
    updateHomeHUD();
};

// Suppression du listener automatique pour éviter le double appel en SPA
// document.addEventListener('DOMContentLoaded', window.initHome);

let missionHudInterval;

// Pastille d'un bâtiment du bourg : texte court (nombre, minuteur, « ! ») ou rien ; 'alert' la fait pulser
function setBuildingBadge(kind, text, { alert = false, timer = false } = {}) {
    const building = document.querySelector(`.hub-building[data-building="${kind}"]`);
    if (!building) return;
    let badge = building.querySelector('.building-badge');
    if (!text) { badge?.remove(); return; }
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'building-badge';
        building.appendChild(badge);
    }
    badge.textContent = text;
    badge.classList.toggle('alert', alert);
    badge.classList.toggle('timer', timer);
}

// Notifications du bourg, affichées sur les bâtiments concernés (rafraîchies chaque seconde)
function updateHomeHUD() {
    // Missions : temps restant de la mission en cours, puis « ! » quand elle est terminée
    const mission = GameData.getMission();
    if (mission && mission.active) {
        const remaining = mission.endTime - Date.now();
        if (remaining <= 0) setBuildingBadge('board', '!', { alert: true });
        else setBuildingBadge('board', formatTime(remaining), { timer: true });
    } else {
        setBuildingBadge('board', null);
    }

    // Laboratoire : œufs prêts à éclore dans l'incubateur
    const incubator = GameData.getIncubatorEggs ? GameData.getIncubatorEggs() : [];
    const ready = incubator.filter(egg => Date.now() >= egg.endTime).length;
    setBuildingBadge('labo', ready ? String(ready) : null, { alert: true });

    // Centre Pokémon : Pokémon épuisés à soigner
    const exhausted = GameData.getPokemons().filter(p => p.status === 'exhausted').length;
    setBuildingBadge('center', exhausted ? String(exhausted) : null);

    if (!missionHudInterval) missionHudInterval = setInterval(updateHomeHUD, 1000);

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
        
        let stars = Art.stars(mission.difficulty);
        
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
        const card = createMissionPokemonCard(pk, () => toggleMissionSelection(pk.instanceId, card));
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
            ${Art.item('relic-gold', 28)}
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
            rewardsHtml += `
                <div class="reward-item">
                    <span class="reward-icon">${Art.egg(rarityKey, 36)}</span>
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
                    <span class="reward-icon">${Art.icon('bag', 30)}</span>
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
        updatePlayerHud(GameData._load());
    } else {
        alert("Erreur lors de la récupération des récompenses.");
    }
}

function createMissionPokemonCard(pokemon, onClick) {
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
/**
 * Normalise une chaîne de rareté pour correspondre au nom de fichier de l'œuf.
 * ex: "Peu Commun" -> "peucommun"
 * @param {string} rarity - La rareté à normaliser.
 * @returns {string} La chaîne normalisée.
 */
// --- MODAL SAC A OBJETS ---
let currentItemBagPocket = 'berries';

async function openItemBagModal() {
    const modal = document.getElementById('item-bag-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    renderItemBag();
}

// CT : nom de l'attaque apprise (« Apprend Toxik à un Pokémon… ») et sa fiche si les capacités sont chargées
function ctMoveName(item) {
    return (item?.effect_fr || '').match(/Apprend (.+?) à un Pok/)?.[1] || null;
}
function ctMove(item) {
    const name = ctMoveName(item);
    if (!name || typeof MovesDB === 'undefined' || !MovesDB) return null;
    const low = name.toLowerCase();
    return Object.values(MovesDB).find(m => m?.name_fr?.toLowerCase() === low) || null;
}
// Libellé d'un objet dans les grilles : « CT06 · Toxik » pour les CT
function itemLabel(item) {
    const move = ctMoveName(item);
    return move ? `${item.name_fr}<br><b class="ct-move">${move}</b>` : (item.name_fr || item.id);
}

function renderItemBag() {
    const grid = document.getElementById('item-bag-grid');
    if (!grid) return;
    grid.innerHTML = 'Chargement...';
    if (!document.getElementById('bag-sell-dupes')) {
        const btn = document.createElement('button');
        btn.id = 'bag-sell-dupes';
        btn.className = 'pk-btn-action small bag-sell-dupes';
        btn.textContent = 'Vendre les doublons';
        btn.onclick = sellBagDuplicates;
        grid.parentElement.insertBefore(btn, grid);
    }

    renderItemBagPockets();

    const inventory = GameData.getInventory().items || {};
    const itemsByPocket = GameData.getItemsByPocket();
    renderFamilyRow('item-bag-families', currentBagFamily, 'switchBagFamily', currentItemBagPocket === 'battle');
    const pocketItems = currentItemBagPocket === 'battle' ? byFamily(itemsByPocket.battle || [], currentBagFamily) : (itemsByPocket[currentItemBagPocket] || []);

    if (pocketItems.length === 0) {
        grid.innerHTML = "<p>Aucun objet dans cette catégorie.</p>";
        return;
    }

    grid.innerHTML = pocketItems.map(item => {
        const count = inventory[item.id] || 0;
        const isLocked = count === 0;
        const sprite = item.sprite || Art.FALLBACK;
        
        return `
            <div class="item-card-home ${isLocked ? 'locked' : ''}" onclick="showItemInfo('${item.id}')" style="cursor: pointer;">
                <div class="item-owned-count">x${count}</div>
                <img src="${sprite}" alt="${item.name_fr}" class="item-sprite-home" onerror="this.src=Art.FALLBACK">
                <p class="item-name-home">${itemLabel(item)}</p>
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
    const sprite = item.sprite || Art.FALLBACK;
    const moveName = ctMoveName(item);
    const move = ctMove(item);
    // Les capacités ne sont pas encore chargées : on réaffiche dès qu'elles le sont
    if (moveName && !move && typeof loadMovesDB === 'function' && !MovesDB) loadMovesDB().then(() => { if (modal.style.display !== 'none') showItemInfo(itemId); });
    // Objets tenus et baies : l'effet réel dans le jeu ; les autres : la description
    const gameEffect = ['battle', 'berries'].includes(item.pocket) ? item.effect_fr : null;
    const desc = move ? (move.description_game || move.description_fr) : (gameEffect || item.description_fr || item.effect_fr || 'Aucune description disponible.');

    content.innerHTML = `
        <img src="${sprite}" alt="${item.name_fr}" style="width: 64px; height: 64px; margin-bottom: 15px;" onerror="this.src=Art.FALLBACK">
        <h3 style="margin-bottom: 5px;">${item.name_fr}${moveName ? ` · ${moveName}` : ''}</h3>
        <p style="color: #666; font-size: 12px; margin-bottom: 15px;">${item.category} | ${POCKET_LABELS[item.pocket] || item.pocket}</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; text-align: left; margin-bottom: 15px;">
            <p style="font-size: 13px; line-height: 1.4;">${desc}</p>
        </div>
        <p style="font-weight: bold; color: #2ecc71;">Possédé : x${count}</p>
        <div class="item-info-links">
            ${['battle', 'berries'].includes(item.pocket) ? `<button class="pk-btn-action small" onclick="goToWorkshop('${itemId}')">Améliorer à l'Atelier</button>` : ''}
            ${count > 0 ? `<button class="pk-btn-action small sell-btn" onclick="sellItems('${itemId}', 1)">Vendre ×1 · +${sellPrice(item).toLocaleString('fr-FR')} $</button>` : ''}
            ${count > 1 ? `<button class="pk-btn-action small sell-btn" onclick="sellItems('${itemId}', ${count - 1})">Garder 1, vendre ×${count - 1} · +${(sellPrice(item) * (count - 1)).toLocaleString('fr-FR')} $</button>` : ''}
        </div>
    `;

    modal.style.display = 'flex';
}

// --- RECYCLAGE : vendre des objets contre de l'argent (25 % du prix en boutique) ---
function sellPrice(item) {
    if (!item) return 0;
    if (!item.cost) return item.not_sold ? 25000 : 50; // objets sans prix : Couronne Antique précieuse, le reste symbolique
    return Math.max(10, Math.round(item.cost * 0.25 / 10) * 10);
}
function sellItems(itemId, count) {
    const data = GameData._load();
    const inv = data?.inventory?.items || {};
    const n = Math.min(count, inv[itemId] || 0);
    if (!n) return;
    const gain = sellPrice(GameData.getItem(itemId)) * n;
    inv[itemId] -= n;
    if (inv[itemId] <= 0) delete inv[itemId];
    data.money = (data.money || 0) + gain;
    GameData._save(data);
    if (typeof updateHomeHUD === 'function') updateHomeHUD();
    if (document.getElementById('item-bag-modal')?.style.display !== 'none') renderItemBag();
    if ((inv[itemId] || 0) > 0) showItemInfo(itemId); else closeItemInfoModal();
}
// Vend les doublons de la poche affichée (garde un exemplaire de chaque)
async function sellBagDuplicates() {
    const inv = GameData.getInventory().items || {};
    const list = (GameData.getItemsByPocket()[currentItemBagPocket] || []).filter(it => (inv[it.id] || 0) > 1);
    if (!list.length) { alert('Aucun doublon dans cette poche.'); return; }
    const total = list.reduce((a, it) => a + sellPrice(it) * (inv[it.id] - 1), 0);
    const copies = list.reduce((a, it) => a + inv[it.id] - 1, 0);
    const ok = await UI.confirm(`Vendre ${copies} doublon(s) de cette poche contre ${total.toLocaleString('fr-FR')} $ ? Un exemplaire de chaque objet est gardé.`, { title: 'Recyclage', okLabel: 'Vendre' });
    if (!ok) return;
    const data = GameData._load();
    list.forEach(it => { data.inventory.items[it.id] = 1; });
    data.money = (data.money || 0) + total;
    GameData._save(data);
    if (typeof updateHomeHUD === 'function') updateHomeHUD();
    renderItemBag();
}

// Liens entre écrans : objet → Atelier, Atelier → boutique
function goToWorkshop(itemId) {
    closeItemInfoModal();
    document.getElementById('shop-modal') && (document.getElementById('shop-modal').style.display = 'none');
    document.getElementById('item-bag-modal') && (document.getElementById('item-bag-modal').style.display = 'none');
    if (typeof RefinementUI !== 'undefined') RefinementUI.open(itemId, 'item');
}
function goToShopFor(itemId) {
    const item = GameData.getItem(itemId);
    if (typeof RefinementUI !== 'undefined') RefinementUI.close();
    ViewManager.show('home');
    setTimeout(() => {
        openShopModal();
        if (item?.pocket) switchShopPocket(item.pocket === 'misc' ? 'misc' : item.pocket);
        if (item?.pocket === 'battle' && item.family) switchShopFamily(item.family);
    }, 250);
}

function closeItemInfoModal() {
    document.getElementById('item-info-modal').style.display = 'none';
}

// Bouton de poche : grande vignette seule, le nom en infobulle
const POCKET_ICONS = {
    ct: ['tm-normal', 'CT'], vitamins: ['protein', 'Vitamines'], feathers: ['health-wing', 'Plumes'],
    battle: ['choice-band', 'Combat'], berries: ['oran-berry', 'Baies'], evolution: ['fire-stone', 'Évolution'],
    exp: ['exp-candy-m', 'Bonbons EXP'], mega: ['charizardite-x', 'Méga-Gemmes'], misc: ['poke-ball', 'Divers'], loot: ['nugget', 'Butin'],
};
function pocketButton(p, active, onclick) {
    const [icon, label] = p === 'eggs' ? [null, 'Œufs'] : (POCKET_ICONS[p] || [null, p]);
    const art = p === 'eggs' ? Art.egg('Commun', 44) : (icon ? Art.item(icon, 44) : label);
    return `<button class="pocket-tab pocket-icon ${active ? 'active' : ''}" title="${label}" aria-label="${label}" onclick="${onclick}">${art}</button>`;
}

// Familles des objets de combat : une rangée d'icônes pour trier les 200+ objets
const ITEM_FAMILIES = [
    ['all', null, 'Tous'], ['degats', 'life-orb', 'Dégâts'], ['defense', 'assault-vest', 'Défense'], ['soin', 'leftovers', 'Soin'],
    ['bouclier', 'light-clay', 'Bouclier'], ['vitesse', 'quick-claw', 'Vitesse et jauge'], ['jauge_z', 'normalium-z--held', 'Jauge Z'],
    ['statut', 'flame-orb', 'Altérations'], ['placement', 'eject-button', 'Placement'], ['autre', 'amulet-coin', 'Autres'],
];
let currentShopFamily = 'all';
let currentBagFamily = 'all';
function renderFamilyRow(containerId, current, onclick, visible) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.style.display = visible ? '' : 'none';
    if (!visible) return;
    el.innerHTML = ITEM_FAMILIES.map(([key, icon, label]) => `<button class="pocket-tab pocket-icon ${current === key ? 'active' : ''}" title="${label}" aria-label="${label}" onclick="${onclick}('${key}')">${icon ? Art.item(icon, 44) : '<span class="family-all">Tous</span>'}</button>`).join('');
}
const byFamily = (list, family) => (family === 'all' ? list : list.filter(it => it.family === family));
function switchShopFamily(f) { currentShopFamily = f; renderShop(); }
function switchBagFamily(f) { currentBagFamily = f; renderItemBag(); }

function renderItemBagPockets() {
    const container = document.getElementById('item-bag-pockets');
    if (!container) return;

    const itemsByPocket = GameData.getItemsByPocket();
    const pockets = Object.keys(itemsByPocket).sort();

    if (!pockets.includes(currentItemBagPocket) && pockets.length > 0) {
        currentItemBagPocket = pockets[0];
    }

    container.innerHTML = pockets.map(p => pocketButton(p, currentItemBagPocket === p, `switchItemBagPocket('${p}')`)).join('');
}

function switchItemBagPocket(pocket) {
    currentItemBagPocket = pocket;
    renderItemBag();
}

function closeItemBagModal() {
    document.getElementById('item-bag-modal').style.display = 'none';
}

// --- SETTINGS MODAL ---
function updatePlayerHud(data) {
    if (!data) return;
    document.getElementById('player-name').textContent = data.playerName;
    document.getElementById('player-money').textContent = `${data.money.toLocaleString('fr-FR')} $`;
    
    const avatar = document.getElementById('player-avatar');
    if (avatar) avatar.innerHTML = Art.trainer(data.playerGender === 'girl' ? 'girl' : 'boy', 64);
    // Rang du dresseur : suit la zone atteinte sur la PokéRoad
    const playerInfo = document.querySelector('#player-hud .hub-player');
    if (playerInfo && typeof Epic !== 'undefined') {
        let rank = playerInfo.querySelector('.hub-rank');
        if (!rank) { rank = document.createElement('div'); rank.className = 'hub-rank'; playerInfo.appendChild(rank); }
        rank.innerHTML = Epic.rankChip((data.progression || {}).zone || 1);
    }
}

function saveProfile() {
    const name = document.getElementById('edit-player-name').value;
    const genderNode = document.querySelector('input[name="player-gender"]:checked');
    const gender = genderNode ? genderNode.value : 'boy';

    const result = GameData.updateProfile(name, gender);
    if (result.success) {
        alert("Profil mis à jour !");
        updatePlayerHud(result.data);
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

async function eraseData() {
    const ok = await UI.confirm("Toutes tes captures, ta progression et ton argent seront perdus pour toujours.", { title: 'Effacer la sauvegarde', okLabel: 'Tout effacer' });
    if (!ok) return;
    GameData.clearSaveData();
    window.location.reload();
}

// Fermer le modal si on clique en dehors
const MODAL_CLOSERS = {
    'settings-modal': () => closeSettings(),
    'mission-modal': () => closeMissionModal(),
    'egg-bag-modal': () => closeEggBagModal(),
    'item-bag-modal': () => closeItemBagModal(),
    'shop-modal': () => closeShopModal(),
};
window.addEventListener('click', (event) => {
    const close = MODAL_CLOSERS[event.target && event.target.id];
    if (close) close();
});

// --- BOUTIQUE ---
const POCKET_LABELS = {
    'ct': `${Art.item('tm-normal', 20)} CT`,
    'vitamins': `${Art.item('protein', 20)} Vitamines`,
    'feathers': `${Art.item('health-wing', 20)} Plumes`,
    'battle': `${Art.item('choice-band', 20)} Combat`,
    'berries': `${Art.item('oran-berry', 20)} Baies`,
    'evolution': `${Art.item('fire-stone', 20)} Évolution`,
    'exp': `${Art.item('exp-candy-m', 20)} Bonbons EXP`,
    'mega': `${Art.item('charizardite-x', 20)} Méga-Gemmes`,
    'misc': `${Art.item('poke-ball', 20)} Divers`,
    'loot': `${Art.item('nugget', 20)} Butin`
};

function openShopModal() {
    document.getElementById('shop-modal').style.display = 'flex';
    currentShopPocket = 'eggs'; // Œufs et incubateurs d'abord
    renderShopPockets();
    renderShop();
}

function closeShopModal() {
    document.getElementById('shop-modal').style.display = 'none';
}

// Ancien système d'onglets : renvoie vers la poche correspondante
function switchShopTab(tab) {
    switchShopPocket(tab === 'items' ? 'ct' : 'eggs');
}

function renderShopPockets() {
    const container = document.getElementById('shop-pockets');
    if (!container) return;

    const itemsByPocket = GameData.getItemsByPocket();
    // Une seule rangée de boutons : Œufs (œufs + incubateurs), puis les poches d'objets
    const pockets = ['eggs', ...Object.keys(itemsByPocket).sort()];

    // S'assurer que la poche actuelle est valide, sinon prendre la première
    if (!pockets.includes(currentShopPocket)) {
        currentShopPocket = pockets[0];
    }

    container.innerHTML = pockets.map(p => pocketButton(p, currentShopPocket === p, `switchShopPocket('${p}')`)).join('');
}

function switchShopPocket(pocket) {
    currentShopPocket = pocket;
    renderShopPockets();
    renderShop();
}

async function renderShop() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;
    renderFamilyRow('shop-families', currentShopFamily, 'switchShopFamily', currentShopPocket === 'battle');
    grid.innerHTML = 'Chargement...';

    const data = GameData._load();
    const money = data.money;

    if (currentShopPocket === 'eggs') {
        // Incubateur supplémentaire, puis les œufs
        const slots = data.unlockedIncubators || 1;
        const maxSlots = GameData.MAX_INCUBATORS;
        const nextCost = GameData.getIncubatorCost(slots);
        const slotCard = (slots < maxSlots) ? `
            <div class="shop-item-card">
                <div class="item-icon-text">${Art.item('cell-battery', 48)}</div>
                <div class="item-name">Incubateur</div>
                <div class="item-desc">Un emplacement de plus pour faire éclore plus d'œufs en même temps (${slots}/${maxSlots}).</div>
                <div class="item-price">${nextCost.toLocaleString('fr-FR')}</div>
                <button class="pk-btn-action small" onclick="buySlot()">Acheter</button>
            </div>` : '';

        const eggItems = [
            { rarity: 'Commun', price: 500, desc: 'Un œuf simple contenant un Pokémon de rareté commune.' },
            { rarity: 'Peu Commun', price: 2500, desc: 'Un œuf contenant un Pokémon un peu plus rare.' },
            { rarity: 'Rare', price: 10000, desc: 'Un œuf précieux pouvant contenir des Pokémon puissants.' }
        ];

        grid.innerHTML = slotCard + eggItems.map(egg => `
            <div class="shop-item-card">
                <div class="item-icon-text">${Art.egg(egg.rarity, 48)}</div>
                <div class="item-name">Œuf ${egg.rarity}</div>
                <div class="item-desc">${egg.desc}</div>
                <div class="item-price">${egg.price.toLocaleString('fr-FR')}</div>
                <button class="pk-btn-action small" onclick="buyEggItem('${egg.rarity}', ${egg.price})">Acheter</button>
            </div>
        `).join('');
    }
    else {
        const itemsByPocket = GameData.getItemsByPocket();
        const shopItems = (currentShopPocket === 'battle' ? byFamily(itemsByPocket.battle || [], currentShopFamily) : (itemsByPocket[currentShopPocket] || [])).filter(it => !it.not_sold);

        if (shopItems.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Aucun objet dans cette catégorie.</p>';
            return;
        }

        // CT : on affiche l'attaque apprise (nom et description du jeu)
        const movesByName = {};
        if (currentShopPocket === 'ct' && typeof loadMovesDB === 'function') {
            Object.values(await loadMovesDB() || {}).forEach(m => { if (m?.name_fr) movesByName[m.name_fr.toLowerCase()] = m; });
        }
        const clip = (t, n) => (t.length > n ? `${t.slice(0, n).trim()}…` : t);

        grid.innerHTML = shopItems.map(item => {
            const sprite = item.sprite || Art.FALLBACK;
            const moveName = ctMoveName(item);
            const move = moveName && movesByName[moveName.toLowerCase()];
            const desc = move ? (move.description_game || move.description_fr || '') : ((['battle', 'berries'].includes(item.pocket) ? item.effect_fr : null) || item.description_fr || item.effect_fr || 'Pas de description.');
            return `
                <div class="shop-item-card${moveName ? ' is-ct' : ''}" onclick="showItemInfo('${item.id}')" style="cursor: pointer;">
                    <img src="${sprite}" class="item-icon" loading="lazy" onerror="this.src=Art.FALLBACK">
                    <div class="item-name">${item.name_fr || item.id}</div>
                    ${moveName ? `<div class="item-move">${moveName}</div>` : ''}
                    <div class="item-desc">${clip(desc, 140)}</div>
                    <div class="item-price">${(item.cost || 1000).toLocaleString('fr-FR')}</div>
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
        updatePlayerHud(GameData._load());
        renderShop();
    } else {
        alert(res.reason);
    }
}

function buyEggItem(rarity, price) {
    const res = GameData.buyEgg(rarity, price);
    if (res.success) {
        alert(`Œuf ${rarity} acheté !`);
        updatePlayerHud(GameData._load());
        updateEggBagBadge();
    } else {
        alert(res.reason);
    }
}

