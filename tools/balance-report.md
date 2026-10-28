# Passe d'équilibrage — octobre 2026

Mesures faites avec le banc `tools/balance-bench.html` (aperçu « pokeroad », puis ouvrir `/tools/balance-bench.html`).
Il joue de vrais combats automatiques en temps virtuel, avec une sauvegarde en mémoire : la vraie partie n'est pas touchée.

**Équipe type** : 5 Pokémon choisis dans un vivier de 9 lignées selon les types de la zone, au niveau des ennemis de la vague,
Grade 1 → 5 selon la zone, objets adaptés au rôle, entraînement finançable avec l'argent des combats
(`Bench.budget` : 67 à 90 % des gains). **Équipe améliorée** : +3 niveaux, IV +4, nature +2, Atelier +2, attaques +1
(environ 1,5 zone de gains en plus). **Mauvais choix** : même investissement, équipe fixe, objets d'un autre rôle,
placement inversé, attaques par défaut.

Échantillon par zone et par scénario : 12 équipes ordinaires et les 10 boss, 2 tirages chacun (1 320 combats avant, 1 320 après).
Contrôle après rebase sur la refonte des synergies et du rôle Rapide (eeb0741) : mêmes tendances, à 5-10 points près
(boss de l'équipe type 50 / 80 / 80 / 75 / 70 / 25 %, ordinaires 100 / 100 / 100 / 100 / 96 / 71 %).

## Avant / après

Victoires en combats ordinaires, puis contre les boss (10 boss de la zone). Équipe type sauf mention.

| Zone | Ordinaires avant | Ordinaires après | Boss avant | Boss après | Boss équipe améliorée avant | après | Ordinaires mauvais choix avant | après |
|---|---|---|---|---|---|---|---|---|
| 1 | 83 % | 100 % | 0 % | 45 % | 60 % | 100 % | 71 % | 92 % |
| 2 | 100 % | 100 % | 10 % | 70 % | 60 % | 95 % | 67 % | 75 % |
| 4 | 100 % | 100 % | 55 % | 75 % | 85 % | 80 % | 67 % | 71 % |
| 6 | 58 % | 100 % | 5 % | 80 % | 5 % | 100 % | 17 % | 67 % |
| 8 | 50 % | 88 % | 0 % | 70 % | 0 % | 80 % | 0 % | 0 % |
| 10 | 4 % | 75 % | 0 % | 30 % | 0 % | 50 % | 0 % | 0 % |

PV restants après une victoire ordinaire (équipe type) : avant 77 / 79 / 82 / 33 / 39 / 27 %, après 78 / 78 / 78 / 63 / 48 / 41 %.
Durée moyenne : 14 à 23 actions par combat ordinaire après (30 en zone 1 avant), 18 à 31 actions contre un boss.

### Impact des objets (après)

| Zone | Ordinaires : type / joueur sans objets / ennemis sans objets | Boss : type / joueur sans objets / ennemis sans objets |
|---|---|---|
| 1 | 100 / 96 / 100 % | 45 / 40 / 65 % |
| 2 | 100 / 96 / 96 % | 70 / 55 / 80 % |
| 4 | 100 / 92 / 100 % | 75 / 60 / 85 % |
| 6 | 100 / 88 / 100 % | 80 / 40 / 95 % |
| 8 | 88 / 75 / 100 % | 70 / 40 / 80 % |
| 10 | 75 / 17 / 92 % | 30 / 0 / 25 % |

Les objets comptent de plus en plus avec la zone, des deux côtés. Les choix pèsent plus que l'entraînement :
en zone 8, mauvais choix 0 % contre 88 % pour l'équipe type, alors que l'amélioration n'ajoute que 12 points.

## Ce qui a changé

- **Paliers ennemis** (`enemy-gen.js`, `enemyTier`) : rampe régulière au lieu de marches. Attaques et objets +1 niveau par zone
  (avant +3), stats +1,5 % par zone ; l'étoile (+20 % de stats d'un coup) passe de la zone 6 à la zone 11.
- **Objets ennemis** : autant que le joueur à ce stade (2e objet en zone 5, 3e en zone 11 au lieu de 8) ;
  le boss a un objet de plus à partir de la zone 3 seulement.
- **Pokémon ennemis** : total de stats autorisé ralenti au-delà du niveau 53 (+2,5 par niveau au lieu de +4,5),
  au plus un Légendaire par équipe ordinaire en zone légendaire.
