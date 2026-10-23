/**
 * xbr-worker.js - Agrandit des pixels en xBR hors du fil principal (worker de type module).
 * Message reçu : { id, width, height, scale, pixels, outlineTint, outlineThin } (pixels : ArrayBuffer RGBA) ;
 * réponse : { id, pixels } ou { id, error }.
 *
 * Le contour noir d'1 pixel des sprites PMD devient très épais une fois agrandi ; on l'allège :
 *  - outlineTint (0 à 1) : avant l'agrandissement, le contour extérieur se teinte vers la couleur voisine assombrie ;
 *  - outlineThin (pixels agrandis) : après, on retire cette épaisseur de sombre au bord, jamais de la couleur.
 */
import { xbr2x, xbr3x, xbr4x } from './vendor/xbr.js';

const SCALERS = { 2: xbr2x, 3: xbr3x, 4: xbr4x };
const INK = [43, 33, 24]; // encre sépia du jeu (--gba-frame)
const DARK_OUTLINE = 70;  // luminosité sous laquelle un pixel du sprite est un trait
const DARK_THIN = 80;     // idem après agrandissement (les traits teintés restent sous ce seuil)

const alphaOf = (p) => p >>> 24;
const lumaOf = (p) => 0.299 * (p & 255) + 0.587 * ((p >>> 8) & 255) + 0.114 * ((p >>> 16) & 255);

// Contour extérieur (pixels sombres qui touchent le vide) teinté vers la couleur voisine assombrie
function tintOutline(px, w, h, tint) {
    const src = px.slice();
    const opaque = (x, y) => x >= 0 && y >= 0 && x < w && y < h && alphaOf(src[y * w + x]) > 0;
    const dark = (i) => alphaOf(src[i]) > 0 && lumaOf(src[i]) < DARK_OUTLINE;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (!dark(i)) continue;
            let edge = false;
            for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (!opaque(x + dx, y + dy)) { edge = true; break; }
            if (!edge) continue;
            // Couleur moyenne des voisins colorés, un cran plus loin s'il n'y en a pas
            let r = 0, g = 0, b = 0, n = 0;
            for (let radius = 1; radius <= 2 && !n; radius++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        if (!opaque(x + dx, y + dy)) continue;
                        const j = (y + dy) * w + x + dx;
                        if (dark(j)) continue;
                        const p = src[j];
                        r += p & 255; g += (p >>> 8) & 255; b += (p >>> 16) & 255; n++;
                    }
                }
            }
            if (!n) continue;
            const p = src[i];
            const mix = (own, mean, ink) => Math.round(own * (1 - tint) + (mean / n * 0.35 + ink * 0.65) * tint);
            px[i] = ((alphaOf(p) << 24) | (mix((p >>> 16) & 255, b, INK[2]) << 16)
                | (mix((p >>> 8) & 255, g, INK[1]) << 8) | mix(p & 255, r, INK[0])) >>> 0;
        }
    }
}

// Retire `steps` pixels de sombre au bord extérieur, puis adoucit ce nouveau bord
function thinOutline(px, w, h, steps) {
    const n = w * h;
    let inside = new Uint8Array(n);
    const remove = new Uint8Array(n);
    for (let i = 0; i < n; i++) inside[i] = alphaOf(px[i]) > 127 ? 1 : 0;
    for (let s = 0; s < steps; s++) {
        const eroded = new Uint8Array(n);
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                if (!inside[i]) continue;
                let all = 1;
                for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) if (!inside[i + dy * w + dx]) { all = 0; break; }
                eroded[i] = all;
            }
        }
        for (let i = 0; i < n; i++) if (inside[i] && !eroded[i] && lumaOf(px[i]) < DARK_THIN) remove[i] = 1;
        inside = eroded;
    }
    // Le bord semi-transparent laissé par xBR appartient au trait retiré
    const alpha = new Float32Array(n);
    for (let i = 0; i < n; i++) alpha[i] = remove[i] || alphaOf(px[i]) <= 127 ? 0 : alphaOf(px[i]);
    // Flou 1-2-1 (≈ gaussien de 0,7 px) : on ne fait que retirer de l'opacité sur le bord
    const tmp = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        tmp[i] = (alpha[x > 0 ? i - 1 : i] + 2 * alpha[i] + alpha[x < w - 1 ? i + 1 : i]) / 4;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const blur = (tmp[y > 0 ? i - w : i] + 2 * tmp[i] + tmp[y < h - 1 ? i + w : i]) / 4;
        const a = Math.round(Math.min(alpha[i], blur * 1.5));
        px[i] = ((px[i] & 0x00ffffff) | (a << 24)) >>> 0;
    }
}

self.onmessage = ({ data }) => {
    const { id, width, height, scale, pixels, outlineTint = 0, outlineThin = 0 } = data;
    try {
        const src = new Uint32Array(pixels);
        if (outlineTint > 0) tintOutline(src, width, height, outlineTint);
        // Les sprites PMD n'ont que des pixels opaques ou transparents : pas de mélange de transparence
        const out = SCALERS[scale](src, width, height, { scaleAlpha: false });
        if (outlineThin > 0) thinOutline(out, width * scale, height * scale, outlineThin);
        self.postMessage({ id, pixels: out.buffer }, [out.buffer]);
    } catch (e) {
        self.postMessage({ id, error: String(e) });
    }
};
