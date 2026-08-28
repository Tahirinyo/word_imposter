import { ref } from 'firebase/database';

export function createDatabaseReference(database, path) {
    return path === undefined ? ref(database) : ref(database, path);
}
