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

## 3. Deux niveaux, pas trois

| | **Gratuit** | **Odo Plus** |
|---|---|---|
| Vérification, badge, jauge | oui | oui |
| Découvrir, aimer, matcher, écrire | oui | oui |
| « Qui t'a aimé » | **oui, toujours** | oui |
| Signaler, bloquer, personne de confiance, rendez-vous | oui | oui |
| Quota de « J'aime » | 5 sans badge, 20 avec — **jamais à vendre** | identique |
| Zone de recherche | sa ville, ou tout son pays | **plusieurs villes, plusieurs pays** |
| Filtres | âge | **langues parlées, activité récente, taille de ville** |
| Présentation vocale | 15 s | **30 s** |
| Aperçu des intentions | — | **réponses de compatibilité en premier sur la carte** |

Ce qui est gratuit l'est parce que C21 l'exige (sécurité, réciprocité) ou parce que le
vendre abîmerait le produit pour ceux qui ne paient pas (le quota est un levier de sécurité,
le boost un jeu à somme nulle). Ce qui est payant est du **confort qui ne retire rien à
personne** — et dans un vivier mince, la zone élargie est le confort le plus réel.

Pourquoi pas un troisième niveau : la cible ne compare pas des paliers, elle compare un prix
à une recharge data. Deux choix, deux durées. La simplicité est le produit.

---

## 4. La grille : une hypothèse, avec ses ancrages

**Cameroun** — ancré sur le prix de la data (500 FCFA ≈ 500 à 750 Mo, benchmark), pas sur les
abonnements occidentaux.

| Pass | Prix | Par jour | Part du SMIG mensuel |
|---|---|---|---|
| 7 jours | 500 FCFA | 71 FCFA | 0,8 % |
| 30 jours | 1 500 FCFA | 50 FCFA | 2,5 % |
| 90 jours | 3 500 FCFA | 39 FCFA | 1,9 % par mois |

**Belgique** — ancré sur un café, loin des 20 à 35 € mensuels des leaders (benchmark, Coffee
Meets Bagel). 1 € = 655,957 FCFA (parité fixe).

| Pass | Prix | Équivalent FCFA |
|---|---|---|
| 30 jours | 4,99 € | ≈ 3 270 FCFA |
| 90 jours | 11,99 € | ≈ 7 865 FCFA |

**Parité Stars.** À exprimer en Stars au moment de fixer la grille, à partir d'une valeur de
la Star **vérifiée** — le dépôt note explicitement qu'elle ne l'a pas été. Telegram impose une
grille unique en Stars : la grille belge servira la mini app partout, la grille camerounaise
n'existera que sur le web. C'est une conséquence, pas un choix.

> Le benchmark est formel : *aucun repère de consentement à payer pour une app de
> rencontres au Cameroun n'a été trouvé.* La première grille sera probablement fausse. Elle se
> corrige avec de vraies personnes, pas avec un tableau.

---

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

60 % de membres actifs · 5 % des actifs paient · panier moyen 1 500 FCFA/30 j au Cameroun,
4,99 €/30 j en Belgique · 3 min de modération par nouveau membre, 10 % de nouveaux par mois ·
web disponible au Cameroun (mobile money) · Stars en Belgique.

| Membres | Payeurs | Revenu net / mois, Cameroun seul | Revenu net / mois, moitié Belgique | Modération / mois |
|---|---|---|---|---|
| 100 | 3 | ≈ 4 400 FCFA | ≈ 6 500 FCFA | 30 min |
| 1 000 | 30 | ≈ 44 000 FCFA | ≈ 65 000 FCFA | 5 h |
| 5 000 | 150 | ≈ 218 000 FCFA | ≈ 325 000 FCFA | 25 h |
| 20 000 | 600 | ≈ 873 000 FCFA | ≈ 1 300 000 FCFA | 100 h |

Lecture honnête : **au Cameroun seul, l'abonnement ne paie pas un modérateur à plein temps
avant plusieurs milliers de membres.** À 1 000 membres il paie l'hébergement et dédommage le
temps de modération ; à 5 000 il commence à payer une personne. La Belgique, à membres égaux,
rapporte une fois et demie plus par payeur — mais le produit y est moins différenciant, et
le taux de conversion n'y est pas connu non plus.

---

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
