/**
 * Who Is the Impostor? - Reactive State Store ES Module
 * Simple reactive state management for game state
 */

/**
 * Create a reactive store
 * @param {Object} initialState - Initial state object
 * @returns {Object} Store with getState, setState, subscribe, and select methods
 */
export function createStore(initialState) {
    let state = { ...initialState };
    const listeners = new Set();

    return {
        /**
         * Get current state
         * @returns {Object} Current state
         */
        getState() {
            return state;
        },

        /**
         * Update state (shallow merge)
         * @param {Object|Function} updates - Updates object or updater function
         */
        setState(updates) {
            const newUpdates = typeof updates === 'function'
                ? updates(state)
                : updates;
            state = { ...state, ...newUpdates };
            listeners.forEach(fn => fn(state));
        },

        /**
         * Subscribe to state changes
         * @param {Function} listener - Callback when state changes
         * @returns {Function} Unsubscribe function
         */
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        /**
         * Select a portion of state and subscribe to changes
         * @param {Function} selector - Function to select state slice
         * @param {Function} listener - Callback when selected state changes
         * @returns {Function} Unsubscribe function
         */
        select(selector, listener) {
            let previousValue = selector(state);

            return this.subscribe((newState) => {
                const newValue = selector(newState);
                if (newValue !== previousValue) {
                    previousValue = newValue;
                    listener(newValue);
                }
            });
        },

        /**
         * Reset state to initial values
         */
        reset() {
            state = { ...initialState };
            listeners.forEach(fn => fn(state));
        }
    };
}

// Initial game state
const initialGameState = {
    phase: 'home',
    joinRoomCode: null,
    isOnline: typeof navigator === 'undefined' ? true : navigator.onLine
};

// Create and export the game store
export const gameStore = createStore(initialGameState);

// Initial room state
const initialRoomState = {
    currentRoom: null,
    mySecret: null,
    myVote: null,
    roomCode: null,
    isHost: false,
    playerId: null,
    playerName: null,
    connectionStatus: 'idle'
};

// Create and export the room store
export const roomStore = createStore(initialRoomState);

// Convenience exports for direct state access
export function getGameState() {
    return gameStore.getState();
}

export function setGameState(updates) {
    gameStore.setState(updates);
}

export function getRoomState() {
    return roomStore.getState();
}

export function setRoomState(updates) {
    roomStore.setState(updates);
}
