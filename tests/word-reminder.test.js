import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPrivateRevealCard } from '../src/ui/private-reveal.js';
import { renderWordReminder } from '../src/ui/word-reminder.js';

test('private Citizen and Impostor reveals differ only by their assigned clue', () => {
    const citizen = renderPrivateRevealCard({ role: 'citizen', word: 'Kedi' });
    const imposter = renderPrivateRevealCard({ role: 'imposter', word: 'Aslan' });

    assert.match(citizen, /Kedi/);
    assert.match(imposter, /Aslan/);
    for (const html of [citizen, imposter]) {
        assert.doesNotMatch(html, /Vatandaş|Hain|Gizemli|Rol/);
        assert.doesNotMatch(html, /class="[^"]*(citizen|imposter|mrwhite)/i);
    }
    assert.equal(citizen.replace('Kedi', '__CLUE__'), imposter.replace('Aslan', '__CLUE__'));
});

test('private Mr White reveal shows only its assigned category clue', () => {
    const html = renderPrivateRevealCard({ role: 'mrwhite', category: 'Hayvanlar' });
    assert.match(html, /\?\?\?/);
    assert.match(html, /Kategori: Hayvanlar/);
    assert.doesNotMatch(html, /Vatandaş|Hain|Gizemli|Rol|class="[^"]*mrwhite/i);
});

test('word reminder shows the clue without exposing the role label', () => {
    const citizen = renderWordReminder({ role: 'citizen', word: 'Kedi' });
    const imposter = renderWordReminder({ role: 'imposter', word: 'Aslan' });

    assert.match(citizen, /Kelimen: Kedi/);
    assert.match(imposter, /Kelimen: Aslan/);
    for (const html of [citizen, imposter]) {
        assert.match(html, /role-reminder-label-closed">Kartımı Göster/);
        assert.match(html, /role-reminder-label-open">Kartımı Gizle/);
        assert.doesNotMatch(html, /Özel ipucum/);
        assert.doesNotMatch(html, /Vatandaş|Hain|Gizemli|<strong>/);
        assert.doesNotMatch(html, /class="[^"]*(citizen|imposter|mrwhite)/i);
    }
});

test('Mr White reminder shows only the category and spectators see no reminder', () => {
    const mrWhite = renderWordReminder({ role: 'mrwhite', category: 'Hayvanlar' });
    assert.match(mrWhite, /Kategori: Hayvanlar/);
    assert.doesNotMatch(mrWhite, /Gizemli|mrwhite/i);
    assert.equal(renderWordReminder({ role: 'citizen', word: 'Kedi', isSpectator: true }), '');
});

test('word reminder escapes private clue text', () => {
    const html = renderWordReminder({ role: 'citizen', word: '<img src=x onerror=alert(1)>' });
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
});
