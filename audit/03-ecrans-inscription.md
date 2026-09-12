# 03 — Accueil et inscription : diagnostic par écran et par risque

Lot « accueil et inscription ». Maillons 1 à 5 : avant l'app (`/start`, bouton de menu, `WEBAPP_URL`),
chargement de la page, démarrage applicatif, écran `welcome`, formulaire de profil en trois étapes
jusqu'à `PUT /api/me/profile` et les photos.

Dépôt : `/home/user/Mbolo-miniapp`, commit `29703c7`. Grille figée : `audit/00-benchmark.md`.
Mesures faites le 11 et le 12 septembre 2026, serveur local port 3527,
`DATA_DIR` hors dépôt, `ALLOW_DEV_AUTH=true`, `AUTO_APPROVE=false`, `SEED_DEMO=false`,
navigateur Chromium 360 x 740, identité Android (Galaxy A10), `telegram.org` et Google Fonts injoignables.
Scripts : `<scratch>/audit3insc/{insc2,insc3,a11y,poids2,demarrage,lent,repri,debit}.mjs`.
Aucun fichier du produit n'a été modifié.

**Marques.** VU = lu dans le code, avec `chemin:ligne`. MESURÉ = obtenu en exécutant, avec la sortie.
SUPPOSÉ = hypothèse, avec le test qui trancherait. SOURCE = repère externe, avec sa fiabilité et sa limite.

---

## 1. Ce que donne la grille sur ce lot

Une note ne repose que sur du VU ou du MESURÉ. Règle d'ancrage : un seul élément manquant fait redescendre d'un cran.

| critère | note | ce qui fixe la note |
|---|---|---|
| C01 temps et taps avant le premier visage | **1** | MESURÉ : 9 taps de `welcome` à l'écran de vérification, 0 profil réel vu ; aucun aperçu du vivier avant la demande de selfie (VU `public/app.js:435-455`) |
| C02 coût de l'inscription et progressivité | **1** | VU `server/routes.js:91-97` : 6 champs obligatoires, aucun justifié à l'écran ; « sortie en duo » proposée sans parcours derrière (VU `server/config.js:54`) |
| C03 reprise après coupure | **2** | MESURÉ : saisie conservée et réessai sans ressaisie après coupure ; MESURÉ : rien ne survit à la fermeture (aucun brouillon, profil serveur `null`) |
| C18 coût en data | **0** | MESURÉ : 131 455 o transférés pour atteindre `welcome`, aucune compression HTTP ; ancrage C18 niveau 0 : « ressources servies non compressées » |
| C19 résilience réseau | **1** | MESURÉ : `/api/me` sans réponse = « Chargement… » à 25 s sans bouton ; échec = écran sans action ; MESURÉ : réessai sans perte au moment d'enregistrer |
| C20 accessibilité | **1** | MESURÉ : 0 cible sous 24 x 24 (seuil normatif tenu) mais 5 à 9 textes sous le seuil de contraste en thème clair sur chacun des 4 écrans, 0 en sombre |
| C22 mesure produit | **1** | VU `server/store.js:55` (`createdAt`) contre VU `server/routes.js:112` : l'enregistrement du profil n'horodate rien ; aucune étape du formulaire n'est datée |
| C23 langue et messages d'erreur | **1** | VU `server/config.js:56` : Buea proposée, interface entièrement en français ; MESURÉ : le message d'âge accuse à tort un champ vide |
| C24 discrétion et transparence | **0** | MESURÉ : `/confidentialite` et `/conditions` renvoient l'application ; aucune trace de consentement en base ; ancrage C24 niveau 0 : « les pages publiques sont absentes » |

C05, C06, C07 et C16 touchent ce lot par un bord seulement ; ils sont notés dans les lots concernés.
Ce qui les concerne ici est signalé dans les fiches sans note.

---

## 2. Fiche A — avant l'écran : bot, chargement, démarrage (maillons 1 à 3)

**Ce que fait la concurrence.**
SOURCE (consultée, benchmark 2026) : Facebook Dating se greffe sur une audience installée, sans
inscription séparée ; c'est exactement la position de Mbolo sur Telegram. Limite de comparabilité :
SOURCE (secondaire) WhatsApp et Facebook dominent l'usage camerounais, Telegram reste derrière — la
greffe est plus étroite.
SOURCE (consultée) : budgets de performance 2026 au 75e percentile — 2,0 Mio au total dont 0,3 Mio de
JavaScript pour un chargement en 3 s sur réseau de référence 9 Mbit/s. Limite : budget générique, pas
une app de rencontres.
SOURCE (secondaire) : Facebook Lite déplace le travail vers le serveur et change la stratégie d'images
pour afficher vite sur connexion faible.

