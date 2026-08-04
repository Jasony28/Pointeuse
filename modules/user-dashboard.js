import { collection, query, where, getDocs, orderBy, doc, getDoc, addDoc, serverTimestamp, updateDoc, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getActiveChantiers, getTeamMembers } from "./data-service.js";

const MAPBOX_ACCESS_TOKEN = "pk.eyJ1IjoiamFzb255MjgiLCJhIjoiY21lMDcyYWhzMDIyODJsczl0cmM0aTVjciJ9.V14cJXdBNoq3yAQTDeUg-A";
const HOME_BASE_ADDRESS = "Marche-en-Famenne, Belgium";

let chantiersCache = [];
let colleaguesCache = [];
let currentWeekOffset = 0;
let unreadListener = null;

export async function render() {
    if (unreadListener) {
        unreadListener();
        unreadListener = null;
    }

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            <!-- Zone d'action principale : Pointage Manuel -->
            <div class="p-6 rounded-lg shadow-lg text-center" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-bold mb-4">Prêt à enregistrer vos heures ?</h3>
                <button id="openManualPointageBtn" class="w-full md:w-auto text-white font-bold px-8 py-4 rounded-lg text-lg shadow-lg transition-colors" style="background-color: var(--color-primary); hover:background-color: var(--color-primary-hover);">
                    ➕ Ajouter un pointage
                </button>
            </div>
            
            <div id="missed-pointage-suggestions" class="space-y-4"></div>

            <div id="unread-messages-container" class="hidden transform transition-all duration-300 hover:scale-[1.01] cursor-pointer"></div>

            <div>
                <h2 class="text-xl font-bold mb-2">🗓️ Mon Planning de la Semaine</h2>
                <div class="rounded-lg shadow-sm p-4" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center">
                        <button id="prevWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);"><</button>
                        <div class="text-center"> 
                            <div id="currentPeriodDisplay" class="font-semibold text-lg"></div>
                            <div id="currentWeekTotalHours" class="text-sm font-bold" style="color: var(--color-primary);"></div>
                        </div>
                        <button id="nextWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80" style="background-color: var(--color-background);">></button>
                    </div>
                </div>
                <div id="schedule-grid" class="grid grid-cols-1 md:grid-cols-7 gap-2 mt-4"></div>
            </div>
        </div>

        <!-- MODAL DE POINTAGE MANUEL -->
        <div id="manualPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h3 class="text-xl font-bold mb-4">Ajouter un pointage</h3>
                <form id="manualPointageForm" class="space-y-5">
                    
                    <!-- 1. Les Heures -->
                    <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <label class="block text-sm font-bold mb-2" style="color: var(--color-primary);">1. Date et Heures</label>
                        <input type="date" id="pointageDate" class="w-full border p-2 rounded mb-3" required>
                        <div class="flex gap-4">
                            <div class="w-1/2">
                                <label class="text-xs font-medium text-gray-500">Heure d'arrivée</label>
                                <input type="time" id="pointageStartTime" class="w-full border p-2 rounded mt-1" required>
                            </div>
                            <div class="w-1/2">
                                <label class="text-xs font-medium text-gray-500">Heure de départ</label>
                                <input type="time" id="pointageEndTime" class="w-full border p-2 rounded mt-1" required>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Le Chantier -->
                    <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <label class="block text-sm font-bold mb-2" style="color: var(--color-primary);">2. Lieu du chantier</label>
                        <select id="pointageChantierSelect" class="w-full border p-2 rounded" required></select>
                    </div>

                    <!-- 3. Les Personnes -->
                    <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <label class="block text-sm font-bold mb-2" style="color: var(--color-primary);">3. Ton nom</label>
                        <div id="manualColleaguesContainer" class="p-2 border rounded max-h-32 overflow-y-auto space-y-1 bg-white"></div>
                        
                        <!-- Ajout dynamique d'un nom -->
                        <div class="flex gap-2 mt-3 pt-3 border-t">
                            <input type="text" id="newPersonName" placeholder="Nom manquant ?" class="w-full border p-2 rounded text-sm">
                            <button type="button" id="addNewPersonBtn" class="px-3 rounded text-sm font-bold text-white transition-colors" style="background-color: var(--color-primary);">Ajouter</button>
                        </div>
                    </div>

                    <div class="pt-2">
                        <label class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                            <input type="checkbox" id="isDriverCheckbox" class="h-5 w-5 rounded border-gray-300"/>
                            <span class="text-sm font-medium">Je suis le conducteur (pour le calcul des km)</span>
                        </label>
                    </div>

                    <!-- 4. Note Facultative -->
                    <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <label class="block text-sm font-bold mb-2" style="color: var(--color-primary);">4. Note (facultatif)</label>
                        <textarea id="pointageNotes" placeholder="Problème rencontré, matériel manquant, retard..." class="w-full border p-2 rounded h-20"></textarea>
                    </div>

                    <div class="flex justify-end gap-4 pt-4 border-t">
                        <button type="button" id="cancelManualPointage" class="px-4 py-2 rounded font-bold" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
                        <button type="submit" id="submitPointageBtn" class="text-white font-bold px-6 py-2 rounded transition-colors" style="background-color: var(--color-primary);">Enregistrer le pointage</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="detailsModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-20 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-lg space-y-4 relative" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <button id="closeDetailsBtn" class="absolute top-2 right-3 text-2xl font-bold" style="color: var(--color-text-muted);">×</button>
                <h3 id="modalChantierName" class="text-2xl font-bold border-b pb-2" style="border-color: var(--color-border);"></h3>
                <div>
                    <h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">ADRESSE</h4>
                    <p id="modalChantierAddress" class="hover:underline text-lg cursor-pointer" style="color: var(--color-primary);"></p>
                </div>
                <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">HEURES PRÉVUES</h4><p id="modalChantierHours" class="text-lg"></p></div>
                <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">CODES & ACCÈS</h4><div id="modalChantierKeybox" class="text-lg"></div></div>
                <div><h4 class="font-semibold text-sm" style="color: var(--color-text-muted);">INFOS SUPPLÉMENTAIRES</h4><p id="modalChantierInfo" class="text-lg" style="white-space: pre-wrap; overflow-wrap: break-word;"></p></div>
            </div>
        </div>
        
        <div id="navigationModal" class="hidden fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-40 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-xs text-center" style="background-color: var(--color-surface);">
                <h3 class="text-xl font-bold mb-5">Ouvrir l'itinéraire</h3>
                <div class="space-y-3">
                    <a id="navGoogleMaps" href="#" target="_blank" rel="noopener noreferrer" class="block w-full text-white font-semibold py-3 px-4 rounded-lg" style="background-color: #4285F4;">Google Maps</a>
                    <a id="navWaze" href="#" target="_blank" rel="noopener noreferrer" class="block w-full text-white font-semibold py-3 px-4 rounded-lg" style="background-color: #33CCFF;">Waze</a>
                </div>
                <button id="closeNavModalBtn" class="mt-6 w-full font-semibold py-2 px-4 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);">Annuler</button>
            </div>
        </div>
    `;

    setTimeout(async () => {
        try {
            await cacheDataForModals();
            initUnreadMessagesListener();
            checkForMissedPointages();
            
            document.getElementById("prevWeekBtn").onclick = () => { currentWeekOffset--; displayWeekView(); };
            document.getElementById("nextWeekBtn").onclick = () => { currentWeekOffset++; displayWeekView(); };
            displayWeekView();

            // Gestion du bouton principal et de la modale
            document.getElementById('openManualPointageBtn').onclick = openManualModal;
            document.getElementById('cancelManualPointage').onclick = closeManualModal;
            
            // Gestion de l'ajout dynamique d'un collègue
            document.getElementById('addNewPersonBtn').onclick = addNewColleague;

            const closeBtn = document.getElementById('closeDetailsBtn');
            if(closeBtn) closeBtn.onclick = () => document.getElementById('detailsModal').classList.add('hidden');
            
            const navModal = document.getElementById('navigationModal');
            const closeNavModalBtn = document.getElementById('closeNavModalBtn');
            if(navModal && closeNavModalBtn) {
                closeNavModalBtn.onclick = () => navModal.classList.add('hidden');
                navModal.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navModal.classList.add('hidden')));
            }

        } catch (error) {
            console.error("Erreur critique dans le rendu du dashboard utilisateur:", error);
        }
    }, 0);
}

async function cacheDataForModals() {
    const chantiersData = await getActiveChantiers();
    chantiersCache = chantiersData; 
    colleaguesCache = await getTeamMembers();
}

async function getContextualLists() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(0);
    const todayStr = new Date().toISOString().split('T')[0];
    const weeklyChantiers = new Set(), todaysColleagues = new Set(), todaysChantiers = new Set();
    try {
        const q = query(collection(db, "planning"), where("date", ">=", startOfWeek.toISOString().split('T')[0]), where("date", "<=", endOfWeek.toISOString().split('T')[0]));
        const querySnapshot = await getDocs(q);
        querySnapshot.docs.forEach(doc => {
            const task = doc.data();
            if (task.teamNames && task.teamNames.includes(currentUser.displayName)) {
                weeklyChantiers.add(task.chantierName);
                if (task.date === todayStr) {
                    todaysChantiers.add(task.chantierName);
                    task.teamNames.forEach(name => {
                        if (name !== currentUser.displayName) { todaysColleagues.add(name); }
                    });
                }
            }
        });
    } catch (error) { console.error("Impossible de charger le planning contextuel:", error); }
    return { weeklyChantiers, todaysColleagues, todaysChantiers };
}

async function openManualModal() {
    const modal = document.getElementById('manualPointageModal');
    const form = document.getElementById('manualPointageForm');
    const chantierSelect = document.getElementById('pointageChantierSelect');
    const colleaguesContainer = document.getElementById('manualColleaguesContainer');
    const dateInput = document.getElementById('pointageDate');
    
    // Reset form et met la date du jour par défaut
    form.reset();
    dateInput.value = new Date().toISOString().split('T')[0];
    
    chantierSelect.innerHTML = '<option>Chargement...</option>';
    colleaguesContainer.innerHTML = `<p class="text-sm text-gray-500">Chargement...</p>`;
    modal.classList.remove('hidden');
    
    // Chargement des listes
    const { weeklyChantiers, todaysColleagues, todaysChantiers } = await getContextualLists();
    const weeklyChantiersOnly = new Set([...weeklyChantiers].filter(chantier => !todaysChantiers.has(chantier)));
    const otherChantiers = chantiersCache.filter(chantier => !weeklyChantiers.has(chantier.name));
    
    // Remplissage des Chantiers
    let chantierOptionsHTML = '<option value="" disabled selected>-- Choisissez un chantier --</option>';
    const findAndBuildOption = (name) => {
        const chantier = chantiersCache.find(c => c.name === name);
        return chantier ? `<option value="${chantier.id}">${chantier.name}</option>` : '';
    };

    if (todaysChantiers.size > 0) {
        chantierOptionsHTML += '<optgroup label="Chantiers du jour">';
        todaysChantiers.forEach(name => { chantierOptionsHTML += findAndBuildOption(name); });
        chantierOptionsHTML += '</optgroup>';
    }
    if (weeklyChantiersOnly.size > 0) {
        chantierOptionsHTML += '<optgroup label="Autres chantiers de la semaine">';
        weeklyChantiersOnly.forEach(name => { chantierOptionsHTML += findAndBuildOption(name); });
        chantierOptionsHTML += '</optgroup>';
    }
    if (otherChantiers.length > 0) {
        chantierOptionsHTML += '<optgroup label="Tous les autres chantiers">';
        otherChantiers.forEach(chantier => { chantierOptionsHTML += `<option value="${chantier.id}">${chantier.name}</option>`; });
        chantierOptionsHTML += '</optgroup>';
    }
    chantierSelect.innerHTML = chantierOptionsHTML;
    
    // Remplissage des Collègues
    const otherColleagues = colleaguesCache.filter(colleague => !todaysColleagues.has(colleague.name) && colleague.name !== currentUser.displayName);
    const createColleagueElement = (name, isChecked = false) => `
        <label class="flex items-center gap-2 p-1.5 rounded hover:bg-gray-100 w-full cursor-pointer transition-colors">
            <input type="checkbox" value="${name}" name="colleagues" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded" />
            <span class="font-medium text-gray-800">${name}</span>
        </label>`;
    
    let colleaguesHTML = createColleagueElement(currentUser.displayName, true); // On s'ajoute soi-même par défaut
    
    if (todaysColleagues.size > 0) {
        todaysColleagues.forEach(name => { colleaguesHTML += createColleagueElement(name); });
    }
    colleaguesHTML += `<div class="w-full border-t my-2 border-gray-200"></div>`;
    
    colleaguesContainer.innerHTML = colleaguesHTML;
    
    // Bouton pour afficher les autres
    if (otherColleagues.length > 0) {
        const showAllButton = document.createElement('button');
        showAllButton.type = 'button';
        showAllButton.textContent = `Afficher tout le monde...`;
        showAllButton.className = 'text-sm hover:underline w-full text-center p-1 mt-2';
        showAllButton.style.color = 'var(--color-primary)';
        showAllButton.onclick = () => {
            showAllButton.remove();
            colleaguesContainer.insertAdjacentHTML('beforeend', otherColleagues.map(c => c.name).map(n => createColleagueElement(n)).join(''));
        };
        colleaguesContainer.appendChild(showAllButton);
    }

    // Gestion de la soumission du formulaire
    form.onsubmit = submitManualPointage;
}

function closeManualModal() {
    document.getElementById('manualPointageModal').classList.add('hidden');
}

async function addNewColleague() {
    const input = document.getElementById('newPersonName');
    const newName = input.value.trim();
    
    if (!newName) return;

    // 1. Ajouter visuellement à la liste et cocher directement
    const container = document.getElementById('manualColleaguesContainer');
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2 p-1.5 rounded hover:bg-green-50 bg-green-100 w-full cursor-pointer transition-colors mt-1';
    label.innerHTML = `<input type="checkbox" value="${newName}" name="colleagues" checked class="w-4 h-4 text-blue-600 rounded" /><span class="font-bold text-green-800">${newName} (Nouveau)</span>`;
    container.insertBefore(label, container.firstChild.nextSibling); // Insérer juste après soi-même
    
    input.value = ''; // Vider le champ

    // 2. Sauvegarder dans Firebase pour que tout le monde l'ait la prochaine fois
    try {
        await addDoc(collection(db, "colleagues"), { name: newName, role: 'user', createdAt: serverTimestamp() });
        colleaguesCache.push({ name: newName }); // Ajouter au cache local
    } catch (error) {
        console.error("Erreur lors de la sauvegarde du nouveau collègue:", error);
    }
}

async function submitManualPointage(e) {
    e.preventDefault();
    
    const btnSubmit = document.getElementById('submitPointageBtn');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enregistrement...';

    const dateStr = document.getElementById('pointageDate').value;
    const startTimeStr = document.getElementById('pointageStartTime').value;
    const endTimeStr = document.getElementById('pointageEndTime').value;
    const chantierId = document.getElementById('pointageChantierSelect').value;
    const isDriver = document.getElementById('isDriverCheckbox').checked;
    const notes = document.getElementById('pointageNotes').value.trim();
    const selectedColleagues = Array.from(document.querySelectorAll('input[name="colleagues"]:checked')).map(el => el.value);

    if (!chantierId) {
        showInfoModal("Attention", "Veuillez choisir un chantier.");
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Enregistrer le pointage';
        return;
    }

    const chantierName = chantiersCache.find(c => c.id === chantierId)?.name;

    // Construction des dates exactes
    let startDateTime = new Date(`${dateStr}T${startTimeStr}`);
    let endDateTime = new Date(`${dateStr}T${endTimeStr}`);

    // Si l'heure de fin est plus petite que l'heure de début, on suppose que c'est un pointage de nuit
    if (endDateTime < startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
    }

    const newPointageData = {
        uid: currentUser.uid, 
        userName: currentUser.displayName, 
        chantier: chantierName, 
        chantierId: chantierId,
        colleagues: selectedColleagues,
        timestamp: startDateTime.toISOString(), 
        endTime: endDateTime.toISOString(), 
        status: 'completed', 
        pauses: [], 
        pauseDurationMs: 0,
        createdAt: serverTimestamp(),
        isDriver: isDriver,
        notes: notes
    };

    try {
        const newPointageRef = await addDoc(collection(db, "pointages"), newPointageData);
        
        // Calcul automatique du trajet si le conducteur est coché
        if (isDriver) {
            const lastPointageQuery = query(collection(db, "pointages"), where("uid", "==", currentUser.uid), where("status", "==", "completed"), orderBy("endTime", "desc"), limit(2));
            const lastPointageSnapshot = await getDocs(lastPointageQuery);
            
            let startAddressForTravel = HOME_BASE_ADDRESS;
            // Vérifier si un pointage précédent existe ce même jour
            if (lastPointageSnapshot.docs.length > 1) {
                const prevPointageDoc = lastPointageSnapshot.docs[1].data();
                if (new Date(prevPointageDoc.endTime).toDateString() === startDateTime.toDateString()) {
                    const prevChantierInfo = chantiersCache.find(c => c.name === prevPointageDoc.chantier);
                    if (prevChantierInfo && prevChantierInfo.address) {
                        startAddressForTravel = prevChantierInfo.address;
                    }
                }
            }
            
            const currentChantier = chantiersCache.find(c => c.id === chantierId);
            if (currentChantier && currentChantier.address && currentChantier.address !== startAddressForTravel) {
                calculateAndSaveTravel(startAddressForTravel, currentChantier.address, newPointageRef.id, isDriver);
            }
        }

        closeManualModal();
        showInfoModal("Succès", "Ton pointage a été enregistré avec succès !");
        
    } catch (error) {
        console.error("Erreur lors de l'enregistrement du pointage:", error);
        showInfoModal("Erreur", "Une erreur est survenue lors de l'enregistrement de ton pointage.");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Enregistrer le pointage';
    }
}

async function calculateAndSaveTravel(startAddress, endAddress, arrivalPointageId, isDriver) {
    if (!startAddress || !endAddress) return;
    try {
        const getCoordinates = async (address) => {
            const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1&country=BE`;
            const response = await fetch(geocodeUrl);
            const data = await response.json();
            if (!data.features || data.features.length === 0) throw new Error(`Adresse non trouvée : ${address}`);
            return data.features[0].center;
        };
        const startCoords = await getCoordinates(startAddress);
        const endCoords = await getCoordinates(endAddress);
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords.join(',')};${endCoords.join(',')}?access_token=${MAPBOX_ACCESS_TOKEN}&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) throw new Error(data.message || "Itinéraire non trouvé.");
        
        const route = data.routes[0];
        const distanceKm = isDriver ? (route.distance / 1000).toFixed(2) : 0;
        const durationMin = Math.round(route.duration / 60);
        
        await addDoc(collection(db, "trajets"), {
            id_utilisateur: currentUser.uid,
            id_pointage_arrivee: arrivalPointageId, 
            distance_km: parseFloat(distanceKm),
            duree_min: durationMin,
            date_creation: serverTimestamp()
        });
    } catch (error) {
        console.error("Erreur lors du calcul du trajet:", error);
    }
}

