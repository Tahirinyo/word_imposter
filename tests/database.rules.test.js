import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

const emulatorAvailable = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
let environment;

function player(id, name, connected = true) {
    return {
        id,
        name,
        connected,
        isSpectator: false,
        alive: true,
        roleSeen: false,
        joinedAt: 1
    };
}

function room(hostId = 'host') {
    return {
        schemaVersion: 2,
        id: 'ABC234',
        hostId,
        status: 'waiting',
        createdAt: 1,
        updatedAt: 1,
        settings: { selectedCategories: [], imposterCount: 1, mrWhiteCount: 0 },
        players: {
            host: player('host', 'Host'),
            member: player('member', 'Member')
        },
        gameState: { phase: 'waiting', roundNumber: 0 }
    };
}

before(async () => {
    if (!emulatorAvailable) return;
    environment = await initializeTestEnvironment({
        projectId: 'who-is-imposter-rules-test',
        database: {
            rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
        }
    });

    await environment.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), 'rooms/ABC234'), room());
        await set(ref(context.database(), 'roomSecrets/ABC234'), {
            host: { role: 'citizen', word: 'Kedi', category: 'Hayvanlar', roundId: 'round-1' },
            member: { role: 'imposter', word: 'Aslan', category: 'Hayvanlar', roundId: 'round-1' },
            _authority: { currentWordPair: { citizenWord: 'Kedi', imposterWord: 'Aslan' } }
        });
    });
});

after(async () => environment?.cleanup());

test('only room members can read a room and nobody can list all rooms', { skip: !emulatorAvailable }, async () => {
    const memberDb = environment.authenticatedContext('member').database();
    const outsiderDb = environment.authenticatedContext('outsider').database();
    const anonymousDb = environment.unauthenticatedContext().database();
    await assertSucceeds(get(ref(memberDb, 'rooms/ABC234')));
    await assertFails(get(ref(outsiderDb, 'rooms/ABC234')));
    await assertFails(get(ref(outsiderDb, 'rooms')));
    await assertFails(get(ref(anonymousDb, 'rooms/ABC234')));
});

test('an authenticated user can create a valid room only for themselves', { skip: !emulatorAvailable }, async () => {
    const creatorDb = environment.authenticatedContext('creator').database();
    const created = room('creator');
    created.id = 'NEW234';
    created.players = { creator: player('creator', 'Creator') };
    await assertSucceeds(set(ref(creatorDb, 'rooms/NEW234'), created));

    const invalid = structuredClone(created);
    invalid.hostId = 'someone-else';
    invalid.players['someone-else'] = player('someone-else', 'Other');
    await assertFails(set(ref(creatorDb, 'rooms/BAD234'), invalid));
});

test('a new player can join only through their own player record', { skip: !emulatorAvailable }, async () => {
    const joinerDb = environment.authenticatedContext('joiner').database();
    await assertSucceeds(set(ref(joinerDb, 'rooms/ABC234/players/joiner'), player('joiner', 'Joiner', false)));
    await assertFails(set(ref(joinerDb, 'rooms/ABC234/players/intruder'), player('intruder', 'Intruder')));
    await assertFails(set(ref(joinerDb, 'rooms/ABC234/gameState/phase'), 'gameover'));
});

test('a late joiner can join a playing room only as a spectator', { skip: !emulatorAvailable }, async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
        await update(ref(context.database(), 'rooms/ABC234'), {
            status: 'playing',
            'gameState/phase': 'lobby'
        });
    });

    const spectatorDb = environment.authenticatedContext('spectator').database();
    const activeLateDb = environment.authenticatedContext('active-late').database();
    const spectator = {
        ...player('spectator', 'Spectator', false),
        isSpectator: true,
        alive: false,
        roleSeen: true
    };
    await assertSucceeds(set(ref(spectatorDb, 'rooms/ABC234/players/spectator'), spectator));
    await assertFails(set(
        ref(activeLateDb, 'rooms/ABC234/players/active-late'),
        player('active-late', 'Active Late', false)
    ));
});

test('players update only their own presence, reveal flag, and private vote', { skip: !emulatorAvailable }, async () => {
    const memberDb = environment.authenticatedContext('member').database();
    await assertSucceeds(set(ref(memberDb, 'rooms/ABC234/players/member/connected'), false));
    await assertFails(set(ref(memberDb, 'rooms/ABC234/players/host/connected'), false));

    await environment.withSecurityRulesDisabled(async (context) => {
        await update(ref(context.database(), 'rooms/ABC234'), {
            'gameState/phase': 'reveal',
            'players/member/connected': true
        });
    });
    await assertSucceeds(set(ref(memberDb, 'rooms/ABC234/players/member/roleSeen'), true));

    await environment.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), 'rooms/ABC234/gameState/phase'), 'voting');
    });
    await assertSucceeds(update(ref(memberDb), {
        'roomVotes/ABC234/member': 'host',
        'rooms/ABC234/players/member/hasVoted': true
    }));
    await assertFails(set(ref(memberDb, 'roomVotes/ABC234/host'), 'member'));
});

test('the host can write secrets and game state while members read only their secret', { skip: !emulatorAvailable }, async () => {
    const hostDb = environment.authenticatedContext('host').database();
    const memberDb = environment.authenticatedContext('member').database();
    const outsiderDb = environment.authenticatedContext('outsider').database();

    await assertSucceeds(set(ref(hostDb, 'rooms/ABC234/gameState/phase'), 'lobby'));
    await assertSucceeds(set(ref(hostDb, 'roomSecrets/ABC234/member'), {
        role: 'citizen', word: 'Kedi', category: 'Hayvanlar', roundId: 'round-2'
    }));
    const ownSecret = await assertSucceeds(get(ref(memberDb, 'roomSecrets/ABC234/member')));
    assert.equal(ownSecret.val().role, 'citizen');
    await assertFails(get(ref(memberDb, 'roomSecrets/ABC234/host')));
    await assertFails(get(ref(outsiderDb, 'roomSecrets/ABC234/member')));
    await assertSucceeds(set(ref(memberDb, 'roomSecrets/ABC234/member'), null));
});
