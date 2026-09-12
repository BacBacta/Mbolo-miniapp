// La personne de confiance : quelqu'un qui sait que tu vas à un rendez-vous.
//
// Ce filet de sécurité ne demande aucun partenariat, aucun lieu, aucune ville : il marche partout
// et dès le premier jour. Savoir qu'une amie sait où tu es et quand tu devais rentrer protège
// davantage qu'un code QR sur une table.
//
// Deux choix de données, tous les deux du côté prudent.
//
// 1. La personne de confiance donne son accord elle-même. Un bot Telegram ne peut de toute façon
//    pas écrire à quelqu'un qui ne lui a jamais parlé — mais surtout, enregistrer l'identité d'un
//    tiers qui n'a rien demandé serait une donnée personnelle sans consentement (loi camerounaise
//    n° 2024/017). Elle ouvre donc un lien, lit ce qu'elle accepte, et confirme.
//
// 2. Le prénom de l'autre membre n'est jamais transmis. Celui qui organise consent pour lui-même ;
//    l'autre n'a jamais accepté que son prénom parte chez quelqu'un qu'il ne connaît pas. Le lieu
//    et l'heure suffisent pour venir aider, et c'est tout ce qui part.
import crypto from 'node:crypto';
import { store } from './store.js';

// Le paramètre d'un lien t.me ne peut porter que 64 caractères, et seulement des lettres, des
// chiffres, « _ » et « - » : pas de place pour un jeton signé. C'est donc un code tiré au hasard,
// à usage unique et qui périme, comme le lien de la modération.
export const CODE_TTL_MS = 24 * 3600 * 1000;
export const PREFIXE = 'confiance-';

export async function creerInvitation(userId) {
  const code = crypto.randomBytes(12).toString('base64url');
  await store.updateUser(userId, { confianceCode: { code, exp: Date.now() + CODE_TTL_MS } });
  return code;
}

// Retrouve qui a émis ce code. Le balayage des comptes est assumé : c'est la même limite connue
// que la découverte, et une invitation n'est ouverte qu'une fois dans la vie d'un lien.
export async function porteurDuCode(code) {
  if (!code) return null;
  const tous = await store.allUsers();
  return tous.find((u) => u.confianceCode?.code === code && u.confianceCode.exp > Date.now()) || null;
}

// Enregistre l'accord. Le code est consommé dans tous les cas : même refusé, un lien a servi.
export async function accepter(membre, personne) {
  await store.updateUser(membre.id, {
    confianceCode: null,
    // La langue est retenue ici, et nulle part ailleurs : sans compte, on ne peut pas la relire.
    confiance: {
      id: String(personne.id),
      prenom: String(personne.first_name || '').slice(0, 40),
      lang: String(personne.language_code || '').slice(0, 5),
      at: Date.now(),
    },
  });
  return store.getUser(membre.id);
}

export const refuser = (membreId) => store.updateUser(membreId, { confianceCode: null });

// Retirer, des deux côtés. Le membre depuis l'app, la personne de confiance depuis le bot :
// elle a accepté, elle doit pouvoir revenir dessus sans passer par quelqu'un d'autre.
export const retirer = (membreId) => store.updateUser(membreId, { confiance: null, confianceCode: null });

export async function membresQuiMOntChoisi(personneId) {
  const tous = await store.allUsers();
  return tous.filter((u) => u.confiance?.id === String(personneId));
}