function formatDecimalHours(decimalHours) {
    if (!decimalHours || decimalHours <= 0) return '0h';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    let parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${String(minutes).padStart(2, '0')}m`);
    return parts.length > 0 ? parts.join(' ') : '0h';
}

function dbShowDetailsModal(chantierId) {
    const chantier = chantiersCache.find(c => c.id === chantierId);
    if (!chantier) return;

    document.getElementById('modalChantierName').textContent = chantier.name;
    const addressTrigger = document.getElementById('modalChantierAddress');
    
    if (chantier.address) {
        addressTrigger.textContent = chantier.address;
        addressTrigger.onclick = () => dbShowNavigationChoice(chantier.address);
        addressTrigger.parentElement.style.display = 'block';
    } else {
        addressTrigger.parentElement.style.display = 'none';
    }
    
    const hoursP = document.getElementById('modalChantierHours');
    if (chantier.totalHeuresPrevues && chantier.totalHeuresPrevues > 0) {
        hoursP.textContent = formatDecimalHours(chantier.totalHeuresPrevues);
        hoursP.parentElement.style.display = 'block';
    } else {
        hoursP.parentElement.style.display = 'none';
    }

    const keyboxContainer = document.getElementById('modalChantierKeybox');
    keyboxContainer.innerHTML = '';
    if (Array.isArray(chantier.keyboxCodes) && chantier.keyboxCodes.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'list-disc list-inside';
        chantier.keyboxCodes.forEach(code => {
            const li = document.createElement('li');
            li.textContent = code;
            ul.appendChild(li);
        });
        keyboxContainer.appendChild(ul);
    } else {
        keyboxContainer.textContent = "Non spécifié";
    }
    
    document.getElementById('modalChantierInfo').textContent = chantier.additionalInfo || "Aucune";
    document.getElementById('detailsModal').classList.remove('hidden');
}

function dbShowNavigationChoice(address) {
    const encodedAddress = encodeURIComponent(address);
    const mapsUrl = `https://maps.google.com/?q=${encodedAddress}`;
    const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;

    document.getElementById('navGoogleMaps').href = mapsUrl;
    document.getElementById('navWaze').href = wazeUrl;
    document.getElementById('navigationModal').classList.remove('hidden');
}

