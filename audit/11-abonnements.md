# Modèle d'abonnement

Écrit le 15 septembre 2026, à la demande du propriétaire, sur les contraintes posées dans
`10-modele-economique.md`. Ce document construit le modèle ; il ne l'implémente pas. Aucune
ligne de code de paiement n'est écrite, et aucune ne le sera sans accord explicite.

Le simulateur qui accompagne ce document permet de faire varier chaque hypothèse.

---

## 1. Ce qu'« abonnement » veut dire ici

Le dépôt interdit **la reconduction tacite** — CLAUDE.md §10.2 (« pas d'abonnement
récurrent : pass de 30 ou 90 jours, expiration franche, rappel neutre ») et le benchmark
(C21, niveau 2). Ce n'est pas un détail : sur un marché où l'on compte chaque franc, un
prélèvement qu'on n'a pas vu venir est ce qui fait les mauvaises réputations.

Le modèle est donc un **abonnement à renouvellement explicite** :

- un pass à durée fixe (7, 30 ou 90 jours), payé d'avance, qui expire franchement ;
- un rappel neutre avant l'expiration (bandeau sur le web, message du bot sans lien ni prix
  dans Telegram — CLAUDE.md §10.8) ;
- le renouvellement est **un geste** de la personne, jamais un prélèvement.

Économiquement, c'est un abonnement : revenu récurrent, taux de renouvellement, revenu par
payeur. Pour la confiance, c'est un achat à chaque fois.

> **Telegram propose des abonnements en Stars à reconduction automatique** (période de 30
> jours dans les factures). Le dépôt les exclut. Les autoriser est une décision du
> propriétaire qui passe par une modification de CLAUDE.md §10.2 — pas par un choix
> d'implémentation.

---

## 2. Deux marchés, deux moyens de payer

C'est la contrainte structurelle que le modèle doit épouser, et elle n'est pas symétrique.