**Ce que fait Mbolo.** Un seul fichier HTML de 1,9 Ko, aucune bibliothèque front, quatre fichiers de
première partie, une seule requête d'API au démarrage. C'est structurellement léger. Trois choix
d'implantation annulent cet avantage : un script tiers bloquant, l'absence de compression, et l'absence
de tout garde-fou quand une de ces briques ne répond pas.

**L'écart, mesuré.**

```
# premier chargement, jusqu'à l'écran welcome (MESURÉ, poids2.mjs)
    65965 o  /app.js          40587 o  /styles.css     10824 o  /ui.js
     9855 o  /tg.js            2916 o  /                1308 o  /api/me
    TOTAL 131455 o
# deuxième ouverture, même navigateur : TOTAL 2941 o
# CPU x1 : first-paint 12472 ms | CPU x6 : first-paint 12588 ms   (lent.mjs)
# welcome → étape 1 : 59 ms (CPU x1), 155 ms (CPU x6)
```

| id | constat | preuve | gravité | sécurité |
|---|---|---|---|---|
| **INSCRIPTION-01** | Sans `WEBAPP_URL`, `/start` répond sans bouton : aucune entrée dans l'app | VU `server/bot.js:108` (`reply_markup = config.webAppUrl ? … : undefined`), `:27` (idem pour toutes les notifications), `:167-170` (bouton de menu non posé) ; VU `server/config.js:24` : l'adresse n'est déduite que sur Render et Fly ; MESURÉ (dossier de mesures §5.2) : `appUrl() = "/"` | 4 | aucun |
| **INSCRIPTION-02** | Le premier rendu est otage d'un script tiers chargé en bloquant : rien n'est peint avant lui, pas même « Chargement… » | VU `public/index.html:10` (ni `defer` ni `async`), `:24` (bloc de démarrage jamais atteint) ; MESURÉ : first-paint 12 472 ms quand `telegram.org` traîne, 109 ms quand il échoue vite (dossier §5.1) ; MESURÉ : le CPU n'y change rien (12 588 ms à ×6) | 4 | aucun |
| **INSCRIPTION-03** | Aucune compression HTTP : 131 455 o transférés là où environ 35 700 suffiraient | MESURÉ ci-dessus ; MESURÉ `grep -rn "compression\|gzip" server/ package.json` : rien ; MESURÉ, comble : le script tiers, lui, arrive gzippé (`content-encoding: gzip`, 116 510 o bruts, 18 318 o gzippés, `cache-control: max-age=345600`) | 3 | aucun |
| **INSCRIPTION-04** | Échec du premier appel : écran sans issue, sans bouton, sans lien vers le bot, avec le même texte écrit deux fois | VU `public/app.js:1274-1283` (`tg.setButtons(null)`) ; VU `server/routes.js:77` : le nom du bot n'est servi que par `/api/me`, qui vient de répondre 401 ; MESURÉ : 0 bouton, 0 lien, « Ouvre Mbolo depuis Telegram \| Ouvre Mbolo depuis Telegram. \| Cherche le bot Mbolo… » | 4 | aucun |
| **INSCRIPTION-05** | Aucun délai maximal sur le démarrage : « Chargement… » peut durer indéfiniment | VU `public/app.js:59-70` (aucun `AbortController`), VU `public/tg.js:205-210` (callback CloudStorage sans garde-fou) ; MESURÉ : `/api/me` sans réponse, écran figé sur « Mbolo \| Chargement… » à 3 s, 10 s et 25 s, 0 bouton | 3 | aucun |
| **INSCRIPTION-06** | Deux lectures CloudStorage bloquent le premier écran, pour deux réglages qui ne servent ni à `welcome` ni au formulaire | VU `public/app.js:1285-1286` (deux `await` successifs avant tout `go()`) ; SUPPOSÉ pour le coût réel dans Telegram — test qui trancherait : horodater les deux appels sur un téléphone réel et lire l'écart | 2 | aucun |
| **INSCRIPTION-07** | Toute la palette repose sur `color-mix()` sans repli : une WebView qui ne le connaît pas perd fond et texte | VU `public/styles.css:39-43, 52, 60-64` — aucune déclaration simple avant le `color-mix`. Impact SUPPOSÉ, test qui trancherait : ouvrir sur une WebView Android antérieure à Chrome 111 et photographier `welcome` | 2 | aucun |

**Ce qui aggrave, sans être un constat séparé.** VU `fly.toml:22-24` : `auto_stop_machines = "stop"` et
`min_machines_running = 0`. La première ouverture de la journée paie un démarrage à froid, qui s'ajoute
aux 12 s d'INSCRIPTION-02 et tombe dans le trou d'INSCRIPTION-05. SUPPOSÉ pour la durée ; test qui
trancherait : chronométrer `GET /health` sur la machine endormie.

