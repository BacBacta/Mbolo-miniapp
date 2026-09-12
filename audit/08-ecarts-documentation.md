# Écarts entre la documentation et le code

`CLAUDE.md` sert de contrat à tout agent qui reprend le projet, et il est partiellement décalé.
Un audit qui s'appuierait dessus classerait mal ses priorités. Voici chaque écart, vérifié.

## 1. La liste des tests est périmée

`CLAUDE.md:52` annonce trois fichiers de test : `auth.test.js`, `antiscam.test.js`, `notifications.test.js`.

Le dossier en contient neuf : `activity`, `antiscam`, `assets`, `auth`, `filters`, `notifications`,
`photos`, `profiles`, `webhook`. Quarante tests passent.

Conséquence : un agent qui lit `CLAUDE.md` croit la couverture trois fois plus faible qu'elle n'est,
et peut réécrire des tests qui existent déjà.

## 2. Le profil n'a plus une photo mais trois

`CLAUDE.md:60` décrit le profil avec « photo facultative compressée côté client », au singulier.

Le code accepte trois emplacements modérés séparément (`server/routes.js:170` et `:178`,
`server/store.js` avec `photosOf`, `setPhoto`, `removePhoto`). Le README est à jour, `CLAUDE.md` non.

Conséquence : la règle 5.4 sur les données personnelles nouvelles ne mentionne pas les trois photos,
alors que ce sont trois fichiers par compte à supprimer sur `DELETE /api/me`.

## 3. P0-1 réclame une intégration continue qui existe à moitié

`CLAUDE.md` place en tête de la feuille de route P0 une intégration continue GitHub Actions
exécutant `npm ci` et `npm test` sur chaque pull request, en Node 20 et 22.

`.github/workflows/` contient un seul workflow, `deploy-fly.yml`, déclenché à la main
(`workflow_dispatch`), qui déploie sans jamais lancer les tests.

Conséquence : il existe une automatisation, mais pas celle qui protège le code. Une pull request
peut être fusionnée avec des tests rouges, et un déploiement peut partir sans qu'un test ait tourné.
P0-1 n'est pas fait, et la présence du fichier peut laisser croire le contraire.

## 4. Les limites connues de la section 7 sont toujours exactes

Vérifié dans le code, ces limites tiennent toujours et ne sont donc pas des écarts :

- une proposition de rendez-vous ne peut être ni acceptée ni refusée, aucun statut `accepted`,
  `declined` ou `cancelled` n'existe dans `server/routes.js` ni `server/store.js` ;
- aucune possibilité de défaire un match ;
- aucune limitation du nombre de requêtes ;
- discussion par interrogation toutes les quatre secondes ;
- lieux partenaires codés en dur, codes QR fixes ;
- pas d'interface de modération hors du groupe Telegram.

## 5. Les deux vulnérabilités `npm audit` sont identifiées

`CLAUDE.md:7` signale deux vulnérabilités modérées sans les nommer. Elles viennent toutes les deux
du paquet `qs`, tiré par `express` 4 : contournement de la limite de tableau par la lecture des
virgules dans les clés entre crochets, et déni de service par `isBuffer` contrôlé par l'attaquant.

La correction sans changement majeur de version passe par une montée d'`express` dans la branche 4,
ou par une résolution forcée de `qs`. À traiter dans P0-10.

## 6. Ce que la documentation ne dit nulle part

- La configuration déployée active `SEED_DEMO` et `AUTO_APPROVE` en production
  (`fly.toml` bloc `[env]`, `render.yaml` `envVars`). Les commentaires disent « tests uniquement »
  mais l'environnement, lui, est `NODE_ENV=production`. Voir `audit/02-mesures.md` et `audit/04-risques.md`.
- Aucune page de conditions ni de confidentialité n'existe, alors que l'écran d'accueil fait
  accepter « les règles de la communauté ». C'est P0-8, non commencé.
- Le SDK Telegram est chargé en script bloquant : aucune ligne de la documentation ne mentionne
  cette dépendance tierce sur le chemin critique.

## 7. Recommandation

Mettre `CLAUDE.md` à jour est une correction à effort 0,5 jour, sans risque, qui évite à chaque agent
suivant de repartir sur une base fausse. À faire avant toute autre tâche de la feuille de route.