function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const options = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    const displayElement = document.getElementById("currentPeriodDisplay");
    if(displayElement) {
        displayElement.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;
    }

    const totalHoursElement = document.getElementById("currentWeekTotalHours");
    if (totalHoursElement) totalHoursElement.textContent = 'Chargement...';

    const scheduleGrid = document.getElementById("schedule-grid");
    if(scheduleGrid) {
        scheduleGrid.innerHTML = ""; 
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
            const dayColumn = document.createElement('div');
            dayColumn.className = 'rounded-lg p-2 min-h-[100px]';
            dayColumn.style.backgroundColor = 'var(--color-background)';
            dayColumn.innerHTML = `<h4 class="font-bold text-center border-b pb-1 mb-2" style="border-color: var(--color-border);">
                                            <span style="color: var(--color-text-base);">${days[i]}</span> 
                                            <span class="text-sm font-normal" style="color: var(--color-text-muted);">${dayDate.getUTCDate()}</span>
                                            <div id="day-total-${i}" class="text-sm font-bold mt-1" style="color: var(--color-primary); min-height: 1.25rem;"></div>
                                    </h4>
                                    <div id="day-col-${i}" class="space-y-2"></div>`;
            scheduleGrid.appendChild(dayColumn);
        }
        loadUserScheduleForWeek(startOfWeek, endOfWeek);
    }
}

