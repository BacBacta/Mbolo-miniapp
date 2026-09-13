# Grille de benchmark — Odo, bêta fermée à Yaoundé

Phase 1 de l'audit. Ce document fige la grille d'évaluation **avant** tout diagnostic.
Aucune note n'est attribuée ici. Les agents de diagnostic noteront, criterion par critère, sur du VU ou du MESURÉ uniquement.

Date : 11 septembre 2026. Dépôt : `/home/user/Mbolo-miniapp`, dernier commit `29703c7` (« Profil : jusqu'à trois photos modérées »).

---

## 0. Comment lire ce document

### 0.1 Marques

Chaque affirmation porte une marque. Aucune affirmation n'en est dépourvue.

| marque | ce que ça veut dire | ce qui l'accompagne obligatoirement |
|---|---|---|
| **VU** | fait lu dans le code du dépôt | `chemin:ligne` exact |
| **MESURÉ** | valeur obtenue en exécutant quelque chose | la commande et la sortie, ou la référence de la mesure et son protocole |
| **SUPPOSÉ** | hypothèse non vérifiée | le test falsifiable qui trancherait |
| **SOURCE** | repère externe de marché ou de norme | provenance, fiabilité, et limite de comparabilité |

Les marques VU / MESURÉ / SUPPOSÉ portent sur Odo. La marque SOURCE porte sur tout ce qui vient du dehors.
Un repère de marché n'est jamais un objectif : il sert à situer, pas à viser.

Trois niveaux de fiabilité pour les SOURCE, repris du dossier de références :
- **consultée** — page ouverte et lue pendant la collecte ;
- **secondaire** — extrait de résultat de recherche, page primaire non ouverte ;
- **connaissance** — connaissance du modèle, non revérifiée en ligne. À rouvrir avant toute publication opposable.

### 0.2 Ce que la grille note, et ce qu'elle ne note pas

La grille note **le produit tel qu'il se comporte**, pas le code tel qu'il est écrit, ni la feuille de route telle qu'elle est rédigée.
CLAUDE.md est partiellement décalé par rapport au dépôt : la vérité est dans le code et dans l'exécution.
Exemple : CLAUDE.md décrit une photo de profil facultative, or le code accepte désormais trois photos modérées (VU `server/routes.js:156-183`, `server/store.js:94-118`). La grille suit le code.

### 0.3 Barème

Quatre niveaux ancrés, de 0 à 3. Les ancrages sont rédigés pour qu'un autre évaluateur attribue la même note sans me consulter.
Règle de lecture : **un niveau n'est atteint que si tout ce qu'il décrit est vrai**. Un seul élément manquant fait redescendre d'un cran.
Le « minimum acceptable » de chaque critère correspond au niveau **2**, sauf mention contraire écrite dans le critère.

### 0.4 Périmètre des écrans

13 écrans, VU dans l'objet `SCREENS` de `public/app.js` : `welcome` (:435), `profile` (:458, trois étapes), `verify` (:533), `pending` (:569), `discover` (:586), `filters` (:621), `person` (:637), `match` (:650), `matches` (:667), `chat` (:717), `date` (:733), `safety` (:764), `me` (:793).

---

## 1. La grille — 24 critères

### C01 — Temps et taps avant le premier visage

**Mesure.** Chronomètre entre l'appui sur le bouton d'ouverture dans Telegram et l'affichage de la première fiche d'une personne réelle (profils de démonstration exclus). Sur Android d'entrée de gamme, réseau bridé « Slow 4G » et CPU ×4. Compter en parallèle les taps, les écrans traversés et les champs obligatoires. Deux passages obligatoires : `AUTO_APPROVE=false` avec modérateur disponible, puis `AUTO_APPROVE=false` sans modérateur éveillé.

**État de l'art.** SOURCE (consultée, benchmark 2026) : Tinder, Badoo et Facebook Dating montrent de la valeur avant d'exiger la vérification complète ; chez Tinder, Face Check est devenu obligatoire mais la décision est automatisée et rendue en secondes. Limite de comparabilité : ces apps ne promettent pas un vivier intégralement vérifié, donc la comparaison porte sur la gestion de l'attente, pas sur l'équivalence de promesse.

**Minimum acceptable.** Moins de 3 minutes jusqu'à un contenu réel, ou — si le vivier reste verrouillé avant vérification — un aperçu honnête affiché immédiatement : nombre de personnes vérifiées dans la ville, délai de modération annoncé et adossé à une mesure.

- **0** — écran d'attente sans contenu, sans délai annoncé, sans borne de durée.
- **1** — attente expliquée, délai annoncé, mais rien ne mesure ni ne garantit ce délai.
- **2** — aperçu partiel immédiat (compteur de personnes vérifiées dans la ville, profils sans photo ou floutés) affiché **avant** la demande de selfie, plus un délai annoncé adossé à un compteur réel.
- **3** — au moins un profil réel visible en moins de 60 secondes et moins de 10 taps, les photos restant réservées aux comptes vérifiés, la vérification restant obligatoire avant tout like ou message.

**Où regarder.** VU : `server/routes.js:66` (`requireApproved` renvoie 403 `NOT_VERIFIED`), `:232` (`/discover` protégé), `public/app.js:569-585` (écran `pending`, sondage toutes les 5 s à `:583`).
MESURÉ (dossier de mesures §1, environnement où `telegram.org` est injoignable) : première peinture à 12 688 ms, premier écran utilisable à 12 941 ms, à cause du script bloquant VU `public/index.html:10`. Limite : ce n'est pas une valeur de terrain, c'est la démonstration d'un mode de défaillance. Test falsifiable : rejouer la trace sur un réseau camerounais réel et relever le temps jusqu'à la première peinture.

---

### C02 — Coût de l'inscription et progressivité

**Mesure.** Compter les champs obligatoires et les écrans avant l'accès à la découverte. Pour chaque champ obligatoire, vérifier qu'une phrase à l'écran dit à quoi il sert. Vérifier que toute option proposée mène à un parcours complet.

**État de l'art.** SOURCE (consultée) : 3 à 5 champs obligatoires seulement (prénom, âge, genre, photo), le reste différé et présenté comme une amélioration de résultats ; Hinge structure le profil en prompts plutôt qu'en formulaire. Limite : ces apps disposent d'un vivier dense, elles peuvent se permettre un profil pauvre au départ ; Odo ne le peut pas au même degré.

**Minimum acceptable.** Aucun champ obligatoire qui ne serve ni au matching ni à la sécurité. Une phrase de justification par champ obligatoire. Retour arrière sans perte de saisie.

- **0** — formulaire long en un bloc, aucune justification visible, saisie perdue au retour arrière.
- **1** — formulaire découpé en étapes avec progression visible, mais les champs obligatoires ne sont pas justifiés à l'écran.
- **2** — cinq champs obligatoires au plus, tous justifiés à l'écran, le reste optionnel avec une complétion visible ; aucune option proposée ne mène à un parcours inachevé.
- **3** — le niveau 2, plus chaque élément différé est demandé au moment où il sert réellement, et la complétion est récompensée par un effet visible sur les résultats.

**Où regarder.** VU : `public/app.js:458-532` (formulaire en trois étapes), `server/routes.js:87-114` (validation serveur : prénom, âge 18-99, genre, intention, ville, réponse de 3 caractères au moins). VU : `INTENTS` contient `duo` (`server/config.js:54`), proposé à l'inscription, alors que CLAUDE.md §8 P1-7 reconnaît le mode comme inachevé.

---

### C03 — Reprise après coupure, abandon ou refus

**Mesure.** Fermer l'app au milieu de chaque étape puis rouvrir. Couper le réseau pendant l'envoi du profil, pendant l'envoi du selfie, pendant l'envoi d'une photo, pendant l'envoi d'un message. Relever ce qui subsiste et ce qu'il faut ressaisir. Après un refus de vérification, relever la voie de reprise proposée.

**État de l'art.** SOURCE (connaissance) : sauvegarde à chaque étape côté serveur, reprise exacte à l'écran quitté, relance par notification quand l'inscription reste inachevée. À rouvrir avant citation opposable.

**Minimum acceptable.** Aucune perte de saisie. Message d'erreur réseau actionnable. Action rejouable sans ressaisie. Un refus de vérification laisse une voie de reprise explicite.

- **0** — la saisie est perdue, ou l'échec est silencieux.
- **1** — un message d'erreur s'affiche, mais il faut tout ressaisir.
- **2** — l'état est conservé tant que l'app reste ouverte, et chaque action coûteuse propose un réessai sans ressaisie.
- **3** — le niveau 2, plus l'état survit à la fermeture de l'app (serveur ou CloudStorage), plus une relance du bot quand l'inscription reste inachevée.

**Où regarder.** VU : `public/app.js:459-472` (`S.form` initialisé en mémoire depuis le profil serveur), `public/tg.js` expose déjà CloudStorage (utilisé pour l'économie de data, VU `public/app.js:1285`). VU : `server/bot.js:95` (message de refus de vérification, avec bouton « Réessayer »).

---

### C04 — Preuve de vivant à l'inscription

**Mesure.** Tenter la vérification en présentant le visage d'une autre personne affiché sur un second écran, geste compris. Compter combien d'appels à la route de démarrage de vérification suffisent pour retomber sur un geste déjà filmé. Vérifier si une image de galerie est acceptée. Vérifier si le geste expire.

**État de l'art.** SOURCE (consultée) : vidéo-selfie avec détection de vivacité automatisée, obligatoire, décision en secondes, média supprimé après analyse, empreinte non réversible conservée (Tinder Face Check, annonce d'octobre 2025, extension annoncée à Hinge en 2026). SOURCE (consultée) : ISO/IEC 30107-3 définit les niveaux d'attaque (niveau 1 : photo imprimée, rejeu d'écran ; niveau 2 : masques, deepfakes, injection vidéo), testés par des laboratoires accrédités NVLAP. Limite : une certification formelle n'est pas un attendu réaliste pour une bêta fermée ; le barème sert de vocabulaire pour qualifier l'écart, pas d'objectif.

**Minimum acceptable.** Capture en direct imposée, geste tiré au moment même dans un ensemble assez large pour ne pas être rejoué, lié à la session et expirant en quelques minutes, comparé aux photos du profil par la personne qui décide, selfie supprimé après décision.

- **0** — pas de vérification, ou une image de galerie sans geste suffit.
- **1** — un geste est demandé, mais il est rejouable : ensemble de gestes petit, pas d'expiration, image de galerie acceptée.
- **2** — capture en direct imposée côté client, geste expirant et non rejouable en pratique, décision humaine prise avec le selfie et les photos du profil visibles ensemble, selfie supprimé après décision dans tous les chemins.
- **3** — le niveau 2, plus la vivacité vérifiée automatiquement, une décision en moins de 2 minutes, et une comparaison automatique au visage des photos du profil.

