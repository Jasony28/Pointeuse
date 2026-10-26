import { collection, query, where, orderBy, getDocs, doc, getDoc, addDoc, serverTimestamp, updateDoc, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, showInfoModal, navigateTo } from "../app.js";
import { getWeekDateRange, formatMilliseconds } from "./utils.js";
import { getActiveChantiers } from "./data-service.js";

let timerInterval = null;
let chantiersCache = [];
let currentWeekOffset = 0;
let unreadListener = null;

function getActiveProfileName() {
    return localStorage.getItem('currentProfileName') || currentUser.displayName;
}

export async function render() {
    if (unreadListener) {
        unreadListener();
        unreadListener = null;
    }

    pageContent.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-8">
            
            <div>
                <div id="live-tracker-container" class="p-6 rounded-lg shadow-lg" style="background-color: var(--color-surface); border: 1px solid var(--color-border);"></div>
                <div class="manual-entry-link">
                    <button id="openManualPointageBtn" type="button" class="link">Oubli de pointage ? Ajouter des heures manuellement</button>
                </div>
            </div>

            <div id="missed-pointage-suggestions" class="space-y-4"></div>
            <div id="unread-messages-container" class="hidden transform transition-all duration-300 hover:scale-[1.01] cursor-pointer"></div>
            
            <div>
                <h2 class="text-xl font-bold mb-3">Mon planning de la semaine</h2>
                <div class="rounded-lg shadow-sm p-3" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                    <div class="flex justify-between items-center gap-2">
                        <button id="prevWeekBtn" class="nav-arrow" aria-label="Semaine précédente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div class="text-center min-w-0">
                            <div id="currentPeriodDisplay" class="font-semibold"></div>
                            <div id="currentWeekTotalHours" class="week-total-pill"></div>
                        </div>
                        <button id="nextWeekBtn" class="nav-arrow" aria-label="Semaine suivante"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>
                <div id="schedule-grid" class="schedule-grid grid grid-cols-1 md:grid-cols-7 gap-2 mt-3"></div>
            </div>
        </div>

        <div id="startPointageModal" class="hidden fixed inset-0 z-50 bg-black bg-opacity-60 flex justify-center items-center p-4">
            <div class="p-6 rounded-lg w-full max-w-md shadow-xl border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                <div class="mb-4 border-b pb-3" style="border-color: var(--color-border);">
                    <h3 class="text-xl font-bold" style="color: var(--color-text-base);">Démarrer un pointage</h3>
                    <p class="text-sm mt-1" style="color: var(--color-text-muted);">Pointage pour : <strong id="startActiveProfileDisplay" style="color: var(--color-primary);"></strong></p>
                </div>
                <form id="startPointageForm" class="space-y-4">
                    <div>
                        <label class="text-sm font-medium" style="color: var(--color-text-muted);">Chantier</label>
                        <select id="startChantierSelect" class="w-full border p-3 rounded mt-1 focus:outline-none focus:ring-2" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);" required></select>
                    </div>
                    
                    <div class="flex justify-end gap-4 pt-4 border-t" style="border-color: var(--color-border);">
                        <button type="button" id="cancelStartPointage" class="px-4 py-2 rounded font-bold transition-colors border" style="background-color: var(--color-background); color: var(--color-text-base); border-color: var(--color-border);">Annuler</button>
                        <button type="submit" class="text-white px-6 py-2 rounded font-bold transition-colors hover:opacity-90" style="background-color: var(--color-primary);">Démarrer</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="stopPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                <div class="mb-4 border-b pb-3" style="border-color: var(--color-border);">
                    <h3 class="text-xl font-bold" style="color: var(--color-text-base);">Finaliser le pointage</h3>
                    <p class="text-sm mt-1" style="color: var(--color-text-muted);">Pointage de : <strong id="stopActiveProfileDisplay" style="color: var(--color-primary);"></strong></p>
                </div>
                <form id="stopPointageForm">
                    <div class="space-y-4">
                        <div>
                            <label for="pointageNotes" class="text-sm font-medium" style="color: var(--color-text-muted);">Note (facultatif)</label>
                            <textarea id="pointageNotes" placeholder="Problème, matériel manquant..." class="w-full border p-3 rounded mt-1 h-24 focus:outline-none focus:ring-2" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);"></textarea>
                        </div>
                        <div class="flex justify-end gap-4 pt-4 border-t" style="border-color: var(--color-border);">
                            <button type="button" id="cancelStopPointage" class="px-4 py-2 rounded font-bold transition-colors border" style="background-color: var(--color-background); color: var(--color-text-base); border-color: var(--color-border);">Annuler</button>
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded transition-colors">Arrêter et enregistrer</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <div id="manualPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="mb-4 border-b pb-3" style="border-color: var(--color-border);">
                    <h3 class="text-xl font-bold" style="color: var(--color-text-base);">Saisie manuelle</h3>
                    <p class="text-sm mt-1" style="color: var(--color-text-muted);">Pointage pour : <strong id="manualActiveProfileDisplay" style="color: var(--color-primary);"></strong></p>
                </div>
                <form id="manualPointageForm" class="space-y-5">
                    
                    <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <label class="block text-sm font-bold mb-2" style="color: var(--color-primary);">1. Date et Heures</label>
                        <input type="date" id="manualDate" class="w-full border p-2 rounded mb-3 focus:ring-2 focus:outline-none" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);" required>
                        <div class="flex gap-4">
                            <div class="w-1/2">
                                <label class="text-xs font-medium" style="color: var(--color-text-muted);">Heure d'arrivée</label>
                                <input type="time" id="manualStartTime" class="w-full border p-2 rounded mt-1 focus:ring-2 focus:outline-none" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);" required>
                            </div>
                            <div class="w-1/2">
                                <label class="text-xs font-medium" style="color: var(--color-text-muted);">Heure de départ</label>
                                <input type="time" id="manualEndTime" class="w-full border p-2 rounded mt-1 focus:ring-2 focus:outline-none" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);" required>
                            </div>
                        </div>
                    </div>

                    <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <label class="block text-sm font-bold mb-2" style="color: var(--color-primary);">2. Lieu du chantier</label>
                        <select id="manualChantierSelect" class="w-full border p-2 rounded focus:ring-2 focus:outline-none" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);" required></select>
                    </div>

                    <div class="p-3 rounded border" style="background-color: var(--color-background); border-color: var(--color-border);">
                        <label class="block text-sm font-bold mb-2" style="color: var(--color-primary);">3. Note (facultatif)</label>
                        <textarea id="manualNotes" placeholder="Problème rencontré, oubli de chrono..." class="w-full border p-2 rounded h-16 focus:ring-2 focus:outline-none" style="background-color: var(--color-surface); border-color: var(--color-border); color: var(--color-text-base);"></textarea>
                    </div>

                    <div class="flex justify-end gap-4 pt-4 border-t" style="border-color: var(--color-border);">
                        <button type="button" id="cancelManualPointage" class="px-4 py-2 rounded font-bold border" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);">Annuler</button>
                        <button type="submit" id="submitManualBtn" class="text-white font-bold px-6 py-2 rounded transition-colors hover:opacity-90" style="background-color: var(--color-primary);">Enregistrer</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    pageContent.onclick = (e) => {
        // --- SÉCURITÉ POUR BLOQUER LES PROFILS "EXTRA" OU "NE PAS UTILISER" ---
        const activeProfile = getActiveProfileName().toLowerCase();
        const isForbidden = activeProfile.includes('extra') || activeProfile.includes('ne pas utiliser');

        if (e.target.id === 'startBtn') {
            if (isForbidden) return; // Ne fait rien, le bouton est déjà désactivé visuellement
            openStartModal();
        }
        if (e.target.id === 'openManualPointageBtn') {
            if (isForbidden) {
                showInfoModal("Action impossible", "Ce profil n'est pas autorisé à encoder des heures.");
                return;
            }
            openManualModal();
        }
        // ----------------------------------------------------------------------

        if (e.target.id === 'prevWeekBtn') { currentWeekOffset--; displayWeekView(); }
        if (e.target.id === 'nextWeekBtn') { currentWeekOffset++; displayWeekView(); }
        if (e.target.id === 'cancelStartPointage') document.getElementById('startPointageModal').classList.add('hidden');
        if (e.target.id === 'cancelStopPointage') document.getElementById('stopPointageModal').classList.add('hidden');
        if (e.target.id === 'cancelManualPointage') document.getElementById('manualPointageModal').classList.add('hidden');
    };

    setTimeout(async () => {
        try {
            await cacheDataForModals();
            await checkForOpenPointage();
            initUnreadMessagesListener();
            
            const activeProfile = getActiveProfileName();
            if (!localStorage.getItem(`activePointage_${activeProfile}`)) {
                checkForMissedPointages();
            }
            
            displayWeekView();
        } catch (error) {
            console.error("Erreur critique dashboard:", error);
        }
    }, 100);
}

