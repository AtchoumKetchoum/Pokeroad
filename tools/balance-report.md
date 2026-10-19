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

## Limites et points repérés (hors leviers de cette passe)

- **Prescience** (future-sight) frappe en croix à pleine puissance : chaque ennemi Psy la choisit et un lancer inflige
  ~300 PV répartis sur 4 Pokémon. Principale cause de la difficulté de la zone 10 ; à revoir dans la chaîne de la refonte
  des attaques (`tools/propose-moves.mjs`).
- **Combat sans fin possible** : un Spectre qui n'a que des attaques Spectre contre des Normal (et l'inverse) ne peut rien
  toucher ; le banc coupe à 400 actions, le jeu n'a pas de limite.
- **Bouclier de Vampibaiser** : le drain en bouclier s'accumule sans plafond (un boss Rubombelle atteint 75 PV de bouclier).
- **IA du combat auto** : à bas niveau, Rugissement ou Mimi-Queue valent autant qu'une attaque dans son calcul.
- **Grades** : 6 exemplaires de la même famille par Pokémon pour atteindre le Grade 5 ; c'est probablement le vrai goulot
  de progression, plus que l'argent.
- Le boss final de chaque zone n'est mesuré que sur 2 tirages : à lire comme une tendance.
