import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getHighestVotedPlayerIds,
    getRoleLimits,
    getVoteCounts,
    haveAllAlivePlayersVoted,
    isValidRoomCode,
    normalizePlayerName,
    normalizeRoomCode,
    validatePlayerName,
    validateRoleCounts
} from '../src/game/domain.js';

test('normalizes and validates room codes', () => {
    assert.equal(normalizeRoomCode(' abC234 '), 'ABC234');
    assert.equal(isValidRoomCode('ABC234'), true);
    assert.equal(isValidRoomCode('ABC01I'), false);
    assert.equal(isValidRoomCode('short'), false);
});

test('normalizes safe Turkish player names', () => {
    assert.equal(normalizePlayerName('  İpek   Yılmaz  '), 'İpek Yılmaz');
    assert.equal(validatePlayerName('İpek Yılmaz'), null);
    assert.match(validatePlayerName('<script>'), /yalnızca/);
    assert.match(validatePlayerName('a'.repeat(16)), /15/);
});

test('computes role limits and rejects an instant bad-team win', () => {
    assert.deepEqual(getRoleLimits(7, 2), { maxImposters: 3, maxMrWhite: 2 });
    assert.equal(validateRoleCounts(7, 2, 1), null);
    assert.match(validateRoleCounts(4, 2, 0), /anında/);
});

test('tallies votes and identifies ties', () => {
    const votes = { a: 'c', b: 'd', c: 'c', d: 'd' };
    assert.deepEqual(getVoteCounts(votes), { c: 2, d: 2 });
    assert.deepEqual(getHighestVotedPlayerIds(votes).sort(), ['c', 'd']);
});

test('requires one vote from every active non-spectator', () => {
    const players = {
        a: { id: 'a', alive: true },
        b: { id: 'b', alive: true },
        c: { id: 'c', alive: false },
        d: { id: 'd', alive: false, isSpectator: true },
        e: { id: 'e', alive: true, connected: false }
    };

    assert.equal(haveAllAlivePlayersVoted(players, { a: 'b' }), false);
    assert.equal(haveAllAlivePlayersVoted(players, { a: 'b', b: 'a' }), true);
});
