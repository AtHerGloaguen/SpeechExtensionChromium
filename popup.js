// Speech extension - popup: reading buttons and settings (applied immediately).

import { loadSettings, saveSettings } from './settings.js';
import { getTexts } from './texts.js';

const $ = id => document.getElementById(id);

let settings;
let texts;
let status = 'idle';

function sendCommand(command) {
	return chrome.runtime.sendMessage({ type: 'command', command });
}

function applyTexts() {
	texts = getTexts(settings.language);
	document.documentElement.lang = settings.language === 'auto' ? chrome.i18n.getUILanguage() : settings.language;
	for (const element of document.querySelectorAll('[data-text]'))
		element.textContent = texts[element.dataset.text];
	showStatus();
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/></svg>';

function setLabel(button, label) {
	button.title = label;
	button.setAttribute('aria-label', label);
}

function showStatus() {
	// Play / pause: when nothing is read, reads the page from the selection
	const playPause = $('pause-resume');
	playPause.innerHTML = status === 'speaking' ? PAUSE_ICON : PLAY_ICON;
	setLabel(playPause, status === 'speaking' ? texts.pause : status === 'paused' ? texts.resume : texts.play);
	setLabel($('previous'), texts.previous);
	setLabel($('next'), texts.next);
	setLabel($('stop'), texts.stop);
	for (const id of ['previous', 'next', 'stop'])
		$(id).disabled = status === 'idle';
	$('status').textContent = status === 'speaking' ? texts.statusSpeaking :
		status === 'paused' ? texts.statusPaused : texts.statusIdle;
}

function showSpeed() {
	$('speed').value = settings.speed;
	$('speed-value').textContent = settings.speed > 0 ? '+' + settings.speed : String(settings.speed);
}

async function fillVoices() {
	const voices = (await chrome.tts.getVoices())
		.filter(v => v.voiceName && (settings.allowOnline || !v.remote))
		.sort((a, b) => (a.lang || '').localeCompare(b.lang || '') || a.voiceName.localeCompare(b.voiceName));

	const select = $('voice');
	select.replaceChildren(new Option(texts.defaultVoice, ''));
	for (const voice of voices) {
		const label = voice.voiceName + (voice.lang ? ` (${voice.lang})` : '') + (voice.remote ? texts.onlineSuffix : '');
		select.add(new Option(label, voice.voiceName));
	}
	select.value = voices.some(v => v.voiceName === settings.voiceName) ? settings.voiceName : '';
	$('online-warning').hidden = !settings.allowOnline;
}

async function update(changes) {
	Object.assign(settings, changes);
	await saveSettings(changes);
}

async function init() {
	settings = await loadSettings();
	applyTexts();
	showSpeed();
	$('allow-online').checked = settings.allowOnline;
	$('follow-text').checked = settings.followText;
	$('show-bar').checked = settings.showBar;
	$('context-menu').checked = settings.contextMenu;
	$('language').value = settings.language;
	await fillVoices();

	const response = await chrome.runtime.sendMessage({ type: 'getStatus' }).catch(() => null);
	if (response) {
		status = response.status;
		showStatus();
	}

	for (const id of ['speak-selection', 'speak-page', 'pause-resume', 'previous', 'next', 'stop', 'test'])
		$(id).addEventListener('click', () => sendCommand(id));

	$('voice').addEventListener('change', () => update({ voiceName: $('voice').value }));

	$('allow-online').addEventListener('change', async () => {
		await update({ allowOnline: $('allow-online').checked });
		await fillVoices();
		if ($('voice').value !== settings.voiceName)
			await update({ voiceName: $('voice').value });
	});

	$('speed').addEventListener('input', async () => {
		await update({ speed: Number($('speed').value) });
		showSpeed();
	});

	$('normal').addEventListener('click', async () => {
		await update({ speed: 0 });
		showSpeed();
	});

	$('follow-text').addEventListener('change', () => update({ followText: $('follow-text').checked }));

	$('show-bar').addEventListener('change', () => update({ showBar: $('show-bar').checked }));

	$('context-menu').addEventListener('change', () => update({ contextMenu: $('context-menu').checked }));

	$('language').addEventListener('change', async () => {
		await update({ language: $('language').value });
		applyTexts();
		await fillVoices();
	});

	$('shortcuts').addEventListener('click', () => {
		const isEdge = navigator.userAgent.includes('Edg/');
		chrome.tabs.create({ url: isEdge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts' });
	});

	chrome.runtime.onMessage.addListener(message => {
		if (message.type === 'status') {
			status = message.status;
			showStatus();
		}
	});

	// Speed changed by a keyboard shortcut while the popup is open
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'local' && changes.speed) {
			settings.speed = changes.speed.newValue;
			showSpeed();
		}
	});
}

init();