async function cacheDataForModals() {
    const chantiersData = await getActiveChantiers();
    chantiersCache = chantiersData; 
}

async function getContextualLists() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(0);
    const todayStr = new Date().toISOString().split('T')[0];
    const weeklyChantiers = new Set(), todaysChantiers = new Set();
    const activeProfileName = getActiveProfileName();
    
    try {
        const q = query(collection(db, "planning"), where("date", ">=", startOfWeek.toISOString().split('T')[0]), where("date", "<=", endOfWeek.toISOString().split('T')[0]));
        const querySnapshot = await getDocs(q);
        querySnapshot.docs.forEach(doc => {
            const task = doc.data();
            if (task.teamNames && task.teamNames.includes(activeProfileName)) {
                weeklyChantiers.add(task.chantierName);
                if (task.date === todayStr) {
                    todaysChantiers.add(task.chantierName);
                }
            }
        });
    } catch (error) { console.error("Erreur planning contextuel:", error); }
    return { weeklyChantiers, todaysChantiers };
}

async function checkForOpenPointage() {
    const activeProfileName = getActiveProfileName();
    const q = query(collection(db, "pointages"), where("uid", "==", currentUser.uid), where("userName", "==", activeProfileName), where("endTime", "==", null), limit(1));
    const snapshot = await getDocs(q);
    const storageKey = `activePointage_${activeProfileName}`;

    if (!snapshot.empty) {
        const openPointageDoc = snapshot.docs[0];
        const pointageData = { docId: openPointageDoc.id, ...openPointageDoc.data() };
        if (!pointageData.pauses) pointageData.pauses = [];
        if (!pointageData.status) pointageData.status = 'running';
        localStorage.setItem(storageKey, JSON.stringify(pointageData));
    } else {
        localStorage.removeItem(storageKey);
    }
    initLiveTracker();
}

