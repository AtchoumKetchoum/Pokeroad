/**
 * pmd-sprite.js - Sprites animés de Pokémon Donjon Mystère (PMDCollab SpriteCollab)
 *
 * Source : https://github.com/PMDCollab/SpriteCollab — licence CC BY-NC 4.0, attribution requise
 * (voir PmdSprite.showCredits et data/pmd_sprites.json, généré par tools/build-pmd-index.mjs).
 *
 * Chaque dossier sprite/<numéro sur 4 chiffres>/ contient AnimData.xml (taille des frames et durées
 * en ticks de 1/60 s) et une planche <Anim>-Anim.png par animation : une colonne par frame,
 * une ligne par direction (Bas, Bas-Droite, Droite, Haut-Droite, Haut, Haut-Gauche, Gauche, Bas-Gauche).
 *
 * Usage :
 *   el.innerHTML = PmdSprite.markup({ dex: 25, fallback: url, alt: 'Pikachu', facing: 'up' });
 *   PmdSprite.hydrate(el);                              // remplace l'illustration par le sprite animé s'il existe
 *   await PmdSprite.play(spriteEl, ['Attack']);         // joue une animation une fois puis revient à Idle
 */

const PmdSprite = (() => {
    const CONFIG = {
        // 'assets/pmd/' si les planches sont copiées dans le dépôt (node tools/build-pmd-index.mjs --copy)
        base: 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/',
        index: 'data/pmd_sprites.json',
        // Animations préchargées pour qu'elles démarrent sans délai en combat
        preload: ['Attack', 'Hurt'],
        // Hauteur de frame Idle (px natifs) au-delà de laquelle le sprite est réduit (gros Pokémon)
        fitHeight: 56,
        fitWidth: 60,
        // Lissage xBR des planches au chargement (2, 3 ou 4 ; 0 = pixels d'origine). Voir « AGRANDISSEMENT xBR ».
        hd: 4,
        // Contour noir allégé (voir js/xbr-worker.js) : part de teinte vers la couleur voisine, et pixels agrandis retirés au bord
        outlineTint: 0.5,
        outlineThin: 1,
        // Temps maximal d'attente de la version lissée avant d'afficher la planche d'origine (Idle au montage)
        hdWaitMs: 2500,
        // En combat, animations lissées à l'avance pour qu'elles ne s'affichent pas d'abord en pixels d'origine
        hdPreload: ['Attack', 'Shoot', 'Charge', 'Pose', 'Hurt', 'Walk'],
    };

    const DIRECTIONS = ['down', 'downright', 'right', 'upright', 'up', 'upleft', 'left', 'downleft'];
    const TICK_MS = 1000 / 60;

    let speed = 1;
    let indexPromise = null;
    const animDataCache = new Map(); // dossier -> Promise<Map<nom, anim> | null>
    const sheetCache = new Map();    // url -> Promise<{ width, height } | null>
    const players = new WeakMap();   // élément .sprite -> lecteur
    const active = new Set();
    let rafId = 0;

    const pad = (n) => String(n).padStart(4, '0');

    // --- CHARGEMENT ---

    function loadIndex() {
        if (!indexPromise) {
            indexPromise = fetch(CONFIG.index)
                .then(res => (res.ok ? res.json() : null))
                .then(json => json?.sprites || null)
                .catch(() => null); // Sans index, on tente quand même AnimData.xml
        }
        return indexPromise;
    }

    async function resolveFolder(dex, shiny) {
        const id = parseInt(dex, 10);
        if (!Number.isFinite(id) || id <= 0) return null;
        const index = await loadIndex();
        const entry = index ? index[id] : true;
        if (!entry) return null;
        const useShiny = shiny && (entry === true || entry.s);
        return `${CONFIG.base}${pad(id)}/${useShiny ? '0000/0001/' : ''}`;
    }

    function parseAnimData(xmlText) {
        const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        const raw = new Map();
        doc.querySelectorAll('Anims > Anim').forEach(node => {
            const text = (tag) => node.querySelector(tag)?.textContent.trim();
            const name = text('Name');
            if (!name) return;
            raw.set(name, {
                name,
                copyOf: text('CopyOf'),
                frameWidth: parseInt(text('FrameWidth'), 10),
                frameHeight: parseInt(text('FrameHeight'), 10),
                hitFrame: parseInt(text('HitFrame'), 10),
                durations: [...node.querySelectorAll('Durations > Duration')].map(d => parseInt(d.textContent, 10) || 1),
            });
        });
        // <CopyOf> : l'animation réutilise la planche et les données d'une autre
        const anims = new Map();
        raw.forEach((anim, name) => {
            const source = anim.copyOf ? raw.get(anim.copyOf) : anim;
            if (source && source.durations.length && source.frameWidth && source.frameHeight) {
                anims.set(name, { ...source, sheet: source.name });
            }
        });
        return anims;
    }

    function loadAnimData(folder) {
        if (!animDataCache.has(folder)) {
            animDataCache.set(folder, fetch(folder + 'AnimData.xml')
                .then(res => (res.ok ? res.text() : null))
                .then(text => (text ? parseAnimData(text) : null))
                .then(anims => (anims && anims.has('Idle') ? anims : null))
                .catch(() => null));
        }
        return animDataCache.get(folder);
    }

    function loadSheet(url) {
        if (!sheetCache.has(url)) {
            sheetCache.set(url, new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = () => resolve(null);
                img.src = url;
            }));
        }
        return sheetCache.get(url);
    }

    // --- AGRANDISSEMENT xBR ---
    // Les planches PMD (images de ~40 px) sont lissées par l'algorithme xBR (js/xbr-worker.js) puis affichées
    // réduites et lissées : contours nets à toutes les tailles, sans pixels de largeurs inégales.
    // Seule la rangée de direction utilisée est traitée (8 fois moins de calcul et de mémoire).
    // En attendant, ou si le navigateur ne sait pas faire, la planche d'origine s'affiche en pixels nets.
    const hdCache = new Map(); // `${url}#${rangée}` -> Promise<{ url, scale } | null>
    const hdDone = new Map();  // mêmes clés, une fois le résultat connu
    let worker = null, workerBroken = false, jobSeq = 0;
    const jobs = new Map();

    function getWorker() {
        if (worker || workerBroken) return worker;
        try {
            worker = new Worker('js/xbr-worker.js', { type: 'module' });
            worker.onmessage = ({ data }) => {
                const job = jobs.get(data.id);
                jobs.delete(data.id);
                job?.(data.pixels ? new Uint32Array(data.pixels) : null);
            };
            worker.onerror = () => { // worker introuvable ou modules non pris en charge : on reste en pixels d'origine
                workerBroken = true; worker = null;
                jobs.forEach(job => job(null)); jobs.clear();
            };
        } catch {
            workerBroken = true;
        }
        return worker;
    }

    function xbrScale(pixels, width, height, scale) {
        const w = getWorker();
        if (!w) return Promise.resolve(null);
        return new Promise(resolve => {
            const id = ++jobSeq;
            jobs.set(id, resolve);
            w.postMessage({ id, width, height, scale, pixels: pixels.buffer, outlineTint: CONFIG.outlineTint, outlineThin: CONFIG.outlineThin }, [pixels.buffer]);
        });
    }

    async function buildHdRow(url, row, frameHeight) {
        const scale = CONFIG.hd;
        try {
            // fetch (CORS) plutôt que <img> : les pixels doivent pouvoir être lus
            const bitmap = await createImageBitmap(await (await fetch(url, { mode: 'cors' })).blob());
            const rows = Math.max(1, Math.round(bitmap.height / frameHeight));
            const y = (rows >= 8 ? row : 0) * frameHeight;
            const src = new OffscreenCanvas(bitmap.width, frameHeight).getContext('2d');
            src.drawImage(bitmap, 0, y, bitmap.width, frameHeight, 0, 0, bitmap.width, frameHeight);
            const data = src.getImageData(0, 0, bitmap.width, frameHeight).data;
            const out = await xbrScale(new Uint32Array(data.buffer), bitmap.width, frameHeight, scale);
            if (!out) return null;
            const canvas = new OffscreenCanvas(bitmap.width * scale, frameHeight * scale);
            canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out.buffer), canvas.width, canvas.height), 0, 0);
            return { url: URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' })), scale };
        } catch {
            return null;
        }
    }

    // Version lissée d'une rangée de planche : lancée au premier appel, mise en cache
    function hdRow(url, row, frameHeight) {
        const key = `${url}#${row}`;
        if (!CONFIG.hd || typeof OffscreenCanvas === 'undefined') return Promise.resolve(null);
        if (!hdCache.has(key)) {
            hdCache.set(key, buildHdRow(url, row, frameHeight).then(result => { hdDone.set(key, result); return result; }));
        }
        return hdCache.get(key);
    }

    // --- LECTEUR ---

    class Player {
        constructor(host, folder, anims) {
            this.host = host;
            this.folder = folder;
            this.anims = anims;
            // Ligne de la planche : ennemis vus de face ('down'), équipe du joueur vue de dos ('up')
            this.row = Math.max(0, DIRECTIONS.indexOf(host.dataset.pmdFacing || 'down'));
            this.frameEl = document.createElement('div');
            this.frameEl.className = 'pmd-frame';
            host.appendChild(this.frameEl);
            this.current = null;
            this.token = 0;
        }

        sheetUrl(anim) {
            return `${this.folder}${anim.sheet}-Anim.png`;
        }

        // Version lissée de la planche : immédiate si déjà prête ; sinon attendue (au plus hdWaitMs)
        // seulement si wait, et lancée en arrière-plan pour la fois suivante
        hdSheet(anim, wait) {
            const url = this.sheetUrl(anim);
            const key = `${url}#${this.row}`;
            if (hdDone.has(key)) return hdDone.get(key);
            const pending = hdRow(url, this.row, anim.frameHeight);
            return wait ? Promise.race([pending, new Promise(r => setTimeout(() => r(null), CONFIG.hdWaitMs))]) : null;
        }

        // Démarre une animation (boucle si loop) ; résout à la fin pour une animation jouée une fois
        async start(name, { loop = false, hold = 0 } = {}) {
            const anim = this.anims.get(name);
            if (!anim) return;
            const token = ++this.token;
            const sheet = await loadSheet(this.sheetUrl(anim));
            const hd = sheet && this.hdSheet(anim, false);
            if (!sheet || token !== this.token) return;

            this.current?.resolve(); // Une animation interrompue ne doit pas bloquer celui qui l'attend
            const rows = Math.max(1, Math.round(sheet.height / anim.frameHeight));

            return new Promise(resolve => {
                this.current = {
                    anim, loop, hold, resolve, token,
                    ...this.useSheet(anim, rows, hd),
                    total: anim.durations.reduce((a, b) => a + b, 0),
                    elapsed: 0,
                    frame: -1,
                };
                this.renderFrame(0);
                active.add(this);
                ensureLoop();
                // Planche d'origine en attendant : on passe à la version lissée dès qu'elle est prête
                // (utile aux boucles longues, comme le vol des Pokémon d'ambiance)
                if (!hd) {
                    hdRow(this.sheetUrl(anim), this.row, anim.frameHeight).then(result => {
                        const c = this.current;
                        if (!result || c?.token !== token) return;
                        Object.assign(c, this.useSheet(anim, rows, result));
                        const frame = Math.max(0, c.frame);
                        c.frame = -1;
                        this.renderFrame(frame);
                    });
                }
            });
        }

        // Affiche la planche (lissée ou d'origine) ; retourne la rangée et la taille d'une image dans cette planche
        useSheet(anim, rows, hd) {
            // Planche lissée : une seule rangée, n fois plus grande, réduite d'autant par le CSS (.pmd-hd)
            const scale = hd ? hd.scale : 1;
            const style = this.frameEl.style;
            style.width = `${anim.frameWidth * scale}px`;
            style.height = `${anim.frameHeight * scale}px`;
            style.backgroundImage = `url("${hd ? hd.url : this.sheetUrl(anim)}")`;
            style.setProperty('--pmd-hd', scale);
            this.frameEl.classList.toggle('pmd-hd', !!hd);
            return { row: hd || rows < 8 ? 0 : this.row, width: anim.frameWidth * scale, height: anim.frameHeight * scale };
        }

        renderFrame(frame) {
            const c = this.current;
            if (frame === c.frame) return;
            c.frame = frame;
            this.frameEl.style.backgroundPosition = `-${frame * c.width}px -${c.row * c.height}px`;
        }

        // Retourne false quand le lecteur n'a plus besoin d'être mis à jour
        update(dtMs) {
            const c = this.current;
            if (!c || !this.host.isConnected) return false;
            c.elapsed += (dtMs * speed) / TICK_MS;

            let t = c.elapsed;
            if (c.loop) {
                t %= c.total;
            } else if (t >= c.total + (c.hold / TICK_MS)) {
                this.current = null;
                c.resolve();
                this.start('Idle', { loop: true });
                return false;
            }

            let frame = 0;
            for (let acc = 0; frame < c.anim.durations.length - 1; frame++) {
                acc += c.anim.durations[frame];
                if (t < acc) break;
            }
            this.renderFrame(frame);
            return true;
        }

        stop() {
            this.token++;
            if (this.current) this.current.resolve();
            this.current = null;
        }
    }

    let lastTime = 0;
    function ensureLoop() {
        if (rafId) return;
        lastTime = performance.now();
        const step = (now) => {
            const dt = Math.min(250, now - lastTime); // Évite un saut après un onglet en arrière-plan
            lastTime = now;
            active.forEach(player => { if (!player.update(dt)) active.delete(player); });
            rafId = active.size ? requestAnimationFrame(step) : 0;
        };
        rafId = requestAnimationFrame(step);
    }

    async function mount(host) {
        if (host.dataset.pmdState) return;
        host.dataset.pmdState = 'loading';
        const folder = await resolveFolder(host.dataset.pmdDex, host.dataset.pmdShiny === '1');
        const anims = folder ? await loadAnimData(folder) : null;
        const idle = anims?.get('Idle');
        const idleSheet = idle ? await loadSheet(`${folder}${idle.sheet}-Anim.png`) : null;
        if (!idleSheet || !host.isConnected) {
            host.dataset.pmdState = 'fallback'; // L'illustration officielle reste affichée
            return;
        }

        const player = new Player(host, folder, anims);
        players.set(host, player);
        // Taille proportionnelle à la taille réelle du Pokémon (Onix bien plus grand que Pikachu),
        // sur une échelle logarithmique pour que les géants restent dans l'écran
        const realHeight = parseFloat(host.dataset.pmdHeight) || (typeof PokedexDB !== 'undefined' && PokedexDB?.[host.dataset.pmdDex]?.height) || 1;
        const sizeFactor = Math.min(1.2, Math.max(0.72, 0.72 + 0.2 * Math.log2(realHeight / 0.5)));
        host.style.setProperty('--pmd-size', sizeFactor.toFixed(3));
        // Les planches larges (serpents, oiseaux en vol…) sont aussi bornées en largeur, pour rester dans leur case
        const fit = sizeFactor * Math.min(CONFIG.fitHeight / idle.frameHeight, CONFIG.fitWidth / (idle.frameWidth || idle.frameHeight));
        host.style.setProperty('--pmd-fit', fit.toFixed(3));
        host.style.setProperty('--transform-base', 'scaleX(1)'); // La direction est portée par la planche
        // L'illustration reste affichée le temps de lisser la planche de repos
        await player.hdSheet(idle, true);
        player.start('Idle', { loop: true }); // Boucle : la promesse ne se résout jamais
        host.dataset.pmdState = 'ready';

        CONFIG.preload.forEach(name => {
            const anim = anims.get(name);
            if (anim) loadSheet(player.sheetUrl(anim));
        });
        if (host.closest('#view-battle')) {
            CONFIG.hdPreload.forEach(name => {
                const anim = anims.get(name);
                if (anim) player.hdSheet(anim, false); // lissage préparé pour le premier coup
            });
        }
    }

    // --- API PUBLIQUE ---

    function escapeAttr(value) {
        return String(value ?? '').replace(/[&"<>]/g, ch => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[ch]));
    }

    /** HTML de l'élément .sprite : l'illustration sert d'affichage immédiat et de secours. */
    function markup({ dex, shiny = false, fallback = '', alt = '', facing = 'down', height = '' }) {
        // Les illustrations regardent vers la gauche : on les retourne pour un Pokémon tourné vers la droite
        const flip = facing.includes('right') ? 'scaleX(-1)' : 'scaleX(1)';
        return `<div class="sprite pmd-sprite" data-pmd-dex="${escapeAttr(dex)}" data-pmd-shiny="${shiny ? 1 : 0}" data-pmd-facing="${facing}" data-pmd-height="${escapeAttr(height)}" style="--transform-base: ${flip};">`
            + `<img class="pmd-fallback" src="${escapeAttr(fallback)}" alt="${escapeAttr(alt)}" draggable="false"></div>`;
    }

    // Style des Pokémon en combat (Paramètres) :
    //  - « art » (par défaut) : les illustrations figées du Pokédex, des deux côtés
    //    (nos Pokémon en miroir, tournés vers l'adversaire) ;
    //  - « pixel » : sprites PMD animés, face et dos.
    const STYLES = ['art', 'pixel'];
    const STYLE_KEY = 'pokeroad_battle_sprites';
    let battleStyle = 'art';
    try { battleStyle = localStorage.getItem(STYLE_KEY) || 'art'; } catch { /* sans stockage */ }
    if (!STYLES.includes(battleStyle)) battleStyle = 'art';
    const ART_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
    function artUrl(dex, shiny, back) {
        const sh = shiny ? 'shiny/' : '';
        return `${ART_BASE}other/official-artwork/${sh}${dex}.png`;
    }
    function setBattleStyle(style) {
        battleStyle = STYLES.includes(style) ? style : 'art';
        try { localStorage.setItem(STYLE_KEY, battleStyle); } catch { /* sans stockage */ }
        document.querySelectorAll('[data-battle-sprites]').forEach(b => b.classList.toggle('active', b.dataset.battleSprites === battleStyle));
    }

    // Boutons des Paramètres : le choix en cours en surbrillance
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setBattleStyle(battleStyle));
    else setTimeout(() => setBattleStyle(battleStyle), 0);

    /** Active les sprites animés de tous les éléments .pmd-sprite de root. */
    function hydrate(root = document) {
        const hosts = root.matches?.('.pmd-sprite') ? [root] : root.querySelectorAll('.pmd-sprite');
        hosts.forEach(host => {
            // En combat, mode illustrations : on garde l'illustration officielle (pas de planche animée)
            if (battleStyle !== 'pixel' && host.closest('#view-battle, .unit')) {
                const img = host.querySelector('.pmd-fallback');
                const dex = parseInt(host.dataset.pmdDex, 10);
                if (img && dex) {
                    const back = host.dataset.pmdFacing === 'up'; // nos Pokémon, vus de dos
                    const original = img.getAttribute('src');
                    img.onerror = () => { img.onerror = null; img.src = original; host.dataset.pmdKind = 'art'; };
                    img.src = artUrl(dex, host.dataset.pmdShiny === '1', back);
                    host.dataset.pmdKind = 'art';
                    host.dataset.pmdSide = back ? 'player' : 'enemy';
                }
                host.dataset.pmdState = 'art';
                return;
            }
            mount(host);
        });
    }

    /**
     * Joue la première animation disponible parmi names, une fois, puis revient à Idle.
     * Résout immédiatement si le sprite est l'illustration de secours.
     */
    function play(host, names, { hold = 0, loop = false } = {}) {
        const player = host && players.get(host);
        if (!player) return Promise.resolve();
        const name = [].concat(names).find(n => player.anims.has(n));
        return name ? player.start(name, { hold, loop }) : Promise.resolve();
    }

    /** Fixe le sprite sur la dernière frame visible de son animation (ex. K.O.) */
    function stop(host) {
        players.get(host)?.stop();
    }

    function setSpeed(value) {
        speed = value > 0 ? value : 1;
    }

    // --- CRÉDITS (CC BY-NC 4.0 : chaque auteur doit être cité) ---

    /** Auteurs -> numéros de Pokédex, pour une liste de { dex, shiny } */
    async function credits(sprites) {
        const index = await loadIndex();
        const byAuthor = new Map();
        sprites.forEach(({ dex, shiny }) => {
            const id = parseInt(dex, 10);
            const entry = index?.[id];
            if (!entry) return;
            [...entry.c, ...(shiny && entry.s ? entry.sc || [] : [])].forEach(author => {
                if (!byAuthor.has(author)) byAuthor.set(author, []);
                if (!byAuthor.get(author).includes(id)) byAuthor.get(author).push(id);
            });
        });
        return byAuthor;
    }

    /** Ouvre la liste des auteurs des sprites PMD affichés dans root. */
    async function showCredits(root = document) {
        const entries = [...root.querySelectorAll('.pmd-sprite[data-pmd-state="ready"]')].map(host => ({
            dex: host.dataset.pmdDex,
            shiny: host.dataset.pmdShiny === '1',
            name: host.querySelector('.pmd-fallback')?.alt,
        }));
        let modal = document.getElementById('pmd-credits-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pmd-credits-modal';
            modal.innerHTML = `<div class="modal-content"><h2>Crédits sprites</h2>
                <button class="close-btn" aria-label="Fermer">&times;</button>
                <p class="pmd-credits-intro">Sprites animés issus du <a href="https://sprites.pmdcollab.org/" target="_blank" rel="noopener">PMD Sprite Repository</a>
                (<a href="https://github.com/PMDCollab/SpriteCollab" target="_blank" rel="noopener">PMDCollab / SpriteCollab</a>),
                sous licence <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.fr" target="_blank" rel="noopener">CC BY-NC 4.0</a>.
                Sprites originaux de Pokémon Donjon Mystère © Spike Chunsoft, The Pokémon Company, Nintendo.</p>
                <h3>Auteurs des Pokémon de ce combat</h3>
                <ul class="pmd-credits-list"></ul></div>`;
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.closest('.close-btn')) modal.classList.remove('open');
            });
            document.body.appendChild(modal);
        }

        const names = new Map(entries.map(e => [parseInt(e.dex, 10), e.name]));
        const byAuthor = await credits(entries);
        const list = modal.querySelector('.pmd-credits-list');
        list.innerHTML = '';
        if (!byAuthor.size) {
            list.innerHTML = '<li>Aucun sprite PMD dans ce combat (illustrations officielles).</li>';
        }
        byAuthor.forEach((ids, author) => {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = author;
            li.append(strong, ` — ${ids.map(id => names.get(id) || `#${id}`).join(', ')}`);
            list.appendChild(li);
        });
        modal.classList.add('open');
    }

    return { CONFIG, markup, hydrate, play, stop, setSpeed, credits, showCredits, setBattleStyle, get battleStyle() { return battleStyle; } };
})();
