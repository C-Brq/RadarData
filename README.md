# RadarData

Données de radars pour l'appli **RadarOverlay**. Ce dépôt ne contient **que des données** : aucun code de l'appli.

L'appli télécharge `radars.csv` (adresse « raw ») et l'ajoute aux radars d'OpenStreetMap. Un radar d'ici qui se trouve à
moins de 30 m d'un radar OpenStreetMap de même type est fusionné avec lui. Les routes viennent d'OpenStreetMap.

Adresse par défaut de l'appli :
`https://raw.githubusercontent.com/C-Brq/RadarData/main/radars.csv`
(modifiable dans Réglages → Données → Source « Dépôt radars »).

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
