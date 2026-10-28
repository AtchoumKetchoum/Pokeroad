/**
 * battle-vfx.js - Effets visuels des combats, dessinés sur un canvas léger posé sur la scène
 *  - de vraies images, dessinées une seule fois puis réutilisées : boule de feu, flammes, feuilles, rochers,
 *    éclats de glace, gouttes, bulles, plumes, étoiles, aiguilles, éclats de métal, orbes spectrales… ;
 *  - une mise en scène par type : projectile, jet, pluie de rochers, éclair tombé du ciel, sol qui se fend… ;
 *  - marques de contact : griffures, morsure, coup de poing ; brèches dans le sol sur les gros coups ;
 *  - secousse, flash, gel de l'image, ralenti sur le coup fatal, éclatement au K.O. ;
 *  - réglage « effets réduits » (Paramètres) : moins de particules, ni secousse ni flash ni ralenti
 *    (par défaut si l'appareil demande moins d'animations).
 * Purement visuel : chaque promesse se résout aussi par minuterie, le combat n'attend jamais un dessin.
 */
const BattleVfx = (() => {
    const FX_KEY = 'pokeroad_fx';
    const OUT = '#2b2118'; // contour des images (même brun que les icônes du plateau)
    let level = 'full';
    let disabled = false; // banc d'équilibrage : aucun dessin
    let speed = 1;
    let canvas = null, ctx = null, W = 0, H = 0, res = 1;
    const parts = [];
    const tasks = [];
    let raf = 0, last = 0;
    let freezeUntil = 0, slowUntil = 0, slowFactor = 1;
    let shakeAmp = 0;
    let flash = null, dim = null;

    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const now = () => performance.now();
    const reduced = () => level === 'reduced';
    const SCALE = 1.55; // taille générale des effets (repère de la scène : 720 px de large)
    // Nombre de particules selon le réglage
    const count = (n) => Math.max(1, Math.round(n * (reduced() ? 0.35 : 1)));

    // ------------------------------------------------------------------
    // RÉGLAGE « EFFETS »
    // ------------------------------------------------------------------
    function loadLevel() {
        try {
            const v = localStorage.getItem(FX_KEY);
            if (v === 'full' || v === 'reduced') return v;
        } catch { /* sans stockage */ }
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
    }
    function setLevel(v) {
        level = v === 'reduced' ? 'reduced' : 'full';
        try { localStorage.setItem(FX_KEY, level); } catch { /* sans stockage */ }
        document.querySelectorAll('[data-fx-level]').forEach(b => b.classList.toggle('active', b.dataset.fxLevel === level));
        document.body.classList.toggle('fx-reduced', level === 'reduced');
    }
    level = loadLevel();
    const syncButtons = () => setLevel(level);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncButtons);
    else setTimeout(syncButtons, 0);

    // ------------------------------------------------------------------
    // CANVAS ET REPÈRE (celui de la scène, avant sa mise à l'échelle)
    // ------------------------------------------------------------------
    const scene = () => document.querySelector('#view-battle .scaler-view');

    function ensureCanvas() {
        const sc = scene();
        if (!sc) return false;
        if (!canvas || canvas.parentNode !== sc) {
            canvas = sc.querySelector(':scope > #vfx-canvas') || document.createElement('canvas');
            canvas.id = 'vfx-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            if (canvas.parentNode !== sc) sc.appendChild(canvas);
            ctx = canvas.getContext('2d');
            W = 0;
        }
        const w = sc.offsetWidth, h = sc.offsetHeight;
        const k = sc.getBoundingClientRect().width / (w || 1);
        const r = Math.max(0.5, Math.min(1.75, k * (window.devicePixelRatio || 1)));
        if (w !== W || h !== H || Math.abs(r - res) > 0.05) {
            W = w; H = h; res = r;
            canvas.width = Math.round(w * r);
            canvas.height = Math.round(h * r);
        }
        return W > 0 && H > 0;
    }

    function center(el) {
        const sc = scene();
        if (!sc || !el) return null;
        const s = sc.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        const k = s.width / (sc.offsetWidth || 1) || 1;
        return { x: (r.left + r.width / 2 - s.left) / k, y: (r.top + r.height / 2 - s.top) / k, w: r.width / k, h: r.height / k };
    }

    /** Corps (sprite) et sol (sous les pieds) du Pokémon d'une case. */
    function spot(slotEl) {
        if (!slotEl) return null;
        const body = center(slotEl.querySelector('.unit .sprite')) || center(slotEl.querySelector('.unit')) || center(slotEl);
        if (!body) return null;
        const w = Math.max(70, Math.min(170, body.w)), h = Math.max(70, Math.min(170, body.h));
        return { x: body.x, y: body.y, w, h, fx: body.x, fy: body.y + h * 0.3 };
    }

    // ------------------------------------------------------------------
    // IMAGES : dessinées une fois dans de petits canvas, puis copiées (drawImage, très rapide)
    // ------------------------------------------------------------------
    const IMG = {};
    function bake(name, draw, size = 96) {
        if (IMG[name]) return IMG[name];
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        g.translate(size / 2, size / 2);
        g.lineJoin = 'round'; g.lineCap = 'round';
        draw(g, size / 2 - 4);
        IMG[name] = c;
        return c;
    }
    const radial = (g, r, stops, x = 0, y = 0) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        stops.forEach(([o, c]) => gr.addColorStop(o, c));
        return gr;
    };
    const linear = (g, x0, y0, x1, y1, stops) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        stops.forEach(([o, c]) => gr.addColorStop(o, c));
        return gr;
    };
    const rgba = (hex, a) => {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    };

    // Halo doux d'une couleur (lueurs, braises, décalques au sol)
    const glow = (color) => bake(`glow:${color}`, (g, R) => {
        g.fillStyle = radial(g, R, [[0, rgba(color, 1)], [0.35, rgba(color, 0.55)], [1, rgba(color, 0)]]);
        g.fillRect(-R, -R, 2 * R, 2 * R);
    }, 64);

    function flamePath(g, R) {
        g.beginPath();
        g.moveTo(0, -R);
        g.bezierCurveTo(R * 0.25, -R * 0.55, R * 0.72, -R * 0.1, R * 0.62, R * 0.35);
        g.bezierCurveTo(R * 0.52, R * 0.85, -R * 0.52, R * 0.85, -R * 0.62, R * 0.35);
        g.bezierCurveTo(-R * 0.72, -R * 0.1, -R * 0.25, -R * 0.55, 0, -R);
        g.closePath();
    }
    const flame = (name, cols) => bake(name, (g, R) => {
        flamePath(g, R);
        g.fillStyle = radial(g, R * 1.1, [[0, cols[0]], [0.3, cols[1]], [0.62, cols[2]], [1, cols[3]]], 0, R * 0.35);
        g.fill();
        g.globalAlpha = 0.85;
        g.scale(0.5, 0.55); g.translate(0, R * 0.45);
        flamePath(g, R);
        g.fillStyle = cols[0];
        g.fill();
    });

    function polygon(g, pts) {
        g.beginPath();
        pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.closePath();
    }

    const SPRITES = {
        fireball: () => bake('fireball', (g, R) => {
            g.fillStyle = radial(g, R, [[0, '#fffbe8'], [0.22, '#fff2a0'], [0.45, '#ffb43a'], [0.7, 'rgba(240,90,32,.85)'], [1, 'rgba(200,40,10,0)']]);
            g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        }),
        flame: () => flame('flame', ['#fffbe0', '#ffd34a', '#f0702a', 'rgba(190,40,20,0)']),
        dflame: () => flame('dflame', ['#f4eeff', '#b9a2ff', '#6a38e8', 'rgba(40,20,120,0)']),
        bflame: () => flame('bflame', ['#efe2ff', '#a77ad8', '#5a2f8a', 'rgba(30,10,50,0)']),
        leaf: () => bake('leaf', (g, R) => {
            g.rotate(-0.5);
            g.beginPath();
            g.moveTo(-R * 0.95, 0);
            g.quadraticCurveTo(-R * 0.1, -R * 0.62, R * 0.95, 0);
            g.quadraticCurveTo(-R * 0.1, R * 0.62, -R * 0.95, 0);
            g.closePath();
            g.fillStyle = linear(g, 0, -R * 0.5, 0, R * 0.5, [[0, '#b8e57a'], [0.5, '#6fb840'], [1, '#3f8a2c']]);
            g.fill();
            g.lineWidth = 3.5; g.strokeStyle = OUT; g.stroke();
            g.beginPath(); g.moveTo(-R * 0.8, 0); g.quadraticCurveTo(0, -R * 0.06, R * 0.8, 0);
            g.lineWidth = 2.2; g.strokeStyle = '#e6f7c4'; g.stroke();
            for (let i = -2; i <= 2; i++) {
                g.beginPath(); g.moveTo(i * R * 0.25, -R * 0.02); g.lineTo(i * R * 0.25 + R * 0.16, -R * 0.24);
                g.moveTo(i * R * 0.25, R * 0.02); g.lineTo(i * R * 0.25 + R * 0.16, R * 0.24);
                g.lineWidth = 1.4; g.stroke();
            }
        }),
        rock: () => bake('rock', (g, R) => {
            const pts = [[-0.85, 0.15], [-0.55, -0.62], [0.05, -0.85], [0.68, -0.5], [0.9, 0.2], [0.42, 0.78], [-0.4, 0.8]].map(([x, y]) => [x * R, y * R]);
            polygon(g, pts);
            g.fillStyle = linear(g, -R, -R, R, R, [[0, '#d4c19a'], [0.45, '#a88e66'], [1, '#6e5638']]);
            g.fill();
            g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
            polygon(g, [[-0.5 * R, -0.5 * R], [0.05 * R, -0.72 * R], [0.5 * R, -0.42 * R], [0.05 * R, -0.12 * R]]);
            g.fillStyle = 'rgba(255,248,226,.45)'; g.fill();
            g.beginPath(); g.moveTo(0.05 * R, -0.12 * R); g.lineTo(0.3 * R, 0.5 * R); g.moveTo(0.05 * R, -0.12 * R); g.lineTo(-0.55 * R, 0.25 * R);
            g.lineWidth = 2.5; g.strokeStyle = 'rgba(60,42,26,.7)'; g.stroke();
        }),
        pebble: () => bake('pebble', (g, R) => {
            polygon(g, [[-0.8, -0.2], [-0.2, -0.8], [0.7, -0.5], [0.8, 0.4], [0, 0.85], [-0.7, 0.5]].map(([x, y]) => [x * R, y * R]));
            g.fillStyle = linear(g, -R, -R, R, R, [[0, '#cbb48a'], [1, '#7a6040']]);
            g.fill(); g.lineWidth = 5; g.strokeStyle = OUT; g.stroke();
        }, 48),
        shard: () => bake('shard', (g, R) => {
            polygon(g, [[0, -R], [R * 0.3, -R * 0.1], [0, R], [-R * 0.3, -R * 0.1]]);
            g.fillStyle = linear(g, -R * 0.3, 0, R * 0.3, 0, [[0, '#ffffff'], [0.5, '#c4eef6'], [1, '#62bcd4']]);
            g.fill(); g.lineWidth = 3; g.strokeStyle = '#2c5a72'; g.stroke();
            g.beginPath(); g.moveTo(0, -R * 0.85); g.lineTo(0, R * 0.85); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
        }),
        metal: () => bake('metal', (g, R) => {
            polygon(g, [[0, -R], [R * 0.45, -R * 0.2], [R * 0.2, R * 0.9], [-R * 0.4, R * 0.35]]);
            g.fillStyle = linear(g, -R * 0.4, -R, R * 0.4, R, [[0, '#ffffff'], [0.35, '#d8dce6'], [0.6, '#9aa0b0'], [1, '#e8ebf2']]);
            g.fill(); g.lineWidth = 3.5; g.strokeStyle = '#33384a'; g.stroke();
        }),
        drop: () => bake('drop', (g, R) => {
            g.beginPath();
            g.moveTo(0, -R);
            g.bezierCurveTo(R * 0.25, -R * 0.4, R * 0.7, R * 0.05, R * 0.62, R * 0.42);
            g.arc(0, R * 0.42, R * 0.62, 0, Math.PI);
            g.bezierCurveTo(-R * 0.7, R * 0.05, -R * 0.25, -R * 0.4, 0, -R);
            g.closePath();
            g.fillStyle = linear(g, 0, -R, 0, R, [[0, '#e4f6ff'], [0.4, '#7ab8f4'], [1, '#2f62c0']]);
            g.fill(); g.lineWidth = 3; g.strokeStyle = '#1d3a74'; g.stroke();
            g.beginPath(); g.ellipse(-R * 0.22, R * 0.3, R * 0.12, R * 0.22, -0.4, 0, Math.PI * 2);
            g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
        }, 64),
        bubble: () => bake('bubble', (g, R) => {
            g.beginPath(); g.arc(0, 0, R * 0.9, 0, Math.PI * 2);
            g.fillStyle = 'rgba(150,205,255,.28)'; g.fill();
            g.lineWidth = 4; g.strokeStyle = 'rgba(230,248,255,.95)'; g.stroke();
            g.beginPath(); g.arc(0, 0, R * 0.6, -2.6, -1.6); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
        }, 48),
        pbubble: () => bake('pbubble', (g, R) => {
            g.beginPath(); g.arc(0, 0, R * 0.9, 0, Math.PI * 2);
            g.fillStyle = 'rgba(190,110,220,.45)'; g.fill();
            g.lineWidth = 4; g.strokeStyle = '#e3b8f2'; g.stroke();
            g.beginPath(); g.arc(0, 0, R * 0.55, -2.6, -1.7); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
        }, 48),
        sludge: () => bake('sludge', (g, R) => {
            g.beginPath();
            for (let i = 0; i <= 10; i++) {
                const a = (i / 10) * Math.PI * 2, r = R * (0.72 + (i % 2 ? 0.16 : 0) + (i % 3 ? 0 : 0.08));
                i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            g.closePath();
            g.fillStyle = radial(g, R, [[0, '#e0a6f0'], [0.55, '#9b4fc0'], [1, '#5a2178']], -R * 0.25, -R * 0.25);
            g.fill(); g.lineWidth = 3.5; g.strokeStyle = '#2e0f3e'; g.stroke();
            g.beginPath(); g.ellipse(-R * 0.3, -R * 0.32, R * 0.16, R * 0.1, -0.6, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.8)'; g.fill();
        }, 64),
        feather: () => bake('feather', (g, R) => {
            g.rotate(-0.6);
            g.beginPath();
            g.moveTo(0, -R * 0.95);
            g.bezierCurveTo(R * 0.45, -R * 0.5, R * 0.4, R * 0.4, 0, R * 0.7);
            g.bezierCurveTo(-R * 0.4, R * 0.4, -R * 0.45, -R * 0.5, 0, -R * 0.95);
            g.fillStyle = linear(g, -R * 0.4, 0, R * 0.4, 0, [[0, '#ffffff'], [1, '#d9d2ec']]);
            g.fill(); g.lineWidth = 3; g.strokeStyle = '#4c4560'; g.stroke();
            g.beginPath(); g.moveTo(0, -R * 0.8); g.lineTo(0, R * 0.98); g.lineWidth = 2.5; g.stroke();
        }, 64),
        star: () => bake('star', (g, R) => {
            const pts = [];
            for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.42 : R; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
            polygon(g, pts);
            g.fillStyle = radial(g, R, [[0, '#ffffff'], [0.5, '#ffd0e4'], [1, '#f08cb8']]);
            g.fill(); g.lineWidth = 4; g.strokeStyle = '#7e2f58'; g.stroke();
        }, 64),
        wstar: () => bake('wstar', (g, R) => {
            const pts = [];
            for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.42 : R; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
            polygon(g, pts);
            g.fillStyle = radial(g, R, [[0, '#ffffff'], [0.6, '#fff4c8'], [1, '#f2cf5a']]);
            g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
        }, 64),
        sparkle: () => bake('sparkle', (g, R) => {
            g.fillStyle = radial(g, R, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
            g.fillRect(-R, -R, 2 * R, 2 * R);
            g.beginPath();
            g.moveTo(0, -R); g.quadraticCurveTo(R * 0.08, -R * 0.08, R, 0); g.quadraticCurveTo(R * 0.08, R * 0.08, 0, R);
            g.quadraticCurveTo(-R * 0.08, R * 0.08, -R, 0); g.quadraticCurveTo(-R * 0.08, -R * 0.08, 0, -R);
            g.fillStyle = '#fff'; g.fill();
        }, 64),
        needle: () => bake('needle', (g, R) => {
            polygon(g, [[R, 0], [-R * 0.6, -R * 0.14], [-R * 0.9, 0], [-R * 0.6, R * 0.14]]);
            g.fillStyle = linear(g, 0, -R * 0.14, 0, R * 0.14, [[0, '#eef7a8'], [1, '#86a020']]);
            g.fill(); g.lineWidth = 3; g.strokeStyle = '#2f3a0c'; g.stroke();
        }, 64),
        orb: () => bake('orb', (g, R) => {
            g.fillStyle = radial(g, R, [[0, '#f2e6ff'], [0.25, '#b48ae6'], [0.55, '#5a2f95'], [0.8, 'rgba(40,16,70,.8)'], [1, 'rgba(30,10,50,0)']]);
            g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        }),
        dark: () => bake('dark', (g, R) => {
            g.fillStyle = radial(g, R, [[0, '#2a1a26'], [0.4, 'rgba(60,30,60,.85)'], [0.75, 'rgba(120,60,110,.4)'], [1, 'rgba(60,30,60,0)']]);
            g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        }),
        energy: () => bake('energy', (g, R) => {
            g.fillStyle = radial(g, R, [[0, '#ffffff'], [0.3, '#fff6dc'], [0.6, 'rgba(240,220,160,.7)'], [1, 'rgba(230,200,140,0)']]);
            g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        }),
        aura: () => bake('aura', (g, R) => {
            g.fillStyle = radial(g, R, [[0, '#ffffff'], [0.3, '#cfe6ff'], [0.6, 'rgba(70,130,230,.75)'], [1, 'rgba(40,80,200,0)']]);
            g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        }),
        psy: () => bake('psy', (g, R) => {
            g.fillStyle = radial(g, R, [[0, '#ffffff'], [0.3, '#ffc4dc'], [0.6, 'rgba(248,88,136,.7)'], [1, 'rgba(248,88,136,0)']]);
            g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        }),
        bang: () => bake('bang', (g, R) => {
            const pts = [];
            for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? R * (0.42 + (i % 4 === 1 ? 0.06 : 0)) : R * (i % 4 ? 0.82 : 1); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
            polygon(g, pts);
            g.fillStyle = radial(g, R, [[0, '#ffffff'], [0.35, '#fff3a6'], [0.75, '#ffb53c'], [1, '#f07a2a']]);
            g.fill(); g.lineWidth = 4; g.strokeStyle = OUT; g.stroke();
        }, 128),
        dust: () => bake('dust', (g, R) => {
            g.fillStyle = radial(g, R, [[0, 'rgba(214,194,160,.85)'], [0.6, 'rgba(190,168,130,.45)'], [1, 'rgba(180,160,120,0)']]);
            g.fillRect(-R, -R, 2 * R, 2 * R);
        }, 64),
        smoke: () => bake('smoke', (g, R) => {
            g.fillStyle = radial(g, R, [[0, 'rgba(70,60,62,.7)'], [0.6, 'rgba(70,60,62,.3)'], [1, 'rgba(70,60,62,0)']]);
            g.fillRect(-R, -R, 2 * R, 2 * R);
        }, 64),
        frost: () => bake('frost', (g, R) => {
            g.fillStyle = radial(g, R, [[0, 'rgba(240,252,255,.9)'], [0.5, 'rgba(190,235,248,.45)'], [1, 'rgba(190,235,248,0)']]);
            g.fillRect(-R, -R, 2 * R, 2 * R);
        }, 64),
    };
    const img = (name) => (SPRITES[name] ? SPRITES[name]() : glow(name));

    // ------------------------------------------------------------------
    // PARTICULES
    // ------------------------------------------------------------------
    const MAX_PARTS = 420;
    /**
     * p : { x, y, vx, vy (px/s), ay (gravité), drag, life (ms), size, size1, rot, vr, img, kind, add, alpha,
     *       hold (part de la vie avant le fondu), delay (ms), sq (écrasement vertical), color, lw, ... }
     */
    function add(p) {
        if (disabled || !ensureCanvas()) return null;
        if (parts.length >= MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS + 1);
        const q = { vx: 0, vy: 0, ay: 0, drag: 0, rot: 0, vr: 0, alpha: 1, hold: 0.55, age: 0, delay: 0, kind: 'img', ...p };
        if (q.size1 === undefined) q.size1 = q.size;
        parts.push(q);
        run();
        return q;
    }
    function burst(x, y, n, o) {
        for (let i = 0; i < count(n); i++) {
            const a = o.angle !== undefined ? o.angle + rnd(-(o.spread ?? Math.PI), o.spread ?? Math.PI) : rnd(0, Math.PI * 2);
            const v = rnd(o.speed[0], o.speed[1]);
            const r0 = o.radius ? rnd(0, o.radius) : 0;
            add({
                img: o.img, kind: o.kind || 'img', color: o.color, add: o.add, x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 * (o.sq || 1),
                vx: Math.cos(a) * v, vy: Math.sin(a) * v * (o.sq || 1) + (o.vy || 0), ay: o.ay || 0, drag: o.drag || 0,
                life: rnd(o.life[0], o.life[1]), size: rnd(o.size[0], o.size[1]), size1: o.grow ? rnd(o.size[0], o.size[1]) * o.grow : undefined,
                rot: o.align ? a : rnd(0, Math.PI * 2), vr: o.align ? 0 : rnd(-(o.spin || 0), o.spin || 0), hold: o.hold ?? 0.55,
                delay: o.delay ? rnd(0, o.delay) : 0, lw: o.lw, align: o.align, alpha: o.alpha ?? 1, wob: o.wob,
            });
        }
    }

    function drawPart(p) {
        const t = Math.min(1, p.age / p.life);
        const fade = t < p.hold ? 1 : 1 - (t - p.hold) / (1 - p.hold);
        const fin = p.fadeIn ? Math.min(1, t / p.fadeIn) : 1;
        const a = p.alpha * fade * fin;
        if (a <= 0.01) return;
        const s = p.size + (p.size1 - p.size) * t;
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
        switch (p.kind) {
            case 'img': {
                const im = img(p.img);
                const rot = p.align ? Math.atan2(p.vy, p.vx) : p.rot;
                ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
                if (rot) ctx.rotate(rot);
                const sq = p.sq || 1;
                ctx.drawImage(im, -s / 2, -s * sq / 2, s, s * sq);
                break;
            }
            case 'streak': { // trait de vitesse ou étincelle, orienté selon la vitesse
                const sp = Math.hypot(p.vx, p.vy) || 1;
                const len = Math.min(s, sp * 0.06 + s * 0.3);
                ctx.setTransform(res, 0, 0, res, 0, 0);
                ctx.strokeStyle = p.color; ctx.lineWidth = (p.lw || 3) * (1 - t * 0.6);
                ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * len, p.y - p.vy / sp * len); ctx.stroke();
                break;
            }
            case 'ring': { // onde de choc (écrasée au sol si sq < 1)
                ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
                ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, (p.lw || 8) * (1 - t));
                ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, s), Math.max(1, s * (p.sq || 1)), 0, 0, Math.PI * 2); ctx.stroke();
                break;
            }
            case 'decal': { // tache lumineuse au sol (case touchée, intensité selon la part de dégâts)
                const im = glow(p.color);
                ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
                ctx.drawImage(im, -s, -s * 0.42, 2 * s, 2 * s * 0.42);
                break;
            }
            case 'bolt': drawBolt(p, t); break;
            case 'slash': drawSlash(p, t); break;
            case 'crack': drawCrack(p, t); break;
            case 'jaw': drawJaw(p, t); break;
            case 'beam': drawBeam(p, t); break;
            case 'rays': drawRays(p, t, s); break;
            case 'ghost': drawGhost(p, t); break;
            case 'gust': {
                ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
                ctx.rotate(Math.atan2(p.vy, p.vx));
                ctx.strokeStyle = p.color || '#fff'; ctx.lineWidth = (p.lw || 6) * (1 - t * 0.5);
                ctx.beginPath(); ctx.arc(0, 0, s, -1.1, 1.1); ctx.stroke();
                ctx.lineWidth *= 0.5; ctx.beginPath(); ctx.arc(-s * 0.35, 0, s * 0.75, -1, 1); ctx.stroke();
                break;
            }
        }
    }

    // Éclair : ligne brisée régénérée à chaque image (il crépite)
    function boltPoints(x0, y0, x1, y1, jag) {
        const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 26));
        const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
        const pts = [[x0, y0]];
        for (let i = 1; i < n; i++) {
            const k = i / n, o = rnd(-jag, jag);
            pts.push([x0 + (x1 - x0) * k + nx / l * o, y0 + (y1 - y0) * k + ny / l * o]);
        }
        pts.push([x1, y1]);
        return pts;
    }
    function drawBolt(p, t) {
        if (!p.pts || Math.random() < 0.45) p.pts = boltPoints(p.x0, p.y0, p.x1, p.y1, p.jag || 22);
        ctx.setTransform(res, 0, 0, res, 0, 0);
        const line = (w, c) => {
            ctx.strokeStyle = c; ctx.lineWidth = w;
            ctx.beginPath(); p.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        };
        ctx.globalCompositeOperation = 'lighter';
        line((p.lw || 10) * 2.2, rgba(p.color || '#f8d030', 0.35));
        line(p.lw || 10, p.color || '#f8d030');
        line((p.lw || 10) * 0.4, '#ffffff');
    }
    // Griffures : trois entailles courbes qui se tracent puis s'effacent
    function drawSlash(p, t) {
        const grow = Math.min(1, t / 0.28);
        ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
        ctx.rotate(p.rot);
        const n = p.n || 3, gap = p.size * 0.22;
        for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * gap;
            const len = p.size * (1 - Math.abs(i - (n - 1) / 2) * 0.18);
            const x0 = -len / 2, x1 = x0 + len * grow;
            const draw = (w, c) => {
                ctx.strokeStyle = c; ctx.lineWidth = w;
                ctx.beginPath(); ctx.moveTo(x0, off - len * 0.08); ctx.quadraticCurveTo((x0 + x1) / 2, off + len * 0.1, x1, off - len * 0.08 + (x1 - x0) * 0.02); ctx.stroke();
            };
            ctx.globalCompositeOperation = 'source-over';
            draw(13, rgba(p.dark || '#2b2118', 0.85));
            ctx.globalCompositeOperation = 'lighter';
            draw(9, p.color || '#ffffff');
            draw(3.5, '#ffffff');
        }
    }
    // Brèche : fissures dentelées qui partent du point d'impact, à plat sur le sol
    function makeCrack(size) {
        const branches = [];
        const n = 5 + Math.floor(Math.random() * 3);
        for (let b = 0; b < n; b++) {
            let a = (b / n) * Math.PI * 2 + rnd(-0.3, 0.3), x = 0, y = 0;
            const pts = [[0, 0]];
            const segs = 3 + Math.floor(Math.random() * 3);
            const len = size * rnd(0.55, 1);
            for (let i = 0; i < segs; i++) { a += rnd(-0.55, 0.55); x += Math.cos(a) * len / segs; y += Math.sin(a) * len / segs; pts.push([x, y]); }
            branches.push(pts);
        }
        return branches;
    }
    function drawCrack(p, t) {
        const grow = Math.min(1, t / 0.15);
        ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
        ctx.scale(1, p.sq || 0.42);
        // Trou d'impact
        ctx.fillStyle = 'rgba(43,29,18,.55)';
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.22, p.size * 0.18, 0, 0, Math.PI * 2); ctx.fill();
        p.branches.forEach(pts => {
            const m = Math.max(1, Math.round((pts.length - 1) * grow));
            const stroke = (w, c, dy) => {
                ctx.strokeStyle = c; ctx.lineWidth = w;
                ctx.beginPath(); for (let i = 0; i <= m; i++) { const [x, y] = pts[i]; i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy); } ctx.stroke();
            };
            stroke(7, 'rgba(255,240,210,.35)', 3);
            stroke(6, '#2b1d12', 0);
            if (p.glowColor) { ctx.globalCompositeOperation = 'lighter'; stroke(2, p.glowColor, 0); ctx.globalCompositeOperation = 'source-over'; }
        });
    }
    // Morsure : deux mâchoires de crocs qui se referment
    function drawJaw(p, t) {
        const close = t < 0.35 ? t / 0.35 : 1;
        const gapY = p.size * 0.55 * (1 - close);
        ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
        const teeth = 5, w = p.size / teeth;
        [-1, 1].forEach(side => {
            ctx.beginPath();
            for (let i = 0; i < teeth; i++) {
                const x0 = -p.size / 2 + i * w;
                ctx.moveTo(x0, side * (gapY + p.size * 0.12));
                ctx.lineTo(x0 + w / 2, side * gapY - side * p.size * 0.06);
                ctx.lineTo(x0 + w, side * (gapY + p.size * 0.12));
            }
            ctx.fillStyle = '#ffffff'; ctx.fill();
            ctx.lineWidth = 4; ctx.strokeStyle = p.color || OUT; ctx.stroke();
        });
    }
    // Rayon (Luminocanon…) : faisceau de l'attaquant à la cible
    function drawBeam(p, t) {
        const grow = Math.min(1, t / 0.25);
        const x1 = p.x0 + (p.x1 - p.x0) * grow, y1 = p.y0 + (p.y1 - p.y0) * grow;
        ctx.setTransform(res, 0, 0, res, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        const w = p.lw * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1) * (1 + Math.sin(t * 40) * 0.08);
        [[w * 2.2, rgba(p.color, 0.3)], [w, p.color], [w * 0.4, '#ffffff']].forEach(([lw, c]) => {
            ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, lw);
            ctx.beginPath(); ctx.moveTo(p.x0, p.y0); ctx.lineTo(x1, y1); ctx.stroke();
        });
    }
    // Rayons de lumière (attaques Z, K.O. de boss)
    function drawRays(p, t, s) {
        ctx.setTransform(res, 0, 0, res, p.x * res, p.y * res);
        ctx.rotate(p.rot + t * 0.6);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.color;
        const n = p.n || 12;
        for (let i = 0; i < n; i++) {
            ctx.rotate(Math.PI * 2 / n);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, -s * 0.06); ctx.lineTo(s, s * 0.06); ctx.closePath(); ctx.fill();
        }
    }
    // Fantôme du sprite au K.O. : il blanchit, grossit et se dissipe
    function drawGhost(p, t) {
        ctx.setTransform(res, 0, 0, res, p.x * res, (p.y - t * 30) * res);
        const k = 1 + t * 0.25;
        const w = p.w * k, h = p.h * k;
        ctx.globalAlpha = Math.max(0, 1 - t);
        try {
            ctx.drawImage(p.src, -w / 2, -h / 2, w, h);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = Math.max(0, 1 - t) * Math.min(1, 0.5 + t * 2);
            ctx.drawImage(p.src, -w / 2, -h / 2, w, h);
        } catch { /* image indisponible */ }
    }

    // ------------------------------------------------------------------
    // TÂCHES (projectiles, jets…) et BOUCLE D'ANIMATION
    // ------------------------------------------------------------------
    function addTask(task) {
        if (disabled || !ensureCanvas()) { task.done?.(); return; }
        task.t = 0;
        tasks.push(task);
        run();
    }

    /** Fait voler une image de from à to ; la promesse se résout à l'arrivée. */
    function fly(o) {
        return new Promise(resolve => {
            let finished = false;
            const done = () => { if (!finished) { finished = true; resolve(); } };
            // Filet de sécurité : jamais d'attente si l'onglet est en arrière-plan (pas d'images d'animation)
            setTimeout(done, (o.delay || 0) / speed + o.dur * 3 / speed + 300);
            const dx = o.to.x - o.from.x, dy = o.to.y - o.from.y;
            const nl = Math.hypot(dx, dy) || 1;
            let lastTrail = 0, prev = null;
            addTask({
                delay: o.delay || 0,
                done,
                update(dt) {
                    if (this.delay > 0) { this.delay -= dt; return false; }
                    this.t += dt;
                    const k = Math.min(1, this.t / o.dur);
                    const e = o.ease ? o.ease(k) : k;
                    const wob = o.wobble ? Math.sin(k * Math.PI * (o.wobbleN || 3) + (o.phase || 0)) * o.wobble * Math.sin(k * Math.PI) : 0;
                    this.x = o.from.x + dx * e + (-dy / nl) * wob;
                    this.y = o.from.y + dy * e + (dx / nl) * wob - (o.arc || 0) * Math.sin(Math.PI * e);
                    this.ang = prev ? Math.atan2(this.y - prev.y, this.x - prev.x) : Math.atan2(dy, dx);
                    if (o.trail && this.t - lastTrail >= (o.trailEvery || 22)) { lastTrail = this.t; o.trail(this.x, this.y, this.ang); }
                    prev = { x: this.x, y: this.y };
                    if (k >= 1) { done(); return true; }
                    return false;
                },
                draw() {
                    if (this.delay > 0 || this.x === undefined || !o.img) return;
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = o.add ? 'lighter' : 'source-over';
                    ctx.setTransform(res, 0, 0, res, this.x * res, this.y * res);
                    ctx.rotate(o.spin ? this.t * o.spin / 1000 : (o.rotate === false ? 0 : this.ang + (o.rotOffset || 0)));
                    const s = o.size * (o.grow ? 0.6 + 0.4 * Math.min(1, this.t / o.dur) : 1);
                    ctx.drawImage(img(o.img), -s / 2, -s / 2, s, s);
                },
            });
        });
    }

    function run() {
        if (raf || disabled) return;
        last = now();
        raf = requestAnimationFrame(loop);
    }

    const shakeTargets = () => {
        const sc = scene();
        return sc ? sc.querySelectorAll(':scope > #battle-scene, :scope > .team-grid, :scope > #vfx-canvas, :scope > .arena-fx, :scope > #field-weather') : [];
    };
    function applyShake(on) {
        const x = on ? rnd(-shakeAmp, shakeAmp) : 0, y = on ? rnd(-shakeAmp, shakeAmp) * 0.7 : 0;
        shakeTargets().forEach(el => { el.style.translate = on ? `${x.toFixed(1)}px ${y.toFixed(1)}px` : ''; });
    }

    function loop(t) {
        raf = -1; // pendant l'image, les nouvelles particules ne relancent pas une deuxième boucle
        try { frame(t); }
        catch (e) { console.warn('[BattleVfx] image ignorée :', e); parts.length = 0; tasks.length = 0; raf = 0; }
    }
    function frame(t) {
        if (!ensureCanvas()) { parts.length = 0; tasks.length = 0; raf = 0; return; }
        const real = Math.min(100, Math.max(0, t - last)); // appareils lents : on rattrape jusqu'à 10 images/s
        last = t;
        let dt = real * speed;
        if (t < freezeUntil) dt = 0;
        else if (t < slowUntil) dt *= slowFactor;
        const s = dt / 1000;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Assombrissement (attaques Z) puis particules, tâches et flash par-dessus
        if (dim) {
            dim.age += real;
            const k = dim.age < dim.inMs ? dim.age / dim.inMs : dim.age > dim.life - 260 ? Math.max(0, (dim.life - dim.age) / 260) : 1;
            const gr = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.45, canvas.height * 0.12, canvas.width / 2, canvas.height * 0.45, canvas.height * 0.75);
            gr.addColorStop(0, `rgba(15,8,20,${0.25 * k * dim.a})`);
            gr.addColorStop(1, `rgba(15,8,20,${0.85 * k * dim.a})`);
            ctx.fillStyle = gr; ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (dim.age >= dim.life) dim = null;
        }

        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            if (p.delay > 0) { p.delay -= dt; continue; }
            p.age += dt;
            if (p.age >= p.life) { parts.splice(i, 1); continue; }
            if (p.drag) { const d = Math.pow(1 - p.drag, dt / 16.7); p.vx *= d; p.vy *= d; }
            p.vy += p.ay * s;
            if (p.wob) p.vx += Math.sin(p.age / 120 + p.size) * p.wob * s;
            p.x += p.vx * s; p.y += p.vy * s;
            p.rot += p.vr * s;
            if (p.floor !== undefined && p.y > p.floor && p.vy > 0) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; }
        }
        for (let i = tasks.length - 1; i >= 0; i--) {
            if (tasks[i].update(dt)) tasks.splice(i, 1);
        }
        for (const p of parts) if (!(p.delay > 0)) drawPart(p);
        for (const task of tasks) task.draw?.();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        if (flash) {
            flash.age += real;
            const a = flash.a * Math.max(0, 1 - flash.age / flash.life);
            if (a > 0) { ctx.globalAlpha = a; ctx.fillStyle = flash.color; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            if (flash.age >= flash.life) flash = null;
        }
        ctx.globalAlpha = 1;

        if (shakeAmp > 0.4) { applyShake(true); shakeAmp *= Math.pow(0.5, real / 55); }
        else if (shakeAmp > 0) { shakeAmp = 0; applyShake(false); }

        if (parts.length || tasks.length || flash || dim || shakeAmp > 0) raf = requestAnimationFrame(loop);
        else { raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }

    // ------------------------------------------------------------------
    // ÉCRAN : secousse, flash, gel, ralenti, assombrissement
    // ------------------------------------------------------------------
    function shake(amp) {
        if (disabled || reduced() || !amp) return;
        shakeAmp = Math.min(26, Math.max(shakeAmp, amp));
        run();
    }
    function flashScreen(color, a = 0.4, life = 260) {
        if (disabled || reduced()) return;
        flash = { color, a, life, age: 0 };
        run();
    }
    function freeze(ms) {
        if (disabled || reduced()) return;
        freezeUntil = Math.max(freezeUntil, now() + ms / speed);
    }
    function slowmo(factor, ms) {
        if (disabled || reduced()) return;
        slowFactor = factor;
        slowUntil = now() + ms;
        run();
    }
    function darken(ms, a = 1) {
        if (disabled || reduced()) return;
        dim = { age: 0, life: ms / speed, inMs: 180, a };
        run();
    }

    // ------------------------------------------------------------------
    // MISES EN SCÈNE PAR TYPE
    // ------------------------------------------------------------------
    const TYPE_COLOR = {
        normal: '#e8dcc0', fire: '#ff8a3a', water: '#5aa8f8', grass: '#7ccc4c', electric: '#f8d030', ice: '#9ee6f0',
        fighting: '#e0603c', poison: '#b45ad0', ground: '#d8b468', flying: '#c4b4f8', psychic: '#f86898', bug: '#b4cc28',
        rock: '#c8a850', ghost: '#8a68c8', dragon: '#8058f8', dark: '#8a6a5a', steel: '#c8d0e0', fairy: '#f8a0c8',
    };
    const colorOf = (type) => TYPE_COLOR[type] || TYPE_COLOR.normal;

    // Emplacements pratiques
    const above = (b, dy = 420) => ({ x: b.x + rnd(-30, 30), y: b.y - dy });

    /**
     * Trajet d'une attaque à distance, de a (attaquant) vers b (cible) ; la promesse se résout à l'impact.
     * o.k : intensité (puissance, version Z…)
     */
    const LAUNCH = {
        normal: (a, b, o) => fly({ from: a, to: b, dur: 300, arc: 30, img: 'energy', size: 50 * o.k, add: true, ease: easeIn,
            trail: (x, y) => add({ img: 'wstar', x: x + rnd(-8, 8), y: y + rnd(-8, 8), size: rnd(12, 20), size1: 4, life: 320, vr: 6, rot: rnd(0, 6) }) }),
        fire: (a, b, o) => fly({ from: a, to: b, dur: 330, arc: 46, img: 'fireball', size: 66 * o.k, spin: 900, add: true, ease: easeIn,
            trail: (x, y) => {
                add({ img: 'flame', x: x + rnd(-10, 10), y: y + rnd(-10, 10), vy: -rnd(40, 110), size: rnd(30, 46) * o.k, size1: 8, life: rnd(260, 380), rot: rnd(-0.3, 0.3) });
                add({ img: '#ffb43a', x, y, vx: rnd(-60, 60), vy: rnd(-90, 10), size: rnd(8, 14), size1: 2, life: 420, add: true });
            }, trailEvery: 16 }),
        water: (a, b, o) => stream(a, b, { img: 'drop', n: 11, gap: 24, dur: 280, arc: 54, size: [26, 38], k: o.k, trail: (x, y) => {
            if (Math.random() < 0.5) add({ img: 'bubble', x: x + rnd(-10, 10), y: y + rnd(-10, 10), vy: -rnd(20, 60), size: rnd(10, 18), life: 420 });
        } }),
        electric: (a, b, o) => {
            // Éclair tombé du ciel sur la cible, plus une décharge depuis l'attaquant
            const top = above(b, 520);
            add({ kind: 'bolt', x0: top.x, y0: top.y, x1: b.x, y1: b.y, color: '#f8d030', lw: 12 * o.k, life: 260, hold: 0.5, jag: 30, x: b.x, y: b.y, size: 1 });
            add({ kind: 'bolt', x0: a.x, y0: a.y, x1: b.x, y1: b.y, color: '#fff4a0', lw: 6, life: 180, hold: 0.4, jag: 18, x: a.x, y: a.y, size: 1 });
            return wait(90);
        },
        grass: (a, b, o) => Promise.race([0, 1, 2, 3, 4, 5].map(i => fly({ from: { x: a.x + rnd(-20, 20), y: a.y + rnd(-20, 20) }, to: { x: b.x + rnd(-14, 14), y: b.y + rnd(-14, 14) },
            dur: 360, delay: i * 38, wobble: 46, wobbleN: 2, phase: i, img: 'leaf', size: 38 * o.k, spin: 1400 * (i % 2 ? 1 : -1),
            trail: (x, y) => add({ img: '#a8e070', x, y, size: 12, size1: 2, life: 260, add: true }), trailEvery: 40 })).slice(0, 1)),
        ice: (a, b, o) => Promise.race([0, 1, 2].map(i => fly({ from: a, to: { x: b.x + (i - 1) * 18, y: b.y + rnd(-12, 12) }, dur: 260, delay: i * 50, img: 'shard', size: 52 * o.k,
            rotOffset: Math.PI / 2, ease: easeIn,
            trail: (x, y) => add({ img: 'frost', x, y, size: rnd(18, 28), size1: 4, life: 360 }) })).slice(0, 1)),
        fighting: (a, b, o) => fly({ from: a, to: b, dur: 300, img: 'aura', size: 64 * o.k, add: true, ease: easeIn,
            trail: (x, y) => add({ img: '#7ab0ff', x: x + rnd(-10, 10), y: y + rnd(-10, 10), size: rnd(14, 22), size1: 2, life: 300, add: true }) }),
        poison: (a, b, o) => Promise.race([0, 1, 2].map(i => fly({ from: a, to: { x: b.x + (i - 1) * 22, y: b.y + rnd(-10, 14) }, dur: 400, delay: i * 60, arc: 150, img: 'sludge', size: 40 * o.k, spin: 500,
            trail: (x, y) => add({ img: 'pbubble', x, y, vy: 20, size: rnd(8, 14), life: 300 }), trailEvery: 40 })).slice(0, 1)),
        ground: (a, b, o) => {
            // Le sol se fend de l'attaquant jusqu'à la cible
            const from = { x: a.x, y: a.fy }, to = { x: b.x, y: b.fy };
            return fly({ from, to, dur: 260, img: null,
                trail: (x, y) => { add({ img: 'dust', x: x + rnd(-14, 14), y, vy: -rnd(30, 80), size: rnd(30, 50) * o.k, size1: 60, life: 420 }); add({ img: 'pebble', x, y, vx: rnd(-50, 50), vy: -rnd(160, 260), ay: 900, size: rnd(10, 16), life: 420, vr: 8 }); },
                trailEvery: 26 });
        },
        flying: (a, b, o) => Promise.race([0, 1, 2].map(i => fly({ from: { x: a.x, y: a.y + (i - 1) * 16 }, to: { x: b.x, y: b.y + (i - 1) * 16 }, dur: 300, delay: i * 45, img: null,
            trail: (x, y, ang) => {
                add({ kind: 'gust', x, y, vx: Math.cos(ang), vy: Math.sin(ang), size: 26 * o.k, size1: 34, life: 160, color: '#ffffff', lw: 6 });
                if (Math.random() < 0.3) add({ img: 'feather', x, y, vx: rnd(-40, 40), vy: rnd(-30, 30), size: rnd(18, 26), life: 500, rot: rnd(0, 6), vr: 3 });
            }, trailEvery: 30 })).slice(0, 1)),
        psychic: (a, b, o) => Promise.race([0, 1, 2, 3].map(i => fly({ from: a, to: b, dur: 340, delay: i * 55, img: null,
            trail: (x, y) => add({ kind: 'ring', x, y, size: 14 + i * 4, size1: 30, color: rgba('#f86898', 0.9), lw: 5, life: 200 }), trailEvery: 34 })).slice(0, 1)),
        bug: (a, b, o) => Promise.race([0, 1, 2, 3, 4].map(i => fly({ from: { x: a.x + rnd(-16, 16), y: a.y + rnd(-16, 16) }, to: { x: b.x + rnd(-18, 18), y: b.y + rnd(-18, 18) },
            dur: 200, delay: i * 34, img: 'needle', size: 40 * o.k, ease: easeIn })).slice(0, 1)),
        rock: (a, b, o) => Promise.race([0, 1, 2].map(i => fly({ from: above(b, 460), to: { x: b.x + (i - 1) * 26, y: b.fy - 10 }, dur: 300, delay: i * 70,
            img: 'rock', size: rnd(46, 62) * o.k, spin: rnd(-500, 500), ease: easeIn,
            trail: (x, y) => add({ img: 'dust', x, y, size: 22, size1: 6, life: 260, alpha: 0.6 }), trailEvery: 40 })).slice(0, 1)),
        ghost: (a, b, o) => fly({ from: a, to: b, dur: 380, img: 'orb', size: 64 * o.k, wobble: 30, wobbleN: 2, rotate: false,
            trail: (x, y) => add({ img: 'bflame', x: x + rnd(-12, 12), y: y + rnd(-12, 12), vy: -rnd(30, 70), size: rnd(18, 28), size1: 4, life: 380 }), trailEvery: 26 }),
        dragon: (a, b, o) => stream(a, b, { img: 'dflame', n: 9, gap: 30, dur: 300, arc: 26, size: [40, 58], k: o.k, wobble: 18, rotOffset: Math.PI / 2,
            trail: (x, y) => add({ img: '#b9a2ff', x, y, size: 14, size1: 2, life: 260, add: true }) }),
        dark: (a, b, o) => fly({ from: a, to: b, dur: 320, img: 'dark', size: 70 * o.k, rotate: false, ease: easeIn,
            trail: (x, y) => { add({ img: 'smoke', x: x + rnd(-10, 10), y: y + rnd(-10, 10), size: rnd(26, 40), size1: 54, life: 420 }); add({ kind: 'ring', x, y, size: 14, size1: 40, color: 'rgba(140,90,150,.8)', lw: 4, life: 220 }); },
            trailEvery: 40 }),
        steel: (a, b, o) => {
            add({ kind: 'beam', x0: a.x, y0: a.y, x1: b.x, y1: b.y, color: '#c8d4ec', lw: 16 * o.k, life: 360, hold: 0.7, x: a.x, y: a.y, size: 1 });
            burst(a.x, a.y, 6, { img: 'sparkle', speed: [40, 140], life: [200, 360], size: [16, 26] });
            return wait(110);
        },
        fairy: (a, b, o) => stream(a, b, { img: 'star', n: 8, gap: 34, dur: 340, arc: 40, size: [22, 32], k: o.k, wobble: 30, spin: 600,
            trail: (x, y) => add({ img: 'sparkle', x: x + rnd(-10, 10), y: y + rnd(-10, 10), size: rnd(12, 20), size1: 2, life: 340 }) }),
    };

    function easeIn(k) { return k * k * (1.4 - 0.4 * k); }
    function wait(ms) { return new Promise(r => setTimeout(r, ms / speed)); }

    // Jet continu (eau, flammes de dragon, étoiles) : se résout à l'arrivée de la première goutte
    function stream(a, b, o) {
        const shots = [];
        for (let i = 0; i < count(o.n); i++) {
            shots.push(fly({ from: { x: a.x + rnd(-6, 6), y: a.y + rnd(-6, 6) }, to: { x: b.x + rnd(-16, 16), y: b.y + rnd(-14, 14) }, dur: o.dur, delay: i * o.gap,
                arc: o.arc * rnd(0.7, 1.2), img: o.img, size: rnd(o.size[0], o.size[1]) * o.k, wobble: o.wobble, phase: i, spin: o.spin, rotOffset: o.rotOffset ?? Math.PI / 2,
                trail: o.trail, trailEvery: 30 }));
        }
        return shots[0];
    }

    /** Explosion d'un type sur une cible (b : spot), k = intensité. */
    const IMPACT = {
        normal: (b, k) => {
            add({ img: 'bang', x: b.x, y: b.y, size: 70 * k, size1: 110 * k, life: 220, hold: 0.4, rot: rnd(0, 6) });
            burst(b.x, b.y, 8, { img: 'wstar', speed: [160, 320], life: [300, 480], size: [14, 22], drag: 0.06, spin: 8 });
        },
        fire: (b, k) => {
            add({ img: 'fireball', x: b.x, y: b.y, size: 80 * k, size1: 170 * k, life: 260, hold: 0.3, add: true });
            burst(b.x, b.y + 10, 14, { img: 'flame', speed: [60, 200], ay: -420, drag: 0.04, life: [380, 620], size: [34, 58], grow: 0.25, radius: 18 * k, angle: -Math.PI / 2, spread: 1.4, hold: 0.4 });
            burst(b.x, b.y, 18, { img: '#ffb43a', add: true, speed: [140, 380], ay: 260, drag: 0.03, life: [400, 700], size: [8, 14], grow: 0.2 });
            burst(b.x, b.y - 20, 4, { img: 'smoke', speed: [20, 60], ay: -80, life: [600, 900], size: [40, 60], grow: 1.8, delay: 160, hold: 0.3 });
            add({ kind: 'ring', x: b.fx, y: b.fy, size: 20, size1: 110 * k, sq: 0.4, color: '#ff8a3a', lw: 12, life: 320 });
        },
        water: (b, k) => {
            burst(b.x, b.y, 20, { img: 'drop', speed: [180, 380], ay: 900, angle: -Math.PI / 2, spread: 1.3, life: [420, 640], size: [18, 30], align: true, hold: 0.7 });
            burst(b.x, b.y + 20, 8, { img: 'bubble', speed: [20, 70], ay: -120, life: [600, 900], size: [12, 24], radius: 40, delay: 120, wob: 60 });
            add({ kind: 'ring', x: b.fx, y: b.fy, size: 16, size1: 120 * k, sq: 0.38, color: '#bfe4ff', lw: 10, life: 380 });
            add({ kind: 'ring', x: b.fx, y: b.fy, size: 10, size1: 80 * k, sq: 0.38, color: '#5aa8f8', lw: 8, life: 420, delay: 80 });
        },
        electric: (b, k) => {
            burst(b.x, b.y, 18, { kind: 'streak', color: '#fff38a', add: true, speed: [300, 620], drag: 0.08, life: [180, 320], size: [26, 40], lw: 4 });
            for (let i = 0; i < count(4); i++) {
                const a = rnd(0, Math.PI * 2), r = rnd(40, 70) * k;
                add({ kind: 'bolt', x0: b.x, y0: b.y, x1: b.x + Math.cos(a) * r, y1: b.y + Math.sin(a) * r, color: '#f8d030', lw: 5, jag: 10, life: 260, delay: i * 60, x: b.x, y: b.y, size: 1 });
            }
            add({ img: '#fff6b0', x: b.x, y: b.y, size: 90 * k, size1: 170 * k, life: 220, add: true, hold: 0.2 });
        },
        grass: (b, k) => {
            burst(b.x, b.y, 18, { img: 'leaf', speed: [180, 380], ay: 140, drag: 0.07, life: [650, 950], size: [30, 46], spin: 9, wob: 220, hold: 0.6 });
            burst(b.x, b.y, 8, { img: 'sparkle', speed: [60, 180], life: [300, 500], size: [14, 24] });
            add({ kind: 'ring', x: b.fx, y: b.fy, size: 16, size1: 100 * k, sq: 0.4, color: '#9ad85a', lw: 9, life: 340 });
        },
        ice: (b, k) => {
            // Pics de glace qui jaillissent du sol autour de la cible
            for (let i = 0; i < count(7); i++) {
                const a = (i / 7) * Math.PI * 2 + rnd(-0.2, 0.2), r = rnd(18, 52) * k;
                add({ img: 'shard', x: b.fx + Math.cos(a) * r, y: b.fy + Math.sin(a) * r * 0.42 - 16, size: 8, size1: rnd(50, 72) * k, rot: Math.cos(a) * 0.45, life: 620, hold: 0.7, delay: i * 18 });
            }
            burst(b.x, b.y, 12, { img: 'frost', speed: [40, 140], life: [500, 800], size: [26, 46], grow: 1.6, hold: 0.3 });
            burst(b.x, b.y, 10, { img: 'sparkle', speed: [120, 260], drag: 0.05, life: [300, 520], size: [12, 22] });
        },
        fighting: (b, k) => {
            add({ img: 'bang', x: b.x, y: b.y, size: 80 * k, size1: 140 * k, life: 240, hold: 0.4, rot: rnd(0, 6) });
            add({ kind: 'ring', x: b.x, y: b.y, size: 20, size1: 120 * k, color: '#fff2c8', lw: 10, life: 260 });
            add({ kind: 'ring', x: b.x, y: b.y, size: 14, size1: 90 * k, color: '#e0603c', lw: 8, life: 300, delay: 60 });
            burst(b.x, b.y, 12, { kind: 'streak', color: '#fff2c8', speed: [420, 700], drag: 0.1, life: [140, 240], size: [30, 50], lw: 5 });
        },
        poison: (b, k) => {
            burst(b.x, b.y, 12, { img: 'sludge', speed: [140, 300], ay: 700, angle: -Math.PI / 2, spread: 1.5, life: [420, 620], size: [18, 30], hold: 0.7 });
            burst(b.x, b.y + 16, 10, { img: 'pbubble', speed: [20, 70], ay: -140, life: [600, 1000], size: [14, 26], radius: 40, delay: 140, wob: 80 });
            burst(b.x, b.y, 4, { img: '#a04ac0', speed: [10, 40], life: [600, 900], size: [60, 80], grow: 1.6, hold: 0.2, alpha: 0.5 });
        },
        ground: (b, k) => {
            crack(b, 1.1 * k, '#ffcc66');
            burst(b.fx, b.fy, 8, { img: 'rock', speed: [200, 380], ay: 1300, angle: -Math.PI / 2, spread: 0.7, life: [500, 700], size: [18, 30], spin: 10, hold: 0.75 });
            burst(b.fx, b.fy - 10, 8, { img: 'dust', speed: [40, 140], vy: -60, sq: 0.5, life: [600, 900], size: [50, 80], grow: 1.7, hold: 0.3 });
        },
        flying: (b, k) => {
            burst(b.x, b.y, 10, { img: 'feather', speed: [120, 260], ay: 60, drag: 0.08, life: [700, 1000], size: [20, 30], spin: 4, wob: 200, hold: 0.6 });
            for (let i = 0; i < 3; i++) add({ kind: 'gust', x: b.x - 30 + i * 30, y: b.y + rnd(-20, 20), vx: 1, vy: rnd(-0.3, 0.3), size: 30 * k, size1: 60 * k, life: 260, delay: i * 50, color: '#ffffff', lw: 7 });
        },
        psychic: (b, k) => {
            for (let i = 0; i < 4; i++) add({ kind: 'ring', x: b.x, y: b.y, size: 70 * k, size1: 8, color: i % 2 ? '#ffd0e0' : '#f86898', lw: 7, life: 360, delay: i * 70, hold: 0.8 });
            burst(b.x, b.y, 10, { img: 'psy', add: true, speed: [60, 180], life: [400, 600], size: [18, 30] });
        },
        bug: (b, k) => {
            burst(b.x, b.y, 12, { img: 'needle', speed: [200, 380], drag: 0.06, life: [300, 460], size: [18, 26], align: true });
            burst(b.x, b.y, 10, { img: '#d6ec7a', add: true, speed: [100, 260], life: [260, 420], size: [10, 16] });
            add({ img: 'bang', x: b.x, y: b.y, size: 50 * k, size1: 80 * k, life: 180, hold: 0.4, alpha: 0.8 });
        },
        rock: (b, k) => {
            crack(b, 0.9 * k);
            // Les gros rochers tombés restent un instant au sol avant de s'effriter
            for (let i = 0; i < count(3); i++) add({ img: 'rock', x: b.fx + (i - 1) * 34 * k, y: b.fy - 14 - (i % 2) * 10, size: rnd(46, 60) * k * 0.7, rot: rnd(-0.6, 0.6), life: 620, hold: 0.7 });
            burst(b.fx, b.fy - 10, 10, { img: 'rock', speed: [160, 340], ay: 1200, angle: -Math.PI / 2, spread: 1.2, life: [550, 780], size: [22, 42], spin: 10, hold: 0.75 });
            burst(b.fx, b.fy - 10, 6, { img: 'dust', speed: [40, 120], vy: -40, sq: 0.6, life: [600, 900], size: [50, 80], grow: 1.6, hold: 0.3, alpha: 0.6 });
        },
        ghost: (b, k) => {
            burst(b.x, b.y, 12, { img: 'bflame', speed: [40, 140], ay: -220, life: [500, 800], size: [24, 40], grow: 0.3, wob: 160 });
            add({ kind: 'ring', x: b.x, y: b.y, size: 20, size1: 110 * k, color: '#5a2f95', lw: 12, life: 360 });
            add({ img: 'orb', x: b.x, y: b.y, size: 70 * k, size1: 150 * k, life: 300, hold: 0.2 });
        },
        dragon: (b, k) => {
            burst(b.x, b.y, 14, { img: 'dflame', speed: [80, 240], ay: -360, drag: 0.04, life: [400, 650], size: [34, 56], grow: 0.25, radius: 16, hold: 0.4 });
            burst(b.x, b.y, 10, { img: 'sparkle', speed: [160, 320], drag: 0.05, life: [300, 520], size: [14, 24] });
            add({ kind: 'ring', x: b.fx, y: b.fy, size: 20, size1: 120 * k, sq: 0.4, color: '#8058f8', lw: 12, life: 340 });
        },
        dark: (b, k) => {
            add({ kind: 'slash', x: b.x, y: b.y, rot: 0.75, size: 110 * k, n: 1, life: 420, color: '#c08ad0', dark: '#140a14', hold: 0.6 });
            add({ kind: 'slash', x: b.x, y: b.y, rot: -0.75, size: 110 * k, n: 1, life: 420, color: '#c08ad0', dark: '#140a14', hold: 0.6, delay: 70 });
            burst(b.x, b.y, 7, { img: 'smoke', speed: [30, 110], life: [500, 800], size: [40, 64], grow: 1.6, hold: 0.3 });
        },
        steel: (b, k) => {
            burst(b.x, b.y, 10, { img: 'metal', speed: [180, 360], ay: 700, life: [400, 620], size: [16, 26], spin: 12, hold: 0.7 });
            burst(b.x, b.y, 14, { kind: 'streak', color: '#ffffff', add: true, speed: [320, 600], drag: 0.08, life: [160, 280], size: [20, 34], lw: 3 });
            burst(b.x, b.y, 5, { img: 'sparkle', speed: [30, 90], life: [380, 560], size: [26, 40], radius: 30 });
            add({ kind: 'ring', x: b.x, y: b.y, size: 16, size1: 100 * k, color: '#e8ecf6', lw: 9, life: 260 });
        },
        fairy: (b, k) => {
            burst(b.x, b.y, 14, { img: 'star', speed: [140, 300], drag: 0.06, ay: 80, life: [500, 800], size: [16, 28], spin: 6 });
            burst(b.x, b.y, 12, { img: 'sparkle', speed: [40, 200], life: [400, 700], size: [14, 26], delay: 80 });
            add({ kind: 'ring', x: b.x, y: b.y, size: 14, size1: 110 * k, color: '#ffc0dc', lw: 9, life: 340 });
        },
    };

    function crack(b, k, glowColor) {
        k = Math.min(k, 1.7);
        add({ kind: 'crack', x: b.fx, y: b.fy, size: 90 * k, branches: makeCrack(90 * k), life: 1100, hold: 0.7, glowColor, sq: 0.42 });
    }

    // Marques de contact selon le nom de la capacité
    const MARKS = [
        ['slash', /griff|tranch|lame|coupe|entaill|cisaill|taillad|sabre|faux|slash|claw|cut|scratch|blade|razor|scissor|psycho-cut|aerial|tranche|furie|serre|crochet/],
        ['bite', /morsure|croc|mâchouill|machouill|bite|fang|crunch|jaw|mâchoire|dent/],
        ['punch', /poing|pied|coup|frappe|uppercut|marteau|punch|kick|hammer|chop|boule|dynamo|mach|close-combat|stomp|écras|ecras|manchette|karaté|karate|tatane|balayage|sumo|plaquage|bélier|belier|charge|tackle|slam|body|headbutt|bash/],
    ];
    function markFor(move) {
        const key = `${move?.id || ''} ${move?.name || ''} ${move?.name_fr || ''}`.toLowerCase();
        const hit = MARKS.find(([, re]) => re.test(key));
        return hit ? hit[0] : 'punch';
    }
    function contactMark(mark, b, type, k) {
        const color = colorOf(type);
        if (mark === 'slash') {
            add({ kind: 'slash', x: b.x, y: b.y, rot: rnd(0.55, 0.9) * (Math.random() < 0.5 ? 1 : -1), size: 78 * k, n: 3, life: 520, color: type === 'normal' ? '#ffffff' : color, hold: 0.6 });
        } else if (mark === 'bite') {
            add({ kind: 'jaw', x: b.x, y: b.y, size: 100 * k, life: 420, hold: 0.6, color: OUT });
            burst(b.x, b.y, 6, { img: 'wstar', speed: [200, 340], life: [260, 400], size: [12, 20], delay: 120, spin: 8 });
        } else {
            add({ img: 'bang', x: b.x, y: b.y, size: 70 * k, size1: 125 * k, life: 220, hold: 0.4, rot: rnd(0, 6) });
            add({ kind: 'ring', x: b.x, y: b.y, size: 20, size1: 100 * k, color: '#fff6dc', lw: 9, life: 240 });
        }
    }

    // ------------------------------------------------------------------
    // API DE MISE EN SCÈNE
    // ------------------------------------------------------------------
    /** Concentration avant l'attaque : particules aspirées, lueur du type sur l'attaquant. */
    function charge(slotEl, type, { z = false, status = false, ms = 160 } = {}) {
        const a = spot(slotEl);
        const sprite = slotEl?.querySelector('.unit .sprite');
        if (disabled || !a) return wait(ms * 0.5);
        const color = colorOf(type);
        if (sprite) {
            sprite.style.setProperty('--vfx-color', color);
            sprite.classList.add(type === 'steel' ? 'vfx-metal' : 'vfx-charge');
        }
        const n = z ? 18 : status ? 12 : 8;
        for (let i = 0; i < count(n); i++) {
            const ang = rnd(0, Math.PI * 2), r = rnd(60, 110) * (z ? 1.6 : 1);
            add({ img: color, add: true, x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r, vx: -Math.cos(ang) * r / (ms / 1000), vy: -Math.sin(ang) * r / (ms / 1000),
                size: rnd(14, 24), size1: 6, life: ms, hold: 0.8, delay: rnd(0, ms * 0.3) });
        }
        add({ kind: 'ring', x: a.fx, y: a.fy, size: 90 * (z ? 1.5 : 1), size1: 20, sq: 0.4, color, lw: 8, life: ms + 60 });
        if (status) burst(a.x, a.y + 30, 12, { img: type === 'fairy' ? 'star' : 'sparkle', speed: [20, 50], ay: -160, life: [500, 800], size: [14, 24], radius: 40, delay: 200 });
        if (type === 'steel') burst(a.x, a.y, 4, { img: 'sparkle', speed: [10, 40], life: [400, 600], size: [24, 40], radius: 40, delay: ms * 0.5 });
        if (type === 'electric') for (let i = 0; i < count(3); i++) {
            const g = rnd(0, Math.PI * 2);
            add({ kind: 'bolt', x0: a.x, y0: a.y, x1: a.x + Math.cos(g) * 60, y1: a.y + Math.sin(g) * 60, color: '#f8d030', lw: 4, jag: 10, life: 140, delay: i * 50, x: a.x, y: a.y, size: 1 });
        }
        if (z) {
            darken(1500);
            add({ kind: 'rays', x: a.x, y: a.y, size: 40, size1: 260, rot: rnd(0, 6), color: rgba(color, 0.35), n: 14, life: 700, hold: 0.5 });
            add({ img: color, add: true, x: a.x, y: a.y, size: 80, size1: 260, life: 600, hold: 0.4 });
        }
        return wait(z ? ms * 2.4 : ms);
    }
    function release(slotEl) {
        const sprite = slotEl?.querySelector('.unit .sprite');
        sprite?.classList.remove('vfx-charge', 'vfx-metal');
    }

    /** Cases visées : chaque cible s'illumine au sol selon sa part de dégâts (forme de zone pondérée). */
    function zone(list, type) {
        const color = colorOf(type);
        list.forEach(({ el, mult = 1 }) => {
            const b = spot(el);
            if (!b) return;
            const m = Math.max(0.25, Math.min(1, mult));
            add({ kind: 'decal', x: b.fx, y: b.fy, size: 60 + 50 * m, color, life: 760, alpha: 0.35 + 0.55 * m, fadeIn: 0.2, hold: 0.55, add: true });
            add({ kind: 'ring', x: b.fx, y: b.fy, size: 90 * m + 20, size1: 40 * m + 10, sq: 0.42, color, lw: 4 + 4 * m, life: 300, alpha: 0.4 + 0.6 * m });
        });
    }

    /** Trajet vers une cible (attaques à distance). */
    function launch(type, fromEl, toEl, k = 1) {
        const a = spot(fromEl), b = spot(toEl);
        if (disabled || !a || !b) return wait(160);
        return (LAUNCH[type] || LAUNCH.normal)(a, b, { k: k * SCALE });
    }
    /** Ricochet : le projectile repart d'une cible vers la suivante. */
    function bounce(type, fromEl, toEl, k = 1) { return launch(type, fromEl, toEl, k * 0.8); }

    /** Traînée de vitesse de l'attaquant qui s'élance. */
    function dash(fromEl, toEl, type) {
        const a = spot(fromEl), b = spot(toEl);
        if (disabled || !a || !b) return;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        for (let i = 0; i < count(10); i++) {
            const t = rnd(0, 1), off = rnd(-40, 40);
            add({ kind: 'streak', color: i % 3 ? 'rgba(255,250,235,.85)' : colorOf(type), x: a.x + (b.x - a.x) * t - Math.sin(ang) * off, y: a.y + (b.y - a.y) * t + Math.cos(ang) * off,
                vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, drag: 0.15, size: rnd(40, 80), life: 200, delay: rnd(0, 80), lw: 3 });
        }
        burst(a.fx, a.fy, 5, { img: 'dust', speed: [40, 120], sq: 0.5, life: [400, 600], size: [30, 46], grow: 1.5, hold: 0.3 });
    }

    /**
     * Impact sur une cible.
     * o : { mult, crit, typeMod, contact, mark, power, z, lethal, boss, main }
     * Retourne l'intensité (sert à doser secousse et gel).
     */
    function impact(type, el, o = {}) {
        const b = spot(el);
        if (disabled || !b) return 0;
        const pw = Math.max(30, Math.min(160, o.power || 50));
        let k = SCALE * (0.75 + pw / 220) * (0.6 + 0.4 * Math.max(0.3, Math.min(1, o.mult ?? 1)));
        if (o.crit) k *= 1.15;
        if ((o.typeMod || 1) >= 2) k *= 1.12;
        if (o.z) k *= 1.45;
        if (o.boss) k *= 1.12;
        if (o.typeMod === 0) k *= 0.5;
        k = Math.min(k, o.z ? 2.6 : 2.1); // lisibilité : on voit toujours la cible
        // Au contact, la marque (griffures, crocs, poing) passe par-dessus les images du type
        if (!o.contact || type !== 'normal' || o.mark === 'punch') (IMPACT[type] || IMPACT.normal)(b, o.contact ? k * 0.8 : k);
        else burst(b.x, b.y, 8, { img: 'wstar', speed: [180, 340], life: [300, 480], size: [14, 22], drag: 0.06, spin: 8 });
        if (o.contact) contactMark(o.mark || 'punch', b, type, k);
        // Brèche dans le sol : gros coups de contact, coups critiques puissants, versions Z
        if (!['ground', 'rock'].includes(type) && ((o.contact && pw >= 80) || (o.crit && pw >= 70) || o.z || o.lethal)) crack(b, 0.8 * k);
        if (o.z) add({ kind: 'rays', x: b.x, y: b.y, size: 40, size1: 300, rot: rnd(0, 6), color: rgba(colorOf(type), 0.3), n: 16, life: 600, hold: 0.4 });
        // Flash et secousse dosés (l'écran ne tremble pas pour un petit coup)
        if (o.main !== false) {
            let amp = 2 + (pw - 40) / 14;
            if (o.crit) amp *= 1.5;
            if ((o.typeMod || 1) >= 2) amp *= 1.35;
            if (o.z) amp *= 2;
            if (o.lethal) amp *= 1.4;
            if (o.typeMod === 0) amp = 0;
            shake(amp);
            if (o.z) flashScreen(rgba(colorOf(type), 1), 0.55, 380);
            else if (o.lethal) flashScreen('#ffffff', 0.45, 300);
            else if (o.crit) flashScreen('#ffffff', 0.32, 220);
            else if ((o.typeMod || 1) >= 2) flashScreen(rgba(colorOf(type), 1), 0.22, 220);
            if (o.lethal) slowmo(0.25, 520);
        }
        return k;
    }

    /** K.O. : le sprite blanchit et se dissipe, éclats et fumée. */
    function knockOut(slotEl, { boss = false } = {}) {
        const b = spot(slotEl);
        if (disabled || !b) return;
        const sprite = slotEl.querySelector('.unit .sprite');
        const src = [...(sprite?.querySelectorAll('img, canvas') || [])].find(e => e.offsetWidth && (e.tagName === 'CANVAS' || e.complete));
        if (src) {
            const r = center(src);
            if (r) add({ kind: 'ghost', src, x: r.x, y: r.y, w: r.w, h: r.h, life: 620, size: 1, hold: 0 });
        }
        burst(b.x, b.y, 16, { img: 'wstar', speed: [180, 380], drag: 0.05, ay: 300, life: [500, 800], size: [14, 24], spin: 8 });
        burst(b.x, b.y + 20, 6, { img: 'smoke', speed: [20, 80], ay: -60, life: [700, 1000], size: [50, 80], grow: 1.6, hold: 0.3 });
        add({ kind: 'ring', x: b.fx, y: b.fy, size: 20, size1: 140, sq: 0.42, color: '#fff6dc', lw: 10, life: 420 });
        if (boss) {
            add({ kind: 'rays', x: b.x, y: b.y, size: 60, size1: 420, rot: rnd(0, 6), color: 'rgba(255,240,200,.35)', n: 18, life: 1000, hold: 0.5 });
            flashScreen('#ffffff', 0.6, 500);
            shake(20);
        }
    }

    /** Entrée d'un boss : onde de choc et grondement. */
    function bossRoar(slotEl, color = '#ff5a5a') {
        const b = spot(slotEl);
        if (disabled || !b) return;
        for (let i = 0; i < 3; i++) add({ kind: 'ring', x: b.x, y: b.y, size: 30, size1: 340, color: i % 2 ? '#fff6dc' : color, lw: 14, life: 600, delay: i * 140 });
        burst(b.fx, b.fy, 10, { img: 'dust', speed: [120, 260], sq: 0.45, life: [700, 1000], size: [50, 80], grow: 1.6, hold: 0.3 });
        crack(b, 1.2);
        shake(16);
    }

    /** Statut ou soin sur une cible (sans dégâts) : petite gerbe de la couleur du type. */
    function puff(type, el) {
        const b = spot(el);
        if (disabled || !b) return;
        const color = colorOf(type);
        add({ kind: 'ring', x: b.x, y: b.y, size: 80, size1: 10, color, lw: 6, life: 320 });
        burst(b.x, b.y, 8, { img: color, add: true, speed: [40, 120], ay: -100, life: [400, 600], size: [14, 22] });
    }

    function setSpeed(v) { speed = v > 0 ? v : 1; }
    function clear() {
        if (raf > 0) cancelAnimationFrame(raf);
        raf = 0;
        parts.length = 0; tasks.length = 0; flash = null; dim = null; shakeAmp = 0; freezeUntil = 0; slowUntil = 0;
        applyShake(false);
        if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }

    return {
        get level() { return level; }, setLevel, reduced,
        get disabled() { return disabled; }, set disabled(v) { disabled = !!v; if (disabled) clear(); },
        setSpeed, clear, colorOf, markFor, spot,
        charge, release, zone, launch, bounce, dash, impact, knockOut, bossRoar, puff,
        shake, flash: flashScreen, freeze, slowmo, darken,
    };
})();
window.BattleVfx = BattleVfx;
