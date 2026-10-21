# Datako SLR · Evidence surveillance — mock-up de démonstration

Maquette haute fidélité de l'outil de revue de littérature automatisée décrit dans le deck
« Datako AI powered literature reviews » (sources licenciées, orchestration GenAI avec score de
pertinence et rationale, validation par les relecteurs médicaux, PRISMA). Une seule page HTML,
sans backend, pensée pour une démo sur iPad ou sur ordinateur : le fichier `index.html`
s'envoie et s'ouvre tel quel.

**Scénario pré-calculé :** fardeau du VRS (RSV) chez les adultes ≥ 60 ans en Europe,
publications 2015-2025, quatre outcomes (hospitalisation, incidence, mortalité, coût).
Les 31 études et 55 extractions reposent sur des publications réelles, vérifiées
mot à mot sur Europe PMC le 21 octobre 2026 (copies d'auteur dans `data/`).

## Parcours de démo en cinq touchers

1. **Run surveillance scan** : le funnel s'anime (≈ 22 s, bouton *Skip to the evidence base*).
2. Les quatre synthèses apparaissent, puis la matrice des études.
3. Toucher un chiffre (table des records) ou un point (graphique), par exemple le 12,1 % de Boattini 2021 en mortalité.
4. La *scoring card* montre le score de pertinence IA, la phrase exacte de la source, le rationale, le PICO extrait et le DOI ; un fil relie le chiffre à sa phrase.
5. **Exclude** (décision du relecteur) : la synthèse mortalité se recalcule sous les yeux (7 → 6 figures, borne haute 12,1 % → 10,1 %).

Panneaux : *How it works* (process du deck : sources licenciées → orchestration GenAI →
validation humaine, PRISMA en direct, onglet *Why Datako*), *Export*, sélecteur de *Subject*
(sujets sous surveillance, journal du relecteur, bouton *Reset demo*).

Raccourci présentateur : ouvrir l'URL avec `#results` pour arriver directement sur les résultats.

## Ouvrir sur iPad

1. Ouvrir l'URL dans Safari.
2. Partager → **Sur l'écran d'accueil** : l'app s'ouvre en plein écran, sans barre d'adresse.
3. Les polices et le logo sont embarqués : la page fonctionne hors ligne après le premier chargement.
4. Les décisions du relecteur (Include / Flag / Exclude) sont mémorisées sur l'appareil ; *Reset demo* dans le sélecteur de sujet les efface.
5. Envoi à un tiers : le fichier `index.html` suffit, il s'ouvre dans Safari ou Chrome sans serveur.

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
Le score de pertinence IA (0-100) reflète l'adéquation au protocole PICO et la qualité du record ;
il est illustratif dans cette maquette.