function initLiveTracker() {
    const container = document.getElementById('live-tracker-container');
    if (!container) return;
    
    const activeProfileName = getActiveProfileName();
    const storageKey = `activePointage_${activeProfileName}`;
    const activePointage = JSON.parse(localStorage.getItem(storageKey));

    // Vérification de sécurité visuelle pour les profils interdits
    const isForbidden = activeProfileName.toLowerCase().includes('extra') || activeProfileName.toLowerCase().includes('ne pas utiliser');

    if (activePointage && activePointage.userName === activeProfileName) {
        const isPaused = activePointage.status === 'paused';
        const startedAt = new Date(activePointage.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const pauseCount = (activePointage.pauses || []).length;

        container.innerHTML = `
            <div class="tracker ${isPaused ? 'is-paused' : 'is-running'}">
                <span class="tracker-status"><span class="tracker-dot"></span>${isPaused ? 'En pause' : 'Pointage en cours'} · ${escapeHTML(activeProfileName)}</span>
                <p class="tracker-chantier">${escapeHTML(activePointage.chantier)}</p>
                <div id="timer" class="tracker-timer">00:00:00</div>
                <p class="tracker-meta">Démarré à ${startedAt}${pauseCount > 0 ? ` · ${pauseCount} pause${pauseCount > 1 ? 's' : ''}` : ''}</p>
                <div class="tracker-actions">
                    <button id="pauseResumeBtn" class="tracker-btn ${isPaused ? 'tracker-btn-resume' : 'tracker-btn-pause'}">${isPaused ? 'Reprendre' : 'Pause'}</button>
                    <button id="stopBtn" class="tracker-btn tracker-btn-stop">Arrêter</button>
                </div>
            </div>`;

        updateTimerUI();
        clearInterval(timerInterval);
        if (!isPaused) timerInterval = setInterval(updateTimerUI, 1000);
        document.getElementById('pauseResumeBtn').onclick = isPaused ? resumePointage : pausePointage;
        document.getElementById('stopBtn').onclick = openStopModal;
    } else {
        // --- BLOCAGE VISUEL DU BOUTON DÉMARRER ---
        const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        if (isForbidden) {
            container.innerHTML = `
                <div class="tracker is-idle">
                    <p class="tracker-greeting">Profil : ${escapeHTML(activeProfileName)}</p>
                    <h3 class="tracker-idle-title">Ce profil ne peut pas pointer</h3>
                    <p class="tracker-meta">Changez de profil dans les Paramètres pour démarrer un pointage.</p>
                    <button disabled class="tracker-btn tracker-btn-start">Pointage désactivé</button>
                </div>`;
        } else {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
            const firstName = (activeProfileName || '').split(' ')[0];
            container.innerHTML = `
                <div class="tracker is-idle">
                    <p class="tracker-greeting">${greeting}${firstName ? ` ${escapeHTML(firstName)}` : ''}</p>
                    <h3 class="tracker-idle-title">Prêt à commencer votre journée ?</h3>
                    <p class="tracker-meta">${today}</p>
                    <button id="startBtn" class="tracker-btn tracker-btn-start">Démarrer un pointage</button>
                </div>`;
        }
    }
}

function updateTimerUI() {
    const timerElement = document.getElementById('timer');
    const activeProfileName = getActiveProfileName();
    const activePointage = JSON.parse(localStorage.getItem(`activePointage_${activeProfileName}`));
    
    if (!timerElement || !activePointage) { clearInterval(timerInterval); return; }
    
    const startTime = new Date(activePointage.timestamp);
    let totalPauseMs = (activePointage.pauses || []).reduce((acc, p) => acc + (p.end ? new Date(p.end) - new Date(p.start) : 0), 0);
    let effectiveElapsedTime;
    if (activePointage.status === 'paused') {
        const lastPauseStart = new Date(activePointage.pauses.slice(-1)[0].start);
        effectiveElapsedTime = (lastPauseStart - startTime) - totalPauseMs;
    } else {
        effectiveElapsedTime = (new Date() - startTime) - totalPauseMs;
    }
    const hours = String(Math.floor(effectiveElapsedTime / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((effectiveElapsedTime % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((effectiveElapsedTime % 60000) / 1000)).padStart(2, '0');
    timerElement.textContent = `${hours}:${minutes}:${seconds}`;
}

function pausePointage() {
    clearInterval(timerInterval);
    const activeProfileName = getActiveProfileName();
    let activePointage = JSON.parse(localStorage.getItem(`activePointage_${activeProfileName}`));
    
    activePointage.status = 'paused';
    if (!activePointage.pauses) activePointage.pauses = [];
    activePointage.pauses.push({ start: new Date().toISOString(), end: null });
    
    localStorage.setItem(`activePointage_${activeProfileName}`, JSON.stringify(activePointage));
    const pointageRef = doc(db, "pointages", activePointage.docId);
    updateDoc(pointageRef, { status: 'paused', pauses: activePointage.pauses });
    initLiveTracker();
}

function resumePointage() {
    const activeProfileName = getActiveProfileName();
    let activePointage = JSON.parse(localStorage.getItem(`activePointage_${activeProfileName}`));
    
    activePointage.status = 'running';
    const lastPause = activePointage.pauses.slice(-1)[0];
    if (lastPause && !lastPause.end) lastPause.end = new Date().toISOString();
    
    localStorage.setItem(`activePointage_${activeProfileName}`, JSON.stringify(activePointage));
    const pointageRef = doc(db, "pointages", activePointage.docId);
    updateDoc(pointageRef, { status: 'running', pauses: activePointage.pauses });
    initLiveTracker();
}

async function startPointage(chantierId, chantierName) {
    const activeProfileName = getActiveProfileName();
    
    const newPointageData = {
        uid: currentUser.uid, 
        userName: activeProfileName, 
        chantier: chantierName, 
        chantierId: chantierId,
        colleagues: [], 
        timestamp: new Date().toISOString(), 
        endTime: null, 
        status: 'running', 
        pauses: [], 
        createdAt: serverTimestamp()
    };

    try {
        const newPointageRef = await addDoc(collection(db, "pointages"), newPointageData);
        localStorage.setItem(`activePointage_${activeProfileName}`, JSON.stringify({ docId: newPointageRef.id, ...newPointageData }));
        initLiveTracker();
    } catch (error) {
        showInfoModal("Erreur", "Le démarrage du pointage a échoué.");
    }
}

async function stopPointage(notes = "") {
    const activeProfileName = getActiveProfileName();
    let activePointage = JSON.parse(localStorage.getItem(`activePointage_${activeProfileName}`));
    if (!activePointage || !activePointage.docId) return;
    
    if (activePointage.status === 'paused') {
        const lastPause = activePointage.pauses.slice(-1)[0];
        if (lastPause && !lastPause.end) lastPause.end = new Date().toISOString();
    }
    
    const totalPauseMs = (activePointage.pauses || []).reduce((acc, p) => acc + (p.end ? new Date(p.end) - new Date(p.start) : 0), 0);
    const pointageRef = doc(db, "pointages", activePointage.docId);
    
    try {
        await updateDoc(pointageRef, { endTime: new Date().toISOString(), notes, pauseDurationMs: totalPauseMs, status: 'completed' });
        showInfoModal("Succès", "Chrono arrêté et enregistré avec succès !");
    } catch (error) { 
        showInfoModal("Erreur", "Une erreur est survenue lors de l'enregistrement."); 
    } finally { 
        clearInterval(timerInterval); 
        localStorage.removeItem(`activePointage_${activeProfileName}`); 
        initLiveTracker(); 
    }
}

async function openStartModal() {
    const modal = document.getElementById('startPointageModal');
    const form = document.getElementById('startPointageForm');
    const chantierSelect = document.getElementById('startChantierSelect');

    document.getElementById('startActiveProfileDisplay').textContent = getActiveProfileName();
    chantierSelect.innerHTML = '<option>Chargement...</option>';
    modal.classList.remove('hidden');
    
    const { weeklyChantiers, todaysChantiers } = await getContextualLists();
    const weeklyChantiersOnly = new Set([...weeklyChantiers].filter(chantier => !todaysChantiers.has(chantier)));
    const otherChantiers = chantiersCache.filter(chantier => !weeklyChantiers.has(chantier.name));
    
    let chantierOptionsHTML = '';
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
    chantierSelect.innerHTML = chantierOptionsHTML || '<option value="" disabled selected>-- Aucun chantier disponible --</option>';

    form.onsubmit = (e) => {
        e.preventDefault();
        const chantierId = chantierSelect.value;
        if (!chantierId) { showInfoModal("Attention", "Veuillez choisir un chantier."); return; }
        const chantierName = chantiersCache.find(c => c.id === chantierId)?.name;
        
        startPointage(chantierId, chantierName);
        modal.classList.add('hidden');
    };
}

function openStopModal() {
    const modal = document.getElementById('stopPointageModal');
    const form = document.getElementById('stopPointageForm');
    
    document.getElementById('stopActiveProfileDisplay').textContent = getActiveProfileName();
    form.reset();
    modal.classList.remove('hidden');
    
    form.onsubmit = (e) => {
        e.preventDefault();
        stopPointage(document.getElementById('pointageNotes').value.trim());
        modal.classList.add('hidden');
    };
}

async function openManualModal() {
    const modal = document.getElementById('manualPointageModal');
    const form = document.getElementById('manualPointageForm');
    const chantierSelect = document.getElementById('manualChantierSelect');
    
    document.getElementById('manualActiveProfileDisplay').textContent = getActiveProfileName();
    form.reset();
    document.getElementById('manualDate').value = new Date().toISOString().split('T')[0];
    
    chantierSelect.innerHTML = '<option>Chargement...</option>';
    modal.classList.remove('hidden');
    
    const { weeklyChantiers, todaysChantiers } = await getContextualLists();
    const weeklyChantiersOnly = new Set([...weeklyChantiers].filter(chantier => !todaysChantiers.has(chantier)));
    const otherChantiers = chantiersCache.filter(chantier => !weeklyChantiers.has(chantier.name));
    
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

    form.onsubmit = submitManualPointage;
}

async function submitManualPointage(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('submitManualBtn');

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Enregistrement...';

    const dateStr = document.getElementById('manualDate').value;
    const startTimeStr = document.getElementById('manualStartTime').value;
    const endTimeStr = document.getElementById('manualEndTime').value;
    const chantierId = document.getElementById('manualChantierSelect').value;
    const notes = document.getElementById('manualNotes').value.trim();

    if (!chantierId) {
        showInfoModal("Attention", "Veuillez choisir un chantier.");
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Enregistrer';
        return;
    }

    const chantierName = chantiersCache.find(c => c.id === chantierId)?.name;
    let startDateTime = new Date(`${dateStr}T${startTimeStr}`);
    let endDateTime = new Date(`${dateStr}T${endTimeStr}`);
    if (endDateTime < startDateTime) endDateTime.setDate(endDateTime.getDate() + 1);

    const activeProfileName = getActiveProfileName();
    const newPointageData = {
        uid: currentUser.uid, 
        userName: activeProfileName, 
        chantier: chantierName, 
        chantierId: chantierId,
        colleagues: [],
        timestamp: startDateTime.toISOString(), 
        endTime: endDateTime.toISOString(), 
        status: 'completed', 
        pauses: [], 
        pauseDurationMs: 0,
        createdAt: serverTimestamp(),
        notes: notes
    };

    try {
        await addDoc(collection(db, "pointages"), newPointageData);
        document.getElementById('manualPointageModal').classList.add('hidden');
        showInfoModal("Succès", "Ton pointage a été enregistré avec succès !");
    } catch (error) {
        showInfoModal("Erreur", "Une erreur est survenue.");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Enregistrer';
    }
}

function displayWeekView() {
    const { startOfWeek, endOfWeek } = getWeekDateRange(currentWeekOffset);
    const options = { day: 'numeric', month: 'long', timeZone: 'UTC' };
    const displayElement = document.getElementById("currentPeriodDisplay");
    if(displayElement) displayElement.textContent = `Semaine du ${startOfWeek.toLocaleDateString('fr-FR', options)} au ${endOfWeek.toLocaleDateString('fr-FR', options)}`;

    const totalHoursElement = document.getElementById("currentWeekTotalHours");
    if (totalHoursElement) totalHoursElement.textContent = 'Chargement...';

    const scheduleGrid = document.getElementById("schedule-grid");
    if(scheduleGrid) {
        scheduleGrid.innerHTML = ""; 
        const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        const todayStr = new Date().toISOString().split('T')[0];
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
            const isToday = dayDate.toISOString().split('T')[0] === todayStr;
            const dayColumn = document.createElement('div');
            dayColumn.className = `schedule-day${isToday ? ' is-today' : ''}`;
            dayColumn.innerHTML = `<h4 class="schedule-day-head">
                                        <span class="schedule-day-name">${days[i]}${isToday ? ' <span class="schedule-today-badge">Aujourd\'hui</span>' : ''}</span>
                                        <span class="schedule-day-date">${dayDate.getUTCDate()}</span>
                                        <span id="day-total-${i}" class="schedule-day-total"></span>
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
        if(scheduleGrid) scheduleGrid.innerHTML = `<p class='col-span-1 md:col-span-7 text-center p-4' style='color: var(--color-text-muted);'>Le planning n'a pas encore été publié.</p>`;
        if (totalHoursElement) totalHoursElement.textContent = 'Total prévues : 0h';
        return;
    }

    const planningQuery = query(collection(db, "planning"), where("date", ">=", start.toISOString().split('T')[0]), where("date", "<=", end.toISOString().split('T')[0]), orderBy("date"), orderBy("order"));
    const planningSnapshot = await getDocs(planningQuery);
    const scheduleData = planningSnapshot.docs.map(doc => doc.data());
    
    const activeProfileName = getActiveProfileName();
    const userSchedule = scheduleData.filter(task => task.teamNames && task.teamNames.includes(activeProfileName));

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
    
    if (totalHoursElement) totalHoursElement.textContent = `Total prévues : ${formatDecimalHours(totalWeekHours)}`;
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
    el.className = 'schedule-task p-3 rounded-lg shadow-sm border-l-4 text-sm';
    el.style.backgroundColor = 'var(--color-surface)';
    el.style.borderColor = 'var(--color-primary)';
    
    const teamNames = task.teamNames || [];
    const teamCount = teamNames.length;
    const team = teamCount > 0 ? `Équipe : ${teamNames.join(', ')}` : 'Pas d\'équipe';
    const startTimeHTML = task.startTime ? `<span class="ml-2 px-2 py-0.5 rounded text-xs font-bold" style="background-color: var(--color-background); color: var(--color-primary);">${task.startTime}</span>` : '';
    const note = task.notes ? `<div class="mt-2 pt-2 border-t text-xs" style="border-color: var(--color-border); color: var(--color-primary);"><strong>Note:</strong> ${task.notes}</div>` : '';

    let projectBudgetHTML = '';
    if (chantierDetails && chantierDetails.totalHeuresPrevues > 0) {
        const totalBudget = chantierDetails.totalHeuresPrevues;
        if (teamCount > 0) {
            projectBudgetHTML = `<div class="text-xs mt-1" style="color: var(--color-text-muted);">Prévues (par pers.) : <strong>${formatDecimalHours(totalBudget / teamCount)}</strong></div>`;
        } else {
             projectBudgetHTML = `<div class="text-xs mt-1" style="color: var(--color-text-muted);">Prévues (seul) : <strong>${formatDecimalHours(totalBudget)}</strong></div>`;
        }
    }

    el.innerHTML = `<div class="flex justify-between items-start"><div class="font-semibold" style="color: var(--color-text-base);">${task.chantierName}</div>${startTimeHTML}</div><div class="text-xs mt-1" style="color: var(--color-text-muted);">${team}</div><div class="mt-2 pt-2 border-t" style="border-color: var(--color-border);">${projectBudgetHTML}</div>${note}`;
    return el;
}

async function checkForMissedPointages() {
    const suggestionsContainer = document.getElementById('missed-pointage-suggestions');
    if (!suggestionsContainer) return;
    
    const activeProfileName = getActiveProfileName();
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const suggestionsQuery = query(collection(db, "pointages"), where("colleagues", "array-contains", activeProfileName), where("timestamp", ">=", twoDaysAgo.toISOString()), orderBy("timestamp", "desc"));
    const userPointagesQuery = query(collection(db, "pointages"), where("uid", "==", currentUser.uid), where("userName", "==", activeProfileName), where("timestamp", ">=", twoDaysAgo.toISOString()));
    
    const [suggestionsSnapshot, userPointagesSnapshot] = await Promise.all([getDocs(suggestionsQuery), getDocs(userPointagesQuery)]);
    
    const userExistingPointages = new Set();
    userPointagesSnapshot.forEach(doc => {
        const data = doc.data();
        const day = new Date(data.timestamp).toISOString().split('T')[0];
        userExistingPointages.add(`${day}_${data.chantier}`);
    });
    
    const refusedPointages = JSON.parse(localStorage.getItem(`refusedPointages_${activeProfileName}`) || '[]');
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
    container.innerHTML = `<h3 class="text-lg font-semibold" style="color: var(--color-text-base);">Suggestions de pointages manqués :</h3>`;
    suggestions.forEach(sugg => {
        const start = new Date(sugg.timestamp), end = new Date(sugg.endTime);
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        const card = document.createElement('div');
        card.className = 'border-l-4 p-4 rounded-r-lg shadow-sm border-y border-r';
        card.style.borderLeftColor = 'orange';
        card.style.borderTopColor = 'var(--color-border)';
        card.style.borderRightColor = 'var(--color-border)';
        card.style.borderBottomColor = 'var(--color-border)';
        card.style.backgroundColor = 'var(--color-surface)';
        card.innerHTML = `
            <p class="font-semibold" style="color: var(--color-text-base);">${sugg.userName} a pointé sur <strong style="color: var(--color-primary);">${sugg.chantier}</strong>.</p>
            <p class="text-sm" style="color: var(--color-text-muted);">Le ${start.toLocaleDateString('fr-FR')} de ${start.toLocaleTimeString('fr-FR', timeFormat)} à ${end.toLocaleTimeString('fr-FR', timeFormat)}.</p>
            <p class="mt-2 font-medium" style="color: var(--color-text-base);">Étiez-vous avec cette personne ?</p>
            <div class="flex gap-4 mt-3">
                <button class="accept-suggestion-btn bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-lg transition-colors" data-sugg-id="${sugg.id}">Oui, accepter</button>
                <button class="refuse-suggestion-btn font-bold px-4 py-2 rounded-lg transition-colors border" data-sugg-id="${sugg.id}" style="background-color: var(--color-background); color: var(--color-text-base); border-color: var(--color-border);">Non, refuser</button>
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
    
    const activeProfileName = getActiveProfileName();
    
    if (button.classList.contains('accept-suggestion-btn')) {
        const suggDoc = await getDoc(doc(db, "pointages", suggId));
        if (!suggDoc.exists()) { showInfoModal("Erreur", "Pointage non trouvé."); return; }
        const suggestion = suggDoc.data();
        const originalColleagues = suggestion.colleagues || [];
        const filteredColleagues = originalColleagues.filter(name => name !== activeProfileName);
        const finalColleagues = [...new Set([...filteredColleagues, suggestion.userName])];
        
        const newPointageData = {
            ...suggestion, uid: currentUser.uid, userName: activeProfileName, colleagues: finalColleagues, createdAt: serverTimestamp(), notes: `(Ajouté depuis la saisie de ${suggestion.userName}) --- ${suggestion.notes || ''}`
        };
        try {
            await addDoc(collection(db, "pointages"), newPointageData);
            showInfoModal("Succès", "Ajouté à votre historique.");
        } catch (error) { showInfoModal("Erreur", "Impossible d'ajouter."); }
    } else if (button.classList.contains('refuse-suggestion-btn')) {
        const refusedKey = `refusedPointages_${activeProfileName}`;
        const refusedPointages = JSON.parse(localStorage.getItem(refusedKey) || '[]');
        if (!refusedPointages.includes(suggId)) {
            refusedPointages.push(suggId);
            localStorage.setItem(refusedKey, JSON.stringify(refusedPointages));
        }
    }
    button.closest('div.border-l-4').remove();
}

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Appelé par app.js quand on quitte la page : on arrête le minuteur et l'écoute des messages
export function cleanup() {
    clearInterval(timerInterval);
    if (unreadListener) {
        unreadListener();
        unreadListener = null;
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

function initUnreadMessagesListener() {
    const container = document.getElementById('unread-messages-container');
    if (!container) return;

    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));
    unreadListener = onSnapshot(q, (snapshot) => {
        let totalUnread = 0, senders = new Set(), lastMessagePreview = "";
        const activeProfileName = getActiveProfileName();

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.hiddenFor && data.hiddenFor.includes(currentUser.uid)) return;
            const myUnreadCount = (data.unreadCounts && data.unreadCounts[currentUser.uid]) ? data.unreadCounts[currentUser.uid] : 0;
            if (myUnreadCount > 0) {
                totalUnread += myUnreadCount;
                const otherName = data.participantNames.find(n => n !== activeProfileName) || 'Collègue';
                senders.add(otherName);
                lastMessagePreview = data.lastMessage;
            }
        });

        if (totalUnread > 0) {
            const senderNames = Array.from(senders).join(', '), isMultiple = senders.size > 1;
            container.innerHTML = `
                <div class="border-l-4 p-4 rounded-r-lg shadow-md flex items-center justify-between group border-y border-r" style="background-color: var(--color-surface); border-left-color: var(--color-primary); border-top-color: var(--color-border); border-bottom-color: var(--color-border); border-right-color: var(--color-border);">
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <div class="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm" style="background-color: var(--color-primary);">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                            </div>
                            <span class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white animate-pulse">${totalUnread}</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-lg" style="color: var(--color-text-base);">${isMultiple ? 'Nouveaux messages' : `Message de ${senderNames}`}</h3>
                            <p class="text-sm line-clamp-1" style="color: var(--color-text-muted);">${isMultiple ? `Vous avez des messages de : ${senderNames}` : `"${lastMessagePreview}"`}</p>
                        </div>
                    </div>
                    <div class="text-gray-400 group-hover:translate-x-1 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
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