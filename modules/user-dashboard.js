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
            
            <div id="live-tracker-container" class="p-8 rounded-2xl shadow-2xl border-4" style="background-color: var(--color-surface); border-color: var(--color-primary);"></div>

            <div class="text-center -mt-4">
                <button id="openManualPointageBtn" class="text-sm font-medium hover:underline opacity-80 hover:opacity-100 transition-opacity" style="color: var(--color-text-base);">
                    Oubli de pointage ? Ajouter des heures manuellement.
                </button>
            </div>
            
            <div id="missed-pointage-suggestions" class="space-y-4"></div>
            <div id="unread-messages-container" class="hidden transform transition-all duration-300 hover:scale-[1.01] cursor-pointer"></div>
            
            <div>
                <h2 class="text-xl font-bold mb-2" style="color: var(--color-text-base);">🗓️ Mon Planning de la Semaine</h2>
                <div class="rounded-lg shadow-sm p-4 border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <div class="flex justify-between items-center">
                        <button id="prevWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80 font-bold" style="background-color: var(--color-background); color: var(--color-text-base);"><</button>
                        <div class="text-center"> 
                            <div id="currentPeriodDisplay" class="font-semibold text-lg" style="color: var(--color-text-base);"></div>
                            <div id="currentWeekTotalHours" class="text-sm font-bold" style="color: var(--color-primary);"></div>
                        </div>
                        <button id="nextWeekBtn" class="px-4 py-2 rounded-lg hover:opacity-80 font-bold" style="background-color: var(--color-background); color: var(--color-text-base);">></button>
                    </div>
                </div>
                <div id="schedule-grid" class="grid grid-cols-1 md:grid-cols-7 gap-2 mt-4"></div>
            </div>
        </div>

        <div id="startPointageModal" class="hidden fixed inset-0 z-50 bg-black bg-opacity-60 flex justify-center items-center p-4">
            <div class="p-6 rounded-lg w-full max-w-md shadow-xl border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                <div class="mb-4 border-b pb-3" style="border-color: var(--color-border);">
                    <h3 class="text-xl font-bold" style="color: var(--color-text-base);">Démarrer le Chrono</h3>
                    <p class="text-sm mt-1" style="color: var(--color-text-muted);">Pointage pour : <strong id="startActiveProfileDisplay" style="color: var(--color-primary);"></strong></p>
                </div>
                <form id="startPointageForm" class="space-y-4">
                    <div>
                        <label class="text-sm font-medium" style="color: var(--color-text-muted);">Chantier</label>
                        <select id="startChantierSelect" class="w-full border p-3 rounded mt-1 focus:outline-none focus:ring-2" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base);" required></select>
                    </div>
                    
                    <div class="flex justify-end gap-4 pt-4 border-t" style="border-color: var(--color-border);">
                        <button type="button" id="cancelStartPointage" class="px-4 py-2 rounded font-bold transition-colors border" style="background-color: var(--color-background); color: var(--color-text-base); border-color: var(--color-border);">Annuler</button>
                        <button type="submit" class="text-white px-6 py-2 rounded font-bold transition-colors hover:opacity-90" style="background-color: var(--color-primary);">▶️ Démarrer</button>
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
                            <button type="submit" class="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded transition-colors">⏹️ Arrêter</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>

        <div id="manualPointageModal" class="hidden fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div class="p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="mb-4 border-b pb-3" style="border-color: var(--color-border);">
                    <h3 class="text-xl font-bold" style="color: var(--color-text-base);">Saisie Manuelle</h3>
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
        if (e.target.id === 'startBtn') openStartModal();
        if (e.target.id === 'openManualPointageBtn') openManualModal();
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

    if (activePointage && activePointage.userName === activeProfileName) {
        const isPaused = activePointage.status === 'paused';
        let chantierHTML = `<p class="text-3xl font-extrabold my-2 tracking-wide" style="color: var(--color-primary);">${activePointage.chantier}</p>`;

        container.innerHTML = `
            <div class="text-center">
                <p class="font-semibold tracking-wide uppercase text-sm mb-1" style="color: var(--color-text-muted);">Pointage en cours pour <strong style="color: var(--color-text-base);">${activeProfileName}</strong></p>
                ${chantierHTML} 
                <div id="timer" class="text-6xl font-black my-6 tracking-widest ${isPaused ? 'text-yellow-500' : ''}" style="color: var(--color-text-base);">00:00:00</div>
                ${isPaused ? '<p class="text-yellow-600 font-bold mb-4 text-xl tracking-widest uppercase animate-pulse">PAUSE</p>' : ''}
                <div class="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                    <button id="pauseResumeBtn" class="w-full sm:w-1/3 font-bold px-8 py-5 rounded-xl text-xl shadow-lg transition-transform hover:scale-105 ${isPaused ? 'bg-green-600 text-white' : 'bg-yellow-500 text-white'}">${isPaused ? '▶️ Reprendre' : '⏸️ Pause'}</button>
                    <button id="stopBtn" class="w-full sm:w-1/3 bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-5 rounded-xl text-xl shadow-lg transition-transform hover:scale-105">⏹️ Arrêter</button>
                </div>
            </div>`;

        updateTimerUI();
        if (!isPaused) timerInterval = setInterval(updateTimerUI, 1000);
        document.getElementById('pauseResumeBtn').onclick = isPaused ? resumePointage : pausePointage;
        document.getElementById('stopBtn').onclick = openStopModal;
    } else {
        container.innerHTML = `
            <div class="text-center py-6">
                <h3 class="text-3xl font-extrabold mb-3" style="color: var(--color-text-base);">Prêt à démarrer ?</h3>
                <p class="mb-8 text-lg" style="color: var(--color-text-muted);">Profil actif : <strong style="color: var(--color-primary);">${activeProfileName}</strong></p>
                <button id="startBtn" class="w-full md:w-auto text-white font-bold px-10 py-5 rounded-xl text-xl shadow-xl transition-transform hover:scale-105" style="background-color: var(--color-primary);">
                    ▶️ Démarrer le Chrono
                </button>
            </div>`;
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
        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(startOfWeek);
            dayDate.setUTCDate(startOfWeek.getUTCDate() + i);
            const dayColumn = document.createElement('div');
            dayColumn.className = 'rounded-lg p-2 min-h-[100px] border';
            dayColumn.style.backgroundColor = 'var(--color-background)';
            dayColumn.style.borderColor = 'var(--color-border)';
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
    el.className = 'p-3 rounded-lg shadow-sm border-l-4 text-sm hover:shadow-md transition-shadow border-y border-r';
    el.style.backgroundColor = 'var(--color-surface)';
    el.style.borderLeftColor = 'var(--color-primary)';
    el.style.borderTopColor = 'var(--color-border)';
    el.style.borderBottomColor = 'var(--color-border)';
    el.style.borderRightColor = 'var(--color-border)';
    
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