---

## 3. Fiche B — écran `welcome`

**Ce que fait la concurrence.**
SOURCE (secondaire, à revérifier) : Badoo est installé en Afrique francophone et joue l'entrée sans
friction, vivier visible avant de donner quoi que ce soit. Limite : Badoo a un vivier installé, Mbolo
démarre à zéro ; la comparaison ne porte que sur le **coût d'entrée perçu**.
SOURCE (consultée) : les conditions développeurs Telegram exigent une politique de confidentialité
facilement accessible et déclarée.
Corollaire d'audit posé en phase 1 : chaque friction ajoutée doit être payée par une promesse de
sécurité **visible au moment où la friction est imposée**.

**Ce que fait Mbolo.** Quatre promesses, deux mentions fines, un bouton. Aucun chiffre, aucun profil,
aucun lien. Le texte est juste, court, tutoyé, sans point d'exclamation : conforme à CLAUDE.md §5.10.

**L'écart, mesuré.**

```
# welcome (MESURÉ, insc2.mjs / a11y.mjs)
  temps jusqu'à l'écran : 128 ms (telegram.org injoignable)
  boutons : ["Créer mon profil"]   liens (a href) : 0
  thème clair : 5 textes sous le seuil WCAG sur 10 mesurés ; thème sombre : 0
  taps de welcome à l'écran de vérification : 9   profils réels vus : 0
```

| id | constat | preuve | gravité | sécurité |
|---|---|---|---|---|
| **INSCRIPTION-08** | « En continuant, tu acceptes les règles de la communauté » : ces règles n'existent nulle part, ne sont pas liées, et l'acceptation n'est consignée nulle part | VU `public/app.js:452` ; MESURÉ : 0 lien sur l'écran ; MESURÉ (dossier §5.1) : `/confidentialite` et `/conditions` renvoient 200 et l'application elle-même, VU `server/index.js:56` (`app.get('*', renderIndex)`) ; MESURÉ `grep -rniE "consent\|acceptedAt\|tosVersion" server/ public/` : rien | 4 | indirect |
| **INSCRIPTION-09** | La première promesse de l'écran — « Chaque membre a prouvé qu'il est une vraie personne » — est démentie par la configuration livrée | VU `public/app.js:446` ; VU `fly.toml:15-16`, `render.yaml:17-19`, `.env.example:21,24` : `AUTO_APPROVE=true` et `SEED_DEMO=true` ; VU `server/config.js:27-28` : aucune neutralisation en production, contrairement à `allowDevAuth` (`:29`) ; MESURÉ (dossier §1.2) : une image de 73 octets, sans visage ni geste, obtient le badge en 3 s | 4 | **direct** |
| **INSCRIPTION-10** | L'écran promet sans rien montrer : 9 taps et un selfie séparent la première ouverture du premier visage, sans qu'aucun chiffre n'atteste qu'il y a quelqu'un | VU `public/app.js:435-455` (4 promesses, 0 chiffre) ; VU `server/routes.js:66` et `:232` : la découverte est fermée avant validation ; MESURÉ : 9 taps jusqu'à l'écran de vérification, 0 profil réel vu | 3 | aucun |
| **INSCRIPTION-11** | Le thème clair passe sous le seuil de contraste sur les quatre écrans du lot ; le thème sombre est irréprochable | MESURÉ (a11y.mjs, 360 x 740) : `welcome` 5/10, étape 1 7/8, étape 2 7/11, étape 3 9/10 sous le seuil en clair ; 0 en sombre. Exemples : intitulés de champ 3,70 pour 4,5 ; sous-titres des promesses 4,17 pour 4,5 ; numéros des emplacements photo **1,05** pour 4,5 | 3 | aucun |
| **INSCRIPTION-12** | Le zoom à deux doigts est interdit, alors que les mentions décisives sont en 11 à 13 px atténués | VU `public/index.html:5` (`maximum-scale=1`) ; MESURÉ : les deux mentions fines de `welcome` (âge, règles, discrétion) sont à 13 px et 4,17 de contraste | 2 | indirect |

**Ce qui touche C05 sans être noté ici.** L'écran énonce ce que le badge garantit, jamais ce qu'il ne
garantit pas. VU `public/app.js:446` contre l'ancrage C05 niveau 3 (« le badge ne dit rien des
intentions ni de l'identité légale »). CLAUDE.md §8 P1-5 annonce cette explication comme non faite.

---

## 4. Fiche C — formulaire, étape 1 sur 3 (identité)

