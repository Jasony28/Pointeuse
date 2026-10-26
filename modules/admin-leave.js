import { collection, query, orderBy, getDocs, doc, updateDoc, writeBatch, where, serverTimestamp, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent, showInfoModal, showConfirmationModal } from "../app.js";

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 class="text-2xl font-bold">Demandes de congés</h2>
                <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Approuvez ou refusez les demandes de congé de votre équipe.</p>
            </div>
            <div id="leave-requests-list" class="space-y-3">
                <div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div>
            </div>
        </div>
    `;
    // Un seul écouteur : les rechargements de la liste n'en ajoutent pas d'autres
    document.getElementById('leave-requests-list').addEventListener('click', handleAdminAction);
    setTimeout(loadAllRequests, 0);
}
async function loadAllRequests() {
    const listContainer = document.getElementById('leave-requests-list');
    try {
        // 1. On récupère les demandes triées par date de début
        const q = query(collection(db, "leaveRequests"), orderBy("startDate", "asc"));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="hours-empty">Aucune demande de congé pour le moment.</p>';
            return;
        }

        // 2. On transforme les documents en un tableau JavaScript
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 3. On applique le tri personnalisé pour prioriser les "pending"
        requests.sort((a, b) => {
            // Si 'a' est en attente et 'b' ne l'est pas, 'a' passe en premier
            if (a.status === 'pending' && b.status !== 'pending') {
                return -1;
            }
            // Si 'b' est en attente et 'a' ne l'est pas, 'b' passe en premier
            if (a.status !== 'pending' && b.status === 'pending') {
                return 1;
            }
            
            // Si les deux ont le même statut (tous deux 'pending' ou tous deux 'non-pending'),
            // on garde le tri par date de début (que la requête a déjà fait)
            const dateA = new Date(a.startDate + 'T00:00:00');
            const dateB = new Date(b.startDate + 'T00:00:00');
            return dateA - dateB;
        });

        // 4. On affiche la liste maintenant triée
        listContainer.innerHTML = '';
        requests.forEach(data => {
            // On passe l'objet complet (qui contient l'id)
            listContainer.appendChild(createRequestElement(data.id, data));
        });
    } catch (error) {
        console.error("Erreur de chargement des demandes:", error);
        listContainer.innerHTML = '<p class="hours-empty">Erreur de chargement.</p>';
    }
}

function createRequestElement(id, data) {
    const status = data.status === 'approved' || data.status === 'refused' ? data.status : 'pending';
    const el = document.createElement('div');
    el.className = `leave-card is-${status}`;

    // Utilisation de T00:00:00
    const startDate = new Date(data.startDate + 'T00:00:00');
    const endDate = new Date((data.endDate || data.startDate) + 'T00:00:00');
    const options = { year: 'numeric', month: 'long', day: 'numeric' };

    let dateDisplay;
    if (startDate.getTime() === endDate.getTime()) {
        dateDisplay = startDate.toLocaleDateString('fr-FR', { weekday: 'long', ...options });
    } else {
        dateDisplay = `Du ${startDate.toLocaleDateString('fr-FR', options)} au ${endDate.toLocaleDateString('fr-FR', options)}`;
    }

    const STATUS_LABELS = { approved: 'Approuvé', refused: 'Refusé', pending: 'En attente' };

    el.innerHTML = `
        <div class="leave-card-head">
            <div class="min-w-0">
                <p class="leave-card-name">${escapeHTML(data.userName)}</p>
                <p class="text-sm font-semibold mt-0.5 leave-card-date" style="color: var(--color-primary);">${dateDisplay}</p>
            </div>
            <span class="leave-status is-${status}">${STATUS_LABELS[status]}</span>
        </div>
        <p class="leave-card-reason">${escapeHTML(data.reason)}</p>
        ${data.startTime && data.endTime ? `<span class="leave-hours mt-1">de ${escapeHTML(data.startTime)} à ${escapeHTML(data.endTime)}</span>` : ''}
        <div class="leave-card-actions">
            ${status !== 'refused' ? `<button data-id="${id}" data-action="refused" class="action-btn btn btn-secondary">Refuser</button>` : ''}
            ${status !== 'approved' ? `<button data-id="${id}" data-action="approved" class="action-btn btn btn-primary">Approuver</button>` : ''}
            <button data-id="${id}" data-action="delete" class="action-btn icon-btn is-danger" title="Supprimer la demande" aria-label="Supprimer la demande"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></button>
        </div>
    `;
    return el;
}

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
        // --- MODIFIÉ ---
        // Utilisation de T00:00:00 comme demandé
        const startDate = new Date(leaveData.startDate + 'T00:00:00');
        const endDate = new Date((leaveData.endDate || leaveData.startDate) + 'T00:00:00');

        const chantierName = `Congé (${leaveData.reason})`;

        // Boucle sur les dates locales
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            // Recréer la string YYYY-MM-DD
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;
            
            const newPlanningRef = doc(planningRef); // Crée un ID unique
            const planningData = {
                chantierId: "LEAVE_ID", // Un ID spécial pour les congés
                chantierName: chantierName,
                teamNames: [leaveData.userName],
                date: dateString,
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


async function handleAdminAction(e) {
    const button = e.target.closest('.action-btn');
    if (!button) return;

    const action = button.dataset.action;
    const docId = button.dataset.id;
    
    // On doit récupérer la dernière version des données du congé
    const leaveDocRef = doc(db, "leaveRequests", docId);
    const leaveDocSnap = await getDoc(leaveDocRef);

    if (!leaveDocSnap.exists()) {
        showInfoModal("Erreur", "Demande de congé non trouvée.");
        loadAllRequests(); // Recharger la liste pour nettoyer
        return;
    }
    const leaveData = leaveDocSnap.data();

    if (action === 'delete') {
        const confirmed = await showConfirmationModal("Confirmation", `Voulez-vous vraiment supprimer la demande de ${leaveData.userName} ? Cette action est irréversible et la retirera du planning.`);
        if (confirmed) {
            try {
                const batch = writeBatch(db);
                // Supprimer la demande de congé
                batch.delete(leaveDocRef);
                // Nettoyer le planning (en passant 'deleted', la fonction va juste supprimer les entrées)
                await updatePlanningOnLeaveChange(docId, leaveData, 'deleted', batch);
                // Commiter le tout
                await batch.commit();
                
                loadAllRequests();
            } catch (error) {
                console.error("Erreur de suppression:", error);
                showInfoModal("Erreur", "La suppression a échoué.");
            }
        }
    } else { // Logique pour Approuver/Refuser
        // Ne rien faire si le statut est déjà le bon
        if (leaveData.status === action) return;
        
        try {
            const batch = writeBatch(db);
            // Mettre à jour la demande de congé
            batch.update(leaveDocRef, { status: action });
            // Mettre à jour le planning (ajoute ou supprime les entrées)
            await updatePlanningOnLeaveChange(docId, leaveData, action, batch);
            // Commiter le tout
            await batch.commit();

            loadAllRequests();
        } catch (error) {
            console.error("Erreur de mise à jour du statut:", error);
            showInfoModal("Erreur", "La mise à jour a échoué.");
        }
    }
}