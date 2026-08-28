/**
 * Who Is the Impostor? - Utility Functions ES Module
 */

/**
 * Get avatar emoji based on index
 * @param {number} index - Player index
 * @returns {string} Avatar emoji
 */
export function getAvatar(index) {
    const avatars = ['😀', '😎', '🤠', '🥳', '😈', '🤖', '👻', '🦊', '🐱', '🐶', '🦁', '🐸'];
    return avatars[index % avatars.length];
}

/**
 * Escape untrusted text before inserting it into an HTML template.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
    const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

/**
 * Create element with classes and attributes
 * @param {string} tag - HTML tag
 * @param {Object} options - Element options
 * @returns {HTMLElement} Created element
 */
export function createElement(tag, options = {}) {
    const el = document.createElement(tag);

    if (options.className) el.className = options.className;
    if (options.id) el.id = options.id;
    if (options.text) el.textContent = options.text;
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
}

/**
 * Save to localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
export function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        console.warn('localStorage not available');
    }
}

/**
 * Load from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default if not found
 * @returns {*} Stored value or default
 */
export function loadFromStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
}
