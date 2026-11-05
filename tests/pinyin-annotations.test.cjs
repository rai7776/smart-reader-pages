// Run with: node --test tests/pinyin-annotations.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(textNodes, pronunciation = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const start = source.indexOf('function generatePinyinArray(text) {');
    const end = source.indexOf('\nlet readerAudioSequenceToken', start);
    assert.ok(start >= 0 && end > start, 'reading layer is present');

    const calls = [];
    const nodes = textNodes.map(value => ({
        nodeValue: value,
        parentElement: { closest: () => null },
        replaceWith(fragment) { this.replacement = fragment.children; }
    }));
    const paragraph = { nodes };
    const element = tag => ({ tag, className: '', dataset: {}, textContent: '' });
    const document = {
        getElementById: id => id === 'text-display'
            ? { querySelectorAll: () => [paragraph] } : null,
        createTreeWalker: target => {
            let index = 0;
            return { nextNode: () => target.nodes[index++] || null };
        },
        createDocumentFragment: () => ({
            children: [],
            appendChild(child) { this.children.push(child); }
        }),
        createTextNode: text => ({ tag: '#text', textContent: text }),
        createElement: element
    };
    const window = {
        pinyinPro: {
            pinyin(value, options) {
                calls.push({ value, type: options.type });
                if (options.type === 'array') {
                    if (pronunciation[value]) return pronunciation[value];
                    return Array.from(value).map(char => char);
                }
                return value;
            }
        }
    };
    const context = {
        window, document, NodeFilter: { SHOW_TEXT: 4 },
        currentArticle: { words: [{
            word: '窝',
            surfaceText: '窝在床上',
            annotations: [{ id: 'pinyin', value: 'wō' }]
        }] },
        isReaderAnnotationVisible: () => true,
        getPrimaryAnnotationDefinition: () => ({
            display: 'ruby', system: 'pinyin'
        }),
        console
    };
    vm.runInNewContext(source.slice(start, end), context);
    return { ...context, nodes, calls };
}

function renderedText(nodes) {
    return nodes.flatMap(node => node.replacement || [node])
        .map(item => item.textContent).join('');
}

function renderedReadings(nodes) {
    return nodes.flatMap(node => node.replacement || [])
        .filter(item => item.className === 'reader-ruby')
        .map(item => item.dataset.annotation);
}

test('all characters retain their readings when a phrase spans highlight nodes', () => {
    const h = createHarness(['窝', '在床上'], {
        '窝在床上': ['wō', 'zài', 'chuáng', 'shàng']
    });
    h.applyReaderAnnotations();
    assert.deepEqual(renderedReadings(h.nodes), ['wō', 'zài', 'chuáng', 'shàng']);
    assert.equal(renderedText(h.nodes), '窝在床上');
    assert.deepEqual(h.calls.map(item => item.value), ['窝在床上']);
});

test('polyphonic character is resolved with context across DOM boundaries', () => {
    const h = createHarness(['重', '庆'], {
        '重庆': ['chóng', 'qìng']
    });
    h.applyReaderAnnotations();
    assert.deepEqual(renderedReadings(h.nodes), ['chóng', 'qìng']);
});

test('emoji and punctuation do not shift pinyin code-point offsets', () => {
    const h = createHarness(['🙂窝', '在床上！'], {
        '窝在床上': ['wō', 'zài', 'chuáng', 'shàng']
    });
    h.applyReaderAnnotations();
    assert.deepEqual(renderedReadings(h.nodes), ['wō', 'zài', 'chuáng', 'shàng']);
    assert.equal(renderedText(h.nodes), '🙂窝在床上！');
});

test('unmatched array output falls back without losing any characters', () => {
    const h = createHarness(['我你'], { '我你': ['wǒ'] });
    h.applyReaderAnnotations();
    assert.deepEqual(renderedReadings(h.nodes), ['我', '你']);
    assert.equal(renderedText(h.nodes), '我你');
});

test('reader does not require vocabulary entries to render pinyin', () => {
    const h = createHarness(['窝在床上'], {
        '窝在床上': ['wō', 'zài', 'chuáng', 'shàng']
    });
    h.currentArticle.words = [];
    h.applyReaderAnnotations();
    assert.deepEqual(renderedReadings(h.nodes), ['wō', 'zài', 'chuáng', 'shàng']);
});
