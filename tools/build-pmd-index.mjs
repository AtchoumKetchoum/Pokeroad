// Construit data/pmd_sprites.json à partir du tracker de PMDCollab SpriteCollab
// (sprites animés de Pokémon Donjon Mystère, licence CC BY-NC 4.0, attribution requise).
// L'index liste, pour chaque numéro du Pokédex, si un sprite (et sa version shiny) existe
// et qui en sont les auteurs : js/pmd-sprite.js s'en sert pour éviter les requêtes inutiles
// et l'écran de crédits pour citer chaque auteur.
//
// Usage :
//   node tools/build-pmd-index.mjs          -> régénère l'index uniquement
//   node tools/build-pmd-index.mjs --copy   -> copie aussi les planches utilisées en combat dans assets/pmd/
//                                              (puis passer PmdSprite.CONFIG.base à 'assets/pmd/')
import fs from 'fs';
import path from 'path';

const RAW = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/';
const OUT_INDEX = 'data/pmd_sprites.json';
const OUT_ASSETS = 'assets/pmd';
const MAX_DEX = 1025;
// Animations jouées en combat (voir js/battle_animation.js)
const USED_ANIMS = ['Idle', 'Attack', 'Hurt', 'Shoot', 'Charge'];

const pad = (n) => String(n).padStart(4, '0');

async function get(url, as = 'text') {
    for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await fetch(url);
        if (res.ok) return as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text();
        if (res.status === 404) return null;
        await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    throw new Error(`Échec du téléchargement : ${url}`);
}

function parseCreditNames(text) {
    // Colonnes : Name, Discord, Contact. Le tracker cite les auteurs par leur identifiant Discord.
    const names = new Map();
    text.split(/\r?\n/).slice(1).forEach(line => {
        const [name, discord] = line.split('\t');
        if (!name) return;
        names.set(name, name);
        if (discord) names.set(discord, name);
    });
    return names;
}

function creditsOf(node, names) {
    const credit = node?.sprite_credit;
    if (!credit) return [];
    return [credit.primary, ...(credit.secondary || [])]
        .filter(Boolean)
        .map(id => names.get(id) || 'Anonyme');
}

const hasSprite = (node) => !!node && 'Idle' in (node.sprite_files || {});

async function buildIndex() {
    console.log('Téléchargement du tracker SpriteCollab…');
    const tracker = JSON.parse(await get(RAW + 'tracker.json'));
    const names = parseCreditNames(await get(RAW + 'credit_names.txt'));

    const sprites = {};
    for (let dex = 1; dex <= MAX_DEX; dex++) {
        const node = tracker[pad(dex)];
        if (!hasSprite(node)) continue;
        const entry = { c: [...new Set(creditsOf(node, names))] };
        const shiny = node.subgroups?.['0000']?.subgroups?.['0001'];
        if (hasSprite(shiny)) {
            entry.s = 1;
            const shinyCredits = creditsOf(shiny, names).filter(n => !entry.c.includes(n));
            if (shinyCredits.length) entry.sc = [...new Set(shinyCredits)];
        }
        sprites[dex] = entry;
    }

    const index = {
        source: 'https://github.com/PMDCollab/SpriteCollab',
        license: 'CC BY-NC 4.0',
        generated: new Date().toISOString().slice(0, 10),
        sprites,
    };
    fs.writeFileSync(OUT_INDEX, JSON.stringify(index));
    console.log(`${OUT_INDEX} : ${Object.keys(sprites).length}/${MAX_DEX} Pokémon avec sprite.`);
    return index;
}

// Fichiers PNG nécessaires pour les animations utilisées (en suivant les <CopyOf>)
function neededSheets(xml) {
    const anims = new Map();
    for (const [, body] of xml.matchAll(/<Anim>([\s\S]*?)<\/Anim>/g)) {
        const name = body.match(/<Name>(.*?)<\/Name>/)?.[1];
        const copyOf = body.match(/<CopyOf>(.*?)<\/CopyOf>/)?.[1];
        if (name) anims.set(name, copyOf || name);
    }
    return [...new Set(USED_ANIMS.filter(a => anims.has(a)).map(a => anims.get(a)))];
}

async function copyFolder(remoteDir, localDir) {
    if (fs.existsSync(path.join(localDir, 'AnimData.xml'))) return 0;
    const xml = await get(RAW + remoteDir + 'AnimData.xml');
    if (!xml) return 0;
    fs.mkdirSync(localDir, { recursive: true });
    let bytes = 0;
    for (const sheet of neededSheets(xml)) {
        const png = await get(`${RAW}${remoteDir}${sheet}-Anim.png`, 'buffer');
        if (!png) continue;
        fs.writeFileSync(path.join(localDir, `${sheet}-Anim.png`), png);
        bytes += png.length;
    }
    fs.writeFileSync(path.join(localDir, 'AnimData.xml'), xml);
    return bytes + xml.length;
}

async function copyAssets(index) {
    let total = 0;
    const ids = Object.keys(index.sprites);
    for (const [i, dex] of ids.entries()) {
        total += await copyFolder(`sprite/${pad(dex)}/`, path.join(OUT_ASSETS, pad(dex)));
        if (index.sprites[dex].s) {
            total += await copyFolder(`sprite/${pad(dex)}/0000/0001/`, path.join(OUT_ASSETS, pad(dex), '0000', '0001'));
        }
        if (i % 50 === 0) console.log(`${i}/${ids.length} — ${(total / 1e6).toFixed(1)} Mo`);
    }
    console.log(`Copie terminée : ${(total / 1e6).toFixed(1)} Mo dans ${OUT_ASSETS}/`);
}

const index = await buildIndex();
if (process.argv.includes('--copy')) await copyAssets(index);
