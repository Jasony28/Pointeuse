import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, doc, deleteDoc, updateDoc, writeBatch, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, showConfirmationModal, getActiveProfileName, isActiveProfile } from "../app.js";

// Demande de congé du profil actif (même compte ET même profil : un compte peut être partagé)
const isMine = (entry) => entry.userId === currentUser.uid && isActiveProfile(entry.userName);
import { getWeekDateRange } from "./utils.js";

let currentWeekOffset = 0;
let leaveRequestsCache = [];
const CUSTOM_REASON_MAX_LENGTH = 100;

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 class="text-2xl font-bold">Congés de l'Équipe</h2>
                <p style="color: var(--color-text-muted);">Consultez les congés de l'équipe et soumettez vos propres demandes.</p>
            </div>
            
            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-semibold mb-4">Nouvelle demande de congé</h3>
                <form id="leaveRequestForm" class="space-y-4">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label for="leave-start-date" class="text-sm font-medium">Date de début</label>
                            <input type="date" id="leave-start-date" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                        </div>
                        <div>
                            <label for="leave-end-date" class="text-sm font-medium">Date de fin</label>
                            <input type="date" id="leave-end-date" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="single-day-leave" class="h-4 w-4 rounded">
                        <label for="single-day-leave" class="text-sm">Absence d'une seule journée</label>
                    </div>
                    <div>
                        <label for="leave-reason" class="text-sm font-medium">Raison</label>
                        <select id="leave-reason" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" required>
                            <option value="Vacances">Vacances</option>
                            <option value="Médical">Médical</option>
                            <option value="Familial">Familial</option>
                            <option value="Autre">Autre (préciser)</option>
                        </select>
                    </div>
                    <div id="custom-reason-container" class="hidden">
                        <label for="leave-reason-custom" class="text-sm font-medium">Précisez la raison</label>
                        <textarea id="leave-reason-custom" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);" rows="2"></textarea>
                        <div class="text-right text-sm" style="color: var(--color-text-muted);">
                           <span id="char-counter">0</span> / ${CUSTOM_REASON_MAX_LENGTH}
                        </div>
                    </div>
                    <div id="leave-times-container" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label for="leave-start-time" class="text-sm font-medium">Heure de début (optionnel)</label>
                            <input type="time" id="leave-start-time" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                        <div>
                            <label for="leave-end-time" class="text-sm font-medium">Heure de fin (optionnel)</label>
                            <input type="time" id="leave-end-time" class="w-full border p-2 rounded mt-1" style="background-color: var(--color-background); border-color: var(--color-border);">
                        </div>
                    </div>
                    <div class="text-right pt-2">
                        <button type="submit" class="text-white font-bold px-6 py-2 rounded" style="background-color: var(--color-primary);">
                            Envoyer la demande
                        </button>
                    </div>
                </form>
            </div>

            <div class="p-6 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex justify-between items-center mb-4">
                    <button id="prevWeekBtn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&lt;</button>
                    <h3 id="list-title" class="text-xl font-semibold text-center"></h3>
                    <button id="nextWeekBtn" class="px-4 py-2 rounded-lg" style="background-color: var(--color-background);">&gt;</button>
                </div>
                <div id="leave-list-container" class="space-y-4"></div>
            </div>
        </div>
    `;
    setTimeout(() => {
        setMinimumLeaveDate();
        setupEventListeners();
        loadAllRequestsAndDisplayList();
    }, 0);
}

function setMinimumLeaveDate() {
    const today = new Date();
    today.setDate(today.getDate() + 7); 
    const minDateString = today.toISOString().split('T')[0];
    document.getElementById('leave-start-date').min = minDateString;
    document.getElementById('leave-end-date').min = minDateString;
}

/**
 * Met à jour la collection 'planning' en fonction d'un changement de statut de congé.
 * @param {string} docId - L'ID de la demande de congé.
 * @param {object} leaveData - Les données de la demande de congé.
 * @param {string} newStatus - 'approved', 'refused', or 'deleted'.
 * @param {WriteBatch} [existingBatch] - Un batch Firestore optionnel pour combiner les opérations.
 */
async function updatePlanningOnLeaveChange(docId, leaveData, newStatus, existingBatch = null) {
    const batch = existingBatch || writeBatch(db);
    const planningRef = collection(db, "planning");

    // 1. Supprimer toutes les entrées de planning existantes pour ce congé
    const q = query(planningRef, where("id_leaveRequest", "==", docId));
    const existingEntries = await getDocs(q);
    existingEntries.forEach(doc => batch.delete(doc.ref));

    // 2. Si le nouveau statut est 'approved', créer les nouvelles entrées
    if (newStatus === 'approved') {
        // --- CORRECTION DÉCALAGE HORAIRE ---
        // On utilise T12:00:00Z (midi UTC) pour que la date soit stable
        const startDate = new Date(leaveData.startDate + 'T12:00:00Z');
        const endDate = new Date((leaveData.endDate || leaveData.startDate) + 'T12:00:00Z');

        const chantierName = `Congé (${leaveData.reason})`;

        // Boucle sur les dates UTC
        for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
            // Reconvertir en string YYYY-MM-DD
            const dateString = d.toISOString().split('T')[0];
            
            const newPlanningRef = doc(planningRef); // Crée un ID unique
            const planningData = {
                chantierId: "LEAVE_ID", // Un ID spécial pour les congés
                chantierName: chantierName,
                teamNames: [leaveData.userName],
                date: dateString, // Sauvegarde la date YYYY-MM-DD
                startTime: leaveData.startTime || "",
                notes: `Congé approuvé: ${leaveData.reason}`,
                order: 0, // Pour s'afficher en haut
                createdAt: serverTimestamp(),
                id_leaveRequest: docId // Lien vers la demande originale
            };
            batch.set(newPlanningRef, planningData);
        }
    }

    // Si on n'a pas passé de batch, on le commit ici.
    if (!existingBatch) {
        await batch.commit();
    }
}

function setupEventListeners() {
    document.getElementById('prevWeekBtn').addEventListener('click', () => { 
        currentWeekOffset--; 
        displayLeaveList(); 
    });
    document.getElementById('nextWeekBtn').addEventListener('click', () => { 
        currentWeekOffset++; 
        displayLeaveList(); 
    });
    document.getElementById('leaveRequestForm').addEventListener('submit', submitLeaveRequest);

    const startDateInput = document.getElementById('leave-start-date');
    const endDateInput = document.getElementById('leave-end-date');
    const singleDayCheckbox = document.getElementById('single-day-leave');

    singleDayCheckbox.addEventListener('change', () => {
        if (singleDayCheckbox.checked) {
            endDateInput.value = startDateInput.value;
            endDateInput.disabled = true;
        } else {
            endDateInput.disabled = false;
        }
    });
     startDateInput.addEventListener('change', () => {
        if (singleDayCheckbox.checked) {
            endDateInput.value = startDateInput.value;
        }
    });

    const reasonSelect = document.getElementById('leave-reason');
    const customReasonContainer = document.getElementById('custom-reason-container');
    const customReasonInput = document.getElementById('leave-reason-custom');
    
    reasonSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Autre') {
            customReasonContainer.classList.remove('hidden');
            customReasonInput.required = true;
        } else {
            customReasonContainer.classList.add('hidden');
            customReasonInput.required = false;
            customReasonInput.value = '';
        }
    });

    const charCounter = document.getElementById('char-counter');
    customReasonInput.addEventListener('input', () => {
        const count = customReasonInput.value.length;
        charCounter.textContent = count;
        charCounter.style.color = count > CUSTOM_REASON_MAX_LENGTH ? 'red' : 'var(--color-text-muted)';
    });

    // Logique d'action unifiée
    document.getElementById('leave-list-container').addEventListener('click', async (e) => {
        const button = e.target;
        const docId = button.dataset.id;
        if (!docId) return; // Ce n'est pas un bouton qui nous intéresse

        // On a besoin des données du congé pour toutes les actions
        const leaveDocRef = doc(db, "leaveRequests", docId);
        let leaveData;
        try {
            const leaveDocSnap = await getDoc(leaveDocRef);
            if (!leaveDocSnap.exists()) {
                showInfoModal("Erreur", "Demande non trouvée.");
                loadAllRequestsAndDisplayList();
                return;
            }
            leaveData = leaveDocSnap.data();
        } catch (error) {
            showInfoModal("Erreur", "Impossible de récupérer la demande.");
            return;
        }

        // Logique pour le bouton ANNULER (pour l'utilisateur ou l'admin)
        if (button.classList.contains('cancel-leave-btn')) {
            if (currentUser.role !== 'admin' && !isMine(leaveData)) {
                showInfoModal("Action impossible", "Vous ne pouvez annuler que vos propres demandes.");
                return;
            }
            const confirmed = await showConfirmationModal("Confirmation", "Êtes-vous sûr de vouloir annuler cette demande ? (Cela la retirera aussi du planning si elle était approuvée)");
            if (confirmed) {
                try {
                    const batch = writeBatch(db);
                    batch.delete(leaveDocRef); // Supprimer la demande
                    await updatePlanningOnLeaveChange(docId, leaveData, 'deleted', batch); // Nettoyer le planning
                    await batch.commit(); // Valider les deux opérations
                    
                    showInfoModal("Succès", "La demande a été annulée et retirée du planning.");
                    loadAllRequestsAndDisplayList();
                } catch (error) {
                    console.error("Erreur d'annulation:", error);
                    showInfoModal("Erreur", "Impossible d'annuler la demande.");
                }
            }
        }

        // Logique pour le bouton ACCEPTER (admin seulement)
        else if (button.classList.contains('approve-leave-btn')) {
            if (currentUser.role !== 'admin') return; 
            if (leaveData.status === 'approved') return; // Déjà fait
            
            button.disabled = true;
            try {
                const batch = writeBatch(db);
                batch.update(leaveDocRef, { status: 'approved' }); // Mettre à jour la demande
                await updatePlanningOnLeaveChange(docId, leaveData, 'approved', batch); // Ajouter au planning
                await batch.commit(); // Valider les deux
                
                loadAllRequestsAndDisplayList();
            } catch (error) {
                console.error("Erreur d'approbation:", error);
                showInfoModal("Erreur", "Impossible d'approuver la demande.");
                button.disabled = false;
            }
        }

        // Logique pour le bouton REFUSER (admin seulement)
        else if (button.classList.contains('refuse-leave-btn')) {
            if (currentUser.role !== 'admin') return;
            if (leaveData.status === 'refused') return; // Déjà fait

            button.disabled = true;
            try {
                const batch = writeBatch(db);
                batch.update(leaveDocRef, { status: 'refused' }); // Mettre à jour la demande
                await updatePlanningOnLeaveChange(docId, leaveData, 'refused', batch); // Nettoyer le planning
                await batch.commit(); // Valider les deux
                
                loadAllRequestsAndDisplayList();
            } catch (error) {
                console.error("Erreur de refus:", error);
                showInfoModal("Erreur", "Impossible de refuser la demande.");
                button.disabled = false;
            }
        }
    });
}


async function loadAllRequestsAndDisplayList() {
    try {
        const q = query(collection(db, "leaveRequests"), orderBy("startDate", "desc"));
        const snapshot = await getDocs(q);
        leaveRequestsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayLeaveList();
    } catch (error) { console.error("Erreur de chargement des congés:", error); }
}


function displayLeaveList() {
    const listContainer = document.getElementById('leave-list-container');
    const listTitle = document.getElementById('list-title');
    listContainer.innerHTML = '';

    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    listTitle.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'})}`;

    const dailyEntries = [];
    leaveRequestsCache.forEach(req => {
        // --- CORRECTION DÉCALAGE HORAIRE ---
        const start = new Date(req.startDate + 'T12:00:00Z');
        const end = new Date((req.endDate || req.startDate) + 'T12:00:00Z');
        let loopDate = new Date(start);
        while (loopDate <= end) {
            if (loopDate >= startOfWeek && loopDate <= endOfWeek) {
                dailyEntries.push({ date: new Date(loopDate), ...req });
            }
            loopDate.setUTCDate(loopDate.getUTCDate() + 1); // Utilise setUTCDate
        }
    });
    
    const groupedByDay = dailyEntries.reduce((acc, entry) => {
        // --- CORRECTION DÉCALAGE HORAIRE ---
        // entry.date est une date UTC, on peut utiliser toISOString sans danger
        const dateString = entry.date.toISOString().split('T')[0];
        
        if (!acc[dateString]) acc[dateString] = [];
        acc[dateString].push(entry);
        return acc;
    }, {});
    
    const sortedDays = Object.keys(groupedByDay).sort();

    if (sortedDays.length === 0) {
        listContainer.innerHTML = `<p class="text-center py-4" style="color: var(--color-text-muted);">Aucun congé cette semaine.</p>`;
        return;
    }

    sortedDays.forEach(dateString => {
        const dayEntries = groupedByDay[dateString];
        // --- CORRECTION DÉCALAGE HORAIRE ---
        // On recrée la date en UTC pour un affichage stable
        const dayDate = new Date(dateString + 'T12:00:00Z');
        const dayWrapper = document.createElement('div');
        // On affiche en UTC
        dayWrapper.innerHTML = `<div class="border-b pb-2 mb-3"><h3 class="font-bold text-lg">${dayDate.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })}</h3></div>`;
        
        const entriesContainer = document.createElement('div');
        entriesContainer.className = 'space-y-3';

        dayEntries.forEach(entry => {
            // Ne pas afficher les entrées des autres utilisateurs si elles sont en attente
            if (entry.status === 'pending' && !isMine(entry) && currentUser.role !== 'admin') {
                return;
            }

            let statusStyle = '', statusIcon = '', statusText = '';
            
            if (entry.status === 'approved') {
                statusStyle = 'background-color: rgba(22, 163, 74, 0.1); border-color: rgba(22, 163, 74, 0.4);';
                statusText = 'Accepté';
                 // Bouton Annuler visible même si accepté, pour l'admin ou le profil qui a fait la demande
                if (currentUser.role === 'admin' || isMine(entry)) {
                    statusIcon = `<button class="cancel-leave-btn text-red-500 hover:text-red-700 text-xs font-bold" data-id="${entry.id}">ANNULER</button>`;
                }

            } else if (entry.status === 'refused') {
                statusStyle = 'background-color: rgba(220, 38, 38, 0.1); border-color: rgba(220, 38, 38, 0.4);';
                statusText = 'Refusé';
                 // L'admin peut toujours annuler (supprimer) une demande refusée
                if(currentUser.role === 'admin') {
                     statusIcon = `<button class="cancel-leave-btn text-red-500 hover:text-red-700 text-xs font-bold" data-id="${entry.id}">SUPPRIMER</button>`;
                }

            } else if (entry.status === 'pending') {
                statusStyle = 'background-color: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.4);';
                statusText = 'En attente';

                if (currentUser.role === 'admin') {
                    statusIcon = `
                        <div class="flex gap-2 justify-end mt-1">
                            <button class="refuse-leave-btn bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-2 py-1 rounded" data-id="${entry.id}">Refuser</button>
                            <button class="approve-leave-btn bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-2 py-1 rounded" data-id="${entry.id}">Accepter</button>
                        </div>`;
                } 
                else if (isMine(entry)) {
                    statusIcon = `<button class="cancel-leave-btn text-red-500 hover:text-red-700 text-xs font-bold" data-id="${entry.id}">ANNULER</button>`;
                }
            }

            let reasonText = entry.reason;
            if (entry.startTime && entry.endTime) {
                reasonText = `${entry.reason} (de ${entry.startTime} à ${entry.endTime})`;
            }
            
            const card = document.createElement('div');
            card.className = `p-3 border rounded-lg flex justify-between items-center`;
            card.style.cssText = statusStyle;
            card.innerHTML = `
                <div>
                    <p class="font-bold" style="color: var(--color-text-base);">${entry.userName}</p>
                    <p class="text-sm" style="color: var(--color-text-muted);">${reasonText}</p>
                </div>
                <div class="text-right">
                    <span class="font-bold text-sm">${statusText}</span>
                    ${statusIcon}
                </div>
            `;
            entriesContainer.appendChild(card);
        });

        if (entriesContainer.children.length > 0) {
            dayWrapper.appendChild(entriesContainer);
            listContainer.appendChild(dayWrapper);
        }
    });
}


