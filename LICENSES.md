# Licences

Ce dépôt republie des données de plusieurs origines. **Chaque fichier garde la licence de sa source.**

| Fichier | Contenu | Source | Licence | À mentionner |
|---|---|---|---|---|
| `sources/osm.csv` | radars et feux rouges d'OpenStreetMap | [OpenStreetMap](https://www.openstreetmap.org/copyright) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | © contributeurs OpenStreetMap |
| `sources/gouv.csv` | radars fixes et feux rouges | [Liste des radars fixes en France](https://www.data.gouv.fr/datasets/liste-des-radars-fixes-en-france/), ministère de l'Intérieur | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) | source : ministère de l'Intérieur, data.gouv.fr |
| `sources/mapatlas.csv` | radars fixes et feux rouges signalés par des conducteurs (instantané du 21/05/2024) | [MapAtlas European Camera Index](https://mapatlas.eu) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | MapAtlas, https://mapatlas.eu |
| `sources/lufop/*.csv` | radars fixes et feux rouges de France (participatif) | [Lufop](https://lufop.net) | voir ci-dessous | Lufop.net |
| `radars.csv`, `candidats.csv` | **base dérivée** : rapprochement des fichiers ci-dessus | ce dépôt | **ODbL 1.0** (la plus contraignante des trois, compatible avec les deux autres) | les trois mentions ci-dessus |

Les fichiers `sources/*.csv` ne reprennent que les champs lus dans chaque source (identifiant d'origine, position, type,
limite). Le script `scripts/consolidate.mjs` est libre d'utilisation (domaine public).

## Lufop

`sources/lufop/*.csv` : fichiers « POI Warner » de [Lufop](https://lufop.net) (radars fixes et feux rouges), tels que
téléchargés, republiés avec leur nom d'origine. Attribution : **Lufop.net**. D'après le responsable de ce dépôt, la licence de
Lufop autorise cette réutilisation ; le texte n'est pas joint aux archives et les pages de Lufop annoncent soit l'ODbL 1.0, soit
la CC BY-SA 4.0. **À confirmer** : avec l'ODbL, tout est cohérent ; avec la CC BY-SA 4.0, qui n'est pas compatible avec l'ODbL, il
faudra retirer Lufop de `radars.csv` (il resterait ici, sous sa licence). Lufop est une source participative : elle compte
comme une source mais, comme toute source seule, elle ne suffit pas à confirmer un radar.

## Ajouter une source

Une source sous licence « partage à l'identique » **incompatible** avec l'ODbL (par exemple CC BY-SA 4.0) s'ajoute dans son
propre dossier (`sources/<nom>/`) avec sa licence. Elle ne sert alors qu'à **confirmer** des radars déjà connus d'une autre
source, sans que sa position ni sa limite entrent dans `radars.csv`. Vérifier le texte de licence publié par la source avant
tout ajout ; ne pas ajouter de source commerciale ou sans licence de réutilisation.
