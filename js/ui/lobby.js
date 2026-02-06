/**
 * Word Imposter - UI Lobby Module
 * Waiting room and category selection screens
 */

// Extend UI object with lobby-related methods
Object.assign(UI, {
    // =====================================
    // WAITING ROOM (Multiplayer Lobby)
    // =====================================
    renderWaitingRoom() {
        const screen = Utils.createElement('div', { className: 'screen' });
        const room = Room.currentRoom;
        const players = Room.getPlayers();
        const isHost = Room.isHost;

        let playersHTML = players.map((player, index) => {
            const isMe = player.id === Room.playerId;
            const isHostPlayer = player.id === room.hostId;
            const connectedClass = player.connected ? '' : 'disconnected';

            return `
                <div class="player-item ${connectedClass}">
                    <span class="player-name">
                        <span class="player-number">${index + 1}</span>
                        ${player.name}
                        ${isHostPlayer ? '<span class="host-badge">👑</span>' : ''}
                        ${isMe ? '<span class="me-badge">(Sen)</span>' : ''}
                    </span>
                    ${!player.connected ? '<span class="status-badge offline">Çevrimdışı</span>' : ''}
                </div>
            `;
        }).join('');

        const roomLink = Room.getRoomLink();

        screen.innerHTML = `
            <button class="back-button" id="btn-leave">✕</button>
            
            <div class="room-header">
                <h1 class="title">Bekleme Odası</h1>
                <div class="room-code-display">
                    <span class="room-code-label">Oda Kodu</span>
                    <span class="room-code-value">${Room.roomCode}</span>
                </div>
            </div>
            
            <div class="share-section">
                <button class="btn btn-secondary btn-sm" id="btn-copy-link">
                    📋 Linki Kopyala
                </button>
                <button class="btn btn-secondary btn-sm" id="btn-share">
                    📤 Paylaş
                </button>
            </div>
            
            <div class="player-list" style="margin-top: var(--space-lg);">
                <h3 class="section-title">Oyuncular (${players.length}/12)</h3>
                ${playersHTML}
            </div>
            
            ${isHost ? `
                <div style="margin-top: auto; padding-top: var(--space-lg);">
                    <button class="btn btn-gold btn-lg btn-block" id="btn-configure" ${players.length < 3 ? 'disabled style="opacity: 0.5"' : ''}>
                        ⚙️ Oyunu Ayarla
                    </button>
                    <p class="text-center text-muted" style="margin-top: var(--space-sm);">
                        ${players.length < 3 ? 'En az 3 oyuncu gerekli' : 'Kategorileri seç ve başlat'}
                    </p>
                </div>
            ` : `
                <div style="margin-top: auto; padding-top: var(--space-lg);">
                    <p class="text-center text-muted">
                        Oda sahibinin oyunu başlatmasını bekleyin...
                    </p>
                </div>
            `}
        `;

        this.app.appendChild(screen);

        // Leave room
        document.getElementById('btn-leave').addEventListener('click', async () => {
            if (confirm('Odadan ayrılmak istediğinize emin misiniz?')) {
                Audio.feedback('click', 'light');
                await Room.leaveRoom();
                Game.setPhase('home');
                this.render();
            }
        });

        // Copy link
        document.getElementById('btn-copy-link').addEventListener('click', async () => {
            Audio.feedback('click', 'light');
            try {
                await navigator.clipboard.writeText(roomLink);
                this.showSuccess('Link kopyalandı!');
            } catch {
                prompt('Link:', roomLink);
            }
        });

        // Share
        document.getElementById('btn-share').addEventListener('click', async () => {
            Audio.feedback('click', 'light');
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'Who Is Imposter? - Oda Daveti',
                        text: `Bana katıl! Oda Kodu: ${Room.roomCode}`,
                        url: roomLink
                    });
                } catch { }
            } else {
                prompt('Link:', roomLink);
            }
        });

        // Configure game (host only)
        if (isHost && document.getElementById('btn-configure')) {
            document.getElementById('btn-configure').addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                await Room.setPhase('category');
            });
        }
    },

    // =====================================
    // MULTIPLAYER CATEGORY SELECT (Host Only)
    // =====================================
    renderMultiplayerCategorySelect() {
        const screen = Utils.createElement('div', { className: 'screen category-screen' });
        const room = Room.currentRoom;
        const isHost = Room.isHost;
        const selectedCategories = room.settings?.selectedCategories || [];
        const allSelected = selectedCategories.length === GameData.categories.length;

        if (!isHost) {
            // Non-host sees waiting message
            screen.innerHTML = `
                <h1 class="title">Ayarlar Yapılıyor</h1>
                <p class="subtitle">Oda sahibi kategorileri seçiyor...</p>
                <div class="loading-spinner">⏳</div>
            `;
            this.app.appendChild(screen);
            return;
        }

        // Build categories HTML
        let categoriesHTML = GameData.categories.map(cat => {
            const icon = GameData.getCategoryIcon(cat);
            const isSelected = selectedCategories.includes(cat);
            return `
                <div class="category-card ${isSelected ? 'selected' : ''}" data-category="${cat}">
                    <div class="category-checkbox ${isSelected ? 'checked' : ''}">
                        <span class="checkbox-icon">${isSelected ? '✓' : ''}</span>
                    </div>
                    <div class="category-icon">${icon}</div>
                    <div class="category-name">${cat}</div>
                </div>
            `;
        }).join('');

        screen.innerHTML = `
            <button class="back-button" id="btn-back">←</button>
            <h1 class="title" style="margin-top: var(--space-xl);">Kategori Seç</h1>
            <p class="subtitle">Oynamak istediğin kategorileri işaretle</p>
            
            <div class="category-actions">
                <button class="btn btn-secondary btn-sm" id="btn-select-all">
                    ${allSelected ? '✗ Tümünü Kaldır' : '✓ Tümünü Seç'}
                </button>
                <span class="category-count">${selectedCategories.length}/${GameData.categories.length} seçili</span>
            </div>
            
            <div class="category-grid">
                ${categoriesHTML}
            </div>
            
            <div class="role-config" style="margin-top: var(--space-lg);">
                ${this.renderRoleConfigHTML(room)}
            </div>
            
            <div style="margin-top: auto; padding-top: var(--space-xl);">
                <button class="btn btn-gold btn-lg btn-block" id="btn-start-game" ${selectedCategories.length === 0 ? 'disabled style="opacity: 0.5"' : ''}>
                    🚀 Oyunu Başlat
                </button>
            </div>
        `;

        this.app.appendChild(screen);

        // Back button
        document.getElementById('btn-back').addEventListener('click', async () => {
            Audio.feedback('click', 'light');
            await Room.setPhase('waiting');
        });

        // Select all toggle
        document.getElementById('btn-select-all').addEventListener('click', async () => {
            Audio.feedback('click', 'light');
            if (allSelected) {
                await Room.updateSettings({ selectedCategories: [] });
            } else {
                await Room.updateSettings({ selectedCategories: [...GameData.categories] });
            }
        });

        // Category toggle
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                const cat = card.dataset.category;
                const current = [...selectedCategories];
                const index = current.indexOf(cat);
                if (index === -1) {
                    current.push(cat);
                } else {
                    current.splice(index, 1);
                }
                await Room.updateSettings({ selectedCategories: current });
            });
        });

        // Role config buttons
        this.attachRoleConfigListeners(room);

        // Start game
        document.getElementById('btn-start-game').addEventListener('click', async () => {
            try {
                Audio.feedback('newRound', 'success');
                await Room.startGame();
            } catch (error) {
                this.showError(error.message);
            }
        });
    },

    renderRoleConfigHTML(room) {
        const players = Room.getPlayers();
        const playerCount = players.length;
        const settings = room.settings || {};
        const imposterCount = settings.imposterCount || 1;
        const mrWhiteCount = settings.mrWhiteCount || 0;

        if (playerCount < 3) {
            return '<p class="text-center text-muted">En az 3 oyuncu gerekli</p>';
        }

        const maxImposters = Math.max(0, Math.floor((playerCount - 1) / 2));
        const maxMrWhite = Math.max(0, Math.floor((playerCount - imposterCount - 1) / 2));
        const citizenCount = playerCount - imposterCount - mrWhiteCount;

        return `
            <h3 class="section-title">Rol Dağılımı (${playerCount} oyuncu)</h3>
            
            <div class="role-row">
                <div class="role-info">
                    <span class="role-badge citizen"></span>
                    <span>Vatandaş</span>
                </div>
                <span class="role-count">${citizenCount}</span>
            </div>
            
            <div class="role-row">
                <div class="role-info">
                    <span class="role-badge imposter"></span>
                    <span>Hain</span>
                </div>
                <div class="role-counter">
                    <button data-role="imposter" data-delta="-1" ${imposterCount <= 1 ? 'disabled' : ''}>−</button>
                    <span class="role-count">${imposterCount}</span>
                    <button data-role="imposter" data-delta="1" ${imposterCount >= maxImposters ? 'disabled' : ''}>+</button>
                </div>
            </div>
            
            <div class="role-row">
                <div class="role-info">
                    <span class="role-badge mrwhite"></span>
                    <span>Gizemli</span>
                </div>
                <div class="role-counter">
                    <button data-role="mrwhite" data-delta="-1" ${mrWhiteCount <= 0 ? 'disabled' : ''}>−</button>
                    <span class="role-count">${mrWhiteCount}</span>
                    <button data-role="mrwhite" data-delta="1" ${mrWhiteCount >= maxMrWhite ? 'disabled' : ''}>+</button>
                </div>
            </div>
        `;
    },

    attachRoleConfigListeners(room) {
        const settings = room.settings || {};

        document.querySelectorAll('.role-counter button').forEach(btn => {
            btn.addEventListener('click', async () => {
                Audio.feedback('click', 'light');
                const role = btn.dataset.role;
                const delta = parseInt(btn.dataset.delta);

                if (role === 'imposter') {
                    const newCount = (settings.imposterCount || 1) + delta;
                    await Room.updateSettings({ imposterCount: newCount });
                } else if (role === 'mrwhite') {
                    const newCount = (settings.mrWhiteCount || 0) + delta;
                    await Room.updateSettings({ mrWhiteCount: newCount });
                }
            });
        });
    }
});
