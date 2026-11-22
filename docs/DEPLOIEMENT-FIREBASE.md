# Firebase : ce qu'il faut faire pour les nouveautés reprises de la Pointeuse LPF

Projet Firebase : **pointeuse-ldpr**. Les étapes 1 et 2 suffisent pour que tout fonctionne ;
l'étape 3 nettoie seulement les vieilles photos.

## 1. Règles Firestore (console, 5 minutes)

Console Firebase → **Firestore Database** → **Règles** : **remplacer** tout le texte par le contenu de
`docs/firestore.rules`, puis **Publier** (ou en ligne de commande : `firebase deploy --only firestore:rules`).

Avant de publier, garder une copie des règles actuelles (onglet « Règles » → tout copier dans un fichier) :
en cas de souci, on recolle l'ancienne version. L'onglet « Règles » a aussi un historique des versions.

## 2. Photos avant / après (Firebase Storage)

1. Console → **Storage** → **Commencer** (formule **Blaze** nécessaire pour les nouveaux espaces de stockage).
2. Onglet **Règles** : coller le contenu de `storage.rules`, puis **Publier**
   (ou, en ligne de commande : `firebase deploy --only storage`).

Sans Storage, le pointage fonctionne quand même : seule la photo n'est pas envoyée (message « La photo n'a pas pu être envoyée »).

## 3. Suppression automatique des photos de plus de 6 mois (facultatif)

Sur un ordinateur avec Node.js 22 :

```bash
npm install -g firebase-tools
firebase login
cd functions && npm install && cd ..
firebase deploy --only functions
```

La fonction `cleanupOldPhotos` tourne le 2 de chaque mois à 4 h (heure de Paris).

## Ce qui n'a pas été repris

- **Notifications sur le téléphone** et **« Changer le mot de passe » d'un employé** : demandent d'autres
  Cloud Functions ; à faire plus tard si besoin.
- **Planification automatique**, **fiches équipe / super admin**, corrections d'adresses des chantiers LPF,
  recalcul des km : propres à la Pointeuse LPF ou non demandés.
- **Pointages privés** (un employé ne lit plus que ses pointages) : non activés, car la suggestion « tu étais
  avec lui ? » cherche le nom du profil chez les autres comptes.