- **Boss** : 3 escortes au niveau de la vague (avant 4, toutes au niveau du boss), boss +8 % de niveau (avant +2 fixe,
  énorme à bas niveau), PV ×1,5 → ×2,5 selon la zone, Légendaires seulement au boss final de chaque zone, tirage parmi
  les 8 plus forts du vivier avec un plafond +40 (avant les 5 plus forts, +80).
- **Restes et Boue Noire sur un boss** (`held-items.js`) : la régénération se calcule sur les PV d'avant le bonus de boss
  (un boss Tank avec Restes + PV ×2,2 regagnait plus que l'équipe n'infligeait).
- **Orbe Toxik** : 6,25 % (plafond 12) au lieu de 8 % (plafond 15), comme les Restes ; c'était le seul objet nettement
  au-dessus des autres au scan des 191 objets (le reste est dans le bruit).
- **Zone 1** : un ennemi de moins jusqu'à la vague 5.
- **Argent** (`battle.js`) : un boss rapporte ×2, le boss final de la zone ×3 (consolation comprise). Les coûts
  d'amélioration n'ont pas été touchés : l'équipe type coûte 67 à 90 % des gains, ils montent déjà avec les étoiles.

## Suivi (réglé ensuite)

- **Prescience et Vœu Destructeur** : une seule cible, l'impact arrive au début du 2e tour suivant de la cible
  (même si le lanceur est K.O.), une seule à la fois sur une même cible ; la version Z frappe tout de suite
  (règle R24 de la refonte, `tools/propose-moves.mjs`). Avant, Prescience frappait tout de suite en croix
  (~300 PV répartis sur 4 Pokémon). Zone 10, combats ordinaires : 71 → 83 % (équipe type), 96 → 100 % (améliorée).
