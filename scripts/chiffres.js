#!/usr/bin/env node
// Sort les chiffres de la bêta, en une page, depuis la base — fichier JSON ou PostgreSQL.
//
//   npm run chiffres
//   npm run --silent chiffres -- --json   (sortie lisible à la machine)
//
// --silent, sinon npm écrit sa bannière sur la sortie standard et le JSON n'est plus du JSON.
// Les diagnostics du serveur (migrations, mode de stockage) partent sur la sortie d'erreur,
// justement pour que celle-ci reste propre.
//
// Rien n'est envoyé nulle part : le script lit, calcule, affiche. Le plan est dans
// audit/05-mesure-produit.md, le calcul dans server/chiffres.js.
import { store, modeStockage } from '../server/store.js';
import { collecter, calculer } from '../server/chiffres.js';
import { config } from '../server/config.js';

const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 1000) / 10} %`);
const nb = (x) => (x === null || x === undefined ? '—' : String(x));
const duree = (ms) => {
  if (ms === null || ms === undefined) return '—';
  const h = ms / 3600e3;
  if (h < 1) return `${Math.round(ms / 60e3)} min`;
  return h < 48 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h / 24)} j`;
};
const titre = (t) => `\n\x1b[1m${t}\x1b[0m`;
const ligne = (nom, valeur, note = '') => `  ${nom.padEnd(46)} ${String(valeur).padStart(10)}${note ? `   ${note}` : ''}`;
const liste = (o) => (Object.keys(o).length ? Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => ligne(`  ${k}`, v)).join('\n') : '  (aucun)');

const r = calculer(await collecter(store));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

const e = r.entonnoir;
const p = (n) => (e.comptes ? `${Math.round((n / e.comptes) * 1000) / 10} %` : '—');

console.log(`\nMesure produit — ${config.appName}, stockage ${modeStockage}, ${new Date().toLocaleString('fr-FR')}`);
console.log(`Comptes écartés du calcul : ${r.exclus.total} (démonstration ${r.exclus.demo}, développement ${r.exclus.dev}, fermés ${r.exclus.fermes})`);

console.log(titre("Entonnoir d'inscription"));
console.log(ligne('comptes réels', e.comptes));
console.log(ligne('profil enregistré', e.profil, p(e.profil)));
console.log(ligne('selfie envoyé', e.selfie, p(e.selfie)));
console.log(ligne('vérifié par un humain', e.verifieParHumain, p(e.verifieParHumain)));
console.log(ligne('premier « J\'aime »', e.premierLike, p(e.premierLike)));
console.log(ligne('premier match', e.premierMatch, p(e.premierMatch)));
console.log(ligne('premier message à une personne réelle', e.premierMessage, p(e.premierMessage)));

console.log(titre('Activation, churn'));
console.log(ligne('activées en 14 jours', `${r.activation.actives}/${r.activation.sur}`, pct(r.activation.part)));
console.log(ligne('comptes supprimés', r.churn.dur));
console.log(ligne('inactifs depuis plus de 21 jours', r.churn.silencieux));

console.log(titre('Métrique phare : rendez-vous confirmés des deux côtés'));
console.log(ligne('check-in réciproques', r.phare.reciproques));
console.log(ligne('sur propositions', r.phare.propositions));
console.log('  par ville :');
console.log(liste(r.phare.parVille));

console.log(titre("Ce qui la fait monter"));
console.log('  vérifiés et actifs, par ville :');
console.log(liste(r.entree.verifiesActifsParVille));
console.log(ligne('délai médian de modération', duree(r.entree.delaiModerationMedianMs), `sur ${r.entree.delaiModerationMesuresSur} décision(s) humaine(s)`));
console.log(ligne('découvertes qui rendent une carte', pct(r.entree.partDecouvertesServies)));
console.log(ligne('matchs avec un message en 48 h', pct(r.entree.partMatchsAvecMessage48h)));
console.log(ligne('discussions longues avec proposition', pct(r.entree.partLonguesAvecProposition)));
console.log(ligne('propositions acceptées', pct(r.entree.partPropositionsAcceptees)));

console.log(titre('Odo Plus — la demande, et l\'usage'));
console.log(ligne('pass actifs en ce moment', r.plus.actifs));
console.log(ligne('pass posés à la main', r.plus.passPoses, r.plus.passRetires ? `${r.plus.passRetires} retiré(s)` : ''));
console.log(ligne('refusés faute de pass', r.plus.refusGestes, `${r.plus.refusPersonnes} personne(s)`));
console.log('  par porte fermée :');
console.log(liste(r.plus.refusParPorte));
console.log(ligne('s\'en sont servis', r.plus.usagePersonnes, pct(r.plus.partQuiSEnServent) + ' de ceux qui l\'ont eu'));
console.log('  par porte ouverte :');
console.log(liste(r.plus.usageParPorte));
console.log(ligne('ont buté sur le quota du jour', r.plus.murDuQuotaGestes, `${r.plus.murDuQuotaPersonnes} personne(s)`));
console.log('  par palier touché :');
console.log(liste(r.plus.murParPalier));

console.log(titre('Contre-métriques — si l\'une monte, la phare ne compte plus'));
console.log(ligne('signalements pour 100 matchs', nb(r.contre.signalementsPour100Matchs)));
console.log(ligne('blocages anti-arnaque pour 100 messages', nb(r.contre.blocagesPour100Messages)));
console.log('  par code :');
console.log(liste(r.contre.blocagesParCode));
console.log(ligne('blocages sans signalement ni blocage ensuite', pct(r.contre.fauxPositifsApparents), 'faux positifs apparents'));
console.log(ligne('suppressions pour 100 vérifiés', nb(r.contre.suppressionsPour100Verifies)));
console.log(ligne('vérifiés n\'ayant jamais vu une carte', r.contre.verifiesSansAucuneCarte));
console.log(ligne('check-in où une seule personne est venue', r.contre.checkinsNonReciproques));

console.log(titre('À lire avant de conclure'));
for (const a of r.avertissements) console.log(`  • ${a}`);
console.log('');
process.exit(0);