async function loadUserScheduleForWeek(start, end) {
    const weekId = start.toISOString().split('T')[0];
    const publishDoc = await getDoc(doc(db, "publishedSchedules", weekId));
    const scheduleGrid = document.getElementById("schedule-grid");
    const totalHoursElement = document.getElementById("currentWeekTotalHours");

    if (!publishDoc.exists()) {
        if(scheduleGrid) scheduleGrid.innerHTML = `<p class='col-span-1 md:col-span-7 text-center p-4' style='color: var(--color-text-muted);'>Le planning de cette semaine n'a pas encore été publié.</p>`;
        if (totalHoursElement) totalHoursElement.textContent = 'Total semaine prévues : 0h';
        return;
    }

    const planningQuery = query(collection(db, "planning"), 
        where("date", ">=", start.toISOString().split('T')[0]), 
        where("date", "<=", end.toISOString().split('T')[0]), 
        orderBy("date"),
        orderBy("order")
    );
    const planningSnapshot = await getDocs(planningQuery);

    const scheduleData = planningSnapshot.docs.map(doc => doc.data());
    const userSchedule = scheduleData.filter(task => task.teamNames && task.teamNames.includes(currentUser.displayName));

    let dailyTotals = [0, 0, 0, 0, 0, 0, 0];
    let totalWeekHours = 0;

    userSchedule.forEach(task => {
        const utcDate = new Date(task.date + 'T12:00:00Z');
        const dayIndex = (utcDate.getUTCDay() + 6) % 7;
        const chantierDetails = chantiersCache.find(c => c.id === task.chantierId);
        const teamCount = (task.teamNames || []).length;
        
        if (chantierDetails && chantierDetails.totalHeuresPrevues > 0 && teamCount > 0) {
            const budgetPerPerson = (chantierDetails.totalHeuresPrevues / teamCount);
            totalWeekHours += budgetPerPerson;
            dailyTotals[dayIndex] += budgetPerPerson;
        }
    });
    
    if (totalHoursElement) totalHoursElement.textContent = `Total semaine prévues : ${formatDecimalHours(totalWeekHours)}`;

    for (let i = 0; i < 7; i++) {
        const dayTotalEl = document.getElementById(`day-total-${i}`);
        if (dayTotalEl && dailyTotals[i] > 0) dayTotalEl.textContent = formatDecimalHours(dailyTotals[i]);
    }

    for (let i = 0; i < 7; i++) {
        const dayColumn = document.getElementById(`day-col-${i}`);
        if (dayColumn) dayColumn.innerHTML = '';
    }
    
    userSchedule.forEach(data => {
        const utcDate = new Date(data.date + 'T12:00:00Z');
        const dayIndex = (utcDate.getUTCDay() + 6) % 7;
        const container = document.getElementById(`day-col-${dayIndex}`);
        if (container) {
            const chantierDetails = chantiersCache.find(c => c.id === data.chantierId);
            container.appendChild(createTaskElement(data, chantierDetails));
        }
    });
}

