import { updatesLog } from './modules/updates-data.js';

const APP_VERSION = 'v1.1.0'; 

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, updateDoc, deleteField, initializeFirestore, CACHE_SIZE_UNLIMITED } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

export const themes = {
    neutre: { name: 'Neutre', preview: '#e2e8f0', colors: { '--color-primary': '#475569', '--color-primary-hover': '#334155', '--color-background': '#f1f5f9', '--color-surface': '#ffffff', '--color-text-base': '#0f172a', '--color-text-muted': '#475569', '--color-border': '#e2e8f0', } },
    magenta: { name: 'Magenta', preview: '#f5d0fe', colors: { '--color-primary': '#d946ef', '--color-primary-hover': '#c026d3', '--color-background': '#fdf4ff', '--color-surface': '#fae8ff', '--color-text-base': '#581c87', '--color-text-muted': '#86198f', '--color-border': '#f5d0fe', } },
    rubis: { name: 'Rubis', preview: '#fecaca', colors: { '--color-primary': '#ef4444', '--color-primary-hover': '#dc2626', '--color-background': '#fef2f2', '--color-surface': '#fee2e2', '--color-text-base': '#7f1d1d', '--color-text-muted': '#991b1b', '--color-border': '#fecaca', } },
    carbone: { name: 'Carbone', preview: '#1f2937', colors: { '--color-primary': '#f59e0b', '--color-primary-hover': '#d97706', '--color-background': '#111827', '--color-surface': '#1f2937', '--color-text-base': '#f9fafb', '--color-text-muted': '#9ca3af', '--color-border': '#374151', } },
    ocean: { name: 'Océan', preview: '#67e8f9', colors: { '--color-primary': '#06b6d4', '--color-primary-hover': '#0891b2', '--color-background': '#ecfeff', '--color-surface': '#cffafe', '--color-text-base': '#0e7490', '--color-text-muted': '#155e75', '--color-border': '#a5f3fc', } },
    soleil: { name: 'Soleil', preview: '#fdba74', colors: { '--color-primary': '#f97316', '--color-primary-hover': '#ea580c', '--color-background': '#fff7ed', '--color-surface': '#ffedd5', '--color-text-base': '#7c2d12', '--color-text-muted': '#9a3412', '--color-border': '#fed7aa', } },
    violette: { name: 'Violette', preview: '#c4b5fd', colors: { '--color-primary': '#8b5cf6', '--color-primary-hover': '#7c3aed', '--color-background': '#f5f3ff', '--color-surface': '#ede9fe', '--color-text-base': '#4c1d95', '--color-text-muted': '#6d28d9', '--color-border': '#ddd6fe', } },
    limonade: { name: 'Limonade', preview: '#bef264', colors: { '--color-primary': '#84cc16', '--color-primary-hover': '#65a30d', '--color-background': '#f7fee7', '--color-surface': '#ecfccb', '--color-text-base': '#365314', '--color-text-muted': '#4d7c0f', '--color-border': '#d9f99d', } }
};

export function applyTheme(themeName) {
    const theme = themes[themeName] || themes['neutre'];
    for (const [key, value] of Object.entries(theme.colors)) {
        document.documentElement.style.setProperty(key, value);
    }
    localStorage.setItem('appTheme', themeName);
}
applyTheme(localStorage.getItem('appTheme') || 'neutre');