**Ce que fait la concurrence.** SOURCE (consultée) : 3 à 5 champs obligatoires (prénom, âge, genre,
photo), le reste différé et présenté comme une amélioration des résultats ; Hinge structure le profil en
prompts plutôt qu'en formulaire. Limite : ces apps ont un vivier dense et peuvent se permettre un profil
pauvre au départ.

**Ce que fait Mbolo.** Trois champs, une progression visible (`Étape 1 sur 3`), un retour arrière qui ne
perd rien dans la session, une validation au clic. Le prénom est prérempli depuis Telegram
(VU `public/app.js:461` ; MESURÉ : vide hors de Telegram, ce qui est le comportement attendu).

**L'écart, mesuré.**

```
# étape 1 (MESURÉ, insc.mjs / insc3.mjs)
  âge laissé vide → « Mbolo est réservé aux 18 ans et plus. »
  âge 105 → passe l'étape 1, passe l'étape 2, refusé seulement après « Enregistrer »
  étape affichée au moment du refus : ÉTAPE 3 SUR 3 ; champs « âge » à l'écran : 0
  cibles tactiles sous 44 px : « Femme » et « Homme », 159 x 40 ; sous 24 px : 0
```

| id | constat | preuve | gravité | sécurité |
|---|---|---|---|---|
| **INSCRIPTION-13** | Le message d'âge accuse à tort un champ vide, et la borne haute n'est vérifiée qu'après les trois étapes, sur un écran où le champ fautif n'existe plus | VU `public/app.js:854` (`Number('')` vaut 0, donc « réservé aux 18 ans et plus ») ; VU `server/routes.js:92` (même phrase pour 18-99) ; MESURÉ : âge 105 refusé à l'étape 3 avec 0 champ d'âge affiché | 3 | indirect |
| **INSCRIPTION-14** | Six champs obligatoires, dont aucun ne dit à l'écran à quoi il sert | VU `server/routes.js:91-97` : prénom, âge, genre, intention, ville, réponse ; VU `public/app.js:491` : la seule phrase de l'étape 1 parle de visibilité, pas d'usage ; ville et intention découpent tout le vivier (VU `server/routes.js:223`) sans que rien ne le dise | 2 | aucun |
| **INSCRIPTION-15** | Le genre est obligatoire et binaire, et commande silencieusement la mise en relation « relation sérieuse » | VU `server/config.js:55`, `server/routes.js:93` ; VU `server/routes.js:225` : la règle femme/homme ne s'applique qu'à `serieux` ; MESURÉ (dossier §7.6) : un homme en « amitié » voit des hommes, et le champ `gender` n'est jamais renvoyé par l'API | 2 | aucun |

**Tension de règle.** CLAUDE.md §5.2 interdit toute donnée d'orientation sexuelle, et le cadre pénal
local justifie cette interdiction. La correction standard du marché — un filtre d'attirance — est donc
exclue et je ne la propose pas. L'alternative ne coûte aucune donnée nouvelle : écrire à l'écran ce que
le choix produit (« Pour la relation sérieuse, tu verras des profils du genre opposé. Pour l'amitié et
la sortie en duo, tu verras tout le monde. »).

---

## 5. Fiche D — formulaire, étape 2 sur 3 (ce que tu cherches)

**Ce que fait la concurrence.** SOURCE (consultée) : Tinder « Modes » rend l'intention visible et
commutable en haut de l'écran. Limite reprise de la phase 1 : sur un vivier de bêta fermée, multiplier
les modes vide chaque mode ; l'enseignement transposable est la **lisibilité**, pas la multiplication.
SOURCE (consultée) : Happn « Perfect Date » propose des lieux de rendez-vous via un référentiel externe —
Mbolo fait déjà mieux, avec des lieux réels et négociés (VU `server/config.js:47-52`).

**Ce que fait Mbolo.** Trois intentions, cinq villes, un quartier facultatif. C'est l'écran le moins
coûteux du formulaire et le plus lourd de conséquences : il fixe le vivier, les lieux de rendez-vous et
la règle de genre, sans le dire.

