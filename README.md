# RadarData

Données de radars pour l'appli **RadarOverlay**. Ce dépôt ne contient **que des données** : aucun code de l'appli.

L'appli télécharge `radars.csv` (adresse « raw ») et l'ajoute aux radars d'OpenStreetMap. Un radar d'ici qui se trouve à
moins de 30 m d'un radar OpenStreetMap de même type est fusionné avec lui. Les routes viennent d'OpenStreetMap.

Adresse par défaut de l'appli :
`https://raw.githubusercontent.com/C-Brq/RadarData/main/radars.csv`
(modifiable dans Réglages → Données → Source « Dépôt radars »).

## D'où viennent les radars

`radars.csv` est **produit par `scripts/consolidate.mjs`** en comparant des sources libres. Un radar n'y entre que s'il est
vu par **au moins deux sources indépendantes** à moins de 60 m l'un de l'autre et du même type. Les radars vus par une seule
source vont dans `candidats.csv` (colonne `sources`), à relire : l'appli les ignore.

| Source | Contenu | Licence |
|---|---|---|
| [Liste des radars fixes en France](https://www.data.gouv.fr/datasets/liste-des-radars-fixes-en-france/) (ministère de l'Intérieur) | ~3 170 radars fixes et feux rouges, avec limite | Licence Ouverte 2.0 |
| OpenStreetMap (Overpass) | `highway=speed_camera`, `enforcement=traffic_signals` | ODbL |
| [MapAtlas European Camera Index](https://mapatlas.eu) (signalements de conducteurs, instantané du 21/05/2024) | ~3 780 points fixes et feux rouges | CC BY 4.0, attribution à MapAtlas |

Une quatrième source, **Lufop** (fichiers « POI Warner », ~3 250 radars fixes et feux rouges, téléchargés à la main et
versionnés dans `sources/lufop/`), compte comme les autres (licence : [LICENSES.md](LICENSES.md)). Pour la mettre à jour, remplacer les
fichiers de ce dossier par ceux de la dernière archive « POI Warner » de Lufop (ou `--lufop <dossier>`).

Résultat du dernier calcul : 3 331 radars confirmés (3 109 sans Lufop), 2 260 candidats. Parmi les candidats, une partie vient
de la seule liste officielle (à vérifier à la main : un radar officiel isolé est probablement réel, ou démonté).

Un workflow GitHub (`.github/workflows/consolidate.yml`) refait le calcul le 3 de chaque mois, ou à la demande (onglet Actions),
et commite le résultat s'il change.

Sources étudiées et **non utilisées** : `radars-auto.com` et `scdb.info` (sites privés ; scdb est un service payant sur
compte, sans licence de réutilisation publiée, même si la carte se consulte librement), la carte
`radars.securite-routiere.gouv.fr` (pas d'export ni de licence de réutilisation publiés ; ses données sont celles de la liste
du ministère), la carte `opendata.koumoul.com` (affichage de données de référence sans lien vers la source). Deux sources
qui recopient la même liste « coïncident » toujours : elles ne comptent pas comme indépendantes.
Types ignorés : tronçons (`ETVM`, `corridor`), passages à niveau (`ETPN`), limites variables (`adaptive`) ; les tronçons restent
lus depuis OpenStreetMap par l'appli.

Régénérer (Node 18 ou plus, aucune dépendance ; Overpass peut répondre 502 : le script réessaie) :

```
node scripts/consolidate.mjs                 # télécharge les 3 sources
node scripts/consolidate.mjs --radius 100    # autre rayon (60 m par défaut)
node --test scripts/                         # tests
```

Chaque source est aussi republiée telle quelle dans `sources/`, sous sa propre licence ; la base dérivée (`radars.csv`)
est sous ODbL. Détail et attributions : [LICENSES.md](LICENSES.md).

## Format de `radars.csv`

En-tête obligatoire, séparateur virgule, UTF-8, lignes commençant par `#` ignorées.

| Colonne | Obligatoire | Valeurs |
|---|---|---|
| `id` | non (numéro de ligne par défaut) | unique et stable, sans virgule |
| `lat`, `lon` | oui | degrés décimaux WGS84 |
| `type` | non | `fixe` (défaut) ou `feu_rouge` |
| `maxspeed` | non | km/h, vide si inconnue |
| `direction` | non | degrés 0-360 ou `N`, `NE`, `E`… : sens de circulation surveillé ; vide = les deux sens |

Exemple :

```
id,lat,lon,type,maxspeed,direction
fr-38-0001,45.18890,5.72450,fixe,50,
fr-38-0002,45.19120,5.73010,feu_rouge,50,90
```

Les lignes invalides (coordonnées illisibles, type inconnu, `id` en double) sont ignorées par l'appli.
Les radars de tronçon (vitesse moyenne) restent lus depuis OpenStreetMap.

## Contribuer

Ajouter ou corriger une ligne dans `radars.csv`, un radar par ligne, sans reformater le reste du fichier (pour des
différences lisibles). Ne recopier aucune donnée de sites propriétaires (Radarbot, Coyote…) : seules des positions relevées
vous-même ou issues de sources libres (OpenStreetMap ODbL, open data) sont acceptées. Indiquer la source dans le message de commit.
