/**
 * Word Imposter - UI Game Module
 * Role reveal, discussion, voting, elimination, and game over screens
 */

// Extend UI object with game-related methods
Object.assign(UI, {
    // =====================================
    // MULTIPLAYER ROLE REVEAL
    // =====================================
    renderMultiplayerReveal() {
        const screen = Utils.createElement('div', { className: 'screen reveal-screen' });
        const room = Room.currentRoom;
        const myPlayer = Room.getMyPlayer();

        if (!myPlayer) return;

        if (myPlayer.hasSeenRole) {
            // Already seen, show waiting
            const waitingPlayers = Room.getPlayers().filter(p => !p.hasSeenRole);

            // If no one is waiting, advance to lobby (fallback for page refresh scenarios)
            if (waitingPlayers.length === 0) {
                // Check from Firebase and advance if truly everyone has seen
                Room.checkAndAdvanceIfAllSeen();
            }

            screen.innerHTML = `
                <h1 class="title">Rolünü Gördün!</h1>
                <p class="subtitle">Diğer oyuncuların rollerini görmesini bekle...</p>
                
                <div class="my-role-reminder">
                    <span class="role-tag ${myPlayer.role}">${GameData.roleNames[myPlayer.role]}</span>
                    <div class="my-word">${myPlayer.role === 'mrwhite' ? '???' : myPlayer.word}</div>
                    ${myPlayer.role === 'mrwhite' ? `<div class="my-category">Kategori: ${room.gameState.wordPair?.category}</div>` : ''}
                </div>
                
                <div class="waiting-players">
                    <p class="text-muted">Bekleyenler:</p>
                    ${waitingPlayers.map(p => `<span class="waiting-player">${p.name}</span>`).join(', ')}
                </div>
            `;
        } else {
            // Show reveal card
            screen.innerHTML = `
                <p class="reveal-instruction">Rolünü görmek için dokun</p>
                <h2 class="reveal-player-name">${myPlayer.name}</h2>
                
                <div class="card-flip-container" id="card-container">
                    <div class="card-flip" id="card-flip">
                        <div class="card-face card-front">
                            <div class="card-front-icon">🔒</div>
                            <div class="card-front-text">Kartını görmek için<br>dokun</div>
                        </div>
                        <div class="card-face card-back ${myPlayer.role}" id="card-back">
                            <span class="card-role ${myPlayer.role}">${GameData.roleNames[myPlayer.role]}</span>
                            <div class="card-word">${myPlayer.role === 'mrwhite' ? '???' : myPlayer.word}</div>
                            <div class="card-category">
                                ${myPlayer.role === 'mrwhite' ? 'Kategori: ' + room.gameState.wordPair?.category : ''}
                            </div>
                        </div>
                    </div>
                </div>
                
                <button class="btn btn-primary btn-lg reveal-next-btn" id="btn-seen">
                    ✅ Gördüm
                </button>
            `;
        }

        this.app.appendChild(screen);

        if (!myPlayer.hasSeenRole) {
            const card = document.getElementById('card-flip');
            const seenBtn = document.getElementById('btn-seen');
            let isFlipped = false;

            card.addEventListener('click', () => {
                if (!isFlipped) {
                    Audio.feedback('cardFlip', 'medium');
                    card.classList.add('flipped');
                    isFlipped = true;
                    seenBtn.classList.add('visible');

                    // Play role-specific sound after flip
                    setTimeout(() => {
                        Audio.feedback('roleReveal', 'roleReveal');
                    }, 400);
                }
            });

            seenBtn.addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                // markRoleSeen now handles checking if all players have seen
                // and automatically advances to lobby phase when everyone is done
                await Room.markRoleSeen();
            });
        }
    },

    // =====================================
    // MULTIPLAYER LOBBY (Discussion)
    // =====================================
    renderMultiplayerLobby() {
        const screen = Utils.createElement('div', { className: 'screen' });
        const room = Room.currentRoom;
        const alivePlayers = Room.getAlivePlayers();

        let playersHTML = alivePlayers.map((player, index) => {
            const isMe = player.id === Room.playerId;
            return `
                <div class="alive-player ${isMe ? 'is-me' : ''}">
                    <div class="alive-player-avatar">${Utils.getAvatar(index)}</div>
                    <div class="alive-player-name">${player.name}${isMe ? ' (Sen)' : ''}</div>
                </div>
            `;
        }).join('');

        screen.innerHTML = `
            <div class="lobby-header">
                <p class="lobby-round">Tur ${room.gameState?.roundNumber || 1}</p>
                <h1 class="lobby-title">Tartışma Zamanı!</h1>
            </div>
            
            <div class="alive-players">
                ${playersHTML}
            </div>
            
            <div class="lobby-tip">
                <div class="lobby-tip-icon">💡</div>
                <div class="lobby-tip-text">Her oyuncu sırayla kelimesini TEK KELİME ile açıklasın!</div>
            </div>
            
            ${Room.isHost ? `
                <div style="margin-top: auto;">
                    <button class="btn btn-danger btn-lg btn-block" id="btn-vote">
                        🗳️ Oylamaya Geç
                    </button>
                </div>
            ` : `
                <div style="margin-top: auto;">
                    <p class="text-center text-muted">Oda sahibi oylamayı başlatacak...</p>
                </div>
            `}
        `;

        this.app.appendChild(screen);

        if (Room.isHost) {
            document.getElementById('btn-vote').addEventListener('click', async () => {
                Audio.feedback('vote', 'medium');
                await Room.setPhase('voting');
            });
        }
    },

    // =====================================
    // MULTIPLAYER VOTING
    // =====================================
    renderMultiplayerVoting() {
        const screen = Utils.createElement('div', { className: 'screen' });
        const room = Room.currentRoom;
        const alivePlayers = Room.getAlivePlayers();
        const selectedVote = room.gameState?.selectedVote;

        let optionsHTML = alivePlayers.map((player, index) => `
            <div class="vote-option ${selectedVote === player.id ? 'selected' : ''}" data-id="${player.id}">
                <div class="vote-avatar">${Utils.getAvatar(index)}</div>
                <span class="vote-name">${player.name}${player.id === Room.playerId ? ' (Sen)' : ''}</span>
            </div>
        `).join('');

        screen.innerHTML = `
            ${Room.isHost ? '<button class="back-button" id="btn-back">←</button>' : ''}
            <div class="voting-header" style="margin-top: var(--space-xl);">
                <h1 class="voting-title">Kimi Elemek İstiyorsunuz?</h1>
                <p class="voting-subtitle">Oybirliği ile karar verin</p>
            </div>
            
            <div class="vote-options">
                ${optionsHTML}
            </div>
            
            ${Room.isHost ? `
                <div style="margin-top: auto; padding-top: var(--space-xl);">
                    <button class="btn btn-danger btn-lg btn-block" id="btn-eliminate" ${!selectedVote ? 'disabled style="opacity: 0.5"' : ''}>
                        ⚡ Oyu Kullan
                    </button>
                </div>
            ` : `
                <div style="margin-top: auto; padding-top: var(--space-xl);">
                    <p class="text-center text-muted">
                        ${selectedVote ? 'Seçilen: ' + (alivePlayers.find(p => p.id === selectedVote)?.name || '') : 'Oda sahibi seçim yapıyor...'}
                    </p>
                </div>
            `}
        `;

        this.app.appendChild(screen);

        // Back button (host only)
        if (Room.isHost && document.getElementById('btn-back')) {
            document.getElementById('btn-back').addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                await Room.selectVote(null);
                await Room.setPhase('lobby');
            });
        }

        // Vote selection (host controls)
        if (Room.isHost) {
            document.querySelectorAll('.vote-option').forEach(option => {
                option.addEventListener('click', async () => {
                    Audio.feedback('vote', 'light');
                    await Room.selectVote(option.dataset.id);
                });
            });

            document.getElementById('btn-eliminate').addEventListener('click', () => {
                if (selectedVote) {
                    this.showMultiplayerConfirmEliminate();
                }
            });
        }
    },

    showMultiplayerConfirmEliminate() {
        const room = Room.currentRoom;
        const player = Room.getPlayers().find(p => p.id === room.gameState?.selectedVote);
        if (!player) return;

        const overlay = Utils.createElement('div', { className: 'modal-overlay' });
        overlay.innerHTML = `
            <div class="modal">
                <h2 class="modal-title">⚠️ Emin misin?</h2>
                <p class="modal-text"><strong>${player.name}</strong> oyundan elenecek!</p>
                <div class="modal-buttons">
                    <button class="btn btn-secondary" id="cancel-eliminate">Vazgeç</button>
                    <button class="btn btn-danger" id="confirm-eliminate">Evet, Ele!</button>
                </div>
            </div>
        `;

        this.app.appendChild(overlay);

        document.getElementById('cancel-eliminate').addEventListener('click', () => {
            Audio.feedback('click', 'light');
            overlay.remove();
        });
        document.getElementById('confirm-eliminate').addEventListener('click', async () => {
            Audio.feedback('eliminate', 'eliminate');
            overlay.remove();
            await Room.executeElimination();
        });
    },

    // =====================================
    // MULTIPLAYER ELIMINATION
    // =====================================
    renderMultiplayerElimination() {
        const screen = Utils.createElement('div', { className: 'screen elimination-screen' });
        const room = Room.currentRoom;
        const eliminatedId = room.gameState?.eliminatedPlayerId;
        const player = Room.getPlayers().find(p => p.id === eliminatedId);

        if (!player) return;

        // Play elimination sound
        Audio.feedback('eliminate', 'eliminate');

        screen.innerHTML = `
            <h2 class="elimination-title">Elenen Oyuncu</h2>
            
            <div class="eliminated-player-card ${player.role}">
                <h1 class="eliminated-name">${player.name}</h1>
                <span class="eliminated-role ${player.role}">${GameData.roleNames[player.role]}</span>
                ${player.role === 'imposter' ? `<p class="eliminated-word">Kelimesi: <strong>${player.word}</strong></p>` : ''}
            </div>
            
            ${Room.isHost ? `
                <button class="btn btn-primary btn-lg btn-block" id="btn-continue">
                    Devam Et →
                </button>
            ` : `
                <p class="text-center text-muted">Oda sahibi devam edecek...</p>
            `}
        `;

        this.app.appendChild(screen);

        if (Room.isHost) {
            document.getElementById('btn-continue').addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                await Room.processRound();
            });
        }
    },

    // =====================================
    // MULTIPLAYER GAME OVER
    // =====================================
    renderMultiplayerGameOver() {
        const screen = Utils.createElement('div', { className: 'screen gameover-screen' });
        const room = Room.currentRoom;
        const winner = room.gameState?.winner;
        const isCitizensWin = winner === 'citizens';
        const wordPair = room.gameState?.wordPair;

        // Play appropriate sound
        const myPlayer = Room.getMyPlayer();
        const didIWin = (isCitizensWin && myPlayer?.role === 'citizen') ||
            (!isCitizensWin && (myPlayer?.role === 'imposter' || myPlayer?.role === 'mrwhite'));

        Audio.feedback(didIWin ? 'victory' : 'gameOver', didIWin ? 'victory' : 'heavy');

        // Record game result for stats
        if (myPlayer) {
            Score.recordGame(didIWin ? 'win' : 'lose', myPlayer.role, winner);
        }

        screen.innerHTML = `
            <div class="gameover-icon">${isCitizensWin ? '🎉' : '😈'}</div>
            <h1 class="gameover-title ${winner}">${isCitizensWin ? 'Vatandaşlar Kazandı!' : 'Hainler Kazandı!'}</h1>
            <p class="gameover-subtitle">${isCitizensWin ? 'Tüm kötüler yakalandı!' : 'Hainler saklanabildiler!'}</p>
            
            <div class="gameover-words">
                <div class="gameover-word-row">
                    <span class="gameover-word-label">Vatandaş Kelimesi</span>
                    <span class="gameover-word-value">${wordPair?.citizenWord || '-'}</span>
                </div>
                <div class="gameover-word-row">
                    <span class="gameover-word-label">Hain Kelimesi</span>
                    <span class="gameover-word-value">${wordPair?.imposterWord || '-'}</span>
                </div>
                <div class="gameover-word-row">
                    <span class="gameover-word-label">Kategori</span>
                    <span class="gameover-word-value">${wordPair?.category || '-'}</span>
                </div>
            </div>
            
            ${Room.isHost ? `
                <div class="gameover-buttons">
                    <button class="btn btn-primary btn-block" id="btn-new-word">
                        🔄 Yeni Kelime ile Oyna
                    </button>
                    <button class="btn btn-secondary btn-block" id="btn-same-word">
                        🔁 Aynı Kelime ile Oyna
                    </button>
                    <button class="btn btn-secondary btn-block" id="btn-lobby">
                        🏠 Bekleme Odasına Dön
                    </button>
                </div>
            ` : `
                <div class="gameover-buttons">
                    <p class="text-center text-muted">Oda sahibi yeni oyun başlatabilir...</p>
                </div>
            `}
        `;

        this.app.appendChild(screen);

        if (Room.isHost) {
            document.getElementById('btn-new-word').addEventListener('click', async () => {
                Audio.feedback('newRound', 'success');
                await Room.restartWithNewWord();
            });

            document.getElementById('btn-same-word').addEventListener('click', async () => {
                Audio.feedback('newRound', 'success');
                await Room.restartSameWord();
            });

            document.getElementById('btn-lobby').addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                await Room.setPhase('waiting');
            });
        }
    }
});
