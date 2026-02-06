/**
 * Word Imposter - Room Management
 * Handles multiplayer room creation, joining, and synchronization
 */

const Room = {
    // Current room data
    currentRoom: null,
    roomCode: null,
    isHost: false,
    playerId: null,
    playerName: null,

    // Firebase listeners
    roomListener: null,
    presenceListener: null,

    /**
     * Create a new room
     * @param {string} hostName - Host player name
     * @returns {Promise<string>} Room code
     */
    async createRoom(hostName) {
        const roomCode = FirebaseConfig.generateRoomCode();
        const playerId = FirebaseConfig.getUserId();

        const roomData = {
            id: roomCode,
            hostId: playerId,
            status: 'waiting', // waiting, playing, finished
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            settings: {
                selectedCategories: [],
                imposterCount: 1,
                mrWhiteCount: 0
            },
            players: {
                [playerId]: {
                    id: playerId,
                    name: hostName,
                    connected: true,
                    role: null,
                    word: null,
                    hasSeenRole: false,
                    joinedAt: firebase.database.ServerValue.TIMESTAMP
                }
            },
            gameState: {
                phase: 'waiting',
                wordPair: null,
                currentRevealIndex: 0,
                roundNumber: 1,
                eliminatedPlayerId: null,
                selectedVote: null,
                winner: null
            }
        };

        try {
            // Check if room code already exists
            const snapshot = await FirebaseConfig.ref(`rooms/${roomCode}`).once('value');
            if (snapshot.exists()) {
                // Rare collision, generate new code
                return this.createRoom(hostName);
            }

            // Create room
            await FirebaseConfig.ref(`rooms/${roomCode}`).set(roomData);

            // Set up presence
            this.setupPresence(roomCode, playerId);

            // Subscribe to room updates
            this.subscribeToRoom(roomCode);

            this.roomCode = roomCode;
            this.isHost = true;
            this.playerId = playerId;
            this.playerName = hostName;

            console.log('✅ Room created:', roomCode);
            return roomCode;
        } catch (error) {
            console.error('❌ Failed to create room:', error);
            throw error;
        }
    },

    /**
     * Join an existing room
     * @param {string} roomCode - Room code to join
     * @param {string} playerName - Player name
     * @returns {Promise<boolean>} Success status
     */
    async joinRoom(roomCode, playerName) {
        const playerId = FirebaseConfig.getUserId();
        roomCode = roomCode.toUpperCase().trim();

        try {
            // Check if room exists
            const snapshot = await FirebaseConfig.ref(`rooms/${roomCode}`).once('value');
            if (!snapshot.exists()) {
                throw new Error('Oda bulunamadı');
            }

            const roomData = snapshot.val();

            // Check if room is still waiting
            if (roomData.status !== 'waiting') {
                throw new Error('Oyun zaten başlamış');
            }

            // Check player count
            const playerCount = Object.keys(roomData.players || {}).length;
            if (playerCount >= 12) {
                throw new Error('Oda dolu (max 12 oyuncu)');
            }

            // Check if name is taken
            const names = Object.values(roomData.players || {}).map(p => p.name.toLowerCase());
            if (names.includes(playerName.toLowerCase())) {
                throw new Error('Bu isim zaten kullanılıyor');
            }

            // Add player to room
            const playerData = {
                id: playerId,
                name: playerName,
                connected: true,
                role: null,
                word: null,
                hasSeenRole: false,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            };

            await FirebaseConfig.ref(`rooms/${roomCode}/players/${playerId}`).set(playerData);

            // Set up presence
            this.setupPresence(roomCode, playerId);

            // Subscribe to room updates
            this.subscribeToRoom(roomCode);

            this.roomCode = roomCode;
            this.isHost = roomData.hostId === playerId;
            this.playerId = playerId;
            this.playerName = playerName;

            console.log('✅ Joined room:', roomCode);
            return true;
        } catch (error) {
            console.error('❌ Failed to join room:', error);
            throw error;
        }
    },

    /**
     * Set up presence tracking
     * @param {string} roomCode - Room code
     * @param {string} playerId - Player ID
     */
    setupPresence(roomCode, playerId) {
        const presenceRef = FirebaseConfig.ref(`rooms/${roomCode}/players/${playerId}/connected`);
        const connectedRef = FirebaseConfig.ref('.info/connected');

        this.presenceListener = connectedRef.on('value', (snapshot) => {
            if (snapshot.val() === true) {
                // Set connected to true
                presenceRef.set(true);
                // On disconnect, set to false
                presenceRef.onDisconnect().set(false);
            }
        });
    },

    /**
     * Subscribe to room updates
     * @param {string} roomCode - Room code
     */
    subscribeToRoom(roomCode) {
        const roomRef = FirebaseConfig.ref(`rooms/${roomCode}`);

        this.roomListener = roomRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                this.currentRoom = snapshot.val();
                this.onRoomUpdate(this.currentRoom);
            } else {
                // Room was deleted
                this.onRoomDeleted();
            }
        });
    },

    /**
     * Callback when room updates - to be overridden by UI
     * @param {Object} roomData - Updated room data
     */
    onRoomUpdate(roomData) {
        // This will be overridden by UI
        console.log('Room updated:', roomData);
    },

    /**
     * Callback when room is deleted
     */
    onRoomDeleted() {
        console.log('Room was deleted');
        this.leaveRoom();
    },

    /**
     * Leave current room
     */
    async leaveRoom() {
        if (this.roomCode && this.playerId) {
            // Remove listeners
            if (this.roomListener) {
                FirebaseConfig.ref(`rooms/${this.roomCode}`).off('value', this.roomListener);
            }
            if (this.presenceListener) {
                FirebaseConfig.ref('.info/connected').off('value', this.presenceListener);
            }

            // Remove player from room
            await FirebaseConfig.ref(`rooms/${this.roomCode}/players/${this.playerId}`).remove();

            // If host leaves and room is waiting, delete room
            if (this.isHost && this.currentRoom?.status === 'waiting') {
                await FirebaseConfig.ref(`rooms/${this.roomCode}`).remove();
            }
        }

        this.currentRoom = null;
        this.roomCode = null;
        this.isHost = false;
        this.playerId = null;
        this.playerName = null;
    },

    /**
     * Update room settings (host only)
     * @param {Object} settings - Settings object
     */
    async updateSettings(settings) {
        if (!this.isHost || !this.roomCode) return;

        await FirebaseConfig.ref(`rooms/${this.roomCode}/settings`).update(settings);
    },

    /**
     * Start the game (host only)
     * Distributes roles and words to all players
     */
    async startGame() {
        if (!this.isHost || !this.roomCode) return;

        const room = this.currentRoom;
        const players = Object.values(room.players || {});

        if (players.length < 3) {
            throw new Error('En az 3 oyuncu gerekli');
        }

        if (room.settings.selectedCategories.length === 0) {
            throw new Error('Kategori seçilmedi');
        }

        // Get random word pair
        const wordPair = GameData.getRandomWordPairFromCategories(room.settings.selectedCategories);
        if (!wordPair) {
            throw new Error('Kelime bulunamadı');
        }

        // Create roles array
        const { imposterCount, mrWhiteCount } = room.settings;
        const citizenCount = players.length - imposterCount - mrWhiteCount;

        const roles = [];
        for (let i = 0; i < citizenCount; i++) roles.push('citizen');
        for (let i = 0; i < imposterCount; i++) roles.push('imposter');
        for (let i = 0; i < mrWhiteCount; i++) roles.push('mrwhite');

        // Shuffle roles
        const shuffledRoles = Utils.shuffle(roles);

        // Shuffle players for reveal order
        const shuffledPlayers = Utils.shuffle(players);

        // Prepare updates
        const updates = {};

        shuffledPlayers.forEach((player, index) => {
            const role = shuffledRoles[index];
            let word = null;

            switch (role) {
                case 'citizen':
                    word = wordPair.citizenWord;
                    break;
                case 'imposter':
                    word = wordPair.imposterWord;
                    break;
                case 'mrwhite':
                    word = null;
                    break;
            }

            updates[`players/${player.id}/role`] = role;
            updates[`players/${player.id}/word`] = word;
            updates[`players/${player.id}/hasSeenRole`] = false;
            updates[`players/${player.id}/alive`] = true;
            updates[`players/${player.id}/revealOrder`] = index;
        });

        updates['status'] = 'playing';
        updates['gameState/phase'] = 'reveal';
        updates['gameState/wordPair'] = wordPair;
        updates['gameState/currentRevealIndex'] = 0;
        updates['gameState/roundNumber'] = 1;
        updates['gameState/revealOrder'] = shuffledPlayers.map(p => p.id);

        await FirebaseConfig.ref(`rooms/${this.roomCode}`).update(updates);

        console.log('✅ Game started!');
    },

    /**
     * Mark current player as having seen their role
     * Also checks if all players have seen and advances phase if so
     */
    async markRoleSeen() {
        if (!this.roomCode || !this.playerId) return;

        // Mark this player as having seen
        await FirebaseConfig.ref(`rooms/${this.roomCode}/players/${this.playerId}/hasSeenRole`).set(true);

        // Fetch fresh data to check if everyone has seen
        const snapshot = await FirebaseConfig.ref(`rooms/${this.roomCode}/players`).once('value');
        const players = snapshot.val();

        if (players) {
            const allSeen = Object.values(players).every(p => p.hasSeenRole === true);
            if (allSeen) {
                // All players have seen their roles, advance to lobby (discussion)
                await FirebaseConfig.ref(`rooms/${this.roomCode}/gameState/phase`).set('lobby');
            }
        }
    },

    /**
     * Check if all players have seen their role and advance to lobby if so
     * Used as a fallback for page refresh scenarios
     */
    async checkAndAdvanceIfAllSeen(players = null) {
        if (!this.roomCode) return;

        // Only check if we're still in reveal phase
        if (this.currentRoom?.gameState?.phase !== 'reveal') return;

        // Use provided players data or fetch fresh
        if (!players) {
            const snapshot = await FirebaseConfig.ref(`rooms/${this.roomCode}/players`).once('value');
            players = snapshot.val();
        }

        if (players) {
            const allSeen = Object.values(players).every(p => p.hasSeenRole === true);
            if (allSeen) {
                // All players have seen their roles, advance to lobby (discussion)
                // Using update to be safe
                await FirebaseConfig.ref(`rooms/${this.roomCode}/gameState`).update({ phase: 'lobby' });
            }
        }
    },

    /**
     * Advance to next player reveal (host coordinates)
     */
    async nextReveal() {
        if (!this.roomCode) return;

        const room = this.currentRoom;
        const newIndex = (room.gameState.currentRevealIndex || 0) + 1;
        const totalPlayers = room.gameState.revealOrder?.length || 0;

        if (newIndex >= totalPlayers) {
            // All players have seen, go to lobby
            await FirebaseConfig.ref(`rooms/${this.roomCode}/gameState/phase`).set('lobby');
        } else {
            await FirebaseConfig.ref(`rooms/${this.roomCode}/gameState/currentRevealIndex`).set(newIndex);
        }
    },

    /**
     * Update game phase
     * @param {string} phase - New phase
     */
    async setPhase(phase) {
        if (!this.roomCode) return;
        await FirebaseConfig.ref(`rooms/${this.roomCode}/gameState/phase`).set(phase);
    },

    /**
     * Select vote target
     * @param {string} targetId - Target player ID
     */
    async selectVote(targetId) {
        if (!this.roomCode) return;
        await FirebaseConfig.ref(`rooms/${this.roomCode}/gameState/selectedVote`).set(targetId);
    },

    /**
     * Execute elimination
     */
    async executeElimination() {
        if (!this.roomCode) return;

        const room = this.currentRoom;
        const targetId = room.gameState.selectedVote;

        if (targetId) {
            const updates = {};
            updates[`players/${targetId}/alive`] = false;
            updates['gameState/eliminatedPlayerId'] = targetId;
            updates['gameState/selectedVote'] = null;
            updates['gameState/phase'] = 'elimination';

            await FirebaseConfig.ref(`rooms/${this.roomCode}`).update(updates);
        }
    },

    /**
     * Check win condition and process round
     * @returns {Promise<string>} 'continue' or winner type
     */
    async processRound() {
        if (!this.roomCode) return 'continue';

        const room = this.currentRoom;
        const players = Object.values(room.players || {});
        const alivePlayers = players.filter(p => p.alive !== false);

        const aliveCitizens = alivePlayers.filter(p => p.role === 'citizen').length;
        const aliveImposters = alivePlayers.filter(p => p.role === 'imposter').length;
        const aliveMrWhite = alivePlayers.filter(p => p.role === 'mrwhite').length;
        const aliveBadGuys = aliveImposters + aliveMrWhite;

        let winner = null;

        if (aliveBadGuys === 0) {
            winner = 'citizens';
        } else if (aliveCitizens <= aliveBadGuys) {
            winner = 'imposters';
        }

        if (winner) {
            const updates = {};
            updates['gameState/winner'] = winner;
            updates['gameState/phase'] = 'gameover';
            updates['status'] = 'finished';
            await FirebaseConfig.ref(`rooms/${this.roomCode}`).update(updates);
            return winner;
        }

        // Continue to next round
        const newRound = (room.gameState.roundNumber || 1) + 1;
        const updates = {};
        updates['gameState/roundNumber'] = newRound;
        updates['gameState/phase'] = 'lobby';
        updates['gameState/eliminatedPlayerId'] = null;
        await FirebaseConfig.ref(`rooms/${this.roomCode}`).update(updates);

        return 'continue';
    },

    /**
     * Restart with new word
     */
    async restartWithNewWord() {
        if (!this.isHost || !this.roomCode) return;

        // Re-distribute roles with new word
        await this.startGame();
    },

    /**
     * Restart with same word
     */
    async restartSameWord() {
        if (!this.isHost || !this.roomCode) return;

        const room = this.currentRoom;
        const players = Object.values(room.players || {});

        const updates = {};

        // Reset all players
        players.forEach(player => {
            updates[`players/${player.id}/alive`] = true;
            updates[`players/${player.id}/hasSeenRole`] = false;
        });

        // Shuffle reveal order
        const shuffledOrder = Utils.shuffle(players.map(p => p.id));

        updates['status'] = 'playing';
        updates['gameState/phase'] = 'reveal';
        updates['gameState/currentRevealIndex'] = 0;
        updates['gameState/roundNumber'] = 1;
        updates['gameState/eliminatedPlayerId'] = null;
        updates['gameState/selectedVote'] = null;
        updates['gameState/winner'] = null;
        updates['gameState/revealOrder'] = shuffledOrder;

        await FirebaseConfig.ref(`rooms/${this.roomCode}`).update(updates);
    },

    /**
     * Get current player data
     * @returns {Object|null} Player data
     */
    getMyPlayer() {
        if (!this.currentRoom || !this.playerId) return null;
        return this.currentRoom.players?.[this.playerId] || null;
    },

    /**
     * Get all players as array
     * @returns {Array} Players array sorted by join time
     */
    getPlayers() {
        if (!this.currentRoom) return [];
        const players = Object.values(this.currentRoom.players || {});
        return players.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    },

    /**
     * Get alive players
     * @returns {Array} Alive players
     */
    getAlivePlayers() {
        return this.getPlayers().filter(p => p.alive !== false);
    },

    /**
     * Get current reveal player
     * @returns {Object|null} Current player to reveal
     */
    getCurrentRevealPlayer() {
        if (!this.currentRoom) return null;
        const order = this.currentRoom.gameState?.revealOrder || [];
        const index = this.currentRoom.gameState?.currentRevealIndex || 0;
        const playerId = order[index];
        return playerId ? this.currentRoom.players?.[playerId] : null;
    },

    /**
     * Check if it's my turn to reveal
     * @returns {boolean}
     */
    isMyRevealTurn() {
        const currentPlayer = this.getCurrentRevealPlayer();
        return currentPlayer && currentPlayer.id === this.playerId;
    },

    /**
     * Get shareable room link
     * @returns {string} Room URL
     */
    getRoomLink() {
        const baseUrl = window.location.origin + window.location.pathname;
        return `${baseUrl}?room=${this.roomCode}`;
    }
};
