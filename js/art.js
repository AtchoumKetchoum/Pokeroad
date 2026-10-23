/**
 * art.js - Illustrations vectorielles du jeu (aucune image bitmap)
 * Icônes, œufs, incubateur, dresseur, bâtiments et décors de biomes, générés en SVG.
 */

const Art = (() => {
    const INK = '#1b1f3b';
    let uid = 0;
    const nextId = (prefix) => `${prefix}-${++uid}`;

    // --- ICÔNES (24x24, trait épais) ---
    const ICON_PATHS = {
        home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
        map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
        bag: '<path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
        sword: '<path d="M14.5 3H21v6.5L10 20.5 3.5 14 14.5 3z"/><path d="M6 18l-3 3M8 13l3 3"/>',
        heart: '<path d="M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z"/>',
        flask: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19l-6-10V3"/><path d="M7 15h10"/>',
        hammer: '<path d="M14 4l6 6-3 3-6-6 3-3z"/><path d="M11 7 3 15l3 3 8-8"/>',
        shop: '<path d="M4 9h16l-1-5H5L4 9z"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
        scroll: '<path d="M7 3h11a2 2 0 0 1 2 2v2h-4"/><path d="M16 7v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2h10"/><path d="M7 3a2 2 0 0 0-2 2v12M9 8h4M9 12h4"/>',
        star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
        lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        check: '<path d="M4 12l5 5L20 6"/>',
        bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
        back: '<path d="M15 5l-7 7 7 7"/>',
        close: '<path d="M6 6l12 12M18 6 6 18"/>',
        play: '<path d="M7 4l13 8-13 8V4z"/>',
        auto: '<path d="M4 12a8 8 0 0 1 14-5l2-2v6h-6l2-2a5 5 0 0 0-9 3"/><path d="M20 12a8 8 0 0 1-14 5l-2 2v-6h6l-2 2a5 5 0 0 0 9-3"/>',
        book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4V4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6V4z"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
    };

    function icon(name, size = 24, extraClass = '') {
        const paths = ICON_PATHS[name] || ICON_PATHS.star;
        return `<svg class="art-icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    }

    // --- SPRITES D'OBJETS POKÉMON (PokeAPI, © Nintendo / Game Freak, usage non commercial) ---
    // Remplacent les emojis de l'interface : item('rare-candy') -> icône du Super Bonbon
    const ITEM_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/';
    function item(name, size = 24, extraClass = '') {
        return `<img class="item-ico ${extraClass}" src="${ITEM_SPRITES}${name}.png" width="${size}" height="${size}" alt="" aria-hidden="true" loading="lazy" onerror="this.style.visibility='hidden'">`;
    }

    // Étoiles pleines (difficulté, rareté) à la place de l'emoji ⭐
    function stars(count, size = 16) {
        const one = `<svg class="art-star" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="#e8b64c" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`;
        return `<span class="art-stars">${one.repeat(Math.max(0, count))}</span>`;
    }

    // Poké Ball (logo, boutons, marqueurs)
    function pokeball(size = 32, { top = '#ee1515', bottom = '#fff' } = {}) {
        return `<svg class="art-pokeball" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="18" fill="${bottom}" stroke="${INK}" stroke-width="3"/>
            <path d="M2 20a18 18 0 0 1 36 0z" fill="${top}" stroke="${INK}" stroke-width="3"/>
            <path d="M2 20h36" stroke="${INK}" stroke-width="3"/>
            <circle cx="20" cy="20" r="6" fill="#fff" stroke="${INK}" stroke-width="3"/>
            <circle cx="20" cy="20" r="2.5" fill="${INK}"/>
            <path d="M9 11a12 12 0 0 1 6-4" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7" fill="none"/>
        </svg>`;
    }

    // --- ŒUFS PAR RARETÉ ---
    const EGG_COLORS = {
        bebe:       { shell: '#fff4f8', spot: '#ff8fc2', glow: '#ffc2dc' },
        commun:     { shell: '#fbf8ee', spot: '#9aa4b2', glow: '#e4e8ee' },
        peucommun:  { shell: '#f1fbe9', spot: '#5bc452', glow: '#c6efbf' },
        rare:       { shell: '#eef6ff', spot: '#3b82f6', glow: '#bcd8ff' },
        tresrare:   { shell: '#f6f0ff', spot: '#8b5cf6', glow: '#d9c8ff' },
        legendaire: { shell: '#fffbe6', spot: '#f5a300', glow: '#ffe28a' },
        mythique:   { shell: '#fff0fb', spot: '#e83e8c', glow: '#7ee0ff' },
    };

    function egg(rarity = 'commun', size = 64) {
        const c = EGG_COLORS[normalizeRarity(rarity)] || EGG_COLORS.commun;
        const shine = nextId('egg');
        const isMythic = normalizeRarity(rarity) === 'mythique';
        return `<svg class="art-egg" width="${size}" height="${size * 1.2}" viewBox="0 0 50 60" aria-hidden="true">
            <defs><radialGradient id="${shine}" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="${c.shell}"/></radialGradient></defs>
            <ellipse cx="25" cy="56" rx="15" ry="3" fill="${INK}" opacity=".18"/>
            <path d="M25 3C13 3 5 22 5 35a20 20 0 0 0 40 0C45 22 37 3 25 3z" fill="url(#${shine})" stroke="${INK}" stroke-width="3"/>
            <path d="M12 26c4-3 8-2 9 2s-3 7-8 6-4-6-1-8z" fill="${c.spot}"/>
            <path d="M30 14c3-2 7 0 7 4s-4 5-7 3-3-5 0-7z" fill="${c.spot}"/>
            <path d="M27 40c4-2 9 0 9 4s-5 6-9 4-4-6 0-8z" fill="${isMythic ? c.glow : c.spot}"/>
            <path d="M14 14a14 14 0 0 1 5-6" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
        </svg>`;
    }

    // --- INCUBATEUR ---
    function incubator(state = 'empty', size = 110) {
        const glass = nextId('glass');
        const liquid = state === 'locked' ? '#9aa4b2' : (state === 'ready' ? '#7ee787' : '#7ed3ff');
        return `<svg class="art-incubator ${state}" width="${size}" height="${size * 1.25}" viewBox="0 0 80 100" aria-hidden="true">
            <defs><linearGradient id="${glass}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="${liquid}" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient></defs>
            <rect x="8" y="80" width="64" height="14" rx="4" fill="#59627a" stroke="${INK}" stroke-width="3"/>
            <rect x="14" y="86" width="10" height="4" rx="2" fill="${state === 'ready' ? '#7ee787' : (state === 'locked' ? '#9aa4b2' : '#ffcb05')}"/>
            <path d="M14 80V30a26 26 0 0 1 52 0v50z" fill="url(#${glass})" stroke="${INK}" stroke-width="3"/>
            <path d="M22 30a18 18 0 0 1 10-14" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".9"/>
            <rect x="6" y="74" width="68" height="8" rx="3" fill="#8b95ad" stroke="${INK}" stroke-width="3"/>
            ${state === 'locked' ? `<g transform="translate(28 36)"><rect x="2" y="10" width="20" height="16" rx="3" fill="#ffcb05" stroke="${INK}" stroke-width="3"/><path d="M6 10V7a6 6 0 0 1 12 0v3" stroke="${INK}" stroke-width="3" fill="none"/></g>` : ''}
        </svg>`;
    }

    // --- DRESSEUR (avatar) ---
    function trainer(gender = 'boy', size = 64) {
        const isGirl = gender === 'girl';
        const cap = isGirl ? '#ff6fae' : '#ee1515';
        const hair = isGirl ? '#6b3a1f' : '#2b2f4a';
        return `<svg class="art-trainer" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#ffd8a8" stroke="${INK}" stroke-width="3"/>
            ${isGirl ? `<path d="M8 34c0 14 6 22 10 24V30zM56 34c0 14-6 22-10 24V30z" fill="${hair}" stroke="${INK}" stroke-width="2.5"/>` : ''}
            <path d="M9 30c0-14 10-23 23-23s23 9 23 23z" fill="${cap}" stroke="${INK}" stroke-width="3"/>
            <path d="M6 30h52a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6z" fill="#fff" stroke="${INK}" stroke-width="3"/>
            <circle cx="32" cy="19" r="5" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
            <path d="M14 37c2 3 5 4 8 3M50 37c-2 3-5 4-8 3" stroke="${hair}" stroke-width="3" stroke-linecap="round"/>
            <ellipse cx="24" cy="44" rx="2.6" ry="3.4" fill="${INK}"/><ellipse cx="40" cy="44" rx="2.6" ry="3.4" fill="${INK}"/>
            <path d="M27 52c3 2 7 2 10 0" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            <circle cx="18" cy="49" r="3" fill="#ff9a9a" opacity=".6"/><circle cx="46" cy="49" r="3" fill="#ff9a9a" opacity=".6"/>
        </svg>`;
    }

    // --- BÂTIMENTS DU BOURG ---
    function building(kind) {
        const s = `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
        const win = (x, y, w = 26, h = 22) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#bfe7ff" ${s}/><path d="M${x + 5} ${y + 5}l8 0" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
        const shadow = `<ellipse cx="110" cy="196" rx="100" ry="10" fill="${INK}" opacity=".2"/>`;
        // Outils du style détaillé : dégradés, tuiles, vitres avec reflets, plantes en pot
        const vGrad = (id, top, bottom, mid) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/>${mid ? `<stop offset=".55" stop-color="${mid}"/>` : ''}<stop offset="1" stop-color="${bottom}"/></linearGradient>`;
        const glassGrad = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dff5ff"/><stop offset=".55" stop-color="#8fd2f2"/><stop offset="1" stop-color="#5aa0cf"/></linearGradient>`;
        const tilePattern = (id, color) => `<pattern id="${id}" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 7.5h12M6 0v7.5" stroke="${color}" stroke-width="1.2" opacity=".35"/></pattern>`;
        const pane = (gid, x, y, w, h) => { const k = Math.min(w, h); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#${gid})" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
            <path d="M${x + 5} ${y + h - 6}l${k * .45} -${k * .45}M${x + 5} ${y + h - 15}l${k * .25} -${k * .25}" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>`; };
        const potPlant = (x) => { const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`; return `<rect x="${x - 7}" y="166" width="14" height="12" rx="2" fill="#c8814f" ${o}/>
            <circle cx="${x - 5}" cy="161" r="7" fill="#4f9a4a" ${o}/><circle cx="${x + 5}" cy="160" r="7" fill="#5fae4a" ${o}/><circle cx="${x}" cy="153" r="7" fill="#6cc463" ${o}/>`; };
        const groundShadow = `<ellipse cx="110" cy="197" rx="104" ry="8" fill="${INK}" opacity=".18"/>`;
        switch (kind) {
            // Centre Pokémon, version détaillée (essai de nouveau style) : dégradés, tuiles, vitres et portes coulissantes
            case 'center': {
                const g = nextId('pc');
                const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
                const glass = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#${g}-glass)" ${o}/>
                    <path d="M${x + 5} ${y + h - 6}l${Math.min(w, h) * .45} -${Math.min(w, h) * .45}M${x + 5} ${y + h - 15}l${Math.min(w, h) * .25} -${Math.min(w, h) * .25}" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity=".75"/>`;
                const plant = (x) => `<rect x="${x - 7}" y="166" width="14" height="12" rx="2" fill="#c8814f" ${o}/>
                    <circle cx="${x - 5}" cy="161" r="7" fill="#4f9a4a" ${o}/><circle cx="${x + 5}" cy="160" r="7" fill="#5fae4a" ${o}/><circle cx="${x}" cy="153" r="7" fill="#6cc463" ${o}/>`;
                return `<svg viewBox="0 0 220 205" class="art-building">
                <defs>
                    <linearGradient id="${g}-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf3"/><stop offset="1" stop-color="#e6d6c2"/></linearGradient>
                    <linearGradient id="${g}-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a5e"/><stop offset=".55" stop-color="#e2302a"/><stop offset="1" stop-color="#b01d1a"/></linearGradient>
                    <linearGradient id="${g}-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dff5ff"/><stop offset=".55" stop-color="#8fd2f2"/><stop offset="1" stop-color="#5aa0cf"/></linearGradient>
                    <pattern id="${g}-tiles" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 7.5h12M6 0v7.5" stroke="#8e1613" stroke-width="1.2" opacity=".35"/></pattern>
                </defs>
                <ellipse cx="110" cy="197" rx="104" ry="8" fill="${INK}" opacity=".18"/>
                <rect x="20" y="88" width="180" height="102" rx="3" fill="url(#${g}-wall)" ${o}/>
                <rect x="20" y="176" width="180" height="14" fill="#cdb79e" ${o}/>
                <path d="M20 112h180" stroke="#d9c8b2" stroke-width="2"/>
                <path d="M8 94Q11 62 40 54H180Q209 62 212 94Z" fill="url(#${g}-roof)" ${o}/>
                <path d="M8 94Q11 62 40 54H180Q209 62 212 94Z" fill="url(#${g}-tiles)"/>
                <path d="M26 66Q110 56 194 66" stroke="#ff9d92" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
                <rect x="8" y="92" width="204" height="7" rx="2" fill="#8c1916" ${o}/>
                <path d="M62 56Q64 26 110 22Q156 26 158 56Z" fill="url(#${g}-roof)" ${o}/>
                <path d="M62 56Q64 26 110 22Q156 26 158 56Z" fill="url(#${g}-tiles)"/>
                <path d="M78 34Q110 26 142 34" stroke="#ff9d92" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
                <g transform="translate(110 54)">
                    <circle r="17" fill="#ffffff" ${o}/><path d="M-17 0a17 17 0 0 1 34 0z" fill="#e2302a" ${o}/>
                    <path d="M-17 0h34" stroke="${INK}" stroke-width="3"/><circle r="6" fill="#ffffff" ${o}/><circle r="2.5" fill="#e6d6c2"/>
                    <path d="M-10 -9a12 12 0 0 1 8-4" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
                </g>
                ${glass(30, 118, 44, 34)}<path d="M52 118v34M30 135h44" stroke="${INK}" stroke-width="2"/>
                ${glass(146, 118, 44, 34)}<path d="M168 118v34M146 135h44" stroke="${INK}" stroke-width="2"/>
                <rect x="86" y="101" width="48" height="13" rx="3" fill="#ffffff" ${o}/>
                <text x="110" y="111.5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="11" fill="#e2302a">P.C</text>
                <rect x="84" y="118" width="52" height="58" rx="2" fill="#7b8797" ${o}/>
                ${glass(88, 122, 21, 54)}${glass(111, 122, 21, 54)}
                <rect x="80" y="176" width="60" height="6" rx="1" fill="#9c7a58" ${o}/>
                ${plant(12)}${plant(208)}
            </svg>`;
            }
            // --- Bâtiments détaillés (même style que le Centre Pokémon) ---
            case 'labo': {
                const g = nextId('lab');
                const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
                return `<svg viewBox="0 0 220 205" class="art-building">
                <defs>
                    ${vGrad(`${g}-wall`, '#f6f9fd', '#d3dbe8')}${vGrad(`${g}-roof`, '#7d93e0', '#2f43b8', '#4a5fd0')}
                    <linearGradient id="${g}-dome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3f6ff"/><stop offset=".5" stop-color="#9ad6f4"/><stop offset="1" stop-color="#5b9fd0"/></linearGradient>
                    ${glassGrad(`${g}-glass`)}
                </defs>
                ${groundShadow}
                <rect x="18" y="96" width="184" height="94" rx="3" fill="url(#${g}-wall)" ${o}/>
                <rect x="18" y="176" width="184" height="14" fill="#b8c1cf" ${o}/>
                <path d="M18 120h184" stroke="#c9d2df" stroke-width="2"/>
                <rect x="52" y="82" width="116" height="10" rx="2" fill="#9aa4b2" ${o}/>
                <path d="M60 84A50 48 0 0 1 160 84Z" fill="url(#${g}-dome)" ${o}/>
                <path d="M110 36v48M84 46q-6 18-4 38M136 46q6 18 4 38M64 72h92" stroke="#5b9fd0" stroke-width="2" fill="none" opacity=".8"/>
                <path d="M78 58a36 30 0 0 1 22-16" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".85"/>
                <path d="M110 36V16" ${o}/><circle cx="110" cy="13" r="6" fill="#e8b64c" ${o}/>
                <rect x="10" y="90" width="200" height="12" rx="3" fill="url(#${g}-roof)" ${o}/>
                <rect x="10" y="100" width="200" height="4" fill="#24318f"/>
                ${pane(`${g}-glass`, 28, 126, 50, 34)}<path d="M53 126v34" stroke="${INK}" stroke-width="2"/>
                ${pane(`${g}-glass`, 142, 126, 50, 34)}<path d="M167 126v34" stroke="${INK}" stroke-width="2"/>
                <rect x="84" y="107" width="52" height="14" rx="3" fill="#ffffff" ${o}/>
                <text x="110" y="118" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="10.5" fill="#3b4cca">LABO</text>
                <rect x="86" y="124" width="48" height="52" rx="2" fill="#7b8797" ${o}/>
                ${pane(`${g}-glass`, 90, 128, 19, 48)}${pane(`${g}-glass`, 111, 128, 19, 48)}
                <rect x="82" y="176" width="56" height="6" rx="1" fill="#8b95ad" ${o}/>
                ${potPlant(12)}${potPlant(208)}
            </svg>`;
            }
            case 'shop': {
                const g = nextId('mart');
                const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
                const shelf = (x) => `<path d="M${x + 4} 132h38M${x + 4} 144h38" stroke="#5a86b8" stroke-width="2"/>
                    ${[0, 1, 2, 3].map(i => `<rect x="${x + 6 + i * 9}" y="125" width="6" height="7" rx="1" fill="${['#e2302a', '#e8b64c', '#6cc463', '#e9a3b4'][i]}"/><rect x="${x + 8 + i * 9}" y="137" width="6" height="7" rx="1" fill="${['#6cc463', '#e9a3b4', '#e2302a', '#e8b64c'][i]}"/>`).join('')}`;
                return `<svg viewBox="0 0 220 205" class="art-building">
                <defs>
                    ${vGrad(`${g}-wall`, '#f6fbff', '#d6e4f0')}${vGrad(`${g}-roof`, '#7db0f3', '#2556a8', '#3a78dc')}
                    ${tilePattern(`${g}-tiles`, '#1d4687')}${glassGrad(`${g}-glass`)}
                    <pattern id="${g}-stripes" width="24" height="16" patternUnits="userSpaceOnUse"><rect width="12" height="16" fill="#3a78dc"/><rect x="12" width="12" height="16" fill="#f7fbff"/></pattern>
                </defs>
                ${groundShadow}
                <rect x="22" y="94" width="176" height="96" rx="3" fill="url(#${g}-wall)" ${o}/>
                <rect x="22" y="176" width="176" height="14" fill="#a9bccd" ${o}/>
                <path d="M14 98L34 52H186L206 98Z" fill="url(#${g}-roof)" ${o}/>
                <path d="M14 98L34 52H186L206 98Z" fill="url(#${g}-tiles)"/>
                <path d="M38 60H182" stroke="#a9cdf8" stroke-width="3" stroke-linecap="round" opacity=".8"/>
                <rect x="66" y="60" width="88" height="26" rx="4" fill="#ffffff" ${o}/>
                <text x="110" y="80" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="18" fill="#2f6fd6">MART</text>
                <path d="M12 98h196v14H12z" fill="url(#${g}-stripes)" ${o}/>
                <path d="M12 112${[...Array(14)].map((_, i) => `q7 9 14 0`).join('')}" fill="#3a78dc" ${o}/>
                ${pane(`${g}-glass`, 28, 120, 50, 40)}${shelf(30)}
                ${pane(`${g}-glass`, 142, 120, 50, 40)}${shelf(144)}
                <rect x="86" y="124" width="48" height="52" rx="2" fill="#7b8797" ${o}/>
                ${pane(`${g}-glass`, 90, 128, 19, 48)}${pane(`${g}-glass`, 111, 128, 19, 48)}
                <rect x="82" y="176" width="56" height="6" rx="1" fill="#8b95ad" ${o}/>
                <rect x="190" y="160" width="20" height="18" rx="2" fill="#c8915f" ${o}/><path d="M190 169h20M200 160v18" stroke="${INK}" stroke-width="2"/>
                ${potPlant(12)}
            </svg>`;
            }
            case 'atelier': {
                const g = nextId('atl');
                const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
                const gear = `<g transform="translate(110 76)">${[...Array(8)].map((_, i) => `<rect x="-3.5" y="-17" width="7" height="8" rx="1" fill="#e8b64c" ${o} transform="rotate(${i * 45})"/>`).join('')}
                    <circle r="12" fill="#e8b64c" ${o}/><circle r="4.5" fill="#fff8ec" ${o}/></g>`;
                return `<svg viewBox="0 0 220 205" class="art-building">
                <defs>
                    ${vGrad(`${g}-wall`, '#f6dcb4', '#d2a46e')}${vGrad(`${g}-roof`, '#ec955c', '#a4501f', '#cf6a34')}
                    ${tilePattern(`${g}-tiles`, '#7f3a14')}${glassGrad(`${g}-glass`)}
                    <pattern id="${g}-planks" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M15.5 0v10" stroke="#a87545" stroke-width="1.5" opacity=".7"/></pattern>
                </defs>
                ${groundShadow}
                <circle cx="168" cy="14" r="7" fill="#e6e1d8" opacity=".85"/><circle cx="178" cy="4" r="5" fill="#e6e1d8" opacity=".65"/>
                <rect x="154" y="22" width="22" height="46" rx="2" fill="#a24a34" ${o}/><rect x="150" y="18" width="30" height="8" rx="2" fill="#7f3a28" ${o}/>
                <rect x="26" y="98" width="168" height="92" rx="3" fill="url(#${g}-wall)" ${o}/>
                <rect x="26" y="98" width="168" height="92" fill="url(#${g}-planks)"/>
                <rect x="26" y="176" width="168" height="14" fill="#9e9a92" ${o}/>
                <path d="M12 102L64 48H156L208 102Z" fill="url(#${g}-roof)" ${o}/>
                <path d="M12 102L64 48H156L208 102Z" fill="url(#${g}-tiles)"/>
                <path d="M70 56H150" stroke="#f6b386" stroke-width="3" stroke-linecap="round" opacity=".8"/>
                <rect x="10" y="100" width="200" height="7" rx="2" fill="#7f3a14" ${o}/>
                ${gear}
                <rect x="76" y="118" width="68" height="58" rx="3" fill="#a8743f" ${o}/>
                <path d="M76 130h68M76 142h68M76 154h68M76 166h68" stroke="#7f5228" stroke-width="2"/>
                <rect x="104" y="146" width="12" height="5" rx="2" fill="#e8b64c" ${o}/>
                ${pane(`${g}-glass`, 34, 120, 32, 28)}<path d="M50 120v28" stroke="${INK}" stroke-width="2"/>
                ${pane(`${g}-glass`, 154, 120, 32, 28)}<path d="M170 120v28" stroke="${INK}" stroke-width="2"/>
                <ellipse cx="200" cy="164" rx="10" ry="4" fill="#8a5a33" ${o}/><path d="M190 164v16q10 5 20 0v-16" fill="#a8743f" ${o}/><path d="M190 172q10 4 20 0" stroke="${INK}" stroke-width="2" fill="none"/>
                <rect x="10" y="164" width="22" height="16" rx="2" fill="#c8915f" ${o}/><path d="M10 172h22" stroke="${INK}" stroke-width="2"/>
            </svg>`;
            }
            case 'dojo': {
                const g = nextId('dojo');
                const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
                const lantern = (x) => `<path d="M${x} 108v6" stroke="${INK}" stroke-width="2"/><ellipse cx="${x}" cy="124" rx="8" ry="11" fill="#e2302a" ${o}/>
                    <path d="M${x - 7} 120h14M${x - 7} 128h14" stroke="#a51d19" stroke-width="1.5"/><rect x="${x - 4}" y="134" width="8" height="3" fill="${INK}"/>`;
                return `<svg viewBox="0 0 220 205" class="art-building">
                <defs>
                    ${vGrad(`${g}-wall`, '#fdf6e8', '#e3d1b4')}${vGrad(`${g}-roof`, '#cf5247', '#7a1f1a', '#a83129')}
                    ${tilePattern(`${g}-tiles`, '#5e1612')}
                </defs>
                ${groundShadow}
                <rect x="30" y="104" width="160" height="86" rx="2" fill="url(#${g}-wall)" ${o}/>
                <rect x="30" y="176" width="160" height="14" fill="#b39b7a" ${o}/>
                <path d="M30 104v72M66 104v72M154 104v72M190 104v72" stroke="#7a4e2c" stroke-width="7"/>
                <rect x="78" y="124" width="64" height="52" fill="#fff8e8" ${o}/>
                <path d="M110 124v52M94 124v52M126 124v52M78 141h64M78 158h64" stroke="#8a6a4a" stroke-width="2"/>
                <path d="M4 110Q24 104 30 96L44 84H176L190 96Q196 104 216 110Q110 98 4 110Z" fill="url(#${g}-roof)" ${o}/>
                <path d="M4 110Q24 104 30 96L44 84H176L190 96Q196 104 216 110Q110 98 4 110Z" fill="url(#${g}-tiles)"/>
                <path d="M40 66Q60 62 66 54L76 44H144L154 54Q160 62 180 66Q110 56 40 66Z" fill="url(#${g}-roof)" ${o}/>
                <path d="M40 66Q60 62 66 54L76 44H144L154 54Q160 62 180 66Q110 56 40 66Z" fill="url(#${g}-tiles)"/>
                <rect x="70" y="38" width="80" height="7" rx="3" fill="#e8b64c" ${o}/>
                <rect x="58" y="64" width="104" height="22" fill="url(#${g}-wall)" ${o}/>
                <rect x="88" y="66" width="44" height="18" rx="2" fill="#5b3a22" ${o}/>
                <g transform="translate(110 75)"><circle r="7" fill="#fff8e8" ${o}/><path d="M-4 4L4-4M2-6l4 4M-6 2l4 4" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></g>
                ${lantern(48)}${lantern(172)}
            </svg>`;
            }
            case 'board': {
                const g = nextId('board');
                const o = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
                const paper = (x, y, w, h, r, pin, fill = '#fffdf5') => `<g transform="rotate(${r} ${x + w / 2} ${y + h / 2})">
                    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}" ${o}/>
                    <path d="M${x + 6} ${y + 12}h${w - 12}M${x + 6} ${y + 19}h${w - 16}M${x + 6} ${y + 26}h${w - 20}" stroke="#b9ab94" stroke-width="2" stroke-linecap="round"/>
                    <circle cx="${x + w / 2}" cy="${y + 4}" r="3.5" fill="${pin}" ${o}/></g>`;
                return `<svg viewBox="0 0 220 205" class="art-building">
                <defs>
                    ${vGrad(`${g}-roof`, '#86c46f', '#3c7f45', '#5aa65a')}${tilePattern(`${g}-tiles`, '#2c5f34')}
                    ${vGrad(`${g}-cork`, '#d39d6a', '#a86f42')}
                </defs>
                ${groundShadow}
                <rect x="36" y="58" width="10" height="132" rx="2" fill="#8b5a3c" ${o}/><rect x="174" y="58" width="10" height="132" rx="2" fill="#8b5a3c" ${o}/>
                <path d="M16 64L40 36H180L204 64Z" fill="url(#${g}-roof)" ${o}/>
                <path d="M16 64L40 36H180L204 64Z" fill="url(#${g}-tiles)"/>
                <path d="M44 42H176" stroke="#b6e3a3" stroke-width="3" stroke-linecap="round" opacity=".8"/>
                <rect x="26" y="66" width="168" height="98" rx="4" fill="#7f5228" ${o}/>
                <rect x="33" y="73" width="154" height="84" rx="2" fill="url(#${g}-cork)" ${o}/>
                ${paper(42, 80, 46, 36, -5, '#e2302a')}${paper(96, 78, 42, 40, 3, '#3b4cca', '#fff4c2')}${paper(146, 82, 34, 32, -3, '#6cc463')}
                ${paper(58, 120, 44, 32, 4, '#e8b64c', '#ffe9e4')}${paper(112, 122, 50, 30, -2, '#e2302a')}
                <g transform="translate(170 130)"><circle r="11" fill="#e2302a" ${o}/><text y="5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="14" fill="#fff8ec">!</text></g>
                <rect x="82" y="182" width="56" height="8" rx="2" fill="#9e9a92" ${o}/>
            </svg>`;
            }
        }
        return '';
    }

    // --- BIOMES ---
    const BIOMES = {
        plains:   { sky: ['#7fd0ff', '#d9f3ff'], far: '#9fd5a0', mid: '#6cc463', ground: '#8fd16a', path: '#f0d9a0', accent: 'trees' },
        meadow:   { sky: ['#8ed8ff', '#fff6d6'], far: '#b7e39b', mid: '#7fcf5f', ground: '#a6dc6f', path: '#f3dfa8', accent: 'flowers' },
        forest:   { sky: ['#5aa9d6', '#cdeccb'], far: '#3f8f5a', mid: '#2f7a46', ground: '#4c9a4a', path: '#c9a66b', accent: 'forest' },
        lake:     { sky: ['#6cc6ff', '#e6f7ff'], far: '#8fc9a8', mid: '#5fb57f', ground: '#79c46b', path: '#f2e2b0', accent: 'water' },
        ruins:    { sky: ['#5b4b8a', '#f0a37a'], far: '#7a6b9a', mid: '#9a8a7a', ground: '#b9a68a', path: '#d8c8a8', accent: 'ruins' },
        mountain: { sky: ['#78b6e6', '#f6e7cf'], far: '#8b8fa8', mid: '#a0846a', ground: '#b39470', path: '#e0c9a0', accent: 'rocks' },
        mist:     { sky: ['#9fb8cf', '#e9f1f7'], far: '#b7c7d6', mid: '#9db3c4', ground: '#cfdde6', path: '#eef3f7', accent: 'mist' },
        snow:     { sky: ['#8fc4ec', '#f4fbff'], far: '#dbe9f5', mid: '#c4d9ea', ground: '#f4f9fd', path: '#dfe9f2', accent: 'snow' },
        archipelago: { sky: ['#4fb3ff', '#c9f0ff'], far: '#58c2c9', mid: '#3aa0d8', ground: '#f3e3b0', path: '#f3e3b0', accent: 'islands' },
        sky:      { sky: ['#2c2f7a', '#f4a8d8'], far: '#ffffff', mid: '#e7dcff', ground: '#fff7ff', path: '#ffe9a8', accent: 'clouds' },
        town:     { sky: ['#7fd0ff', '#e2f6ff'], far: '#a6dba0', mid: '#7ccd6c', ground: '#93d46f', path: '#f2dca6', accent: 'town' },
        route:    { sky: ['#ffb36b', '#fff1d6'], far: '#b7c98f', mid: '#8fbf5f', ground: '#a6cf6a', path: '#f3dfa8', accent: 'town' },
    };

    function cloud(x, y, sc = 1, op = 0.95) {
        return `<g transform="translate(${x} ${y}) scale(${sc})" opacity="${op}"><path d="M0 40a26 26 0 0 1 30-26 34 34 0 0 1 62 4 24 24 0 0 1 22 22z" fill="#fff"/><path d="M8 40h104" stroke="#d9ecf7" stroke-width="6" stroke-linecap="round"/></g>`;
    }
    function tree(x, y, sc = 1, c1 = '#3f9f4f', c2 = '#2f7f3f') {
        return `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-7" y="10" width="14" height="34" rx="4" fill="#8b5a3c" stroke="${INK}" stroke-width="3"/><circle cx="0" cy="0" r="30" fill="${c1}" stroke="${INK}" stroke-width="3"/><circle cx="-12" cy="-8" r="9" fill="${c2}" opacity=".5"/><path d="M-14 -16a18 18 0 0 1 14-8" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".35"/></g>`;
    }
    function pine(x, y, sc = 1, c = '#2f7a46', snow = false) {
        return `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-6" y="30" width="12" height="20" fill="#7a4e33" stroke="${INK}" stroke-width="3"/><path d="M0-50 28 0H14l20 32H-34L-14 0h-14z" fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>${snow ? '<path d="M0-50 12-30H-12z" fill="#fff"/>' : ''}</g>`;
    }

    // Décors en paysage (1280x720), conservés pour les éléments larges ; le portrait les réutilise réduits
    function accentLayer(kind, b) {
        switch (kind) {
            case 'trees': case 'town': return tree(130, 470, 1.1) + tree(240, 500, 0.8) + tree(1110, 480, 1.2) + tree(1210, 520, 0.9) + tree(1000, 520, 0.7, '#5bc452', '#3f9f4f');
            case 'flowers': return [...Array(26)].map((_, i) => { const x = (i * 97) % 1280, y = 520 + (i * 53) % 180, col = ['#ff6fae', '#ffcb05', '#fff', '#ff8a3d'][i % 4]; return `<g transform="translate(${x} ${y})"><circle r="7" fill="${col}" stroke="${INK}" stroke-width="2"/><circle r="2.5" fill="#ffcb05"/></g>`; }).join('') + tree(90, 470, 0.9) + tree(1190, 470, 1);
            case 'forest': return pine(60, 430, 1.3) + pine(170, 450, 1.1, '#2a6b3d') + pine(290, 440, 0.9) + pine(990, 440, 1.0) + pine(1100, 420, 1.35, '#2a6b3d') + pine(1220, 450, 1.1) + `<rect width="1280" height="720" fill="#0b3d20" opacity=".12"/>`;
            case 'water': return `<path d="M0 470c160-30 320 30 480 0s320-30 480 0 240 20 320 10V720H0z" fill="#3aa0d8" stroke="${INK}" stroke-width="4"/><path d="M80 520h120M420 560h160M760 515h110M980 590h150" stroke="#bfe9ff" stroke-width="6" stroke-linecap="round"/>` + tree(1180, 450, 0.9);
            case 'ruins': return [200, 330, 950, 1090].map((x, i) => `<g transform="translate(${x} 360)"><rect x="-24" y="${i % 2 ? 40 : 0}" width="48" height="${i % 2 ? 160 : 200}" fill="#d8c8a8" stroke="${INK}" stroke-width="4"/><rect x="-34" y="${i % 2 ? 28 : -12}" width="68" height="16" fill="#c4b190" stroke="${INK}" stroke-width="4"/><path d="M-10 ${i % 2 ? 80 : 60}v60" stroke="#b39f7d" stroke-width="5"/></g>`).join('') + `<circle cx="1080" cy="140" r="46" fill="#ffe6a8" opacity=".9"/>`;
            case 'rocks': return `<path d="M-20 520 120 300l90 120 70-80 150 180z" fill="#8f7a64" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M820 520l140-240 80 110 90-150 170 280z" fill="#8f7a64" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M120 300l30 50-40-10zM1130 240l30 50-40-12z" fill="#fff" opacity=".8"/>`;
            case 'mist': return `<rect y="300" width="1280" height="180" fill="#fff" opacity=".45"/>` + pine(140, 430, 1, '#6f8fa6', true) + pine(1140, 430, 1.1, '#6f8fa6', true) + `<rect y="430" width="1280" height="120" fill="#fff" opacity=".35"/>`;
            case 'snow': return pine(110, 440, 1.2, '#4f7f8f', true) + pine(230, 470, 0.9, '#4f7f8f', true) + pine(1080, 450, 1.1, '#4f7f8f', true) + pine(1200, 430, 1.3, '#4f7f8f', true) + [...Array(40)].map((_, i) => `<circle cx="${(i * 131) % 1280}" cy="${(i * 71) % 520}" r="${2 + i % 3}" fill="#fff" opacity=".9"/>`).join('');
            case 'islands': return `<rect y="400" width="1280" height="320" fill="#3aa0d8"/><path d="M0 400h1280" stroke="${INK}" stroke-width="4"/><path d="M60 470h140M420 440h120M800 480h160M1050 450h120" stroke="#bfe9ff" stroke-width="6" stroke-linecap="round"/><ellipse cx="200" cy="420" rx="120" ry="26" fill="#f3e3b0" stroke="${INK}" stroke-width="4"/><ellipse cx="1080" cy="425" rx="140" ry="28" fill="#f3e3b0" stroke="${INK}" stroke-width="4"/>` + tree(190, 380, 0.8, '#5bc452') + tree(1090, 380, 0.9, '#5bc452');
            case 'clouds': return cloud(40, 420, 2.2, 1) + cloud(820, 440, 2.6, 1) + cloud(420, 520, 2, 1) + [...Array(30)].map((_, i) => `<path d="M${(i * 173) % 1280} ${(i * 67) % 300}l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" opacity=".9"/>`).join('');
        }
        return '';
    }

    // --- DÉCORS EN PORTRAIT (720x1280, s'adaptent en "slice") ---
    const W = 720, H = 1280;

    // Le bourg : vue plongeante, beaucoup de pelouse pour poser les bâtiments, route qui monte vers l'horizon
    function townAccents(hz) {
        const flowers = [...Array(18)].map((_, i) => {
            const x = 20 + (i * 151) % 680, y = hz + 160 + (i * 263) % 860;
            const col = ['#ff6fae', '#ffcb05', '#fff'][i % 3];
            return `<g transform="translate(${x} ${y})"><circle r="6" fill="${col}" stroke="${INK}" stroke-width="2"/><circle r="2" fill="#ffcb05"/></g>`;
        }).join('');
        const tufts = [...Array(14)].map((_, i) => {
            const x = 30 + (i * 193) % 660, y = hz + 200 + (i * 317) % 820;
            return `<path transform="translate(${x} ${y})" d="M-12 0q4-12 7-2q3-14 5 0q4-12 7 2z" fill="#5fae4a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
        }).join('');
        return tufts + flowers
            + tree(34, hz + 120, 0.95) + tree(690, hz + 110, 1.05) + tree(620, hz + 70, 0.7, '#5bc452', '#3f9f4f')
            + tree(26, hz + 560, 1.1) + tree(700, hz + 600, 1.0) + tree(24, 1140, 1.2) + tree(700, 1180, 1.1, '#5bc452', '#3f9f4f');
    }

    // Premier plan des grands paysages (écran titre) : touffes, fleurs et deux arbres proches
    function foreground(hz, b) {
        const top = hz + 170, span = H - top - 20;
        const bits = [...Array(16)].map((_, i) => {
            const x = 24 + (i * 157) % 672, y = top + (i * 211) % span;
            const sc = 0.8 + (y - top) / span * 0.8;
            return i % 3
                ? `<path transform="translate(${x} ${y}) scale(${sc.toFixed(2)})" d="M-12 0q4-12 7-2q3-14 5 0q4-12 7 2z" fill="${mix(b.ground, '#1f5f2f', .4)}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
                : `<g transform="translate(${x} ${y}) scale(${sc.toFixed(2)})"><circle r="6" fill="${['#ff6fae', '#ffcb05', '#fff'][i % 3 === 0 ? (i / 3) % 3 : 0]}" stroke="${INK}" stroke-width="2"/><circle r="2" fill="#ffcb05"/></g>`;
        }).join('');
        return bits + tree(40, H - 90, 1.7) + tree(690, H - 150, 1.4, '#5bc452', '#3f9f4f');
    }

    // high : horizon haut (beaucoup de sol), pour poser des éléments sur la carte (bourg, cartes de zone)
    function scene(biomeName = 'plains', { withPath = false, high = false } = {}) {
        const b = BIOMES[biomeName] || BIOMES.plains;
        const sky = nextId('sky');
        const dots = nextId('dots');
        const isTown = biomeName === 'town';
        const isRoute = biomeName === 'route';
        const hz = isTown || isRoute || high ? 300 : 700; // haut des collines lointaines
        const accents = isTown || isRoute ? townAccents(hz)
            // Autres biomes : les détails du paysage, réduits et posés sur l'horizon, puis un premier plan fleuri
            : `<g transform="translate(0 ${hz - 380 * 0.5625}) scale(0.5625)">${accentLayer(b.accent, b)}</g>` + foreground(hz, b);
        // Bourg : route au centre, entre les deux colonnes de bâtiments.
        // Route des Défis : grands lacets d'un bord à l'autre, une étape (mode de jeu) par virage.
        const road = isTown ? 'M360 1290C330 1160 395 1060 365 940S330 760 372 620 350 470 360 ' + (hz + 110)
            : isRoute ? 'M360 1290C220 1180 560 1080 470 940S160 760 250 620 540 470 380 ' + (hz + 110)
            : `M300 1290C260 1180 420 1110 380 1010S300 ${hz + 200} 380 ${hz + 130}`;
        return `<svg class="art-scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
                <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.sky[0]}"/><stop offset="1" stop-color="${b.sky[1]}"/></linearGradient>
                <pattern id="${dots}" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" fill="#fff" opacity=".28"/></pattern>
            </defs>
            <rect width="${W}" height="${hz + 140}" fill="url(#${sky})"/>
            <rect width="${W}" height="${hz}" fill="url(#${dots})"/>
            ${biomeName === 'ruins' || biomeName === 'sky' ? '' : `<circle cx="590" cy="${Math.round(hz * 0.32)}" r="50" fill="#fff4b0" stroke="#ffe066" stroke-width="10" opacity=".95"/>`}
            ${cloud(30, hz * 0.18, 1)}${cloud(330, hz * 0.06, 0.75, 0.85)}${isTown ? '' : cloud(400, hz * 0.5, 1.1, 0.9)}
            <path d="M0 ${hz}c80-50 170-62 260-26s180 26 260-14 140-26 200 4V${H}H0z" fill="${b.far}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
            <path d="M0 ${hz + 60}c120-36 230-16 340 8s240 12 380-18V${H}H0z" fill="${b.mid}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
            <path d="M0 ${hz + 120}c140-20 300-8 420 0s220 0 300-12V${H}H0z" fill="${b.ground}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
            ${withPath ? `<path d="${road}" fill="none" stroke="${INK}" stroke-width="80" stroke-linecap="round" opacity=".18"/><path d="${road}" fill="none" stroke="${b.path}" stroke-width="70" stroke-linecap="round"/><path d="${road}" fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="2 22" stroke-linecap="round" opacity=".35"/>` : ''}
            ${accents}
        </svg>`;
    }

    // --- ARÈNE DE COMBAT (portrait) : ciel en haut, sol en perspective sur toute la hauteur ---
    // Les ennemis sont au loin (en haut), l'équipe du joueur au premier plan (en bas), vue de dos.
    const HORIZON = 150;
    function mix(hexA, hexB, t) {
        const a = hexA.match(/\w\w/g).map(h => parseInt(h, 16)), b = hexB.match(/\w\w/g).map(h => parseInt(h, 16));
        return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
    }
    // Profondeur 0 (horizon) -> 1 (premier plan) vers une ordonnée, avec la compression de la perspective
    const depthY = (d) => HORIZON + (H - HORIZON) * Math.pow(d, 1.6);
    const sx = (x) => x * W / 1280; // reprise des coordonnées des décors en paysage

    function arenaHorizon(kind, b) {
        const ink = `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
        switch (kind) {
            case 'forest': case 'mist':
                return [...Array(13)].map((_, i) => pine(i * 58 + (i % 2) * 16, HORIZON - 30, 0.5 + (i % 3) * 0.1, kind === 'mist' ? '#8aa3b8' : '#2a6b3d', kind === 'mist')).join('');
            case 'rocks': case 'snow': {
                const peaks = [[0, 5], [120, -90], [220, -40], [330, -120], [470, -30], [600, -100], [760, -20], [900, -130], [1040, -40], [1160, -95], [1280, -30], [1280, 5]];
                return `<path d="M${peaks.map(([x, y]) => `${sx(x).toFixed(0)} ${HORIZON + y * 0.8}`).join(' ')}z" fill="${kind === 'snow' ? '#dbe9f5' : '#9a8470'}" ${ink}/>`
                    + [[330, -120], [900, -130], [120, -90]].map(([x, y]) => { const px = sx(x), py = HORIZON + y * 0.8; return `<path d="M${px} ${py} ${px + 14} ${py + 24} ${px - 14} ${py + 22}z" fill="#fff"/>`; }).join('');
            }
            case 'ruins':
                return [60, 190, 320, 450, 580, 680].map((x, i) => `<g transform="translate(${x} ${HORIZON - 60})"><rect x="-14" y="${i % 2 ? 20 : 0}" width="28" height="${i % 2 ? 42 : 62}" fill="#d8c8a8" ${ink}/><rect x="-21" y="${i % 2 ? 10 : -10}" width="42" height="12" fill="#c4b190" ${ink}/></g>`).join('');
            case 'water': case 'islands':
                return `<rect y="${HORIZON - 40}" width="${W}" height="48" fill="#3aa0d8" ${ink}/><path d="M40 ${HORIZON - 22}h70M260 ${HORIZON - 14}h90M500 ${HORIZON - 24}h80" stroke="#bfe9ff" stroke-width="5" stroke-linecap="round"/>`;
            case 'clouds':
                return cloud(-40, HORIZON - 60, 1.3) + cloud(240, HORIZON - 54, 1.1) + cloud(480, HORIZON - 66, 1.4);
            default: // plaines, bourg, prairie : rangée d'arbres lointains
                return [...Array(11)].map((_, i) => tree(i * 70 + (i % 2) * 20, HORIZON - 24, 0.48 + (i % 3) * 0.08, mix(b.far, '#2f7a46', .35), '#2f7a46')).join('');
        }
    }

    // Petits détails posés au sol, plus gros au premier plan ; seulement sur les bords et dans l'allée centrale
    function arenaDetails(kind, b) {
        const out = [];
        for (let i = 0; i < 24; i++) {
            const d = 0.08 + ((i * 37) % 90) / 100; // profondeur pseudo-aléatoire stable
            const y = depthY(d);
            const sc = 0.45 + d * 0.8;
            const side = i % 2 ? 1 : -1;
            const x = i % 4 === 0 ? W / 2 + side * (12 + (i * 13) % 30) : (side < 0 ? 8 + (i * 29) % 34 : W - 8 - (i * 29) % 34);
            switch (kind) {
                case 'snow': out.push(`<path transform="translate(${x} ${y}) scale(${sc})" d="M-14 0h28l-6-8h-16z" fill="#fff" stroke="#9fb8cf" stroke-width="3"/>`); break;
                case 'rocks': case 'ruins': out.push(`<path transform="translate(${x} ${y}) scale(${sc})" d="M-16 0l6-14 14-4 12 10 2 8z" fill="#a0907c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`); break;
                case 'islands': case 'water': out.push(`<path transform="translate(${x} ${y}) scale(${sc})" d="M-12 0c2-10 6-14 12-16M0 0c0-10 4-16 10-18M12 0c-1-8-3-12-7-15" stroke="${mix(b.ground, '#2f7a46', .6)}" stroke-width="4" fill="none" stroke-linecap="round"/>`); break;
                case 'clouds': out.push(`<path transform="translate(${x} ${y}) scale(${sc})" d="M0-12l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#ffe9a8"/>`); break;
                default: {
                    const col = kind === 'flowers' && i % 2 ? ['#ff6fae', '#ffcb05', '#fff'][i % 3] : null;
                    out.push(col
                        ? `<g transform="translate(${x} ${y}) scale(${sc})"><circle r="7" fill="${col}" stroke="${INK}" stroke-width="3"/><circle r="2.5" fill="#ffcb05"/></g>`
                        : `<path transform="translate(${x} ${y}) scale(${sc})" d="M-14 0q4-14 8-2q3-16 6 0q4-14 8 2z" fill="${mix(b.ground, '#1f5f2f', .45)}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`);
                }
            }
        }
        return out.join('');
    }

    function arena(biomeName = 'plains') {
        const b = BIOMES[biomeName] || BIOMES.plains;
        const sky = nextId('asky'), ground = nextId('aground');
        const farCol = mix(b.ground, b.sky[1], .45);
        // Bandes de sol de plus en plus larges vers le premier plan
        const bands = [...Array(12)].map((_, i) => {
            const y1 = depthY(i / 12), y2 = depthY((i + 0.5) / 12);
            return `<rect y="${y1.toFixed(1)}" width="${W}" height="${(y2 - y1).toFixed(1)}" fill="${INK}" opacity=".09"/>`;
        }).join('');
        // Lignes de fuite discrètes pour les sols dallés, enneigés ou nuageux
        const tiles = ['ruins', 'sky', 'snow'].includes(biomeName)
            ? [...Array(9)].map((_, i) => `<path d="M${W / 2 + (i - 4) * 30} ${HORIZON} L${W / 2 + (i - 4) * 210} ${H}" stroke="${INK}" stroke-width="3" opacity=".08"/>`).join('') : '';
        return `<svg class="art-scene art-arena" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
                <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b.sky[0]}"/><stop offset="1" stop-color="${b.sky[1]}"/></linearGradient>
                <linearGradient id="${ground}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${farCol}"/><stop offset=".35" stop-color="${b.ground}"/><stop offset="1" stop-color="${mix(b.ground, '#ffffff', .12)}"/></linearGradient>
            </defs>
            <rect width="${W}" height="${HORIZON + 10}" fill="url(#${sky})"/>
            ${biomeName === 'ruins' || biomeName === 'sky' ? '' : `<circle cx="640" cy="52" r="30" fill="#fff4b0" stroke="#ffe066" stroke-width="8"/>`}
            ${cloud(30, 18, 0.7)}${cloud(330, 6, 0.55, 0.85)}
            ${arenaHorizon(b.accent, b)}
            <rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="url(#${ground})"/>
            <path d="M0 ${HORIZON}H${W}" stroke="${INK}" stroke-width="4"/>
            ${bands}${tiles}
            ${arenaDetails(b.accent, b)}
        </svg>`;
    }

    // Biome d'une zone de la carte à partir de ses types dominants
    function biomeForTypes(types = []) {
        const t = types.join(' ');
        if (/Légendaire/.test(t)) return 'sky';
        if (/Dragon/.test(t) && /Eau/.test(t)) return 'archipelago';
        if (/Glace/.test(t) && /Roche/.test(t)) return 'snow';
        if (/Glace/.test(t)) return 'mist';
        if (/Spectre|Psy/.test(t)) return 'ruins';
        if (/Combat|Sol|Roche/.test(t)) return 'mountain';
        if (/Eau/.test(t)) return 'lake';
        if (/Poison/.test(t)) return 'forest';
        if (/Plante|Insecte/.test(t)) return 'meadow';
        return 'plains';
    }

    // CT / disque d'attaque, coloré selon le type
    function disc(type = 'normal', size = 56) {
        const color = getComputedStyle(document.documentElement).getPropertyValue(`--t-${type}`).trim() || '#a8a878';
        return `<svg class="art-disc" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17" fill="${color}" stroke="${INK}" stroke-width="3"/>
            <circle cx="20" cy="20" r="11" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/>
            <circle cx="20" cy="20" r="5" fill="#fff" stroke="${INK}" stroke-width="3"/>
            <path d="M9 14a13 13 0 0 1 6-6" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
        </svg>`;
    }

    // Image de secours (objet ou Pokémon introuvable) : Poké Ball en data-URI
    const FALLBACK = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pokeball(64).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));

    // Remplit les emplacements déclarés dans le HTML : data-scene, data-icon, data-egg, data-pokeball, data-building
    // --- RENDU « GBA » : un SVG est dessiné en basse résolution puis agrandi sans lissage ---
    const PIXEL_FACTOR = { scene: 1, building: 1 }; // taille d'un pixel du pixel art, en pixels de scène

    function rasterize(svgMarkup, width, height) {
        let markup = svgMarkup.trim();
        if (!/^<svg[^>]*xmlns=/.test(markup)) markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        markup = markup.replace('<svg', `<svg width="${width}" height="${height}" shape-rendering="crispEdges"`);
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                resolve(canvas);
            };
            img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            img.src = url;
        });
    }

    // Remplace un <svg> affiché par sa version pixelisée (même place, même classes)
    function pixelate(svgEl, factor = PIXEL_FACTOR.scene) {
        if (!svgEl || svgEl.tagName.toLowerCase() !== 'svg') return Promise.resolve(null);
        const vb = (svgEl.getAttribute('viewBox') || `0 0 ${W} ${H}`).split(/\s+/).map(Number);
        const w = Math.max(1, Math.round(vb[2] / factor)), h = Math.max(1, Math.round(vb[3] / factor));
        return rasterize(svgEl.outerHTML, w, h).then(canvas => {
            canvas.setAttribute('class', `${svgEl.getAttribute('class') || ''} pixel-canvas`);
            canvas.setAttribute('aria-hidden', 'true');
            if (svgEl.isConnected) svgEl.replaceWith(canvas);
            return canvas;
        }).catch(() => null); // en cas d'échec, le SVG net reste affiché
    }

    // Bâtiments lissés en xBR comme les sprites PMD : le canvas pixelisé laisse place à sa version x4, affichée lissée.
    // Contour teinté mais pas aminci : les traits sont déjà affinés (thin) et l'amincissement effacerait l'ombre au sol.
    const BUILDING_XBR = { scale: 4, outlineTint: 0.5, outlineThin: 0 };
    function smoothBuilding(canvas) {
        if (!canvas || typeof Xbr === 'undefined') return;
        Xbr.canvas(canvas, BUILDING_XBR).then(hd => {
            if (!hd || !canvas.isConnected) return;
            hd.setAttribute('class', canvas.getAttribute('class').replace('pixel-canvas', 'xbr-canvas'));
            hd.setAttribute('aria-hidden', 'true');
            canvas.replaceWith(hd);
        });
    }

    // Remplit les emplacements déclarés dans le HTML : data-scene, data-icon, data-egg, data-pokeball, data-building
    function hydrate(root = document) {
        root.querySelectorAll('[data-scene]').forEach(el => {
            if (el.dataset.sceneDrawn === el.dataset.scene) return;
            el.innerHTML = el.dataset.arena ? arena(el.dataset.scene) : scene(el.dataset.scene, { withPath: !!el.dataset.path, high: !!el.dataset.high });
            el.dataset.sceneDrawn = el.dataset.scene;
            pixelate(el.querySelector('svg'), PIXEL_FACTOR.scene);
        });
        root.querySelectorAll('[data-icon]').forEach(el => { if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon, +(el.dataset.size || 28)); });
        root.querySelectorAll('[data-item]').forEach(el => { if (!el.firstElementChild) el.innerHTML = item(el.dataset.item, +(el.dataset.size || 24)); });
        root.querySelectorAll('[data-egg]').forEach(el => { if (!el.firstElementChild) el.innerHTML = egg(el.dataset.egg, +(el.dataset.size || 30)); });
        root.querySelectorAll('[data-pokeball]').forEach(el => { if (!el.firstElementChild) el.innerHTML = pokeball(+(el.dataset.size || 54)); });
        root.querySelectorAll('[data-lab-art]').forEach(el => {
            if (el.firstElementChild) return;
            el.innerHTML = el.dataset.labArt === 'incubator'
                ? incubator('busy', 150).replace('</svg>', `<g transform="translate(26 36) scale(.56)">${egg('rare', 28).replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g></svg>`)
                : el.dataset.labArt === 'eggs'
                ? `<span class="lab-eggs">${egg('commun', 84)}${egg('rare', 104)}${egg('tresrare', 84)}</span>`
                : `<span class="lab-training-badge">${icon('sword', 120)}</span>`;
        });
        root.querySelectorAll('[data-building]').forEach(el => {
            if (el.querySelector('svg, canvas')) return;
            el.insertAdjacentHTML('afterbegin', building(el.dataset.building));
            pixelate(el.querySelector('svg'), PIXEL_FACTOR.building).then(smoothBuilding);
        });
    }

    // --- PALETTE DOUCE « SÉPIA » ---
    // Les dessins gardent leurs couleurs d'origine dans le code ; à la sortie, chaque couleur est
    // désaturée puis réchauffée vers un ton sépia, et le blanc pur devient crème.
    const SEPIA = [176, 136, 98];
    const muteCache = new Map();
    function muteHex(hex) {
        if (muteCache.has(hex)) return muteCache.get(hex);
        let [r, g, b] = hex.match(/\w\w/g).map(h => parseInt(h, 16) / 255);
        const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h /= 6;
        }
        s *= 0.62;                       // moins criard
        const L = l * 0.9 + 0.03;        // ni blanc pur ni noir pur
        const q = L < 0.5 ? L * (1 + s) : L + s - L * s, p = 2 * L - q;
        const hue = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
        const out = '#' + [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)]
            .map((v, i) => Math.round(v * 255 * 0.84 + SEPIA[i] * 0.16).toString(16).padStart(2, '0')).join('');
        muteCache.set(hex, out);
        return out;
    }
    muteCache.set(INK.slice(1), '#2b2433'); // l'encre des contours reste sombre (prune)
    const mute = markup => markup.replace(/#([0-9a-f]{6})\b/gi, (_, h) => muteHex(h.toLowerCase())).replace(/#fff\b/gi, '#f7ecdc');
    const muted = fn => (...args) => mute(fn(...args));
    [pokeball, egg, incubator, trainer, building, scene, arena] = [pokeball, egg, incubator, trainer, building, scene, arena].map(muted);

    // Traits deux fois plus fins sur les décors et les bâtiments (les gros contours restent pour l'interface).
    // Les traits larges (route, chemins) ne sont pas touchés.
    const thin = markup => markup.replace(/stroke-width="([\d.]+)"/g, (m, w) => +w <= 6 ? `stroke-width="${+w * 0.5}"` : m);
    [building, scene, arena] = [building, scene, arena].map(fn => (...args) => thin(fn(...args)));

    return { icon, item, stars, mute, thin, pokeball, egg, incubator, trainer, building, scene, arena, disc, biomeForTypes, hydrate, pixelate, rasterize, FALLBACK, BIOMES, EGG_COLORS };
})();

document.addEventListener('DOMContentLoaded', () => Art.hydrate());
