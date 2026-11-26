# Fiches de contrôle (v2.6.0)

Même fonctionnement que la Pointeuse LPF (v4.17) : une fiche « Les Petites Fées de Marche / Contrôle journalier »
par chantier et par jour, remplie sur place par une personne de l'équipe, à tour de rôle.

- **Réglage** : Admin → Chantiers → modifier → « Fiche de contrôle » (modèle A1 / A2 / B1, zone, lignes hors
  prestation), ou Admin → Fiches de contrôle → « Classer les chantiers ». Enregistré dans `chantiers/{id}.ficheControle`.
- **Rotation** : au début du pointage, le profil est inscrit sur `fichesControle/{chantierId}_{AAAA-MM-JJ}` ; la fiche
  va à celui qui l'a remplie il y a le plus longtemps sur ce chantier (`fichesRotation/{chantierId}.derniers`).
- **Profils partagés** : ici plusieurs profils peuvent utiliser le même compte. La personne est reconnue par son
  **nom de profil** (`responsableNom`, `presents`) et le compte par son uid (`responsableUid`, pour les règles).
- **Sortie** : le profil désigné ne peut pas arrêter son pointage tant que la fiche n'est pas validée.
- **Admin** : page « Fiches de contrôle » (aperçu et PDF à télécharger) ; résumé et alertes « Point à revoir » sur le
  tableau de bord. Pas d'envoi automatique au client (contrairement à LPF) : on télécharge le PDF.
- **PDF** : `assets/fiches/{A1,A2,B1}.pdf` (PDF d'origine) remplis avec pdf-lib par `remplirPdf()`.
- **Règles Firestore** : bloc 12 de `docs/firestore.rules`, à publier dans la console Firebase (projet pointeuse-ldpr).
- **Tests** : `node --test tests/fiches-controle.test.mjs`.
