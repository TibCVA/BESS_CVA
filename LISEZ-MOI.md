# Datako SLR · maquette de démonstration — à lire en premier

Ce dossier contient tout ce qu'il faut pour **voir, modifier et redistribuer** la maquette Datako SLR.

## 1. Voir la démo

Double-cliquez sur **`index.html`** : la page s'ouvre dans le navigateur, sans connexion ni installation.
Sur iPad, envoyez ce seul fichier (mail, AirDrop, Fichiers) et ouvrez-le dans Safari.
Le bouton **Tour · 20 s** en haut à droite lance la visite guidée.

## 2. Modifier la maquette avec Claude (recommandé : Claude Code)

La façon la plus simple est l'application **Claude Code** (desktop ou terminal), qui peut lire le
dossier, modifier les fichiers et régénérer la page elle-même.

1. Dézippez ce dossier sur votre ordinateur.
2. Ouvrez-le dans Claude Code (application desktop : *Open folder* ; ou terminal : `cd` dans le dossier puis `claude`).
3. Demandez simplement ce que vous voulez, en français, par exemple :
   - « Remplace la phrase d'accroche de l'écran d'accueil par … »
   - « Raccourcis la visite guidée à 15 secondes et retire l'étape Traceability »
   - « Ajoute dans Why Datako une ligne sur la sécurité des données »
4. Claude lit automatiquement le fichier **`CLAUDE.md`**, qui lui explique la structure et les règles,
   puis régénère `index.html`. Rouvrez `index.html` pour voir le résultat.

Prérequis : Node.js 18 ou plus (https://nodejs.org) pour la commande de régénération `node build.js`.
Claude Code vous le signalera s'il manque.

**Avec claude.ai (navigateur) plutôt que Claude Code** : créez un projet, ajoutez `CLAUDE.md` et les
fichiers du dossier `src/` (sauf `fonts.css`, très lourd et inutile pour les modifications), décrivez la
modification, puis récupérez les fichiers modifiés. Il faudra ensuite lancer `node build.js` sur votre
ordinateur pour reconstruire `index.html`. Claude Code évite cette étape manuelle.

## 3. Ce qu'il faut savoir avant de modifier

- **`index.html` est généré** : ne le modifiez pas directement, vos changements seraient écrasés.
  Les vrais fichiers sont dans `src/`.
- **Les chiffres sont réels** : les 31 études et 55 extractions sur le VRS ont été vérifiées mot à mot
  (preuves dans `data/`). Pour un autre sujet, il faut fournir des sources vérifiées, pas des chiffres inventés.
- **Le score de pertinence IA est illustratif** : il est calculé par une règle simple, pas par un modèle.
- **Aucun backend** : la maquette simule le fonctionnement ; elle n'interroge aucune base réelle.

## 4. Contenu du dossier

| Élément | Rôle |
|---|---|
| `index.html` | La démo prête à l'emploi (fichier unique, autonome) |
| `CLAUDE.md` | Le mode d'emploi technique pour Claude |
| `README.md` | Description détaillée de la démo, du parcours et de la règle de confiance |
| `src/` | Le code source : gabarit HTML, styles, logique, données de démo, polices |
| `assets/` | Logo et icône Datako |
| `data/` | Vérifications source par source des chiffres utilisés |
| `build.js` | Reconstruit `index.html` à partir de `src/` |
| `tools/` | Tests automatiques optionnels (Playwright) |
| `server.js`, `railway.json`, `package.json` | Optionnels, uniquement si la page doit être hébergée |
