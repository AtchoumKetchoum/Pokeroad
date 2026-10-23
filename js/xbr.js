/**
 * xbr.js - Lissage xBR (algorithme de Hyllian) calculé dans un worker (js/xbr-worker.js).
 * Partagé par les sprites PMD (pmd-sprite.js) et les bâtiments du bourg (art.js) : le pixel art
 * est agrandi n fois puis affiché réduit et lissé, sans pixels de largeurs inégales.
 *
 * Options : scale (2, 3 ou 4), outlineTint et outlineThin (contour noir allégé, voir xbr-worker.js).
 * Si le navigateur ne sait pas lancer le worker, tout résout à null et l'appelant garde ses pixels.
 */

const Xbr = (() => {
    let worker = null, broken = false, seq = 0;
    const jobs = new Map();

    function getWorker() {
        if (worker || broken) return worker;
        try {
            worker = new Worker('js/xbr-worker.js', { type: 'module' });
            worker.onmessage = ({ data }) => {
                const job = jobs.get(data.id);
                jobs.delete(data.id);
                job?.(data.pixels ? new Uint32Array(data.pixels) : null);
            };
            worker.onerror = () => { // worker introuvable ou modules non pris en charge
                broken = true; worker = null;
                jobs.forEach(job => job(null)); jobs.clear();
            };
        } catch {
            broken = true;
        }
        return worker;
    }

    /** Agrandit des pixels RGBA (Uint32Array, transférés au worker) ; résout avec les pixels agrandis ou null. */
    function scale(pixels, width, height, { scale = 4, outlineTint = 0, outlineThin = 0 } = {}) {
        const w = getWorker();
        if (!w) return Promise.resolve(null);
        return new Promise(resolve => {
            const id = ++seq;
            jobs.set(id, resolve);
            w.postMessage({ id, width, height, scale, pixels: pixels.buffer, outlineTint, outlineThin }, [pixels.buffer]);
        });
    }

    /** Version lissée d'un canvas affiché (nouveau canvas n fois plus grand) ou null. */
    async function canvas(source, options = {}) {
        const factor = options.scale || 4;
        try {
            const data = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
            const out = await scale(new Uint32Array(data.buffer), source.width, source.height, { ...options, scale: factor });
            if (!out) return null;
            const hd = document.createElement('canvas');
            hd.width = source.width * factor; hd.height = source.height * factor;
            hd.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(out.buffer), hd.width, hd.height), 0, 0);
            return hd;
        } catch {
            return null;
        }
    }

    return { scale, canvas };
})();