| id | constat | preuve | gravité | sécurité |
|---|---|---|---|---|
| **INSCRIPTION-16** | Cinq villes proposées, deux servies : Bafoussam, Buea et Garoua mènent à un produit vide, y compris pour le rendez-vous, qui est la promesse de sécurité | VU `server/config.js:56` (5 villes) contre `:47-52` (4 lieux, 3 à Yaoundé, 1 à Douala) ; VU `server/routes.js:412-414` : `/venues` filtre sur la ville, donc liste vide ailleurs ; VU `server/routes.js:223` : `compatible()` exige la même ville ; VU `public/app.js:347` : l'écran vide ne propose aucun levier | 3 | indirect |
| **INSCRIPTION-17** | « Sortie en duo » est proposée avec une promesse précise, alors que le mode n'existe pas | VU `server/config.js:54` ; VU `public/app.js:44` (« Rencontrer à quatre, avec un ami ») ; MESURÉ `grep -rn "duo" server/ public/` : rien d'autre qu'un libellé, une icône et deux profils de démonstration (`server/seed.js:10-11`). CLAUDE.md §8 P1-7 reconnaît le mode comme inachevé | 3 | aucun |
| **INSCRIPTION-18** | Le quartier est un texte libre qui sert au classement : « Bastos » et « bastos » ne se rencontrent jamais | VU `public/app.js:500` (`input` libre, 40 caractères) ; VU `server/routes.js:106` (seulement `trim`) ; VU `server/routes.js:230` : `sameArea` compare les chaînes à l'identique ; VU `public/app.js:306` promet pourtant « Les profils de ton quartier passent devant » | 2 | aucun |
| **INSCRIPTION-19** | Buea est proposée à l'inscription alors que l'interface est entièrement en français | VU `server/config.js:56` ; MESURÉ : aucun fichier de traduction dans le dépôt (`grep -rn "i18n\|locale" public/ server/` : rien) | 2 | aucun |

---

## 6. Fiche E — formulaire, étape 3 sur 3 (touche personnelle)

**Ce que fait la concurrence.** SOURCE (consultée) : chez Hinge on aime un élément précis du profil avec
un commentaire attaché, si bien que le premier message existe avant le match ; le profil est fait de
prompts. Limite : cela suppose un profil riche. SOURCE (connaissance, non revérifiée) : Muzz floute la
photo jusqu'à accord — mécanique transposable ici à coût data **négatif**.

**Ce que fait Mbolo.** Un couple question / réponse, trois emplacements photo modérés, une compression
côté client avant envoi. C'est la bonne brique pour un lanceur de conversation, et elle est déjà là.

**L'écart, mesuré.**

```
# étape 3 (MESURÉ, insc2.mjs)
  éléments focalisables : ["BUTTON:submit","INPUT:photo-1 [hidden]","INPUT:photo-2 [hidden]",
                           "INPUT:photo-3 [hidden]","SELECT:promptQ","INPUT:promptA","INPUT:languages"]
  inputs fichier : hidden = true  → les emplacements photo ne se prennent pas au clavier
  contraste des numéros 1 / 2 / 3 : 1,05 pour un seuil de 4,5
# injection dans promptQ (MESURÉ, curl)
  PUT /api/me/profile  promptQ="WhatsApp 699 88 77 66 envoie moi 5000F"  → 200, stocké tel quel
  le même texte dans promptA                                            → 400 PROFILE_CONTACT
  profil public relu : "promptQ": "WhatsApp 699 88 77 66 envoie moi 5000F"
```

| id | constat | preuve | gravité | sécurité |
|---|---|---|---|---|
| **INSCRIPTION-20** | `promptQ` échappe au filtre anti-arnaque et s'affiche sur la carte : un numéro et une demande d'argent entrent dans un profil, avant tout message | MESURÉ ci-dessus ; VU `server/routes.js:98` : `profileText` compose prénom, quartier, réponse et langues — `promptQ` absent ; VU `server/routes.js:107` : `promptQ` est repris du corps de la requête, tronqué à 60 caractères, sans liste blanche ; VU `public/app.js:235` : rendu sur chaque carte | 4 | **direct** |
| **INSCRIPTION-21** | Ajouter ou retirer une photo reconstruit toute l'étape : le clavier se referme et le focus est perdu | VU `public/app.js:1234` et `:1167` (`SCREENS.profile()` après chaque changement) ; VU `public/app.js:523` (rendu complet). CLAUDE.md §5.16 pose déjà cette règle pour la discussion ; elle n'est pas tenue ici | 2 | aucun |
| **INSCRIPTION-22** | Les emplacements photo sont inatteignables au clavier et leurs numéros sont illisibles | VU `public/app.js:513` (`<input type="file" … hidden>` dans un `<label>`, donc non focalisable) ; MESURÉ : contraste 1,05 sur les numéros 1, 2 et 3 | 2 | aucun |

---

## 7. Transversal au formulaire et à l'enregistrement

