// Le temps réel de la discussion : un flux par discussion ouverte, en mémoire, sur cette instance.
//
// **Le flux ne transporte jamais un message.** Il dit « quelque chose est arrivé » (`signal`),
// et le client va chercher par le chemin qui existait déjà — `GET /matches/:id?after=`. Une
// seule source de vérité, donc rien à réconcilier : ni ordre, ni doublon, ni « mine » à recalculer
// par abonné, ni marquage de lecture à réinventer. Ce qu'on gagne est la latence ; ce qu'on ne
// risque pas est la cohérence. La frappe (`ecrit`) est le seul signal qui se suffit à lui-même :
// c'est un drapeau, pas une donnée.
//
// Ce que ça vaut, et ce que ça ne vaut pas. La carte vit dans le processus : sur plusieurs
// instances, un message écrit sur l'une ne réveille pas un flux ouvert sur l'autre. Le client
// garde donc une interrogation de sécurité (toutes les 30 s) tant que le flux est ouvert — sur
// plusieurs instances, le pire cas est un retard de trente secondes, jamais un silence. La
// production tourne sur une machine ; le jour où il y en a deux, c'est un bus (LISTEN/NOTIFY de
// PostgreSQL) qu'il faudra poser ici, pas le client qu'il faudra changer.

// matchId -> Map<userId, res>. Une personne n'a qu'un flux par discussion : le nouveau remplace
// l'ancien, sans quoi un rechargement de l'app en laisserait un orphelin par ouverture.
const flux = new Map();

// Les flux comptent comme des requêtes en cours pour le proxy de Fly : au-delà d'une limite, il
// mettrait **tout** le trafic en file, y compris /health. Le plafond est posé sous celle de
// fly.toml, et au-delà on répond 503 — le client retombe sur l'interrogation, rien ne casse.
export const PLAFOND = 150;
export const KEEPALIVE_MS = 20_000;
export const PRESENCE_MS = 5_000;

export const nombreDeFlux = () => [...flux.values()].reduce((n, m) => n + m.size, 0);

export function abonner(matchId, userId, res) {
  const id = String(matchId); const u = String(userId);
  if (!flux.has(id)) flux.set(id, new Map());
  const ancien = flux.get(id).get(u);
  if (ancien && ancien !== res) { try { ancien.end(); } catch { /* déjà fermé */ } }
  flux.get(id).set(u, res);
  return () => {
    const m = flux.get(id);
    if (m && m.get(u) === res) m.delete(u);
    if (m && !m.size) flux.delete(id);
  };
}

// Écrit un événement à chaque abonné de la discussion, sauf un — celui qui vient d'agir n'a pas
// besoin qu'on lui dise ce qu'il vient de faire. Un abonné dont l'écriture échoue est retiré.
export function signaler(matchId, type, data = '1', { sauf } = {}) {
  const m = flux.get(String(matchId));
  if (!m) return 0;
  let n = 0;
  for (const [u, res] of m) {
    if (sauf !== undefined && u === String(sauf)) continue;
    try { res.write(`event: ${type}\ndata: ${data}\n\n`); n += 1; } catch { m.delete(u); }
  }
  return n;
}
