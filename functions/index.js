// Cloud Functions de la Pointeuse (projet pointeuse-ldpr), reprises de la Pointeuse LPF.
// Déploiement : voir docs/DEPLOIEMENT-FIREBASE.md (firebase deploy --only functions).
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { initializeApp } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

initializeApp();
setGlobalOptions({ region: 'us-central1', memory: '256MiB', minInstances: 0, maxInstances: 2, timeoutSeconds: 60 });

const TIME_ZONE = 'Europe/Paris';
const PHOTO_MONTHS_KEPT = 6;

// Photos avant / après des pointages (Firebase Storage, photos/AAAA-MM/uid/…) : gardées 6 mois.
// Le 2 de chaque mois à 4 h, les dossiers de mois plus anciens sont supprimés.
exports.cleanupOldPhotos = onSchedule({ schedule: '0 4 2 * *', timeZone: TIME_ZONE }, async () => {
    const bucket = getStorage().bucket();
    const [, , apiResponse] = await bucket.getFiles({ prefix: 'photos/', delimiter: '/', autoPaginate: false });
    const limit = new Date();
    limit.setMonth(limit.getMonth() - PHOTO_MONTHS_KEPT);
    const oldestKept = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}`;
    const oldMonths = (apiResponse?.prefixes || []).map(p => p.slice('photos/'.length, -1)).filter(m => /^\d{4}-\d{2}$/.test(m) && m < oldestKept);
    for (const month of oldMonths) {
        await bucket.deleteFiles({ prefix: `photos/${month}/` });
        logger.info('Photos supprimées', { mois: month });
    }
});
