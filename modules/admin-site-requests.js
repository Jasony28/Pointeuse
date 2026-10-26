// modules/admin-site-requests.js
import { db, showInfoModal, showConfirmationModal } from '../app.js';
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// Les demandes viennent du site public : leur texte est échappé avant affichage
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const icon = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const icons = {
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
};

export async function render() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6">
            <div>
                <h2 class="text-2xl font-bold">Demandes venant du site web</h2>
                <p class="mt-1 text-sm" style="color: var(--color-text-muted);">Validez une demande en choisissant l'employé : elle est ajoutée à son planning.</p>
            </div>
            <div id="requests-list" class="space-y-4">
                <div class="page-loader"><div class="spinner" role="status" aria-label="Chargement"></div></div>
            </div>
        </div>
    `;

    const listContainer = document.getElementById('requests-list');

    try {
        // On cherche les RDV du site qui sont 'en_attente' ou 'validé' mais pas encore 'planifié'
        const q = query(collection(db, "appointments"), where("status", "in", ["en_attente", "validé"]));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = `<p class="hours-empty">Aucune nouvelle demande en attente sur le site.</p>`;
            return;
        }

        listContainer.innerHTML = '';

        // On récupère la liste des employés pour le menu déroulant
        const usersSnap = await getDocs(collection(db, "users"));
        let staffOptions = `<option value="">Choisir un employé…</option>`;
        usersSnap.forEach(u => {
            const data = u.data();
            // On ne garde que ceux qui ne sont pas "pending" ou "banned"
            if (data.status === 'approved') {
                staffOptions += `<option value="${escapeHTML(data.uid)}" data-name="${escapeHTML(data.displayName)}">${escapeHTML(data.displayName)}</option>`;
            }
        });

        snapshot.forEach(docSnap => {
            const rdv = docSnap.data();
            const card = document.createElement('div');
            card.className = "request-card";
            card.innerHTML = `
                <div class="request-card-body">
                    <h3 class="request-card-title">${escapeHTML(rdv.type || 'Nettoyage')}</h3>
                    <p class="request-card-line">${icon(icons.user)}${escapeHTML(rdv.clientEmail)}</p>
                    <p class="request-card-line">${icon(icons.pin)}${escapeHTML(rdv.address || 'Adresse non spécifiée')}</p>
                    <p class="request-card-line">${icon(icons.calendar)}<span>Souhaité le <strong>${escapeHTML(rdv.date)}</strong> à ${escapeHTML(rdv.time)}</span></p>
                    ${rdv.message ? `<p class="request-card-message">« ${escapeHTML(rdv.message)} »</p>` : ''}
                </div>
                <div class="request-card-actions">
                    <select id="select-${docSnap.id}" class="input" aria-label="Employé">
                        ${staffOptions}
                    </select>
                    <button class="btn-assign btn btn-primary" data-id="${docSnap.id}">Valider et planifier</button>
                </div>
            `;

            card.querySelector('.btn-assign').onclick = async () => {
                const select = document.getElementById(`select-${docSnap.id}`);
                const staffId = select.value;
                const staffName = select.options[select.selectedIndex].getAttribute('data-name');

                if (!staffId) {
                    showInfoModal("Attention", "Veuillez sélectionner un employé.");
                    return;
                }

                if (await showConfirmationModal("Confirmer le chantier", `Planifier ce chantier pour ${staffName} le ${rdv.date} ?`)) {
                    await transformerEnPlanning(docSnap.id, rdv, staffId, staffName);
                }
            };

            listContainer.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        listContainer.innerHTML = `<p class="hours-empty">Erreur lors du chargement des demandes : ${escapeHTML(error.message)}</p>`;
    }
}

async function transformerEnPlanning(rdvId, rdvData, staffId, staffName) {
    try {
        // 1. Créer l'entrée dans la collection 'planning' (celle utilisée par la pointeuse)
        // Note: On adapte les champs pour qu'ils correspondent à ce que la pointeuse attend
        await addDoc(collection(db, "planning"), {
            userId: staffId,
            userName: staffName,
            site: rdvData.address || "Client Site Web", // Nom du chantier
            date: rdvData.date,
            startTime: rdvData.time,
            endTime: "17:00", // Heure par défaut, à modifier si besoin
            tasks: rdvData.type, // Description de la tâche
            source: "site_web", // Pour savoir d'où ça vient
            originalRdvId: rdvId
        });

        // 2. Mettre à jour la demande du site pour dire qu'elle est traitée
        await updateDoc(doc(db, "appointments", rdvId), {
            status: "planifié", // Ce statut fera disparaître la demande de cette liste
            assignedTo: staffName
        });

        showInfoModal("Succès", "Le chantier a été ajouté au planning de l'employé !");
        render(); // Rafraîchir la liste

    } catch (error) {
        console.error(error);
        showInfoModal("Erreur", "Erreur lors de l'assignation.");
    }
}
