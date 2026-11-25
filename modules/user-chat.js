// Messagerie : conversations à deux et groupes, réponses, réactions, messages modifiables, « Vu », mentions @.
// Chaque PROFIL est un membre (voir chat-keys.js) : deux profils d'un même compte peuvent s'écrire,
// et un message envoyé à Thomas n'apparaît pas chez Julie, même s'ils partagent le compte.
// Bloquer quelqu'un (par profil) : la discussion à deux est fermée dans les deux sens (règles Firestore : « blockedBy »)
// et ses messages dans les groupes sont masqués (liste « chatBlocks.<mon profil> » de la fiche du compte).
// Quota Firebase gratuit : seuls les 40 derniers messages sont écoutés en direct, les plus anciens à la demande.
import { db, currentUser, showConfirmationModal, showInfoModal, showToast, getActiveProfileName } from '../app.js';
import {
    collection, query, where, orderBy, onSnapshot, serverTimestamp, getDocs, doc, updateDoc, setDoc,
    increment, arrayUnion, arrayRemove, limitToLast, endBefore, writeBatch, deleteField, getDoc
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { getUsers } from './data-service.js';
import { escapeHTML } from './html-utils.js';
import { profileKey, uidOfKey, isProfileChat, memberKeys, myChatKey, isMyChat, profileDirectory } from './chat-keys.js';

const PAGE_SIZE = 40;
const MAX_LENGTH = 2000;
// Réactions : clé stockée dans Firestore → émoji affiché
const REACTIONS = { like: '👍', love: '❤️', haha: '😂', wow: '😮', merci: '🙏', ok: '✅' };
const AVATAR_COLORS = ['#4f46e5', '#0e7490', '#047857', '#7c3aed', '#be123c', '#c2410c', '#0369a1', '#a21caf'];

const state = {
    chats: [],            // conversations de l'utilisateur (temps réel)
    activeId: null,
    messages: [],         // les 40 derniers messages (temps réel)
    older: [],            // messages plus anciens chargés à la demande
    hasOlder: false,
    replyTo: null,
    editing: null,
    search: '',
    people: [],           // tous les profils des comptes validés (annuaire)
    blocked: new Set(),   // membres bloqués par le profil actif (clés de profil, ou uid pour une ancienne discussion)
    redrawInfo: null,     // fenêtre « Infos » ouverte, redessinée à chaque changement de la conversation
};
let conversationsListener = null;
let activeChatListener = null;
let readTimer = null;

// Le service worker n'affiche pas de notification pour la discussion ouverte à l'écran
function tellActiveChat(chatId) {
    navigator.serviceWorker?.controller?.postMessage({ type: 'ACTIVE_CHAT', chatId: chatId || null });
}

// Appelé par app.js quand on quitte la page : coupe les écoutes temps réel de la messagerie
export function cleanup() {
    if (activeChatListener) { activeChatListener(); activeChatListener = null; }
    if (conversationsListener) { conversationsListener(); conversationsListener = null; }
    clearTimeout(readTimer);
    document.removeEventListener('click', closeMenus);
    state.activeId = null;
    tellActiveChat(null);
}

/* ------------------------------------------------------------------ Outils */

const me = () => currentUser.uid; // le compte (règles Firestore)
const myName = () => getActiveProfileName() || currentUser.displayName || currentUser.email || 'Moi';
const myProfileKey = () => profileKey(me(), myName());
/** Ma clé dans la discussion : le profil actif (ou le compte pour une ancienne discussion) */
const meIn = (chat) => myChatKey(chat, me(), myName());
/** Auteur d'un message : profil (nouveau format) ou compte (anciens messages) */
const senderKeyOf = (m) => m.senderKey || m.senderId;
const uniq = (list) => [...new Set(list)];
const initials = (name) => String(name || '?').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';
const colorFor = (key) => AVATAR_COLORS[[...String(key || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const toDate = (ts) => ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
const isGroup = (chat) => chat?.type === 'group';
const activeChat = () => state.chats.find(c => c.id === state.activeId) || null;
/** Discussion à deux fermée : l'un des deux a bloqué l'autre */
const isBlockedChat = (chat) => !isGroup(chat) && (chat?.blockedBy || []).length > 0;
const otherOf = (chat) => memberKeys(chat).find(k => k !== meIn(chat));
/** Profil qui a écrit un message (anciens messages : retrouvé par le compte et le nom du profil) */
const personKeyOf = (m) => m.senderKey || (m.senderProfile ? profileKey(m.senderId, m.senderProfile) : m.senderId);
const isBlockedSender = (m) => state.blocked.has(personKeyOf(m)) || state.blocked.has(m.senderId);
const preview = (text, max = 80) => { const t = String(text || '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max)}…` : t; };

/** Nom d'un membre (clé de profil, ou uid pour une ancienne discussion) */
function nameOf(chat, key) {
    if (key === meIn(chat)) return myName();
    if (chat?.memberNames?.[key]) return chat.memberNames[key];
    const i = (chat?.participants || []).indexOf(key);
    if (i >= 0 && chat.participantNames?.[i]) return chat.participantNames[i];
    return state.people.find(p => p.key === key)?.name || state.people.find(p => p.uid === key)?.account || 'Ancien membre';
}

function chatTitle(chat) {
    if (isGroup(chat)) return chat.name || 'Groupe';
    const other = memberKeys(chat).find(k => k !== meIn(chat));
    return other ? nameOf(chat, other) : myName();
}

/** Champs de composition d'un groupe : profils + comptes correspondants (pour les règles Firestore) */
function membershipFields(chat, members, admins) {
    if (!isProfileChat(chat)) return { participants: members, admins };
    return { members, participants: uniq(members.map(uidOfKey)), admins, adminAccounts: uniq(admins.map(uidOfKey)) };
}

function avatarHTML(label, key, group = false, size = '') {
    const icon = group
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
        : escapeHTML(initials(label));
    return `<div class="chat-avatar ${size}" style="background:${colorFor(key)}">${icon}</div>`;
}

function timeLabel(date) {
    if (!date) return '';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Hier';
    if (now - date < 6 * 86400000) return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function dayLabel(date) {
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return "Aujourd'hui";
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Hier';
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** Texte sûr : échappé (aucun code ne peut s'exécuter), liens cliquables, @mentions des membres en évidence */
function formatText(text, chat) {
    let html = escapeHTML(text).replace(/\n/g, '<br>');
    html = html.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    const names = memberKeys(chat).map(k => nameOf(chat, k)).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const name of names) {
        const safe = escapeHTML(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        html = html.replace(new RegExp(`@${safe}`, 'g'), `<span class="chat-mention${name === myName() ? ' is-me' : ''}">@${escapeHTML(name)}</span>`);
    }
    return html;
}

function closeMenus(e) {
    if (e && e.target.closest?.('.chat-menu, [data-menu-trigger]')) return;
    document.querySelectorAll('.chat-menu').forEach(m => m.remove());
}

/* ------------------------------------------------------------------ Page */

export async function render(params = {}) {
    const container = document.getElementById('page-content');
    container.innerHTML = `
        <div class="chat-shell" id="chat-shell">
            <aside class="chat-list">
                <div class="chat-list-head">
                    <h2>Messagerie</h2>
                    <button id="new-chat-btn" class="chat-icon-btn is-primary" title="Nouvelle discussion ou nouveau groupe" aria-label="Nouvelle discussion">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                    </button>
                </div>
                <div class="chat-search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                    <input id="chat-search" type="search" placeholder="Rechercher une discussion…" autocomplete="off">
                </div>
                <div id="conversations-container" class="chat-conversations"><p class="chat-empty">Chargement…</p></div>
            </aside>
            <section class="chat-main">
                <div id="no-chat-selected" class="chat-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <p>Choisissez une discussion, ou créez un groupe avec le bouton +</p>
                </div>
                <header id="chat-header" class="chat-header hidden"></header>
                <div id="messages-area" class="chat-messages hidden"></div>
                <form id="message-form" class="chat-composer hidden" autocomplete="off">
                    <div id="composer-context" class="chat-composer-context hidden"></div>
                    <div id="mention-list" class="chat-mentions hidden"></div>
                    <div class="chat-composer-row">
                        <textarea id="message-input" rows="1" maxlength="${MAX_LENGTH}" placeholder="Votre message…" aria-label="Votre message"></textarea>
                        <button type="submit" class="chat-send" aria-label="Envoyer">
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>
                        </button>
                    </div>
                </form>
                <div id="chat-blocked" class="chat-blocked hidden"></div>
            </section>
        </div>
        <div id="chat-modal" class="modal hidden"></div>
    `;
    state.people = []; // annuaire relu à chaque ouverture (nouveaux profils)
    loadPeople().then(() => { renderConversations(); if (activeChat()) renderHeader(activeChat()); }).catch(console.error);
    state.blocked = new Set();
    loadBlocked();
    setupEventListeners();
    loadConversations();
    // Ouverte depuis une notification : directement sur la discussion
    if (params.chatId) openChat(params.chatId);
}

function setupEventListeners() {
    document.getElementById('new-chat-btn').onclick = () => openNewChatModal();
    document.getElementById('chat-search').oninput = (e) => { state.search = e.target.value.trim().toLowerCase(); renderConversations(); };
    document.addEventListener('click', closeMenus);

    const form = document.getElementById('message-form');
    const input = document.getElementById('message-input');
    form.addEventListener('submit', (e) => { e.preventDefault(); submitMessage(); });
    input.addEventListener('keydown', (e) => {
        const mentions = document.getElementById('mention-list');
        if (!mentions.classList.contains('hidden') && e.key === 'Enter') {
            const first = mentions.querySelector('button');
            if (first) { e.preventDefault(); first.click(); return; }
        }
        // Ordinateur : Entrée = envoyer, Maj+Entrée = nouvelle ligne. Téléphone : Entrée = nouvelle ligne, bouton pour envoyer
        if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(hover: none)').matches) { e.preventDefault(); submitMessage(); }
        if (e.key === 'Escape') clearComposerContext();
    });
    input.addEventListener('input', () => { autoGrow(input); updateMentionList(); });
}

function autoGrow(input) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

/* ------------------------------------------------------------------ Liste des conversations */

function loadConversations() {
    if (conversationsListener) conversationsListener();
    const q = query(collection(db, "chats"), where("participants", "array-contains", me()), orderBy("lastMessageTime", "desc"));
    conversationsListener = onSnapshot(q, (snapshot) => {
        // Le compte reçoit les discussions de tous ses profils : on ne garde que celles du profil actif
        state.chats = snapshot.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
            .filter(chat => isMyChat(chat, me(), myName()));
        renderConversations();
        // Fenêtre « Infos » ouverte : elle suit les changements (membre ajouté, sourdine…)
        if (state.redrawInfo && !document.getElementById('chat-modal')?.classList.contains('hidden')) state.redrawInfo();
        if (state.activeId) {
            const chat = activeChat();
            if (!chat) { closeChat(); return; } // retiré du groupe, ou discussion d'un autre profil
            renderHeader(chat);
            renderMessages(false);
        }
    }, (error) => {
        console.error(error);
        document.getElementById('conversations-container').innerHTML = `<p class="chat-empty is-error">Impossible de charger les discussions.</p>`;
    });
}

function renderConversations() {
    const container = document.getElementById('conversations-container');
    if (!container) return;
    const visible = state.chats
        .filter(c => !(c.hiddenFor || []).includes(meIn(c)))
        .filter(c => !state.search || chatTitle(c).toLowerCase().includes(state.search) || String(c.lastMessage || '').toLowerCase().includes(state.search))
        .sort((a, b) => Number((b.pinnedBy || []).includes(meIn(b))) - Number((a.pinnedBy || []).includes(meIn(a))));
    if (!visible.length) {
        container.innerHTML = `<p class="chat-empty">${state.search ? 'Aucune discussion trouvée.' : 'Aucune discussion pour l\'instant.<br>Touchez + pour écrire à un collègue ou créer un groupe.'}</p>`;
        return;
    }
    container.innerHTML = visible.map(chat => {
        const mine = meIn(chat);
        const unread = chat.unreadCounts?.[mine] || 0;
        const muted = (chat.mutedBy || []).includes(mine);
        const pinned = (chat.pinnedBy || []).includes(mine);
        const blocked = isBlockedChat(chat);
        const title = chatTitle(chat);
        const lastSender = chat.lastSenderKey || chat.lastSenderId;
        const hiddenLast = isGroup(chat) && !!lastSender && (state.blocked.has(lastSender) || state.blocked.has(chat.lastSenderId));
        const sender = lastSender && chat.lastMessage && !hiddenLast
            ? (lastSender === mine ? 'Vous : ' : isGroup(chat) ? `${preview((chat.lastSenderName || nameOf(chat, lastSender)).split(' ')[0], 20)} : ` : '')
            : '';
        return `
            <button type="button" class="chat-conv${chat.id === state.activeId ? ' is-active' : ''}${unread ? ' is-unread' : ''}" data-chat="${escapeHTML(chat.id)}">
                ${avatarHTML(title, chat.id, isGroup(chat))}
                <span class="chat-conv-body">
                    <span class="chat-conv-top">
                        <span class="chat-conv-name">${escapeHTML(title)}</span>
                        <span class="chat-conv-time">${timeLabel(toDate(chat.lastMessageTime))}</span>
                    </span>
                    <span class="chat-conv-bottom">
                        <span class="chat-conv-last">${escapeHTML(sender + preview(hiddenLast ? 'Message masqué' : (chat.lastMessage || (isGroup(chat) ? `${memberKeys(chat).length} membres` : 'Nouvelle discussion'))))}</span>
                        ${blocked ? '<span class="chat-flag" title="Bloquée">🚫</span>' : ''}
                        ${pinned ? '<span class="chat-flag" title="Épinglée">📌</span>' : ''}
                        ${muted ? '<span class="chat-flag" title="Sourdine">🔕</span>' : ''}
                        ${unread ? `<span class="chat-badge${muted ? ' is-muted' : ''}">${unread > 99 ? '99+' : unread}</span>` : ''}
                    </span>
                </span>
            </button>`;
    }).join('');
    container.querySelectorAll('[data-chat]').forEach(el => { el.onclick = () => openChat(el.dataset.chat); });
}

/* ------------------------------------------------------------------ Conversation ouverte */

function openChat(chatId) {
    state.activeId = chatId;
    tellActiveChat(chatId);
    state.messages = []; state.older = []; state.hasOlder = false;
    clearComposerContext();
    document.getElementById('chat-shell').classList.add('has-active');
    ['chat-header', 'messages-area', 'message-form'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    document.getElementById('no-chat-selected').classList.add('hidden');
    const area = document.getElementById('messages-area');
    area.innerHTML = '<p class="chat-empty">Chargement…</p>';
    delete area.dataset.ready;
    const chat = activeChat();
    if (chat) renderHeader(chat);
    renderConversations();
    markRead();

    if (activeChatListener) activeChatListener();
    const q = query(collection(db, `chats/${chatId}/messages`), orderBy("createdAt", "asc"), limitToLast(PAGE_SIZE));
    let first = true;
    activeChatListener = onSnapshot(q, (snapshot) => {
        state.messages = snapshot.docs.map(d => ({ id: d.id, _doc: d, ...d.data({ serverTimestamps: 'estimate' }) }));
        if (first) { state.hasOlder = snapshot.size >= PAGE_SIZE; first = false; }
        renderMessages(true);
        if (snapshot.docChanges().some(c => c.type === 'added' && senderKeyOf(c.doc.data()) !== meIn(activeChat()))) scheduleRead();
    }, (error) => {
        console.error(error);
        document.getElementById('messages-area').innerHTML = '<p class="chat-empty is-error">Impossible de charger les messages.</p>';
    });
    if (!matchMedia('(hover: none)').matches) document.getElementById('message-input').focus();
}

function closeChat() {
    if (activeChatListener) { activeChatListener(); activeChatListener = null; }
    state.activeId = null;
    tellActiveChat(null);
    document.getElementById('chat-shell')?.classList.remove('has-active');
    ['chat-header', 'messages-area', 'message-form', 'chat-blocked'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('no-chat-selected')?.classList.remove('hidden');
    renderConversations();
}

/** « Vu » + compteur remis à zéro : une seule écriture, regroupée si plusieurs messages arrivent d'un coup */
function scheduleRead() { clearTimeout(readTimer); readTimer = setTimeout(markRead, 800); }
function markRead() {
    const chat = activeChat();
    if (!chat || document.hidden) return;
    const mine = meIn(chat);
    updateDoc(doc(db, "chats", chat.id), { [`unreadCounts.${mine}`]: 0, [`readAt.${mine}`]: serverTimestamp() }).catch(console.warn);
}

function renderHeader(chat) {
    const header = document.getElementById('chat-header');
    const group = isGroup(chat);
    const sub = group
        ? memberKeys(chat).map(k => k === meIn(chat) ? 'vous' : nameOf(chat, k).split(' ')[0]).join(', ')
        : isProfileChat(chat) ? 'Discussion privée' : 'Ancienne discussion, partagée par les profils du compte';
    header.innerHTML = `
        <button type="button" class="chat-icon-btn chat-back" id="back-to-list" aria-label="Retour aux discussions">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button type="button" class="chat-header-info" id="chat-info-btn">
            ${avatarHTML(chatTitle(chat), chat.id, group)}
            <span><strong>${escapeHTML(chatTitle(chat))}</strong><small>${escapeHTML(sub)}</small></span>
        </button>
        <button type="button" class="chat-icon-btn" id="chat-settings-btn" aria-label="Infos et réglages" title="Infos et réglages">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
        </button>`;
    header.querySelector('#back-to-list').onclick = closeChat;
    header.querySelector('#chat-info-btn').onclick = () => openInfoModal(chat.id);
    header.querySelector('#chat-settings-btn').onclick = () => openInfoModal(chat.id);
    renderBlockedBar(chat);
}

/** Discussion bloquée : plus de zone de saisie, un bandeau à la place (avec « Débloquer » pour celui qui a bloqué) */
function renderBlockedBar(chat) {
    const form = document.getElementById('message-form');
    const bar = document.getElementById('chat-blocked');
    if (!form || !bar) return;
    const blocked = isBlockedChat(chat);
    form.classList.toggle('hidden', blocked);
    bar.classList.toggle('hidden', !blocked);
    if (!blocked) { bar.innerHTML = ''; return; }
    clearComposerContext();
    const other = otherOf(chat);
    const mine = (chat.blockedBy || []).includes(meIn(chat));
    bar.innerHTML = mine
        ? `<span>🚫 Vous avez bloqué ${escapeHTML(nameOf(chat, other))}. Vous ne recevez plus ses messages.</span><button type="button" class="btn btn-secondary" id="unblock-btn">Débloquer</button>`
        : '<span>🚫 Vous ne pouvez plus envoyer de messages dans cette discussion.</span>';
    bar.querySelector('#unblock-btn')?.addEventListener('click', () => toggleBlock(other, nameOf(chat, other), false));
}

function renderMessages(fromSnapshot) {
    const area = document.getElementById('messages-area');
    const chat = activeChat();
    if (!area || !chat) return;
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 120;
    const all = [...state.older, ...state.messages];
    if (!all.length) {
        area.innerHTML = `<p class="chat-empty">${isGroup(chat) ? 'Le groupe est prêt. Écrivez le premier message !' : 'Dites bonjour 👋'}</p>`;
        return;
    }
    const lastMine = [...all].reverse().find(m => isMine(m, chat) && m.type !== 'system' && !m.deleted);
    let html = state.hasOlder ? '<button type="button" class="chat-load-older" id="load-older">Messages précédents</button>' : '';
    let prevDay = '', prev = null;
    for (const m of all) {
        const date = toDate(m.createdAt) || new Date();
        const day = date.toDateString();
        if (day !== prevDay) { html += `<div class="chat-day"><span>${escapeHTML(dayLabel(date))}</span></div>`; prevDay = day; prev = null; }
        if (m.type === 'system') { html += `<div class="chat-system">${escapeHTML(m.text)}</div>`; prev = null; continue; }
        const mine = isMine(m, chat);
        if (!mine && isGroup(chat) && isBlockedSender(m)) {
            html += `<div class="chat-row"><div class="chat-bubble-wrap"><div class="chat-bubble is-deleted">Message masqué : vous avez bloqué ${escapeHTML(m.senderProfile || nameOf(chat, senderKeyOf(m)))}</div></div></div>`;
            prev = null; continue;
        }
        const grouped = prev && senderKeyOf(prev) === senderKeyOf(m) && (prev.senderProfile || '') === (m.senderProfile || '') && date - (toDate(prev.createdAt) || date) < 5 * 60000;
        html += messageHTML(m, chat, mine, grouped, date, m === lastMine);
        prev = m;
    }
    area.innerHTML = html;
    area.querySelector('#load-older')?.addEventListener('click', loadOlder);
    area.querySelectorAll('[data-msg]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('a, .chat-quote')) return;
            openMessageMenu(el.dataset.msg, el);
        });
    });
    area.querySelectorAll('.chat-reaction').forEach(el => { el.onclick = () => toggleReaction(el.dataset.id, el.dataset.key); });
    area.querySelectorAll('.chat-quote[data-target]').forEach(el => {
        el.onclick = () => document.getElementById(`msg-${el.dataset.target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (fromSnapshot && (nearBottom || !area.dataset.ready)) area.scrollTop = area.scrollHeight;
    area.dataset.ready = '1';
}

/** Message écrit par le profil actif (ancienne discussion : par le compte) */
function isMine(m, chat) { return senderKeyOf(m) === meIn(chat); }

function messageHTML(m, chat, mine, grouped, date, isLastMine) {
    const group = isGroup(chat);
    const key = senderKeyOf(m);
    // Le message garde le profil qui l'a écrit (senderProfile)
    const sender = m.senderProfile || nameOf(chat, key);
    // Ancienne discussion partagée par le compte : message d'un autre profil du même compte
    const otherProfileOfMine = mine && !isProfileChat(chat) && m.senderProfile && m.senderProfile.trim().toLowerCase() !== myName().trim().toLowerCase();
    const showSender = !grouped && ((!mine && (group || (m.senderProfile && m.senderProfile !== nameOf(chat, key)))) || otherProfileOfMine);
    const reactions = Object.entries(m.reactions || {}).filter(([k, uids]) => REACTIONS[k] && uids?.length);
    const quote = m.replyTo && !m.deleted ? `
        <div class="chat-quote" data-target="${escapeHTML(m.replyTo.id)}">
            <strong>${escapeHTML(m.replyTo.senderName || '')}</strong>
            <span>${escapeHTML(preview(m.replyTo.text, 120))}</span>
        </div>` : '';
    let seen = '';
    if (isLastMine) {
        const created = toDate(m.createdAt);
        const others = memberKeys(chat).filter(k => k !== meIn(chat));
        const readers = others.filter(k => toDate(chat.readAt?.[k]) >= created);
        if (group) seen = readers.length ? `Vu par ${readers.length === others.length ? 'tout le monde' : readers.map(k => nameOf(chat, k).split(' ')[0]).join(', ')}` : 'Envoyé';
        else seen = readers.length ? 'Vu' : 'Envoyé';
    }
    return `
        <div class="chat-row${mine ? ' is-mine' : ''}${grouped ? ' is-grouped' : ''}" id="msg-${escapeHTML(m.id)}">
            ${!mine && group ? (grouped ? '<span class="chat-avatar-space"></span>' : avatarHTML(sender, key, false, 'is-sm')) : ''}
            <div class="chat-bubble-wrap">
                ${showSender ? `<span class="chat-sender" style="color:${colorFor(key)}">${escapeHTML(sender)}</span>` : ''}
                <div class="chat-bubble${m.deleted ? ' is-deleted' : ''}" data-msg="${escapeHTML(m.id)}" data-menu-trigger tabindex="0">
                    ${quote}
                    <div class="chat-text">${m.deleted ? 'Message supprimé' : formatText(m.text, chat)}</div>
                    <span class="chat-meta">${m.editedAt && !m.deleted ? 'modifié · ' : ''}${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                ${reactions.length ? `<div class="chat-reactions">${reactions.map(([k, uids]) => `
                    <button type="button" class="chat-reaction${uids.includes(meIn(chat)) ? ' is-mine' : ''}" data-id="${escapeHTML(m.id)}" data-key="${k}" title="${escapeHTML(uids.map(id => nameOf(chat, id)).join(', '))}">${REACTIONS[k]} ${uids.length}</button>`).join('')}</div>` : ''}
                ${seen ? `<span class="chat-seen">${escapeHTML(seen)}</span>` : ''}
            </div>
        </div>`;
}

async function loadOlder() {
    const chat = activeChat();
    const oldest = state.older[0] || state.messages[0];
    if (!chat || !oldest?._doc) return;
    const area = document.getElementById('messages-area');
    const before = area.scrollHeight;
    try {
        const snap = await getDocs(query(collection(db, `chats/${chat.id}/messages`), orderBy("createdAt", "asc"), endBefore(oldest._doc), limitToLast(PAGE_SIZE)));
        state.older = [...snap.docs.map(d => ({ id: d.id, _doc: d, ...d.data({ serverTimestamps: 'estimate' }) })), ...state.older];
        state.hasOlder = snap.size >= PAGE_SIZE;
        renderMessages(false);
        area.scrollTop = area.scrollHeight - before;
    } catch (error) {
        console.error(error);
        showToast("Impossible de charger les messages précédents.", 'warning');
    }
}

/* ------------------------------------------------------------------ Actions sur un message */

function findMessage(id) { return [...state.older, ...state.messages].find(m => m.id === id); }

function openMessageMenu(id, anchor) {
    closeMenus();
    const m = findMessage(id);
    if (!m || m.deleted) return;
    const mine = isMine(m, activeChat());
    const menu = document.createElement('div');
    menu.className = 'chat-menu';
    menu.innerHTML = `
        <div class="chat-menu-reactions">${Object.entries(REACTIONS).map(([k, e]) => `<button type="button" data-react="${k}" aria-label="Réagir ${e}">${e}</button>`).join('')}</div>
        <button type="button" data-act="reply">↩︎ Répondre</button>
        <button type="button" data-act="copy">⧉ Copier</button>
        ${mine ? '<button type="button" data-act="edit">✎ Modifier</button><button type="button" data-act="delete" class="is-danger">🗑 Supprimer</button>' : ''}`;
    anchor.closest('.chat-bubble-wrap').appendChild(menu);
    menu.querySelectorAll('[data-react]').forEach(b => { b.onclick = () => { closeMenus(); toggleReaction(id, b.dataset.react); }; });
    menu.querySelectorAll('[data-act]').forEach(b => {
        b.onclick = async () => {
            closeMenus();
            if (b.dataset.act === 'reply') setComposerContext('reply', m);
            if (b.dataset.act === 'edit') setComposerContext('edit', m);
            if (b.dataset.act === 'copy') navigator.clipboard?.writeText(m.text).then(() => showToast("Message copié."), () => {});
            if (b.dataset.act === 'delete' && await showConfirmationModal("Supprimer le message", "Supprimer ce message pour tout le monde ?")) deleteMessage(m);
        };
    });
}

async function toggleReaction(id, key) {
    const chat = activeChat();
    const m = findMessage(id);
    if (!chat || !m || !REACTIONS[key]) return;
    const mine = meIn(chat);
    const has = (m.reactions?.[key] || []).includes(mine);
    try {
        await updateDoc(doc(db, `chats/${chat.id}/messages`, id), { [`reactions.${key}`]: has ? arrayRemove(mine) : arrayUnion(mine) });
    } catch (error) { console.error(error); showToast("Réaction non enregistrée.", 'warning'); }
}

async function deleteMessage(m) {
    const chat = activeChat();
    try {
        await updateDoc(doc(db, `chats/${chat.id}/messages`, m.id), { text: '', deleted: true, reactions: deleteField(), replyTo: deleteField() });
        // Dernier message de la liste : l'aperçu ne doit plus montrer le texte supprimé
        if (state.messages.at(-1)?.id === m.id) await updateDoc(doc(db, "chats", chat.id), { lastMessage: 'Message supprimé' });
    } catch (error) { console.error(error); showToast("Suppression impossible.", 'warning'); }
}

function setComposerContext(kind, m) {
    state.replyTo = kind === 'reply' ? m : null;
    state.editing = kind === 'edit' ? m : null;
    const box = document.getElementById('composer-context');
    const chat = activeChat();
    box.innerHTML = `
        <div><strong>${kind === 'reply' ? `Réponse à ${escapeHTML(m.senderProfile || nameOf(chat, senderKeyOf(m)))}` : 'Modifier le message'}</strong><span>${escapeHTML(preview(m.text, 100))}</span></div>
        <button type="button" class="chat-icon-btn" aria-label="Annuler">✕</button>`;
    box.classList.remove('hidden');
    box.querySelector('button').onclick = clearComposerContext;
    const input = document.getElementById('message-input');
    if (kind === 'edit') { input.value = m.text; autoGrow(input); }
    input.focus();
}

function clearComposerContext() {
    const wasEditing = !!state.editing;
    state.replyTo = null; state.editing = null;
    const box = document.getElementById('composer-context');
    if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
    const input = document.getElementById('message-input');
    if (wasEditing && input) { input.value = ''; autoGrow(input); }
}

/* ------------------------------------------------------------------ Mentions @ (groupes) */

function updateMentionList() {
    const list = document.getElementById('mention-list');
    const input = document.getElementById('message-input');
    const chat = activeChat();
    const match = isGroup(chat) && input.value.slice(0, input.selectionStart).match(/@([^\s@]{0,20})$/);
    if (!match) { list.classList.add('hidden'); return; }
    const term = match[1].toLowerCase();
    const members = memberKeys(chat).filter(k => k !== meIn(chat)).map(k => nameOf(chat, k)).filter(n => n.toLowerCase().includes(term)).slice(0, 6);
    if (!members.length) { list.classList.add('hidden'); return; }
    list.innerHTML = members.map(n => `<button type="button" data-name="${escapeHTML(n)}">${avatarHTML(n, n, false, 'is-xs')} ${escapeHTML(n)}</button>`).join('');
    list.classList.remove('hidden');
    list.querySelectorAll('button').forEach(b => {
        b.onclick = () => {
            const pos = input.selectionStart;
            const start = input.value.slice(0, pos).lastIndexOf('@');
            input.value = `${input.value.slice(0, start)}@${b.dataset.name} ${input.value.slice(pos)}`;
            list.classList.add('hidden');
            input.focus();
        };
    });
}

/* ------------------------------------------------------------------ Envoi */

async function submitMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim().slice(0, MAX_LENGTH);
    const chat = activeChat();
    if (!text || !chat || isBlockedChat(chat)) return;
    document.getElementById('mention-list').classList.add('hidden');

    if (state.editing) {
        const m = state.editing;
        clearComposerContext();
        input.value = ''; autoGrow(input);
        if (text === m.text) return;
        try {
            await updateDoc(doc(db, `chats/${chat.id}/messages`, m.id), { text, editedAt: serverTimestamp() });
            if (state.messages.at(-1)?.id === m.id) await updateDoc(doc(db, "chats", chat.id), { lastMessage: preview(text, 120) });
        } catch (error) { console.error(error); showToast("Modification impossible.", 'warning'); }
        return;
    }

    const reply = state.replyTo;
    clearComposerContext();
    input.value = ''; autoGrow(input);
    try {
        await sendToChat(chat, {
            text, ...author(chat), createdAt: serverTimestamp(), deleted: false,
            ...(reply ? { replyTo: { id: reply.id, text: preview(reply.text, 200), senderName: reply.senderProfile || nameOf(chat, senderKeyOf(reply)) } } : {}),
        });
    } catch (error) {
        console.error("Erreur envoi:", error);
        input.value = text; autoGrow(input);
        showToast(error?.code === 'permission-denied'
            ? "Message refusé par Firebase : les règles Firestore publiées ne sont pas à jour (voir docs/DEPLOIEMENT-FIREBASE.md)."
            : `Message non envoyé (${String(error?.code || error?.message || 'erreur inconnue').slice(0, 120)}). Vérifiez la connexion et réessayez.`, 'warning');
    }
}

/** Auteur d'un message : le compte (vérifié par les règles) et le profil qui écrit */
function author(chat) {
    return isProfileChat(chat)
        ? { senderId: me(), senderKey: meIn(chat), senderProfile: myName() }
        : { senderId: me(), senderProfile: myName() };
}

/** Message + mise à jour de la conversation (aperçu, non-lus des autres) en une seule écriture groupée */
async function sendToChat(chat, message) {
    const batch = writeBatch(db);
    const mine = meIn(chat);
    const system = message.type === 'system';
    batch.set(doc(collection(db, `chats/${chat.id}/messages`)), message);
    const update = {
        lastMessage: system ? message.text : preview(message.text, 120),
        // pas de « Vous : » devant « X a ajouté Y »
        lastSenderId: system ? null : me(),
        lastSenderKey: system ? null : mine,
        lastSenderName: system ? null : myName(),
        lastMessageTime: serverTimestamp(),
        hiddenFor: [],
        [`readAt.${mine}`]: serverTimestamp(),
    };
    if (!system) for (const k of memberKeys(chat)) if (k !== mine) update[`unreadCounts.${k}`] = increment(1);
    batch.update(doc(db, "chats", chat.id), update);
    await batch.commit();
}

const systemMessage = (chat, text) => ({ type: 'system', text, ...author(chat), createdAt: serverTimestamp(), deleted: false });

/* ------------------------------------------------------------------ Nouvelle discussion / nouveau groupe */

/** Annuaire : tous les profils de tous les comptes validés */
async function loadPeople() {
    if (!state.people.length) state.people = profileDirectory(await getUsers().catch(() => []));
    return state.people;
}

/** Ligne d'un profil dans les listes de choix (le compte est rappelé quand il a plusieurs profils) */
function personHTML(p, selected = false) {
    const account = p.accountProfiles > 1 && p.account && p.account !== p.name ? `<small>Compte ${escapeHTML(p.account)}</small>` : '';
    return `
        <button type="button" class="chat-person${selected ? ' is-selected' : ''}" data-key="${escapeHTML(p.key)}">
            ${avatarHTML(p.name, p.key)}
            <span class="chat-person-name">${escapeHTML(p.name)}${state.blocked.has(p.key) ? ' <span class="chat-blocked-tag">bloqué</span>' : ''}${account}</span>
            <span class="chat-check" aria-hidden="true">✓</span>
        </button>`;
}

const matchesPerson = (p, term) => !term || `${p.name} ${p.account}`.toLowerCase().includes(term);

async function openNewChatModal(mode = 'direct') {
    const modal = document.getElementById('chat-modal');
    const mine = myProfileKey();
    const others = (await loadPeople()).filter(p => p.key !== mine);
    const selected = new Set();
    modal.innerHTML = `
        <div class="modal-panel chat-modal-panel" role="dialog" aria-modal="true" aria-labelledby="chat-modal-title">
            <div class="modal-body">
                <div class="chat-modal-head">
                    <h3 class="modal-title" id="chat-modal-title">Nouvelle discussion</h3>
                    <button type="button" class="chat-icon-btn" data-close aria-label="Fermer">✕</button>
                </div>
                <div class="chat-tabs" role="tablist">
                    <button type="button" data-mode="direct" role="tab">Avec une personne</button>
                    <button type="button" data-mode="group" role="tab">Nouveau groupe</button>
                </div>
                <div class="chat-group-fields">
                    <label class="chat-label" for="group-name">Nom du groupe</label>
                    <input id="group-name" class="input" maxlength="60" placeholder="Ex. Équipe Marche, Gîtes du week-end…">
                    <div class="chat-select-all"><span id="group-count">0 sélectionné</span><button type="button" id="select-all">Toute l'équipe</button></div>
                </div>
                <input id="people-search" class="input chat-people-search" type="search" placeholder="Rechercher un collègue…">
                <div class="chat-people" id="people-list"></div>
            </div>
            <div class="modal-footer chat-group-fields">
                <button type="button" class="btn btn-secondary" data-close>Annuler</button>
                <button type="button" class="btn btn-primary" id="create-group" disabled>Créer le groupe</button>
            </div>
        </div>`;
    modal.classList.remove('hidden');
    modal.onclick = (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.classList.add('hidden'); };

    const panel = modal.querySelector('.chat-modal-panel');
    const list = modal.querySelector('#people-list');
    const nameInput = modal.querySelector('#group-name');
    const createBtn = modal.querySelector('#create-group');
    const refresh = () => {
        modal.querySelector('#group-count').textContent = `${selected.size} sélectionné${selected.size > 1 ? 's' : ''}`;
        createBtn.disabled = !nameInput.value.trim() || selected.size < 1;
    };
    const drawPeople = () => {
        const term = modal.querySelector('#people-search').value.trim().toLowerCase();
        const people = others.filter(p => matchesPerson(p, term));
        list.innerHTML = people.length ? people.map(p => personHTML(p, selected.has(p.key))).join('') : '<p class="chat-empty">Personne trouvé.</p>';
        list.querySelectorAll('[data-key]').forEach(b => {
            b.onclick = () => {
                const person = others.find(p => p.key === b.dataset.key);
                if (panel.dataset.mode === 'direct') { modal.classList.add('hidden'); startConversation(person); return; }
                selected.has(person.key) ? selected.delete(person.key) : selected.add(person.key);
                b.classList.toggle('is-selected');
                refresh();
            };
        });
    };
    const setMode = (m) => {
        panel.dataset.mode = m;
        modal.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('is-active', b.dataset.mode === m));
        modal.querySelector('#chat-modal-title').textContent = m === 'group' ? 'Nouveau groupe' : 'Nouvelle discussion';
        drawPeople();
        if (m === 'group') nameInput.focus();
    };
    modal.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
    modal.querySelector('#people-search').oninput = drawPeople;
    nameInput.oninput = refresh;
    modal.querySelector('#select-all').onclick = () => {
        const all = others.every(p => selected.has(p.key));
        others.forEach(p => all ? selected.delete(p.key) : selected.add(p.key));
        drawPeople(); refresh();
    };
    createBtn.onclick = async () => {
        createBtn.disabled = true;
        try {
            const id = await createGroup(nameInput.value.trim(), others.filter(p => selected.has(p.key)));
            modal.classList.add('hidden');
            openChat(id);
        } catch (error) {
            console.error(error);
            showInfoModal("Erreur", "Impossible de créer le groupe.");
            createBtn.disabled = false;
        }
    };
    setMode(mode);
}

/** Discussion à deux entre le profil actif et un autre profil (du même compte ou d'un autre) */
async function startConversation(person) {
    const mine = myProfileKey();
    const members = [mine, person.key].sort();
    // Identifiant fixe : la même paire de profils retrouve toujours la même discussion
    const chatId = `p_${members.join('--')}`;
    const existing = state.chats.find(c => c.id === chatId);
    try {
        if (existing) {
            if ((existing.hiddenFor || []).includes(mine)) await updateDoc(doc(db, "chats", chatId), { hiddenFor: arrayRemove(mine) });
        } else {
            await setDoc(doc(db, "chats", chatId), {
                type: 'direct', members, participants: uniq(members.map(uidOfKey)),
                memberNames: { [mine]: myName(), [person.key]: person.name },
                lastMessageTime: serverTimestamp(), hiddenFor: [],
            }, { merge: true });
        }
        openChat(chatId);
    } catch (error) {
        console.error(error);
        showInfoModal("Erreur", "Impossible de lancer la conversation.");
    }
}

async function createGroup(name, people) {
    const mine = myProfileKey();
    const members = [mine, ...people.map(p => p.key)];
    const memberNames = Object.fromEntries([[mine, myName()], ...people.map(p => [p.key, p.name])]);
    const ref = doc(collection(db, "chats"));
    const chat = { id: ref.id, type: 'group', members };
    // Le groupe d'abord (les règles vérifient l'appartenance au groupe avant d'accepter un message)
    await setDoc(ref, {
        type: 'group', name, ...membershipFields(chat, members, [mine]), memberNames,
        createdBy: me(), createdByKey: mine, createdAt: serverTimestamp(),
        lastMessage: `${myName()} a créé le groupe`, lastSenderId: null, lastMessageTime: serverTimestamp(), hiddenFor: [],
        readAt: { [mine]: serverTimestamp() },
    });
    await setDoc(doc(collection(db, `chats/${ref.id}/messages`)), systemMessage(chat, `${myName()} a créé le groupe « ${name} »`));
    return ref.id;
}

/* ------------------------------------------------------------------ Infos et réglages d'une discussion */

function openInfoModal(chatId) {
    const modal = document.getElementById('chat-modal');
    const draw = () => {
        const chat = state.chats.find(c => c.id === chatId);
        if (!chat) { modal.classList.add('hidden'); return; }
        const mine = meIn(chat);
        const group = isGroup(chat);
        const legacy = !isProfileChat(chat);
        const admins = chat.admins || [];
        const amAdmin = group && admins.includes(mine);
        const muted = (chat.mutedBy || []).includes(mine);
        const pinned = (chat.pinnedBy || []).includes(mine);
        const other = group ? null : otherOf(chat);
        const keys = memberKeys(chat);
        const members = [...keys].sort((a, b) => Number(admins.includes(b)) - Number(admins.includes(a)) || nameOf(chat, a).localeCompare(nameOf(chat, b), 'fr'));
        modal.innerHTML = `
            <div class="modal-panel chat-modal-panel" role="dialog" aria-modal="true" aria-labelledby="chat-info-title">
                <div class="modal-body">
                    <div class="chat-modal-head">
                        <h3 class="modal-title" id="chat-info-title">${group ? 'Infos du groupe' : 'Infos de la discussion'}</h3>
                        <button type="button" class="chat-icon-btn" data-close aria-label="Fermer">✕</button>
                    </div>
                    <div class="chat-info-hero">
                        ${avatarHTML(chatTitle(chat), chat.id, group, 'is-lg')}
                        ${amAdmin
                            ? `<div class="chat-rename"><input id="rename-input" class="input" maxlength="60" value="${escapeHTML(chat.name || '')}" aria-label="Nom du groupe"><button type="button" class="btn btn-secondary" id="rename-btn">Renommer</button></div>`
                            : `<strong>${escapeHTML(chatTitle(chat))}</strong>`}
                        ${group ? `<small>${keys.length} membres</small>` : ''}
                        ${legacy ? '<small>Ancienne discussion : elle est partagée par tous les profils du compte. Les nouvelles discussions sont propres à chaque profil.</small>' : ''}
                    </div>
                    <div class="chat-toggles">
                        <button type="button" id="toggle-pin">${pinned ? '📌 Désépingler' : '📌 Épingler en haut'}</button>
                        <button type="button" id="toggle-mute">${muted ? '🔔 Réactiver les alertes' : '🔕 Mettre en sourdine'}</button>
                        ${other ? `<button type="button" id="toggle-block" class="is-wide${state.blocked.has(other) ? '' : ' is-danger'}">${state.blocked.has(other) ? `✅ Débloquer ${escapeHTML(nameOf(chat, other))}` : `🚫 Bloquer ${escapeHTML(nameOf(chat, other))}`}</button>` : ''}
                    </div>
                    ${group ? `
                        <div class="chat-section-title"><span>Membres</span>${amAdmin && !legacy ? '<button type="button" id="add-members">+ Ajouter</button>' : ''}</div>
                        <div class="chat-members">${members.map(k => `
                            <div class="chat-member">
                                ${avatarHTML(nameOf(chat, k), k, false, 'is-sm')}
                                <span>${escapeHTML(nameOf(chat, k))}${k === mine ? ' (vous)' : ''}</span>
                                ${admins.includes(k) ? '<em>admin</em>' : ''}
                                ${k !== mine ? `<button type="button" class="chat-member-act${state.blocked.has(k) ? '' : ' is-danger'}" data-block="${escapeHTML(k)}">${state.blocked.has(k) ? 'Débloquer' : 'Bloquer'}</button>` : ''}
                                ${amAdmin && k !== mine ? `
                                    <button type="button" class="chat-member-act" data-admin="${escapeHTML(k)}">${admins.includes(k) ? 'Retirer admin' : 'Nommer admin'}</button>
                                    <button type="button" class="chat-member-act is-danger" data-remove="${escapeHTML(k)}">Retirer</button>` : ''}
                            </div>`).join('')}</div>` : ''}
                </div>
                <div class="modal-footer">
                    ${group
                        ? '<button type="button" class="btn btn-danger" id="leave-group">Quitter le groupe</button>'
                        : '<button type="button" class="btn btn-secondary" id="hide-chat">Retirer de ma liste</button>'}
                    <button type="button" class="btn btn-primary" data-close>Fermer</button>
                </div>
            </div>`;
        const run = async (fn, errorText) => { try { await fn(); } catch (error) { console.error(error); showToast(errorText, 'warning'); } };
        const ref = doc(db, "chats", chat.id);
        modal.querySelector('#toggle-pin').onclick = () => run(() => updateDoc(ref, { pinnedBy: pinned ? arrayRemove(mine) : arrayUnion(mine) }), "Réglage non enregistré.");
        modal.querySelector('#toggle-mute').onclick = () => run(() => updateDoc(ref, { mutedBy: muted ? arrayRemove(mine) : arrayUnion(mine) }), "Réglage non enregistré.");
        modal.querySelector('#rename-btn')?.addEventListener('click', () => {
            const name = modal.querySelector('#rename-input').value.trim();
            if (!name || name === chat.name) return;
            run(async () => {
                await updateDoc(ref, { name });
                await sendToChat({ ...chat, name }, systemMessage(chat, `${myName()} a renommé le groupe en « ${name} »`));
            }, "Renommage impossible.");
        });
        modal.querySelector('#add-members')?.addEventListener('click', () => openAddMembers(chat, draw));
        modal.querySelector('#toggle-block')?.addEventListener('click', () => toggleBlock(other, nameOf(chat, other)).then(draw));
        modal.querySelectorAll('[data-block]').forEach(b => {
            b.onclick = () => toggleBlock(b.dataset.block, nameOf(chat, b.dataset.block)).then(draw);
        });
        modal.querySelectorAll('[data-admin]').forEach(b => {
            b.onclick = () => {
                const k = b.dataset.admin;
                const next = admins.includes(k) ? admins.filter(a => a !== k) : [...admins, k];
                const { admins: a, adminAccounts } = membershipFields(chat, keys, next);
                run(() => updateDoc(ref, adminAccounts ? { admins: a, adminAccounts } : { admins: a }), "Changement impossible.");
            };
        });
        modal.querySelectorAll('[data-remove]').forEach(b => {
            b.onclick = async () => {
                const k = b.dataset.remove;
                if (!await showConfirmationModal("Retirer du groupe", `Retirer ${nameOf(chat, k)} du groupe ?`)) return;
                run(async () => {
                    await sendToChat(chat, systemMessage(chat, `${myName()} a retiré ${nameOf(chat, k)}`));
                    await updateDoc(ref, {
                        ...membershipFields(chat, keys.filter(x => x !== k), admins.filter(x => x !== k)),
                        [`unreadCounts.${k}`]: deleteField(),
                    });
                }, "Impossible de retirer ce membre.");
            };
        });
        modal.querySelector('#leave-group')?.addEventListener('click', async () => {
            if (!await showConfirmationModal("Quitter le groupe", "Vous ne recevrez plus les messages de ce groupe.")) return;
            try {
                await sendToChat(chat, systemMessage(chat, `${myName()} a quitté le groupe`));
                const rest = keys.filter(k => k !== mine);
                // Dernier admin qui part : le groupe garde un admin (le plus ancien membre restant)
                const nextAdmins = amAdmin && !admins.some(k => k !== mine) && rest.length ? [rest[0]] : admins.filter(k => k !== mine);
                await updateDoc(ref, {
                    ...membershipFields(chat, rest, nextAdmins),
                    [`unreadCounts.${mine}`]: deleteField(),
                    // Les règles vérifient que c'est bien un profil de ce compte qui s'en va
                    ...(legacy ? {} : { leftBy: mine }),
                });
                modal.classList.add('hidden');
                closeChat();
            } catch (error) { console.error(error); showToast("Impossible de quitter le groupe.", 'warning'); }
        });
        modal.querySelector('#hide-chat')?.addEventListener('click', async () => {
            try {
                await updateDoc(ref, { hiddenFor: arrayUnion(mine) });
                modal.classList.add('hidden');
                closeChat();
            } catch (error) { console.error(error); showToast("Action impossible.", 'warning'); }
        });
    };
    state.redrawInfo = draw;
    modal.onclick = (e) => { if (e.target === modal || e.target.closest('[data-close]')) { modal.classList.add('hidden'); state.redrawInfo = null; } };
    modal.classList.remove('hidden');
    draw();
}

async function openAddMembers(chat, back) {
    const modal = document.getElementById('chat-modal');
    state.redrawInfo = null;
    const keys = memberKeys(chat);
    const candidates = (await loadPeople()).filter(p => !keys.includes(p.key));
    const selected = new Set();
    const goBack = () => { state.redrawInfo = back; back(); };
    modal.innerHTML = `
        <div class="modal-panel chat-modal-panel" role="dialog" aria-modal="true">
            <div class="modal-body">
                <div class="chat-modal-head"><h3 class="modal-title">Ajouter au groupe</h3><button type="button" class="chat-icon-btn" id="add-back" aria-label="Retour">✕</button></div>
                ${candidates.length > 8 ? '<input id="add-search" class="input chat-people-search" type="search" placeholder="Rechercher un collègue…">' : ''}
                <div class="chat-people" id="add-list"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" id="add-cancel">Annuler</button>
                <button type="button" class="btn btn-primary" id="add-confirm" disabled>Ajouter</button>
            </div>
        </div>`;
    const confirm = modal.querySelector('#add-confirm');
    const list = modal.querySelector('#add-list');
    const draw = () => {
        const term = (modal.querySelector('#add-search')?.value || '').trim().toLowerCase();
        const shown = candidates.filter(p => matchesPerson(p, term));
        list.innerHTML = !candidates.length ? '<p class="chat-empty">Toute l\'équipe fait déjà partie du groupe.</p>'
            : shown.length ? shown.map(p => personHTML(p, selected.has(p.key))).join('') : '<p class="chat-empty">Personne trouvé.</p>';
        list.querySelectorAll('[data-key]').forEach(b => {
            b.onclick = () => {
                selected.has(b.dataset.key) ? selected.delete(b.dataset.key) : selected.add(b.dataset.key);
                b.classList.toggle('is-selected');
                confirm.disabled = !selected.size;
            };
        });
    };
    modal.querySelector('#add-search')?.addEventListener('input', draw);
    draw();
    modal.querySelector('#add-back').onclick = goBack;
    modal.querySelector('#add-cancel').onclick = goBack;
    confirm.onclick = async () => {
        confirm.disabled = true;
        const added = candidates.filter(p => selected.has(p.key));
        const members = [...keys, ...added.map(p => p.key)];
        try {
            const update = membershipFields(chat, members, chat.admins || []);
            added.forEach(p => { update[`memberNames.${p.key}`] = p.name; });
            await updateDoc(doc(db, "chats", chat.id), update);
            await sendToChat({ ...chat, members }, systemMessage(chat, `${myName()} a ajouté ${added.map(p => p.name).join(', ')}`));
        } catch (error) { console.error(error); showToast("Ajout impossible.", 'warning'); }
        goBack();
    };
}

/* ------------------------------------------------------------------ Blocage (par profil) */

async function loadBlocked() {
    const profile = myProfileKey();
    try {
        const snap = await getDoc(doc(db, "users", me()));
        if (profile !== myProfileKey()) return; // profil changé entre-temps
        state.blocked = new Set(snap.data()?.chatBlocks?.[profile] || []);
        renderConversations();
        if (activeChat()) { renderHeader(activeChat()); renderMessages(false); }
    } catch (error) { console.warn(error); }
}

/**
 * Bloquer / débloquer un membre (clé de profil, ou uid dans une ancienne discussion) pour le profil actif :
 * ma liste « chatBlocks » + la discussion à deux, créée si besoin et cachée des deux côtés.
 */
async function toggleBlock(key, name, block = !state.blocked.has(key)) {
    const profile = myProfileKey();
    if (!key || key === profile || key === me()) return;
    if (block && !await showConfirmationModal(`Bloquer ${name}`,
        `${name} ne pourra plus vous écrire en privé, et vous non plus tant que vous ne l'aurez pas débloqué. Ses messages dans les groupes seront masqués pour vous.`)) return;
    const legacy = !key.includes('__'); // ancienne discussion : le membre est un compte
    const mine = legacy ? me() : profile;
    const members = [mine, key].sort();
    const chatId = legacy ? members.join('_') : `p_${members.join('--')}`;
    const existing = state.chats.find(c => c.id === chatId);
    try {
        const batch = writeBatch(db);
        batch.update(doc(db, "users", me()), { [`chatBlocks.${profile}`]: block ? arrayUnion(key) : arrayRemove(key) });
        if (existing) {
            batch.update(doc(db, "chats", chatId), { blockedBy: block ? arrayUnion(mine) : arrayRemove(mine), blockChangeBy: mine });
        } else if (block && !legacy) {
            batch.set(doc(db, "chats", chatId), {
                type: 'direct', members, participants: uniq(members.map(uidOfKey)),
                memberNames: { [mine]: myName(), [key]: name },
                lastMessageTime: serverTimestamp(), hiddenFor: members, blockedBy: [mine], blockChangeBy: mine,
            }, { merge: true });
        }
        await batch.commit();
        block ? state.blocked.add(key) : state.blocked.delete(key);
        showToast(block ? `${name} est bloqué.` : `${name} est débloqué.`);
        renderConversations();
        if (activeChat()) { renderHeader(activeChat()); renderMessages(false); }
    } catch (error) {
        console.error(error);
        showToast(block ? "Blocage impossible." : "Déblocage impossible.", 'warning');
    }
}
