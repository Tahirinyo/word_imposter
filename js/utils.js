/**
 * Word Imposter - Utility Functions
 */

const Utils = {
    /**
     * Fisher-Yates Shuffle Algorithm
     * Randomly shuffles an array in-place
     * @param {Array} array - Array to shuffle
     * @returns {Array} Shuffled array (new array)
     */
    shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    },

    /**
     * Generate unique ID
     * @returns {string} Unique identifier
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Get initials from name
     * @param {string} name - Full name
     * @returns {string} First letter uppercase
     */
    getInitials(name) {
        return name.charAt(0).toUpperCase();
    },

    /**
     * Get avatar emoji based on index
     * @param {number} index - Player index
     * @returns {string} Avatar emoji
     */
    getAvatar(index) {
        const avatars = ['😀', '😎', '🤠', '🥳', '😈', '🤖', '👻', '🦊', '🐱', '🐶', '🦁', '🐸'];
        return avatars[index % avatars.length];
    },

    /**
     * Create element with classes and attributes
     * @param {string} tag - HTML tag
     * @param {Object} options - Element options
     * @returns {HTMLElement} Created element
     */
    createElement(tag, options = {}) {
        const el = document.createElement(tag);

        if (options.className) el.className = options.className;
        if (options.id) el.id = options.id;
        if (options.text) el.textContent = options.text;
        if (options.html) el.innerHTML = options.html;
        if (options.attrs) {
            Object.entries(options.attrs).forEach(([key, value]) => {
                el.setAttribute(key, value);
            });
        }
        if (options.events) {
            Object.entries(options.events).forEach(([event, handler]) => {
                el.addEventListener(event, handler);
            });
        }
        if (options.children) {
            options.children.forEach(child => el.appendChild(child));
        }

        return el;
    },

    /**
     * Format countdown timer
     * @param {number} seconds - Seconds remaining
     * @returns {string} Formatted time
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Delay execution
     * @param {number} ms - Milliseconds
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Save to localStorage
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     */
    saveToStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('localStorage not available');
        }
    },

    /**
     * Load from localStorage
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default if not found
     * @returns {*} Stored value or default
     */
    loadFromStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }
};
