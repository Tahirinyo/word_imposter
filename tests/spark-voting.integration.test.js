import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

import { createDatabaseReference } from '../src/config/database-reference.js';
import {
    createBallotResetUpdates,
    determineWinner,
    getEligibleVoters,
    getHighestVotedPlayerIds,
    getVoteCounts,
    haveAllActivePlayersVoted
} from '../src/game/engine.js';

const emulatorAvailable = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
let environment;

function player(id, joinedAt, connected = true) {
    return {
        id,
        name: id,
        connected,
        isSpectator: false,
        alive: true,
        roleSeen: true,
        joinedAt
    };
}

function playingRoom(code, disconnectedId = null) {
    return {
        schemaVersion: 2,
        id: code,
        hostId: 'host',
        status: 'playing',
        createdAt: 1,
        updatedAt: 1,
        settings: { selectedCategories: ['Hayvanlar'], imposterCount: 1, mrWhiteCount: 0 },
        players: {
            host: player('host', 1, disconnectedId !== 'host'),
            citizen: player('citizen', 2, disconnectedId !== 'citizen'),
            imposter: player('imposter', 3, disconnectedId !== 'imposter')
        },
        gameState: { phase: 'lobby', roundNumber: 1, roundId: `round-${code}` }
    };
}

function roomSecrets(code) {
    return {
        _authority: {
            currentWordPair: { category: 'Hayvanlar', citizenWord: 'Kedi', imposterWord: 'Aslan' },
            roundId: `round-${code}`,
            usedWordKeys: []
        },
        host: { role: 'citizen', word: 'Kedi', category: 'Hayvanlar', roundId: `round-${code}` },
        citizen: { role: 'citizen', word: 'Kedi', category: 'Hayvanlar', roundId: `round-${code}` },
        imposter: { role: 'imposter', word: 'Aslan', category: 'Hayvanlar', roundId: `round-${code}` }
    };
}

async function seedRoom(code, disconnectedId = null) {
    await environment.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), `rooms/${code}`), playingRoom(code, disconnectedId));
        await set(ref(context.database(), `roomSecrets/${code}`), roomSecrets(code));
    });
}

function castVote(database, code, voterId, targetId) {
    return update(createDatabaseReference(database), {
        [`roomVotes/${code}/${voterId}`]: targetId,
        [`rooms/${code}/players/${voterId}/hasVoted`]: true
    });
}

function resultFor(room, votes) {
    const eligibleIds = new Set(getEligibleVoters(room.players).map((candidate) => candidate.id));
    const eligibleVotes = Object.fromEntries(
        Object.entries(votes).filter(([voterId]) => eligibleIds.has(voterId))
    );
    return {
        counts: getVoteCounts(eligibleVotes),
        highestIds: getHighestVotedPlayerIds(eligibleVotes),
        eligibleVoterIds: [...eligibleIds]
    };
}

before(async () => {
    if (!emulatorAvailable) return;
    environment = await initializeTestEnvironment({
        projectId: 'who-is-imposter-voting-test',
        database: {
            rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
        }
    });
});

after(async () => environment?.cleanup());

test('three friends can vote, eliminate the majority target, and finish the game', { skip: !emulatorAvailable }, async () => {
    const code = 'VTE234';
    await seedRoom(code);
    const hostDb = environment.authenticatedContext('host').database();
    const citizenDb = environment.authenticatedContext('citizen').database();
    const imposterDb = environment.authenticatedContext('imposter').database();
    const outsiderDb = environment.authenticatedContext('outsider').database();
    const initialRoom = playingRoom(code);

    const rootRef = createDatabaseReference(hostDb);
    assert.equal(rootRef.key, null);
    await update(rootRef, createBallotResetUpdates(code, initialRoom.players, 'voting', 2));
    assert.equal((await get(ref(citizenDb, `rooms/${code}/gameState/phase`))).val(), 'voting');
    await assertFails(get(ref(citizenDb, `roomVotes/${code}`)));
    await assertFails(get(ref(citizenDb, `roomVotes/${code}/host`)));
    await assertFails(get(ref(outsiderDb, `rooms/${code}`)));
    await assertSucceeds(get(ref(citizenDb, `roomVotes/${code}/citizen`)));

    await assertFails(castVote(citizenDb, code, 'citizen', 'citizen'));
    await assertFails(castVote(citizenDb, code, 'citizen', 'missing-player'));
    await castVote(hostDb, code, 'host', 'imposter');
    await castVote(citizenDb, code, 'citizen', 'imposter');
    await castVote(imposterDb, code, 'imposter', 'host');
    await assertFails(castVote(citizenDb, code, 'citizen', 'host'));
    assert.equal((await get(ref(citizenDb, `roomVotes/${code}/citizen`))).val(), 'imposter');

    const votingRoom = (await get(ref(hostDb, `rooms/${code}`))).val();
    const votes = (await get(ref(hostDb, `roomVotes/${code}`))).val();
    assert.equal(haveAllActivePlayersVoted(votingRoom.players, votes), true);
    const voteResults = resultFor(votingRoom, votes);
    assert.deepEqual(voteResults.counts, { host: 1, imposter: 2 });
    assert.deepEqual(voteResults.highestIds, ['imposter']);
    await assertFails(set(ref(citizenDb, `rooms/${code}/gameState/voteResults`), voteResults));
    await update(ref(hostDb, `rooms/${code}`), {
        'gameState/voteResults': voteResults,
        updatedAt: 3
    });
    assert.deepEqual(
        (await get(ref(citizenDb, `rooms/${code}/gameState/voteResults`))).val().highestIds,
        ['imposter']
    );

    await update(ref(hostDb, `rooms/${code}`), {
        'players/imposter/alive': false,
        'players/imposter/revealedRole': 'imposter',
        'players/imposter/revealedWord': 'Aslan',
        'gameState/phase': 'elimination',
        'gameState/eliminatedPlayerId': 'imposter',
        updatedAt: 4
    });
    assert.equal((await get(ref(citizenDb, `rooms/${code}/players/imposter/alive`))).val(), false);

    const eliminatedRoom = (await get(ref(hostDb, `rooms/${code}`))).val();
    assert.equal(determineWinner(eliminatedRoom.players, roomSecrets(code)), 'citizens');
    await update(createDatabaseReference(hostDb), {
        [`rooms/${code}/status`]: 'finished',
        [`rooms/${code}/gameState/phase`]: 'gameover',
        [`rooms/${code}/gameState/winner`]: 'citizens',
        [`rooms/${code}/gameState/wordPair`]: roomSecrets(code)._authority.currentWordPair,
        [`rooms/${code}/gameState/voteResults`]: null,
        [`rooms/${code}/players/host/hasVoted`]: null,
        [`rooms/${code}/players/citizen/hasVoted`]: null,
        [`rooms/${code}/players/imposter/hasVoted`]: null,
        [`rooms/${code}/updatedAt`]: 5
    });
    await set(ref(hostDb, `roomVotes/${code}`), null);
    assert.equal((await get(ref(imposterDb, `rooms/${code}/gameState/winner`))).val(), 'citizens');
    assert.equal((await get(ref(citizenDb, `roomVotes/${code}/citizen`))).val(), null);
    await assertFails(castVote(citizenDb, code, 'citizen', 'host'));
});