function createTaskElement(task, chantierDetails) {
    const el = document.createElement('div');
    el.className = 'p-3 rounded-lg shadow-sm border-l-4 text-sm cursor-pointer hover:shadow-md transition-shadow';
    el.style.backgroundColor = 'var(--color-surface)';
    el.style.borderColor = 'var(--color-primary)';

    if (chantierDetails) el.onclick = () => dbShowDetailsModal(chantierDetails.id);
    
    const teamNames = task.teamNames || [];
    const teamCount = teamNames.length;
    const team = teamCount > 0 ? `Équipe : ${teamNames.join(', ')}` : 'Pas d\'équipe';
    const note = task.notes ? `<div class="mt-2 pt-2 border-t text-xs" style="border-color: var(--color-border); color: var(--color-primary);"><strong>Note:</strong> ${task.notes}</div>` : '';

    let projectBudgetHTML = '';
    if (chantierDetails && chantierDetails.totalHeuresPrevues > 0) {
        const totalBudget = chantierDetails.totalHeuresPrevues;
        if (teamCount > 0) {
            const budgetPerPersonDecimal = (totalBudget / teamCount);
            projectBudgetHTML = `
                <div class="text-xs mt-1" style="color: var(--color-text-muted);">
                    Heures prévues (projet) : <strong>${formatDecimalHours(totalBudget)}</strong>
                </div>
                <div class="text-xs mt-1" style="color: var(--color-text-muted);">
                    Heures prévues (par pers.) : <strong>${formatDecimalHours(budgetPerPersonDecimal)}</strong>
                </div>`;
        } else {
             projectBudgetHTML = `
                <div class="text-xs mt-1" style="color: var(--color-text-muted);">
                    Heures prévues (seul) : <strong>${formatDecimalHours(totalBudget)}</strong>
                </div>`;
        }
    }

    el.innerHTML = `<div class="font-semibold" style="color: var(--color-text-base);">${task.chantierName}</div>
                    <div class="text-xs mt-1" style="color: var(--color-text-muted);">${team}</div>
                    <div class="mt-2 pt-2 border-t" style="border-color: var(--color-border);">
                        ${projectBudgetHTML} </div>
                    ${note}`;
    return el;
}

