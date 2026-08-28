import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

import { createPlayer, createRoomRecord } from '../src/game/engine.js';

const emulatorAvailable = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
let environment;

before(async () => {
    if (!emulatorAvailable) return;
    environment = await initializeTestEnvironment({
        projectId: 'who-is-imposter-spark-flow-test',
        database: {
            rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
        }
    });
});

after(async () => environment?.cleanup());

test('friends can create, join by code or invite, and join late as a spectator', { skip: !emulatorAvailable }, async () => {
    const roomCode = 'FLWX23';
    const now = Date.now();
    const host = environment.authenticatedContext('host').database();
    const manual = environment.authenticatedContext('manual').database();
    const invite = environment.authenticatedContext('invite').database();
    const spectator = environment.authenticatedContext('spectator').database();

    await set(ref(host, `rooms/${roomCode}`), createRoomRecord(roomCode, 'host', 'Host', now));
    await set(ref(host, `rooms/${roomCode}/players/host/connected`), true);

    await assertFails(get(ref(manual, `rooms/${roomCode}`)));
    await set(
        ref(manual, `rooms/${roomCode}/players/manual`),
        createPlayer('manual', 'Manual', now + 1)
    );
    await set(ref(manual, `rooms/${roomCode}/players/manual/connected`), true);

    await assertFails(get(ref(invite, `rooms/${roomCode}`)));
    await set(
        ref(invite, `rooms/${roomCode}/players/invite`),
        createPlayer('invite', 'Invite', now + 2)
    );
    await set(ref(invite, `rooms/${roomCode}/players/invite/connected`), true);

    const joinedRoom = (await get(ref(host, `rooms/${roomCode}`))).val();
    assert.equal(Object.keys(joinedRoom.players).length, 3);
    assert.equal(Object.values(joinedRoom.players).every((player) => player.connected === true), true);

    await update(ref(host), {
        [`rooms/${roomCode}/settings/selectedCategories`]: ['Hayvanlar'],
        [`rooms/${roomCode}/gameState/phase`]: 'category',
        [`rooms/${roomCode}/updatedAt`]: Date.now()
    });
    assert.equal((await get(ref(manual, `rooms/${roomCode}/gameState/phase`))).val(), 'category');

    await update(ref(host), {
        [`rooms/${roomCode}/status`]: 'playing',
        [`rooms/${roomCode}/gameState/phase`]: 'lobby',
        [`rooms/${roomCode}/updatedAt`]: Date.now()
    });
    await assertFails(get(ref(spectator, `rooms/${roomCode}`)));
    await set(
        ref(spectator, `rooms/${roomCode}/players/spectator`),
        createPlayer('spectator', 'Spectator', now + 3, true)
    );
    const spectatorRoom = (await get(ref(spectator, `rooms/${roomCode}`))).val();
    assert.equal(spectatorRoom.players.spectator.isSpectator, true);
    assert.equal(spectatorRoom.players.spectator.alive, false);
});
