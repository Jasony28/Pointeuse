import { collection, query, getDocs, orderBy, where } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, pageContent } from "../app.js";
import { getWeekDateRange } from "./utils.js";
import { loadFuelPrices, computeFuelCost, euros, NO_DRIVER } from "./fuel-cost.js";
import { PLEINS, summarize, byNewest, litresLabel, eurosLabel, perLitreLabel, plateLabel } from "./pleins.js";
import { toPlein, pleinRowHTML, openPleinPhoto, deletePlein, escapeHTML } from "./user-fuel.js";

let currentFilter = 'month'; // 'week', 'month', or 'year'
let currentOffset = 0; // Pour la navigation par semaine/mois/année
let pleins = [];        // pleins notés par les conducteurs sur la période affichée
let pleinsLoad = 0;
let reportLoad = 0;

function formatMinutes(totalMinutes) {
    if (!totalMinutes || totalMinutes < 0) return "0h 0min";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}min`;
}

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-5xl mx-auto">
            <h2 class="text-2xl font-bold mb-4">Rapport des Trajets</h2>
            <div class="p-4 rounded-lg shadow-sm" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                    <div id="filter-buttons" class="flex items-center justify-center gap-2 p-1 rounded-lg" style="background-color: var(--color-background);">
                        <button data-filter="week" class="filter-btn px-4 py-2 text-sm rounded-md">Semaine</button>
                        <button data-filter="month" class="filter-btn px-4 py-2 text-sm rounded-md">Mois</button>
                        <button data-filter="year" class="filter-btn px-4 py-2 text-sm rounded-md">Année</button>
                    </div>
                    <div id="nav-controls" class="flex items-center gap-2">
                        <button id="prevBtn" class="nav-arrow" aria-label="Précédent"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                        <div id="currentPeriodDisplay" class="text-center font-semibold text-lg min-w-[250px]"></div>
                        <button id="nextBtn" class="nav-arrow" aria-label="Suivant"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                    </div>
                </div>
                <div id="fuel-summary" class="mb-4"></div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead>
                            <tr class="border-b" style="border-color: var(--color-border);">
                                <th class="p-2">Employé</th>
                                <th id="km-header" class="p-2">Total Kilomètres</th>
                                <th id="time-header" class="p-2">Temps de Trajet total</th>
                                <th class="p-2">Carburant estimé</th>
                            </tr>
                        </thead>
                        <tbody id="report-body">
                            <tr><td colspan="4" class="p-4 text-center">Chargement...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div id="fuel-pleins" class="rc-page mt-4"></div>
        </div>
    `;
    setTimeout(() => {
        document.getElementById('filter-buttons').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                currentFilter = e.target.dataset.filter;
                currentOffset = 0;
                loadTravelReportForPeriod();
            }
        });
        document.getElementById("prevBtn").onclick = () => { currentOffset--; loadTravelReportForPeriod(); };
        document.getElementById('fuel-pleins').onclick = handlePleinClick;
        document.getElementById("nextBtn").onclick = () => { currentOffset++; loadTravelReportForPeriod(); };
        loadTravelReportForPeriod();
    }, 0);
}