async function checkForMissedPointages() {
    const suggestionsContainer = document.getElementById('missed-pointage-suggestions');
    if (!suggestionsContainer) return;
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const suggestionsQuery = query(
        collection(db, "pointages"),
        where("colleagues", "array-contains", currentUser.displayName),
        where("timestamp", ">=", twoDaysAgo.toISOString()),
        orderBy("timestamp", "desc")
    );
    const userPointagesQuery = query(
        collection(db, "pointages"),
        where("uid", "==", currentUser.uid),
        where("timestamp", ">=", twoDaysAgo.toISOString())
    );
    const [suggestionsSnapshot, userPointagesSnapshot] = await Promise.all([
        getDocs(suggestionsQuery),
        getDocs(userPointagesQuery)
    ]);
    const userExistingPointages = new Set();
    userPointagesSnapshot.forEach(doc => {
        const data = doc.data();
        const day = new Date(data.timestamp).toISOString().split('T')[0];
        userExistingPointages.add(`${day}_${data.chantier}`);
    });
    const refusedPointages = JSON.parse(localStorage.getItem('refusedPointages') || '[]');
    const finalSuggestions = [];
    suggestionsSnapshot.forEach(doc => {
        const suggestion = { id: doc.id, ...doc.data() };
        if (!suggestion.endTime) return;
        const suggestionDay = new Date(suggestion.timestamp).toISOString().split('T')[0];
        const suggestionKey = `${suggestionDay}_${suggestion.chantier}`;
        if (!refusedPointages.includes(suggestion.id) && !userExistingPointages.has(suggestionKey)) {
            finalSuggestions.push(suggestion);
        }
    });
    if (finalSuggestions.length > 0) renderSuggestions(finalSuggestions);
}