**Où regarder.** VU : `server/routes.js:17` (quatre gestes en dur), `:116-121` (tirage aléatoire, aucun horodatage sur `pendingGesture`), `:56-63` (`saveJpeg` accepte tout `data:image/(jpeg|jpg|png|webp)` jusqu'à 1,5 Mo), `:123-138` (envoi en modération). VU : `server/bot.js:47-57` (selfie et geste envoyés au groupe), `:61-71` (photos envoyées dans un message séparé), `:85-97` (`decideVerification` supprime le fichier local).

---

### C05 — Ce que le badge promet, et ce qu'il ne promet pas

**Mesure.** Sur chaque écran où un badge apparaît, compter les taps pour obtenir l'explication. Relever la formulation mot à mot et vérifier qu'elle énonce les limites.

**État de l'art.** SOURCE (secondaire) : le secteur reconnaît qu'un badge de vérification n'atteste ni identité légale, ni âge réel, ni absence d'antécédents. Limite : aucune app du benchmark ne publie de formulation de référence ; c'est une exigence d'honnêteté, pas un standard mesurable. Comparaison la plus proche : Muzz et Bumble affichent explicitement ce que couvre leur vérification.

**Minimum acceptable.** Badge présent partout où un profil apparaît, jamais ambigu, avec une explication accessible en un tap.

- **0** — pas de badge, ou badge affiché sans explication accessible.
- **1** — badge plus une explication générale, sans énoncé de ce qui n'est pas garanti.
- **2** — badge plus une explication en un tap qui dit précisément ce qui a été vérifié : une personne réelle a fait un geste demandé devant la caméra.
- **3** — le niveau 2, plus l'énoncé explicite des limites (le badge ne dit rien des intentions ni de l'identité légale), rappelé au moment du passage au rendez-vous.

