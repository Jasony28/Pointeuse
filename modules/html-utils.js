// Petits outils d'affichage communs (mêmes que modules/work-profile.js de la Pointeuse LPF)
export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
