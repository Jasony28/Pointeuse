# Firebase : ce qu'il faut faire pour les nouveautés reprises de la Pointeuse LPF

Projet Firebase : **pointeuse-ldpr**. Une seule étape : les règles Firestore.

## Règles Firestore (console, 5 minutes)

Console Firebase → **Firestore Database** → **Règles** : **remplacer** tout le texte par le contenu de
`docs/firestore.rules`, puis **Publier** (ou en ligne de commande : `firebase deploy --only firestore:rules`).

Avant de publier, garder une copie des règles actuelles (onglet « Règles » → tout copier dans un fichier) :
en cas de souci, on recolle l'ancienne version. L'onglet « Règles » a aussi un historique des versions.

Sans ces règles, la page **Carburant** et les **Retours clients** ne peuvent probablement pas enregistrer.

Firebase Storage n'est pas utilisé : la photo du ticket de carburant est enregistrée dans Firestore
(collection pleinsPhotos), comme dans la Pointeuse LPF.

## Ce qui n'a pas été repris

- **Photos avant / après des pointages** : retirées pour l'instant, elles demandent Firebase Storage (formule Blaze).
- **Notifications sur le téléphone** et **« Changer le mot de passe » d'un employé** : demandent des Cloud Functions.
- **Planification automatique**, **fiches équipe / super admin**, corrections d'adresses des chantiers LPF,
  recalcul des km : propres à la Pointeuse LPF ou non demandés.
- **Pointages privés** (un employé ne lit plus que ses pointages) : non activés, car la suggestion « tu étais
  avec lui ? » cherche le nom du profil chez les autres comptes.
