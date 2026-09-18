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
  // Les amorces font-elles écrire ? Un « premier message » est le premier de **chaque** personne
  // dans un fil réel : deux par match au plus. Le numérateur vient de l'événement `amorce`, posé
  // par le serveur au premier message seulement, et jamais face à un profil de démonstration —
  // les deux côtés de la fraction excluent donc les mêmes fils.
  const premiersMessages = matchsReels.reduce((n, m) => n + new Set((messages.get(m.id) || []).map((x) => x.from)).size, 0);
  const depuisUneAmorce = evts('amorce').length;
  // Le « J'aime » sur une réponse est-il employé ? `like_sur` est posé une fois par « J'aime »
  // qui vise une question ; le dénominateur est le nombre de « J'aime » réels de la période.
  const jaimeSurReponse = evts('like_sur').length;

  const entree = {
    verifiesActifsParVille: parVilleVerifies,
    delaiModerationMedianMs: mediane(delais),
    delaiModerationMesuresSur: delais.length,
    partDecouvertesServies: part(servis, servis + vides),
    partMatchsAvecMessage48h: part(avecMessageEn48h, matchsReels.length),
    partPremiersMessagesDepuisAmorce: part(depuisUneAmorce, premiersMessages),
    jaimeSurReponse: jaimeSurReponse,
    partLonguesAvecProposition: part(longuesAvecRdv, longues.length),
    partPropositionsAcceptees: part(acceptes, rdvReels.length),
  };

  // ---------- Odo Plus ----------
  //
  // La question que la bêta doit trancher, et à laquelle rien ne répondait : **est-ce que ce
  // qu'on a mis derrière le pass intéresse quelqu'un, et est-ce que ceux qui l'ont s'en servent.**
  //
  // Deux familles de chiffres, à ne pas confondre. **La demande** : combien de fois quelqu'un a
  // voulu passer une porte fermée (`pass_refuse`), combien ont ouvert l'écran du pass (`pass_vu`,
  // ralenti à cinq minutes par personne), combien ont demandé une facture (`pass_facture`). Et
  // **l'argent** : les paiements reçus en Telegram Stars (`pass_achat`), les remboursements
  // (`pass_rembourse`), et ce que les gens font du pass une fois qu'ils l'ont (`pass_usage`).
  // Seul un achat mesure un consentement à payer ; un refus ou une visite mesure une curiosité.
  // **On compte des personnes distinctes autant que des gestes** : dix refus d'un seul membre
  // curieux ne disent pas la même chose que dix membres.
  const distinctes = (evenements) => new Set(evenements.filter((e) => estReel(e.u)).map((e) => String(e.u))).size;
  const parQuoi = (evenements) => {
    const n = {};
    for (const e of evenements.filter((x) => estReel(x.u))) n[e.p?.quoi || '—'] = (n[e.p?.quoi || '—'] || 0) + 1;
    return n;
  };
  const refus = evts('pass_refuse');
  const usages = evts('pass_usage');
  const poses = evts('pass_pose').filter((e) => estReel(e.u));
  const vus = evts('pass_vu');
  const factures = evts('pass_facture').filter((e) => estReel(e.u));
  const achats = evts('pass_achat').filter((e) => estReel(e.u));
  const rembourses = evts('pass_rembourse').filter((e) => estReel(e.u));
  const avecPass = vrais.filter((u) => Number(u.plus?.finLe) > maintenant);
  // Par durée vendue : « 30 » plutôt que 30, pour que la clé reste la même dans le JSON.
  const parDuree = {};
  for (const e of achats) { const k = Number.isFinite(e.p?.jours) ? String(e.p.jours) : '—'; parDuree[k] = (parDuree[k] || 0) + 1; }
  // Qui a eu un pass, offert ou acheté : le dénominateur de « s'en sont servis ».
  const ontEu = new Set([...poses, ...achats].map((e) => String(e.u)));

  // Le mur du quota, par palier. Une ligne posée avant le 15 septembre 2026 n'a pas de `q` :
  // elle est rangée sous « — » plutôt qu'attribuée à un palier qu'on ne connaît pas.
  const butees = evts('quota_hit').filter((e) => estReel(e.u));
  const murParPalier = {};
  for (const e of butees) {
    const cle = Number.isFinite(e.p?.q) ? String(e.p.q) : '—';
    murParPalier[cle] = (murParPalier[cle] || 0) + 1;
  }

  const plus = {
    actifs: avecPass.length,
    passPoses: poses.length,
    passRetires: evts('pass_retire').filter((e) => estReel(e.u)).length,
    // La demande : ceux qui ont voulu et n'ont pas pu.
    refusGestes: refus.filter((e) => estReel(e.u)).length,
    refusPersonnes: distinctes(refus),
    refusParPorte: parQuoi(refus),
    // L'usage : ceux qui ont pu, et qui y sont allés.
    usagePersonnes: distinctes(usages),
    usageParPorte: parQuoi(usages),
    // Sur ceux qui ont eu un pass, combien s'en sont servis au moins une fois. C'est le chiffre
    // qui dit si le pass tient sa promesse, et il ne vaut que sur de vrais membres.
    partQuiSEnServent: part(distinctes(usages), ontEu.size),
    // L'écran du pass : qui l'a ouvert, et par quelle porte. C'est le haut de l'entonnoir d'achat.
    vusPersonnes: distinctes(vus),
    vusParPorte: parQuoi(vus),
    facturesDemandees: factures.length,
    // L'argent. `starsEncaisses` retire les remboursements : c'est ce qui reste, pas ce qui est passé.
    achats: achats.length,
    achatsPersonnes: distinctes(achats),
    achatsParDuree: parDuree,
    starsEncaisses: achats.reduce((n, e) => n + (Number(e.p?.stars) || 0), 0) - rembourses.reduce((n, e) => n + (Number(e.p?.stars) || 0), 0),
    joursVendus: achats.reduce((n, e) => n + (Number(e.p?.jours) || 0), 0),
    rembourses: rembourses.length,
    // La conversion : sur ceux qui ont vu l'écran, combien ont payé. Personnes, pas gestes —
    // et l'écran s'ouvre aussi depuis l'onglet Profil par curiosité, donc c'est une borne basse.
    partVusQuiAchetent: part(distinctes(achats), distinctes(vus)),
    murDuQuotaGestes: butees.length,
    murDuQuotaPersonnes: distinctes(butees),
    murParPalier,
  };

  // ---------- Provenance ----------
  //
  // Par quel canal les gens sont arrivés, et surtout : **par quel canal arrivent ceux qui
  // restent.** Un canal qui amène cent curieux dont aucun ne crée de profil vaut moins qu'un
  // canal qui en amène dix dont six s'activent, et le total d'arrivées ne permet pas de les
  // distinguer. C'est donc l'entonnoir entier qui est redécoupé, pas seulement son premier palier.
  //
  // Le mot vient du lien de diffusion et vaut ce que vaut un lien : **n'importe qui peut ouvrir
  // ?startapp=ref_campus sans avoir jamais vu le campus.** C'est un chiffre de pilotage, pas une
  // facture — un avertissement le redit à côté du tableau. Le jour où un lieu serait payé au
  // rendez-vous confirmé (P2-1), ce n'est pas ce chiffre-là qui pourrait servir de base.
  //
  // `—` n'est pas un canal : c'est l'absence de canal. Il porte ceux qui sont arrivés par un lien
  // nu, et **tous ceux qui existaient avant ce mécanisme** : rien n'est rétroactif ici non plus.
  const provenance = {};
  for (const u of vrais) {
    const cle = u.source || '—';
    const p0 = provenance[cle] || (provenance[cle] = { comptes: 0, profil: 0, verifies: 0, actives: 0, mursActivation: 0 });
    p0.comptes += 1;
    if (u.profileSavedAt || u.profile) p0.profil += 1;
    if (parHumain(u)) p0.verifies += 1;
    // Seuls les comptes qui ont eu leurs quatorze jours entrent au dénominateur, ici comme
    // dans la section Activation : sans ça, un canal ouvert hier paraîtrait mauvais.
    if (maintenant - u.createdAt >= FENETRE) {
      p0.mursActivation += 1;
      if (active(u)) p0.actives += 1;
    }
  }
  for (const p0 of Object.values(provenance)) {
    p0.partProfil = part(p0.profil, p0.comptes);
    p0.partActivation = part(p0.actives, p0.mursActivation);
  }

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
  if (plus.achats === 0 && (plus.actifs > 0 || plus.passPoses > 0)) {
    avertissements.push("Aucun pass n'a été vendu : tous ont été offerts à la main depuis le groupe de modération. Les refus mesurent une curiosité, jamais un consentement à payer — seul un achat en Stars le mesure.");
  }
  if (plus.vusPersonnes > 0) {
    avertissements.push("La conversion compte les personnes qui ont ouvert l'écran du pass, par une porte fermée ou depuis l'onglet Profil par curiosité : c'est une borne basse. Et pass_vu est ralenti à cinq minutes par personne, donc les gestes ne se comptent pas, seules les personnes.");
  }
  if (butees.some((e) => !Number.isFinite(e.p?.q))) {
    avertissements.push("Des lignes quota_hit n'indiquent pas le palier touché : elles datent d'avant le 15 septembre 2026, quand le quota valait 20. Elles sont rangées sous « — » et ne disent pas quel mur les gens rencontraient.");
  }
  if (!churn.datable) {
    avertissements.push("Aucun app_opened enregistré : on peut compter les comptes inactifs, pas dater leur départ.");
  }
  if (Object.keys(provenance).some((k) => k !== '—')) {
    avertissements.push("La provenance se déclare par le lien d'ouverture : n'importe qui peut ouvrir ?startapp=ref_campus sans venir du campus. Ces parts orientent la diffusion, elles ne prouvent rien et ne peuvent servir de base à aucune facturation.");
  }
  avertissements.push('Aucun chiffre ne remonte avant la mise en place de la mesure : rien n\'est rétroactif.');

  return {
    exclus: { total: users.length - vrais.length, demo: users.filter((u) => u.demo).length, dev: users.filter((u) => u.devUser).length, fermes: users.filter((u) => u.banned).length },
    entonnoir,
    activation,
    churn,
    phare,
    plus,
    entree,
    contre,
    provenance,
    avertissements,
  };
}
