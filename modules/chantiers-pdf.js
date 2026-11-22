// Export PDF de tous les chantiers (Admin → Chantiers → « Exporter en PDF »).
// A4 paysage : un tableau des chantiers actifs puis un des archivés, triés par nom,
// avec toutes les données de la fiche (adresse, GPS, durée, horaires, codes, infos). Même export que la Pointeuse LPF.
import { createPdf, pdfHeader, pdfStats, pdfSection, pdfTable, pdfFinish, pdfText, C } from "./pdf-kit.js";


const clean = pdfText;

const formatHours = (h) => {
    if (!h) return '';
    const hours = Math.floor(h);
    const minutes = Math.round((h - hours) * 60);
    return minutes ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`;
};

function scheduleText(c) {
    const parts = [];
    if (c.fixedAppointment) parts.push(`RDV à ${c.fixedAppointment}`);
    if (c.timeWindowStart && c.timeWindowEnd) parts.push(`Entre ${c.timeWindowStart} et ${c.timeWindowEnd}`);
    else if (c.timeWindowStart) parts.push(`Pas avant ${c.timeWindowStart}`);
    else if (c.timeWindowEnd) parts.push(`Fini avant ${c.timeWindowEnd}`);
    return parts.join('\n') || '-';
}

function rowFor(c, index) {
    const tags = [];
    if (c.isHideable) tags.push('Hors forfait');
    const name = clean(c.name) || '(sans nom)';
    const durationTeam = [formatHours(c.totalHeuresPrevues), c.teamSize ? `${c.teamSize} pers.` : ''].filter(Boolean).join('\n') || '-';
    const notes = [
        clean(c.additionalInfo),
        c.email ? `E-mail : ${clean(c.email)}` : '',
    ].filter(Boolean).join('\n') || '-';
    return {
        cells: [
            String(index + 1),
            tags.length ? `${name}\n${tags.join(' · ')}` : name,
            clean(c.address) || 'Adresse non renseignée',
            !c.address ? '-' : c.coordinates?.lat ? 'OK' : 'Manquant',
            durationTeam,
            scheduleText(c),
            (c.keyboxCodes || []).map(clean).filter(Boolean).join('\n') || '-',
            notes,
        ],
        noAddress: !c.address,
        noGps: !!c.address && !c.coordinates?.lat,
    };
}

const COLUMNS = ['N°', 'Chantier', 'Adresse', 'GPS', 'Durée / équipe', 'Horaires', 'Codes & accès', 'Infos'];

export async function exportChantiersPdf(chantiers) {
    const doc = await createPdf('landscape');
    const today = new Date().toLocaleDateString('fr-FR');

    const byName = (a, b) => clean(a.name).localeCompare(clean(b.name), 'fr', { sensitivity: 'base', numeric: true });
    const active = chantiers.filter(c => c.status === 'active').sort(byName);
    const archived = chantiers.filter(c => c.status !== 'active').sort(byName);
    const noAddress = active.filter(c => !c.address).length;
    const noGps = active.filter(c => c.address && !c.coordinates?.lat).length;

    let y = pdfHeader(doc, { title: 'Liste des chantiers', right: [`${chantiers.length} chantiers`, `Export du ${today}`] });
    y = pdfStats(doc, y, [
        ['Chantiers actifs', String(active.length)],
        ['Archivés', String(archived.length)],
        ['Actifs sans adresse', String(noAddress), noAddress ? C.DANGER : C.OK],
        ['Actifs sans GPS', String(noGps), noGps ? C.DANGER : C.OK],
    ]);

    const section = (title, list) => {
        if (!list.length) return;
        y = pdfSection(doc, y + 2, `${title} (${list.length})`, 'GPS « Manquant » : kilomètres impossibles à calculer');
        const rows = list.map(rowFor);
        y = pdfTable(doc, {
            startY: y + 1,
            head: [COLUMNS],
            body: rows.map(r => r.cells),
            styles: { fontSize: 7.5, cellPadding: 1.8 },
            headStyles: { fontSize: 8 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center', textColor: C.MUTED },
                1: { cellWidth: 44, fontStyle: 'bold', textColor: C.DARK },
                2: { cellWidth: 60 },
                3: { cellWidth: 17, halign: 'center' },
                4: { cellWidth: 22 },
                5: { cellWidth: 30 },
                6: { cellWidth: 36 },
                7: { cellWidth: 'auto' },
            },
            didParseCell: (data) => {
                if (data.section !== 'body') return;
                const r = rows[data.row.index];
                if (data.column.index === 2 && r.noAddress) { data.cell.styles.textColor = C.DANGER; data.cell.styles.fontStyle = 'italic'; }
                if (data.column.index === 3 && r.noGps) { data.cell.styles.textColor = C.DANGER; data.cell.styles.fontStyle = 'bold'; }
            },
        }) + 8;
    };
    section('Chantiers actifs', active);
    section('Chantiers archivés', archived);

    pdfFinish(doc, `Liste des chantiers · ${today}`, `Chantiers_${today.replace(/\//g, '-')}.pdf`);
}
