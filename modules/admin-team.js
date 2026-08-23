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
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 class="text-2xl font-bold" style="color: var(--color-text-base);">👥 Gestion de l'Équipe</h2>
            </div>
            
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border); color: var(--color-text-base);">Utilisateurs de l'application</h3>
                <div id="user-list-container">
                    <p class="text-center" style="color: var(--color-text-muted);">Chargement...</p>
                </div>
            </div>
            
            ${isStealthMode() ? `
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border); color: var(--color-text-base);">Autres Collègues Externes</h3>
                <div class="flex gap-2 mb-4">
                    <input type="text" id="new-colleague-name" placeholder="Nom du nouveau collègue..." 
                           class="border p-2 text-sm rounded flex-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                    <button id="add-colleague-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                        Ajouter
                    </button>
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
async function loadUsers() {
    const listContainer = document.getElementById('user-list-container');
    if (!listContainer) return;

    try {
        const users = await getUsers(true); // Forcer la mise à jour du cache local
        if (users.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-sm" style="color: var(--color-text-muted);">Aucun utilisateur trouvé.</p>';
            return;
        }

        listContainer.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'p-3 rounded-lg border flex flex-col md:flex-row justify-between md:items-center gap-4 text-sm mb-2 shadow-sm';
            div.style.backgroundColor = 'var(--color-background)';
            div.style.borderColor = 'var(--color-border)';

            const isApproved = user.status === 'approved';
            const isAdminRole = user.role === 'admin';

            div.innerHTML = `
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="user-name-clickable font-bold text-base cursor-pointer hover:underline text-blue-600 dark:text-blue-400" style="color: var(--color-primary);">${user.displayName || 'Sans nom'}</span>
                        <span class="text-xs px-2 py-0.5 rounded font-semibold ${isApproved ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}">
                            ${user.status || 'pending'}
                        </span>
                        <span class="text-xs px-2 py-0.5 rounded font-semibold ${isAdminRole ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">
                            ${user.role || 'user'}
                        </span>
                    </div>
                    <div class="text-xs flex gap-4" style="color: var(--color-text-muted);">
                        <span>📧 ${user.email || 'Non renseigné'}</span>
                        ${user.gsm ? `<span>📱 ${user.gsm}</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap md:justify-end">
                    <button data-action="status" class="px-3 py-1.5 text-xs font-semibold rounded text-white ${isApproved ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}">
                        ${isApproved ? 'Suspendre' : 'Approuver'}
                    </button>
                    <button data-action="role" class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 text-xs font-semibold rounded">
                        Passer ${isAdminRole ? 'User' : 'Admin'}
                    </button>
                    <button data-action="delete" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 text-xs font-semibold rounded">
                        Supprimer
                    </button>
                </div>
            `;

            // Clic sur le compte principal : viewAll = true
            div.querySelector('.user-name-clickable').onclick = () => {
                navigateTo('user-history', { 
                    userId: user.id, 
                    userName: `${user.displayName} (Tous les profils)`, 
                    viewAll: true 
                });
            };

            div.querySelector('[data-action="status"]').onclick = async () => {
                const nextStatus = isApproved ? 'pending' : 'approved';
                if (await showConfirmationModal("Modifier le statut", `Changer le statut de "${user.displayName}" en "${nextStatus}" ?`)) {
                    await updateDoc(doc(db, "users", user.id), { status: nextStatus });
                    await loadUsers();
                }
            };

            div.querySelector('[data-action="role"]').onclick = async () => {
                const nextRole = isAdminRole ? 'user' : 'admin';
                if (await showConfirmationModal("Modifier le rôle", `Changer le rôle de "${user.displayName}" en "${nextRole}" ?`)) {
                    await updateDoc(doc(db, "users", user.id), { role: nextRole });
                    await loadUsers();
                }
            };

            div.querySelector('[data-action="delete"]').onclick = async () => {
                if (await showConfirmationModal("Suppression", `⚠️ Vraiment supprimer définitivement l'utilisateur "${user.displayName}" ?`)) {
                    await deleteDoc(doc(db, "users", user.id));
                    await loadUsers();
                }
            };

            listContainer.appendChild(div);

            // CORPS : LISTE DES PROFILS (Cliquables individuellement)
            const profilesSection = document.createElement('div');
            profilesSection.className = 'px-4 pb-4 w-full';

            const profilesTitle = document.createElement('p');
            profilesTitle.className = 'text-xs font-bold uppercase tracking-wider mb-3 mt-2';
            profilesTitle.style.color = 'var(--color-text-muted)';
            profilesTitle.textContent = 'Profils associés à ce compte :';
            profilesSection.appendChild(profilesTitle);

            const profiles = user.profiles || [user.displayName];
            const profilesGrid = document.createElement('div');
            profilesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';

            profiles.forEach(profileName => {
                const profileRow = document.createElement('div');
                profileRow.className = 'flex justify-between items-center p-3 rounded-lg border transition-colors hover:shadow-md';
                profileRow.style.backgroundColor = 'var(--color-background)';
                profileRow.style.borderColor = 'var(--color-border)';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'font-bold cursor-pointer hover:underline flex items-center gap-2';
                nameSpan.style.color = 'var(--color-primary)';
                nameSpan.innerHTML = `👤 ${profileName}`;
                nameSpan.title = "Voir l'historique unique de ce profil";
                
                // Clic sur un profil spécifique : viewAll = false
                nameSpan.onclick = () => navigateTo('user-history', { 
                    userId: user.id, 
                    userName: profileName,
                    viewAll: false 
                });

                profileRow.appendChild(nameSpan);

                const deleteProfBtn = document.createElement('button');
                deleteProfBtn.className = 'text-xs font-bold text-red-600 hover:text-white bg-red-100 hover:bg-red-600 px-3 py-1.5 rounded transition-colors';
                deleteProfBtn.textContent = 'Supprimer';
                deleteProfBtn.onclick = () => deleteProfile(user.id, profileName, profiles);

                profileRow.appendChild(deleteProfBtn);
                profilesGrid.appendChild(profileRow);
            });

            profilesSection.appendChild(profilesGrid);
            listContainer.appendChild(profilesSection);
        });
    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        listContainer.innerHTML = '<p class="text-center text-red-500 text-sm">Erreur lors du chargement des profils.</p>';
    }
}

