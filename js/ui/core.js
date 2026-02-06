/**
 * Word Imposter - UI Core Module
 * Base initialization, rendering, and utility functions
 */

const UI = {
    app: null,

    /**
     * Initialize UI
     */
    init() {
        this.app = document.getElementById('app');
    },

    /**
     * Clear app container
     */
    clear() {
        this.app.innerHTML = '';
    },

    /**
     * Render based on current phase
     */
    render() {
        this.clear();

        // Check if in a room
        if (Room.roomCode) {
            this.renderMultiplayerPhase();
        } else {
            this.renderSinglePlayerPhase();
        }
    },

    /**
     * Render single player / menu phases
     */
    renderSinglePlayerPhase() {
        switch (Game.state.phase) {
            case 'home':
                this.renderHome();
                break;
            case 'join':
                this.renderJoinRoom();
                break;
            case 'create':
                this.renderCreateRoom();
                break;
            case 'category':
                this.renderCategorySelect();
                break;
            case 'players':
                this.renderPlayerSetup();
                break;
            case 'reveal':
                this.renderRoleReveal();
                break;
            case 'lobby':
                this.renderLobby();
                break;
            case 'voting':
                this.renderVoting();
                break;
            case 'elimination':
                this.renderElimination();
                break;
            case 'gameover':
                this.renderGameOver();
                break;
            default:
                this.renderHome();
        }
    },

    /**
     * Render multiplayer phases (when in a room)
     */
    renderMultiplayerPhase() {
        const room = Room.currentRoom;
        if (!room) {
            this.renderHome();
            return;
        }

        const phase = room.gameState?.phase || 'waiting';

        switch (phase) {
            case 'waiting':
                this.renderWaitingRoom();
                break;
            case 'category':
                this.renderMultiplayerCategorySelect();
                break;
            case 'reveal':
                this.renderMultiplayerReveal();
                break;
            case 'lobby':
                this.renderMultiplayerLobby();
                break;
            case 'voting':
                this.renderMultiplayerVoting();
                break;
            case 'elimination':
                this.renderMultiplayerElimination();
                break;
            case 'gameover':
                this.renderMultiplayerGameOver();
                break;
            default:
                this.renderWaitingRoom();
        }
    },

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        const toast = Utils.createElement('div', {
            className: 'toast toast-error',
            innerHTML: `<span>❌</span> ${message}`
        });
        this.app.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        const toast = Utils.createElement('div', {
            className: 'toast toast-success',
            innerHTML: `<span>✅</span> ${message}`
        });
        this.app.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};
