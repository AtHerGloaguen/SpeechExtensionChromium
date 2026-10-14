// Texts of the menus and of the settings popup, in English and French.
// Same idea as Texts.h in the Notepad++ plugin: "auto" follows the browser language.

const TEXTS = {
	en: {
		menuRoot: 'Speech',
		speakSelection: 'Speak selection',
		speakFromSelection: 'Speak from the selection',
		speakPage: 'Speak page',
		stop: 'Stop speech',
		pause: 'Pause',
		resume: 'Resume speech',
		playPause: 'Play / Pause',
		play: 'Play',
		previous: 'Previous sentence',
		next: 'Next sentence',
		closeBar: 'Close the reading bar',
		faster: 'Speak faster',
		slower: 'Speak slower',
		settings: 'Speech settings...',

		noSelection: 'Please select some text first.',
		noText: 'There is no text to read on this page.',
		cannotRead: 'This page cannot be read by the extension.',

		statusIdle: 'Ready',
		statusSpeaking: 'Speaking...',
		statusPaused: 'Paused',

		voice: 'Voice:',
		defaultVoice: '(Default voice of the page language)',
		onlineSuffix: ' - online',
		speed: 'Reading speed:',
		slowerLabel: 'Slower',
		fasterLabel: 'Faster',
		normal: 'Normal',
		test: 'Test',
		testSentence: 'This is the selected voice.',
		followText: 'Follow the reading (highlight and scroll)',
		showBar: 'Show the reading bar at the top of the page',
		allowOnline: 'Show online voices (Natural)',
		onlineWarning: 'Online voices send the text to Microsoft or Google servers to be spoken. Do not use them to read confidential data.',
		contextMenu: 'Show in the right-click menu',
		language: 'Menu language:',
		languageAuto: 'Automatic (browser language)',
		shortcuts: 'Keyboard shortcuts...',
	},
	fr: {
		menuRoot: 'Lecture vocale',
		speakSelection: 'Lire la sélection',
		speakFromSelection: 'Lire à partir de la sélection',
		speakPage: 'Lire la page',
		stop: 'Arrêter la lecture',
		pause: 'Pause',
		resume: 'Reprendre la lecture',
		playPause: 'Lecture / Pause',
		play: 'Lecture',
		previous: 'Phrase précédente',
		next: 'Phrase suivante',
		closeBar: 'Fermer la barre de lecture',
		faster: 'Lire plus vite',
		slower: 'Lire plus lentement',
		settings: 'Paramètres de lecture...',

		noSelection: "Veuillez d'abord sélectionner du texte.",
		noText: "Il n'y a pas de texte à lire sur cette page.",
		cannotRead: "Cette page ne peut pas être lue par l'extension.",

		statusIdle: 'Prêt',
		statusSpeaking: 'Lecture en cours...',
		statusPaused: 'En pause',

		voice: 'Voix :',
		defaultVoice: '(Voix par défaut de la langue de la page)',
		onlineSuffix: ' - en ligne',
		speed: 'Vitesse de lecture :',
		slowerLabel: 'Plus lent',
		fasterLabel: 'Plus rapide',
		normal: 'Normal',
		test: 'Tester',
		testSentence: 'Voici la voix sélectionnée.',
		followText: 'Suivre la lecture (surligner et faire défiler)',
		showBar: 'Afficher la barre de lecture en haut de la page',
		allowOnline: 'Afficher les voix en ligne (Natural)',
		onlineWarning: 'Les voix en ligne envoient le texte aux serveurs de Microsoft ou Google pour le lire. Ne les utilisez pas pour lire des données confidentielles.',
		contextMenu: 'Ajouter au menu clic droit',
		language: 'Langue des menus :',
		languageAuto: 'Automatique (langue du navigateur)',
		shortcuts: 'Raccourcis clavier...',
	},
};

export function resolveLanguage(setting) {
	if (setting === 'en' || setting === 'fr')
		return setting;
	return chrome.i18n.getUILanguage().toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function getTexts(setting) {
	return TEXTS[resolveLanguage(setting)];
}