function renderSuggestions(suggestions) {
    const container = document.getElementById('missed-pointage-suggestions');
    container.innerHTML = `<h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Suggestions de pointages :</h3>`;
    suggestions.forEach(sugg => {
        const start = new Date(sugg.timestamp);
        const end = new Date(sugg.endTime);
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        const card = document.createElement('div');
        card.className = 'border-l-4 p-4 rounded-r-lg shadow-sm mb-3';
        card.style.borderColor = 'orange';
        card.style.backgroundColor = 'var(--color-surface)';
        card.innerHTML = `
            <p class="font-semibold">${sugg.userName} a pointé sur <strong style="color: var(--color-primary);">${sugg.chantier}</strong>.</p>
            <p class="text-sm" style="color: var(--color-text-muted);">Le ${start.toLocaleDateString('fr-FR')} de ${start.toLocaleTimeString('fr-FR', timeFormat)} à ${end.toLocaleTimeString('fr-FR', timeFormat)}.</p>
            <p class="mt-2 font-medium">Étiez-vous avec cette personne ?</p>
            <div class="flex gap-4 mt-3">
                <button class="accept-suggestion-btn bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg" data-sugg-id="${sugg.id}">Oui, accepter</button>
                <button class="refuse-suggestion-btn font-bold px-4 py-2 rounded-lg" data-sugg-id="${sugg.id}" style="background-color: var(--color-background);">Non, refuser</button>
            </div>
        `;
        container.appendChild(card);
    });
    container.addEventListener('click', handleSuggestionClick);
}

