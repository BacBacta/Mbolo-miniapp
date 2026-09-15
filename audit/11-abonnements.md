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

### La règle qui décide

Trois questions, dans cet ordre. Une seule réponse « oui » suffit à refuser.

1. **Est-ce que ça relève de la sécurité ou de la réciprocité ?** Alors c'est gratuit — C21 le
   note 0 autrement.
2. **Est-ce que ça retire quelque chose à ceux qui ne paient pas ?** Alors non : un avantage
   qui dégrade le produit des autres se paie en départs.
3. **Est-ce que ça vend quelque chose qui appartient à quelqu'un d'autre ?** Alors non — la
   vie privée d'un membre n'est pas un stock.

Ce qui reste est du **confort** et de **l'expression**. C'est peu, et c'est exprès.

### Odo Plus

| | Gratuit | Plus |
|---|---|---|
| **Zone de recherche** | une ville, ou tout son pays | **plusieurs villes de son pays** |
| **Filtres** | âge, genre (selon `MATCH_POLICY`), vérifiés seulement | **+ langues parlées** |
| **Ton profil** | une question sur cinq, une réponse | **trois questions, trois réponses** |
| **Présentation vocale** | 15 s | **30 s** |

**La zone** est l'avantage le plus réel : dans un vivier mince, pouvoir chercher à Yaoundé *et*
à Douala change vraiment ce qu'on voit. Aujourd'hui c'est tout ou rien — une ville, ou le pays
entier, sans milieu.

**Trois questions au lieu d'une** est la version honnête du « boost ». Le payeur gagne de
l'attention **parce qu'il en dit plus**, pas parce qu'il passe devant. Ça ne réordonne le
paquet de personne, ça ne coûte rien à servir, et les cinq questions existent déjà
(`QUESTIONS` dans `public/app.js`) : seule la fiche n'en porte qu'une.

**Trente secondes de voix** double le temps d'écoute de la modération par payeur. C'est
négligeable à l'échelle d'une bêta, mais c'est une fonction qui **augmente le coût variable à
chaque vente** : à surveiller si le nombre de payeurs monte.

### Ce qui ne rentre pas, et pourquoi

| Refusé | La raison |
|---|---|
| **« Qui t'a aimé »** | C21 = 0. C'est le seul signal qui protège d'un vivier vide, et la recette qui fait vivre les concurrents est justement celle qu'Odo ne peut pas prendre |
| **Le quota de « J'aime »** | C'est un **levier de sécurité** (5 sans badge, 20 avec) qui ralentit un faux compte avant qu'un humain l'ait vu. Le vendre convertit une barrière en revenu. Et dans un vivier mince, personne n'épuise ses 20 : il ne vaut rien |
| **Le filtre « vérifiés seulement »** | Filtre de sécurité. Gratuit |
| **L'activité précise avant le match** | La carte arrondit à « cette semaine » **exprès** (`routes.js:638`). Vendre la précision, c'est vendre la vie privée d'un autre membre à un tiers |
| **Les réponses de compatibilité comme filtre** | CLAUDE.md est explicite : « affichées sur la carte, **jamais un filtre** : elles renseignent, elles ne trient pas ». Revenir dessus est une décision du propriétaire, pas un arbitrage de prix |
| **Plus de trois photos** | Chacune passe par la modération : vendre ce qui coûte plus cher à chaque vente |
| **Les boosts de visibilité** | Jeu à somme nulle : ce qu'un payeur gagne, un autre membre le perd |
| **Plusieurs personnes de confiance** | Sécurité. Gratuit, et tant mieux |

### Et surtout : pas plusieurs **pays**

La zone élargie s'arrête à la frontière, et ce n'est pas un détail de mise en œuvre.

Vendre la découverte à l'étranger, c'est vendre exactement la configuration où vit l'arnaque
sentimentale : quelqu'un de loin, qu'on ne rencontrera jamais, avec qui la relation n'existe
que par écrit. C'est aussi rendre inatteignable la promesse du produit — « les premiers
rendez-vous se font dans des lieux publics ». On vendrait un avantage qui éloigne du but.

Un membre à Bruxelles cherche à Bruxelles. Un membre à Yaoundé cherche à Yaoundé, à Douala,
à Bafoussam. La diaspora paie le même pass, pour le même usage : rencontrer **là où elle est**.

### Ce qui manquerait pour que ça vaille clairement 3 000 FCFA

Il faut le dire : cette liste est du confort, et 3 000 FCFA font 5 % du SMIG. Le seul levier
qui justifierait clairement ce prix — et que le marché prouve que les gens achètent — est
**le mot joint au « J'aime »** : quelques lignes que la personne lit en ouvrant « qui t'a
aimé », avant de décider.

**Ce qu'il coûterait.** Odo a aujourd'hui une propriété qu'aucun concurrent n'a : **aucun
inconnu ne peut mettre du texte devant toi**. Un like est muet tant qu'il n'est pas rendu. Le
mot dépense cette propriété. Les garde-fous existent — l'anti-arnaque filtre argent, numéros
et liens ; le mot n'apparaît que dans une liste qu'on a ouverte soi-même ; signaler et bloquer
marchent — mais ça reste du texte d'un inconnu, chez une cible où c'est précisément ce dont on
veut protéger les membres.

**Recommandation : pas pour la bêta fermée.** Sortir le pass avec les quatre éléments de
confort, regarder la conversion, et rouvrir la question du mot quand on aura un vrai signal
sur le harcèlement — on saura alors ce qu'on dépense. Et si la conversion est mauvaise à
3 000 FCFA, la réponse n'est pas d'ajouter le mot : c'est que le pass est prématuré, et que
la ligne B2B (une fois le code tournant posé) aligne bien mieux le revenu sur le coût.

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
- Modération : selfie, jusqu'à trois photos, une présentation vocale — **par nouveau membre**,
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
