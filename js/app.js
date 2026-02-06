/**
 * Word Imposter - Main Application
 * Entry point and initialization
 */

(async function () {
    'use strict';

    // Initialize application
    async function init() {
        console.log('🎭 Word Imposter - Kelime Casusları');
        console.log('Loading...');

        // Load word data
        await GameData.loadWords();

        // Initialize Firebase
        const firebaseReady = await FirebaseConfig.init();
        if (!firebaseReady) {
            console.error('Firebase initialization failed - running in offline mode');
        }

        // Check for room code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');

        if (roomCode && firebaseReady) {
            // User is joining via link
            Game.state.joinRoomCode = roomCode.toUpperCase();
            Game.state.phase = 'join';
        }

        // Set up room update callback
        Room.onRoomUpdate = (roomData) => {
            // Sync game state from Firebase
            if (roomData.gameState) {
                Game.state.phase = roomData.gameState.phase || 'waiting';
            }

            // Host Logic: Check verify completion
            if (Room.isHost && Game.state.phase === 'reveal' && roomData.players) {
                Room.checkAndAdvanceIfAllSeen(roomData.players);
            }

            // Re-render UI on any room update
            UI.render();
        };

        // Initialize game state
        Game.init();

        // Initialize UI
        UI.init();

        // Render initial screen
        UI.render();

        console.log('✅ Game ready!');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