async function submitLeaveRequest(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Vérification...";

    const startDate = document.getElementById('leave-start-date').value;
    const isSingleDay = document.getElementById('single-day-leave').checked;
    const endDate = isSingleDay ? startDate : document.getElementById('leave-end-date').value || startDate;
    let reason = document.getElementById('leave-reason').value;
    const customReason = document.getElementById('leave-reason-custom').value;
    const startTime = document.getElementById('leave-start-time').value;
    const endTime = document.getElementById('leave-end-time').value;

    // --- VALIDATIONS ---
    if (customReason.length > CUSTOM_REASON_MAX_LENGTH) {
        showInfoModal("Erreur", `La raison personnalisée ne doit pas dépasser ${CUSTOM_REASON_MAX_LENGTH} caractères.`);
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }
    if (new Date(endDate) < new Date(startDate)) {
        showInfoModal("Attention", "La date de fin ne peut pas être antérieure à la date de début.");
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }
    if (reason === 'Autre') {
        if (!customReason.trim()) {
            showInfoModal("Attention", "Veuillez préciser la raison pour votre demande 'Autre'.");
            submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
        }
        reason = customReason.trim();
    }
    // --- FIN VALIDATIONS ---

    const requestData = {
        userId: currentUser.uid, userName: getActiveProfileName(),
        startDate, endDate, reason, status: 'pending',
        requestedAt: serverTimestamp()
    };
    if (startTime && endTime) {
        requestData.startTime = startTime;
        requestData.endTime = endTime;
    }
    
    // --- CONFIRMATION ---
    // --- CORRECTION DÉCALAGE HORAIRE ---
    // On utilise T12:00:00Z pour un affichage stable
    const options = { timeZone: 'UTC', day: 'numeric', month: 'long' };
    let summary = `Motif : **${reason}**\nDu **${new Date(startDate+'T12:00:00Z').toLocaleDateString('fr-FR', options)}** au **${new Date(endDate+'T12:00:00Z').toLocaleDateString('fr-FR', options)}**`;
    if(startTime && endTime) summary += `\nDe **${startTime}** à **${endTime}**`;
    
    const confirmed = await showConfirmationModal("Récapitulatif", summary);
    if (!confirmed) {
        submitButton.disabled = false; submitButton.textContent = "Envoyer la demande"; return;
    }
    // --- FIN CONFIRMATION ---

    submitButton.textContent = "Envoi en cours...";
    try {
        await addDoc(collection(db, "leaveRequests"), requestData);
        showInfoModal("Succès", "Votre demande de congé a bien été envoyée.");
        form.reset();
        document.getElementById('single-day-leave').dispatchEvent(new Event('change'));
        document.getElementById('leave-reason').dispatchEvent(new Event('change'));
        loadAllRequestsAndDisplayList();
    } catch (error) {
        showInfoModal("Erreur", "L'envoi de la demande a échoué.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la demande";
    }
}