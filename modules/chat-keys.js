// Messagerie par profil : un compte peut avoir plusieurs profils (Thomas, Julie… sur le même téléphone).
// Chaque profil est un membre à part entière d'une discussion, repéré par une clé « uid__nom-du-profil ».
// Les règles Firestore, elles, ne connaissent que le compte : le champ « participants » garde les uid des comptes.
//
// Anciennes discussions (avant la messagerie par profil) : pas de champ « members », les membres sont les comptes
// eux-mêmes (clé = uid) et la discussion reste partagée par tous les profils du compte, comme avant.

// Profils de dépannage, jamais proposés dans la messagerie
const BLOCKED_PROFILE = /extra|ne pas utiliser/i;

/** Nom du profil réduit à des lettres, chiffres et tirets : « Élodie Martin » → « elodie-martin » */
export function profileSlug(name) {
    const slug = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'profil';
}

export const profileKey = (uid, profileName) => `${uid}__${profileSlug(profileName)}`;
export const uidOfKey = (key) => String(key || '').split('__')[0];

/** Discussion au nouveau format (membres = profils) ? */
export const isProfileChat = (chat) => Array.isArray(chat?.members);

/** Clés des membres : profils (nouveau format) ou comptes (ancien format) */
export const memberKeys = (chat) => (isProfileChat(chat) ? chat.members : chat?.participants) || [];

/** Ma clé dans cette discussion, pour le profil actif */
export const myChatKey = (chat, uid, profileName) => (isProfileChat(chat) ? profileKey(uid, profileName) : uid);

/** La discussion concerne-t-elle le profil actif ? */
export const isMyChat = (chat, uid, profileName) => memberKeys(chat).includes(myChatKey(chat, uid, profileName));

/** Tous les profils des comptes validés : [{ key, uid, name, account }] */
export function profileDirectory(users) {
    const seen = new Set();
    const list = [];
    for (const u of users || []) {
        if (u.status && u.status !== 'approved') continue;
        const names = (u.profiles && u.profiles.length ? u.profiles : [u.displayName]).filter(Boolean);
        for (const name of names) {
            if (BLOCKED_PROFILE.test(name)) continue;
            const key = profileKey(u.id, name);
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({ key, uid: u.id, name, account: u.displayName || u.email || '', accountProfiles: names.length });
        }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
