// Page « Diagnostic » : vérifie, depuis le téléphone, ce que Firebase accepte ou refuse pour ce compte
// (fiche du compte, droits admin, messagerie…) et affiche le résultat en clair, avec un rapport à copier.
// Les tests d'écriture se font dans une discussion de test propre au compte (« diag_<uid> »), masquée
// de la messagerie : aucun message n'est envoyé à quelqu'un d'autre.
import {
    doc, getDocFromServer, getDocsFromServer, collection, query, where, limit,
    setDoc, updateDoc, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { db, currentUser, pageContent, getActiveProfileName, showToast } from "../app.js";
import { escapeHTML } from "./html-utils.js";
import { profileKey, isMyChat, memberKeys } from "./chat-keys.js";

let results = [];

export async function render() {
    pageContent.innerHTML = `
        <div class="max-w-2xl mx-auto space-y-4">
            <div class="p-4 rounded-lg" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
                <h2 class="font-bold text-lg">Diagnostic</h2>
                <p class="text-sm mt-1" style="color: var(--color-text-muted);">
                    Vérifie ce que Firebase accepte pour votre compte. Les tests d'envoi se font dans une discussion
                    de test invisible : personne ne reçoit de message.
                </p>
                <div class="flex gap-2 mt-3 flex-wrap">
                    <button id="diagRunBtn" class="text-white font-bold px-4 py-2 rounded" style="background-color: var(--color-primary);">Relancer</button>
                    <button id="diagCopyBtn" class="font-bold px-4 py-2 rounded" style="border: 1px solid var(--color-border);">Copier le rapport</button>
                </div>
            </div>
            <ul id="diagList" class="space-y-2"></ul>
        </div>`;
    document.getElementById('diagRunBtn').onclick = run;
    document.getElementById('diagCopyBtn').onclick = copyReport;
    await run();
}

/** Code d'erreur Firebase lisible (permission-denied, unavailable…) */
const errText = (error) => String(error?.code || error?.message || error || 'erreur inconnue').slice(0, 200);

function add(ok, title, detail = '') {
    results.push({ ok, title, detail });
    draw();
}

function draw() {
    const list = document.getElementById('diagList');
    if (!list) return;
    list.innerHTML = results.map(r => `
        <li class="p-3 rounded-lg" style="background-color: var(--color-surface); border: 1px solid ${r.ok === false ? '#dc2626' : 'var(--color-border)'};">
            <div class="font-semibold">${r.ok === true ? '✅' : r.ok === false ? '❌' : 'ℹ️'} ${escapeHTML(r.title)}</div>
            ${r.detail ? `<div class="text-sm mt-1 break-all" style="color: var(--color-text-muted);">${escapeHTML(r.detail)}</div>` : ''}
        </li>`).join('');
}

async function step(title, fn) {
    try {
        const detail = await fn();
        add(true, title, detail || '');
        return true;
    } catch (error) {
        add(false, title, errText(error));
        return false;
    }
}

async function run() {
    const btn = document.getElementById('diagRunBtn');
    if (btn) btn.disabled = true;
    results = [];
    draw();

    const uid = currentUser?.uid;
    const profile = getActiveProfileName() || currentUser?.displayName || '';
    const myKey = profileKey(uid, profile);
    add(null, 'Appareil', `Version ${document.getElementById('app-version-display')?.textContent || '?'} · ${navigator.onLine ? 'en ligne' : 'HORS LIGNE'}`);
    add(null, 'Compte', `uid ${uid} · profil actif « ${profile} » · clé ${myKey}`);

    // 1. Fiche du compte, lue sur le serveur (pas le cache du téléphone)
    let userData = null;
    await step('Fiche du compte (users)', async () => {
        const snap = await getDocFromServer(doc(db, 'users', uid));
        if (!snap.exists()) throw new Error(`aucun document users/${uid}`);
        userData = snap.data();
        return `status = ${JSON.stringify(userData.status)} · role = ${JSON.stringify(userData.role)} · profils = ${JSON.stringify(userData.profiles || [])}`;
    });
    if (userData) {
        add(userData.status === 'approved', 'Compte validé', userData.status === 'approved'
            ? 'status vaut exactement "approved"'
            : `status vaut ${JSON.stringify(userData.status)} : les règles demandent exactement "approved"`);
    }

    // 2. Ce que les règles publiées laissent faire
    await step('Lecture générale (chantiers)', async () => {
        const snap = await getDocsFromServer(query(collection(db, 'chantiers'), limit(1)));
        return `${snap.size} document lu`;
    });
    if (userData?.role === 'admin') {
        await step('Droits admin (lecture des erreurs)', async () => {
            const snap = await getDocsFromServer(query(collection(db, 'errorLogs'), limit(1)));
            return `${snap.size} erreur lue`;
        });
    }

    // 3. Discussions du compte
    let chats = [];
    await step('Lecture des discussions', async () => {
        const snap = await getDocsFromServer(query(collection(db, 'chats'), where('participants', 'array-contains', uid)));
        chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const mine = chats.filter(c => isMyChat(c, uid, profile) && !c.id.startsWith('diag_'));
        return `${chats.length} pour le compte, dont ${mine.length} pour le profil actif`;
    });
    chats.filter(c => isMyChat(c, uid, profile) && !c.id.startsWith('diag_') && c.type !== 'group').slice(0, 8).forEach(c => {
        const other = memberKeys(c).find(k => k !== myKey);
        const name = c.memberNames?.[other] || other || '?';
        const blocked = (c.blockedBy || []).length;
        add(blocked ? false : null, `Discussion avec ${name}`,
            `id ${c.id} · participants ${JSON.stringify(c.participants)}${blocked ? ` · BLOQUÉE par ${JSON.stringify(c.blockedBy)}` : ''}`);
    });

    // 4. Envoi de test, mêmes écritures que la messagerie, dans une discussion de test masquée
    const chatId = `diag_${uid}`;
    const testKey = `${uid}__diagnostic`;
    const members = [myKey, testKey];
    const created = await step('Test : créer la discussion de test', async () => {
        await setDoc(doc(db, 'chats', chatId), {
            type: 'direct', members, participants: [uid],
            memberNames: { [myKey]: profile, [testKey]: 'Diagnostic' },
            lastMessageTime: serverTimestamp(), hiddenFor: members,
        }, { merge: true });
    });
    if (created) {
        await step('Test : écrire un message', async () => {
            await setDoc(doc(collection(db, `chats/${chatId}/messages`)), {
                text: 'Test de diagnostic', senderId: uid, senderKey: myKey, senderProfile: profile,
                createdAt: serverTimestamp(), deleted: false,
            });
        });
        await step('Test : mettre à jour l\'aperçu de la discussion', async () => {
            await updateDoc(doc(db, 'chats', chatId), {
                lastMessage: 'Test de diagnostic', lastSenderId: uid, lastSenderKey: myKey, lastSenderName: profile,
                lastMessageTime: serverTimestamp(), hiddenFor: members,
                [`readAt.${myKey}`]: serverTimestamp(), [`unreadCounts.${testKey}`]: increment(1),
            });
        });
    }

    // 5. Suivi des erreurs (page admin « Erreurs »)
    await step('Test : enregistrer une erreur de suivi', async () => {
        await setDoc(doc(collection(db, 'errorLogs')), {
            message: 'Test de diagnostic (à ignorer)', context: 'Diagnostic', uid, userName: profile,
            createdAt: serverTimestamp(), clientTime: new Date().toISOString(),
        });
    });

    const failed = results.filter(r => r.ok === false).length;
    add(failed === 0, failed === 0 ? 'Tout est accepté par Firebase' : `${failed} test(s) refusé(s)`,
        failed === 0 ? '' : 'Copiez le rapport et envoyez-le.');
    if (btn) btn.disabled = false;
}

async function copyReport() {
    const text = results.map(r => `${r.ok === true ? 'OK ' : r.ok === false ? 'KO ' : '-- '}${r.title}${r.detail ? ` : ${r.detail}` : ''}`).join('\n');
    try {
        await navigator.clipboard.writeText(text);
        showToast('Rapport copié');
    } catch {
        showToast('Copie impossible : faites une capture d\'écran', 'warning');
    }
}
