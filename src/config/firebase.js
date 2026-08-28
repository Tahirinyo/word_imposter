import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
    connectDatabaseEmulator,
    get,
    getDatabase,
    onDisconnect,
    onValue,
    remove,
    runTransaction,
    serverTimestamp,
    set,
    update
} from 'firebase/database';
import { createDatabaseReference } from './database-reference.js';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const requiredConfigKeys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId'];

let app;
let database;
let auth;
let emulatorsConnected = false;

export async function initFirebase() {
    const missingKeys = requiredConfigKeys.filter((key) => !firebaseConfig[key]);
    if (missingKeys.length > 0) {
        throw new Error(`Firebase yapılandırması eksik: ${missingKeys.join(', ')}`);
    }

    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    database = getDatabase(app);
    auth = getAuth(app);

    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorsConnected) {
        const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
        connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
        connectDatabaseEmulator(database, host, 9000);
        emulatorsConnected = true;
    }

    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    return auth.currentUser;
}

export function getUserId() {
    return auth?.currentUser?.uid ?? null;
}

export function dbRef(path) {
    if (!database) throw new Error('Firebase henüz başlatılmadı.');
    return createDatabaseReference(database, path);
}

export { get, onDisconnect, onValue, remove, runTransaction, serverTimestamp, set, update };
