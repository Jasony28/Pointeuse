// DANS : modules/settings.js

import { pageContent, currentUser, showInfoModal, db, themes, applyTheme, showUpdatesModal, switchProfile } from "../app.js";
import { getAuth, signOut, sendPasswordResetEmail, updateEmail, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";
import { doc, updateDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { updatesLog } from "./updates-data.js";

const auth = getAuth();

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-3xl mx-auto space-y-8">
             <div>
                <h2 class="text-3xl font-bold" style="color: var(--color-text-base);">⚙️ Paramètres</h2>
                <p style="color: var(--color-text-muted);">Gérez vos informations de profil et les réglages de l'application.</p>
            </div>

            <!-- NOUVEAU : CARTE DE CHANGEMENT DE PROFIL -->
            <div class="p-6 rounded-lg shadow-sm text-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-2" style="color: var(--color-text-base);">Gestion du profil</h3>
                <p class="text-sm mb-4" style="color: var(--color-text-muted);">Vous êtes actuellement connecté en tant que <strong id="settings-profile-name" style="color: var(--color-primary);"></strong>.</p>
                <button id="btn-switch-profile" class="px-6 py-3 rounded-lg font-bold text-white shadow-md transition-transform hover:scale-105" style="background-color: var(--color-primary);">
                    🔄 Changer de profil
                </button>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">Mon Profil Global</h3>
                <div class="space-y-4">
                    <div>
                        <label for="displayNameInput" class="text-sm font-medium" style="color: var(--color-text-base);">Nom d'affichage (Compte principal)</label>
                        <input id="displayNameInput" type="text" value="${currentUser.displayName}" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">
                    </div>
                    <div class="text-right">
                        <button id="saveProfileBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Enregistrer le nom</button>
                    </div>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">🛡️ Sécurité et Compte</h3>
                
                <div class="flex justify-between items-center">
                    <p class="text-sm" style="color: var(--color-text-muted);">Recevoir un e-mail pour changer votre mot de passe.</p>
                    <button id="changePasswordBtn" class="font-bold px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                        Changer le mot de passe
                    </button>
                </div>

                <div class="border-t my-4" style="border-color: var(--color-border);"></div>
                <div class="flex justify-between items-center">
                    <p class="text-sm" style="color: var(--color-text-muted);">Modifier votre e-mail de connexion.</p>
                    <button id="changeEmailBtn" class="font-bold px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-border);">
                        Changer l'e-mail
                    </button>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">🗂️ Gestion des Données</h3>
                <p class="text-sm" style="color: var(--color-text-muted); margin-bottom: 1rem;">Télécharger l'intégralité de votre historique (Heures & KM).</p>
                <div class="flex">
                    <button id="exportPdfBtn" class="font-bold w-full px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-primary); color: var(--color-primary);">
                        Exporter mon historique (PDF)
                    </button>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4" style="color: var(--color-text-base);">Thème de l'application</h3>
                <div id="theme-selector" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    ${Object.entries(themes).map(([key, theme]) => `
                        <div class="theme-option p-4 rounded-lg cursor-pointer border-2 flex items-center justify-center h-20 transition-all" style="background-color: ${theme.preview};" data-theme-key="${key}">
                            <p class="font-semibold text-center" style="color: ${theme.colors['--color-text-base']}">${theme.name}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">À propos de l'application</h3>
                <div class="flex justify-between items-center">
                    <p class="text-sm" style="color: var(--color-text-muted);">Consultez les dernières améliorations et corrections.</p>
                    <button id="showUpdatesBtn" class="font-bold px-6 py-2 rounded transition-colors" style="background-color: var(--color-background); border: 1px solid var(--color-primary); color: var(--color-primary);">
                        Voir les nouveautés
                    </button>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4 border-b pb-2" style="color: var(--color-text-base); border-color: var(--color-border);">Donner un feedback</h3>
                <p class="text-sm" style="color: var(--color-text-muted);">Une idée d'amélioration ? Un bug à signaler ? Vos retours sont précieux.</p>
                <textarea id="feedbackTextarea" class="w-full border p-2 rounded mt-3 h-24" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);" placeholder="Votre idée ici..."></textarea>
                <div class="text-right mt-3">
                    <button id="sendFeedbackBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Ouvrir mon e-mail pour envoyer</button>
                </div>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                 <div class="text-center">
                    <button id="logoutBtnSettings" class="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-lg">
                        Se déconnecter de ${currentUser.email}
                    </button>
                </div>
            </div>
        </div>

        <div id="changeEmailModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-sm" style="background-color: var(--color-surface);">
                <h3 class="text-xl font-bold mb-4">Changer l'e-mail de connexion</h3>
                <form id="changeEmailForm" class="space-y-4">
                    <div>
                        <label for="newEmailInput" class="block text-sm font-medium mb-1">Nouvel e-mail</label>
                        <input id="newEmailInput" type="email" required class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                    <div>
                        <label for="currentPasswordInput" class="block text-sm font-medium mb-1">Mot de passe actuel (pour vérification)</label>
                        <input id="currentPasswordInput" type="password" required class="w-full border p-2 rounded" style="background-color: var(--color-background); border-color: var(--color-border);">
                    </div>
                    <div class="flex justify-end gap-4 pt-4">
                        <button type="button" id="cancelChangeEmailBtn" class="font-bold px-6 py-2 rounded" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                        <button type="submit" id="confirmChangeEmailBtn" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">Valider</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    setupEventListeners();
}

function setupEventListeners() {
    // --- GESTION DU PROFIL ---
    const activeProfileName = localStorage.getItem('currentProfileName') || currentUser.displayName;
    document.getElementById('settings-profile-name').textContent = activeProfileName;

    document.getElementById('btn-switch-profile').onclick = () => {
        switchProfile();
    };

    // --- PROFIL GLOBAL ---
    document.getElementById('saveProfileBtn').onclick = async () => {
        const newName = document.getElementById('displayNameInput').value.trim();
        if (newName && newName !== currentUser.displayName) {
            try {
                const userRef = doc(db, "users", currentUser.uid);
                await updateDoc(userRef, { displayName: newName });
                showInfoModal("Succès", "Votre nom a été mis à jour. Il sera visible au prochain rechargement.");
            } catch (error) {
                showInfoModal("Erreur", "La mise à jour a échoué.");
            }
        }
    };

    // --- SÉCURITÉ : MOT DE PASSE ---
    document.getElementById('changePasswordBtn').onclick = async () => {
        try {
            await sendPasswordResetEmail(auth, currentUser.email);
            showInfoModal("E-mail envoyé", `Un e-mail pour changer votre mot de passe a été envoyé à ${currentUser.email}.`);
        } catch (error) {
            console.error(error);
            showInfoModal("Erreur", "Impossible d'envoyer l'e-mail de réinitialisation.");
        }
    };

    // --- SÉCURITÉ : E-MAIL ---
    const emailModal = document.getElementById('changeEmailModal');
    document.getElementById('changeEmailBtn').onclick = () => {
        emailModal.classList.remove('hidden');
    };
    document.getElementById('cancelChangeEmailBtn').onclick = () => {
        emailModal.classList.add('hidden');
        document.getElementById('changeEmailForm').reset();
    };
    document.getElementById('changeEmailForm').onsubmit = async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('newEmailInput').value;
        const currentPassword = document.getElementById('currentPasswordInput').value;
        const confirmBtn = document.getElementById('confirmChangeEmailBtn');

        if (!newEmail || !currentPassword) {
            showInfoModal("Erreur", "Veuillez remplir les deux champs.");
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Vérification...";

        try {
            // 1. Re-authentifier l'utilisateur
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);

            // 2. Si l'authentification réussit, mettre à jour l'e-mail
            confirmBtn.textContent = "Mise à jour...";
            await updateEmail(auth.currentUser, newEmail);
            
            // 3. Mettre à jour Firestore
            await updateDoc(doc(db, "users", currentUser.uid), {
                email: newEmail
            });

            // 4. Succès
            showInfoModal("Succès !", "Votre e-mail a été mis à jour. Vous devrez l'utiliser lors de votre prochaine connexion.");
            emailModal.classList.add('hidden');
            document.getElementById('changeEmailForm').reset();
            currentUser.email = newEmail; 

        } catch (error) {
            console.error("Erreur de mise à jour e-mail:", error.code);
            if (error.code === 'auth/wrong-password') {
                showInfoModal("Erreur", "Le mot de passe actuel est incorrect.");
            } else if (error.code === 'auth/email-already-in-use') {
                showInfoModal("Erreur", "Ce nouvel e-mail est déjà utilisé par un autre compte.");
            } else if (error.code === 'auth/invalid-email') {
                showInfoModal("Erreur", "Le format du nouvel e-mail est invalide.");
            } else {
                showInfoModal("Erreur", "Une erreur est survenue. " + error.message);
            }
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Valider";
        }
    };

    // --- EXPORT PDF ---
    document.getElementById('exportPdfBtn').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.textContent = 'Génération...';
        btn.disabled = true;
        try {
            await exportUserHistoryToPDF();
        } catch (error) {
            console.error("Erreur Export PDF:", error);
            showInfoModal("Erreur", "L'exportation PDF a échoué. " + error.message);
        }
        btn.textContent = 'Exporter mon historique (PDF)';
        btn.disabled = false;
    };

    // --- THÈMES ---
    updateThemeSelectionUI(localStorage.getItem('appTheme') || 'neutre');
    document.querySelectorAll('.theme-option').forEach(option => {
        option.addEventListener('click', () => {
            const selectedThemeKey = option.dataset.themeKey;
            applyTheme(selectedThemeKey);
            updateThemeSelectionUI(selectedThemeKey);
        });
    });

    // --- NOUVEAUTÉS ---
    document.getElementById('showUpdatesBtn').onclick = () => {
        showUpdatesModal(updatesLog);
    };

    // --- FEEDBACK ---
    document.getElementById('sendFeedbackBtn').onclick = () => {
        const feedbackBody = document.getElementById('feedbackTextarea').value;
        if (feedbackBody.trim() === '') {
            showInfoModal("Texte vide", "Veuillez écrire votre idée avant de l'envoyer.");
            return;
        }
        const mailtoEmail = 'jasonpougin1@gmail.com';
        const mailtoSubject = 'Feedback Pointeuse App';
        const fullBody = `Feedback de : ${currentUser.displayName} (Email: ${currentUser.email})\n-------------------------------------------------\n\n${feedbackBody}`;
        const mailtoLink = `mailto:${mailtoEmail}?subject=${encodeURIComponent(mailtoSubject)}&body=${encodeURIComponent(fullBody)}`;
        try {
            window.location.href = mailtoLink;
        } catch (error) {
            console.error("Erreur mailto:", error);
            showInfoModal("Erreur", "Impossible d'ouvrir l'application d'e-mail.");
        }
    };

    // --- DÉCONNEXION ---
    document.getElementById('logoutBtnSettings').onclick = () => signOut(auth);
}

function updateThemeSelectionUI(selectedKey) {
    document.querySelectorAll('.theme-option').forEach(option => {
        const primaryColor = themes[selectedKey].colors['--color-primary'];
        if (option.dataset.themeKey === selectedKey) {
            option.style.borderColor = primaryColor;
            option.style.boxShadow = `0 0 0 2px ${primaryColor}`;
        } else {
            option.style.borderColor = 'var(--color-border)';
            option.style.boxShadow = 'none';
        }
    });
}

function formatMsToHHm(ms) {
    if (!ms || ms <= 0) return '0h 00m';
    const totalMinutes = Math.floor(ms / 60000); 
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/**
 * Récupère tous les pointages, les groupe par jour et calcule les totaux (heures + km).
 */
async function fetchAndGroupPointages() {
    const q = query(
        collection(db, "pointages"),
        where("uid", "==", currentUser.uid),
        orderBy("timestamp", "asc")
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        showInfoModal("Info", "Vous n'avez aucun pointage à exporter.");
        return null;
    }

    const timeFormat = { hour: '2-digit', minute: '2-digit' };
    const dateFormat = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    
    const groupedData = new Map();
    let totalExportMs = 0;
    let totalExportKm = 0;

    // --- NOUVEAU : Filtre Javascript pour l'export ---
    const activeProfileName = localStorage.getItem('currentProfileName') || currentUser.displayName;
    const isAdmin = currentUser.role === 'admin';

    querySnapshot.forEach(doc => {
        const data = doc.data();
        
        // Si c'est un employé normal, on ignore les pointages des autres profils
        if (!isAdmin && data.userName !== activeProfileName) {
            return;
        }

        if (!data.endTime) return;

        const start = new Date(data.timestamp);
        const end = new Date(data.endTime);
        const pauseMs = data.pauseDurationMs || 0;
        const durationMs = (end - start) - pauseMs;
        const km = parseFloat(data.distanceKm) || 0; // On récupère les KM

        if (durationMs <= 0) return;

        const dateKey = start.toISOString().split('T')[0];
        
        if (!groupedData.has(dateKey)) {
            groupedData.set(dateKey, {
                dateDisplay: start.toLocaleDateString('fr-FR', dateFormat),
                entries: [],
                totalDayMs: 0,
                totalDayKm: 0
            });
        }

        const dayData = groupedData.get(dateKey);
        dayData.totalDayMs += durationMs; 
        dayData.totalDayKm += km;
        totalExportMs += durationMs; 
        totalExportKm += km;

        dayData.entries.push({
            chantier: data.chantier || '',
            startTime: start.toLocaleTimeString('fr-FR', timeFormat),
            endTime: end.toLocaleTimeString('fr-FR', timeFormat),
            duration: formatMsToHHm(durationMs), 
            km: km > 0 ? `${km} km` : '-', 
            notes: (data.notes || '').replace(/\n/g, ' ') 
        });
    });
    
    // Si l'utilisateur n'a rien après filtrage
    if (groupedData.size === 0) {
         showInfoModal("Info", "Vous n'avez aucun pointage à exporter sur ce profil.");
         return null;
    }

    return { groupedData, totalExportMs, totalExportKm };
}

/**
 * Exporte l'historique complet en PDF avec correction des superpositions et support KM.
 */
async function exportUserHistoryToPDF() {
    const exportData = await fetchAndGroupPointages();
    if (!exportData) return; 

    const { groupedData, totalExportMs, totalExportKm } = exportData;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    let currentY = 20; 

    // On récupère le bon nom (Profil ou Admin)
    const activeProfileName = localStorage.getItem('currentProfileName') || currentUser.displayName;

    // --- 1. ENTÊTE ---
    doc.setFontSize(18).setFont(undefined, 'bold');
    doc.text("Rapport d'Activité & Kilométrage", 14, currentY);
    currentY += 10;

    doc.setFontSize(11).setFont(undefined, 'normal');
    doc.text(`Employé : ${activeProfileName}`, 14, currentY);
    currentY += 6;
    doc.text(`Période : Historique complet au ${new Date().toLocaleDateString('fr-FR')}`, 14, currentY);
    currentY += 10;

    // --- RÉCAPITULATIF TOTAL ---
    doc.setDrawColor(41, 128, 185).setLineWidth(0.5);
    doc.rect(14, currentY, 182, 15);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL CUMULÉ : ${formatMsToHHm(totalExportMs)}`, 20, currentY + 10);
    doc.text(`DISTANCE TOTALE : ${totalExportKm.toFixed(2)} km`, 120, currentY + 10);
    currentY += 25;

    // --- 2. TABLEAUX PAR JOUR ---
    const tableHeaders = ["Chantier", "Début", "Fin", "Durée", "KM", "Notes"];
    
    for (const [dateKey, dayData] of groupedData.entries()) {
        
        // Vérifier s'il reste assez de place pour le titre + 1 ligne
        if (currentY > 250) { 
            doc.addPage();
            currentY = 20; 
        }

        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text(dayData.dateDisplay, 14, currentY);
        currentY += 5;

        // Génération du tableau
        doc.autoTable({
            head: [tableHeaders],
            body: dayData.entries.map(e => [e.chantier, e.startTime, e.endTime, e.duration, e.km, e.notes]),
            startY: currentY,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 8, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 35 }, // Chantier
                1: { cellWidth: 15 }, // Début
                2: { cellWidth: 15 }, // Fin
                3: { cellWidth: 18 }, // Durée
                4: { cellWidth: 15 }, // KM
                5: { cellWidth: 'auto'} // Notes
            },
            margin: { left: 14, right: 14 },
            didDrawPage: (data) => {
                doc.setFontSize(8).setFont(undefined, 'normal');
                doc.text(`Page ${doc.internal.getNumberOfPages()}`, 105, 287, { align: 'center' });
            }
        });

        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : (doc.autoTable.previous ? doc.autoTable.previous.finalY : currentY + 20);
        
        // Mise à jour de la position pour éviter la superposition
        currentY = finalY + 8;

        // Total journalier
        doc.setFontSize(9).setFont(undefined, 'bold');
        doc.text(`Total Jour : ${formatMsToHHm(dayData.totalDayMs)} | ${dayData.totalDayKm.toFixed(2)} km`, 196, currentY - 3, { align: 'right' });
        currentY += 5;
    }

    doc.save(`Historique_Pointages_${activeProfileName.replace(/ /g, '_')}.pdf`);
}