- **Combats sans fin** : au-delà de 100 tours, chaque Pokémon perd 5 % de ses PV max au début de son tour,
  +5 % tous les 10 tours (épuisement). Sur 792 combats du banc, le plus long dure 139 tours, aucun nul.
  L'IA qui n'a rien d'utile à faire choisit d'abord une attaque qui peut toucher (pas d'immunité de type).

## Limites et points repérés (hors leviers de cette passe)

- **Bouclier de Vampibaiser** : le drain en bouclier s'accumule sans plafond (un boss Rubombelle atteint 75 PV de bouclier).
- **IA du combat auto** : à bas niveau, Rugissement ou Mimi-Queue valent autant qu'une attaque dans son calcul.
- **Grades** : 6 exemplaires de la même famille par Pokémon pour atteindre le Grade 5 ; c'est probablement le vrai goulot
  de progression, plus que l'argent.
- Le boss final de chaque zone n'est mesuré que sur 2 tirages : à lire comme une tendance.

# Passe « trop dur : tu attends ou tu te creuses la tête » — 24 octobre 2026

Objectif : à niveau égal, un joueur appliqué gagne de justesse, le combat automatique perd, et attendre
(patrouille fil rouge) ou réfléchir sont les deux façons de passer.

**Banc mis à jour** : style de jeu « appliqué » (meilleure action à chaque tour, ce que faisait l'ancien auto)
ou « réflexe » (le nouveau combat automatique), scénario `auto` ; l'équipe type prend le Grade qu'il faut pour suivre
sa vague (10 niveaux par Grade) ; revenus calculés avec les nouveaux gains de combat.

**Changements** : 5 contre 5 dès le premier combat (boss + 4 escortes) ; IA ennemie vicieuse dès la zone 2
(finit les blessés, cherche la mise K.O., plus de hasard) ; stats ennemies (hors vitesse) +8 % en zone 1,
+28 % en zone 2, puis +2 % par zone (plafond +50 %) ; escortes de boss un niveau sous la vague ; PV des boss
×1,2 en zone 1 puis +0,1 par zone (plafond ×1,8).

| Zone | Appliqué : ordinaires / boss | Auto réflexe : ordinaires / boss | Améliorée : ordinaires / boss |
|---|---|---|---|
| 1 | 78 % / 50 % | 75 % / 25 % | 100 % / 100 % |
| 2 | 86 % / 0 % | 31 % / 0 % | 97 % / 67 % |
| 4 | 69 % / 42 % | 22 % / 0 % | 92 % / 42 % |
| 6 | 64 % / 33 % | 8 % / 0 % | 78 % / 42 % |

Avant ces changements (même banc) : appliqué 92-100 % des combats ordinaires et 50-75 % des boss, auto 54-79 %.
Échantillon : 12 combats ordinaires × 3 tirages, 4 boss × 3 tirages par zone et par scénario (±15 points sur les boss).

**Progression** (modèle `.claude/progression-model.mjs` : deux passages par jour, patrouille pleine à chaque fois) :
avec le coût de niveau actuel (20 × niveau + 10), la zone 1 demande ~4 jours puis tout s'accélère (zones 5 à 10 en
2 jours) : la courbe ennemie s'aplatit (+6 niveaux par zone en milieu de partie) alors que les gains suivent le niveau.
**Appliqué** (`GameData.levelUpCost`) : 20 × niveau + 10 + 0,6 × niveau² (niv. 10 : 270 $ au lieu de 210, niv. 50 : 2 510 $
au lieu de 1 010, niv. 100 : 8 010 $ au lieu de 2 010). Rythme régulier dans le modèle : ~3,5-4 jours par zone en jeu
appliqué, ~4,5-5 en auto, sans emballement en fin de parcours. Le modèle ignore le verrou des Grades et l'entraînement.


## Formations ennemies (28 octobre 2026)

Les ennemis se placent en formations qui jouent avec le ciblage par colonne (`js/enemy-gen.js`, `FORMATIONS`) :
**Rempart** (front complet, lanceur au centre qui voit les trois colonnes, fragile derrière un flanc), **Abri** (un fragile
derrière chacun des deux flancs, un attaquant seul au centre), **Entonnoir** (une colonne vide : le contact qui la vise
retombe sur le tank voisin), **Tenaille** (centre vide : chaque flanc du joueur n'atteint que le flanc d'en face).
Chaque zone a son style (Rempart sur la Route de l'Éveil, Tenaille au Bois de l'Oubli et au Col des Brumes, Entonnoir
au Lac Azur…), formation et côté tirés au hasard (même combat = même formation). Le boss tient l'avant s'il est Tank,
reste gardé au centre s'il est fragile, l'un ou l'autre s'il est Attaquant.

**Contrainte trouvée au banc** : chaque ennemi placé tout à l'arrière coûte environ 5 points de victoires à l'équipe type,
car les zones des attaques sont réglées pour 3 devant + 2 au centre. Un premier jet (2 Pokémon au fond) faisait perdre
16 points en zone 8 ; les formations gardent donc au plus un Pokémon à l'arrière, et le boss n'y va jamais.

Combats ordinaires, 90 équipes par zone (vagues 1 à 10, combats 1 à 9), même graine avant et après.
« Lit la formation » : même équipe que l'équipe type, placée une fois la formation adverse connue
(nouveau scénario `read` du banc : rôles sur leur ligne, frappeurs au contact face à une colonne sans tank,
tank sous le contact ennemi, fragiles à l'abri).

| Zone | Équipe type | Lit la formation | Mauvais choix | Écart (meilleur placement − mauvais choix) |
|---|---|---|---|---|
| 2 | 86 → 90 % | 91 → 93 % | 41 → 39 % | 50 → 54 points |
| 3 | 84 → 82 % | 86 → 91 % | 4 → 6 % | 82 → 85 points |
| 4 | 81 → 86 % | 82 → 89 % | 6 → 2 % | 76 → 87 points |
| 6 | 71 → 71 % | 58 → 59 % | 9 → 10 % | 62 → 61 points |
| 7 | 12 → 12 % | 7 → 7 % | 0 → 0 % | 12 → 12 points |
| 8 | 69 → 64 % | 62 → 74 % | 0 → 0 % | 69 → 74 points |

Boss (10 boss × 2 graines, zones 2-4-6-8) : équipe type 23 → 20 victoires sur 80, mauvais choix 2 → 2.

Lecture : l'équipe type, qui se place toujours pareil, ne bouge qu'à quelques points près. Lire la formation rapporte
davantage qu'avant (zones 3, 4 et 8 : +5 à +12 points), et l'écart avec un mauvais placement grandit ou tient partout.
Dès la zone 3, les mauvais choix sont déjà presque à 0 % : l'écart ne peut plus grandir que par le haut.
La lecture du banc reste simple : en zones 6 et 7, elle fait moins bien que le placement fixe, avant comme après.
