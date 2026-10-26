// modules/admin-team.js

import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal, isStealthMode } from "../app.js";
import { getUsers } from "./data-service.js";
import { formatMilliseconds } from "./utils.js";

/**
 * Point d'entrée principal : Rend l'interface de gestion de l'équipe
 */
export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <div>
                <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">Gestion de l'Équipe</h2>
                <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Comptes, profils, codes et rôles des membres de l'équipe.</p>
            </div>

            <div id="team-stats" class="team-stats"></div>

            <div class="hours-toolbar">
                <div class="hours-search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input type="search" id="team-search" placeholder="Rechercher un nom, un profil ou un e-mail…" autocomplete="off">
                </div>
                <div class="segmented" role="group" aria-label="Filtrer">
                    <button type="button" data-filter="all" class="team-filter is-active">Tous</button>
                    <button type="button" data-filter="approved" class="team-filter">Actifs</button>
                    <button type="button" data-filter="pending" class="team-filter">En attente</button>
                    <button type="button" data-filter="admin" class="team-filter">Admins</button>
                </div>
            </div>

            <div id="user-list-container" class="space-y-5">
                <div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div>
            </div>
            
            ${isStealthMode() ? `
            <div class="team-card">
                <h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Autres collègues externes</h3>
                <div class="flex gap-2">
                    <input type="text" id="new-colleague-name" placeholder="Nom du nouveau collègue…" class="input flex-1">
                    <button id="add-colleague-btn" class="btn btn-primary">Ajouter</button>
                </div>
                <div id="colleagues-list-container" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement des collègues...</p>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    setupGlobalHandlers();

    await loadUsers();
    if (isStealthMode()) {
        await loadColleagues();
    }
}

/**
 * Configure les écouteurs sur les éléments persistants et les modales
 */
function setupGlobalHandlers() {
    document.getElementById('team-search')?.addEventListener('input', renderUserList);
    document.querySelectorAll('.team-filter').forEach(btn => btn.onclick = () => {
        teamFilter = btn.dataset.filter;
        document.querySelectorAll('.team-filter').forEach(b => b.classList.toggle('is-active', b === btn));
        renderUserList();
    });

    if (isStealthMode()) {
        const addColleagueBtn = document.getElementById('add-colleague-btn');
        if (addColleagueBtn) {
            addColleagueBtn.onclick = async () => {
                const input = document.getElementById('new-colleague-name');
                const name = input.value.trim();
                if (!name) return;

                try {
                    await addDoc(collection(db, "colleagues"), {
                        name: name,
                        createdAt: serverTimestamp()
                    });
                    input.value = '';
                    showInfoModal("Succès", `Collègue externe "${name}" ajouté.`);
                    await loadColleagues();
                } catch (error) {
                    console.error("Erreur ajout collègue:", error);
                    showInfoModal("Erreur", "Impossible d'ajouter le collègue.");
                }
            };
        }
    }
}

/**
 * Charge la liste des utilisateurs enregistrés
 */
let teamUsers = [];
let teamFilter = 'all';

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
const STATUS_LABELS = { approved: 'Actif', pending: 'En attente', banned: 'Banni' };
const teamIcons = {
    history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/></svg>',
    role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
};
const profilesOf = (user) => (user.profiles && user.profiles.length) ? user.profiles : [user.displayName];

async function loadUsers() {
    const listContainer = document.getElementById('user-list-container');
    if (!listContainer) return;

    try {
        teamUsers = await getUsers(true); // Forcer la mise à jour du cache local
        renderTeamStats();
        renderUserList();
    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        listContainer.innerHTML = '<p class="hours-empty">Erreur lors du chargement des profils.</p>';
    }
}

function renderTeamStats() {
    const container = document.getElementById('team-stats');
    if (!container) return;
    const count = (fn) => teamUsers.filter(fn).length;
    const pendingCount = count(u => u.status !== 'approved' && u.status !== 'banned');
    const stats = [
        ['Comptes', teamUsers.length, ''],
        ['Profils', teamUsers.reduce((sum, u) => sum + profilesOf(u).length, 0), ''],
        ['En attente', pendingCount, pendingCount ? 'is-warn' : ''],
        ['Admins', count(u => u.role === 'admin'), ''],
    ];
    container.innerHTML = stats.map(([label, value, tone]) => `<div class="team-stat ${tone}"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function renderUserList() {
    const listContainer = document.getElementById('user-list-container');
    if (!listContainer) return;

    const term = (document.getElementById('team-search')?.value || '').toLowerCase().trim();
    const isPending = (u) => u.status !== 'approved' && u.status !== 'banned';
    const filters = {
        all: () => true,
        approved: (u) => u.status === 'approved',
        pending: isPending,
        admin: (u) => u.role === 'admin',
    };
    const matches = (u) => [u.displayName, u.email, ...profilesOf(u)].some(v => (v || '').toLowerCase().includes(term));
    const list = teamUsers.filter(filters[teamFilter]).filter(matches);

    listContainer.innerHTML = '';
    if (!list.length) {
        listContainer.innerHTML = `<p class="hours-empty">${teamUsers.length ? 'Aucun membre ne correspond.' : 'Aucun utilisateur trouvé.'}</p>`;
        return;
    }

    // Les comptes en attente d'approbation passent en premier
    const pending = list.filter(isPending);
    const others = list.filter(u => !isPending(u));
    const addSection = (title, users, highlight) => {
        if (!users.length) return;
        const section = document.createElement('section');
        section.innerHTML = `<h3 class="kpi-label mb-2">${title} · ${users.length}</h3>`;
        const grid = document.createElement('div');
        grid.className = 'team-grid';
        users.forEach(user => grid.appendChild(createUserCard(user, highlight)));
        section.appendChild(grid);
        listContainer.appendChild(section);
    };
    addSection('À approuver', pending, true);
    addSection(pending.length ? 'Comptes' : 'Tous les comptes', others, false);
}

function createUserCard(user, highlight) {
    const div = document.createElement('div');
    div.className = `team-card${highlight ? ' is-pending' : ''}`;

    const isApproved = user.status === 'approved';
    const isAdminRole = user.role === 'admin';
    const status = user.status || 'pending';
    const profiles = profilesOf(user);
    const pins = user.profilePins || {};

    div.innerHTML = `
        <div class="team-card-head">
            <span class="avatar team-avatar">${escapeHTML(initials(user.displayName))}</span>
            <div class="min-w-0" style="flex: 1;">
                <button type="button" class="user-name-clickable team-name" title="Historique de tous les profils">${escapeHTML(user.displayName || 'Sans nom')}</button>
                <div class="cchips" style="padding-top: 0.25rem;">
                    <span class="cchip team-status-${escapeHTML(status)}">${STATUS_LABELS[status] || escapeHTML(status)}</span>
                    <span class="cchip${isAdminRole ? ' team-admin' : ''}">${isAdminRole ? 'Administrateur' : 'Employé'}</span>
                </div>
            </div>
        </div>
        <div class="team-contact">
            <span>${escapeHTML(user.email || 'E-mail non renseigné')}</span>
            ${user.gsm ? `<a href="tel:${escapeHTML(user.gsm)}">${escapeHTML(user.gsm)}</a>` : ''}
        </div>
        <div class="team-profiles">
            <p class="team-profiles-title">Profils · ${profiles.length}</p>
            ${profiles.map((name, i) => `
                <div class="team-profile" data-index="${i}">
                    <button type="button" class="team-profile-name" title="Voir l'historique de ce profil">${escapeHTML(name)}</button>
                    ${pins[name] ? '<span class="profile-lock-badge" title="Ce profil est protégé par un code à 4 chiffres">Code</span>' : ''}
                    <div class="team-profile-actions">
                        ${pins[name] ? `
                            <button type="button" data-profile-action="show-pin" class="team-profile-btn is-mono">Voir le code</button>
                            <button type="button" data-profile-action="remove-pin" class="team-profile-btn">Retirer le code</button>
                        ` : ''}
                        <button type="button" data-profile-action="delete" class="icon-btn is-danger" title="Supprimer le profil" aria-label="Supprimer le profil ${escapeHTML(name)}">${teamIcons.trash}</button>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="team-actions">
            <button data-action="status" class="btn ${isApproved ? 'btn-secondary' : 'btn-primary'}">${isApproved ? 'Suspendre' : 'Approuver'}</button>
            <button data-action="history" class="icon-btn" title="Historique de tous les profils" aria-label="Historique de tous les profils">${teamIcons.history}</button>
            <button data-action="role" class="icon-btn" title="Passer ${isAdminRole ? 'Employé' : 'Admin'}" aria-label="Passer ${isAdminRole ? 'Employé' : 'Admin'}">${teamIcons.role}</button>
            <button data-action="delete" class="icon-btn is-danger" title="Supprimer le compte" aria-label="Supprimer le compte">${teamIcons.trash}</button>
        </div>
    `;

    // Clic sur le compte principal : viewAll = true
    const openAccountHistory = () => navigateTo('user-history', {
        userId: user.id,
        userName: `${user.displayName} (Tous les profils)`,
        viewAll: true
    });
    div.querySelector('.user-name-clickable').onclick = openAccountHistory;
    div.querySelector('[data-action="history"]').onclick = openAccountHistory;

    div.querySelector('[data-action="status"]').onclick = async () => {
        const nextStatus = isApproved ? 'pending' : 'approved';
        if (await showConfirmationModal("Modifier le statut", `${isApproved ? 'Suspendre' : 'Approuver'} le compte de "${user.displayName}" ?`)) {
            await updateDoc(doc(db, "users", user.id), { status: nextStatus });
            await loadUsers();
        }
    };

    div.querySelector('[data-action="role"]').onclick = async () => {
        const nextRole = isAdminRole ? 'user' : 'admin';
        if (await showConfirmationModal("Modifier le rôle", `Passer "${user.displayName}" en ${isAdminRole ? 'employé' : 'administrateur'} ?`)) {
            await updateDoc(doc(db, "users", user.id), { role: nextRole });
            await loadUsers();
        }
    };

    div.querySelector('[data-action="delete"]').onclick = async () => {
        if (await showConfirmationModal("Suppression", `Vraiment supprimer définitivement le compte "${user.displayName}" et tous ses profils ?`)) {
            await deleteDoc(doc(db, "users", user.id));
            await loadUsers();
        }
    };

    // Profils du compte : chacun a son propre historique et son propre code
    div.querySelectorAll('.team-profile').forEach(row => {
        const profileName = profiles[Number(row.dataset.index)];
        // Clic sur un profil spécifique : viewAll = false
        row.querySelector('.team-profile-name').onclick = () => navigateTo('user-history', {
            userId: user.id,
            userName: profileName,
            viewAll: false
        });
        const showPinBtn = row.querySelector('[data-profile-action="show-pin"]');
        if (showPinBtn) {
            // Code oublié : l'admin peut le lire (masqué par défaut) ou le retirer
            showPinBtn.onclick = () => {
                const visible = showPinBtn.dataset.visible === '1';
                showPinBtn.dataset.visible = visible ? '' : '1';
                showPinBtn.textContent = visible ? 'Voir le code' : `Code : ${pins[profileName]}`;
            };
            row.querySelector('[data-profile-action="remove-pin"]').onclick = () => removeProfilePin(user.id, profileName, pins);
        }
        row.querySelector('[data-profile-action="delete"]').onclick = () => deleteProfile(user.id, profileName, profiles);
    });

    return div;
}

/**
 * Retire le code à 4 chiffres d'un profil (code oublié)
 */
async function removeProfilePin(uid, profileName, currentPins) {
    if (!await showConfirmationModal("Retirer le code", `Retirer le code du profil "${profileName}" ? N'importe qui pourra de nouveau passer sur ce profil, jusqu'à ce qu'un nouveau code soit choisi dans les Paramètres.`)) return;
    try {
        const pins = { ...(currentPins || {}) };
        delete pins[profileName];
        await updateDoc(doc(db, "users", uid), { profilePins: pins });
        if (uid === currentUser.uid) currentUser.profilePins = pins;
        showInfoModal("Succès", `Le code du profil "${profileName}" a été retiré.`);
        await getUsers(true);
        loadUsers();
    } catch (error) {
        console.error(error);
        showInfoModal("Erreur", "Impossible de retirer le code.");
    }
}

/**
 * Fonction de suppression d'un sous-profil
 */
async function deleteProfile(uid, profileNameToDelete, currentProfiles) {
    if (currentProfiles.length <= 1) {
        showInfoModal("Action Impossible", "Vous ne pouvez pas supprimer le dernier profil d'un compte. Si l'employé a quitté l'entreprise, supprimez plutôt son compte entier (icône corbeille en bas de sa fiche).");
        return;
    }

    const message = `Voulez-vous vraiment supprimer le profil "${profileNameToDelete}" ?\n\nNote : L'historique de ses pointages sera conservé dans la base, mais le profil n'apparaîtra plus à la connexion.`;
    
    if (await showConfirmationModal("Supprimer un profil", message)) {
        try {
            const updatedProfiles = currentProfiles.filter(p => p !== profileNameToDelete);
            const user = (await getUsers()).find(u => u.id === uid);
            const pins = { ...(user?.profilePins || {}) };
            const declined = { ...(user?.profilePinDeclined || {}) };
            delete pins[profileNameToDelete];
            delete declined[profileNameToDelete];
            await updateDoc(doc(db, "users", uid), { profiles: updatedProfiles, profilePins: pins, profilePinDeclined: declined });
            if (uid === currentUser.uid) { currentUser.profiles = updatedProfiles; currentUser.profilePins = pins; currentUser.profilePinDeclined = declined; }
            
            showInfoModal("Succès", `Le profil "${profileNameToDelete}" a été supprimé.`);
            await getUsers(true); 
            loadUsers(); 
        } catch (error) {
            console.error(error);
            showInfoModal("Erreur", "Impossible de supprimer le profil.");
        }
    }
}

/**
 * Récupère et affiche la liste des collègues externes
 */
async function loadColleagues() {
    const listContainer = document.getElementById('colleagues-list-container');
    if (!listContainer) return;
    try {
        const q = query(collection(db, "colleagues"), orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        listContainer.innerHTML = "";
        
        if (querySnapshot.empty) {
            listContainer.innerHTML = "<p class='hours-empty col-span-full'>Aucun collègue externe trouvé.</p>";
            return;
        }
        
        querySnapshot.forEach(docSnap => {
            listContainer.appendChild(createColleagueElement(docSnap.id, docSnap.data().name));
        });
    } catch (error) {
        listContainer.innerHTML = "<p class='hours-empty col-span-full'>Erreur de chargement des collègues.</p>";
    }
}

/**
 * Crée le composant DOM pour un collègue externe
 */
function createColleagueElement(id, name) {
    const div = document.createElement('div');
    div.className = 'team-profile';
    div.innerHTML = `<span class="team-profile-label">${escapeHTML(name)}</span>`;

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = teamIcons.trash;
    deleteBtn.className = 'icon-btn is-danger';
    deleteBtn.title = 'Supprimer';
    deleteBtn.setAttribute('aria-label', `Supprimer ${name}`);
    deleteBtn.onclick = async () => {
        if (await showConfirmationModal("Confirmation", `Vraiment supprimer "${name}" ?`)) {
            try {
                await deleteDoc(doc(db, "colleagues", id));
                loadColleagues();
            } catch (error) {
                showInfoModal("Erreur", "La suppression a échoué.");
            }
        }
    };
    div.appendChild(deleteBtn);
    return div;
}