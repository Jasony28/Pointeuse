export function getWeekDateRange(offset = 0) {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dayOfWeekUTC = todayUTC.getUTCDay();
    const diffToMonday = dayOfWeekUTC === 0 ? -6 : 1 - dayOfWeekUTC;
    
    const startOfWeek = new Date(todayUTC);
    startOfWeek.setUTCDate(todayUTC.getUTCDate() + diffToMonday + (offset * 7));
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);
    
    return { startOfWeek, endOfWeek };
}

export function formatMilliseconds(ms) {
    if (!ms || ms < 0) return "0h 0min";
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}min`;
}

export function getGoogleMapsUrl(address) {
    if (!address) return '#';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// Bibliothèques lourdes (PDF, graphiques) : chargées seulement au premier usage, pas à l'ouverture de l'appli
const LIBRARIES = {
    pdf: ['https://unpkg.com/jspdf@latest/dist/jspdf.umd.min.js', 'https://unpkg.com/jspdf-autotable@latest/dist/jspdf.plugin.autotable.js'],
    chart: ['https://cdn.jsdelivr.net/npm/chart.js'],
};
const scriptPromises = {};

function loadScript(src) {
    if (!scriptPromises[src]) {
        scriptPromises[src] = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => { delete scriptPromises[src]; script.remove(); reject(new Error(`Chargement impossible : ${src}`)); };
            document.head.appendChild(script);
        });
    }
    return scriptPromises[src];
}

// Les scripts d'une bibliothèque sont chargés dans l'ordre (le module de tableaux PDF a besoin de jsPDF)
export async function loadLibrary(name) {
    for (const src of LIBRARIES[name]) await loadScript(src);
}
