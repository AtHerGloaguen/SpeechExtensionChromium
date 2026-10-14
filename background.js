// Speech extension - service worker: reading, commands, right-click menu.

import { loadSettings, saveSettings, resolveVoice, speedToRate, MIN_SPEED, MAX_SPEED } from './settings.js';
import { getTexts, resolveLanguage } from './texts.js';

const MAX_SENTENCE = 250;	// longer sentences are cut at a space

// Word before a period which does not end the sentence: initial (J. Dupont) or abbreviation (M. Dupont)
const ABBREVIATION = /(?:^|[\s(])(?:[A-Z]|M|MM|Mme|Mmes|Mlle|Dr|Pr|Me|St|Ste|Mr|Mrs|Ms|Jr|Sr|cf|ex|p|art|av|bd|vol|vs|No|n°)$/;

// Reading state. The text is spoken sentence by sentence: a speed change applies from
// the next sentence, and the reading can move to the previous or next sentence.
let readingText = '';
let sentences = [];			// { start, end, text }, positions in readingText
let sentenceIndex = 0;
let utteranceId = 0;		// incremented on each chrome.tts.speak() and stop, to ignore late events
let readingVoice = '';
let readingLang = '';
let readingTab = null;		// tab where reader.js runs (highlight, reading bar), or null
let follow = false;			// highlight and scroll in readingTab
let status = 'idle';		// 'idle', 'speaking' or 'paused'
let keepAliveTimer = null;

// ---------------------------------------------------------------------------
// Settings cache
// ---------------------------------------------------------------------------

let settingsCache = null;

async function getSettings() {
	if (!settingsCache)
		settingsCache = await loadSettings();
	return settingsCache;
}

chrome.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local')
		return;
	settingsCache = null;
	if ('contextMenu' in changes || 'language' in changes)
		buildContextMenu();
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// Splits text[from..to) in sentences, cut at sentence ends and line breaks
function splitSentences(text, from = 0, to = text.length) {
	const result = [];

	const add = (start, end) => {
		while (start < end && /\s/.test(text[start]))
			start++;
		while (end > start && /\s/.test(text[end - 1]))
			end--;
		if (start < end)
			result.push({ start, end, text: text.slice(start, end) });
	};

	const addSentence = (start, end) => {
		while (end - start > MAX_SENTENCE) {
			let cut = text.lastIndexOf(' ', start + MAX_SENTENCE);
			if (cut < start + MAX_SENTENCE / 2)
				cut = start + MAX_SENTENCE;
			add(start, cut);
			start = cut;
		}
		add(start, end);
	};

	// End punctuation, possibly followed by closing quotes or brackets (French: « citée. »), then a space
	const separator = /[.!?…]+(?: ?[»"”')\]])*(?=\s)|\n/g;
	separator.lastIndex = from;
	let position = from;
	for (let match; (match = separator.exec(text)) && match.index < to;) {
		if (match[0] === '.' && ABBREVIATION.test(text.slice(Math.max(0, match.index - 5), match.index)))
			continue;
		const end = Math.min(to, match.index + match[0].length);
		addSentence(position, end);
		position = end;
	}
	addSentence(position, to);
	return result;
}

function sendToTab(message) {
	if (readingTab !== null)
		chrome.tabs.sendMessage(readingTab, message).catch(() => {});	// tab closed or page changed
}

function setStatus(newStatus) {
	status = newStatus;

	chrome.action.setBadgeBackgroundColor({ color: '#0063B1' });
	chrome.action.setBadgeText({ text: status === 'speaking' ? '▶' : status === 'paused' ? 'II' : '' });

	// The service worker can be stopped after 30 s without extension events:
	// keep it alive while reading or paused, so that the remaining text is not lost.
	if (status === 'idle') {
		clearInterval(keepAliveTimer);
		keepAliveTimer = null;
	}
	else if (!keepAliveTimer)
		keepAliveTimer = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);

	sendToTab({ type: 'speech-status', status });
	chrome.runtime.sendMessage({ type: 'status', status }).catch(() => {});
}

// Reads text from the sentence containing startOffset. The sentences before it are kept,
// so that "previous sentence" can go back before the starting point.
async function speakText(text, lang, tabId = null, mapped = false, startOffset = 0) {
	stopSpeech();
	const id = utteranceId;

	const settings = await getSettings();
	const voice = await resolveVoice(settings);
	if (id !== utteranceId)
		return;

	readingText = text;
	sentences = startOffset > 0 ?
		[...splitSentences(text, 0, startOffset), ...splitSentences(text, startOffset)] :
		splitSentences(text);
	sentenceIndex = startOffset > 0 ? sentences.findIndex(s => s.start >= startOffset) : 0;
	if (sentenceIndex < 0)
		sentenceIndex = sentences.length;
	readingVoice = voice;
	readingLang = lang || '';
	readingTab = tabId;
	follow = settings.followText && mapped && tabId !== null;
	if (sentenceIndex >= sentences.length) {
		stopSpeech();
		return;
	}

	setStatus('speaking');
	speakSentence();
}

async function speakSentence() {
	const id = ++utteranceId;
	const settings = await getSettings();	// read each time: the speed can change while reading
	if (id !== utteranceId)
		return;

	const sentence = sentences[sentenceIndex];
	if (follow)
		sendToTab({ type: 'speech-highlight', sentenceStart: sentence.start, sentenceEnd: sentence.end });

	const options = {
		rate: speedToRate(settings.speed),
		enqueue: false,
		onEvent: event => {
			if (id !== utteranceId)
				return;
			if (event.type === 'word' && follow)
				highlightWord(sentence, sentence.start + event.charIndex, event.length);
			else if (event.type === 'end') {
				if (++sentenceIndex < sentences.length)
					speakSentence();
				else
					stopSpeech();
			}
			else if (event.type === 'error') {
				console.warn('Speech error:', event.errorMessage);
				stopSpeech();
			}
		},
	};
	if (readingVoice)
		options.voiceName = readingVoice;
	else if (readingLang)
		options.lang = readingLang;

	chrome.tts.speak(sentence.text, options, () => {
		if (chrome.runtime.lastError && id === utteranceId) {
			console.warn('Speech error:', chrome.runtime.lastError.message);
			stopSpeech();
		}
	});
}

// Highlights the word being spoken and its sentence
function highlightWord(sentence, start, length) {
	if (!length) {
		const word = readingText.slice(start).match(/^\S+/);
		length = word ? word[0].length : 1;
	}
	sendToTab({
		type: 'speech-highlight',
		sentenceStart: sentence.start, sentenceEnd: sentence.end,
		wordStart: start, wordEnd: start + length,
	});
}

// Stops the speech in progress. chrome.tts keeps its pause state and would not speak
// the next text, hence the resume.
function interruptSpeech() {
	utteranceId++;
	chrome.tts.stop();
	if (status === 'paused')
		chrome.tts.resume();
}

function stopSpeech() {
	interruptSpeech();
	sendToTab({ type: 'speech-clear' });
	if (status !== 'idle')
		setStatus('idle');
	readingTab = null;
	follow = false;
	readingText = '';
	sentences = [];
	sentenceIndex = 0;
}

function pauseResume() {
	if (status === 'speaking') {
		chrome.tts.pause();
		setStatus('paused');
	}
	else if (status === 'paused') {
		chrome.tts.resume();
		setStatus('speaking');
	}
}

// Previous (-1) or next (+1) sentence; "previous" at the first sentence restarts it
function moveSentence(delta) {
	if (status === 'idle')
		return;
	const index = Math.min(sentences.length - 1, Math.max(0, sentenceIndex + delta));
	if (delta > 0 && index === sentenceIndex)
		return;		// already the last sentence
	interruptSpeech();
	sentenceIndex = index;
	setStatus('speaking');
	speakSentence();
}

async function changeSpeed(delta) {
	const settings = await getSettings();
	const speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, settings.speed + delta));
	if (speed !== settings.speed)
		await saveSettings({ speed });
	return speed;
}

