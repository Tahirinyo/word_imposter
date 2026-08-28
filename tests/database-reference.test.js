import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteApp, initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

import { createDatabaseReference } from '../src/config/database-reference.js';

test('creates a Firebase root reference when no child path is supplied', async () => {
    const app = initializeApp({
        projectId: 'database-reference-test',
        databaseURL: 'http://127.0.0.1:9000?ns=database-reference-test'
    }, 'database-reference-test');

    try {
        const database = getDatabase(app);
        assert.equal(createDatabaseReference(database).key, null);
        assert.equal(createDatabaseReference(database, 'rooms/ABC234').key, 'ABC234');
        assert.throws(() => createDatabaseReference(database, ''), /invalid path/i);
    } finally {
        await deleteApp(app);
    }
});
