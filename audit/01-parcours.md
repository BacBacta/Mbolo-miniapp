# Le parcours réel, maillon par maillon

Reconstruit depuis le code par cinq agents, puis mesuré en exécutant l'application.
Chaque ligne du tableau maître renvoie à un bloc détaillé plus bas.
Les constats et les notes ne sont pas ici : ils sont dans `03-ecrans-*.md` et `04-risques.md`.

## Tableau maître

| # | Maillon | Gestes de l'utilisateur | Ce qui peut le faire échouer | Trace laissée pour la mesure |
|---|---|---|---|---|
| 1 | Avant l'app : `/start`, bouton de menu, lien direct | 1 | `WEBAPP_URL` absent : le message part sans bouton, impasse silencieuse | aucune |
| 2 | Chargement de la page | 0 | SDK Telegram bloquant, aucune compression, machine arrêtée à froid | aucune |
| 3 | Démarrage applicatif : `tg.init()`, `GET /api/me` | 0 | 401, réseau coupé, rappel CloudStorage jamais reçu, aucun délai d'expiration | création de la ligne utilisateur |
| 4 | Écran d'accueil | 1 | aucune page de conditions ni de confidentialité à lire | aucune |
| 5 | Formulaire de profil, trois étapes | 8 au minimum | fermeture de l'app : tout est perdu, sans avertissement | `profile` écrit d'un coup, à la fin |
| 6 | Vérification : geste tiré au sort, selfie | 3 | caméra refusée, selfie illisible, image trop lourde | `verification: pending` |
| 7 | Attente de modération | 0 | toutes les routes utiles renvoient 403, rien à faire | horodatage de la demande absent |
| 8 | Décision de modération | 0 | personne ne modère la nuit, aucune file visible | `verification` seulement, sans date |
| 9 | Découverte | 1 par profil | vivier vide, quota atteint, photos à la demande | `swipes` avec horodatage |
| 10 | Décision et match | 1 | aucun accusé de réception d'un like non rendu | `matches` avec horodatage |
| 11 | Discussion | libre | anti-arnaque bloquant à tort, interrogation toutes les 4 s | `messages` avec horodatage |
| 12 | Rendez-vous et check-in QR | 3 | proposition ni acceptable ni refusable, QR d'un autre lieu | `dates` et `arrivals` |
| 13 | Garde-fous : signaler, bloquer, supprimer | 2 | aucune annulation de match possible | `reports`, `blocks` |
| 14 | Retour | 1 | notification limitée, lien profond partiellement honoré | `lastActiveAt` écrasé à chaque appel |

Total du chemin le plus court, de l'ouverture au premier message envoyé :
quatorze gestes, huit champs dont cinq obligatoires, deux écrans d'attente, une décision humaine.

## 1. Avant l'app

Le bot répond à `/start` par un texte court et un seul bouton `web_app`. Aucun lien de règles,
aucune mention du selfie à venir, donc la vérification est une surprise à l'étape 6.
Si `WEBAPP_URL` n'est pas configuré, le message part sans bouton : la personne n'a aucun moyen
d'ouvrir l'app et rien ne le signale, ni côté utilisateur ni côté modération.

Preuves : `server/bot.js:104-110`, `server/index.js:69`.

## 2. Chargement de la page

`GET /` renvoie un `index.html` d'environ 1,9 Ko sans cache, où le serveur a substitué le nom de
l'app et l'empreinte des fichiers. Le navigateur charge ensuite, en bloquant le rendu,
`telegram-web-app.js` depuis telegram.org, puis la feuille de style, puis `app.js` en module,
qui déclenche à son tour `tg.js` et `ui.js` : deux allers-retours en cascade.

Mesuré : 129 561 octets sur dix requêtes, aucune compression HTTP, et surtout la première peinture
à 12 688 ms parce que le script Telegram bloque l'analyse du HTML jusqu'à sa réponse ou son échec.
Le bloc « Chargement… » présent dans `index.html` n'est donc jamais peint pendant ce temps.

Preuves : `public/index.html:10`, `public/index.html:22`, `server/index.js:11-13`.
Mesures : `audit/02-mesures.md`.

## 3. Démarrage applicatif

`tg.init()` appelle `ready()`, `expand()`, applique le thème. Un seul appel authentifié suit,
`GET /api/me`, qui crée la ligne utilisateur si elle n'existe pas. Puis deux lectures CloudStorage
successives avant le premier écran, y compris pour un nouveau venu à qui ces réglages ne servent pas.

Trois impasses : échec réseau ou 401 affiche un écran sans bouton de réessai ; aucune fonction
`api()` ne pose de délai d'expiration, donc une réponse qui n'arrive jamais laisse « Chargement… »
indéfiniment ; si le rappel CloudStorage n'est jamais déclenché, même résultat.

Preuves : `public/app.js:1270-1298`, `public/tg.js:205-210`, `server/store.js:42-62`.

## 4. Écran d'accueil

Quatre promesses, deux mentions fines, un seul bouton natif. La mention « en continuant, tu acceptes
les règles de la communauté » ne renvoie vers aucune page : ni conditions, ni politique de
confidentialité n'existent dans le dépôt, et aucune trace de consentement n'est enregistrée côté
serveur. C'est P0-8 de la feuille de route, non commencé.

Preuves : `public/app.js:435-455`.

## 5. Formulaire de profil

Trois étapes. Identité : prénom prérempli, âge, genre. Recherche : intention, ville, quartier.
Touche personnelle : jusqu'à trois photos facultatives, une question et sa réponse obligatoire,
langues facultatives.

