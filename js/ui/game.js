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
        const myVote = Room.getMyVote();
        const allVoted = Room.checkAllVoted();
        const myPlayerId = Room.playerId;

        // If all voted, show vote summary
        if (allVoted) {
            this.renderVoteSummary(screen);
            return;
        }

        // Filter out self from voting options (can't vote for yourself)
        const votableOptions = alivePlayers.filter(p => p.id !== myPlayerId);

        let optionsHTML = votableOptions.map((player, index) => `
            <div class="vote-option ${myVote === player.id ? 'selected' : ''}" data-id="${player.id}">
                <div class="vote-avatar">${Utils.getAvatar(alivePlayers.indexOf(player))}</div>
                <span class="vote-name">${player.name}</span>
                ${myVote === player.id ? '<span class="vote-check">✓</span>' : ''}
            </div>
        `).join('');

        // Count how many have voted
        const votes = room.gameState?.votes || {};
        const votedCount = Object.keys(votes).length;
        const totalVoters = alivePlayers.length;

        screen.innerHTML = `
            ${Room.isHost ? '<button class="back-button" id="btn-back">←</button>' : ''}
            <div class="voting-header" style="margin-top: var(--space-xl);">
                <h1 class="voting-title">Kimi Elemek İstiyorsun?</h1>
                <p class="voting-subtitle">${votedCount}/${totalVoters} oyuncu oy verdi</p>
            </div>
            
            <div class="vote-options">
                ${optionsHTML}
            </div>
            
            <div style="margin-top: auto; padding-top: var(--space-xl);">
                ${myVote
                ? '<p class="text-center text-muted">✅ Oyun verildi. Diğer oyuncular bekleniyor...</p>'
                : '<p class="text-center text-muted">Bir oyuncu seçin</p>'}
            </div>
        `;

        this.app.appendChild(screen);

        // Back button (host only)
        if (Room.isHost && document.getElementById('btn-back')) {
            document.getElementById('btn-back').addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                await Room.clearVotes();
                await Room.setPhase('lobby');
            });
        }

        // Vote selection (all players can vote)
        document.querySelectorAll('.vote-option').forEach(option => {
            option.addEventListener('click', async () => {
                if (myVote) return; // Already voted
                Audio.feedback('vote', 'light');
                await Room.submitVote(option.dataset.id);
            });
        });
    },

    // =====================================
    // VOTE SUMMARY SCREEN
    // =====================================
    renderVoteSummary(screen) {
        const alivePlayers = Room.getAlivePlayers();
        const voteCounts = Room.getVoteCounts();
        const tiedPlayers = Room.getTiedPlayers();
        const isTie = tiedPlayers.length > 1;

        // Sort players by vote count (highest first)
        const sortedPlayers = alivePlayers
            .map(p => ({ ...p, votes: voteCounts[p.id] || 0 }))
            .filter(p => p.votes > 0)
            .sort((a, b) => b.votes - a.votes);

        let resultsHTML = sortedPlayers.map((player, index) => `
            <div class="vote-result ${tiedPlayers.includes(player.id) ? 'tied' : ''} ${index === 0 && !isTie ? 'eliminated' : ''}">
                <span class="vote-result-name">${player.name}</span>
                <span class="vote-result-count">${player.votes} oy</span>
            </div>
        `).join('');

        if (isTie) {
            // Tie - show tie message
            Audio.feedback('error', 'medium');
            const tiedNames = tiedPlayers.map(id => alivePlayers.find(p => p.id === id)?.name).join(', ');

            screen.innerHTML = `
                <div class="voting-header" style="margin-top: var(--space-xl);">
                    <h1 class="voting-title">⚖️ Berabere!</h1>
                    <p class="voting-subtitle">Oylar eşit çıktı</p>
                </div>
                
                <div class="vote-results">
                    ${resultsHTML}
                </div>
                
                <div class="tie-info">
                    <p>Beraberlik: <strong>${tiedNames}</strong></p>
                    <p class="text-muted">Beraberlik bozulana kadar tekrar oylama yapılacak.</p>
                </div>
                
                ${Room.isHost ? `
                    <div style="margin-top: auto; padding-top: var(--space-xl);">
                        <button class="btn btn-primary btn-lg btn-block" id="btn-revote">
                            🔄 Tartışmaya Dön
                        </button>
                    </div>
                ` : `
                    <div style="margin-top: auto; padding-top: var(--space-xl);">
                        <p class="text-center text-muted">Oda sahibi tartışmaya dönebilir...</p>
                    </div>
                `}
            `;

            this.app.appendChild(screen);

            if (Room.isHost && document.getElementById('btn-revote')) {
                document.getElementById('btn-revote').addEventListener('click', async () => {
                    Audio.feedback('click', 'light');
                    await Room.clearVotes();
                    await Room.setPhase('lobby');
                });
            }
        } else {
            // No tie - show winner and proceed to elimination
            const eliminatedId = tiedPlayers[0];
            const eliminatedPlayer = alivePlayers.find(p => p.id === eliminatedId);

            Audio.feedback('vote', 'medium');

            screen.innerHTML = `
                <div class="voting-header" style="margin-top: var(--space-xl);">
                    <h1 class="voting-title">📊 Oylama Sonucu</h1>
                </div>
                
                <div class="vote-results">
                    ${resultsHTML}
                </div>
                
                <div class="elimination-preview">
                    <p>Elenen oyuncu:</p>
                    <h2 class="eliminated-preview-name">${eliminatedPlayer?.name || '?'}</h2>
                </div>
                
                ${Room.isHost ? `
                    <div style="margin-top: auto; padding-top: var(--space-xl);">
                        <button class="btn btn-danger btn-lg btn-block" id="btn-confirm-eliminate">
                            ⚡ Devam Et
                        </button>
                    </div>
                ` : `
                    <div style="margin-top: auto; padding-top: var(--space-xl);">
                        <p class="text-center text-muted">Oda sahibi devam ettirecek...</p>
                    </div>
                `}
            `;

            this.app.appendChild(screen);

            if (Room.isHost && document.getElementById('btn-confirm-eliminate')) {
                document.getElementById('btn-confirm-eliminate').addEventListener('click', async () => {
                    Audio.feedback('eliminate', 'eliminate');
                    await Room.setSelectedVote(eliminatedId);
                    await Room.executeElimination();
                });
            }
        }
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

            document.getElementById('btn-lobby').addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                await Room.setPhase('waiting');
            });
        }
    }
});
