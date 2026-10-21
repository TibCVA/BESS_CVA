# Datako Evidence — mock-up de démonstration

Maquette haute fidélité d'un outil de revue de littérature pour analystes pharma
(épidémiologie, HEOR, affaires médicales). Une seule page HTML, sans backend,
pensée pour une démo sur iPad en couloir de séminaire.

**Scénario pré-calculé :** fardeau du VRS (RSV) chez les adultes ≥ 60 ans en Europe,
publications 2015-2025, quatre outcomes (hospitalisation, incidence, mortalité, coût).
Les 31 études et 55 extractions reposent sur des publications réelles, vérifiées
mot à mot sur Europe PMC le 21 octobre 2026 (copies d'auteur dans `data/`).

## Parcours de démo en cinq touchers

1. **Run evidence scan** : le funnel s'anime (≈ 22 s, bouton *Skip to results*).
2. Les quatre synthèses apparaissent, puis la matrice des études.
3. Toucher un chiffre (matrice) ou un point (graphique), par exemple le 12,1 % de Boattini 2021 en mortalité.
4. La carte d'évidence montre la phrase exacte de la source, le DOI, le grade et le raisonnement ; un fil relie le chiffre à sa phrase.
5. **Reject** : la synthèse mortalité se recalcule sous les yeux (7 → 6 études, borne haute 12,1 % → 10,1 %).

Panneaux : *Methodology* (cinq étapes, PRISMA en direct, garanties), *Why Datako*
(comparaison avec revue manuelle, chat IA, outils de recherche, base seule), *Export*,
*Questions* (dossiers et journal des décisions, bouton *Reset demo*).

Raccourci présentateur : ouvrir l'URL avec `#results` pour arriver directement sur les résultats.

## Ouvrir sur iPad

1. Ouvrir l'URL dans Safari.
2. Partager → **Sur l'écran d'accueil** : l'app s'ouvre en plein écran, sans barre d'adresse.
3. Les polices et le logo sont embarqués : la page fonctionne hors ligne après le premier chargement.
4. Les décisions (Accept / Flag / Reject) sont mémorisées sur l'appareil ; *Reset demo* dans *Questions* les efface.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | La page finale, autonome (générée, ne pas éditer à la main) |
| `src/index.template.html` | Gabarit HTML (coque, icônes, surcouches) |
| `src/styles.css` | Styles, tokens Datako (navy, bleu, teal pour la provenance, ambre pour les actions humaines) |
| `src/app.js` | Logique : état, calcul de synthèse, animation du funnel, matrice, carte, panneaux |
| `src/demo-data.js` | Jeu de données de démo (études, extractions, funnel, flux de screening) |
| `src/fonts.css` | Inter et Gelasio embarquées en base64 |
| `data/research-*.json` | Copies d'auteur des vérifications source par source |
| `build.js` | Assemble `index.html` à partir de `src/` et `assets/` |
| `server.js`, `railway.json` | Serveur statique Node sans dépendance pour Railway (`/health`) |
| `tools/shoot.js` | Test de parcours et captures iPad avec Playwright |

## Commandes

```bash
node build.js        # régénère index.html
node server.js       # sert la page sur http://localhost:8080
node tools/shoot.js  # test du parcours + captures dans ./shots (Playwright requis)
```

## Règle de confiance (telle qu'affichée dans l'outil)

Seules les extractions comparables (même unité, même géographie) sont poolées.
Médiane, étendue, concordance (part des valeurs à ± 25 % de la médiane).
*High* : ≥ 4 estimations, ≥ 75 % concordantes, aucun grade D.
*Moderate* : ≥ 2 estimations, ≥ 50 % concordantes. *Low* : sinon.
Les benchmarks (méta-analyses mondiales, États-Unis) sont affichés creux, jamais poolés.
