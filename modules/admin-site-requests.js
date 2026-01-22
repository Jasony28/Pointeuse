// modules/admin-site-requests.js
import { db, showInfoModal } from '../app.js';
import { collection, getDocs, query, where, addDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

export async function render() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
        <h2 class="text-2xl font-bold mb-4">Demandes venant du Site Web</h2>
        <div id="requests-list" class="space-y-4">
            <div class="text-center p-4"><div class="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div></div>
        </div>
    `;

    const listContainer = document.getElementById('requests-list');

    try {
        // On cherche les RDV du site qui sont 'en_attente' ou 'validé' mais pas encore 'planifié'
        const q = query(collection(db, "appointments"), where("status", "in", ["en_attente", "validé"]));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            listContainer.innerHTML = `<p class="text-gray-500 text-center">Aucune nouvelle demande en attente sur le site.</p>`;
            return;
        }

        listContainer.innerHTML = ''; // Clear loader

        // On récupère la liste des employés pour le menu déroulant
        const usersSnap = await getDocs(collection(db, "users"));
        let staffOptions = `<option value="">-- Choisir un employé --</option>`;
        usersSnap.forEach(u => {
            const data = u.data();
            // On ne garde que ceux qui ne sont pas "pending" ou "banned"
            if (data.status === 'approved') {
                staffOptions += `<option value="${data.uid}" data-name="${data.displayName}">${data.displayName}</option>`;
            }
        });

        snapshot.forEach(docSnap => {
            const rdv = docSnap.data();
            const card = document.createElement('div');
            card.className = "bg-white p-4 rounded-lg shadow border-l-4 border-blue-500";
            card.innerHTML = `
                <div class="flex justify-between items-start flex-wrap gap-2">
                    <div>
                        <h3 class="font-bold text-lg">${rdv.type || 'Nettoyage'}</h3>
                        <p class="text-sm text-gray-600">👤 Client : ${rdv.clientEmail}</p>
                        <p class="text-sm text-gray-600">📍 Adresse : ${rdv.address || 'Non spécifiée'}</p>
                        <p class="text-sm text-gray-600">📅 Souhaité le : <strong>${rdv.date}</strong> à ${rdv.time}</p>
                        ${rdv.message ? `<p class="text-xs italic mt-2 text-gray-500">"${rdv.message}"</p>` : ''}
                    </div>
                    <div class="flex flex-col gap-2 w-full sm:w-auto">
                        <select id="select-${docSnap.id}" class="border p-2 rounded text-sm bg-gray-50 mb-2">
                            ${staffOptions}
                        </select>
                        <button class="btn-assign bg-green-600 text-white px-4 py-2 rounded shadow hover:bg-green-700 transition" 
                                data-id="${docSnap.id}">
                            ✅ Valider & Planifier
                        </button>
                    </div>
                </div>
            `;

            // Logique du bouton
            card.querySelector('.btn-assign').onclick = async () => {
                const select = document.getElementById(`select-${docSnap.id}`);
                const staffId = select.value;
                const staffName = select.options[select.selectedIndex].getAttribute('data-name');

                if (!staffId) {
                    alert("Veuillez sélectionner un employé.");
                    return;
                }

                if(confirm(`Confirmer le chantier pour ${staffName} le ${rdv.date} ?`)) {
                    await transformerEnPlanning(docSnap.id, rdv, staffId, staffName);
                }
            };

            listContainer.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        listContainer.innerHTML = `<p class="text-red-500">Erreur lors du chargement des demandes : ${error.message}</p>`;
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
        alert("Erreur lors de l'assignation.");
    }
}