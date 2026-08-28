const test = require('node:test');
const assert = require('node:assert/strict');

const {
    PHASES,
    assignRoles,
    chooseWordPair,
    createRoomRecord,
    determineWinner,
    haveAllActivePlayersVoted,
    normalizeNameForComparison,
    selectNextHost,
    wordKey
} = require('../game-engine');

const players = {
    a: { id: 'a', name: 'A', connected: true, alive: true, joinedAt: 1 },
    b: { id: 'b', name: 'B', connected: true, alive: true, joinedAt: 2 },
    c: { id: 'c', name: 'C', connected: true, alive: true, joinedAt: 3 },
    d: { id: 'd', name: 'D', connected: true, alive: true, joinedAt: 4 },
    e: { id: 'e', name: 'E', connected: true, alive: true, joinedAt: 5 },
    f: { id: 'f', name: 'F', connected: true, alive: true, joinedAt: 6 }
};

test('creates the canonical waiting-room shape', () => {
    const room = createRoomRecord('ABC234', 'a', 'Ayşe', 123);
    assert.equal(room.hostId, 'a');
    assert.equal(room.schemaVersion, 2);
    assert.equal(room.gameState.phase, PHASES.WAITING);
    assert.equal(room.players.a.name, 'Ayşe');
    assert.equal(room.players.a.connected, false);
    assert.equal(room.createdAt, 123);
});

test('compares names case-insensitively in Turkish', () => {
    assert.equal(normalizeNameForComparison(' İPEK '), normalizeNameForComparison('ipek'));
});

test('assigns the requested role counts without assigning disconnected players', () => {
    const withOfflinePlayer = { ...players, f: { ...players.f, connected: false } };
    const pair = { category: 'Hayvanlar', citizenWord: 'Kedi', imposterWord: 'Aslan' };
    const assignment = assignRoles(withOfflinePlayer, { imposterCount: 1, mrWhiteCount: 1 }, pair, () => 0);
    const roles = Object.values(assignment.secrets).map((secret) => secret.role);

    assert.equal(assignment.activePlayerIds.length, 5);
    assert.equal(assignment.secrets.f, undefined);
    assert.equal(roles.filter((role) => role === 'citizen').length, 3);
    assert.equal(roles.filter((role) => role === 'imposter').length, 1);
    assert.equal(roles.filter((role) => role === 'mrwhite').length, 1);
});

test('avoids recently used pairs and resets when the category pool is exhausted', () => {
    const words = [
        { category: 'A', citizenWord: 'one', imposterWord: 'two' },
        { category: 'A', citizenWord: 'three', imposterWord: 'four' },
        { category: 'B', citizenWord: 'five', imposterWord: 'six' }
    ];

    assert.equal(chooseWordPair(words, ['A'], [wordKey(words[0])], () => 0), words[1]);
    assert.equal(chooseWordPair(words, ['A'], words.slice(0, 2).map(wordKey), () => 0), words[0]);
});

test('calculates both win conditions from server-side secrets', () => {
    const secrets = {
        a: { role: 'citizen' },
        b: { role: 'citizen' },
        c: { role: 'citizen' },
        d: { role: 'imposter' },
        e: { role: 'mrwhite' }
    };

    const impostersWin = { ...players, c: { ...players.c, alive: false } };
    assert.equal(determineWinner(impostersWin, secrets), 'imposters');
    const citizensWin = {
        ...players,
        d: { ...players.d, alive: false },
        e: { ...players.e, alive: false }
    };
    assert.equal(determineWinner(citizensWin, secrets), 'citizens');
});

test('transfers host to the earliest connected remaining player', () => {
    const candidates = {
        b: { ...players.b, connected: false },
        c: players.c,
        d: players.d
    };
    assert.equal(selectNextHost(candidates), 'c');
});

test('does not let a disconnected player deadlock voting', () => {
    const votingPlayers = {
        a: players.a,
        b: players.b,
        c: { ...players.c, connected: false }
    };

    assert.equal(haveAllActivePlayersVoted(votingPlayers, { a: 'b', b: 'a' }), true);
});
