importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const { precaching, routing, strategies, core } = workbox;
core.setCacheNameDetails({ prefix: 'pointeuse-cache' });

// Version synchronisée avec app.js
const APP_VERSION = 'v2.5.5'; // <--- À changer à chaque nouvelle version (avec app.js)

precaching.precacheAndRoute([
    { url: './', revision: APP_VERSION },
    { url: 'index.html', revision: APP_VERSION },
    { url: 'app.js', revision: APP_VERSION },
    { url: 'splash.js', revision: APP_VERSION },
    { url: 'styles/app.css', revision: APP_VERSION },
    { url: 'manifest.json', revision: APP_VERSION },

    // Thème « Chat »
    { url: 'themes/chat/chat-assis-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-assis-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-coucou-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-coucou-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-dodo-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/chat-dodo-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/etoiles.svg', revision: APP_VERSION },
    { url: 'themes/chat/motif-pattes-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/motif-pattes-nuit.svg', revision: APP_VERSION },
    { url: 'themes/chat/patte.svg', revision: APP_VERSION },
    { url: 'themes/chat/pelote-jour.svg', revision: APP_VERSION },
    { url: 'themes/chat/pelote-nuit.svg', revision: APP_VERSION },
    { url: 'themes/noel/traineau.svg', revision: APP_VERSION },
    { url: 'themes/noel/lutin-cadeau.svg', revision: APP_VERSION },
    { url: 'themes/noel/lutin-sucre-orge.svg', revision: APP_VERSION },
    { url: 'themes/noel/pere-noel-coucou.svg', revision: APP_VERSION },
    { url: 'themes/noel/guirlande.svg', revision: APP_VERSION },
    { url: 'themes/noel/paysage.svg', revision: APP_VERSION },
    { url: 'themes/noel/bonnet.svg', revision: APP_VERSION },
    { url: 'themes/noel/houx.svg', revision: APP_VERSION },
    { url: 'themes/noel/noeud.svg', revision: APP_VERSION },
    { url: 'themes/noel/boules.svg', revision: APP_VERSION },
    { url: 'themes/noel/cadeau-parachute.svg', revision: APP_VERSION },
    { url: 'themes/noel/lutins-banniere.svg', revision: APP_VERSION },
    { url: 'themes/motocross/moto.svg', revision: APP_VERSION },
    { url: 'themes/motocross/piste.svg', revision: APP_VERSION },
    { url: 'themes/motocross/drapeau.svg', revision: APP_VERSION },
    { url: 'themes/motocross/boue.svg', revision: APP_VERSION },
    { url: 'themes/motocross/traces.svg', revision: APP_VERSION },

    // Modules principaux
    { url: 'modules/utils.js', revision: APP_VERSION },
    { url: 'modules/data-service.js', revision: APP_VERSION },
    { url: 'modules/updates-data.js', revision: APP_VERSION },
    { url: 'modules/settings.js', revision: APP_VERSION },
    { url: 'modules/chantiers.js', revision: APP_VERSION },
    { url: 'modules/libs.js', revision: APP_VERSION },
    { url: 'modules/pdf-kit.js', revision: APP_VERSION },
    { url: 'modules/native-files.js', revision: APP_VERSION },
    { url: 'modules/html-utils.js', revision: APP_VERSION },
    { url: 'modules/retours-clients.js', revision: APP_VERSION },
    { url: 'modules/chantiers-pdf.js', revision: APP_VERSION },

    // Modules Utilisateur
    { url: 'modules/user-dashboard.js', revision: APP_VERSION },
    { url: 'modules/user-history.js', revision: APP_VERSION },
    { url: 'modules/user-leave.js', revision: APP_VERSION },
    { url: 'modules/user-stats.js', revision: APP_VERSION },
    { url: 'modules/user-chat.js', revision: APP_VERSION },
    { url: 'modules/diagnostic.js', revision: APP_VERSION },
    { url: 'modules/chat-keys.js', revision: APP_VERSION },
    { url: 'modules/user-retours.js', revision: APP_VERSION },
    { url: 'modules/user-fuel.js', revision: APP_VERSION },
    { url: 'modules/pleins.js', revision: APP_VERSION },
    { url: 'modules/fuel-cost.js', revision: APP_VERSION },

    // Modules Admin
    { url: 'modules/admin-chantiers.js', revision: APP_VERSION },
    { url: 'modules/admin-chantier-details.js', revision: APP_VERSION },
    { url: 'modules/admin-contracts.js', revision: APP_VERSION },
    { url: 'modules/admin-dashboard.js', revision: APP_VERSION },
    { url: 'modules/admin-hours-report.js', revision: APP_VERSION },
    { url: 'modules/admin-invoicing.js', revision: APP_VERSION },
    { url: 'modules/admin-leave.js', revision: APP_VERSION },
    { url: 'modules/admin-planning.js', revision: APP_VERSION },
    { url: 'modules/admin-team.js', revision: APP_VERSION },
    { url: 'modules/admin-travel-report.js', revision: APP_VERSION },
    { url: 'modules/admin-live-view.js', revision: APP_VERSION },
    { url: 'modules/admin-site-requests.js', revision: APP_VERSION },
    { url: 'modules/admin-errors.js', revision: APP_VERSION },
    { url: 'modules/admin-retours.js', revision: APP_VERSION },

    // Ressources statiques
    { url: 'icons/pointeuse-192.png', revision: APP_VERSION },
    { url: 'icons/pointeuse-180.png', revision: APP_VERSION },
    { url: 'icons/pointeuse-512.png', revision: APP_VERSION },
]);

// Stratégie pour les pages HTML
routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new strategies.NetworkFirst({ cacheName: 'pages' })
);

// Stratégie pour les polices Google Fonts
routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
    new strategies.StaleWhileRevalidate({
        cacheName: 'google-fonts',
    })
);

// Bibliothèques externes (Firebase, Tailwind, Chart.js, PDF…) : gardées sur le téléphone pour démarrer sans réseau
const LIB_HOSTS = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'unpkg.com', 'storage.googleapis.com', 'cdnjs.cloudflare.com'];
routing.registerRoute(
    ({ url }) => LIB_HOSTS.includes(url.hostname),
    new strategies.StaleWhileRevalidate({ cacheName: 'cdn-assets' })
);

// Fichiers de l'appli non listés plus haut (autres modules, images) : gardés après la première visite
routing.registerRoute(
    ({ url, request }) => url.origin === self.location.origin && ['script', 'style', 'image'].includes(request.destination),
    new strategies.StaleWhileRevalidate({ cacheName: 'app-files' })
);

// Nouvelle version : activée dès qu'elle est téléchargée, sans rien demander. Les téléphones qui ont encore
// l'ancien bandeau « Mettre à jour / Plus tard » ne le voient pas : il n'a pas le temps de s'afficher.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});
