import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import wordPairs from '../src/data/words.json' with { type: 'json' };

const dataModule = readFileSync(new URL('../src/data/index.js', import.meta.url), 'utf8');
const categoryMetadata = dataModule.split('export const categoryIcons = {')[1].split('};')[0];
const activeCategories = new Set([...categoryMetadata.matchAll(/^\s*'([^']+)':/gm)].map((match) => match[1]));

test('catalog pairs have valid, unique, active-category data', () => {
    const directedPairs = new Set();
    const unorderedPairs = new Set();

    wordPairs.forEach((pair) => {
        assert.deepEqual(Object.keys(pair).sort(), ['category', 'citizenWord', 'imposterWord']);
        assert.equal(typeof pair.category, 'string');
        assert.equal(typeof pair.citizenWord, 'string');
        assert.equal(typeof pair.imposterWord, 'string');
        assert.ok(pair.category.trim());
        assert.ok(pair.citizenWord.trim());
        assert.ok(pair.imposterWord.trim());
        assert.equal(pair.category, pair.category.trim());
        assert.equal(pair.citizenWord, pair.citizenWord.trim());
        assert.equal(pair.imposterWord, pair.imposterWord.trim());
        assert.notEqual(pair.citizenWord, pair.imposterWord);
        assert.ok(activeCategories.has(pair.category));

        const directedKey = `${pair.category}\u0000${pair.citizenWord}\u0000${pair.imposterWord}`;
        const unorderedKey = `${pair.category}\u0000${[pair.citizenWord, pair.imposterWord].sort().join('\u0000')}`;
        assert.ok(!directedPairs.has(directedKey), `duplicate pair: ${directedKey}`);
        assert.ok(!unorderedPairs.has(unorderedKey), `reversed duplicate pair: ${unorderedKey}`);
        directedPairs.add(directedKey);
        unorderedPairs.add(unorderedKey);
    });
});
