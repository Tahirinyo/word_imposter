/**
 * Word Imposter - Game Logic
 * Core game state management and rules
 */

const Game = {
    // Game state
    state: {
        phase: 'home', // home, category, players, reveal, lobby, voting, elimination, gameover
        settings: {
            language: 'tr',
            theme: 'dark'
        },
        category: null,
        selectedCategories: [], // Array of selected category names
        wordPair: null,
        players: [],
        roleConfig: {
            imposterCount: 1,
            mrWhiteCount: 0
        },
        currentRevealIndex: 0,
        selectedVote: null,
        eliminatedPlayer: null,
        winner: null,
        roundNumber: 1
    },

    /**
     * Initialize game
     */
    init() {
        this.loadSettings();
    },

    /**
     * Load saved settings
     */
    loadSettings() {
        const saved = Utils.loadFromStorage('wordImposterSettings');
        if (saved) {
            this.state.settings = { ...this.state.settings, ...saved };
        }
    },

    /**
     * Save settings
     */
    saveSettings() {
        Utils.saveToStorage('wordImposterSettings', this.state.settings);
    },

    /**
     * Reset game to initial state
     */
    reset() {
        this.state.phase = 'home';
        this.state.category = null;
        this.state.selectedCategories = [];
        this.state.wordPair = null;
        this.state.players = [];
        this.state.roleConfig = { imposterCount: 1, mrWhiteCount: 0 };
        this.state.currentRevealIndex = 0;
        this.state.selectedVote = null;
        this.state.eliminatedPlayer = null;
        this.state.winner = null;
        this.state.roundNumber = 1;
    },

    /**
     * Set phase
     * @param {string} phase - New phase
     */
    setPhase(phase) {
        this.state.phase = phase;
    },



    /**
     * Toggle a category in selectedCategories
     * @param {string} category - Category name
     */
    toggleCategory(category) {
        const index = this.state.selectedCategories.indexOf(category);
        if (index === -1) {
            this.state.selectedCategories.push(category);
        } else {
            this.state.selectedCategories.splice(index, 1);
        }
    },

    /**
     * Select all categories
     */
    selectAllCategories() {
        this.state.selectedCategories = [...GameData.categories];
    },

    /**
     * Deselect all categories
     */
    deselectAllCategories() {
        this.state.selectedCategories = [];
    },

    /**
     * Check if a category is selected
     * @param {string} category - Category name
     * @returns {boolean}
     */
    isCategorySelected(category) {
        return this.state.selectedCategories.includes(category);
    },

    /**
     * Add player
     * @param {string} name - Player name
     * @returns {boolean} Success
     */
    addPlayer(name) {
        if (!name.trim()) return false;
        if (this.state.players.length >= 12) return false;
        if (this.state.players.some(p => p.name.toLowerCase() === name.toLowerCase().trim())) {
            return false;
        }

        this.state.players.push({
            id: Utils.generateId(),
            name: name.trim(),
            role: null,
            word: null,
            alive: true,
            hasSeenRole: false
        });

        return true;
    },

    /**
     * Remove player
     * @param {string} id - Player ID
     */
    removePlayer(id) {
        this.state.players = this.state.players.filter(p => p.id !== id);
    },

    /**
     * Get maximum imposters allowed
     * @returns {number} Max imposter count
     */
    getMaxImposters() {
        const total = this.state.players.length;
        return Math.max(0, Math.floor((total - 1) / 2));
    },

    /**
     * Get maximum Mr. White allowed
     * @returns {number} Max Mr. White count
     */
    getMaxMrWhite() {
        const total = this.state.players.length;
        const imposters = this.state.roleConfig.imposterCount;
        return Math.max(0, Math.floor((total - imposters - 1) / 2));
    },

    /**
     * Update role configuration
     * @param {string} role - 'imposter' or 'mrwhite'
     * @param {number} delta - Change amount (-1 or 1)
     */
    updateRoleConfig(role, delta) {
        if (role === 'imposter') {
            const newCount = this.state.roleConfig.imposterCount + delta;
            if (newCount >= 1 && newCount <= this.getMaxImposters()) {
                this.state.roleConfig.imposterCount = newCount;
                // Adjust Mr. White if needed
                const maxMrWhite = this.getMaxMrWhite();
                if (this.state.roleConfig.mrWhiteCount > maxMrWhite) {
                    this.state.roleConfig.mrWhiteCount = maxMrWhite;
                }
            }
        } else if (role === 'mrwhite') {
            const newCount = this.state.roleConfig.mrWhiteCount + delta;
            if (newCount >= 0 && newCount <= this.getMaxMrWhite()) {
                this.state.roleConfig.mrWhiteCount = newCount;
            }
        }
    },

    /**
     * Check if game can start
     * @returns {Object} { canStart: boolean, error: string }
     */
    canStartGame() {
        const playerCount = this.state.players.length;

        if (playerCount < 3) {
            return { canStart: false, error: 'En az 3 oyuncu gerekli' };
        }

        if (this.state.selectedCategories.length === 0) {
            return { canStart: false, error: 'Kategori seçilmedi' };
        }

        const totalBadGuys = this.state.roleConfig.imposterCount + this.state.roleConfig.mrWhiteCount;
        if (totalBadGuys >= playerCount) {
            return { canStart: false, error: 'Çok fazla Hain/Gizemli' };
        }

        return { canStart: true, error: null };
    },

    /**
     * Distribute roles and words
     */
    distributeRoles() {
        // Get random word pair from selected categories
        const categories = this.state.selectedCategories.length > 0
            ? this.state.selectedCategories
            : null;
        this.state.wordPair = GameData.getRandomWordPairFromCategories(categories);

        // Create roles array
        const roles = [];
        const playerCount = this.state.players.length;
        const { imposterCount, mrWhiteCount } = this.state.roleConfig;
        const citizenCount = playerCount - imposterCount - mrWhiteCount;

        for (let i = 0; i < citizenCount; i++) roles.push('citizen');
        for (let i = 0; i < imposterCount; i++) roles.push('imposter');
        for (let i = 0; i < mrWhiteCount; i++) roles.push('mrwhite');

        // Shuffle roles
        const shuffledRoles = Utils.shuffle(roles);

        // Assign to players
        this.state.players.forEach((player, index) => {
            player.role = shuffledRoles[index];
            player.hasSeenRole = false;
            player.alive = true;

            // Assign word based on role
            switch (player.role) {
                case 'citizen':
                    player.word = this.state.wordPair.citizenWord;
                    break;
                case 'imposter':
                    player.word = this.state.wordPair.imposterWord;
                    break;
                case 'mrwhite':
                    player.word = null; // Mr. White doesn't know the word
                    break;
            }
        });

        // Shuffle player order for reveal
        this.state.players = Utils.shuffle(this.state.players);
        this.state.currentRevealIndex = 0;
    },

    /**
     * Get current player for reveal
     * @returns {Object|null} Current player
     */
    getCurrentRevealPlayer() {
        if (this.state.currentRevealIndex >= this.state.players.length) {
            return null;
        }
        return this.state.players[this.state.currentRevealIndex];
    },

    /**
     * Mark current player as seen and move to next
     * @returns {boolean} True if more players remain
     */
    nextReveal() {
        if (this.state.currentRevealIndex < this.state.players.length) {
            this.state.players[this.state.currentRevealIndex].hasSeenRole = true;
            this.state.currentRevealIndex++;
        }
        return this.state.currentRevealIndex < this.state.players.length;
    },

    /**
     * Get alive players
     * @returns {Array} Alive players
     */
    getAlivePlayers() {
        return this.state.players.filter(p => p.alive);
    },

    /**
     * Select vote target
     * @param {string} playerId - Target player ID
     */
    selectVote(playerId) {
        this.state.selectedVote = playerId;
    },

    /**
     * Execute elimination
     * @returns {Object} Eliminated player
     */
    executeElimination() {
        const player = this.state.players.find(p => p.id === this.state.selectedVote);
        if (player) {
            player.alive = false;
            this.state.eliminatedPlayer = player;
        }
        this.state.selectedVote = null;
        return player;
    },

    /**
     * Check win condition
     * @returns {string|null} 'citizens', 'imposters', or null
     */
    checkWinCondition() {
        const alive = this.getAlivePlayers();
        const aliveCitizens = alive.filter(p => p.role === 'citizen').length;
        const aliveImposters = alive.filter(p => p.role === 'imposter').length;
        const aliveMrWhite = alive.filter(p => p.role === 'mrwhite').length;
        const aliveBadGuys = aliveImposters + aliveMrWhite;

        // Citizens win if all bad guys are eliminated
        if (aliveBadGuys === 0) {
            return 'citizens';
        }

        // Bad guys win if citizens <= bad guys
        if (aliveCitizens <= aliveBadGuys) {
            return 'imposters';
        }

        return null;
    },

    /**
     * Process round after elimination
     * @returns {string} 'continue' or winner type
     */
    processRound() {
        const winner = this.checkWinCondition();
        if (winner) {
            this.state.winner = winner;
            return winner;
        }
        this.state.roundNumber++;
        return 'continue';
    },

    restartWithNewWord() {
        this.state.roundNumber = 1;
        this.state.eliminatedPlayer = null;
        this.state.winner = null;
        this.distributeRoles();
        this.state.phase = 'reveal';
    }
};
