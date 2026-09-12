// Lire les chiffres de la bêta : entonnoir, activation, churn, métrique phare, contre-métriques.
//
// Le plan complet est dans audit/05-mesure-produit.md. Deux choses le résument :
//
// — Les exclusions sont en amont, jamais après coup. Un profil de démonstration « like » en
//   retour et répond tout seul : exclure son auteur ne suffit pas, il faut exclure la paire.
//   Sans ça, un tableau de bord naïf afficherait un taux de match proche de cent pour cent.
// — Un chiffre qui ment est pire qu'un chiffre absent. Tout ce qui est douteux est signalé à
//   côté du nombre, dans la même sortie : les périodes de validation automatique, le check-in
//   encore falsifiable, et l'absence de rétroactivité.
//
// Le calcul est une fonction pure : il prend des tableaux et rend un objet. C'est ce qui permet
// de l'éprouver sur des cas construits, sans base et sans serveur.

export const reel = (u) => !!u && !u.demo && !u.devUser && !u.banned;
const JOUR = 86400e3;
const mediane = (xs) => {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const i = Math.floor(t.length / 2);
  return t.length % 2 ? t[i] : Math.round((t[i - 1] + t[i]) / 2);
};
const part = (n, total) => (total ? n / total : null);
const pour100 = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : null);

// Rassemble ce que le calcul demande. Séparé de calculer() pour que celui-ci reste pur.
export async function collecter(store) {
  const users = await store.allUsers();
  const events = await store.events();
  const reports = await store.reports();
  const matches = new Map();
  const messages = new Map();
  const dates = [];
  const blocks = [];
  for (const u of users) {
    for (const b of await store.blocksOf(u.id)) blocks.push({ from: u.id, to: b });
    for (const m of await store.matchesOf(u.id)) {
      if (matches.has(m.id)) continue;
      matches.set(m.id, m);
      messages.set(m.id, await store.messagesOf(m.id));
      dates.push(...await store.datesOfMatch(m.id));
    }
  }
  return { users, events, reports, matches: [...matches.values()], messages, dates, blocks };
}

