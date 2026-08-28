import test from 'node:test';
import assert from 'node:assert/strict';

import {
    assignRoles,
    chooseWordPair,
    createBallotResetUpdates,
    createRoomRecord,
    determineWinner,
    haveAllActivePlayersVoted,
    normalizeNameForComparison,
    selectNextHost,
    wordKey
} from '../src/game/engine.js';

const deterministicRandom = (values) => values.fill(0);
const players = {
    a: { id: 'a', name: 'A', connected: true, alive: true, joinedAt: 1 },
    b: { id: 'b', name: 'B', connected: true, alive: true, joinedAt: 2 },
    c: { id: 'c', name: 'C', connected: true, alive: true, joinedAt: 3 },
    d: { id: 'd', name: 'D', connected: true, alive: true, joinedAt: 4 },
    e: { id: 'e', name: 'E', connected: true, alive: true, joinedAt: 5 }
};

test('creates the canonical Spark waiting room', () => {
    const room = createRoomRecord('ABC234', 'a', 'Ayşe', 123);
    assert.equal(room.schemaVersion, 2);
    assert.equal(room.hostId, 'a');
    assert.equal(room.players.a.name, 'Ayşe');
    assert.equal(room.players.a.connected, false);
    assert.equal(room.gameState.phase, 'waiting');
});

test('normalizes Turkish names consistently', () => {
    assert.equal(normalizeNameForComparison(' İPEK '), normalizeNameForComparison('ipek'));
});

test('assigns roles only to connected players', () => {
    const withOffline = { ...players, e: { ...players.e, connected: false } };
    const pair = { category: 'Hayvanlar', citizenWord: 'Kedi', imposterWord: 'Aslan' };
    const assignment = assignRoles(
        withOffline,
        { imposterCount: 1, mrWhiteCount: 0 },
        pair,
        deterministicRandom
    );
    assert.equal(assignment.activePlayerIds.length, 4);
    assert.equal(assignment.secrets.e, undefined);
    assert.equal(Object.values(assignment.secrets).filter((secret) => secret.role === 'imposter').length, 1);
});

test('chooses an unused word before recycling', () => {
    const words = [
        { category: 'A', citizenWord: 'one', imposterWord: 'two' },
        { category: 'A', citizenWord: 'three', imposterWord: 'four' }
    ];
    assert.equal(chooseWordPair(words, ['A'], [wordKey(words[0])], deterministicRandom), words[1]);
});

test('calculates winner and ignores disconnected voters for completion', () => {
    const secrets = {
        a: { role: 'citizen' },
        b: { role: 'citizen' },
        c: { role: 'citizen' },
        d: { role: 'imposter' },
        e: { role: 'mrwhite' }
    };
    assert.equal(determineWinner({ ...players, d: { ...players.d, alive: false }, e: { ...players.e, alive: false } }, secrets), 'citizens');
    assert.equal(haveAllActivePlayersVoted({ a: players.a, b: players.b, c: { ...players.c, connected: false } }, { a: 'b', b: 'a' }), true);
    assert.equal(haveAllActivePlayersVoted({ a: { ...players.a, connected: false } }, {}), false);
});

test('resets the public vote flags and private ballots in one atomic update', () => {
    const updates = createBallotResetUpdates('ABC234', { a: players.a, b: players.b }, 'voting', 123);
    assert.deepEqual(updates, {
        'rooms/ABC234/gameState/phase': 'voting',
        'rooms/ABC234/gameState/voteResults': null,
        'rooms/ABC234/updatedAt': 123,
        'roomVotes/ABC234': null,
        'rooms/ABC234/players/a/hasVoted': null,
        'rooms/ABC234/players/b/hasVoted': null
    });
});

test('transfers host to the earliest connected player', () => {
    assert.equal(selectNextHost({ b: { ...players.b, connected: false }, c: players.c, d: players.d }), 'c');
});
