export const updatesLog = [
    {
        version: 'v2.5.5',
        date: '25 novembre 2026',
        changes: [
            "**Suggestions « Étiez-vous avec cette personne ? »** : un double appui n'ajoute plus deux pointages, et la suggestion reste affichée si l'ajout échoue.",
            "**Saisie manuelle (admin)** : l'heure de fin doit être après le début, et la pause plus courte que le pointage.",
        ]
    },
    {
        version: 'v2.5.4',
        date: '25 novembre 2026',
        changes: [
            "**Diagnostic** (menu Plus) : vérifie ce que Firebase accepte pour votre compte (fiche, droits, messagerie) et donne un rapport à copier.",
        ]
    },
    {
        version: 'v2.5.3',
        date: '25 novembre 2026',
        changes: [
            "**Messagerie** : le message est envoyé en premier, puis l'aperçu de la discussion est mis à jour à part, pour qu'un refus sur l'aperçu n'empêche plus l'envoi.",
        ]
    },
    {
        version: 'v2.5.2',
        date: '25 novembre 2026',
        changes: [
            "**Chrono** : si l'arrêt n'a pas pu être enregistré (pas de réseau…), le chrono reste affiché pour réessayer, au lieu de disparaître en laissant le pointage « en cours ».",
            "**Historique (admin)** : « Réattribuer » propose bien les profils des employés et crée le pointage au bon compte.",
            "**Rapports admin** : les heures et coûts des comptes anciens sont de nouveau comptés.",
            "**Sécurité** : les notes et noms saisis s'affichent comme du texte, sans pouvoir modifier la page.",
        ]
    },
    {
        version: 'v2.5.1',
        date: '25 novembre 2026',
        changes: [
            "**Messagerie** : quand un message est refusé par Firebase (règles pas à jour), l'appli le dit au lieu de parler de connexion.",
        ]
    },
    {
        version: 'v2.5.0',
        date: '24 novembre 2026',
        changes: [
            "**Messagerie : bloquer quelqu'un** : dans les infos d'une discussion (ou depuis la liste des membres d'un groupe), touchez « Bloquer ». La discussion privée est fermée dans les deux sens et ses messages dans les groupes sont masqués pour vous. Le blocage est propre à chaque profil. « Débloquer » rétablit tout.",
        ]
    },
    {
        version: 'v2.4.1',
        date: '23 novembre 2026',
        changes: [
            "**Messagerie par profil** : chaque profil peut écrire à n'importe quel autre profil, y compris à un autre profil du même compte. Un message envoyé à Thomas n'apparaît plus chez Julie, même s'ils partagent le compte, et chaque profil a ses propres non-lus, épingles et sourdines.",
            "Les anciennes discussions restent lisibles ; elles sont encore partagées par tous les profils du compte.",
        ]
    },
    {
        version: 'v2.4.0',
        date: '22 novembre 2026',
        changes: [
            "**Retours clients** : la responsable peut signaler un chantier depuis un pointage de l'historique. Le profil concerné le voit sur son accueil, le lit et peut répondre (menu « Retours clients »).",
            "**Nouvelle messagerie** : groupes, réponses, réactions, « Vu », mentions, recherche, épingler, sourdine. Chaque message garde le nom du profil qui l'a écrit.",
            "**Historique** : « Cette année » et « Année dernière », avec un relevé d'heures annuel en PDF.",
            "**PDF** : tous au même style (rapport d'activité, planning, mon historique, chantiers, erreurs) ; nouveau « Rapport km en PDF » et export tableur dans le rapport trajets.",
            "**Rapports trajets et heures** refaits pour le téléphone, avec le détail par profil.",
            "**Thèmes** : Carnet, Aurore boréale, Sakura et Esprit de Noël.",
            "**Mises à jour** : la nouvelle version s'installe toute seule, sans rien demander, quand vous ne vous servez pas de l'appli.",
        ]
    },
    {
        version: 'v2.3.0',
        date: '22 novembre 2026',
        changes: [
            "**Carburant** : nouvelle page « Carburant » dans le menu (et bouton « J'ai fait le plein » sur l'accueil). Notez chaque plein : date, plaque de la voiture, litres, prix payé et photo de la pompe ou du ticket.",
            "**Rapport trajets** (admin) : coût carburant estimé d'après les km et le prix moyen du diesel et de l'essence en Belgique de la semaine, et liste des pleins notés avec leurs photos et le total par voiture.",
        ]
    },
    {
        version: 'v2.2.0',
        date: '15 novembre 2026',
        changes: [
            "**Nouveau thème Motocross Yamaha** : bleu racing, damier d'arrivée, piste de terre, traces de pneus et éclaboussures de boue. Une YZ450F n° 1 saute à travers l'écran, puis repasse en roue arrière avec un concurrent à ses trousses, et le panneau de stand donne les écarts. À choisir dans Paramètres → Thème.",
        ]
    },
    {
        version: 'v2.1.0',
        date: '1er novembre 2026',
        changes: [
            "**Thèmes - 4 nouvelles ambiances** : Chat (chat roux le jour, chat noir sous la lune la nuit), Cyber (graphite et néon vert), Nuit Étoilée (ciel animé, étoiles filantes, verre dépoli) et Arcade 8-bit (coucher de soleil rétro, pixels, ombres dures).",
            "**Thèmes de couleur** : chaque couleur a maintenant sa propre police de titres, ses arrondis, un halo de fond et un menu teinté.",
            "**Paramètres → Thème** : chaque choix montre un aperçu de l'appli dans ses couleurs, rangé en « Couleurs » et « Ambiances ».",
        ]
    },
    {
        version: 'v2.0.4',
        date: '27 octobre 2026',
        changes: [
            "**Ouverture plus rapide** : l'application s'ouvre sans attendre le serveur.",
            "Les messages (modifications de planning, nouveautés) s'affichent juste après l'ouverture au lieu de la retarder.",
            "Les outils PDF et graphiques ne sont plus chargés à chaque ouverture, seulement quand vous en avez besoin.",
        ]
    },
    {
        version: 'v2.0.3',
        date: '26 octobre 2026',
        changes: [
            "**Mes statistiques** : nouveau style, avec des flèches plus faciles à toucher pour changer de mois.",
            "**Admin - Planification** : nouveau style. La liste de l'équipe propose maintenant chaque profil (et plus seulement le compte), pour que chacun voie bien son planning.",
            "**Admin - Équipe** : fiches par compte, avec recherche, filtres et la liste des profils (historique, code et suppression de chaque profil).",
            "**Admin - Congés** : demandes plus lisibles, avec le statut en couleur et les boutons Refuser / Approuver.",
        ]
    },
    {
        version: 'v2.0.1',
        date: '26 octobre 2026',
        changes: [
            "**Code de profil** : vous pouvez protéger votre profil avec un code à 4 chiffres. Il sera demandé à quiconque veut passer sur votre profil. L'application vous le propose une fois ; ensuite, c'est dans les Paramètres.",
            "Code oublié ? Demandez à un administrateur : il peut le retrouver ou le retirer.",
            "Quand vous rouvrez l'application, vous restez sur votre profil : pas besoin de le choisir ni de retaper le code.",
        ]
    },
    {
        version: 'v2.0.0',
        date: '26 octobre 2026',
        changes: [
            "**Nouvelle interface** : l'application a été entièrement redessinée, pensée d'abord pour le téléphone. Toutes vos fonctions sont toujours là.",
            "**Barre d'onglets en bas** : Planning, Chantiers, Historique, Congés, et « Plus » pour le reste du menu.",
            "**Nouvelle animation au démarrage** et nouvelle icône de l'application.",
            "**Profils** : nouvel écran « Qui pointe aujourd'hui ? ». Le profil actif s'affiche en bas du menu, et le bouton « Changer de profil » est en haut des Paramètres.",
            "**Pointage** : minuteur repensé avec statut « en cours » ou « en pause », heure de démarrage et gros boutons Pause / Arrêter.",
            "**Mode sombre** : dans les Paramètres, choisissez Clair, Sombre ou Automatique, et votre couleur préférée.",
            "**Infos chantiers** : vos chantiers de la semaine apparaissent en premier, avec une recherche et des codes d'accès copiables d'un appui.",
            "**Admin - Erreurs** : nouvelle page qui liste les erreurs rencontrées par l'équipe dans l'application (avec le profil et le téléphone), pour les corriger plus vite.",
            "**Mises à jour plus simples** : quand une nouvelle version sort, une fenêtre « Nouvelle version disponible » s'affiche. Appuyez sur « Mettre à jour ».",
        ]
    },
    {
        version: 'v1.1.0',
        date: '13 août 2026',
        changes: [
            "🚀 **Chrono au centre** : Nouveau design avec un grand bouton central pour pointer plus vite.",
            "⚡ **Pointage ultra-rapide** : Options 'Conducteur' et 'Collègues' supprimées. Vous choisissez juste le chantier et c'est parti !",
            "📝 **Saisie manuelle** : L'ajout d'heures en cas d'oubli est maintenant un lien discret sous le chrono.",
            "👑 **Admin - Visibilité** : Ajout de badges prénoms dans l'historique et suivi en direct 100% compatible avec les multi-profils.",
            "🐛 **Bugs corrigés** : La suppression de profils et de pointages refonctionne normalement."
        ]
    },
    {
        version: 'v1.0.1',
        date: '9 août 2026',
        changes: [
            "⚠️ **TRÈS IMPORTANT - À LIRE AVANT DE POINTER** ⚠️",
            "La pointeuse fait peau neuve avec une mise à jour majeure de son fonctionnement. Prenez 1 minute pour lire ce qui suit :",
            "👥 **Nouveau Système de Profils** : Vous pouvez désormais avoir plusieurs profils sur un seul compte e-mail (comme sur Netflix) ! Idéal si vous partagez le même téléphone ou la même adresse.",
            "👆 **Écran de Sélection** : À l'ouverture de l'application, on vous demandera désormais *'Qui pointe aujourd'hui ?'*. Cliquez simplement sur votre prénom pour accéder à votre espace personnel.",
            "✅ **Pointage Auto-complété** : L'application sait maintenant qui vous êtes. Quand vous ajoutez un pointage, votre prénom sera déjà coché ! Assurez-vous d'être sur le bon profil.",
            "🔄 **Changer de collègue** : Vous voulez passer le téléphone à un collègue pour qu'il pointe ? Allez dans l'onglet **Paramètres** et cliquez sur le nouveau bouton **Changer de profil** sans avoir besoin de vous déconnecter.",
            "📊 **Historique Individuel** : Votre historique de pointages et de trajets est maintenant strictement personnel. Vous ne verrez que vos propres heures, même si vous partagez le compte !"
        ]
    }
];