// Dans : modules/admin-team.js

import { collection, query, getDocs, doc, updateDoc, deleteDoc, orderBy, where, limit, addDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, navigateTo, currentUser, showConfirmationModal, showInfoModal, isStealthMode } from "../app.js";
import { getUsers } from "./data-service.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <h2 class="text-2xl font-bold">👥 Gestion de l'Équipe</h2>
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border);">Comptes et Profils</h3>
                <div id="user-list-container"><p class="text-center" style="color: var(--color-text-muted);">Chargement...</p></div>
            </div>
            
            ${isStealthMode() ? `
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-3 border-b pb-2" style="border-color: var(--color-border);">Autres Collègues (externes)</h3>
                <form id="addColleagueForm" class="flex gap-2 mb-4">
                    <input type="text" id="colleagueNameInput" placeholder="Nom du collègue..." class="border p-2 rounded flex-grow" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                    <button type="submit" class="px-4 py-2 text-white font-bold rounded" style="background-color: var(--color-primary);">Ajouter</button>
                </form>
                <div id="colleaguesList" class="space-y-2"></div>
            </div>
            ` : ''}
        </div>
    `;
    setTimeout(() => {
        loadUsers();
        if (isStealthMode()) {
            loadColleagues();
            setupEventListeners();
        }
    }, 0);
}

function setupEventListeners() {
    const addColleagueForm = document.getElementById("addColleagueForm");
    if (addColleagueForm) {
        addColleagueForm.onsubmit = async (e) => {
            e.preventDefault();
            const input = document.getElementById("colleagueNameInput");
            const colleagueName = input.value.trim();
            if (colleagueName) {
                try {
                    await addDoc(collection(db, "colleagues"), { name: colleagueName });
                    input.value = '';
                    loadColleagues();
                } catch (error) {
                    showInfoModal("Erreur", "Une erreur est survenue lors de l'ajout.");
                }
            }
        };
    }
}

async function loadUsers() {
    const container = document.getElementById('user-list-container');
    try {
        const users = await getUsers(true); // true = force le rafraichissement

        if (users.length === 0) {
            container.innerHTML = "<p class='text-center text-gray-500'>Aucun utilisateur à afficher.</p>";
            return;
        }
        
        container.innerHTML = ''; 
        const userListDiv = document.createElement('div');
        userListDiv.className = 'space-y-4';
        users.forEach(userData => userListDiv.appendChild(createUserElement(userData)));
        container.appendChild(userListDiv);
    } catch (error) {
        console.error("Erreur de chargement des utilisateurs:", error);
        container.innerHTML = "<p class='text-red-500'>Erreur de chargement des utilisateurs.</p>";
    }
}

function createUserElement(userData) {
    const userElement = document.createElement('div');
    const visibilityClass = userData.visibility === 'hidden' ? 'opacity-60 border-purple-400' : 'border-gray-200';
    userElement.className = `rounded-lg flex flex-col mb-4 overflow-hidden border-2 ${visibilityClass} shadow-sm`;
    userElement.style.backgroundColor = 'var(--color-surface)';
    userElement.style.borderColor = userData.visibility === 'hidden' ? '#a855f7' : 'var(--color-border)';

    // --- 1. EN-TÊTE DU COMPTE (Cliquable pour voir TOUS les profils) ---
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border-b gap-3';
    headerDiv.style.backgroundColor = 'var(--color-background)';
    headerDiv.style.borderColor = 'var(--color-border)';

    const userInfoDiv = document.createElement('div');
    userInfoDiv.className = 'cursor-pointer hover:opacity-70 transition-opacity flex-grow'; // Rend cliquable
    userInfoDiv.title = "Voir l'historique complet de ce compte (tous les profils)";
    userInfoDiv.innerHTML = `
        <p class="font-bold text-lg" style="color: var(--color-text-base);">${userData.displayName}</p>
        <p class="text-sm font-medium mt-1 text-gray-500">📧 ${userData.email}</p>
    `;
    
    // ACTION : Clic sur le compte principal = Voir tout
    userInfoDiv.onclick = () => navigateTo('user-history', { 
        userId: userData.uid, 
        userName: `${userData.displayName} (Tous les profils)`, 
        viewAll: true 
    });
    
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto';

    if (isStealthMode() && userData.uid !== currentUser.uid) {
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'px-3 py-1 text-sm font-bold rounded text-white shadow-sm';
        if (userData.visibility === 'hidden') {
            visibilityBtn.textContent = '👁️ Rendre Visible';
            visibilityBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
            visibilityBtn.onclick = () => updateUserVisibility(userData.uid, 'visible');
        } else {
            visibilityBtn.textContent = '👻 Rendre Invisible';
            visibilityBtn.classList.add('bg-purple-600', 'hover:bg-purple-700');
            visibilityBtn.onclick = () => updateUserVisibility(userData.uid, 'hidden');
        }
        controlsDiv.appendChild(visibilityBtn);
    }

    if (userData.uid !== currentUser.uid) {
        const roleLabel = document.createElement('label');
        roleLabel.className = 'flex items-center cursor-pointer mr-2';
        const roleInput = document.createElement('input');
        roleInput.type = 'checkbox';
        roleInput.className = 'sr-only peer';
        roleInput.checked = userData.role === 'admin';
        roleInput.onchange = () => updateUserRole(userData.uid, roleInput.checked ? 'admin' : 'user');
        roleLabel.innerHTML = `<div class="relative w-11 h-6 bg-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div><span class="ms-2 text-sm font-bold text-gray-600">Admin</span>`;
        roleLabel.prepend(roleInput);
        controlsDiv.appendChild(roleLabel);
    }
    
    let statusColor = 'bg-gray-200 text-gray-800';
    if (userData.status === 'approved') statusColor = 'bg-green-100 text-green-800 border border-green-300';
    if (userData.status === 'pending') statusColor = 'bg-yellow-100 text-yellow-800 border border-yellow-300';
    if (userData.status === 'banned') statusColor = 'bg-red-100 text-red-800 border border-red-300';
    const statusSpan = document.createElement('span');
    statusSpan.className = `px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${statusColor}`;
    statusSpan.textContent = userData.status;
    controlsDiv.appendChild(statusSpan);

    if (userData.uid !== currentUser.uid) {
        if (userData.status === 'pending') {
            const approveBtn = document.createElement('button');
            approveBtn.className = 'px-3 py-1 text-sm font-bold rounded text-white bg-green-500 hover:bg-green-600 shadow-sm';
            approveBtn.textContent = 'Approuver';
            approveBtn.onclick = () => updateUserStatus(userData.uid, 'approved');
            controlsDiv.appendChild(approveBtn);
        }
        if (userData.status === 'approved') {
            const banBtn = document.createElement('button');
            banBtn.className = 'px-3 py-1 text-sm font-bold rounded text-white bg-yellow-600 hover:bg-yellow-700 shadow-sm';
            banBtn.textContent = 'Bannir';
            banBtn.onclick = () => updateUserStatus(userData.uid, 'banned');
            controlsDiv.appendChild(banBtn);
        }
        if (userData.status === 'banned') {
            const unbanBtn = document.createElement('button');
            unbanBtn.className = 'px-3 py-1 text-sm font-bold rounded text-white bg-green-500 hover:bg-green-600 shadow-sm';
            unbanBtn.textContent = 'Débannir';
            unbanBtn.onclick = () => updateUserStatus(userData.uid, 'approved');
            controlsDiv.appendChild(unbanBtn);
        }
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'px-3 py-1 text-sm font-bold rounded text-white bg-red-600 hover:bg-red-700 shadow-sm';
        deleteBtn.textContent = 'Supprimer le compte';
        deleteBtn.onclick = () => deleteUser(userData.uid, userData.email);
        controlsDiv.appendChild(deleteBtn);
    }
    
    headerDiv.appendChild(userInfoDiv);
    headerDiv.appendChild(controlsDiv);
    userElement.appendChild(headerDiv);

    // --- 2. CORPS : LISTE DES PROFILS (Cliquables individuellement) ---
    const profilesSection = document.createElement('div');
    profilesSection.className = 'p-4';

    const profilesTitle = document.createElement('p');
    profilesTitle.className = 'text-xs font-bold uppercase tracking-wider mb-3';
    profilesTitle.style.color = 'var(--color-text-muted)';
    profilesTitle.textContent = 'Profils associés à ce compte :';
    profilesSection.appendChild(profilesTitle);

    const profiles = userData.profiles || [userData.displayName];
    
    const profilesGrid = document.createElement('div');
    profilesGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3';

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
        
        // ACTION : Clic sur un profil = Voir un seul (viewAll = false)
        nameSpan.onclick = () => navigateTo('user-history', { 
            userId: userData.uid, 
            userName: profileName,
            viewAll: false 
        });

        profileRow.appendChild(nameSpan);

        const deleteProfBtn = document.createElement('button');
        deleteProfBtn.className = 'text-xs font-bold text-red-600 hover:text-white bg-red-100 hover:bg-red-600 px-3 py-1.5 rounded transition-colors';
        deleteProfBtn.textContent = 'Supprimer';
        deleteProfBtn.onclick = () => deleteProfile(userData.uid, profileName, profiles);

        profileRow.appendChild(deleteProfBtn);
        profilesGrid.appendChild(profileRow);
    });

    profilesSection.appendChild(profilesGrid);
    userElement.appendChild(profilesSection);

    return userElement;
}
// --- NOUVELLE FONCTION : SUPPRIMER UN PROFIL ---
async function deleteProfile(uid, profileNameToDelete, currentProfiles) {
    // Sécurité : On empêche de supprimer le tout dernier profil
    if (currentProfiles.length <= 1) {
        showInfoModal("Action Impossible", "Vous ne pouvez pas supprimer le dernier profil d'un compte. Si l'employé a quitté l'entreprise, supprimez plutôt son compte entier.");
        return;
    }

    const message = `Voulez-vous vraiment supprimer le profil "${profileNameToDelete}" ?\n\nNote : L'historique de ses pointages sera conservé dans la base, mais le profil n'apparaîtra plus à la connexion.`;
    
    if (await showConfirmationModal("Supprimer un profil", message)) {
        try {
            const updatedProfiles = currentProfiles.filter(p => p !== profileNameToDelete);
            await updateDoc(doc(db, "users", uid), { profiles: updatedProfiles });
            
            showInfoModal("Succès", `Le profil "${profileNameToDelete}" a été supprimé.`);
            await getUsers(true); // Rafraichir la liste globale
            loadUsers(); // Rafraichir l'interface
        } catch (error) {
            console.error(error);
            showInfoModal("Erreur", "Impossible de supprimer le profil.");
        }
    }
}

