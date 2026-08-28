/**
 * Who Is the Impostor? - UI Renderer ES Module
 * Central rendering logic that routes to appropriate screen
 */

import { clear, createElement, getApp, getGameState, getRoomState } from './core.js';
import { renderHome, renderCreateRoom, renderJoinRoom } from './home.js';
import { renderWaitingRoom, renderMultiplayerCategorySelect } from './lobby.js';
import {
    renderMultiplayerReveal,
    renderMultiplayerLobby,
    renderMultiplayerVoting,
    renderMultiplayerElimination,
    renderMultiplayerGameOver
} from './game.js';

/**
 * Main render function - routes to appropriate screen
 */
export function render() {
    clear();

    const { roomCode } = getRoomState();

    // Check if in a room
    if (roomCode) {
        renderMultiplayerPhase();
    } else {
        renderSinglePlayerPhase();
    }

    renderConnectionBanner();
}

/**
 * Render single player / menu phases
 */
function renderSinglePlayerPhase() {
    const { phase } = getGameState();

    switch (phase) {
        case 'home':
            renderHome();
            break;
        case 'join':
            renderJoinRoom();
            break;
        case 'create':
            renderCreateRoom();
            break;
        default:
            renderHome();
    }
}

/**
 * Render multiplayer phases (when in a room)
 */
function renderMultiplayerPhase() {
    const { currentRoom } = getRoomState();

    if (!currentRoom) {
        renderRoomLoading();
        return;
    }

    const phase = currentRoom.gameState?.phase || 'waiting';

    switch (phase) {
        case 'waiting':
            renderWaitingRoom();
            break;
        case 'category':
            renderMultiplayerCategorySelect();
            break;
        case 'starting':
            renderRoomLoading('Oyun hazırlanıyor…');
            break;
        case 'reveal':
            renderMultiplayerReveal();
            break;
        case 'lobby':
            renderMultiplayerLobby();
            break;
        case 'voting':
            renderMultiplayerVoting();
            break;
        case 'elimination':
            renderMultiplayerElimination();
            break;
        case 'gameover':
            renderMultiplayerGameOver();
            break;
        default:
            renderRoomLoading('Oyun durumu eşitleniyor…');
    }
}

function renderRoomLoading(message = 'Odaya bağlanılıyor…') {
    const screen = createElement('main', { className: 'screen loading-screen' });
    screen.append(
        createElement('div', { className: 'loading-spinner', text: '◌', attrs: { 'aria-hidden': 'true' } }),
        createElement('p', { className: 'subtitle', text: message })
    );
    getApp()?.appendChild(screen);
}

function renderConnectionBanner() {
    const { isOnline } = getGameState();
    const { connectionStatus } = getRoomState();
    if (isOnline && connectionStatus !== 'reconnecting') return;

    const banner = createElement('div', {
        className: 'connection-banner',
        text: isOnline ? 'Bağlantı yeniden kuruluyor…' : 'Çevrimdışısınız — bağlantı bekleniyor…',
        attrs: { role: 'status', 'aria-live': 'polite' }
    });
    getApp()?.prepend(banner);
}
