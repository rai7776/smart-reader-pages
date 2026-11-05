// Run with: node --test tests/sentence-audio-toggle.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

test('sentence audio buttons are opt-in and do not reserve space when disabled', () => {
    assert.match(app, /showSentenceAudioButtons:\s*false/);
    assert.match(css, /\.sentence-audio-btn\s*\{\s*display:\s*none;/);
    assert.match(css, /#text-display\.show-sentence-audio\s+\.sentence-audio-btn\s*\{\s*display:\s*inline-flex;/);
    assert.match(html, /id="reader-sentence-audio-toggle"\s+onchange="toggleReaderSentenceAudio\(\)"/);
});

test('compact labels and grouped controls fit narrow screens without splitting items', () => {
    assert.match(html, /<span>🔊表示<\/span>/);
    assert.match(html, /aria-label="各文の再生ボタンを表示"/);
    assert.match(html, /<div class="reader-audio-actions">\s*<button[^>]*id="reader-play-all"[\s\S]*?<button[^>]*id="reader-stop-audio"/);
    assert.match(css, /\.reader-audio-actions\s*\{[^}]*display:\s*inline-flex;[^}]*flex-shrink:\s*0;/);
    assert.match(css, /\.reader-tool-toggle,\s*\.reader-tool-rate\s*\{[^}]*white-space:\s*nowrap;/);
});

test('visibility toggle updates the reader immediately and persists across reloads', async () => {
    const start = app.indexOf('function syncReaderSentenceAudioVisibility() {');
    const end = app.indexOf('async function updateSpeechRate(value) {', start);
    assert.ok(start !== -1 && end > start, 'visibility functions exist');

    const input = { checked: false };
    const visibility = { shown: false };
    const saved = [];
    const display = {
        classList: {
            toggle(name, enabled) {
                assert.equal(name, 'show-sentence-audio');
                visibility.shown = enabled;
            }
        }
    };
    const context = {
        document: {
            getElementById(id) {
                if (id === 'reader-sentence-audio-toggle') return input;
                if (id === 'text-display') return display;
                return null;
            }
        },
        readerSettings: { showSentenceAudioButtons: false },
        db: {
            async setItem(key, value) {
                assert.equal(key, 'reader_settings');
                saved.push({ ...value });
            }
        }
    };
    vm.runInNewContext(app.slice(start, end), context);

    input.checked = true;
    await context.toggleReaderSentenceAudio();
    assert.equal(visibility.shown, true);
    assert.equal(saved[0].showSentenceAudioButtons, true);

    input.checked = false;
    await context.toggleReaderSentenceAudio();
    assert.equal(visibility.shown, false);
    assert.equal(saved[1].showSentenceAudioButtons, false);
});

test('stored setting is restored, synced to checkbox, and applied during article rendering', () => {
    assert.match(app, /readerSettings\s*=\s*\{\s*\.\.\.DEFAULT_READER_SETTINGS,\s*\.\.\.savedSet,/);
    assert.match(app, /sentenceAudioToggle\.checked\s*=\s*!!readerSettings\.showSentenceAudioButtons/);
    const start = app.indexOf('function renderArticleText(');
    const end = app.indexOf('function hasActiveReaderTextSelection(', start);
    assert.ok(start !== -1 && end > start, 'renderArticleText exists');
    assert.match(app.slice(start, end), /syncReaderSentenceAudioVisibility\(\)/);
    assert.match(app.slice(start, end), /class="sentence-audio-btn"/);
});