export function calculer({ users, events, reports = [], matches = [], messages = new Map(), dates = [], blocks = [] }, maintenant = Date.now()) {
  const parId = new Map(users.map((u) => [String(u.id), u]));
  const vrais = users.filter(reel);
  const estReel = (id) => reel(parId.get(String(id)));
  // La paire, pas la personne : un match avec un profil de démonstration n'est pas un match.
  const matchsReels = matches.filter((m) => m.users.every(estReel));

  const evts = (k) => events.filter((e) => e.k === k);
  const evtsDe = (k, id) => evts(k).filter((e) => e.u === String(id));

  // Une décision de modération rendue par un humain. Les lignes auto: true sont celles d'une
  // période où AUTO_APPROVE validait sans que personne ne regarde : les compter reviendrait à
  // mesurer une horloge de trois secondes, pas une équipe.
  const decisions = evts('verif_decided');
  const autoDe = new Map(decisions.map((e) => [e.u, !!e.p?.auto]));
  const parHumain = (u) => u.verification === 'approved' && autoDe.get(String(u.id)) === false;
  const auMoinsUneAuto = decisions.some((e) => e.p?.auto);

  // ---------- Entonnoir ----------
  const aEnvoyeSelfie = (u) => !!u.verificationSentAt || evtsDe('selfie_sent', u.id).length > 0;
  const premierMessageReel = (id) => matchsReels
    .filter((m) => m.users.includes(String(id)))
    .flatMap((m) => messages.get(m.id) || [])
    .filter((x) => String(x.from) === String(id))
    .sort((a, b) => a.at - b.at)[0] || null;

  const entonnoir = {
    comptes: vrais.length,
    profil: vrais.filter((u) => u.profileSavedAt || u.profile).length,
    selfie: vrais.filter(aEnvoyeSelfie).length,
    verifieParHumain: vrais.filter(parHumain).length,
    premierLike: vrais.filter((u) => u.firstLikeAt).length,
    premierMatch: vrais.filter((u) => u.firstMatchAt).length,
    premierMessage: vrais.filter((u) => premierMessageReel(u.id)).length,
  };

  // ---------- Activation ----------
  // Profil enregistré, vérification approuvée par un humain, et un message envoyé à une personne
  // réelle — le tout dans les quatorze jours suivant la première ouverture. Le message et pas le
  // like : un like non rendu ne produit rien, et un match avec un profil de démonstration est
  // automatique. Le message est le premier acte qui exige que deux personnes réelles aient agi.
  const FENETRE = 14 * JOUR;
  const active = (u) => {
    if (!u.profileSavedAt || !parHumain(u)) return false;
    const msg = premierMessageReel(u.id);
    return !!msg && msg.at - u.createdAt <= FENETRE && (u.profileSavedAt - u.createdAt) <= FENETRE;
  };
  // Seuls les comptes qui ont eu quatorze jours pour s'activer entrent au dénominateur.
  const murs = vrais.filter((u) => maintenant - u.createdAt >= FENETRE);
  const activation = { actives: murs.filter(active).length, sur: murs.length, part: part(murs.filter(active).length, murs.length) };

  // ---------- Churn ----------
  const INACTIF = 21 * JOUR;
  const churn = {
    dur: evts('account_deleted').length,
    silencieux: vrais.filter((u) => maintenant - (u.lastActiveAt || u.createdAt) > INACTIF).length,
    // lastActiveAt est écrasé à chaque passage : il dit combien sont partis, jamais quand.
    // Seul app_opened permet de dater un départ, et seulement depuis sa mise en place.
    datable: evts('app_opened').length > 0,
  };

  // ---------- Métrique phare ----------
  // Rendez-vous où les deux personnes réelles ont confirmé leur arrivée, par semaine et par ville.
  const rdvReels = dates.filter((d) => {
    const m = matches.find((x) => x.id === d.matchId);
    return m && m.users.every(estReel);
  });
  const reciproques = rdvReels.filter((d) => {
    const m = matches.find((x) => x.id === d.matchId);
    return m.users.every((id) => d.arrivals?.[id]);
  });
  const villeDe = (d) => {
    const m = matches.find((x) => x.id === d.matchId);
    return parId.get(String(m.users[0]))?.profile?.city || '—';
  };
  const parVille = {};
  for (const d of reciproques) parVille[villeDe(d)] = (parVille[villeDe(d)] || 0) + 1;
  const phare = { reciproques: reciproques.length, propositions: rdvReels.length, parVille };

  // ---------- Métriques d'entrée ----------
  const actifs = vrais.filter((u) => maintenant - (u.lastActiveAt || u.createdAt) <= INACTIF);
  const parVilleVerifies = {};
  for (const u of actifs.filter(parHumain)) {
    const v = u.profile?.city || '—';
    parVilleVerifies[v] = (parVilleVerifies[v] || 0) + 1;
  }
  const delais = decisions.filter((e) => e.p && !e.p.auto && typeof e.p.ms === 'number').map((e) => e.p.ms);
  const servis = evts('deck_served').length;
  const vides = evts('deck_empty').length;
  const avecMessageEn48h = matchsReels.filter((m) => (messages.get(m.id) || []).some((x) => x.at - m.createdAt <= 2 * JOUR)).length;
  const longues = matchsReels.filter((m) => (messages.get(m.id) || []).length > 10);
  const longuesAvecRdv = longues.filter((m) => dates.some((d) => d.matchId === m.id)).length;
  const acceptes = rdvReels.filter((d) => d.status === 'accepted' || d.acceptedAt).length;

  const entree = {
    verifiesActifsParVille: parVilleVerifies,
    delaiModerationMedianMs: mediane(delais),
    delaiModerationMesuresSur: delais.length,
    partDecouvertesServies: part(servis, servis + vides),
    partMatchsAvecMessage48h: part(avecMessageEn48h, matchsReels.length),
    partLonguesAvecProposition: part(longuesAvecRdv, longues.length),
    partPropositionsAcceptees: part(acceptes, rdvReels.length),
  };

  // ---------- Contre-métriques ----------
  // Si l'une monte, la phare ne compte plus. À lire sur la même page, jamais ailleurs.
  const nbMessagesReels = matchsReels.reduce((n, m) => n + (messages.get(m.id) || []).length, 0);
  const blocages = evts('antiscam_block');
  const parCode = {};
  for (const e of blocages) parCode[e.p?.c || '—'] = (parCode[e.p?.c || '—'] || 0) + 1;

  // Faux positifs : quelqu'un bloqué par le filtre qui n'a été ni signalé ni bloqué dans les
  // trente jours qui ont suivi. C'est le seul chemin honnête vers ce taux — un corpus écrit à
  // la main mesure son rédacteur, des messages réels mesurent le filtre.
  const suspect = (id, apres) => reports.some((r) => String(r.targetId) === String(id) && r.at >= apres && r.at - apres <= 30 * JOUR)
    || blocks.some((b) => String(b.to) === String(id));
  const bloquesSansSuite = blocages.filter((e) => !suspect(e.u, e.at)).length;

  const verifies = vrais.filter(parHumain);
  const jamaisUneCarte = verifies.filter((u) => evtsDe('deck_served', u.id).length === 0 && evtsDe('deck_empty', u.id).length > 0).length;
  const arrivesSeuls = rdvReels.filter((d) => Object.keys(d.arrivals || {}).length === 1).length;

  const contre = {
    signalementsPour100Matchs: pour100(reports.filter((r) => estReel(r.targetId) && estReel(r.from)).length, matchsReels.length),
    blocagesPour100Messages: pour100(blocages.length, nbMessagesReels),
    blocagesParCode: parCode,
    fauxPositifsApparents: part(bloquesSansSuite, blocages.length),
    suppressionsPour100Verifies: pour100(churn.dur, verifies.length),
    verifiesSansAucuneCarte: jamaisUneCarte,
    checkinsNonReciproques: arrivesSeuls,
  };

  // ---------- Ce qui rend un chiffre douteux ----------
  const avertissements = [];
  if (auMoinsUneAuto) {
    avertissements.push("Des décisions de vérification ont été rendues par AUTO_APPROVE, sans qu'un humain regarde. Elles sont exclues du délai de modération et de l'activation, mais toute statistique de vérification portant sur cette période ne dit rien.");
  }
  if (decisions.length === 0 && entonnoir.verifieParHumain === 0 && vrais.some((u) => u.verification === 'approved')) {
    avertissements.push("Des comptes sont approuvés sans qu'aucun événement verif_decided les accompagne : ils datent d'avant la mise en place de la mesure. On ne peut pas savoir si un humain a tranché, donc ils ne comptent pas comme vérifiés par un humain.");
  }
  if (phare.reciproques > 0) {
    avertissements.push("Les codes des lieux partenaires sont fixes : un check-in peut être confirmé sans s'être déplacé. La métrique phare est donc une borne haute, pas une preuve, tant que les codes ne tournent pas.");
  }
  if (!churn.datable) {
    avertissements.push("Aucun app_opened enregistré : on peut compter les comptes inactifs, pas dater leur départ.");
  }
  avertissements.push('Aucun chiffre ne remonte avant la mise en place de la mesure : rien n\'est rétroactif.');

  return {
    exclus: { total: users.length - vrais.length, demo: users.filter((u) => u.demo).length, dev: users.filter((u) => u.devUser).length, fermes: users.filter((u) => u.banned).length },
    entonnoir,
    activation,
    churn,
    phare,
    entree,
    contre,
    avertissements,
  };
}