async function handleSuggestionClick(e) {
    const button = e.target;
    const suggId = button.dataset.suggId;
    if (!suggId) return;
    
    if (button.classList.contains('accept-suggestion-btn')) {
        const suggDoc = await getDoc(doc(db, "pointages", suggId));
        if (!suggDoc.exists()) {
             showInfoModal("Erreur", "Le pointage original n'a pas été trouvé.");
             return;
        }
        const suggestion = suggDoc.data();
        const originalColleagues = suggestion.colleagues || [];
        const filteredColleagues = originalColleagues.filter(name => name !== currentUser.displayName);
        const finalColleagues = [...new Set([...filteredColleagues, suggestion.userName])];
        
        const newPointageData = {
            ...suggestion,
            uid: currentUser.uid,
            userName: currentUser.displayName,
            colleagues: finalColleagues,
            createdAt: serverTimestamp(),
            notes: `(Pointage ajouté depuis la saisie de ${suggestion.userName}) --- ${suggestion.notes || ''}`
        };
        
        try {
            await addDoc(collection(db, "pointages"), newPointageData);
            showInfoModal("Succès", "Le pointage a été ajouté à votre historique.");
        } catch (error) {
            console.error(error);
            showInfoModal("Erreur", "Impossible d'ajouter le pointage.");
        }
    } else if (button.classList.contains('refuse-suggestion-btn')) {
        const refusedPointages = JSON.parse(localStorage.getItem('refusedPointages') || '[]');
        if (!refusedPointages.includes(suggId)) {
            refusedPointages.push(suggId);
            localStorage.setItem('refusedPointages', JSON.stringify(refusedPointages));
        }
    }
    button.closest('div.border-l-4').remove();
}

function initUnreadMessagesListener() {
    const container = document.getElementById('unread-messages-container');
    if (!container) return;

    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));

    unreadListener = onSnapshot(q, (snapshot) => {
        let totalUnread = 0;
        let senders = new Set();
        let lastMessagePreview = "";

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.hiddenFor && data.hiddenFor.includes(currentUser.uid)) return;

            const myUnreadCount = (data.unreadCounts && data.unreadCounts[currentUser.uid]) ? data.unreadCounts[currentUser.uid] : 0;
            if (myUnreadCount > 0) {
                totalUnread += myUnreadCount;
                const otherName = data.participantNames.find(n => n !== (currentUser.displayName || 'Moi')) || 'Collègue';
                senders.add(otherName);
                lastMessagePreview = data.lastMessage;
            }
        });

        if (totalUnread > 0) {
            const senderNames = Array.from(senders).join(', ');
            const isMultiple = senders.size > 1;
            
            container.innerHTML = `
                <div class="bg-white border-l-4 p-4 rounded-r-lg shadow-md flex items-center justify-between group" style="background-color: var(--color-surface); border-color: var(--color-primary);">
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm" style="background-color: var(--color-primary);">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                            </div>
                            <span class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white animate-pulse">
                                ${totalUnread}
                            </span>
                        </div>
                        <div>
                            <h3 class="font-bold text-lg" style="color: var(--color-text-base);">
                                ${isMultiple ? 'Nouveaux messages' : `Message de ${senderNames}`}
                            </h3>
                            <p class="text-sm text-gray-500 line-clamp-1" style="color: var(--color-text-muted);">
                                ${isMultiple ? `Vous avez des messages de : ${senderNames}` : `"${lastMessagePreview}"`}
                            </p>
                        </div>
                    </div>
                    <div class="text-gray-400 group-hover:translate-x-1 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            `;
            container.classList.remove('hidden');
            container.onclick = () => navigateTo('user-chat');
        } else {
            container.classList.add('hidden');
            container.innerHTML = '';
        }
    });
}