// Speaks a message of the extension (no selection, page not readable...)
async function speakMessage(key) {
	const settings = await getSettings();
	await speakText(getTexts(settings.language)[key], resolveLanguage(settings.language));
	return { error: key };
}

// ---------------------------------------------------------------------------
// Text of the page
// ---------------------------------------------------------------------------

// Injects reader.js in the page and gets the text to read:
// 'selection', 'page', or 'from-selection' (the page, from the selection if there is one)
async function prepareInPage(tab, mode) {
	if (!tab || tab.id === undefined || tab.id < 0)
		return null;
	const settings = await getSettings();
	const texts = getTexts(settings.language);
	const options = {
		follow: settings.followText,
		showBar: settings.showBar,
		labels: {
			previous: texts.previous, play: texts.play, pause: texts.pause, next: texts.next,
			stop: texts.stop, slower: texts.slower, faster: texts.faster, close: texts.closeBar,
		},
	};
	try {
		const target = { tabId: tab.id };
		const [installed] = await chrome.scripting.executeScript({ target, func: () => !!window.__speechReader });
		if (!installed.result) {
			await chrome.scripting.insertCSS({ target, files: ['reader.css'] });
			await chrome.scripting.executeScript({ target, files: ['reader.js'] });
		}
		const [injection] = await chrome.scripting.executeScript({
			target,
			func: (mode, options) => window.__speechReader.prepare(mode, options),
			args: [mode, options],
		});
		return injection ? injection.result : null;
	}
	catch (e) {
		// Pages of the browser (edge://, chrome://, store), PDF viewer...
		console.warn('Cannot access the page:', e.message);
		return null;
	}
}