**Où regarder.** VU : `server/routes.js:45-46` (`verified` et objet `trust` renvoyés dans le profil public : `selfie`, `guarantor`, `seniority`), `public/app.js:435-456` (écran `welcome`, promesse « Chaque membre a prouvé qu'il est une vraie personne »), `:764-792` (écran `safety`). CLAUDE.md §8 P1-5 (explication de la jauge de confiance) est annoncé comme non fait.

---

### C06 — Barrière durable au retour d'un compte sanctionné

**Mesure.** Sanctionner un compte de test, puis mesurer le temps et le coût pour revenir : nouveau compte Telegram, même visage, même téléphone.

**État de l'art.** SOURCE (consultée) : empreinte faciale chiffrée et non réversible conservée après suppression du selfie, comparée aux comptes actifs, refus automatique en cas de doublon (Tinder Face Check). SOURCE (connaissance) : conservation d'un identifiant d'appareil ou d'un faisceau de signaux pour empêcher le retour d'un banni. Limite : l'empreinte faciale est une donnée biométrique ; sous la loi camerounaise n° 2024/017, sa base légale n'est pas tranchée dans les éléments réunis (analyses secondaires uniquement, texte officiel non lu).

**Minimum acceptable.** Un état de compte sanctionné existe, il coupe l'accès immédiatement, et son effet porte sur toutes les discussions du compte.

- **0** — aucun état de sanction ; un signalement n'a d'effet que sur la relation signalée.
- **1** — un compte peut être sanctionné à la main, mais rien n'empêche le retour sous un autre compte.
- **2** — le niveau 1, plus une barrière non biométrique documentée (liste tenue par la modération, signaux d'inscription ou d'appareil), et la sanction coupe toutes les discussions du compte visé.
- **3** — le niveau 2, plus un refus automatique à l'inscription fondé sur une empreinte faciale non réversible, avec base légale écrite, finalité déclarée et durée de conservation publiée.

**Où regarder.** VU : `server/store.js:51-61` (modèle utilisateur : `verification` vaut `none`, `pending`, `approved` ou `rejected` ; aucun champ `banned` ni `suspended`), `server/bot.js:119-133` (les seuls rappels de modération valident ou refusent un selfie ou une photo), `server/routes.js:441-449` (un signalement enregistre une ligne, bloque d'un côté, et envoie un message texte à la modération).

**Tension de règle.** Le niveau 3 suppose de créer une donnée biométrique, ce que CLAUDE.md §5.4 n'interdit pas mais encadre (minimisation, effacement par `DELETE /api/me`, mention au README), et que la roadmap prévoit en P1-1. Tant que la base légale n'est pas écrite, la cible réaliste est le niveau 2, qui n'exige aucune biométrie.

---

### C07 — Densité et fraîcheur du vivier local

**Mesure.** Pour un compte neuf à Yaoundé, compter les profils compatibles réellement renvoyés, par intention et par tranche d'âge. Refaire l'essai avec une ville sans lieu partenaire et avec l'intention « sortie en duo ». Relever mot à mot ce qui s'affiche quand le résultat est vide.

**État de l'art.** SOURCE (connaissance) : jamais d'écran vide ; élargissement progressif et annoncé des critères plutôt qu'un vide. SOURCE (secondaire, à revérifier) : Badoo est décrit comme particulièrement installé dans les pays francophones d'Afrique, dont le Cameroun. Limite de comparabilité déterminante : Badoo a un vivier installé, Odo démarre à zéro en bêta fermée. La densité n'est pas un problème d'interface, c'est un problème d'offre ; la grille note la **gestion honnête du vide**, pas le nombre de profils.

**Minimum acceptable.** Aucun écran vide muet. L'écran dit pourquoi c'est vide, ce que la personne peut changer, et propose d'être prévenue quand quelqu'un arrive.

- **0** — écran vide sans explication, ou une intention ou une ville proposée à l'inscription sans vivier ni lieu partenaire derrière.
- **1** — message d'attente sans levier, du type « reviens plus tard ».
- **2** — message expliquant le filtre, plus les leviers d'élargissement à portée de tap (âge, quartier, ville, intention), plus un compteur honnête des personnes vérifiées dans la ville.
- **3** — le niveau 2, plus un élargissement automatique annoncé à l'utilisateur et une alerte du bot à l'arrivée de profils compatibles, sans relance d'engagement déguisée en événement social.

**Où regarder.** VU : `server/routes.js:221-227` (`compatible()` : même intention et même ville, plus règle femme/homme pour « relation sérieuse »), `:232-244` (`/discover` : filtres cumulés, au plus 10 profils par appel), `:189` (`inAgeRange`). VU : `public/app.js:344-347` et `:605-608` (textes des états vides, sans levier d'élargissement). VU : `server/config.js:47-52` (quatre lieux partenaires, trois à Yaoundé, un à Douala) contre `:56` (`CITIES` propose aussi Bafoussam, Buea et Garoua).

---

### C08 — Règle de découverte explicable, sans donnée interdite

**Mesure.** Lire la règle de sélection et de tri, puis vérifier qu'elle s'énonce en une phrase compréhensible par un utilisateur. Vérifier qu'aucune donnée d'orientation sexuelle ni d'ethnie n'y entre, ni directement, ni par inférence possible depuis les données stockées.

**État de l'art.** SOURCE (consultée) : Hinge applique un appariement stable de type Gale-Shapley et recommande un « Most Compatible » par jour ; Tinder annonce « Chemistry », un appariement fondé sur des signaux comportementaux plutôt que sur le classement par photo, avec 60 millions de dollars alloués à la refonte ; Bumble remplace le swipe par une recommandation conversationnelle sur marchés sélectionnés au T4 2026. Limite : aucun de ces algorithmes n'est publié ; on ne compare que le principe, jamais la performance.

**Minimum acceptable.** Un ordre explicable en une phrase, qui privilégie la réciprocité et la proximité déclarée, sans hiérarchie de désirabilité invisible et sans donnée interdite.

- **0** — ordre aléatoire ou par date, non explicable à l'utilisateur.
- **1** — ordre fondé sur des critères fixes, cohérents, mais jamais expliqués à l'écran.
- **2** — ordre expliqué à l'écran, réciprocité d'abord puis proximité déclarée, sans position GPS ni donnée interdite.
- **3** — le niveau 2, plus un signal de résultat réel qui entre dans l'ordre (a répondu, a accepté un rendez-vous, s'est présenté), et la possibilité pour la personne de savoir pourquoi un profil lui est proposé.

**Où regarder.** VU : `server/routes.js:241` (tri découverte : ceux qui t'ont liké, puis même quartier), `:268-270` (tri de la liste : en attente de réponse, non vus, balayés, matchs, puis quartier, activité, ancienneté), `:230` (`sameArea`, le quartier déclaré tient lieu de proximité, aucune position demandée). VU : `server/config.js:31` (`matchPolicy`) et `server/routes.js:225` (règle femme/homme appliquée uniquement à l'intention « relation sérieuse »).

**Tension de règle.** CLAUDE.md §5.2 interdit toute collecte d'orientation sexuelle. Conséquence produit VU dans les mesures (§7 du dossier de mesures) : un homme cherchant l'amitié voit des hommes dans son paquet. La grille n'exige donc **pas** un filtrage par attirance ; elle exige que l'effet soit **expliqué à l'écran**, ce qui ne coûte aucune donnée nouvelle.

---

### C09 — Quotas et mise en scène de la rareté

**Mesure.** Épuiser le quota et relever l'écran affiché, le compteur restant, l'heure de réinitialisation annoncée et le fuseau réellement utilisé. Vérifier ce qui reste faisable une fois le quota épuisé.

**État de l'art.** SOURCE (consultée) : Hinge accorde 8 likes gratuits par jour avec une réinitialisation à heure locale connue ; Coffee Meets Bagel présente un petit nombre de profils du jour avec 24 heures pour décider. Limite : chez eux la limite est un levier de monétisation ; chez Odo elle sert la qualité du vivier. La comparaison porte sur la **mise en scène**, pas sur la finalité.

**Minimum acceptable.** Compteur visible en continu, heure de réinitialisation connue et calée sur le fuseau de l'utilisateur, écran de quota épuisé qui propose autre chose que l'attente.

- **0** — blocage sec au moment de l'action, sans compteur préalable.
- **1** — blocage expliqué, mais le compteur n'apparaît qu'au moment du blocage.
- **2** — compteur visible en continu et heure de réinitialisation annoncée dans le fuseau de l'utilisateur.
- **3** — le niveau 2, plus un repli utile (revoir les likes reçus, compléter le profil, préparer un rendez-vous), et une rareté présentée comme une sélection du jour plutôt que comme une pénurie.

**Où regarder.** VU : `server/config.js:36` (`dailyProfiles: 20`), `server/routes.js:234` (`remaining` renvoyé par `/discover`), `:295` (message « Tu as vu tous tes profils du jour. Reviens demain. »), `:247` (parcourir la liste ne consomme rien, seul un like compte). SUPPOSÉ : la journée est bornée par le fuseau du processus Node et non celui de l'utilisateur ; test falsifiable — liker à 23 h 30 heure de Yaoundé puis relever le compteur à 00 h 30.

---

### C10 — Réciprocité : « on t'a aimé », gratuit et actionnable

**Mesure.** Provoquer un like entrant, puis relever où l'information apparaît, ce qu'on peut en faire sans payer, et si la notification correspondante mène à un écran où la personne figure réellement.

**État de l'art.** SOURCE (consultée) : le feed « Likes You » existe partout et constitue le principal produit d'appel payant (Hinge+, Coffee Meets Bagel Premium, Happn). SOURCE (secondaire, communiqué primaire non consulté) : Match Group, T4 2025 — payeurs en baisse de 5 % à 13,8 millions, revenu par payeur en hausse de 7 %. Limite : ce repère de tendance ne prouve pas qu'un paywall sur les likes fasse fuir ; il indique seulement que les leaders arbitrent vers la confiance. Ne pas en faire un objectif chiffré.

**Minimum acceptable.** L'existence d'un like reçu est gratuite et actionnable ; la personne qui a liké remonte en tête de la découverte ; la notification ne mène jamais à un écran vide.

- **0** — information invisible, ou entièrement derrière un paywall.
- **1** — information visible mais non actionnable (compteur seul, sans chemin vers la personne).
- **2** — gratuite, actionnable, et remontée en tête de la découverte.
- **3** — le niveau 2, plus un écran dédié avec relance, et une cohérence garantie entre la notification et l'écran d'arrivée : aucun filtre ne peut vider l'écran atteint depuis la notification.

**Où regarder.** VU : `server/routes.js:276-288` (`likersOf` ignore volontairement la tranche d'âge « sinon tu as plu à quelqu'un mènerait parfois à un écran vide » ; route `/likes` gratuite). VU : `:311` (notification « Tu as plu à quelqu'un », bouton vers `screen=discover`) — or `/discover` applique `inAgeRange` (`:237`), que `/likes` ignore : les deux règles divergent.

---

### C11 — Lanceur de conversation

**Mesure.** Après un match, relever ce qui s'affiche au moment d'écrire le premier message. Compter les taps pour envoyer un premier message qui s'appuie sur un élément du profil de l'autre.

**État de l'art.** SOURCE (consultée) : chez Hinge, on aime un élément précis — une photo ou un prompt — avec un commentaire attaché, si bien que le premier message existe avant même le match ; Grindr propose « Wingman » et des recherches en langage naturel. Limite : ces mécaniques supposent un profil riche (plusieurs prompts, plusieurs photos) et, pour certaines, un modèle de langage — hors de portée en coût data ici.

**Minimum acceptable.** Le profil porte au moins un élément non générique qui appelle une réponse, et cet élément est rappelé à l'écran au moment d'écrire.

- **0** — champ de saisie vide, rien du profil n'est rappelé.
- **1** — le profil porte une accroche, mais elle n'est pas rappelée au moment d'écrire.
- **2** — l'accroche est rappelée dans l'écran de discussion, plus au moins une amorce proposée en un tap.
- **3** — on aime un élément précis du profil avec un commentaire attaché, qui devient le premier message.

**Où regarder.** VU : `server/routes.js:39-40` (`promptQ` et `promptA` dans le profil public), `:96-97` (une seule réponse, 120 caractères, 3 minimum), `:290-314` (`POST /swipes` binaire : `like` ou `pass`, aucun commentaire attaché). VU : `public/app.js:650-666` (écran `match`), `:717-732` (écran `chat`).

---

### C12 — Anti-ghosting et priorisation des discussions

**Mesure.** Créer trois discussions : une où j'attends une réponse, une où l'autre attend la mienne, une sans réponse depuis trois jours. Relever l'ordre de la liste et les marques visuelles. Vérifier s'il existe un rappel, et sa formulation.

**État de l'art.** SOURCE (consultée) : Hinge « Your Turn » (rappel de tour de parole) ; Grindr « Smart Inbox » (la boîte priorise automatiquement les meilleures opportunités) ; Coffee Meets Bagel fait expirer la conversation au bout de 8 jours. Limite : la péremption est risquée sur un réseau instable où l'ouverture quotidienne n'est pas acquise — elle n'est pas transposable telle quelle et ne doit pas être exigée par la grille.

**Minimum acceptable.** La liste distingue visuellement « elle ou il attend ta réponse » de « tu attends la sienne ». Un rappel existe et n'est pas culpabilisant.

- **0** — liste triée par date seule, aucune marque de tour de parole.
- **1** — les non-lus sont signalés, mais pas le tour de parole.
- **2** — tri ou marquage explicite par « qui attend », plus un état visible pour les discussions restées sans réponse.
- **3** — le niveau 2, plus un rappel non culpabilisant et limité en fréquence, plus un moyen de clore proprement une discussion morte sans notifier l'autre.

**Où regarder.** VU : `server/routes.js:327-338` (`/matches` trié par date du dernier message uniquement ; `unread` et `isNew` renvoyés). VU : `:249` et `:268-270` (la logique « ceux qui attendent ta réponse d'abord » existe déjà, mais pour la liste des **profils**, pas pour les discussions).

---

### C13 — Passage au rendez-vous : cycle de vie complet

**Mesure.** Proposer un rendez-vous depuis un compte, puis depuis l'autre tenter d'accepter, de refuser, d'annuler, de modifier. Tenter un check-in sur un rendez-vous jamais accepté. Relever les notifications émises à chaque transition.

**État de l'art.** SOURCE (consultée) : Hinge teste « Direct to Date » au printemps 2026 (partage de disponibilités et d'activités dès le match) ; Happn lance « Perfect Date » (suggestion de lieux selon les intérêts communs, via Foursquare). Standard minimal implicite du marché : un rendez-vous se refuse et s'annule. Limite : ces fonctions sont récentes et aucune donnée d'efficacité n'est publique.

**Minimum acceptable.** Proposer, accepter, refuser, annuler ; chaque transition notifiée aux deux personnes ; aucun rendez-vous ne reste dans un état indéterminé ; aucune action physique (check-in) possible sur un rendez-vous non accepté.

- **0** — tout se négocie en texte libre, il n'existe aucun objet rendez-vous.
- **1** — la proposition est enregistrée, mais aucune réponse structurée n'est possible ; le statut reste figé.
- **2** — cycle complet proposer / accepter / refuser / annuler, notifié des deux côtés, avec check-in conditionné à l'acceptation.
- **3** — le niveau 2, plus une confirmation d'arrivée horodatée et exploitable, plus une proposition de lieu et de créneau dès le match.

**Où regarder.** VU : `server/routes.js:417-426` (`status: 'proposed'` figé à la création), `:428-438` (`checkin` ne lit jamais `d.status`), `:412-415` (lieux filtrés par ville, code QR retiré de la réponse). VU : `public/app.js:739` (quatre créneaux en dur : « Aujourd'hui, 17 h », « Demain, 16 h », « Samedi, 11 h », « Dimanche, 15 h »). VU : `server/config.js:47-52` (codes de lieu en dur, forme `rdv:lieu:palmier`).

---

### C14 — Sécurité autour de la rencontre physique

**Mesure.** Dérouler un rendez-vous complet et relever ce qui est proposé avant (créneaux, lieux, conseils), qui d'autre est informé, et ce qui est proposé après. Vérifier le repli du scanner QR sur un Telegram ancien, le cas d'une caméra refusée, le cas d'un code illisible, et le cas d'une ville sans lieu partenaire.

**État de l'art.** SOURCE (consultée) : Tinder « Share My Date » (lien portant nom et photo du match, lieu, date et heure, modifiable, jusqu'à 30 jours à l'avance) ; Bumble « Share Date » (le destinataire n'a pas besoin de compte) ; partenariat Tinder / Noonlight pour le partage de position en direct et l'appel d'assistance discret. Limite : le partage de position continue coûte cher en data et en vie privée ; il n'est pas souhaitable pour cette cible et la grille ne l'exige pas.

**Minimum acceptable.** Lieu public par défaut, plus la possibilité de prévenir une personne de confiance du lieu et de l'heure, sans partage de position continue.

- **0** — rien, ou seulement une phrase de conseil dans un écran d'aide.
- **1** — conseils de sécurité écrits et accessibles, lieu public suggéré mais non imposé.
- **2** — lieu public imposé, confirmation d'arrivée, et un repli utilisable quand le scanner natif n'existe pas ou échoue.
- **3** — le niveau 2, plus une personne de confiance prévenue automatiquement à l'acceptation et à l'arrivée, plus un point de contrôle après le rendez-vous avec un chemin de signalement à chaud.

**Où regarder.** VU : `public/app.js:841-842` (« Préviens une personne de confiance du lieu et de l'heure » — une phrase, pas une fonction), `:733-763` (écran `date`). VU : `public/tg.js:185-196` (repli du scanner : `window.prompt` avec un texte de développement « Hors Telegram : colle le contenu du QR code »). VU : `server/routes.js:436` (seule suite après le check-in : une notification à l'autre personne).

---

### C15 — Signaler, bloquer, défaire un match, et la suite donnée

**Mesure.** Depuis chaque écran où un profil apparaît, compter les taps pour signaler et pour bloquer **sans** signaler. Vérifier l'existence d'un unmatch. Relever les motifs proposés. Vérifier ce que reçoit la personne qui signale, et ce qui arrive au compte visé.

**État de l'art.** SOURCE (connaissance) : bloquer sans signaler et défaire un match silencieusement sont disponibles chez les grandes apps. SOURCE (consultée) : l'article 17 du DSA impose en Europe une motivation claire et spécifique à toute restriction de contenu ; les modèles de rapport de transparence sont obligatoires depuis le 1er juillet 2025. Limite : le DSA ne s'applique pas au Cameroun ; il sert de standard de fait, jamais d'obligation opposable ici.

**Minimum acceptable.** Signaler, bloquer sans accuser, et défaire un match : chacun accessible depuis la discussion, avec effet immédiat des deux côtés et sans notification à l'autre. Motifs couvrant la réalité locale : argent, chantage et images intimes, mineur, usurpation, violence.

- **0** — le signalement est le seul recours, ou il faut accuser quelqu'un pour s'en débarrasser.
- **1** — signaler et bloquer sont possibles, avec des motifs génériques.
- **2** — le niveau 1, plus un unmatch silencieux et immédiat, plus des motifs couvrant chantage et images intimes, mineur, usurpation et violence.
- **3** — le niveau 2, plus un accusé de réception qui dit ce qui a été fait, une priorisation des motifs graves dans la file de modération, et une sanction qui porte sur toutes les discussions du compte visé.

**Où regarder.** VU : `public/app.js:1107-1131` (popup « Signaler et bloquer », deux motifs seulement : `money` et `behavior` ; promesse « Un modérateur vérifie sous 24 h » à `:1114`). VU : `server/routes.js:441-449` (`store.block` n'est appelé que depuis la route de signalement ; `notifyAdmin` envoie un message texte sans identifiant actionnable). VU : aucun unmatch dans `server/routes.js` (`store.deleteUser` supprime les matchs, mais c'est la suppression de compte, `server/store.js:75-92`).

---

### C16 — Filtre anti-arnaque : les deux taux, et ce qui suit un blocage

**Mesure.** Passer un corpus de 200 à 300 messages du quotidien camerounais et 20 formulations d'arnaque réalistes. Relever **les deux** taux : faux positifs et contournement. Vérifier ce que déclenche un blocage côté modération et côté compte.

**État de l'art.** SOURCE (connaissance) : classification automatique continue, avertissement avant envoi, demande de retour au destinataire, score de risque par compte, escalade automatique. SOURCE (secondaire, source primaire non consultée) : Meta a déclaré en 2025 avoir supprimé plus de 100 000 comptes liés à des réseaux coordonnés d'arnaque sentimentale, en nommant le Cameroun parmi les pays concernés. Limite : chiffre indicatif, à ne pas republier sans revérification. Enseignement sûr et qualitatif : l'adversaire est organisé et local, il passe la vérification par selfie avec son propre visage.

**Minimum acceptable.** Blocage de la sollicitation financière, message qui dit quoi faire, remontée du blocage à la modération, et un taux de faux positifs mesuré et tenu bas.

- **0** — aucun filtre, ou un filtre dont le taux de faux positifs n'a jamais été mesuré.
- **1** — filtre par motifs, blocage silencieux, message générique qui ne dit pas quoi faire.
- **2** — le niveau 1, plus un message qui nomme la **catégorie** en cause (argent, contact) et propose une reformulation sans révéler le motif exact déclenché, plus une remontée du blocage à la modération.
- **3** — le niveau 2, plus un score de risque par compte, une escalade automatique au-delà d'un seuil, et une protection qui ne s'arrête pas au déblocage des contacts.

**Où regarder.** VU : `server/antiscam.js:14-30` (15 motifs « argent »), `:32-40` (7 motifs « contact »), `:42-56` (`checkMessage` renvoie un message qui ne dit pas quoi corriger, et ne remonte rien). VU : `server/routes.js:374-375` (appel du filtre, réponse 422). VU : `server/config.js:35` (`contactUnlockAfter: 10`).
MESURÉ (dossier de mesures §9) : sur 20 messages légitimes du quotidien camerounais, 3 bloqués à tort ; sur 9 formulations d'arnaque courantes, 3 passent. Limite : échantillon trop petit pour un taux ; à rejouer sur 200 à 300 messages avant de noter.

**Tension de règle.** CLAUDE.md §5.11 exige que les erreurs disent quoi faire. Dire précisément **quel mot** a déclenché le blocage apprend le contournement à un adversaire organisé. Le niveau 2 résout la tension : nommer la catégorie et proposer une reformulation, jamais le motif exact.

---

### C17 — Notifications, rappels et volume

**Mesure.** Sur une semaine, avec un compte peu actif, compter les notifications par jour et par motif. Vérifier la limitation par discussion, le comportement quand la personne est déjà en train de lire, le lien profond vers le bon écran, l'existence d'un réglage par type, et le comportement quand l'envoi échoue.

**État de l'art.** SOURCE (connaissance) : notification sur événement réciproque uniquement, limitation par conversation, lien profond, réglage fin par type. SOURCE (consultée) : les conditions développeurs de la plateforme Telegram interdisent explicitement de harceler les utilisateurs avec des messages non sollicités. SOURCE (secondaire) : limites d'envoi du Bot API relayées autour de 1 message par seconde et par conversation et 30 par seconde au total, avec une erreur 429 assortie d'un `retry_after` — valeurs approximatives et non contractuelles.

**Minimum acceptable.** Aucune notification de pur réengagement déguisée en événement social. Limitation par discussion. Lien profond fiable. Possibilité de couper. Un échec d'envoi ne consomme pas le droit d'envoyer.

- **0** — notifications d'engagement agressives, ou aucune notification là où un événement réel s'est produit.
- **1** — notifications sur événements réels, mais sans limitation ou avec un lien profond qui n'ouvre pas le bon écran.
- **2** — événements réels, limitation par discussion, lien profond fiable vers l'écran concerné, et pas de notification si la personne est en train de lire.
- **3** — le niveau 2, plus un réglage par type accessible dans l'app, une gestion de l'erreur 429 avec reprise, et un journal permettant de savoir qui est injoignable.

**Où regarder.** VU : `server/bot.js:18-36` (`notify` : throttle par clé, 2 minutes par défaut ; `lastNotifiedAt` écrit **avant** l'envoi ; erreur Telegram réduite à un `console.warn` sans lecture de `retry_after`), `:9-13` (`appUrl` construit le lien profond). VU : `server/routes.js:378` (pas de notification si la personne regarde la discussion), `:311` et `:407` (« tu as plu à quelqu'un », une fois par 24 h). VU : `public/app.js:793-840` (écran `me`) contient un test de notification mais aucun réglage par type.
MESURÉ (dossier de mesures §5) : `/?dev_user=9200&screen=safety` aboutit sur l'écran Découvrir — le paramètre `screen` n'est honoré que pour une partie des écrans, alors que les notifications l'utilisent.

---

### C18 — Coût en data

**Mesure.** Octets transférés à la première ouverture, aux ouvertures suivantes (effet du cache), par heure d'app ouverte et inactive, par heure de discussion ouverte, et par écran de découverte avec photos. Exprimer chaque valeur en pourcentage d'un forfait de référence.

**État de l'art.** SOURCE (consultée) : budgets 2026 au 75e percentile des appareils et réseaux — réseau de référence 9 Mbit/s descendant, 3 Mbit/s montant, 100 ms de latence ; appareil de référence Samsung Galaxy A24 4G ou équivalent MediaTek Helio G99 ; pour un chargement en 3 s, page peu chargée en JS : 2,0 Mio au total dont 0,3 Mio de JS. SOURCE (secondaire) : mécaniques de référence — plafond de consommation réglable par l'utilisateur (Spotify Lite, environ 10 Mo contre environ 90 Mo pour l'app complète), moins de traitement client et plus de travail serveur avec une stratégie d'images différente (Facebook Lite), paquet de 1,4 Mo (Pinterest Lite). SOURCE (secondaire, indicatif) : ancrage local — 500 FCFA achètent de l'ordre de 500 à 750 Mo selon l'opérateur. Limite : aucune de ces apps n'est une app de rencontres, et les chiffres locaux viennent d'extraits de recherche non revérifiés ; ils servent d'unité de compte, pas d'objectif.

**Minimum acceptable.** Compression HTTP active. Première ouverture sous 150 Ko transférés. Ouvertures suivantes sous 20 Ko grâce au cache. Coût horaire du temps réel mesuré et borné. Images compressées et chargées à la demande.

- **0** — le coût n'a jamais été mesuré, ou les ressources sont servies non compressées.
- **1** — léger par accident (aucune bibliothèque front) mais jamais mesuré ni borné.
- **2** — léger par conception et mesuré : compression active, cache efficace, photos à la demande, coût horaire du temps réel connu.
- **3** — le niveau 2, plus un mode économie explicite qui supprime réellement tout téléchargement d'image sur tous les écrans, plus un compteur ou un plafond visible par l'utilisateur en mégaoctets.

**Où regarder.** MESURÉ par moi le 11 septembre 2026, commande `for f in public/app.js public/styles.css public/ui.js public/tg.js public/index.html; do raw=$(wc -c < "$f"); gz=$(gzip -9 -c "$f" | wc -c); echo "$f brut=$raw gzip=$gz"; done` — sortie : `app.js brut=65031 gzip=19129`, `styles.css brut=39651 gzip=8881`, `ui.js brut=9866 gzip=3668`, `tg.js brut=8897 gzip=3234`, `index.html brut=1929 gzip=1044`. Total : 125 374 o bruts, 35 956 o gzippés.
MESURÉ par moi, commande `node -e "const p=require('./package.json');console.log(JSON.stringify(p.dependencies))"` — sortie : `{"dotenv":"^16.4.5","express":"^4.21.2","grammy":"^1.35.0","qrcode":"^1.5.4"}`. Aucun middleware de compression.
MESURÉ (dossier de mesures §3) : réponse de sondage sans nouveau message, 449 o ; discussion ouverte une heure, environ 702 Ko dont 308 Ko d'en-têtes ; app ouverte une heure sans discussion, environ 68 Ko.
VU : `public/app.js:126` (sondage `/summary` toutes les 20 s), `:583` (état `pending` toutes les 5 s), `:730` (discussion toutes les 4 s), `:1045` (la discussion s'arrête si `document.hidden`) contre `:168-180` (le rafraîchissement des compteurs ne fait pas cette vérification). VU : `public/app.js:19` et `:191, 207, 256, 375` (économie de data), `server/routes.js:210` (`Cache-Control: private, max-age=3600` sur les photos), `server/routes.js:358-367` (la réponse de sondage renvoie le profil complet de l'autre et les rendez-vous à chaque appel, seuls les messages sont incrémentaux).

---

### C19 — Résilience réseau et états d'erreur

**Mesure.** Sur chacun des 13 écrans : couper le réseau pendant une requête, puis au repos. Relever l'état affiché, le message, la possibilité de réessayer sans ressaisie, et le comportement au retour du réseau. Vérifier qu'un double appui ne produit pas deux actions.

**État de l'art.** SOURCE (connaissance) : file d'attente locale et renvoi automatique, indicateur d'état par message (envoyé, en attente), écran hors ligne utile. SOURCE (connaissance) : budgets RAIL — réponse visible à une interaction en moins de 100 ms, 16 ms par image d'animation, blocs de travail en temps mort sous 50 ms. Limite : ces seuils sont des budgets de laboratoire, pas des mesures de terrain.

**Minimum acceptable.** Chaque écran a un état de chargement et un état d'erreur réseau distinct d'une erreur serveur, avec un bouton réessayer. Aucun message perdu en silence. Le clavier ne se ferme jamais pendant la frappe.

- **0** — erreurs silencieuses, écrans blancs, squelettes figés, ou boutons actifs qui ne font rien.
- **1** — message d'erreur générique, sans réessai, ou réessai qui perd la saisie.
- **2** — état de chargement et état d'erreur actionnables sur tous les écrans, réessai sans perte, rattrapage des messages au retour du réseau.
- **3** — le niveau 2, plus une file d'attente locale avec renvoi automatique, un indicateur d'état par message, et un écran hors ligne utile.

**Où regarder.** VU : `public/index.html:10` (SDK Telegram chargé en script bloquant dans le `<head>`, sans `defer` ni `async`), `:24` (le contenu de démarrage n'est jamais peint tant que l'analyse du HTML est arrêtée). VU : `public/app.js:65` (message « Pas de connexion. Vérifie ton réseau et réessaie. ») et `:140` (écran d'erreur qui distingue réseau et serveur), `:1053` (la boucle de discussion avale ses erreurs). VU : CLAUDE.md §5.16 impose de ne jamais reconstruire le champ de saisie pendant la frappe ; `public/app.js:1035` ne reconstruit que `#messages`.
MESURÉ (dossier de mesures §6) : réseau coupé, le navigateur affiche sa propre page d'erreur ; aucun service worker, aucun cache applicatif, aucun message de l'app.

---

### C20 — Accessibilité et lisibilité sur téléphone d'entrée de gamme

**Mesure.** Mesurer les tailles **rendues** de toutes les cibles tactiles, pas les règles CSS déclarées. Calculer les contrastes en thème clair, thème sombre et thème personnalisé défavorable. Vérifier les libellés de tous les champs et images. Vérifier `prefers-reduced-motion`. Vérifier qu'aucune action n'est accessible uniquement au balayage. Vérifier que le champ focalisé n'est jamais masqué par le bouton natif ou le clavier.

**État de l'art.** SOURCE (consultée via résultats de recherche) : WCAG 2.2 niveau AA, recommandation W3C du 5 octobre 2023 — SC 2.5.8 cible d'au moins 24 × 24 px CSS, SC 1.4.3 contraste texte 4,5:1 (3:1 pour le grand texte), SC 1.4.11 contraste 3:1 pour les composants et éléments graphiques porteurs de sens, SC 2.4.11 focus non entièrement masqué. SOURCE (connaissance, à confirmer avant citation) : seuils de plateforme plus exigeants, de l'ordre de 48 dp côté Android et 44 pt côté iOS. SOURCE (consultée) : les recommandations de conception des mini apps Telegram exigent que tous les champs et images portent des libellés, que les zones sûres soient respectées, et que les animations soient réduites selon la classe de performance de l'appareil Android.

**Minimum acceptable.** Aucune cible sous 24 × 24 px. Aucun texte sous son seuil de contraste en thème clair. Tous les champs et images libellés. Toute action au balayage doublée d'un bouton.

- **0** — des cibles sous 24 px et des échecs de contraste en thème clair, non tracés.
- **1** — conformité partielle, écarts connus mais non corrigés ni suivis.
- **2** — conformité WCAG 2.2 AA vérifiée en thème clair **et** sombre, libellés complets, alternative au balayage.
- **3** — le niveau 2, plus des cibles à 48 dp, `prefers-reduced-motion` respecté, dégradation selon la classe de performance Android, et zones sûres complètes (haut, bas, gauche, droite).

**Où regarder.** MESURÉ (dossier de mesures §4) : 9 éléments interactifs sur 11 sous 44 × 44 px sur l'écran Découvrir — onglets 90 × 36, pilule de ville 118 × 32, bascule Cartes/Liste 83 × 26, bouton Signaler 148 × 34.
MESURÉ (dossier de mesures §13) : en thème clair, âge sur la carte 1,91 pour un seuil de 3,0 ; initiale d'avatar 1,12 pour 3,0 ; « 19 restants » 3,70 pour 4,5 ; intitulés de section 4,17 pour 4,5, répété cinq fois ; tampon « J'aime » 2,90 pour 3,0. En thème sombre, un seul écart.
VU : `public/styles.css:74` (seule la zone sûre basse est utilisée), `public/ui.js` (geste de balayage des cartes).

---

### C21 — Monétisation, parité et absence de piège

**Mesure.** Dérouler le parcours cœur sans payer. Relever tout prix, tout lien de paiement et toute incitation, en notant l'origine de session dans laquelle ils apparaissent. Vérifier l'existence de `/paysupport` et d'une procédure de remboursement écrite.

**État de l'art.** SOURCE (secondaire, communiqué primaire non consulté) : le marché monétise moins d'utilisateurs à revenu par payeur plus élevé — Match Group T4 2025, payeurs en baisse de 5 %, revenu par payeur en hausse de 7 %. SOURCE (consultée) : les conditions développeurs Telegram imposent que les biens et services numériques soient payés exclusivement en Stars (devise `XTR`), interdisent les prestataires de paiement tiers pour ces biens, et exigent que le bot réponde à `/paysupport` ; le développeur peut rembourser lui-même. SOURCE (secondaire, indicatif) : ancrage local, SMIG relayé à 60 000 FCFA par mois ; commissions d'agrégateurs mobile money de l'ordre de 1 à 4 %. Limite majeure : aucun repère de consentement à payer pour une app de rencontres au Cameroun n'a été trouvé — toute grille de prix reste une hypothèse à tester, jamais un objectif.

**Minimum acceptable.** Parcours cœur entièrement gratuit, y compris tout ce qui relève de la sécurité. Pas d'abonnement à reconduction tacite. Prix et durée affichés avant tout engagement. Aucun prix en FCFA ni lien externe de paiement atteignable quand l'origine est Telegram.

- **0** — une fonction de sécurité ou de réciprocité est payante, ou un prix en FCFA ou un lien de paiement externe est atteignable depuis Telegram.
- **1** — cœur gratuit, mais modèle non défini, ou prix affiché sans durée ni conditions claires.
- **2** — cœur gratuit, pass à durée fixe, prix et durée affichés avant l'engagement, aucune reconduction tacite, cloisonnement par origine respecté.
- **3** — le niveau 2, plus la parité Stars / mobile money, `/paysupport` en place, une procédure de remboursement écrite et testée, et l'accessibilité réelle du moyen de paiement vérifiée auprès de la cible.

**Où regarder.** VU : aucune route ni mention de paiement dans `server/` (aucune occurrence de `XTR`, `invoice`, `paysupport`) ; `server/bot.js:172-175` ne publie que `/start` et `/aide`. VU : `server/bot.js:107` (« sans jamais te demander d'argent ») et `:116` (« ne te demandera jamais d'argent ») — formulations à confronter à l'existence future d'un pass payant.

**Tension de règle.** La recette la plus répandue du marché — verrouiller « qui t'a aimé » derrière un paywall — est techniquement possible en Stars, mais elle contredit la promesse anti-arnaque de Odo et rendrait payant le seul signal qui protège d'un vivier vide. CLAUDE.md §5.7 interdit par ailleurs tout autre moyen de paiement dans la mini app, et §5.9 interdit la publicité tierce dans les écrans de rencontre. Alternative proposée : garder la réciprocité gratuite (niveau 2 de C10), monétiser le confort (filtres élargis, pass de visibilité) et le B2B (lieux partenaires payés au rendez-vous confirmé), comme la feuille de route le prévoit déjà.

---

### C22 — Mesure produit : ce que l'équipe peut réellement voir

**Mesure.** Reconstituer l'entonnoir en neuf étapes datées : ouverture, profil enregistré, selfie envoyé, décision de modération, premier like émis, premier match, premier message envoyé, rendez-vous proposé, arrivée confirmée. Pour chaque étape, dire si elle est mesurable et avec quel champ exact. Vérifier l'exclusion des profils de démonstration et du mode développement.

**État de l'art.** SOURCE (connaissance) : AARRR pour le volume. SOURCE (consultée) : HEART et le passage Objectifs → Signaux → Métriques, Rodden, Hutchinson et Fu, CHI 2010, Google — la colonne « réussite de la tâche » est celle qui manque à AARRR. SOURCE (secondaire, pages sources inaccessibles, 403 et 429) : repères de rétention du secteur des rencontres, J1 autour de 24 à 26 %, J30 autour de 5 à 7 %. Limite explicite : ces valeurs viennent d'apps installées depuis une boutique, sur des marchés non comparables ; elles ne doivent jamais servir d'objectif ni de critère de réussite. Comparer Odo à lui-même dans le temps.

**Minimum acceptable.** Chaque étape de l'entonnoir est horodatée. Le délai de modération est mesurable. Les profils de démonstration sont exclus de tout calcul. Une contre-métrique de sécurité est suivie.

- **0** — aucune instrumentation ; aucun taux calculable.
- **1** — les horodatages métier existent (création de compte, balayage, message) mais les étapes clés ne sont pas datées : envoi du selfie, décision de modération, étapes du formulaire.
- **2** — entonnoir complet horodaté, profils de démonstration et comptes de développement exclus, délai de modération mesuré et suivi.
- **3** — le niveau 2, plus une métrique de valeur unique définie avec ses métriques d'entrée et ses contre-métriques (signalements, blocages, suppressions), plus une boucle de résultat réel — le rendez-vous a-t-il eu lieu — qui alimente au moins la modération.

**Où regarder.** MESURÉ par moi, commande `grep -rniE "analytics|gtag|posthog|amplitude|mixpanel|track\(" server/ public/` — sortie vide : aucune instrumentation.
VU : `server/store.js:51-61` (`createdAt` existe), `server/routes.js:128` et `server/bot.js:88` (`verification` est une chaîne écrasée, aucun horodatage d'envoi ni de décision), `server/store.js` (`lastActiveAt` écrasé à chaque activité, aucun historique d'ouvertures). VU : `server/seed.js` et `server/config.js:28-29` (`AUTO_APPROVE`, `SEED_DEMO`) ; les profils de démonstration portent `demo: true` (`server/routes.js:47`) mais leurs likes, matchs et messages sont écrits dans les mêmes tables.

---

### C23 — Langue, ton et messages d'erreur

**Mesure.** Passer tous les textes visibles au crible. Confronter la langue de l'interface aux villes proposées à l'inscription. Relever chaque message d'erreur et vérifier qu'il dit ce qui se passe **et** quoi faire. Chercher les textes de développement atteignables par un utilisateur réel.

**État de l'art.** SOURCE (consultée) : Grindr annonce pour 2026 la traduction des conversations en temps réel ; la langue suivie sur celle de la plateforme avec choix manuel dans le profil est la norme. Limite : la traduction automatique est hors de portée en coût data et en dépendances pour cette cible.

**Minimum acceptable.** La langue de l'interface couvre les villes proposées à l'inscription. Chaque message d'erreur dit ce qui se passe et quoi faire. Aucun texte de développement n'est visible par un utilisateur réel.

- **0** — messages d'erreur techniques ou sans consigne, ou textes de développement visibles par un utilisateur réel.
- **1** — ton conforme, mais des messages d'erreur qui ne disent pas quoi faire, ou des villes proposées dans une langue que leurs habitants ne lisent pas.
- **2** — ton irréprochable au regard de CLAUDE.md §5.10 et §5.11, tous les messages d'erreur actionnables, et la liste des villes cohérente avec la langue de l'interface.
- **3** — le niveau 2, plus au moins une seconde langue, une bascule dans le profil, et la langue de Telegram prise par défaut.

**Où regarder.** VU : `server/config.js:56` (`CITIES` inclut Buea, ville anglophone) contre une interface entièrement en français. VU : `public/tg.js:193` (texte de développement « Hors Telegram : colle le contenu du QR code » atteignable sur un Telegram antérieur à la version 6.4). VU : `server/routes.js:433` (bon exemple : « Ce code ne correspond pas à … Scanne le code posé sur ta table. ») contre `server/antiscam.js:46` (contre-exemple : le message ne dit pas quoi corriger).

---

### C24 — Discrétion, vie privée et transparence

**Mesure.** Vérifier ce qu'un tiers qui emprunte le téléphone voit : nom du bot dans la liste des conversations, aperçu des notifications sur écran verrouillé, libellé du raccourci ajouté à l'écran d'accueil. Relever tout ce qui est exposé aux autres membres. Compter les taps pour supprimer son compte. Vérifier l'existence et l'accessibilité des pages de confidentialité et de conditions. Vérifier que la suppression efface réellement tout.

**État de l'art.** SOURCE (connaissance) : pas de position en temps réel entre membres, pas de statut « en ligne » à la seconde, pas d'identifiant de messagerie exposé. SOURCE (consultée) : les conditions développeurs Telegram exigent une politique de confidentialité facilement accessible et déclarée, et une collecte limitée au strict nécessaire. SOURCE (secondaire) : loi camerounaise n° 2024/017, période de mise en conformité souvent citée jusqu'au 23 juin 2026 — le texte officiel n'a pas été lu ; ne citer aucun numéro d'article avant lecture.

**Minimum acceptable.** Aucun identifiant de messagerie ni numéro exposé aux autres. Activité floutée. Suppression complète depuis l'app en moins de cinq taps. Pages de confidentialité et de conditions publiées et liées depuis l'accueil.

- **0** — la suppression n'est pas possible en autonomie, ou les pages publiques sont absentes, ou une donnée d'identité est exposée aux autres membres.
- **1** — la suppression existe mais reste incomplète, ou les pages existent sans être liées depuis l'app.
- **2** — suppression complète et vérifiée, pages publiées et liées depuis l'accueil, activité floutée, aucune donnée Telegram exposée.
- **3** — le niveau 2, plus une durée de conservation écrite pour chaque donnée, une discrétion vérifiée sur téléphone partagé, et un registre des traitements tenu.

**Où regarder.** VU : `server/routes.js:29-54` (`publicProfile` n'expose ni pseudo ni numéro), `:19-26` (activité arrondie en tranches 15 min / 24 h / 7 j), `:238` (avant le match, seule la tranche « cette semaine » est montrée). VU : `server/store.js:75-92` (`deleteUser` purge utilisateurs, balayages, matchs, messages, blocages, rendez-vous et fichiers — mais jamais `db.reports`). VU : `server/index.js:56` (`app.get('*', renderIndex)`) : une adresse `/confidentialite` renvoie 200 en affichant la mini app, il n'existe aucune page de confidentialité ni de conditions.

---

## 2. Fiches par application

Pour chaque mécanique retenue : **ce qu'elle résout**, **ce qu'elle coûte**, **transposable à Telegram et à un forfait data compté**.

### 2.1 Badoo — le concurrent réel à Yaoundé

SOURCE (secondaire, à revérifier avant toute citation publique) : Badoo est décrit comme particulièrement installé dans les pays francophones d'Afrique, dont le Cameroun, là où Tinder domine l'Afrique anglophone. Revenus d'environ 182 M$ en 2025 et abonnés en baisse de 10,4 % à 1,2 million, relayés par un agrégateur. Modèle historique : découverte gratuite très large, crédits à l'acte, faible barrière à l'entrée, vérification photo historiquement légère.
Limite de comparabilité : Badoo dispose d'un vivier installé et d'une décennie d'acquisition. Aucune comparaison de volume n'est légitime. La comparaison utile est une comparaison de **coût d'entrée perçu**.

**Mécanique A — entrée sans friction et vivier immédiatement visible.**
- Résout : le vide des premières minutes. On voit du monde avant de donner quoi que ce soit.
- Coûte : un taux d'arnaque et de faux profils que l'utilisateur absorbe lui-même. C'est exactement le coût que Odo prétend supprimer.
- Transposable : partiellement, et c'est le point d'arbitrage central de l'audit. Un aperçu sans photo (prénom, âge, quartier, intention, nombre de personnes vérifiées dans la ville) est transposable, ne coûte presque aucune data, et ne casse pas la promesse. Montrer des photos avant vérification n'est pas transposable : cela ouvrirait l'aspiration des photos par des comptes non vérifiés.

**Mécanique B — crédits à l'acte (voir qui t'a aimé, mise en avant).**
- Résout : la monétisation d'un public à faible pouvoir d'achat, par petits montants, sans abonnement.
- Coûte : une frustration entretenue, et la transformation d'un signal utile en produit d'appel.
- Transposable : non en l'état. CLAUDE.md §5.7 impose les Stars pour tout bien numérique dans la mini app, et l'achat de Stars passe par les boutiques d'applications, ce qui n'est pas praticable pour la cible. Alternative : garder « qui t'a aimé » gratuit et vendre un pass à durée fixe (voir C21).

**Ce que Odo peut défendre face à Badoo.** Ni le vivier ni le nombre de fonctions. Seulement le taux d'arnaque perçu, la discrétion (pseudo et numéro jamais exposés, VU `server/routes.js:29-54`) et le rendez-vous en lieu partenaire avec confirmation d'arrivée. Corollaire d'audit : **chaque friction ajoutée doit être payée par une promesse de sécurité visible à l'écran, au moment où la friction est imposée**. Sinon la personne repart sur une app qui ne demande rien.

### 2.2 Tinder

SOURCE (consultée) pour Face Check et les Modes ; SOURCE (consultée) pour Share My Date.

**Face Check — vidéo-selfie obligatoire, empreinte non réversible conservée.**
- Résout : la photo volée, le compte en double, et le retour d'un banni, en une seule mécanique.
- Coûte : un traitement biométrique à déclarer, une dépendance à un modèle de vivacité, et une friction supplémentaire à l'inscription.
- Transposable : le principe oui, la mise en œuvre partiellement. La capture en direct et l'expiration du geste sont transposables à coût nul. L'empreinte anti-doublon est transposable techniquement (P1-1) mais bute sur la base légale camerounaise, non tranchée. Coût data : une image, pas une vidéo — la variante vidéo est trop coûteuse sur forfait compté.

**Modes (Double Date, College) — modes d'usage commutables en haut de l'écran.**
- Résout : la cohabitation de publics différents sans les mélanger, et la lisibilité du choix.
- Coûte : le fractionnement du vivier, redoutable quand le vivier est petit.
- Transposable : l'idée valide l'architecture d'intentions de Odo. Mais sur un vivier de bêta fermée, multiplier les modes vide chaque mode. À transposer comme **lisibilité** (l'intention est visible et changeable) et non comme **multiplication**.

**Share My Date — partage du plan de rendez-vous avec un proche.**
- Résout : le seul vrai filet de sécurité hors ligne du premier rendez-vous.
- Coûte : peu, une fois le cycle de vie du rendez-vous en place.
- Transposable : oui, et sous une forme meilleure ici — le bot envoie à un contact Telegram désigné le lieu, l'heure et le prénom, sans photo ni position continue. Coût data nul côté utilisateur. Prérequis : le cycle accepté / refusé / annulé (C13).

### 2.3 Hinge

SOURCE (consultée, fiche encyclopédique) pour le like ciblé, les 8 likes par jour, Gale-Shapley, We Met et Your Turn ; SOURCE (secondaire, presse spécialisée) pour Direct to Date.

**Like ciblé avec commentaire.**
- Résout : le premier message qui part de zéro, et donc le silence après le match.
- Coûte : très peu — un champ de plus dans la requête de like, un affichage de plus dans l'écran de match.
- Transposable : oui, c'est le levier le moins cher et le plus rentable du benchmark pour Odo. Le profil porte déjà un couple question / réponse (VU `server/routes.js:39-40`) ; le like est binaire (VU `:290-314`). Coût data : quelques dizaines d'octets. Bénéfice secondaire : un commentaire donne à la modération un signal de qualité qu'un like binaire ne donne pas.

**Your Turn — rappel du tour de parole.**
- Résout : le ghosting et les conversations mortes.
- Coûte : une notification de plus, donc un risque de saturation.
- Transposable : oui, à condition d'être limité en fréquence et non culpabilisant. L'ordre « qui attend ta réponse » existe déjà côté profils (VU `server/routes.js:268-270`) et manque côté discussions (VU `:327-338`). Coût data nul, c'est un tri.

**We Met — confirmation privée du premier rendez-vous.**
- Résout : l'absence de signal de résultat réel ; permet de classer sur autre chose que la photo.
- Coûte : une question de plus, et un risque de non-réponse.
- Transposable : oui, et Odo dispose d'un signal plus fort que We Met — le check-in par QR code dans un lieu partenaire est une preuve de présence, pas une déclaration. VU `server/routes.js:428-438` : ce signal ne sert aujourd'hui qu'à notifier l'autre personne. C'est l'actif le plus sous-exploité du produit.

**Direct to Date — disponibilités partagées dès le match.**
- Résout : la lenteur entre le match et la rencontre réelle.
- Coûte : une pression possible sur qui ne veut pas aller vite.
- Transposable : oui, et cela confirme la thèse produit de Odo. Mais l'ordre compte : proposer un rendez-vous n'a de sens que si on peut le refuser (C13).

### 2.4 Bumble

SOURCE (consultée) : remplacement du swipe par une recommandation conversationnelle sur marchés sélectionnés au T4 2026 ; assouplissement de la règle obligeant les femmes à écrire en premier ; vérification par pièce d'identité gouvernementale déployée dans 11 pays en mars 2025 ; revenus en baisse de 10 % au T3 2025 et payants en baisse de 16 % à 3,6 millions.

**Abandon du swipe comme dogme.**
- Résout : la lassitude du balayage et le classement par photo.
- Coûte : une refonte complète, et une dépendance à un modèle de langage.
- Transposable : l'IA conversationnelle, non — hors de portée en coût data et en dépendances. L'enseignement transposable est plus simple : la vue liste de Odo (VU `server/routes.js:250-274`) n'est pas un secours, c'est la direction du marché. À assumer comme mode principal possible, pas comme repli.

**Règle de genre imposée, puis assouplie.**
- Résout : le déséquilibre de sollicitation.
- Coûte : une contrainte que l'inventrice de la règle est en train d'abandonner après une chute d'usage.
- Transposable : à ne pas copier sans test. Toute contrainte de genre ajoutée à Odo doit être testée, jamais reprise par autorité.

**Vérification par pièce d'identité gouvernementale.**
- Résout : l'usurpation d'identité de façon plus forte que le selfie.
- Coûte : des documents inégalement détenus, et une base de données d'identité qui devient une cible.
- Transposable : **à écarter** pour la cible camerounaise. Le selfie avec geste reste le bon compromis.

### 2.5 Happn

SOURCE (consultée) : rachat par Hello Group en septembre 2025 avec intention annoncée d'expansion en Asie et en Afrique ; lancement de « Perfect Date » (jusqu'à cinq lieux de rendez-vous proposés selon les intérêts communs, via Foursquare).

**Perfect Date — suggestion de lieux de rendez-vous.**
- Résout : le blocage au moment de choisir où se voir.
- Coûte : une dépendance à un référentiel de lieux et à un modèle de recommandation.
- Transposable : Odo fait déjà mieux, en dur — des lieux réels, négociés, avec un avantage commercial et un code de confirmation (VU `server/config.js:47-52`). Rien à copier ; en revanche l'annonce d'expansion africaine d'un acteur financé est un signal de calendrier.

**Croisement géographique en temps réel.**
- Résout : la pertinence par proximité physique.
- Coûte : l'exposition de la position, donc un risque direct pour les femmes.
- Transposable : **à écarter**. Le quartier déclaré (VU `server/routes.js:230`) est le bon substitut : aucune position demandée, coût data nul.

### 2.6 Coffee Meets Bagel

SOURCE (consultée) : petit nombre de profils du jour avec 24 heures pour décider ; conversation expirant au bout de 8 jours sauf prolongation ; premium environ 20 à 35 $ par mois ; partenariat d'un an avec SG Culture Pass à Singapour, février 2026, pour des premiers rendez-vous culturels.

**Rareté mise en scène comme sélection.**
- Résout : la fatigue du volume et la banalisation des profils.
- Coûte : rien, si la sélection est expliquée ; beaucoup, si elle est subie comme une pénurie.
- Transposable : oui, directement. Le quota de 20 de Odo (VU `server/config.js:36`) est aujourd'hui présenté comme une limite (VU `server/routes.js:295`) et non comme une sélection du jour. Coût data nul, c'est une question de formulation et de compteur.

**Péremption des conversations à 8 jours.**
- Résout : les matchs morts qui encombrent la boîte.
- Coûte : une perte sèche pour qui n'ouvre pas l'app tous les jours.
- Transposable : **à écarter** ici. Sur réseau instable et forfait compté, l'ouverture quotidienne n'est pas acquise. Alternative : marquer les discussions mortes et permettre de les retirer, sans les détruire (C12 niveau 3).

**Partenariat lieu et culture.**
- Résout : la monétisation sans toucher à l'utilisateur.
- Coûte : un travail commercial, pas un travail produit.
- Transposable : oui, c'est exactement le modèle B2B de la feuille de route (P2-1), déjà validé par un acteur établi ailleurs.

### 2.7 Boo

SOURCE (consultée) : appariement fondé sur la personnalité plutôt que sur la photo, communautés d'intérêts, vérification de profil, et lancement de « Group Dates » (former un groupe avec des amis, définir un objectif commun, matcher en équipe).

**Group Dates.**
- Résout : la peur du face-à-face avec un inconnu, et la légitimité sociale de la rencontre.
- Coûte : une complexité de coordination importante, et un vivier qu'il faut multiplier par le nombre de groupes.
- Transposable : l'idée valide le mode « sortie en duo » de Odo (VU `server/config.js:54`). Mais la convergence Boo / Tinder Double Date ne dit pas que c'est faisable à petit vivier. Décision d'audit à trancher : terminer le mode ou le retirer de l'inscription (CLAUDE.md §8 P1-7), car une intention proposée qui ne mène nulle part abîme la confiance au premier écran.

**Appariement par personnalité, pas par photo.**
- Résout : le classement par désirabilité visuelle.
- Coûte : un questionnaire long, donc un coût d'inscription élevé.
- Transposable : partiellement, et avec prudence — allonger le formulaire est le contraire de C02. Une variante bon marché existe : élargir le couple question / réponse et le rendre comparable, sans ajouter de questionnaire.

### 2.8 Muzz

SOURCE (connaissance, non revérifiée dans cette session — à rouvrir avant citation publique) : déclaration d'intention matrimoniale dès l'inscription, possibilité d'ajouter un chaperon qui voit la conversation, photo floutée ou visible seulement après accord, filtres sur des critères de vie.

**Chaperon.**
- Résout : la légitimité sociale et la sécurité perçue, dans un contexte où la famille pèse.
- Coûte : une intrusion forte dans la conversation, et un risque de contrôle.
- Transposable : pas tel quel. La variante adaptée est plus légère et meilleure ici : une personne de confiance **prévenue du rendez-vous**, qui ne lit rien (C14 niveau 3, feuille de route P1-2).

**Photo floutée jusqu'à accord.**
- Résout : l'exposition non désirée, notamment pour les femmes, et la discrétion vis-à-vis de l'entourage.
- Coûte : une découverte moins immédiate.
- Transposable : oui, et à coût data **négatif** : une photo non chargée est une photo non payée. Recoupe directement le mode économie de data déjà présent (VU `public/app.js:191, 207, 256`).

**Intention matrimoniale déclarée.**
- Résout : le malentendu sur ce que chacun cherche.
- Coûte : des champs supplémentaires sensibles (religion, projet de mariage).
- Transposable : oui, avec la limite absolue de CLAUDE.md §5.2 — jamais d'orientation ni d'ethnie, et la religion optionnelle et masquée par défaut (P1-4).

### 2.9 Facebook Dating

SOURCE (consultée pour l'annonce du 22 septembre 2025 : « Dating Assistant » et « Meet Cute » ; secondaire et indicatif pour les chiffres d'audience, non vérifiés sur une source primaire Meta).

**Greffe sur une audience déjà installée, sans inscription séparée.**
- Résout : le coût d'acquisition et la friction d'installation, qui sont les deux plus gros postes d'une app de rencontres.
- Coûte : l'identité liée au profil social réel, que beaucoup refusent.
- Transposable : Odo est **structurellement dans la même position** — greffé sur Telegram, sans installation, identité déjà présente, connexion sans mot de passe. Deux conséquences d'audit. Un : vérifier que cet avantage est réellement exploité et **dit à l'écran**, car c'est le seul argument de distribution face à Badoo. Deux : le point faible de Facebook Dating est l'argument inverse de Odo — ici, pseudo et numéro restent cachés (VU `server/routes.js:29-54`).
- Nuance qui coûte cher : la greffe Telegram est plus étroite que la greffe Facebook. SOURCE (secondaire) : WhatsApp et Facebook dominent l'usage camerounais, Telegram reste derrière. L'avant-parcours — la personne reçoit un lien et n'a pas Telegram — est une étape du parcours, pas un préalable acquis.

### 2.10 Grindr

SOURCE (consultée, page de feuille de route 2026) : « Smart Inbox » (la boîte priorise automatiquement selon des signaux de compatibilité), « Wingman » (description en langage naturel), traduction en temps réel, étagement premium.

**Smart Inbox — priorisation de la boîte de réception.**
- Résout : la boîte qui s'empile et les conversations perdues.
- Coûte : rien si elle est faite par tri simple, beaucoup si elle passe par un modèle.
- Transposable : oui, en version pauvre et sans IA — trier par « qui attend ta réponse » (C12). La brique existe déjà ailleurs dans le code de Odo. Coût data nul.

**Traduction en temps réel.**
- Résout : la barrière de langue dans la conversation elle-même.
- Coûte : un appel réseau par message, donc de la data et une dépendance.
- Transposable : **non** en l'état. Le signal utile est ailleurs : le multilingue est une fonction de rencontre, pas un confort. Cela appuie la priorité anglais et pidgin (P1-9), à traiter par des fichiers de traduction statiques, à coût data nul (C23).

**Carte de proximité et intention immédiate.**
- Transposable : **à écarter**, incompatible avec la promesse de sécurité et avec le cadre pénal local.

### 2.11 Deux acteurs de marchés à faible bande passante

Avertissement de comparabilité : aucune app de **rencontres** conçue pour la faible bande passante n'a été trouvée avec une source fiable. Les deux acteurs retenus ci-dessous sont des références d'ingénierie et de marché, pas des concurrents directs. Leurs mécaniques sont transposables ; leurs chiffres ne sont pas comparables.

**A — Facebook Lite (Meta).** SOURCE (secondaire) : paquet plus petit, moins de traitement côté client, plus de travail côté serveur, stratégie différente de chargement des images pour afficher du contenu vite sur connexion faible.
- Résout : l'abandon au premier chargement sur réseau lent, qui est le risque n° 1 mesuré chez Odo (MESURÉ, dossier §1).
- Coûte : un second chemin de rendu à maintenir.
- Transposable : oui, partiellement et sans second chemin. Odo n'a aucune bibliothèque front (MESURÉ ci-dessus : 35 956 o gzippés au total) ; le gain ne se joue donc pas sur le paquet mais sur trois points — activer la compression HTTP (absente, MESURÉ : aucune dépendance de compression), ne pas laisser un script tiers bloquer le premier rendu (VU `public/index.html:10`), et ne pas renvoyer le profil complet à chaque sondage (VU `server/routes.js:358-367`).

**B — Afro Introductions (Cupid Media), acteur de rencontre présent sur des marchés africains.** SOURCE (connaissance, non revérifiée dans cette session ; un prix kényan d'environ 2 500 shillings par mois est relayé par un extrait de recherche, marché non comparable au Cameroun).
- Mécanique : interface légère orientée web, découverte gratuite, messagerie payante.
- Résout : l'accès sans installation et sans magasin d'applications, sur des téléphones pleins.
- Coûte : la messagerie payante bloque le cœur du produit derrière un paywall, ce que la grille note 0 en C21.
- Transposable : l'orientation web sans installation est directement pertinente pour la version web prévue en P0-6 ; le paywall sur la messagerie ne l'est pas et contredirait le minimum acceptable de C21.

**Mécanique d'ingénierie complémentaire, empruntée hors rencontre.** SOURCE (secondaire) : Spotify Lite permet de fixer une limite de consommation data ; Pinterest Lite pèse 1,4 Mo sur Android.
- Résout : l'angoisse du forfait qui fond, qui est un motif de désinstallation à part entière.
- Coûte : un compteur à tenir côté client.
- Transposable : oui, sans dépendance nouvelle. Odo affiche « Léger en data » sur l'écran d'accueil (VU `public/app.js:449`) sans jamais chiffrer ni laisser régler. Un compteur en mégaoctets et un plafond sont la version aboutie du mode économie existant (C18 niveau 3).

---

## 3. Tensions entre la grille et les règles de CLAUDE.md

Six points où le standard du marché entre en conflit avec une règle interne. Dans chaque cas, la règle l'emporte et une alternative est proposée.

1. **C01 niveau 3 contre la promesse « tous les profils sont vérifiés ».** Montrer des profils avant vérification exposerait les photos des membres à des comptes non vérifiés. Alternative retenue dans la grille : l'aperçu de niveau 3 est **sans photo** (prénom, âge, quartier, intention, compteur de personnes vérifiées) ; les photos restent réservées aux comptes vérifiés.
2. **C06 niveau 3 contre CLAUDE.md §5.4 (minimisation) et la loi n° 2024/017.** L'empreinte faciale est une donnée biométrique dont la base légale n'est pas tranchée dans ce qui a été consulté. Alternative : viser le niveau 2, qui n'exige aucune biométrie — un état de compte sanctionné, une liste tenue par la modération, un effet sur toutes les discussions.
3. **C08 contre CLAUDE.md §5.2 (aucune donnée d'orientation).** La grille n'exige pas le filtrage par attirance et ne le proposera jamais. Alternative : expliquer à l'écran l'effet du filtre actuel, ce qui ne coûte aucune donnée nouvelle.
4. **C10 et C21 contre la recette dominante du marché.** Verrouiller « qui t'a aimé » est la principale source de revenu des concurrents. Alternative : réciprocité gratuite, monétisation du confort et du B2B, conformément à CLAUDE.md §5.9.
5. **C16 niveau 2 contre CLAUDE.md §5.11 (les erreurs disent quoi faire).** Nommer le mot exact qui déclenche un blocage entraîne l'adversaire. Alternative inscrite dans l'ancrage : nommer la catégorie et proposer une reformulation, jamais le motif exact.
6. **C18 niveau 3 contre CLAUDE.md §2 (pas de dépendance sans justification).** Un compteur de data et un plafond se font sans aucune dépendance nouvelle. La compression HTTP, en revanche, demande soit un middleware, soit des variantes pré-compressées servies par le serveur existant : c'est un arbitrage à instruire, pas une dépendance imposée par la grille.

---

## 4. Sources, fiabilité, et ce qui ne doit pas être cité

### 4.1 Sources consultées (pages ouvertes pendant la collecte)

Documentation officielle des mini apps Telegram ; conditions développeurs de la plateforme de bots Telegram ; documentation des paiements en Stars ; annonces Tinder (Face Check, octobre 2025 ; Modes, 10 septembre 2025) ; fiche encyclopédique Hinge ; annonces Bumble (refonte T4 2026, vérification par pièce d'identité mars 2025) ; feuille de route Grindr 2026 ; annonces Happn (rachat Hello Group septembre 2025, Perfect Date) ; Coffee Meets Bagel (sélection du jour, péremption, partenariat février 2026) ; Boo (Group Dates) ; Meta / Facebook Dating (annonce du 22 septembre 2025) ; enquête GeoPoll sur la rencontre en ligne en Afrique de l'Est et de l'Ouest (novembre 2023, Ghana, Kenya, Ouganda, 4 259 répondants) ; heuristiques de Nielsen (page NN/g mise à jour le 30 janvier 2024) ; HEART et Goals-Signals-Metrics (Rodden, Hutchinson et Fu, CHI 2010, Google) ; System Usability Scale et barème Sauro et Lewis ; WCAG 2.2 AA (via résultats de recherche) ; budgets de performance 2026 au 75e percentile (page consultée) ; DSA article 17 et base de transparence ; rapport Ofcom 2026 sur l'assurance d'âge ; ISO/IEC 30107-3 et laboratoires accrédités NVLAP.

### 4.2 Sources secondaires (extraits de recherche, pages primaires non ouvertes)

Parts de marché de Badoo en Afrique francophone ; revenus et abonnés de Badoo ; audience de Facebook Dating ; résultats financiers Match Group T4 2025 ; repères de rétention du secteur des rencontres ; statistiques de fraude d'identité et de fraude sentimentale ; prix de la data et couverture réseau au Cameroun ; parc de smartphones africain ; mobile money et agrégateurs camerounais ; SMIG et ancrages de prix ; place de Telegram face à WhatsApp au Cameroun ; limites d'envoi du Bot API ; valeur d'une Star ; loi camerounaise n° 2024/017 et ses analyses.

### 4.3 Connaissance du modèle, non revérifiée dans cette session

Mécaniques de Muzz ; Afro Introductions ; pratiques sectorielles de blocage sans signalement, d'unmatch silencieux, de conservation d'empreinte d'appareil, de priorisation de la file de modération, d'orientation vers des ressources externes ; seuils de cibles tactiles des plateformes Android et iOS ; budgets RAIL ; sécurité des femmes dans l'espace public à Yaoundé (aucune source locale trouvée).

### 4.4 À ne jamais réutiliser sans rouvrir la source primaire

- Le taux de 97,37 % de l'enquête GeoPoll : artefact d'échantillon auto-sélectionné, mesuré au Ghana, au Kenya et en Ouganda, jamais au Cameroun. Ce n'est pas une pénétration de marché.
- Les repères de rétention du secteur (J1 autour de 24 à 26 %, J30 autour de 5 à 7 %) : pages sources inaccessibles au moment de la collecte ; apps installées depuis une boutique, marchés non comparables. Jamais comme objectif.
- Les parts de marché de Badoo en Afrique francophone, les revenus de Badoo, l'audience de Facebook Dating, les statistiques Sumsub et IC3, la valeur d'une Star en dollars.
- Tout numéro d'article de la loi camerounaise n° 2024/017 : les numéros réunis viennent d'un résumé secondaire, pas du texte officiel. Deux sources donnent des montants de sanction qui ne concordent pas.
- Le chiffre interne de Tinder sur la réduction de l'exposition aux mauvais acteurs : communication d'entreprise, non auditée indépendamment.

### 4.5 Trous documentaires assumés

Il n'existe, dans ce qui a été consulté, **aucune donnée chiffrée fiable sur le marché camerounais de la rencontre en ligne**, aucun repère de consentement à payer local, et aucune source locale sur la sécurité des femmes dans l'espace public à Yaoundé. La conséquence est une consigne, pas un regret : Odo doit produire ses propres chiffres pendant la bêta plutôt qu'en emprunter. C'est précisément ce que mesure le critère C22.

---

## 5. Liste compacte des 24 critères

| n° | intitulé | ce qui vaut 3 |
|---|---|---|
| C01 | Temps et taps avant le premier visage | un profil réel visible en moins de 60 s et moins de 10 taps, photos réservées aux comptes vérifiés |
| C02 | Coût de l'inscription et progressivité | cinq champs obligatoires au plus, tous justifiés, enrichissement demandé au moment où il sert |
| C03 | Reprise après coupure, abandon ou refus | état qui survit à la fermeture, reprise exacte, relance du bot si l'inscription reste inachevée |
| C04 | Preuve de vivant à l'inscription | vivacité vérifiée automatiquement, décision en moins de 2 min, comparaison au visage des photos |
| C05 | Ce que le badge promet et ne promet pas | badge + explication + limites explicites, rappelées au passage au rendez-vous |
| C06 | Barrière durable au retour d'un compte sanctionné | refus automatique à l'inscription sur empreinte non réversible, base légale et durée écrites |
| C07 | Densité et fraîcheur du vivier local | élargissement automatique annoncé et alerte du bot à l'arrivée de profils compatibles |
| C08 | Règle de découverte explicable | un signal de résultat réel entre dans l'ordre, et la personne sait pourquoi un profil lui est proposé |
| C09 | Quotas et mise en scène de la rareté | compteur continu + heure de reset locale + repli utile, rareté présentée comme une sélection |
| C10 | Réciprocité gratuite et actionnable | écran dédié avec relance, et cohérence garantie entre la notification et l'écran d'arrivée |
| C11 | Lanceur de conversation | like ciblé sur un élément du profil avec commentaire, qui devient le premier message |
| C12 | Anti-ghosting et priorisation | rappel limité et non culpabilisant + moyen de clore une discussion morte sans notifier l'autre |
| C13 | Passage au rendez-vous | cycle complet + arrivée horodatée exploitable + proposition de lieu et créneau dès le match |
| C14 | Sécurité autour de la rencontre | personne de confiance prévenue automatiquement + point de contrôle après le rendez-vous |
| C15 | Signaler, bloquer, défaire un match | accusé de réception sur la suite donnée, motifs graves priorisés, sanction sur tout le compte |
| C16 | Filtre anti-arnaque, les deux taux | score de risque par compte, escalade automatique, protection qui ne s'arrête pas au déblocage |
| C17 | Notifications, rappels et volume | réglage par type dans l'app, gestion du 429 avec reprise, journal des comptes injoignables |
| C18 | Coût en data | mode économie qui supprime toute image partout + compteur ou plafond visible en mégaoctets |
| C19 | Résilience réseau et états d'erreur | file d'attente locale, renvoi automatique, état par message, écran hors ligne utile |
| C20 | Accessibilité sur entrée de gamme | cibles 48 dp, mouvement réduit respecté, dégradation selon la classe de performance, zones sûres complètes |
| C21 | Monétisation, parité, absence de piège | parité Stars / mobile money, /paysupport, remboursement écrit et testé, accessibilité vérifiée |
| C22 | Mesure produit | métrique de valeur unique avec entrées et contre-métriques + boucle de résultat réel exploitée |
| C23 | Langue, ton et messages d'erreur | plusieurs langues, bascule dans le profil, langue de Telegram par défaut |
| C24 | Discrétion, vie privée et transparence | durée de conservation écrite par donnée, discrétion vérifiée sur téléphone partagé, registre tenu |