```
# fermeture en cours de saisie (MESURÉ, insc3.mjs)
  localStorage : {}   sessionStorage : {"dev_user":"77022"}   profil serveur : null
  après rechargement → écran « Des rencontres vérifiées, face à face. », ÉTAPE 1 SUR 3, prénom "", âge ""
  window.onbeforeunload : null
# défilement entre étapes (MESURÉ) : 73 px avant « Continuer », 73 px après
# coupure réseau au moment d'enregistrer (MESURÉ, repri.mjs)
  « Pas de connexion. Vérifie ton réseau et réessaie. » ; bouton « Enregistrer » ; saisie conservée
  retour du réseau : rien ne repart seul, l'avertissement reste affiché à tort ; un appui suffit ensuite
# débit par compte (MESURÉ, debit.mjs)
  50 écritures de profil en parallèle : 138 ms, 50 acceptées, 0 refusée
  30 envois de photo sur le même emplacement : 30 ms, 30 acceptées, 0 refusée
```

| id | constat | preuve | gravité | sécurité |
|---|---|---|---|---|
| **INSCRIPTION-23** | Rien n'est enregistré avant la fin des trois étapes, et rien ne prévient avant de tout perdre | MESURÉ ci-dessus ; VU `public/app.js:460-472` (`S.form` en mémoire seule) ; VU `public/app.js:115` : `go()` **désactive** la confirmation de fermeture, alors que le brouillon de rendez-vous l'active (`:1181`) ; VU `public/app.js:1285` : CloudStorage est déjà utilisé pour l'économie de data, donc disponible | 3 | aucun |
| **INSCRIPTION-24** | « Étape 3 sur 3 » puis une quatrième étape : le selfie n'est jamais annoncé comme un effort à fournir | VU `public/app.js:479` (`Étape ${step + 1} sur 3`), `:899` (`go('verify')` après enregistrement) ; VU `public/app.js:446` : `welcome` présente le selfie comme une propriété des autres, pas comme une demande ; VU `server/bot.js:107` : `/start` n'en dit rien | 3 | aucun |
| **INSCRIPTION-25** | Une seule ligne d'erreur en bas d'écran, jamais reliée au champ fautif, et aucun `<form>` : la touche du clavier Android ne sert à rien | VU `public/app.js:268-272` (`showError` écrit un texte, sans focus ni mise en évidence), `:523` (`<p id="form-error">` en fin de rendu) ; MESURÉ `grep -n "<form" public/app.js` : aucun dans le formulaire de profil ; VU `public/app.js:1026` : la discussion, elle, a `enterkeyhint="send"` | 2 | aucun |
| **INSCRIPTION-26** | Le passage d'une étape à l'autre ne remonte pas en haut de l'écran | MESURÉ : 73 px avant, 73 px après ; VU `public/app.js:122` (`window.scrollTo(0, 0)` dans `go()`) contre `:862-868` (`nextStep` appelle `SCREENS.profile()` directement) | 2 | aucun |
| **INSCRIPTION-27** | Aucune limitation de débit sur l'inscription : un compte peut inonder la file de modération | MESURÉ ci-dessus ; VU `server/routes.js:12-14` (`requireAuth` puis `touchActivity`, aucun compteur) ; VU `server/routes.js:158-166` : chaque envoi de photo écrit un fichier **et** déclenche un message vers le groupe de modération | 3 | indirect |
| **INSCRIPTION-28** | Rien n'est horodaté entre la création du compte et le profil complet : l'abandon est invisible | VU `server/store.js:55` (`createdAt` seul) ; VU `server/routes.js:112` (`store.updateUser(id, { profile })`, aucune date) ; MESURÉ `grep -rniE "analytics\|track\(" server/ public/` : rien. On ne peut donc calculer ni le délai d'inscription, ni l'étape d'abandon, ni le taux de refus pour minorité | 3 | aucun |

---

## 8. Ce que Mbolo fait mieux que la concurrence sur ce lot

Ces points sont acquis et ne doivent pas être abîmés par les corrections ci-dessus.

1. **Aucun mot de passe, aucun courriel, aucun numéro de téléphone demandé.** L'identité vient d'un
   `initData` validé côté serveur (VU `server/auth.js:20-46`), `initDataUnsafe` ne sert qu'à préremplir
   (VU `public/app.js:436, 461`). Là où Badoo et Tinder imposent une création de compte, Mbolo n'a
   aucun formulaire d'identification. C'est le seul avantage de distribution réel face à un vivier
   installé, et il est dit à l'écran (VU `public/app.js:451`).
2. **Le pseudo et le numéro Telegram ne sortent jamais.** Le profil public est une liste blanche
   explicite (VU `server/routes.js:29-54`) ; MESURÉ (dossier §7.6) : même le genre n'est pas renvoyé.
3. **Aucune position GPS.** Le quartier déclaré tient lieu de proximité (VU `server/routes.js:230`),
   là où Happn expose le croisement en temps réel. Coût data nul, risque nul pour les femmes.
