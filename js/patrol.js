/**
 * patrol.js - Mission fil rouge : une patrouille permanente sur la route en cours.
 *
 * Elle tourne en continu, même jeu fermé, sans immobiliser de Pokémon : argent et objets s'accumulent
 * (plafond de 12 h) et se récupèrent au tableau des missions, ou d'office au retour après une absence.
 * Les gains suivent le combat à battre : un combat trop dur se passe par la technique, ou en attendant.
 */

const Patrol = (() => {
    const CONFIG = {
        capHours: 12,        // au-delà, la réserve est pleine
        battlesPerHour: 4,   // une heure de patrouille rapporte autant que 4 victoires du combat en cours
        itemsPerHour: 1,     // objets trouvés en route
        eggEveryHours: 4,    // une chance d'œuf toutes les 4 h…
        eggChance: 0.35,     // …à 35 %
        welcomeMinutes: 10,  // absence minimale pour la récolte automatique au retour
    };
    // Poches où la patrouille trouve ses objets (poids relatifs)
    const POCKETS = [['berries', 40], ['misc', 25], ['battle', 20], ['ct', 15]];

    // Départ de la patrouille, enregistré dès la première lecture (les anciennes parties commencent maintenant)
    function since(data) {
        if (!data.patrol) {
            data.patrol = { since: Date.now() };
            GameData._save(data);
        }
        return data.patrol.since;
    }

    // Niveau des ennemis du combat à battre : il fixe la valeur de la patrouille
    function routeLevel() {
        const p = GameData.getProgression();
        const stage = (p.zone - 1) * 100 + (p.wave - 1) * 10 + (p.battle - 1);
        return typeof levelForStage === 'function' ? levelForStage(stage) : 1;
    }

    const moneyPerHour = () => (typeof battleMoneyReward === 'function' ? battleMoneyReward(routeLevel()) : 20) * CONFIG.battlesPerHour;

    /** Réserve actuelle : heures accumulées (plafonnées), argent, nombre d'objets et de chances d'œuf. */
    function pending() {
        const data = GameData._load();
        if (!data) return null;
        const start = since(data);
        const hours = Math.min(CONFIG.capHours, Math.max(0, (Date.now() - start) / 3600000));
        return {
            hours,
            full: hours >= CONFIG.capHours,
            money: Math.floor(hours * moneyPerHour()),
            items: Math.floor(hours * CONFIG.itemsPerHour),
            eggRolls: Math.floor(hours / CONFIG.eggEveryHours),
            perHour: Math.round(moneyPerHour()),
            fullIn: Math.max(0, start + CONFIG.capHours * 3600000 - Date.now()),
        };
    }

    function pickItem() {
        const byPocket = GameData.getItemsByPocket ? GameData.getItemsByPocket() : {};
        const pools = POCKETS.map(([pocket, weight]) => [
            (byPocket[pocket] || []).filter(it => !it.species_only && !it.not_sold), weight,
        ]).filter(([pool]) => pool.length);
        let roll = Math.random() * pools.reduce((s, [, w]) => s + w, 0);
        for (const [pool, weight] of pools) {
            if ((roll -= weight) < 0) return pool[Math.floor(Math.random() * pool.length)];
        }
        return null;
    }

    /** Récupère la réserve ; retourne ce qui a été gagné ({ money, items: [{ id, name }], eggs }). */
    function claim() {
        const p = pending();
        if (!p || (!p.money && !p.items)) return null;
        const items = [];
        for (let i = 0; i < p.items; i++) {
            const item = pickItem();
            if (!item) continue;
            GameData.addItem(item.id, 1);
            items.push({ id: item.id, name: item.name_fr || item.id });
        }
        let eggs = 0;
        for (let i = 0; i < p.eggRolls; i++) if (Math.random() < CONFIG.eggChance) eggs++;
        if (eggs) GameData.addEggsToBag(eggs);
        GameData.addMoney(p.money);
        const data = GameData._load();
        data.patrol = { since: Date.now() };
        GameData._save(data);
        return { money: p.money, items, eggs, hours: p.hours };
    }

    function describe(gain) {
        const parts = [`+${gain.money.toLocaleString('fr-FR')} $`];
        if (gain.items.length) parts.push(`${gain.items.length} objet${gain.items.length > 1 ? 's' : ''}`);
        if (gain.eggs) parts.push(`${gain.eggs} œuf${gain.eggs > 1 ? 's' : ''}`);
        return parts.join(', ');
    }

    // --- ABSENCE ---
    // On note régulièrement la dernière présence ; au retour (jeu rouvert ou onglet revenu au premier plan)
    // après une vraie absence, la patrouille rend compte d'elle-même.
    const SEEN_KEY = 'pokeroad_last_seen';
    function markSeen() {
        try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* sans stockage */ }
    }
    function lastSeen() {
        try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
    }

    /** À appeler une fois les données chargées (bourg) : récolte d'office après une absence. */
    function checkReturn() {
        const last = lastSeen();
        markSeen();
        if (!last || Date.now() - last < CONFIG.welcomeMinutes * 60000) return;
        const p = pending();
        const gain = p && claim();
        if (!gain || typeof UI === 'undefined') return;
        const h = Math.floor(gain.hours), m = Math.round((gain.hours - h) * 60);
        UI.toast(`Pendant ton absence (${h ? `${h} h ` : ''}${m} min), la patrouille a rapporté ${describe(gain)}.${p.full ? ' Réserve pleine : reviens plus souvent !' : ''}`, 'success');
    }

    document.addEventListener('visibilitychange', () => (document.hidden ? markSeen() : checkReturn()));
    window.addEventListener('pagehide', markSeen);
    setInterval(() => { if (!document.hidden) markSeen(); }, 60000);

    return { CONFIG, pending, claim, describe, checkReturn };
})();