const firebaseConfig = {
  apiKey: "AIzaSyDxgyFf9O-vPMXTo3ryx7QH7evmQcYGmlM",
  authDomain: "pointeuse-ldpr.firebaseapp.com",
  projectId: "pointeuse-ldpr",
  storageBucket: "pointeuse-ldpr.firebasestorage.app",
  messagingSenderId: "818187106739",
  appId: "1:818187106739:web:1ad3a1def93ab90f27f3c6",
  measurementId: "G-90XQP69MBT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = initializeFirestore(app, { cacheSizeBytes: CACHE_SIZE_UNLIMITED });

export const pageContent = document.getElementById('page-content');
export let currentUser = null;
export let isAdmin = false;
export let isMasqueradingAsUser = false;
let genericModal, modalTitle, modalMessage, modalConfirmBtn, modalCancelBtn;

const STEALTH_PIN = "1801";

export const isStealthMode = () => localStorage.getItem('stealthMode') === 'true';

export function isEffectiveAdmin() {
    return isAdmin && !isMasqueradingAsUser;
}

const userTabs = [
    { id: 'user-dashboard', name: 'Planning' },
    { id: 'user-leave', name: 'Mes Congés' },
    { id: 'chantiers', name: 'Infos Chantiers' },
    { id: 'user-history', name: 'Mon Historique' },
    { id: 'user-stats', name: 'Mes Stats' },
    { id: 'settings', name: 'Paramètres' },
];

const adminTabs = [
    { id: 'admin-dashboard', name: 'Tableau de Bord' },
    { id: 'admin-live-view', name: 'Direct' },
    { id: 'admin-planning', name: 'Planification' },
    { id: 'admin-invoicing', name: 'Facturation' },
    { id: 'admin-contracts', name: 'Cartes' },
    { id: 'admin-chantiers', name: 'Chantiers' },
    { id: 'admin-leave', name: 'Congés' },
    { id: 'admin-site-requests', name: 's Demandes Site' },
    { id: 'admin-travel-report', name: 'Rapports Trajets' },
    { id: 'admin-hours-report', name: 'Rapports Heures' },
    { id: 'admin-team', name: 'Équipe' },
];

function toggleView() {
    isMasqueradingAsUser = !isMasqueradingAsUser;
    setupNavigation();
    const destination = isMasqueradingAsUser ? 'user-dashboard' : 'admin-dashboard';
    navigateTo(destination);
}

function setupNavigation() {
    const tabs = isEffectiveAdmin() ? adminTabs : userTabs;
    const mainNavList = document.querySelector('#main-nav-list');
    if (!mainNavList) return;
    
    mainNavList.innerHTML = '';
    
    tabs.forEach(tab => {
        const listItem = document.createElement('li');
        const tabLink = document.createElement('a');
        tabLink.id = `nav-${tab.id}`;
        tabLink.href = '#';
        tabLink.textContent = tab.name;
        tabLink.className = 'block py-2 px-3 rounded md:p-0';
        tabLink.onclick = (e) => {
            e.preventDefault();
            navigateTo(tab.id);
            const mobileMenuButton = document.querySelector('[data-collapse-toggle="navbar-default"]');
            const mobileMenu = document.getElementById('navbar-default');
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenuButton.click();
            }
        };
        listItem.appendChild(tabLink);
        mainNavList.appendChild(listItem);
    });

    const switchBtn = document.getElementById('switchViewBtn');
    if (isAdmin) {
        switchBtn.classList.remove('hidden');
        switchBtn.textContent = isMasqueradingAsUser ? 'Vue Admin' : 'Vue Employé';
        switchBtn.onclick = toggleView;
    } else {
        switchBtn.classList.add('hidden');
    }
}

