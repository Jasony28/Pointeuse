import { isStealthMode } from "../app.js";
import { collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db } from "../app.js";

// Listes de base (employés, chantiers, collègues) : gardées en mémoire quelques minutes au lieu d'être
// retéléchargées à chaque page (comme la Pointeuse LPF). forceRefresh = true après une modification faite par l'admin.
const LISTS_TTL_MS = 5 * 60 * 1000;
let chantiersCache = null;
let allChantiersCache = null;
let teamMembersCache = null;
let usersCache = null;
let colleaguesCache = null;

const fresh = (entry) => entry && Date.now() - entry.at < LISTS_TTL_MS;
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

/** Tous les chantiers (actifs ou non), triés par nom. */
export async function getAllChantiers(forceRefresh = false) {
    if (fresh(allChantiersCache) && !forceRefresh) return allChantiersCache.list;
    const snapshot = await getDocs(query(collection(db, "chantiers"), orderBy("name")));
    allChantiersCache = { at: Date.now(), list: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    chantiersCache = null;
    return allChantiersCache.list;
}

export async function getActiveChantiers(forceRefresh = false) {
    if (chantiersCache && fresh(allChantiersCache) && !forceRefresh) return chantiersCache;
    const all = await getAllChantiers(forceRefresh);
    chantiersCache = all.filter(c => c.status === 'active').sort(byName);
    return chantiersCache;
}

/** Collègues hors appli (liste « colleagues »), triés par nom. */
export async function getColleagues(forceRefresh = false) {
    if (fresh(colleaguesCache) && !forceRefresh) return colleaguesCache.list;
    const snapshot = await getDocs(query(collection(db, "colleagues"), orderBy("name")));
    colleaguesCache = { at: Date.now(), list: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    return colleaguesCache.list;
}

export async function getTeamMembers(forceRefresh = false) {
    if (!teamMembersCache || forceRefresh || !fresh(usersCache)) {
        const users = await getUsers(forceRefresh);
        teamMembersCache = users
            .filter(user => user.status === 'approved' && (user.role === 'user' || user.role === 'admin'))
            .map(user => ({ id: user.id, name: user.displayName }));
    }
    return teamMembersCache;
}

/** Tous les comptes, y compris ceux masqués (rapports admin). */
export async function getAllUsers(forceRefresh = false) {
    if (fresh(usersCache) && !forceRefresh) return usersCache.list;
    const snapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
    usersCache = { at: Date.now(), list: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
    return usersCache.list;
}

/** Comptes visibles (les comptes masqués n'apparaissent qu'en mode discret). */
export async function getUsers(forceRefresh = false) {
    const users = await getAllUsers(forceRefresh);
    if (isStealthMode()) return users;
    return users.filter(user => user.visibility !== 'hidden');
}

/** Noms des collègues + des comptes validés et de leurs profils, sans doublon, triés (listes « avec qui ? »). */
export async function getColleagueNames() {
    const [colleagues, users] = await Promise.all([getColleagues(), getAllUsers()]);
    const approved = users.filter(u => u.status === 'approved');
    const names = [...colleagues.map(c => c.name), ...approved.map(u => u.displayName), ...approved.flatMap(u => u.profiles || [])].filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