Deux points structurants. D'abord, rien n'indique que l'intention et la ville découpent tout le
vivier, alors que la fonction de compatibilité exige la même ville et la même intention, et que
la politique de correspondance retire silencieusement les paires de même genre pour l'intention
« relation sérieuse ». Ensuite, tout le formulaire vit en mémoire : fermer l'app avant
l'enregistrement perd les huit champs, sans avertissement.

L'âge vide et l'âge inférieur à 18 ans produisent le même message, qui accuse à tort quelqu'un
qui a simplement oublié de remplir le champ.

Preuves : `public/app.js:473-531`, `public/app.js:849-860`, `server/routes.js:220-227`.

## 6. Vérification

Un geste est tiré au sort parmi quatre, la personne prend un selfie, il part au serveur.
Le selfie est envoyé au groupe de modération avec deux boutons, puis supprimé après décision.
Avec `AUTO_APPROVE` actif, il est validé au bout de trois secondes sans qu'aucun humain ne le voie.

Preuves : `server/routes.js:116`, `server/routes.js:123-140`, `server/bot.js`.

## 7. Attente de modération

L'écran annonce « en général quelques minutes » et invite à fermer l'app. Pendant ce temps,
toutes les routes utiles répondent 403 : aucune découverte, aucun aperçu, rien à faire.
La promesse de délai ne repose sur aucun mécanisme : elle tient si un modérateur est éveillé.

Preuve : `server/routes.js:66` (`requireApproved`).

## 8. Décision de modération

Le modérateur est un humain dans un groupe Telegram. Il n'a pas de file, pas de compteur,
pas de rotation, pas de délai cible. C'est le plafond de débit de toute la bêta fermée,
et il n'est mesuré nulle part. Le détail est dans `audit/02-mesures.md`.

## 9. Découverte

Le paquet vient de `GET /api/discover`, limité à vingt profils par jour. La liste complète passe
par `GET /api/profiles`, qui inclut aussi les profils déjà vus. Les photos ne sont chargées qu'à
la demande en mode économie de data. Le vivier est découpé par ville, intention, tranche d'âge
et politique de correspondance : quatre filtres sur une base qui, au lancement, sera minuscule.

Preuves : `server/routes.js:232`, `server/routes.js:250`, `server/routes.js:220-227`.

## 10. Décision et match

Un like réciproque crée le match et notifie les deux personnes. Un like non rendu ne produit rien
pour celui qui l'a envoyé, et la personne aimée ne l'apprend que si elle ouvre l'app.
Aucune possibilité de revenir sur un passe, sinon par la liste complète.

Preuves : `server/routes.js:290-326`.

## 11. Discussion

Ouverture plein écran, interrogation toutes les quatre secondes avec un paramètre `after`
qui ne renvoie que les nouveaux messages, mais réexpédie à chaque fois le profil complet de l'autre
personne et les rendez-vous. Mesuré : environ 702 Ko pour une heure de discussion ouverte
sans qu'aucun message n'arrive, dont 308 Ko d'en-têtes.

Le filtre anti-arnaque s'applique avant l'envoi. Mesuré sur un corpus de vingt messages légitimes :
trois blocages à tort, dont « je prends le taxi, ça me coûte 300 F pour venir ».
Le message d'erreur ne dit jamais quel mot a déclenché le blocage.

Preuves : `server/routes.js:358-395`, `server/antiscam.js`.

## 12. Rendez-vous et check-in

La proposition se fait dans un lieu partenaire codé en dur. L'autre personne la reçoit et la voit,
mais ne peut ni l'accepter ni la refuser : le statut reste « proposé ». Le check-in se fait en
scannant le QR du lieu. Après le rendez-vous, rien : aucune trace, aucune question, aucun retour.

Preuves : `server/routes.js:412-440`, `server/config.js:123-128`.

## 13. Garde-fous

Signaler et bloquer existent. Défaire un match n'existe pas : une conversation devenue pénible
ne peut être que bloquée, geste plus lourd et plus définitif. La suppression du compte efface
l'utilisateur, ses photos et son selfie.

Preuves : `server/routes.js:441`, `server/routes.js:151`, `server/store.js`.

## 14. Retour

Trois motifs de notification : match, message limité à un par discussion toutes les deux minutes,
et « tu as plu à quelqu'un » limité à un par jour. Un filtre de présence évite de notifier
quelqu'un qui lit déjà. Le bouton de la notification ouvre l'app sur un écran précis.

Mesuré : le paramètre `screen=safety` ne fonctionne pas et retombe sur Découvrir.
Quelqu'un que personne n'a liké ne reçoit jamais rien et n'a aucune raison de revenir.

Preuves : `server/bot.js:18-25`, `public/app.js` (routage par paramètre d'URL).

## Ce que le parcours ne laisse comme trace nulle part

La base contient `users`, `swipes`, `matches`, `messages`, `reports`, `blocks`, `dates`.
Elle ne contient aucun événement d'interface. Sont donc invisibles, définitivement :

- combien de personnes ouvrent l'app et s'arrêtent avant le formulaire ;
- à quelle étape du formulaire elles abandonnent ;
- combien renoncent pendant l'attente de modération ;
- le délai réel entre l'envoi du selfie et la décision, faute d'horodatage de la demande ;
- combien de profils sont vus par session, et le temps passé sur une carte ;
- les erreurs rencontrées côté navigateur ;
- la désinstallation, qui ne laisse aucune trace.

`lastActiveAt` est écrasé à chaque requête authentifiée : il donne le dernier passage,
jamais l'historique. Aucune cohorte, aucun entonnoir, aucune courbe de rétention n'est calculable
aujourd'hui. Le plan pour y remédier est dans `audit/05-mesure-produit.md`.