export async function navigateTo(pageId, params = {}) {
    if (pageId === 'user-details') pageId = 'user-history';

    document.querySelectorAll('#main-nav-list a').forEach(link => {
        if (link.id === `nav-${pageId}`) {
            link.classList.add('nav-active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('nav-active');
            link.removeAttribute('aria-current');
        }
    });

    pageContent.classList.add('page-exit');
    
    setTimeout(async () => {
        pageContent.innerHTML = `<div class="w-full flex justify-center p-8"><svg class="animate-spin h-8 w-8" style="color: var(--color-primary);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>`;
        
        try {
            const pageModule = await import(`./modules/${pageId}.js`);
            await pageModule.render(params);
        } catch (error) {
            console.error(`Erreur de chargement du module ${pageId}:`, error);
            let errorMsg = "Impossible de charger la page.";
            if (error.message.includes('404')) errorMsg = "Le fichier du module est introuvable.";
            pageContent.innerHTML = `<div class="p-8 text-center"><p class="text-red-500 font-bold">Erreur</p><p>${errorMsg}</p><p class="text-xs text-gray-400 mt-2">${error.message}</p></div>`;
        }
        
        pageContent.classList.remove('page-exit');
    }, 200);
}

document.addEventListener('DOMContentLoaded', () => {
    genericModal = document.getElementById('genericModal');
    
    if(genericModal) {
        genericModal.classList.add('z-50');
    }

    modalTitle = document.getElementById('modalTitle');
    modalMessage = document.getElementById('modalMessage');
    modalConfirmBtn = document.getElementById('modalConfirmBtn');
    modalCancelBtn = document.getElementById('modalCancelBtn');

    const loader = document.getElementById('app-loader');
    const authContainer = document.getElementById('auth-container');
    const pendingContainer = document.getElementById('pending-approval-container');
    const appContainer = document.getElementById('app-container');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const resetForm = document.getElementById('reset-form');

    document.getElementById('show-register-link').onclick = (e) => { e.preventDefault(); loginForm.style.display = 'none'; registerForm.style.display = 'block'; };
    document.getElementById('show-reset-link').onclick = (e) => { e.preventDefault(); loginForm.style.display = 'none'; resetForm.style.display = 'block'; };
    document.getElementById('show-login-link-from-register').onclick = (e) => { e.preventDefault(); registerForm.style.display = 'none'; loginForm.style.display = 'block'; };
    document.getElementById('show-login-link-from-reset').onclick = (e) => { e.preventDefault(); resetForm.style.display = 'none'; loginForm.style.display = 'block'; };
    document.getElementById('logoutPendingBtn').onclick = () => signOut(auth);

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), {
                displayName: name, email: user.email, uid: user.uid,
                status: 'pending', role: 'user', createdAt: serverTimestamp()
            });
        } catch (error) { showInfoModal("Erreur", "Impossible de créer le compte : " + error.message); }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try { await signInWithEmailAndPassword(auth, email, password); } 
        catch (error) { showInfoModal("Erreur", "Email ou mot de passe incorrect."); }
    });

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        try {
            await sendPasswordResetEmail(auth, email);
            showInfoModal("Email envoyé", "Un lien pour réinitialiser votre mot de passe a été envoyé.");
            resetForm.style.display = 'none';
            loginForm.style.display = 'block';
        } catch (error) { showInfoModal("Erreur", "Impossible d'envoyer l'email."); }
    });

    onAuthStateChanged(auth, async (user) => {
        authContainer.style.display = 'none';
        pendingContainer.style.display = 'none';
        appContainer.style.display = 'none';
        loader.style.display = 'flex';
        
        if (user) {
            const userRef = doc(db, "users", user.uid);
            try {
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    currentUser = { ...user, ...userData };
                    isAdmin = userData.role === 'admin';
                    isMasqueradingAsUser = isAdmin;

                    switch (userData.status) {
                        case 'pending': pendingContainer.style.display = 'flex'; break;
                        case 'banned': showInfoModal("Compte Banni", "Votre compte a été banni."); signOut(auth); break;
                        case 'approved':
                            const savedProfile = localStorage.getItem('currentProfileName');
                            
                            document.getElementById('app-version-display').textContent = APP_VERSION;
                            setupNavigation();
                            await checkPersonalNotifications(userRef, userData);

                            appContainer.style.display = 'block';

                            if (savedProfile) {
                                document.getElementById('currentUserDisplay').textContent = savedProfile;
                                navigateTo('user-dashboard'); 
                                checkForUpdates(userData, userRef, savedProfile);
                            } else {
                                renderProfileSelection(userData);
                            }
                            break;
                        default: showInfoModal("Erreur de Compte", "Statut inconnu."); signOut(auth);
                    }
                } else { showInfoModal("Erreur de Compte", "Compte non trouvé."); signOut(auth); }
            } catch (error) { 
                console.error(error);
                authContainer.style.display = 'flex'; 
            }
        } else {
            currentUser = null;
            isAdmin = false;
            isMasqueradingAsUser = false;
            localStorage.removeItem('currentProfileName'); 
            authContainer.style.display = 'block';
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
            resetForm.style.display = 'none';
        }
        loader.style.display = 'none';
    });

    const pinModal = document.getElementById('pinModal');
    const pinForm = document.getElementById('pinForm');
    const pinInput = document.getElementById('pinInput');

    document.getElementById('pinCancelBtn').onclick = () => {
        pinModal.classList.add('hidden');
        pinForm.reset();
    };

    pinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (pinInput.value === STEALTH_PIN) {
            localStorage.setItem('stealthMode', 'true');
            pinModal.classList.add('hidden');
            pinForm.reset();
            showInfoModal("Mode Confidentiel", "Activé. Rechargement...");
            setTimeout(() => window.location.reload(), 1500);
        } else {
            showInfoModal("Erreur", "Code PIN incorrect.");
            pinForm.reset();
        }
    });

    document.getElementById('home-nav-link').addEventListener('click', (e) => {
        e.preventDefault();
        if (isEffectiveAdmin()) {
            toggleView(); 
        } else {
            navigateTo('user-dashboard');
        }
    });
    
    if ('serviceWorker' in navigator) {
        const { Workbox } = window;
        if (Workbox) {
            const wb = new Workbox('/sw.js');
            const showUpdateToast = () => {
                let toast = document.getElementById('update-toast');
                if (toast) return;
                toast = document.createElement('div');
                toast.id = 'update-toast';
                toast.innerHTML = `
                    <span class="font-semibold">Une nouvelle version est disponible !</span>
                    <button id="reload-button" class="font-bold px-4 py-2 rounded text-white" style="background-color: var(--color-primary);">Rafraîchir</button>
                `;
                document.body.appendChild(toast);
                document.getElementById('reload-button').onclick = () => {
                    wb.messageSkipWaiting(); 
                };
                setTimeout(() => toast.classList.add('show'), 100);
            };
            wb.addEventListener('waiting', showUpdateToast);
            wb.addEventListener('controlling', () => {
                window.location.reload();
            });
            wb.register();
        }
    }
});

