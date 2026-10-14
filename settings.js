// Settings saved in chrome.storage.local (equivalent of SpeechPlugin.ini).

export const DEFAULTS = {
	voiceName: '',		// '' = default voice of the page language
	speed: 0,			// -10 (slow) .. +10 (fast), 0 = normal
	allowOnline: false,	// online voices send the text to a remote server
	followText: true,	// highlights the word being read and scrolls the page
	showBar: true,		// reading bar at the top of the page
	contextMenu: true,
	language: 'auto',	// 'auto', 'en' or 'fr'
};

export const MIN_SPEED = -10;
export const MAX_SPEED = 10;

export async function loadSettings() {
	return { ...DEFAULTS, ...await chrome.storage.local.get(Object.keys(DEFAULTS)) };
}

export function saveSettings(changes) {
	return chrome.storage.local.set(changes);
}

// -10..+10 => rate 0.33..3 (exponential, 1 = normal)
export function speedToRate(speed) {
	return Math.pow(3, speed / 10);
}

// Returns the voice to use, or '' if the saved voice is missing or not allowed
export async function resolveVoice(settings) {
	if (!settings.voiceName)
		return '';
	const voices = await chrome.tts.getVoices();
	const voice = voices.find(v => v.voiceName === settings.voiceName);
	if (!voice || (voice.remote && !settings.allowOnline))
		return '';
	return voice.voiceName;
}