/**
 * Fonction de suppression d'un sous-profil
 */
async function deleteProfile(uid, profileNameToDelete, currentProfiles) {
    if (currentProfiles.length <= 1) {
        showInfoModal("Action Impossible", "Vous ne pouvez pas supprimer le dernier profil d'un compte. Si l'employé a quitté l'entreprise, supprimez plutôt son compte entier via le bouton rouge ci-dessus.");
        return;
    }

    const message = `Voulez-vous vraiment supprimer le profil "${profileNameToDelete}" ?\n\nNote : L'historique de ses pointages sera conservé dans la base, mais le profil n'apparaîtra plus à la connexion.`;
    
    if (await showConfirmationModal("Supprimer un profil", message)) {
        try {
            const updatedProfiles = currentProfiles.filter(p => p !== profileNameToDelete);
            await updateDoc(doc(db, "users", uid), { profiles: updatedProfiles });
            
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
            listContainer.innerHTML = "<p class='text-gray-500 col-span-full'>Aucun collègue externe trouvé.</p>";
            return;
        }
        
        querySnapshot.forEach(docSnap => {
            listContainer.appendChild(createColleagueElement(docSnap.id, docSnap.data().name));
        });
    } catch (error) {
        listContainer.innerHTML = "<p class='text-red-500 col-span-full'>Erreur de chargement des collègues.</p>";
    }
}

/**
 * Crée le composant DOM pour un collègue externe
 */
function createColleagueElement(id, name) {
    const div = document.createElement('div');
    div.className = 'p-3 border rounded flex justify-between items-center';
    div.style.backgroundColor = 'var(--color-background)';
    div.style.borderColor = 'var(--color-border)';
    
    div.innerHTML = `<span class="font-medium">${name}</span>`;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.className = 'px-3 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white font-medium shadow-sm transition-colors';
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