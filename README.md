# Speech pour Edge / Chrome

Extension de lecture vocale, sur le modèle du plugin Notepad++ [NppSpeechPlugin](https://github.com/AtHerGloaguen/NppSpeechPlugin) :
elle lit à voix haute la sélection ou la page entière, avec la voix et la vitesse de votre choix.

## Fonctionnalités

- Lecture de la **sélection**, de la **page** (contenu principal de la page si elle en a un : article, `main`), ou **à partir de la sélection**
- Lecture **phrase par phrase** : **phrase précédente**, **phrase suivante**, lecture / pause, arrêt
- **Barre de lecture** en haut de la page (option) : phrase précédente, lecture / pause, phrase suivante, arrêt, vitesse, fermer
- **Choix de la voix** parmi les voix du navigateur et de Windows (*Microsoft Julie*, *Hortense*, *Paul*…)
- **Voix en ligne « Natural »** d'Edge (*Denise*, *Henri*, *Vivienne*… Online (Natural)) en option, voir [Confidentialité](#confidentialité)
- **Suivi de la lecture** : le mot lu est surligné en gris, la phrase en cours en gris plus léger, et la page défile toute seule pour garder le texte lu à l'écran
- **Vitesse de lecture** de -10 à +10 ; un changement pendant la lecture s'applique dès la phrase suivante
- Sous-menu **clic droit** optionnel
- **Raccourcis clavier**
- Menus en **français** ou en **anglais** (par défaut : la langue du navigateur)
- Sans voix choisie, la voix par défaut de la **langue de la page** est utilisée

## Installation (mode développeur)

1. Téléchargez `SpeechExtension_vX.Y.Z.zip` dans les [Releases](https://github.com/AtHerGloaguen/SpeechExtensionChromium/releases)
   et décompressez-le dans un dossier qui restera en place (par exemple `Documents\SpeechExtension`) :
   le navigateur charge l'extension depuis ce dossier à chaque démarrage.
2. Ouvrez `edge://extensions` (ou `chrome://extensions`).
3. Activez **Mode développeur** (en bas à gauche dans Edge, en haut à droite dans Chrome).
4. Cliquez sur **Charger l'extension décompressée** et choisissez le dossier décompressé (celui qui contient `manifest.json`).
5. Épinglez l'extension : icône puzzle 🧩 de la barre d'outils → œil / punaise à côté de *Speech*.

Pour mettre à jour : remplacez le contenu du dossier par celui de la nouvelle archive,
puis cliquez sur le bouton **Recharger** ↻ de l'extension dans `edge://extensions`. Les paramètres sont conservés.

## Publier une version

La CI GitHub (`.github/workflows/CI_build.yml`) vérifie les fichiers à chaque push.
Pour publier une Release avec l'archive `.zip`, changez `version` dans `manifest.json`, commitez, puis créez le tag correspondant :

```
git tag -a v1.0.1 -m "v1.0.1: ..."
git push origin v1.0.1
```

Le tag doit être `v` + la version du manifeste, sinon la CI refuse de publier.

## Utilisation

- **Icône de l'extension** : boutons *Lire la sélection*, *Lire la page*, ⏮ phrase précédente, ⏯ lecture / pause, ⏭ phrase suivante, ⏹ arrêter, et les paramètres.
- **Barre de lecture** : affichée en haut de la page dès qu'une lecture commence (⏮ ⏯ ⏭ ⏹, − vitesse +, ✕ fermer). Le bouton ✕ arrête la lecture et masque la barre.
- **Clic droit** → *Lecture vocale* : lire la sélection, lire à partir de la sélection, lire la page, lecture / pause, phrase précédente, phrase suivante, arrêter, plus vite, plus lentement, paramètres.

Le bouton **lecture / pause** met en pause et reprend. Si rien n'est en cours de lecture, il lit la page **à partir de la sélection** s'il y en a une, sinon depuis le début.
- **Raccourcis clavier** (modifiables dans `edge://extensions/shortcuts`) :

| Raccourci | Commande |
|---|---|
| Alt+Maj+S | Lire la sélection |
| Alt+Maj+D | Lire la page |
| Alt+Maj+P | Lecture / Pause |
| Alt+Maj+X | Arrêter la lecture |
| (à définir) | Lire à partir de la sélection, phrase précédente, phrase suivante, lire plus vite, lire plus lentement |

### Suivre la lecture

Avec l'option **Suivre la lecture (surligner et faire défiler)** (active par défaut) :

- le **mot** en cours de lecture est surligné en gris, la **phrase** en cours en gris léger ;
- la page **défile automatiquement** pour garder le texte lu vers le haut de l'écran ;
- si vous faites défiler la page vous-même (molette, clavier), le défilement automatique s'interrompt 4 secondes.

Le surlignage mot par mot dépend de la voix : si une voix ne signale pas les mots lus, c'est le passage en cours (une ou plusieurs phrases) qui est surligné.
Le texte sélectionné dans un champ de saisie, un PDF ou un cadre (iframe) est lu sans surlignage.

Pendant la lecture, l'icône affiche ▶ (ou II en pause).

Les paramètres s'appliquent immédiatement et sont enregistrés dans le profil du navigateur.

### Limites

Les pages internes du navigateur (`edge://`, boutique d'extensions) ne peuvent pas être lues. Dans un PDF ou un cadre (iframe),
utilisez le **clic droit → Lire la sélection**.

## Confidentialité

Par défaut, seules les **voix locales** sont proposées : la synthèse est faite par Windows, aucun texte ne quitte le poste.

Les voix **« Online (Natural) »** d'Edge sont de meilleure qualité, mais le texte est **envoyé aux serveurs de Microsoft**
(ou de Google pour les voix « Google » de Chrome) pour être lu. Elles n'apparaissent que si la case *Afficher les voix en ligne*
est cochée. Ne les utilisez pas pour lire des données confidentielles (données clients, dossiers…).

L'extension n'a accès à une page qu'au moment où vous lancez une lecture (permission `activeTab`) et n'envoie rien elle-même.

## Fichiers

| Fichier | Rôle |
|---|---|
| `manifest.json` | Déclaration de l'extension (Manifest V3), permissions, raccourcis |
| `background.js` | Lecture (`chrome.tts`), commandes, menu clic droit |
| `reader.js`, `reader.css` | Injectés dans la page : extraction du texte, surlignage et défilement |
| `popup.html/.js/.css` | Fenêtre de l'icône : boutons et paramètres |
| `settings.js` | Paramètres enregistrés et vitesse |
| `texts.js`, `_locales/` | Textes français / anglais |

## Licence

GPL v2 ou ultérieure, voir [LICENSE](LICENSE).