async function loadTravelReportForPeriod() {
    const reportBody = document.getElementById('report-body');
    const kmHeader = document.getElementById('km-header');
    const timeHeader = document.getElementById('time-header');
    const currentPeriodDisplay = document.getElementById('currentPeriodDisplay');
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('bg-white', btn.dataset.filter === currentFilter);
        btn.classList.toggle('shadow', btn.dataset.filter === currentFilter);
    });

    reportBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center">Chargement...</td></tr>`;

    const now = new Date();
    let startDate, endDate, periodText;

    switch (currentFilter) {
        case 'year':
            const year = now.getFullYear() + currentOffset;
            startDate = new Date(Date.UTC(year, 0, 1));
            endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
            periodText = `Année ${year}`;
            break;
        case 'month':
            const dateForMonth = new Date(now.getFullYear(), now.getMonth() + currentOffset, 1);
            startDate = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth(), 1));
            endDate = new Date(Date.UTC(dateForMonth.getFullYear(), dateForMonth.getMonth() + 1, 0, 23, 59, 59, 999));
            periodText = dateForMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
            break;
        case 'week':
        default:
            const weekRange = getWeekDateRange(currentOffset);
            startDate = weekRange.startOfWeek;
            endDate = weekRange.endOfWeek;
            periodText = `Semaine du ${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
            break;
    }

    currentPeriodDisplay.textContent = periodText;
    const current = ++reportLoad;
    document.getElementById('fuel-summary').innerHTML = '';
    const dayKey = (d) => d.toISOString().slice(0, 10); // les bornes de la période sont en UTC
    loadPleins(dayKey(startDate), dayKey(endDate));
    kmHeader.textContent = `Total Kilomètres (${periodText})`;
    timeHeader.textContent = `Temps de Trajet total (${periodText})`;

    try {
        const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const trajetsQuery = query(collection(db, "trajets"), 
            where("date_creation", ">=", startDate),
            where("date_creation", "<=", endDate)
        );
        const [trajetsSnapshot, prices] = await Promise.all([getDocs(trajetsQuery), loadFuelPrices()]);
        if (current !== reportLoad || !document.getElementById('report-body')) return; // autre période demandée entre-temps
        const fuel = computeFuelCost(fuelTrips(trajetsSnapshot), fuelUsers(users), prices);
        renderFuelSummary(fuel);

        const travelByUser = {};
        trajetsSnapshot.forEach(doc => {
            const trajet = doc.data();
            if (!travelByUser[trajet.id_utilisateur]) {
                travelByUser[trajet.id_utilisateur] = { km: 0, min: 0 };
            }
            travelByUser[trajet.id_utilisateur].km += trajet.distance_km || 0;
            travelByUser[trajet.id_utilisateur].min += trajet.duree_min || 0;
        });

        if (users.length === 0) {
            reportBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-gray-500">Aucun utilisateur trouvé.</td></tr>`;
            return;
        }

        reportBody.innerHTML = '';
        users.forEach(user => {
            const travelData = travelByUser[user.uid] || { km: 0, min: 0 };
            const row = document.createElement('tr');
            row.className = 'border-b';
            row.innerHTML = `
                <td class="p-2">${user.displayName}</td>
                <td class="p-2 font-semibold">${travelData.km.toFixed(2)} km</td>
                <td class="p-2 font-semibold">${formatMinutes(travelData.min)}</td>
                <td class="p-2 font-semibold whitespace-nowrap">${fuel.byDriver.get(user.uid || user.id) ? euros(fuel.byDriver.get(user.uid || user.id).cost) : '—'}</td>
            `;
            reportBody.appendChild(row);
        });
    } catch (error) {
        console.error("Erreur de chargement du rapport de trajets:", error);
        reportBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Erreur de chargement.</td></tr>`;
    }
}

// --- Pleins notés par les conducteurs (page employé « Carburant ») ----------------------
async function loadPleins(fromKey, toKey) {
    const box = document.getElementById('fuel-pleins');
    const current = ++pleinsLoad;
    box.innerHTML = '';
    try {
        const snap = await getDocs(query(collection(db, PLEINS), where('date', '>=', fromKey), where('date', '<=', toKey)));
        if (current !== pleinsLoad || !document.getElementById('fuel-pleins')) return;
        pleins = snap.docs.map(toPlein).sort(byNewest);
        renderPleins();
    } catch (error) {
        console.error("Erreur de chargement des pleins:", error);
        if (current === pleinsLoad && document.getElementById('fuel-pleins')) box.innerHTML = pleinsHead() + '<p class="rc-empty">Impossible de charger les pleins.</p>';
    }
}

const pleinsHead = () => `
    <div>
        <h3 class="fu-title">Pleins notés par les conducteurs</h3>
        <p class="rc-help">Ce qui a vraiment été payé à la pompe, avec la photo de la pompe ou du ticket.</p>
    </div>`;

function renderPleins() {
    const total = summarize(pleins);
    const plural = (n) => `${n} plein${n > 1 ? 's' : ''}`;
    document.getElementById('fuel-pleins').innerHTML = pleinsHead() + (total.count ? `
        <div class="fu-summary">
            <div class="fu-stat is-total"><span class="rc-help">Total payé</span><b>${eurosLabel(total.montant)}</b><span class="rc-help">${plural(total.count)} · ${litresLabel(total.litres)} · ${perLitreLabel(total)}</span></div>
            ${total.plates.map(s => `<div class="fu-stat"><span class="fu-plate-tag">${escapeHTML(plateLabel(s.plaque))}</span><b>${eurosLabel(s.montant)}</b><span class="rc-help">${plural(s.count)} · ${litresLabel(s.litres)}</span></div>`).join('')}
        </div>
        <div class="rc-list">${pleins.map(p => pleinRowHTML(p, { who: true })).join('')}</div>`
        : '<p class="rc-empty">Aucun plein noté sur cette période.</p>');
}

async function handlePleinClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.photo) { openPleinPhoto(btn.dataset.photo, btn); return; }
    const p = pleins.find(x => x.id === btn.dataset.delete);
    if (p && await deletePlein(p)) {
        pleins = pleins.filter(x => x.id !== p.id);
        if (document.getElementById('fuel-pleins')) renderPleins();
    }
}

// --- Coût carburant estimé (même calcul que la Pointeuse LPF) ---------------------------
const localDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Trajets Firestore -> trajets pour le calcul du carburant (un par compte)
function fuelTrips(tripsSnap) {
    const list = [];
    tripsSnap.forEach(d => {
        const t = d.data();
        const date = t.date_creation?.toDate ? t.date_creation.toDate() : null;
        if (!date || !t.id_utilisateur) return;
        list.push({ uid: t.id_utilisateur, dayKey: localDateKey(date), from: t.adresse_depart || '', to: t.adresse_arrivee || '', isReturn: t.type === 'retour', km: t.distance_km || 0 });
    });
    return list;
}
const fuelUsers = (users) => users.map(u => ({ uid: u.uid || u.id, name: u.displayName || '', isDriver: u.isDriver === true }));
const priceText = (v) => v ? `${v.toFixed(2).replace('.', ',')} €/L` : '—';
const litresText = (v) => `${Math.round(v || 0)} L`;

function renderFuelSummary(fuel) {
    const box = document.getElementById('fuel-summary');
    if (!box) return;
    const noDriver = fuel.byDriver.get(NO_DRIVER);
    const card = (label, value) => `<div class="p-3 rounded-lg" style="background-color: var(--color-background); border: 1px solid var(--color-border);"><div class="text-xs opacity-70">${label}</div><div class="text-base font-bold whitespace-nowrap">${value}</div></div>`;
    box.innerHTML = `
        <div class="p-4 rounded-lg mb-2 text-center" style="background-color: var(--color-background); border: 2px solid var(--color-primary);">
            <div class="text-sm opacity-80">Coût carburant estimé</div>
            <div class="text-3xl font-bold" style="color: var(--color-primary);">${euros(fuel.cost)}</div>
            <div class="text-xs opacity-70 mt-1">${fuel.cars.length} trajet${fuel.cars.length > 1 ? 's' : ''} en voiture · ${fuel.conso} L/100 km</div>
        </div>
        <div class="grid grid-cols-3 gap-2">
            ${card('Km des voitures', `${fuel.km.toFixed(0)} km`)}
            ${card('Litres estimés', litresText(fuel.litres))}
            ${card('Prix moyen du litre', priceText(fuel.avgPrice))}
        </div>
        <details class="text-xs opacity-80 mt-2">
            <summary class="cursor-pointer py-1">Comment c'est calculé ?</summary>
            <p class="mt-1">Les comptes qui font le même trajet le même jour comptent pour 1 voiture, mise sur un seul compte.
            Prix : moyenne diesel + essence en Belgique de la semaine du trajet (Bulletin pétrolier européen).
            Les pleins réellement payés sont plus bas, dans « Pleins notés par les conducteurs ».</p>
        </details>
        ${fuel.estimated ? '<p class="text-xs mt-1"><strong>Certains prix sont estimés (relevé de la semaine pas encore disponible).</strong></p>' : ''}
        ${noDriver ? `<p class="text-xs mt-1"><strong>${euros(noDriver.cost)}</strong> sur des trajets de comptes introuvables.</p>` : ''}`;
}
