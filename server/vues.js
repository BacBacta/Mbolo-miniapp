// « Qui s'est arrêté sur ta fiche » : la règle, et les trois refus qui la rendent tenable.
//
// **La donnée existe déjà.** La table `swipes` enregistre depuis toujours `{ from, to, action, at }`
// — chaque fois que quelqu'un voit une fiche et décide. On ne collecte donc rien de neuf ; on
// montre autrement ce qui est là, ce qui est la seule façon de tenir la règle 5.4. Et le nom suit
// la donnée : ce n'est pas « qui a vu ta fiche » (personne ne mesure ça) mais **qui s'est arrêté**
// — quelqu'un qui fait défiler sans décider n'y est pas. Moins de volume, et plus honnête.
//
// Trois refus, dans l'ordre de ce qu'ils protègent :
//
// 1. **L'issue n'est jamais montrée.** Un « passer » est une décision privée. « X a vu ta fiche et
//    est passé » serait cruel sans rien apporter à personne.
// 2. **Le compte est arrondi et la liste est courte.** C'est le moins évident, et c'est celui qui
//    protège vraiment. Un membre Plus voit *aussi* qui l'a aimé : si la liste des personnes
//    arrêtées était exhaustive, la soustraire à celle des « J'aime » donnerait **la liste de ceux
//    qui ont refusé**. On fabriquerait une machine à savoir qui ne veut pas de vous. Un palier
//    grossier et cinq fiches rendent cette soustraction impossible sans rendre la fonction inutile.
// 3. **On peut s'y soustraire, gratuitement et des deux côtés.** Montrer à A que B s'est arrêté sur
//    sa fiche, c'est divulguer le comportement de B à un tiers ; le RGPD s'applique depuis que la
//    Belgique est servie, et il donne un droit d'opposition. Ce droit **ne se vend pas** : le
//    réglage est gratuit. Il est aussi **symétrique** — qui se retire n'apparaît chez personne et
//    ne voit la liste chez lui non plus, même avec un pass. C'est la seule règle qui ne se
//    retourne pas contre les membres.

// Trente jours. Au-delà, « s'est arrêté il y a huit mois » ne veut plus rien dire, et ce qu'on
// montre doit être aussi court que possible.
export const FENETRE_MS = 30 * 24 * 3600 * 1000;

// Cinq fiches. Voir plus haut : ce n'est pas une contrainte d'affichage, c'est la moitié de ce
// qui empêche la soustraction.
export const MAX_FICHES = 5;

// Le réglage d'opposition. Une fonction, pas une comparaison recopiée : elle est lue des deux
// côtés de la symétrie, et un jour où elle changera de forme, elle ne changera qu'ici.
export const discret = (u) => u?.discretion === true;

// L'arrondi. Il ne rend pas un nombre exact déguisé : il rend un **palier** et la forme à employer,
// et l'interface écrit la phrase — le serveur n'envoie pas de français (règle 10).
//
//   0        → rien du tout ; il n'y a rien à cacher, et rien à soustraire
//   1 à 4    → « moins de 5 »
//   5 et plus → « plus de N », N étant le multiple de cinq juste en dessous
//
// Grossier exprès. Un compte exact à une unité près, comparé d'une semaine à l'autre, redonnerait
// ce que le palier retire.
export function arrondir(n) {
  const x = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (x === 0) return { forme: 'aucune', n: 0 };
  if (x < 5) return { forme: 'moins', n: 5 };
  return { forme: 'plus', n: Math.floor(x / 5) * 5 };
}

// Les balayages qui comptent : ceux qui me sont adressés, dans la fenêtre, et pas les miens.
// L'action (`like` ou `pass`) **n'est pas lue ici et ne l'est nulle part ailleurs** : c'est le
// refus n° 1, et il tient parce que la donnée ne traverse pas cette fonction.
export function dansLaFenetre(swipes, moi, maintenant = Date.now()) {
  return (swipes || [])
    .filter((s) => String(s.from) !== String(moi) && Number(s.at) >= maintenant - FENETRE_MS)
    .sort((a, b) => b.at - a.at)
    .map((s) => ({ from: String(s.from), at: Number(s.at) }));
}
