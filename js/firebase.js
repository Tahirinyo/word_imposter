/**
 * Word Imposter - Firebase Configuration
 * Handles Firebase initialization and authentication
 */

const FirebaseConfig = {
    // Firebase configuration
    config: {
        apiKey: "AIzaSyB5h780_Qaed58i2Y5uSTpstiiaTpzlzC0",
        authDomain: "who-is-imposter-b1cb3.firebaseapp.com",
        databaseURL: "https://who-is-imposter-b1cb3-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "who-is-imposter-b1cb3",
        storageBucket: "who-is-imposter-b1cb3.firebasestorage.app",
        messagingSenderId: "658981156522",
        appId: "1:658981156522:web:b91d37b417dfbed542c2d3"
    },

    // Firebase instances
    app: null,
    database: null,
    auth: null,
    currentUser: null,

    /**
     * Initialize Firebase
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        try {
            // Initialize Firebase app
            this.app = firebase.initializeApp(this.config);
            this.database = firebase.database();
            this.auth = firebase.auth();

            // Sign in anonymously
            await this.signInAnonymously();

            console.log('✅ Firebase initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Firebase initialization failed:', error);
            return false;
        }
    },

    /**
     * Sign in anonymously
     * @returns {Promise<Object>} User object
     */
    async signInAnonymously() {
        try {
            const result = await this.auth.signInAnonymously();
            this.currentUser = result.user;
            console.log('✅ Signed in anonymously:', this.currentUser.uid);
            return this.currentUser;
        } catch (error) {
            console.error('❌ Anonymous sign-in failed:', error);
            throw error;
        }
    },

    /**
     * Get current user ID
     * @returns {string|null} User ID
     */
    getUserId() {
        return this.currentUser ? this.currentUser.uid : null;
    },

    /**
     * Get database reference
     * @param {string} path - Database path
     * @returns {Object} Database reference
     */
    ref(path) {
        return this.database.ref(path);
    },

    /**
     * Generate unique room code
     * @returns {string} 6-character room code
     */
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
};
