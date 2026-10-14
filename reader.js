// Speech extension - injected in the page when a reading starts.
// Extracts the text to read while remembering which text node each character comes from,
// so that the word being spoken can be highlighted and kept visible.

(() => {
	if (window.__speechReader)
		return;

	const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT']);
	const USER_SCROLL_DELAY = 4000;	// no automatic scrolling during 4 s after the user scrolls

	let segments = [];		// { node, start, end, nodeStart }: text[start..end) = node.data[nodeStart..]
	let lastUserScroll = 0;

	// -----------------------------------------------------------------------
	// Text extraction
	// -----------------------------------------------------------------------

	function collectText(root, range) {
		const blockCache = new Map();
		const isBlock = element => {
			let block = blockCache.get(element);
			if (block === undefined) {
				const display = getComputedStyle(element).display;
				block = !display.startsWith('inline') && display !== 'contents';
				blockCache.set(element, block);
			}
			return block;
		};
		const blockOf = node => {
			let element = node.parentElement;
			while (element && element !== root && !isBlock(element))
				element = element.parentElement;
			return element || root;
		};

		const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					if (SKIPPED_TAGS.has(node.tagName) ||
						(node.checkVisibility && !node.checkVisibility({ visibilityProperty: true })))
						return NodeFilter.FILTER_REJECT;		// skips the whole subtree
					if (node.tagName !== 'BR')
						return NodeFilter.FILTER_SKIP;
				}
				if (range && !range.intersectsNode(node))
					return NodeFilter.FILTER_SKIP;
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		let text = '';
		let lastBlock = null;
		segments = [];

		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (node.nodeType === Node.ELEMENT_NODE) {	// <br>
				text += '\n';
				continue;
			}

			let start = 0;
			let end = node.data.length;
			if (range && node === range.startContainer)
				start = range.startOffset;
			if (range && node === range.endContainer)
				end = range.endOffset;
			const data = node.data.slice(start, end);

			if (!data.trim()) {
				if (text && !/\s$/.test(text))
					text += ' ';
				continue;
			}

			const block = blockOf(node);
			if (lastBlock && block !== lastBlock && !/\n$/.test(text))
				text += '\n';
			lastBlock = block;

			// Whitespace replaced one for one: the positions in the text and in the node stay the same
			segments.push({ node, start: text.length, end: text.length + data.length, nodeStart: start });
			text += data.replace(/\s/g, ' ');
		}
		return text;
	}

	// Position in the collected text of the start of range, or -1 if it is outside
	function offsetOf(range) {
		for (const segment of segments) {
			// First text node which does not end before the start of the range
			if (range.comparePoint(segment.node, segment.node.length) < 0)
				continue;
			if (segment.node === range.startContainer)
				return segment.start + Math.max(0, range.startOffset - segment.nodeStart);
			return segment.start;
		}
		return -1;
	}

	function mainContent() {
		const articles = document.querySelectorAll('article');
		return (articles.length === 1 ? articles[0] : null) ||
			document.querySelector('main, [role="main"]') || document.body;
	}

	// mode: 'selection', 'page', or 'from-selection' (the page, from the selection if there is one).
	// Returns the text to read, its language, whether it is mapped to the page (highlight),
	// and the position where the reading starts.
	function prepare(mode, options) {
		const lang = document.documentElement.lang;
		segments = [];
		clear();
		labels = options.labels;
		if (options.showBar)
			showBar();

		const selection = window.getSelection();
		const range = selection && selection.rangeCount > 0 && !selection.isCollapsed ? selection.getRangeAt(0) : null;
		const removeSelection = () => {
			if (options.follow && range)
				selection.removeAllRanges();	// otherwise the selection color hides the highlight
		};

		if (mode !== 'page') {
			// Text selected in a text field: read without highlight
			const element = document.activeElement;
			if (element && (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') &&
				typeof element.selectionStart === 'number' && element.selectionEnd > element.selectionStart) {
				if (mode === 'selection')
					return { text: element.value.substring(element.selectionStart, element.selectionEnd), lang, mapped: false, start: 0 };
				return { text: element.value, lang, mapped: false, start: element.selectionStart };
			}
		}

		if (mode === 'selection') {
			if (!range)
				return { text: '', lang, mapped: false, start: 0 };
			const container = range.commonAncestorContainer;
			const root = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
			const text = collectText(root, range);
			if (!text.trim())
				return { text: selection.toString(), lang, mapped: false, start: 0 };
			removeSelection();
			return { text, lang, mapped: true, start: 0 };
		}

		let root = mainContent();
		if (mode === 'from-selection' && range && root && !root.contains(range.startContainer))
			root = document.body;		// selection outside the main content
		if (!root)
			return { text: '', lang, mapped: false, start: 0 };

		const text = collectText(root, null);
		if (!text.trim())	// text in shadow DOM...
			return { text: root.innerText, lang, mapped: false, start: 0 };

		let start = 0;
		if (mode === 'from-selection' && range) {
			start = Math.max(0, offsetOf(range));
			while (start > 0 && /\S/.test(text[start - 1]))	// from the start of the word
				start--;
			removeSelection();
		}
		return { text, lang, mapped: true, start };
	}

	// -----------------------------------------------------------------------
	// Reading bar, at the top of the page
	// -----------------------------------------------------------------------

	let labels = {};
	let bar = null;		// { host, root, playButton, speed }

	const ICONS = {
		previous: '<path d="M6 5h2v14H6zM20 5v14L9.5 12z"/>',
		play: '<path d="M7 4.5v15L19.5 12z"/>',
		pause: '<path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z"/>',
		next: '<path d="M16 5h2v14h-2zM4 5v14l10.5-7z"/>',
		stop: '<path d="M6 6h12v12H6z"/>',
		slower: '<path d="M5 11h14v2H5z"/>',
		faster: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
		close: '<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>',
	};

	const BAR_STYLE = `
		:host { all: initial; position: fixed; top: 8px; left: 50%; transform: translateX(-50%); z-index: 2147483647; }
		:host([hidden]) { display: none; }
		.bar {
			--bg: #ffffff; --fg: #1b1b1b; --hover: #ececec; --border: #c8c8c8; --muted: #616161; --accent: #0063b1;
			display: flex; align-items: center; gap: 2px; padding: 4px 6px;
			background: var(--bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
			font: 13px "Segoe UI", system-ui, sans-serif;
		}
		@media (prefers-color-scheme: dark) {
			.bar { --bg: #2b2b2b; --fg: #f0f0f0; --hover: #3c3c3c; --border: #4a4a4a; --muted: #a8a8a8; --accent: #4cc2ff; }
		}
		button {
			all: unset; box-sizing: border-box; display: grid; place-items: center;
			width: 32px; height: 32px; border-radius: 6px; cursor: pointer; color: var(--fg);
		}
		button:hover { background: var(--hover); }
		button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
		button.main { color: var(--accent); }
		svg { width: 20px; height: 20px; fill: currentColor; }
		.speed { min-width: 26px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
		.separator { width: 1px; height: 20px; margin: 0 4px; background: var(--border); }
	`;

	function setIcon(button, icon) {
		button.dataset.icon = icon;
		button.title = labels[icon] || '';
		button.setAttribute('aria-label', button.title);
		button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[icon] + '</svg>';
	}

	// command: command of background.js, or 'close' (hides the bar and stops the reading)
	function makeButton(icon, command, className) {
		const button = document.createElement('button');
		button.type = 'button';
		if (className)
			button.className = className;
		setIcon(button, icon);
		button.addEventListener('mousedown', event => event.preventDefault());	// keeps the selection of the page
		button.addEventListener('click', () => {
			if (command === 'close')
				bar.host.hidden = true;
			chrome.runtime.sendMessage({ type: 'command', command: command === 'close' ? 'stop' : command }).catch(() => {});
		});
		return button;
	}

	function showSpeed(speed) {
		if (bar)
			bar.speed.textContent = speed > 0 ? '+' + speed : String(speed || 0);
	}

	function showBar() {
		if (bar) {
			bar.host.hidden = false;
			for (const button of bar.root.querySelectorAll('button'))
				setIcon(button, button.dataset.icon);	// the language may have changed
			return;
		}

		const host = document.createElement('div');
		const root = host.attachShadow({ mode: 'closed' });
		const style = document.createElement('style');
		style.textContent = BAR_STYLE;
		const container = document.createElement('div');
		container.className = 'bar';
		container.setAttribute('role', 'toolbar');

		const separator = () => {
			const element = document.createElement('span');
			element.className = 'separator';
			return element;
		};
		const speed = document.createElement('span');
		speed.className = 'speed';
		const playButton = makeButton('play', 'pause-resume', 'main');

		container.append(
			makeButton('previous', 'previous'), playButton, makeButton('next', 'next'), makeButton('stop', 'stop'),
			separator(),
			makeButton('slower', 'slower'), speed, makeButton('faster', 'faster'),
			separator(),
			makeButton('close', 'close'));
		root.append(style, container);
		document.documentElement.append(host);	// outside body: not read

		bar = { host, root, playButton, speed };
		chrome.storage.local.get('speed').then(values => showSpeed(values.speed)).catch(() => {});
	}

	function showStatus(status) {
		if (bar)
			setIcon(bar.playButton, status === 'speaking' ? 'pause' : 'play');
	}

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === 'local' && changes.speed)
			showSpeed(changes.speed.newValue);
	});

	// -----------------------------------------------------------------------
	// Highlight and scrolling
	// -----------------------------------------------------------------------

	function makeRange(start, end) {
		// First segment ending after start
		let low = 0;
		let high = segments.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (segments[middle].end <= start)
				low = middle + 1;
			else
				high = middle;
		}
		let last = low;
		while (last + 1 < segments.length && segments[last + 1].start < end)
			last++;

		const first = segments[low];
		const lastSegment = segments[last];
		if (!first || first.start >= end || !first.node.isConnected || !lastSegment.node.isConnected)
			return null;

		const range = document.createRange();
		range.setStart(first.node, first.nodeStart + Math.max(0, start - first.start));
		range.setEnd(lastSegment.node, lastSegment.nodeStart + Math.min(end, lastSegment.end) - lastSegment.start);
		return range;
	}

	function scrollableParent(node) {
		for (let element = node.parentElement; element && element !== document.body; element = element.parentElement) {
			const overflow = getComputedStyle(element).overflowY;
			if ((overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') &&
				element.scrollHeight > element.clientHeight)
				return element;
		}
		return null;
	}

	function keepVisible(range) {
		if (Date.now() - lastUserScroll < USER_SCROLL_DELAY)
			return;
		const rect = range.getClientRects()[0] || range.getBoundingClientRect();
		if (!rect || (rect.width === 0 && rect.height === 0))
			return;

		const container = scrollableParent(range.startContainer);
		let top = 0;
		let bottom = window.innerHeight;
		if (container) {
			const box = container.getBoundingClientRect();
			top = Math.max(top, box.top);
			bottom = Math.min(bottom, box.bottom);
		}
		const height = bottom - top;
		if (height <= 0)
			return;

		// Keeps the text between 15 % and 70 % of the visible area, brings it back at one third
		if (rect.top < top + height * 0.15 || rect.bottom > top + height * 0.7)
			(container || window).scrollBy({ top: rect.top - (top + height / 3), behavior: 'smooth' });
	}

	function highlight({ sentenceStart, sentenceEnd, wordStart, wordEnd }) {
		const sentence = makeRange(sentenceStart, sentenceEnd);
		const word = wordStart !== undefined ? makeRange(wordStart, wordEnd) : null;

		if (window.CSS && CSS.highlights) {
			if (sentence)
				CSS.highlights.set('speech-sentence', new Highlight(sentence));
			else
				CSS.highlights.delete('speech-sentence');
			if (word)
				CSS.highlights.set('speech-word', new Highlight(word));
			else
				CSS.highlights.delete('speech-word');
		}

		if (word || sentence)
			keepVisible(word || sentence);
	}

	function clear() {
		if (window.CSS && CSS.highlights) {
			CSS.highlights.delete('speech-sentence');
			CSS.highlights.delete('speech-word');
		}
	}

	for (const type of ['wheel', 'touchmove'])
		window.addEventListener(type, () => { lastUserScroll = Date.now(); }, { capture: true, passive: true });
	window.addEventListener('keydown', event => {
		if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
			lastUserScroll = Date.now();
	}, { capture: true, passive: true });

	chrome.runtime.onMessage.addListener(message => {
		if (message.type === 'speech-highlight')
			highlight(message);
		else if (message.type === 'speech-status')
			showStatus(message.status);
		else if (message.type === 'speech-clear') {
			clear();
			segments = [];
		}
	});

	window.__speechReader = { prepare };
})();