async function checkPersonalNotifications(userRef, userData) {
    if (userData.pendingChanges && userData.pendingChanges.length > 0) {
        const changesByDay = userData.pendingChanges.reduce((acc, change) => {
            const date = new Date(change.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (!acc[date]) {
                acc[date] = [];
            }
            const action = change.type === 'ajout' ? '✅ Ajouté à' :
                           change.type === 'retrait' ? '❌ Retiré de' :
                           '🗑️ Annulé';
            acc[date].push(`${action} : ${change.chantier}`);
            return acc;
        }, {});

        const textMessage = Object.entries(changesByDay)
            .map(([day, actions]) => `${day}:\n${actions.join('\n')}`)
            .join('\n\n');

        showInfoModal("🔔 Changements dans votre planning", textMessage);

        await updateDoc(userRef, {
            pendingChanges: deleteField()
        });
    }
}

export function showUpdatesModal(updatesToShow, callbackOnClose = null, requireAcknowledge = false) {
    const updatesModal = document.getElementById('updatesModal');
    const updatesContent = document.getElementById('updates-content');
    const closeUpdatesBtn = document.getElementById('closeUpdatesBtn');

    if (!updatesModal || !updatesContent || !closeUpdatesBtn) {
        console.error("Éléments de la modale de mise à jour non trouvés.");
        return;
    }

    if (!updatesToShow || updatesToShow.length === 0) return;

    let html = updatesToShow.map(update => `
        <div>
            <h4 class="font-bold text-lg">${update.version} <span class="text-sm font-normal" style="color: var(--color-text-muted);">- ${update.date}</span></h4>
            <ul class="list-disc list-inside mt-2 space-y-1 pl-2">
                ${update.changes.map(change => `<li class="text-sm">${change.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('')}
            </ul>
        </div>
    `).join('<hr class="my-4" style="border-color: var(--color-border);">');

    if (requireAcknowledge) {
        html += `
            <div class="mt-6 p-4 rounded-lg shadow-inner" style="background-color: var(--color-background); border: 2px dashed var(--color-primary);">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" id="acknowledgeUpdateCheck" class="w-6 h-6 rounded border-gray-300" style="accent-color: var(--color-primary);">
                    <span class="font-bold text-sm" style="color: var(--color-text-base);">J'ai lu et compris ces changements obligatoires.</span>
                </label>
            </div>
        `;
        
        closeUpdatesBtn.disabled = true;
        closeUpdatesBtn.style.opacity = '0.5';
        closeUpdatesBtn.style.cursor = 'not-allowed';
    } else {
        closeUpdatesBtn.disabled = false;
        closeUpdatesBtn.style.opacity = '1';
        closeUpdatesBtn.style.cursor = 'pointer';
    }

    updatesContent.innerHTML = html;
    updatesModal.classList.remove('hidden');

    if (requireAcknowledge) {
        const check = document.getElementById('acknowledgeUpdateCheck');
        check.addEventListener('change', (e) => {
            if (e.target.checked) {
                closeUpdatesBtn.disabled = false;
                closeUpdatesBtn.style.opacity = '1';
                closeUpdatesBtn.style.cursor = 'pointer';
            } else {
                closeUpdatesBtn.disabled = true;
                closeUpdatesBtn.style.opacity = '0.5';
                closeUpdatesBtn.style.cursor = 'not-allowed';
            }
        });
    }

    closeUpdatesBtn.onclick = () => {
        if (requireAcknowledge && !document.getElementById('acknowledgeUpdateCheck').checked) return;

        updatesModal.classList.add('hidden');
        if (callbackOnClose) {
            callbackOnClose();
        }
    };
}

function checkForUpdates(userData, userRef, profileName) {
    if (!profileName) return; 
    
    const seenVersions = userData.lastSeenAppVersions || {};
    const lastSeenVersion = seenVersions[profileName] || 'v0.0.0'; 
    const currentVersion = APP_VERSION;

    if (lastSeenVersion !== currentVersion) {
        const updatesToShow = updatesLog ? updatesLog.filter(u => u.version > lastSeenVersion) : [];
        
        if (updatesToShow.length > 0) {
            const markVersionAsSeen = async () => {
                try {
                    const updatedVersions = { ...seenVersions };
                    updatedVersions[profileName] = currentVersion;
                    
                    await updateDoc(userRef, { lastSeenAppVersions: updatedVersions });
                    currentUser.lastSeenAppVersions = updatedVersions; 
                } catch (error) {
                    console.error("Impossible de mettre à jour la version vue:", error);
                }
            };
            showUpdatesModal(updatesToShow, markVersionAsSeen, true); 
        }
    }
}

export function showConfirmationModal(title, message) {
    return new Promise((resolve) => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalConfirmBtn.style.display = 'inline-block';
        modalCancelBtn.textContent = 'Annuler';
        genericModal.classList.remove('hidden');
        modalConfirmBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(true); };
        modalCancelBtn.onclick = () => { genericModal.classList.add('hidden'); resolve(false); };
    });
}

export function showInfoModal(title, message) {
    const modalMessage = document.getElementById('modalMessage');
    document.getElementById('modalTitle').textContent = title;
    modalMessage.textContent = message;
    modalMessage.style.whiteSpace = 'pre-wrap';
    document.getElementById('modalConfirmBtn').style.display = 'none';
    document.getElementById('modalCancelBtn').textContent = 'OK';
    document.getElementById('genericModal').classList.remove('hidden');
    document.getElementById('modalCancelBtn').onclick = () => { document.getElementById('genericModal').classList.add('hidden'); };
}

export async function renderProfileSelection(userData) {
    const profiles = userData.profiles || [userData.displayName];

    let html = `
        <div class="max-w-md mx-auto mt-12 text-center fade-in">
            <h2 class="text-3xl font-bold mb-8" style="color: var(--color-text-base);">Qui pointe aujourd'hui ?</h2>
            <div class="grid grid-cols-2 gap-6 mb-8" id="profiles-container">
    `;

    profiles.forEach(profile => {
        const initial = profile.charAt(0).toUpperCase();
        html += `
            <button class="profile-btn p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center transition-transform hover:scale-105" style="background-color: var(--color-surface); border: 2px solid var(--color-primary);" data-name="${profile}">
                <div class="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold text-white mb-4 shadow-sm" style="background-color: var(--color-primary);">
                    ${initial}
                </div>
                <span class="font-bold text-lg" style="color: var(--color-text-base);">${profile}</span>
            </button>
        `;
    });

    html += `
            <button id="add-profile-btn" class="p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-colors hover:bg-gray-50" style="border-color: var(--color-border);">
                <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-3" style="color: var(--color-text-muted);">➕</div>
                <span class="font-semibold" style="color: var(--color-text-muted);">Nouveau profil</span>
            </button>
            </div>
        </div>

        <div id="customPromptModal" class="hidden fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-xl shadow-2xl w-full max-w-sm transform transition-all" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-bold mb-2" style="color: var(--color-text-base);">Ajouter un profil</h3>
                <p class="text-sm mb-5" style="color: var(--color-text-muted);">Entrez le prénom du nouveau collègue :</p>
                
                <input type="text" id="newProfileInput" placeholder="Ex: Thomas" class="w-full border p-3 rounded-lg mb-6 shadow-inner focus:outline-none focus:ring-2" style="border-color: var(--color-border); background-color: var(--color-background); color: var(--color-text-base);">
                
                <div class="flex justify-end gap-3">
                    <button id="cancelProfileBtn" class="px-5 py-2.5 rounded-lg font-bold transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-border); color: var(--color-text-base);">Annuler</button>
                    <button id="confirmProfileBtn" class="text-white font-bold px-5 py-2.5 rounded-lg transition-colors shadow-md" style="background-color: var(--color-primary);">Enregistrer</button>
                </div>
            </div>
        </div>
    `;

    pageContent.innerHTML = html;

    document.querySelectorAll('.profile-btn').forEach(btn => {
        btn.onclick = () => {
            const selectedName = btn.getAttribute('data-name');
            localStorage.setItem('currentProfileName', selectedName); 
            document.getElementById('currentUserDisplay').textContent = selectedName; 
            navigateTo('user-dashboard'); 
            
            checkForUpdates(currentUser, doc(db, "users", currentUser.uid), selectedName);
        };
    });

    const addBtn = document.getElementById('add-profile-btn');
    const modal = document.getElementById('customPromptModal');
    const input = document.getElementById('newProfileInput');
    const cancelBtn = document.getElementById('cancelProfileBtn');
    const confirmBtn = document.getElementById('confirmProfileBtn');

    addBtn.onclick = () => {
        modal.classList.remove('hidden');
        input.value = ''; 
        setTimeout(() => input.focus(), 100); 
    };

    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
    };

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmBtn.click();
        }
    });

    confirmBtn.onclick = async () => {
        const newName = input.value.trim();
        
        if (newName !== "") {
            confirmBtn.textContent = 'Enregistrement...';
            confirmBtn.disabled = true;

            const updatedProfiles = [...profiles, newName];
            try {
                await updateDoc(doc(db, "users", currentUser.uid), {
                    profiles: updatedProfiles
                });
                
                currentUser.profiles = updatedProfiles; 
                renderProfileSelection(currentUser); 
                
            } catch (error) {
                showInfoModal("Erreur", "Impossible d'ajouter le profil.");
                confirmBtn.textContent = 'Enregistrer';
                confirmBtn.disabled = false;
            }
        } else {
            input.style.borderColor = 'red';
            setTimeout(() => input.style.borderColor = 'var(--color-border)', 2000);
        }
    };
}

export function switchProfile() {
    localStorage.removeItem('currentProfileName');
    renderProfileSelection(currentUser);
}