async function speakFromPage(tab, mode, selectionText) {
	const result = await prepareInPage(tab, mode);
	if (result && result.text.trim())
		await speakText(result.text, result.lang, tab.id, result.mapped, result.start);
	else if (mode !== 'page' && selectionText && selectionText.trim())	// given by the right-click menu, also works in frames and PDF files
		await speakText(selectionText, result ? result.lang : '');
	else if (!result)
		return speakMessage('cannotRead');
	else
		return speakMessage(mode === 'selection' ? 'noSelection' : 'noText');
	return {};
}

async function getActiveTab() {
	const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
	return tab;
}

async function testVoice() {
	const settings = await getSettings();
	await speakText(getTexts(settings.language).testSentence, resolveLanguage(settings.language));
}

// ---------------------------------------------------------------------------
// Commands (popup, reading bar, keyboard shortcuts, right-click menu)
// ---------------------------------------------------------------------------

async function runCommand(command, tab, selectionText) {
	switch (command) {
		case 'speak-selection': return speakFromPage(tab || await getActiveTab(), 'selection', selectionText);
		case 'speak-from-selection': return speakFromPage(tab || await getActiveTab(), 'from-selection', selectionText);
		case 'speak-page': return speakFromPage(tab || await getActiveTab(), 'page');
		case 'pause-resume':	// play / pause: when nothing is read, reads from the selection
			if (status === 'idle')
				return speakFromPage(tab || await getActiveTab(), 'from-selection', selectionText);
			pauseResume();
			break;
		case 'previous': moveSentence(-1); break;
		case 'next': moveSentence(+1); break;
		case 'stop': stopSpeech(); break;
		case 'faster': await changeSpeed(+1); break;
		case 'slower': await changeSpeed(-1); break;
		case 'test': await testVoice(); break;
		case 'settings': chrome.runtime.openOptionsPage(); break;
	}
	return {};
}

chrome.commands.onCommand.addListener((command, tab) => {
	runCommand(command, tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === 'getStatus')
		sendResponse({ status });
	else if (message.type === 'command')	// from the popup (no tab) or the reading bar of a page
		runCommand(message.command, sender.tab).then(sendResponse);
	else
		return false;
	return true;
});

// ---------------------------------------------------------------------------
// Right-click menu
// ---------------------------------------------------------------------------

let menuUpdate = Promise.resolve();

function buildContextMenu() {
	menuUpdate = menuUpdate.then(async () => {
		await chrome.contextMenus.removeAll();
		const settings = await loadSettings();
		if (!settings.contextMenu)
			return;

		const texts = getTexts(settings.language);
		const items = [
			{ id: 'speak-selection', title: texts.speakSelection, contexts: ['selection'] },
			{ id: 'speak-from-selection', title: texts.speakFromSelection, contexts: ['selection'] },
			{ id: 'speak-page', title: texts.speakPage, contexts: ['page', 'frame'] },
			{ id: 'separator1', type: 'separator' },
			{ id: 'pause-resume', title: texts.playPause },
			{ id: 'previous', title: texts.previous },
			{ id: 'next', title: texts.next },
			{ id: 'stop', title: texts.stop },
			{ id: 'separator2', type: 'separator' },
			{ id: 'faster', title: texts.faster },
			{ id: 'slower', title: texts.slower },
			{ id: 'separator3', type: 'separator' },
			{ id: 'settings', title: texts.settings },
		];
		chrome.contextMenus.create({ id: 'root', title: texts.menuRoot, contexts: ['all'] });
		for (const item of items)
			chrome.contextMenus.create({ contexts: ['all'], ...item, parentId: 'root' });
	}).catch(e => console.warn('Context menu:', e.message));
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
	runCommand(info.menuItemId, tab, info.selectionText);
});

chrome.runtime.onInstalled.addListener(buildContextMenu);
chrome.runtime.onStartup.addListener(buildContextMenu);