4. **Le cache fonctionne vraiment.** MESURÉ : 2 941 o à la deuxième ouverture contre 131 455 o à la
   première, grâce à une empreinte de contenu et non de démarrage (VU `server/assets.js:13-17`, et le
   commentaire `:1-6` explique pourquoi c'est un choix de data, pas d'ingénierie). Sous la barre des
   20 Ko de l'ancrage C18.
5. **Le mouvement réduit est respecté partout.** VU `public/styles.css:128, 363, 400, 421, 513, 518, 526` :
   toutes les animations sont derrière `prefers-reduced-motion: no-preference`. C'est un élément du
   niveau 3 de C20, déjà acquis.
6. **L'app est rapide même sur processeur lent.** MESURÉ : `welcome` → étape 1 en 155 ms avec un CPU
   bridé ×6, étape 1 → étape 2 en 113 ms. Le coût de démarrage n'est pas dans le code de Mbolo.
7. **Le profil est filtré contre l'arnaque dès l'inscription.** VU `server/routes.js:98-99` : prénom,
   quartier, réponse et langues passent par `checkMessage`. MESURÉ : une demande d'argent dans la
   réponse est refusée. Aucune app du benchmark ne bloque la sollicitation financière dans le profil.
   (La brèche `promptQ` d'INSCRIPTION-20 ne retire rien au principe : elle le rend urgent à fermer.)
8. **Les photos sont compressées sur le téléphone avant l'envoi.** VU `public/app.js:82-98` (720 px,
   qualité 0,8) : la data de l'utilisateur est économisée à l'envoi, pas seulement à la lecture.
9. **La reprise après coupure au moment d'enregistrer est propre.** MESURÉ : message actionnable,
   saisie conservée, un seul appui pour repartir. C'est le niveau 2 de C03, tenu.
10. **Aucune donnée interdite n'est collectée.** Ni orientation, ni ethnie, ni religion à l'inscription :
    les champs n'existent pas dans `server/routes.js:104-111`. La suppression efface tout, y compris les
    fichiers (VU `server/store.js:75-92`).

---

## 9. Ce que j'ai écarté ou corrigé dans la matière reçue

- **Coordonnées de la cartographie.** Plusieurs renvois du segment 1 sont décalés : `SCREENS.profile`
  est annoncé en `public/app.js:473-531` (réel : `458-531`), « Étape x sur 3 » en `:522` (réel : `479`),
  `INTENTS` en `server/config.js:130-132` (le fichier fait 56 lignes). Les faits tiennent, les
  coordonnées non ; celles de ce document ont toutes été relues ligne à ligne.
- **« Cibles sous 44 px ».** Vrai mais mal cadré : MESURÉ, aucune cible des quatre écrans du lot n'est
  sous le seuil **normatif** de WCAG 2.2 AA (24 x 24). Trois sont sous la recommandation mobile de 44 x 44,
  toutes à l'étape 1 (« Femme » et « Homme », 159 x 40, et le bouton de retour de développement, absent
  dans Telegram). L'écart est réel, il n'est pas une non-conformité.
- **« Prénom prérempli ».** MESURÉ : le champ est vide dans un navigateur ordinaire, parce que
  `tg.telegramUser()` renvoie `null` hors de Telegram (VU `public/tg.js:68`). Le préremplissage existe
  bien dans Telegram ; ce n'est pas une friction.
- **Écarté faute de preuve.** « Le MainButton natif reste-t-il atteignable quand le clavier Android est
  ouvert ? » : je n'ai pas de téléphone réel, je n'affirme rien. Test qui trancherait : ouvrir l'étape 1
  dans Telegram Android, donner le focus au champ Âge, photographier le bas de l'écran.
- **Écarté faute de preuve.** L'effet réel de `color-mix()` sur le parc visé (INSCRIPTION-07) : l'absence
  de repli est VU, la proportion d'appareils touchés n'est pas mesurable ici.

---

## 10. Plan de correction, par coût croissant

Chaque effort est chiffré par les fichiers à toucher et le travail de vérification associé.
Aucune correction proposée ne contourne une règle de CLAUDE.md ; les deux endroits où une règle bloque
la recette du marché sont signalés en clair (fiche C, et le point 3 ci-dessous).

**Demi-journée chacune, à faire d'abord (7 corrections, effet immédiat).**

