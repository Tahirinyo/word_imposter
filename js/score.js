/**
 * Word Imposter - Score & Statistics Module
 * Tracks player scores and game statistics
 */

const Score = {
    // Current session stats
    session: {
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        citizenWins: 0,
        imposterWins: 0,
        mrWhiteWins: 0
    },

    // All-time stats (persisted)
    allTime: {
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        citizenWins: 0,
        imposterWins: 0,
        mrWhiteWins: 0,
        totalPlayTime: 0,  // in minutes
        longestWinStreak: 0,
        currentWinStreak: 0
    },

    // Game start time for tracking play time
    gameStartTime: null,

    /**
     * Initialize score system
     */
    init() {
        this.loadStats();
        console.log('🏆 Score module initialized');
    },

    /**
     * Load stats from localStorage
     */
    loadStats() {
        try {
            const saved = localStorage.getItem('gameStats');
            if (saved) {
                this.allTime = { ...this.allTime, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Failed to load stats:', e);
        }
    },

    /**
     * Save stats to localStorage
     */
    saveStats() {
        try {
            localStorage.setItem('gameStats', JSON.stringify(this.allTime));
        } catch (e) {
            console.warn('Failed to save stats:', e);
        }
    },

    /**
     * Start tracking a new game
     */
    startGame() {
        this.gameStartTime = Date.now();
    },

    /**
     * Record game result
     * @param {string} result - 'win' or 'lose'
     * @param {string} myRole - 'citizen', 'imposter', or 'mrwhite'
     * @param {string} winnerType - 'citizens' or 'imposters'
     */
    recordGame(result, myRole, winnerType) {
        // Update session
        this.session.gamesPlayed++;

        // Update all-time
        this.allTime.gamesPlayed++;

        if (result === 'win') {
            this.session.gamesWon++;
            this.allTime.gamesWon++;
            this.allTime.currentWinStreak++;

            if (this.allTime.currentWinStreak > this.allTime.longestWinStreak) {
                this.allTime.longestWinStreak = this.allTime.currentWinStreak;
            }

            // Track role-specific wins
            if (myRole === 'citizen') {
                this.session.citizenWins++;
                this.allTime.citizenWins++;
            } else if (myRole === 'imposter') {
                this.session.imposterWins++;
                this.allTime.imposterWins++;
            } else if (myRole === 'mrwhite') {
                this.session.mrWhiteWins++;
                this.allTime.mrWhiteWins++;
            }
        } else {
            this.session.gamesLost++;
            this.allTime.gamesLost++;
            this.allTime.currentWinStreak = 0;
        }

        // Track play time
        if (this.gameStartTime) {
            const playTime = Math.round((Date.now() - this.gameStartTime) / 60000);
            this.allTime.totalPlayTime += playTime;
            this.gameStartTime = null;
        }

        this.saveStats();
    },

    /**
     * Get win rate percentage
     * @returns {number} Win rate (0-100)
     */
    getWinRate() {
        if (this.allTime.gamesPlayed === 0) return 0;
        return Math.round((this.allTime.gamesWon / this.allTime.gamesPlayed) * 100);
    },

    /**
     * Get formatted play time
     * @returns {string} Formatted time string
     */
    getPlayTime() {
        const minutes = this.allTime.totalPlayTime;
        if (minutes < 60) return `${minutes} dk`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours} sa ${mins} dk`;
    },

    /**
     * Get stats summary object
     * @returns {Object} Stats summary
     */
    getSummary() {
        return {
            gamesPlayed: this.allTime.gamesPlayed,
            gamesWon: this.allTime.gamesWon,
            gamesLost: this.allTime.gamesLost,
            winRate: this.getWinRate(),
            playTime: this.getPlayTime(),
            longestStreak: this.allTime.longestWinStreak,
            currentStreak: this.allTime.currentWinStreak,
            roleWins: {
                citizen: this.allTime.citizenWins,
                imposter: this.allTime.imposterWins,
                mrwhite: this.allTime.mrWhiteWins
            }
        };
    },

    /**
     * Reset all stats
     */
    resetStats() {
        this.session = {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            citizenWins: 0,
            imposterWins: 0,
            mrWhiteWins: 0
        };

        this.allTime = {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            citizenWins: 0,
            imposterWins: 0,
            mrWhiteWins: 0,
            totalPlayTime: 0,
            longestWinStreak: 0,
            currentWinStreak: 0
        };

        this.saveStats();
    },

    /**
     * Generate HTML for stats display
     * @returns {string} HTML string
     */
    renderStatsHTML() {
        const stats = this.getSummary();

        return `
            <div class="stats-container">
                <h3 class="stats-title">📊 İstatistikler</h3>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.gamesPlayed}</div>
                        <div class="stat-label">Toplam Oyun</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.winRate}%</div>
                        <div class="stat-label">Kazanma Oranı</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.gamesWon}</div>
                        <div class="stat-label">Kazanılan</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.gamesLost}</div>
                        <div class="stat-label">Kaybedilen</div>
                    </div>
                </div>
                
                <div class="stats-details">
                    <div class="stat-row">
                        <span>🔥 En Uzun Seri:</span>
                        <span>${stats.longestStreak} oyun</span>
                    </div>
                    <div class="stat-row">
                        <span>⏱️ Toplam Süre:</span>
                        <span>${stats.playTime}</span>
                    </div>
                </div>
                
                <h4 class="stats-subtitle">Role Göre Kazanımlar</h4>
                <div class="role-stats">
                    <div class="role-stat citizen">
                        <span class="role-icon">👤</span>
                        <span class="role-name">Vatandaş</span>
                        <span class="role-count">${stats.roleWins.citizen}</span>
                    </div>
                    <div class="role-stat imposter">
                        <span class="role-icon">🎭</span>
                        <span class="role-name">Hain</span>
                        <span class="role-count">${stats.roleWins.imposter}</span>
                    </div>
                    <div class="role-stat mrwhite">
                        <span class="role-icon">❓</span>
                        <span class="role-name">Gizemli</span>
                        <span class="role-count">${stats.roleWins.mrwhite}</span>
                    </div>
                </div>
            </div>
        `;
    }
};

// Initialize on load
Score.init();