| | Cameroun (cible d'origine) | Belgique (servie depuis le 14 septembre) |
|---|---|---|
| Pouvoir d'achat | SMIG relayé à 60 000 FCFA/mois | sans commune mesure |
| Moyen de payer naturel | **mobile money** (MTN MoMo, Orange Money) | carte, et Stars sans difficulté |
| Dans Telegram (Stars) | **peu praticable** : l'achat de Stars passe par les boutiques d'applications, donc une carte ou un compte Google Play alimenté — rare chez la cible (benchmark, ligne 494) | naturel |
| Ce qui manque | **la version web** (P0-6), seul endroit où le mobile money est permis | rien de bloquant côté paiement |

Conclusion nette : **le modèle d'abonnement au Cameroun dépend de P0-6.** Sans version
web, la seule caisse ouverte est celle des Stars, et la cible ne peut pas y payer. Vendre un
pass dans la mini app aujourd'hui reviendrait à vendre à la diaspora et aux Belges — ce qui
est un vrai marché, mais pas celui pour lequel Odo a été conçu.

**Et le prélèvement des intermédiaires n'est pas le même.** Sur les Stars, les boutiques
d'applications prennent leur part avant Telegram : le développeur reçoit, en ordre de
grandeur, **les deux tiers** du prix payé par la personne (chiffre public, *non vérifié dans
le dépôt* — à établir avant la grille). Sur le mobile money, l'agrégateur prend **1 à 4 %**
(benchmark). À prix égal, un pass vendu sur le web rapporte environ **une fois et demie**
plus qu'un pass vendu en Stars. C'est un argument économique en faveur de P0-6, au-delà de
l'accessibilité.

---

## 3. Ce qui rentre dans le pass

Cette section a été refaite **après avoir lu le code**, et non depuis le souvenir de ce que
l'app fait. Deux propositions précédentes ne tenaient pas ; elles sont corrigées plus bas.

### Inventaire : ce que le code offre, et ce qui est verrouillable

| Capacité | Où | Aujourd'hui | Verrouillable ? |
|---|---|---|---|
| **Vue Liste** — tous les profils compatibles d'un coup | `GET /api/profiles`, `S.discoverMode` | **50 profils**, et parcourir ne consomme **aucun quota** | **Oui**, sans rien casser |
| Vue Cartes | `GET /api/discover` | 10 cartes par requête | c'est le cœur |
| Zone de recherche | `filters.zone`, `dansLaZone()` | une ville **ou tout le pays** | **Oui** |
| « J'aime » par jour | `config.dailyProfiles` | 20 (5 sans badge) | **Oui**, au-dessus de 20 |
| Photos | `PHOTO_SLOTS = [1, 2, 3]` | 3 | **Oui** |
| Questions du profil | `QUESTIONS` (cinq), `promptQ`/`promptA` | **1 sur 5** | **Oui** |
| Présentation vocale | `voix.js`, `DUREE_MAX_S` | 15 s | **Oui** |
| Filtres | âge, genre, vérifiés seulement | — | partiellement |
| « Qui t'a aimé » | `GET /api/likes` | 20 | techniquement oui — **refusé**, voir plus bas |
| Activité d'un profil | `activityBucket()`, `routes.js:638` | **arrondie** à « cette semaine » avant le match | refusé : donnée d'autrui |
| Contacts dans la discussion | `config.contactUnlockAfter` | après 10 messages | **jamais** : sécurité |
| Signaler, bloquer, personne de confiance | `/blocks`, `/reports`, `/me/confiance` | — | **jamais** : sécurité |
| Limites de débit | `limites.js`, `REGLES` | 20 messages/min, 60 balayages/min… | **jamais** : ce sont des digues anti-abus, pas des paliers produit |

### Ce que la lecture du code a corrigé

**1. « Plusieurs villes » était une fausse bonne idée.** `dansLaZone()` traite une ville nulle
comme « tout le pays » (`routes.js:480`) : **le gratuit cherche déjà dans le pays entier**.
Vendre « plusieurs villes » revenait à vendre *moins* que ce qui est déjà donné. Le vrai levier
est l'inverse : le gratuit se limite à **sa ville**, et le pays entier passe dans le pass.

**2. La vue Liste avait été oubliée.** C'est la fonction la plus généreuse de l'app et personne
ne l'avait comptée : cinquante profils compatibles d'un coup, avec leur statut, **sans
consommer un seul « J'aime »**. Le paquet de cartes en montre dix à la fois et chaque « J'aime »
compte. La Liste est un outil de puissance — c'est le meilleur candidat au pass, et il ne
coûte rien à personne : qui ne paie pas voit exactement les mêmes gens, une carte à la fois.

### Le partage

Décisions du propriétaire, 15 septembre 2026 : cinq « J'aime » gratuits, le gratuit ne voit
plus qui l'a aimé, et « qui s'est arrêté sur ta fiche » rejoint le pass.

| | **Gratuit** | **Odo Plus** |
|---|---|---|
| « J'aime » par jour | **5** (2 sans badge) | **illimités** |
| Qui t'a aimé | **rien** | **la liste** |
| Qui s'est arrêté sur ta fiche | **rien** | **compte arrondi + 5 fiches** |
| Parcourir | Cartes, dix à la fois | **+ vue Liste : 50 d'un coup** |
| Zone | sa ville | **tout le pays** |
| Photos | 2 | **6** |
| Questions sur la fiche | 1 | **3** |
| Présentation vocale | 15 s | **30 s** |
| Filtrer par langue parlée | — | **oui** |
| Ordre du paquet | imposé | **au choix** |

Conception de la dernière ligne nouvelle : `audit/12-profils-consultes.md`.

### Trois conséquences que le code impose

**1. Le badge perd son avantage de quota, sauf à descendre les non-vérifiés.** Aujourd'hui
`dailyProfilesNonVerifie` vaut 5. Si le gratuit vérifié passe à 5 aussi, se faire vérifier ne
change plus rien sur cet axe — or c'est ce qui donnait à la vérification un intérêt le jour
même. **Proposition : 2 sans badge, 5 avec, illimité avec le pass.** Le dégradé reste, et la
barrière anti-faux-comptes se resserre au passage.

**2. Cacher « qui t'a aimé » demande de fermer quatre portes, pas une.** La liste n'est que la
plus visible :

| Ce qui fuite | Où |
|---|---|
| L'écran « qui t'a aimé » | `GET /api/likes` |
| **La pastille « T'a liké » sur la carte** | `likedYou` dans `/discover` (`routes.js:638`) et sur la fiche (`app.js:499`) |
| Le compteur de l'onglet Messages | `likes` dans `GET /api/summary` |
| **La notification du bot** | « Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit. » (`routes.js:745`) |

La pastille est la plus facile à oublier : sans elle, cacher la liste ne cache rien.

**Ce qui ne change pas, et qu'il faut savoir** : le paquet trie **déjà** les likers en tête
(`/discover`). Un membre gratuit continue donc de **rencontrer** ceux qui l'ont aimé — il ne
sait simplement pas qu'ils l'ont aimé. La réciprocité n'est pas cassée, seul le raccourci l'est.

**3. La notification du bot doit changer de texte.** Telle qu'elle est écrite, elle promet
« découvre de qui il s'agit » à quelqu'un qui ne le pourra plus : c'est un mensonge, et si on
la transforme en « avec Odo Plus, tu verras qui », c'est le motif que le benchmark note **0
sur 2** (créer l'envie, facturer la réponse). **Proposition, vraie et sans paywall** :

> « Tu as plu à quelqu'un à {ville}. Continue à découvrir : tu le croiseras dans ton paquet. »

C'est exact — le tri le garantit — ça garde la notification utile, et ça ne vend rien.

### Ce qui ne bougera pas, et pourquoi

| Refusé | La raison |
|---|---|
| **« Qui t'a aimé »** | Le bot envoie « tu as plu à quelqu'un ». Verrouiller l'écran derrière un paiement, c'est créer l'envie puis facturer la réponse : C21 le note **0 sur 2**. Et ce serait du théâtre — les likers passent **déjà en tête du paquet** (`routes.js`, tri de `/discover`), donc le gratuit les voit de toute façon |
| **L'activité précise** | Elle est arrondie **exprès** avant le match. La vendre, c'est vendre la vie privée d'un autre membre à un tiers |
| **Le filtre « vérifiés seulement »** | Filtre de sécurité. C21 = 0 |
| **Contacts avant 10 messages** | `contactUnlockAfter` est une barrière anti-arnaque. Le vendre serait vendre le contournement de la promesse centrale du produit |
| **Les limites de débit** | Ce sont des digues anti-abus. Les desserrer contre paiement, c'est vendre la capacité de nuire plus vite |
| **Les boosts de visibilité** | Jeu à somme nulle : ce qu'un payeur gagne, un autre membre le perd |

### Le risque à garder en tête

Le vivier **est** le produit. Un gratuit trop maigre ne convertit pas : il vide la salle, et
personne ne paie pour entrer dans une pièce vide. Le benchmark le note pour cette région —
Badoo domine l'Afrique francophone avec « découverte gratuite très large, faible barrière à
l'entrée ».

Les huit lignes ci-dessus tiennent parce qu'elles **ajoutent à Plus** au moins autant qu'elles
**retirent au gratuit** : la vue Liste et les « J'aime » illimités ne coûtent rien à qui ne
paie pas. Descendre plus bas — une photo, cinq « J'aime », pas de vue d'ensemble — ferait un
gratuit qui ne donne plus envie de rester assez longtemps pour payer.

## 4. La grille : un prix posé, et la règle qui donne l'autre

**Décision du propriétaire, 15 septembre 2026 : 3 000 FCFA les 30 jours, en Afrique.** Soit 5 % du
SMIG camerounais relayé à 60 000 FCFA — le double de l'hypothèse de départ, ancrée sur une
recharge data. C'est le chiffre à surveiller en premier dans le taux de conversion : le
benchmark ne connaît aucun repère de consentement à payer, et 3 000 FCFA est un vrai prix
pour un étudiant. Hors zone franc (Nigeria, Kenya, Ghana…), il se lit « l'équivalent de
3 000 FCFA en monnaie locale », selon ce que l'agrégateur sait encaisser.

**Hors Afrique, la règle : même revenu net par payeur, quel que soit le canal.**

| | Afrique — web, mobile money | Hors Afrique — Telegram, Stars |
|---|---|---|
| 30 jours | **3 000 FCFA** | **6,99 €** ≈ 4 585 FCFA |
| 90 jours | 7 500 FCFA | 16,99 € |
| Part des intermédiaires | ~3 % (agrégateur) | ~35 % (boutiques, puis Telegram) |
| **Net pour Odo, 30 jours** | ≈ 2 910 FCFA | ≈ 2 980 FCFA |

À 6,99 €, un pass vendu en Stars rapporte autant qu'un pass à 3 000 FCFA une fois la part des
boutiques retirée. Et il reste trois à cinq fois sous les 20 à 35 € mensuels des leaders
(benchmark) : le prix d'une bière, pas d'un abonnement. 1 € = 655,957 FCFA (parité fixe).

**Le canal fait la segmentation, pas le pays déclaré.** Un prix selon le pays du profil se
contourne en changeant une ligne de son profil. Mais un membre à Bruxelles ne paiera pas par
Orange Money, et un membre à Yaoundé ne peut guère acheter des Stars : chaque canal porte
son prix, et personne ne triche. Un Camerounais de la diaspora paie 6,99 € — il gagne en
euros. Conséquence : Telegram n'impose qu'une grille en Stars, et c'est la grille hors
Afrique ; la grille africaine n'existe que sur le web.

**Parité en Stars.** À exprimer au moment de fixer la facture, à partir d'une valeur de la
Star **vérifiée** — le dépôt note explicitement qu'elle ne l'a pas été. La part de 35 % est
un ordre de grandeur public, à confirmer au même moment.

## 5. Économie unitaire

**Ce qui coûte.**
- Hébergement : une machine de 256 Mo et une base sur Fly — de l'ordre de 6 000 FCFA par mois
  (*ordre de grandeur, à lire sur la facture*). Fixe.
- Modération : selfie, jusqu'à six photos (deux sans pass), une présentation vocale — **par nouveau membre**,
  du temps humain. Personne ne l'a chronométré ; l'hypothèse de départ est de trois minutes
  par membre. Variable, et **croît avec les inscriptions, pas avec les payeurs**.
- Intermédiaires : ~35 % sur les Stars, ~3 % sur le mobile money.

**Ce qui rapporte.** Membres actifs × part qui paie × prix moyen, net des intermédiaires.

**Le point de bascule.** L'hébergement est couvert par **quatre passes de 30 jours au
Cameroun** — c'est la bonne nouvelle. La modération, elle, n'est couverte qu'à une autre
échelle : voir le tableau.

### Scénario de référence (hypothèses, toutes réglables dans le simulateur)

60 % de membres actifs · 5 % des actifs paient · 3 000 FCFA ou 6,99 € les 30 jours · 3 min de
modération par nouveau membre, 10 % de nouveaux par mois · web disponible en Afrique. Avec la
règle du même net par payeur, la part de payeurs hors Afrique ne change presque rien au
revenu : une seule colonne suffit.

| Membres | Payeurs | Revenu net / mois | Coût / mois | Marge | Modération / mois |
|---|---|---|---|---|---|
| 100 | 3 | ≈ 8 700 FCFA | ≈ 6 500 FCFA | ≈ +2 200 | 30 min |
| 1 000 | 30 | ≈ 87 000 FCFA | ≈ 11 000 FCFA | ≈ +76 000 | 5 h |
| 5 000 | 150 | ≈ 437 000 FCFA | ≈ 31 000 FCFA | ≈ +406 000 | 25 h |
| 20 000 | 600 | ≈ 1 746 000 FCFA | ≈ 106 000 FCFA | ≈ +1 640 000 | 100 h |

Lecture honnête : à 3 000 FCFA, **l'hébergement est couvert dès trois payeurs**, et à 1 000
membres le modèle dédommage largement le temps de modération. Ce que le prix doublé achète en
revenu, il le paie peut-être en conversion — c'est le curseur à regarder dès les premiers
vrais membres. Et rien de ceci n'existe tant que la version web n'est pas construite : sans
elle, le revenu africain est à zéro.

## 6. Ce qui fait vivre ou mourir un abonnement à renouvellement explicite

Sans prélèvement automatique, **chaque fin de pass est une décision**. Trois leviers, aucun
ne demande de piège :

1. **Le rappel neutre**, trois jours avant : ce que le pass a apporté (« 12 profils vus hors
   de ta ville »), la date d'expiration, rien d'autre. Pas de compte à rebours, pas de
   « offre expire ».
2. **Le pass de 90 jours**, moins cher par jour : moins de décisions, moins d'occasions de
   partir.
3. **L'expiration franche et propre** : la personne redevient gratuite, garde tout — ses
   matchs, ses messages, son badge. Rien n'est pris en otage. C'est ce qui fait revenir.

Ce qu'on ne fait pas : réduire la zone à l'expiration d'une façon qui casse une discussion
en cours (un match hors zone reste un match), ni relancer plus d'une fois.

---

## 7. Ordre de construction

1. **La phrase du bot** (`10-modele-economique.md`, §1). Zéro code, bloque tout.
2. **Le socle des droits** : table `entitlements` et `GET /api/me/premium` (CLAUDE.md §10.4-10.5)
   — le seul endroit qui dit qui est Plus. Sans caisse d'abord : un pass **offert** à la main
   depuis le groupe de modération suffit à tester si la zone élargie change quelque chose
   pour de vrais membres.
3. **Stars dans la mini app** : `POST /api/stars/invoice`, `successful_payment`, `/paysupport`,
   remboursement écrit. Sert la Belgique et la diaspora tout de suite.
4. **P0-6, version web et mobile money** : ouvre le Cameroun. Le gros chantier — à ne lancer
   qu'après le point 2 testé sur de vraies personnes.

Le point 2 est le seul qui mérite d'être fait avant d'avoir des membres : il coûte peu et il
permet de **mesurer** si Odo Plus vaut quelque chose avant de lui donner un prix.

---

## 8. Ce que ce document ne sait pas

- Le taux de conversion et le taux de renouvellement, dans les deux pays. Hypothèses.
- La valeur d'une Star, et la part exacte prise par les boutiques.
- Le temps réel de modération par membre.
- Si Google Play propose le paiement par l'opérateur au Cameroun — cela changerait
  l'accessibilité des Stars.
- Rien de tout ceci ne se teste avant quelques dizaines de membres actifs.

---

## 8. Ce qui est construit, au 15 septembre 2026

Le socle et **les dix lignes du §3**. L'écran du pass n'annonce que ce qui existe, et tout ce
qu'il annonce existe : la leçon de « Sortie en duo » tient en une ligne — une
promesse affichée que rien n'honore est pire qu'une fonction absente, parce que la personne l'a
crue.

| | Écrit | Où |
|---|---|---|
| `estPlus()`, le seul endroit qui tranche | oui | `server/plus.js` |
| Pass empilable, expiration franche | oui | `prolonger()`, `test/plus.test.js` |
| Pass offert à la main depuis la modération | oui | `/pass`, `/sanspass` dans `server/bot.js` |
| Quota : 2 sans badge, 5 gratuit, sans limite avec le pass | oui | `config.dailyProfiles`, `quotaDe()` |
| Qui t'a aimé, les quatre portes | oui | `voitSesLikes()`, `requirePlus` |
| Se sont arrêtés sur ta fiche | oui | `server/vues.js`, `audit/12-profils-consultes.md` |
| Vue Liste, tout le pays, 6 photos, 30 s de voix | oui | `PALIERS` dans `server/plus.js`, `zoneCherchee()`, `test/plus.test.js` |
| Trois questions sur la fiche, filtre par langue | oui | `extras`, `dansLaLangue()`, `test/plus.test.js` |
| Ordre du paquet au choix | oui | `ORDRES`, `trierLePaquet()` — qui t'a aimé devant dans tous les ordres |
| La caisse (mobile money, Stars) | **non** | P0-6, `CLAUDE.md` §10 |

**Pas de caisse, et c'est volontaire.** Avant de faire payer, il faut savoir si ce qu'il y a
derrière change quelque chose pour de vrais membres. Un pass offert le dit, et ne demande ni
agrégateur, ni remboursement, ni structure juridique. Ce que la bêta doit répondre : est-ce que
quelqu'un qui reçoit un pass s'en sert — et est-ce que ne pas savoir qui l'a aimé fait revenir
plus souvent, ou partir.

**Et depuis le 15 septembre 2026, ça se mesure.** Pendant une journée, le pass a existé sans que
rien ne le compte : on avait construit une fonction *pour* mesurer, et on ne mesurait pas.
`npm run chiffres` porte maintenant une section **Odo Plus**, bâtie sur deux chiffres :

| Ce qu'on compte | L'événement | Ce qu'il dit |
|---|---|---|
| **La demande** | `pass_refuse {quoi}` | Combien de fois, et surtout **par combien de personnes**, quelqu'un a voulu passer une porte fermée. Dix refus d'un curieux obstiné ne disent pas ce que disent dix membres |
| **L'usage** | `pass_usage {quoi}`, ralenti | La part de ceux qui ont reçu un pass et s'en sont servis au moins une fois. Un pass dont personne ne se sert ne vaut rien |
| Ce qu'on a distribué | `pass_pose {jours}`, `pass_retire` | Sur combien de membres la part ci-dessus porte |
| Le mur du quota | `quota_hit {action, q}` | `q` est le **palier touché** : 2 (sans badge) et 5 (gratuit) ne racontent pas la même histoire |

Trois limites sont écrites à côté des nombres, pas dans un coin : aucun pass n'a été **vendu**,
donc un refus mesure une curiosité et jamais un consentement à payer ; les lignes `quota_hit`
d'avant ce jour n'ont pas de `q` et sont rangées sous « — » plutôt qu'attribuées au hasard ; et
rien n'est rétroactif, comme pour le reste de la mesure.
