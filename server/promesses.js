// Les promesses que personne n'attend, et ce qu'on en fait.
//
// Express 4 ignore ce que rend un gestionnaire : une fonction `async` qui rejette laisse une
// promesse orpheline, et depuis Node 15 une promesse rejetée sans personne pour la rattraper
// **arrête le processus**. La revue du 14 septembre 2026 (audit/09-revue-code.md, C1, C2, C5) a
// trouvé trois chemins pour le faire depuis l'extérieur : un statut de rendez-vous hors liste, un
// cookie malformé sur /api/mod, une erreur d'un gestionnaire du bot en mode webhook. Trois chemins
// pour un seul défaut — une promesse sans filet — d'où un seul module, sans dépendance, pour que
// chaque routeur et chaque appel en arrière-plan passent par la même porte.

// Enveloppe chaque gestionnaire posé sur un routeur Express 4 : une promesse rejetée devient
// `next(err)`, donc une réponse 500 du gestionnaire d'erreur, au lieu d'un processus arrêté et
// d'une requête qui pend. Les gestionnaires d'erreur (quatre arguments) sont laissés tels quels.
// À appeler une seule fois, juste après `express.Router()`, avant toute route.
export function envelopper(routeur) {
  for (const verbe of ['get', 'post', 'put', 'delete', 'patch', 'use', 'all']) {
    const original = routeur[verbe].bind(routeur);
    routeur[verbe] = (...args) => original(...args.map((a) => (
      typeof a === 'function' && a.length < 4
        ? (req, res, next) => Promise.resolve(a(req, res, next)).catch(next)
        : a
    )));
  }
  return routeur;
}

// Ce qu'on lance sans l'attendre — une notification, un message au groupe — ne doit jamais faire
// tomber ce qui l'a lancé. Journalise et rend une promesse qui ne rejette pas.
export const enArrierePlan = (promesse, quoi = 'tâche en arrière-plan') =>
  Promise.resolve(promesse).catch((e) => { console.error(`${quoi} : ${e?.message || e}`); });

// Le filet du jour où l'on oublie l'un des deux ci-dessus. Il journalise au lieu d'arrêter : une
// promesse orpheline est un bogue à corriger, pas une raison d'éteindre l'app pour tout le monde.
// Il ne couvre que les rejets : une exception synchrone non rattrapée reste un arrêt, parce que
// l'état du processus n'est alors plus sûr.
export function poserLeFilet(journal = (m) => console.error(m)) {
  process.on('unhandledRejection', (raison) => {
    journal(`Promesse rejetée sans filet (bogue à corriger, le serveur continue) : ${raison?.stack || raison?.message || raison}`);
  });
}
