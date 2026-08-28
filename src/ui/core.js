/**
 * Who Is the Impostor? - UI Core ES Module
 * Base initialization, rendering, and utility functions
 */

import { createElement } from '../lib/utils.js';
import { feedback, isSoundEnabled, isVibrationEnabled, isVibrationSupported, toggleSound, toggleVibration } from '../lib/audio.js';
import { getGameState, setGameState, getRoomState } from '../game/state.js';
import { GameData, roleNames } from '../data/index.js';

// App container reference
let app = null;

/**
 * Initialize UI
 */
export function initUI() {
    app = document.getElementById('app');
    if (!app) {
        console.error('❌ App container not found');
        return;
    }
}

/**
 * Get app container
 */
export function getApp() {
    return app;
}

/**
 * Clear app container
 */
export function clear() {
    if (app) app.innerHTML = '';
}

/**
 * Show error toast
 * @param {string} message - Error message
 */
export function showError(message) {
    showToast(message, 'error');
}

/**
 * Show success toast
 * @param {string} message - Success message
 */
export function showSuccess(message) {
    showToast(message, 'success');
}

export function showFatalError(message) {
    clear();
    const screen = createElement('main', { className: 'screen error-state' });
    const icon = createElement('div', { className: 'error-state-icon', text: '!' });
    const title = createElement('h1', { className: 'title', text: 'Bağlantı kurulamadı' });
    const description = createElement('p', { className: 'subtitle', text: String(message) });
    const retry = createElement('button', {
        className: 'btn btn-primary btn-lg',
        text: 'Tekrar Dene',
        events: { click: () => window.location.reload() }
    });
    screen.append(icon, title, description, retry);
    app?.appendChild(screen);
}

function showToast(message, type) {
    if (!app) return;
    const toast = createElement('div', {
        className: `toast toast-${type}`,
        attrs: { role: type === 'error' ? 'alert' : 'status', 'aria-live': 'polite' }
    });
    toast.append(
        createElement('span', { text: type === 'error' ? '×' : '✓', attrs: { 'aria-hidden': 'true' } }),
        createElement('span', { text: String(message) })
    );
    app.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Re-export commonly used items for convenience
export { createElement, feedback, GameData, roleNames };
export { isSoundEnabled, isVibrationEnabled, isVibrationSupported, toggleSound, toggleVibration };
export { getGameState, setGameState, getRoomState };