// --- FONCTIONS EXISTANTES ---

async function updateUserVisibility(uid, visibility) {
    try {
        await updateDoc(doc(db, "users", uid), { visibility: visibility });
        await getUsers(true);
        loadUsers(); 
    } catch (error) {
        showInfoModal("Erreur", "La mise à jour de la visibilité a échoué.");
    }
}

async function updateUserRole(uid, role) {
    if (!(await showConfirmationModal("Changement de rôle", `Changer le rôle en "${role}" ?`))) {
        loadUsers();
        return;
    }
    try {
        await updateDoc(doc(db, "users", uid), { role: role });
        await getUsers(true);
        loadUsers();
    } catch (error) {
        showInfoModal("Erreur", "La mise à jour du rôle a échoué.");
        loadUsers();
    }
}

async function updateUserStatus(uid, status) {
    await updateDoc(doc(db, "users", uid), { status: status });
    await getUsers(true);
    loadUsers();
}

async function deleteUser(uid, email) {
    if (await showConfirmationModal("Suppression Définitive", `Voulez-vous vraiment supprimer le compte lié à "${email}" ? Tous ses profils disparaîtront.`)) {
        try {
            // Vérification de sécurité : si le compte a des pointages, on bloque
            const pointagesQuery = query(collection(db, "pointages"), where("uid", "==", uid), limit(1));
            const pointagesSnapshot = await getDocs(pointagesQuery);
            if (!pointagesSnapshot.empty) {
                showInfoModal("Action Impossible", `Ce compte ne peut pas être supprimé car il possède des historiques de pointages. Vous pouvez le "Bannir" à la place pour bloquer son accès.`);
                return;
            }
            await deleteDoc(doc(db, "users", uid));
            showInfoModal("Succès", `Le compte "${email}" a été supprimé.`);
            await getUsers(true);
            loadUsers();
        } catch (error) {
            showInfoModal("Erreur", "La suppression a échoué.");
        }
    }
}

async function loadColleagues() {
    const listContainer = document.getElementById("colleaguesList");
    if (!listContainer) return;

    listContainer.innerHTML = "<p>Chargement...</p>";
    try {
        const q = query(collection(db, "colleagues"), orderBy("name"));
        const querySnapshot = await getDocs(q);
        listContainer.innerHTML = "";
        if (querySnapshot.empty) {
            listContainer.innerHTML = "<p class='text-gray-500'>Aucun collègue externe trouvé.</p>";
            return;
        }
        querySnapshot.forEach(docSnap => listContainer.appendChild(createColleagueElement(docSnap.id, docSnap.data().name)));
    } catch (error) {
        listContainer.innerHTML = "<p class='text-red-500'>Erreur de chargement des collègues.</p>";
    }
}

function createColleagueElement(id, name) {
    const div = document.createElement('div');
    div.className = 'p-3 bg-gray-50 border rounded flex justify-between items-center';
    div.innerHTML = `<span>${name}</span>`;
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.className = 'px-3 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white';
    deleteBtn.onclick = async () => {
        if (await showConfirmationModal("Confirmation", `Vraiment supprimer le collègue externe "${name}" ?`)) {
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