| id | correction | fichiers |
|---|---|---|
| INSCRIPTION-20 | passer `promptQ` dans `checkMessage`, ou mieux : valider `promptQ` contre la liste des cinq questions côté serveur | `server/routes.js`, `test/` |
| INSCRIPTION-09 | refuser `AUTO_APPROVE` et `SEED_DEMO` quand `NODE_ENV=production`, comme c'est déjà fait pour `allowDevAuth` ; les retirer des trois configurations livrées | `server/config.js`, `fly.toml`, `render.yaml`, `.env.example`, `README.md`, `test/` |
| INSCRIPTION-02 | ajouter `defer` au script du SDK, et un garde-fou quand il n'arrive pas | `public/index.html`, `public/tg.js` |
| INSCRIPTION-13 | distinguer « champ vide » de « hors borne », borner l'âge côté client, renvoyer à l'étape fautive quand le serveur refuse | `public/app.js` |
| INSCRIPTION-26 | remettre le défilement à zéro dans `nextStep` | `public/app.js` |
| INSCRIPTION-17 | retirer « sortie en duo » de l'inscription tant que P1-7 n'est pas fait | `server/config.js`, `public/app.js`, `test/` |
| INSCRIPTION-01 | avertir bruyamment au démarrage, et replier sur un lien texte quand `WEBAPP_URL` manque | `server/index.js`, `server/bot.js`, `README.md` |

**Un à deux jours chacune (9 corrections).**

| id | correction | fichiers |
|---|---|---|
| INSCRIPTION-08 | deux pages statiques `/confidentialite` et `/conditions`, liées depuis `welcome`, plus la date et la version acceptées enregistrées sur l'utilisateur | `server/index.js`, `server/routes.js`, `server/store.js`, `public/`, `README.md`, `test/` |
| INSCRIPTION-04 | bouton « Réessayer » sur l'écran de démarrage et lien `t.me` servi par une route publique (le nom du bot est connu du serveur, VU `server/config.js:45`) | `public/app.js`, `server/routes.js`, `server/index.js` |
| INSCRIPTION-05 | `AbortController` à 10 s sur `api()` et sur les lectures CloudStorage, puis écran d'erreur actionnable | `public/app.js`, `public/tg.js`, `test/` |
| INSCRIPTION-03 | servir des variantes pré-compressées calculées au démarrage avec `node:zlib` (aucune dépendance nouvelle, conforme à CLAUDE.md §2) | `server/index.js`, `server/assets.js`, `test/` |
| INSCRIPTION-23 | brouillon du formulaire en CloudStorage à chaque étape, reprise exacte à l'écran quitté | `public/app.js`, `public/tg.js` |
| INSCRIPTION-11 + 12 | relever les couleurs d'intitulé et de mention en thème clair, lever `maximum-scale` | `public/styles.css`, `public/index.html` |
| INSCRIPTION-16 | restreindre la liste des villes à celles qui ont un lieu partenaire, et proposer une liste d'attente ailleurs | `server/config.js`, `server/routes.js`, `public/app.js`, `test/` |
| INSCRIPTION-27 | compteur par compte et par fenêtre glissante sur le profil, les photos et la vérification (P0-3 de la feuille de route) | `server/routes.js`, `server/store.js`, `test/` |
| INSCRIPTION-28 | horodater l'entrée dans chaque étape et l'enregistrement du profil ; exclure les profils de démonstration de tout calcul | `server/routes.js`, `server/store.js`, `test/` |

**Trois à cinq jours (3 corrections).**

| id | correction | fichiers |
|---|---|---|
| INSCRIPTION-10 | aperçu honnête sur `welcome` : nombre de personnes vérifiées dans la ville, sans photo, plus un délai de modération adossé à une mesure réelle. Suppose INSCRIPTION-28 fait | `server/routes.js`, `public/app.js`, `public/styles.css`, `test/` |
| INSCRIPTION-14 + 15 + 24 | reprendre le formulaire : une phrase d'usage sous chaque champ obligatoire, « Étape x sur 4 », selfie annoncé dès `welcome` et dès `/start` | `public/app.js`, `server/bot.js`, `public/styles.css` |
| INSCRIPTION-21 + 22 + 25 | reprendre la mécanique du formulaire : mise à jour d'un seul emplacement photo, emplacements atteignables au clavier, `<form>` avec `enterkeyhint`, erreur posée sous le champ fautif avec focus | `public/app.js`, `public/styles.css`, `public/ui.js` |

**Restent hors chiffrage.** INSCRIPTION-06 (deux lectures CloudStorage) et INSCRIPTION-07 (`color-mix`)
demandent d'abord une mesure sur un téléphone réel : corriger à l'aveugle coûterait plus que le défaut.
INSCRIPTION-18 (quartier libre) et INSCRIPTION-19 (Buea) attendent une décision produit — liste fermée de
quartiers, et anglais avant ou après l'ouverture de Buea — avant d'être chiffrables honnêtement.