test('a tied ballot resets atomically and permits a clean revote', { skip: !emulatorAvailable }, async () => {
    const code = 'TYE234';
    await seedRoom(code);
    const hostDb = environment.authenticatedContext('host').database();
    const citizenDb = environment.authenticatedContext('citizen').database();
    const imposterDb = environment.authenticatedContext('imposter').database();
    const room = playingRoom(code);

    await update(createDatabaseReference(hostDb), createBallotResetUpdates(code, room.players, 'voting', 2));
    await castVote(hostDb, code, 'host', 'citizen');
    await castVote(citizenDb, code, 'citizen', 'imposter');
    await castVote(imposterDb, code, 'imposter', 'host');
    const votes = (await get(ref(hostDb, `roomVotes/${code}`))).val();
    const tiedResult = resultFor((await get(ref(hostDb, `rooms/${code}`))).val(), votes);
    assert.deepEqual(new Set(tiedResult.highestIds), new Set(['host', 'citizen', 'imposter']));
    await set(ref(hostDb, `rooms/${code}/gameState/voteResults`), tiedResult);

    const currentPlayers = (await get(ref(hostDb, `rooms/${code}/players`))).val();
    await update(createDatabaseReference(hostDb), createBallotResetUpdates(code, currentPlayers, 'lobby', 3));
    assert.equal((await get(ref(hostDb, `roomVotes/${code}`))).val(), null);
    assert.equal((await get(ref(citizenDb, `rooms/${code}/players/citizen/hasVoted`))).val(), null);
    await update(createDatabaseReference(hostDb), createBallotResetUpdates(code, currentPlayers, 'voting', 4));
    await assertSucceeds(castVote(citizenDb, code, 'citizen', 'imposter'));
});

test('published results stay closed when a disconnected player reconnects', { skip: !emulatorAvailable }, async () => {
    const code = 'RCN234';
    await seedRoom(code, 'imposter');
    const hostDb = environment.authenticatedContext('host').database();
    const citizenDb = environment.authenticatedContext('citizen').database();
    const imposterDb = environment.authenticatedContext('imposter').database();
    const room = playingRoom(code, 'imposter');

    await update(createDatabaseReference(hostDb), createBallotResetUpdates(code, room.players, 'voting', 2));
    await castVote(hostDb, code, 'host', 'imposter');
    await castVote(citizenDb, code, 'citizen', 'imposter');
    const votingRoom = (await get(ref(hostDb, `rooms/${code}`))).val();
    const votes = (await get(ref(hostDb, `roomVotes/${code}`))).val();
    const frozenResult = resultFor(votingRoom, votes);
    assert.deepEqual(new Set(frozenResult.eligibleVoterIds), new Set(['host', 'citizen']));
    await set(ref(hostDb, `rooms/${code}/gameState/voteResults`), frozenResult);

    await set(ref(imposterDb, `rooms/${code}/players/imposter/connected`), true);
    await assertFails(castVote(imposterDb, code, 'imposter', 'host'));
    assert.deepEqual(
        (await get(ref(hostDb, `rooms/${code}/gameState/voteResults`))).val(),
        frozenResult
    );
});
