/**
 * Who Is the Impostor? - UI Lobby ES Module
 * Waiting room and category selection screens
 */

import { getApp, createElement, feedback, showError, showSuccess, GameData, getRoomState, setGameState } from './core.js';
import {
    getPlayers,
    leaveRoom,
    updateSettings,
    setPhase,
    startGame,
    getRoomLink,
    kickPlayer
} from '../game/room.js';

import { render } from './renderer.js';
import { escapeHtml } from '../lib/utils.js';
import { getRoleLimits, MAX_PLAYERS, validateRoleCounts } from '../game/domain.js';

/**
 * Render waiting room (multiplayer lobby)
 */
export function renderWaitingRoom() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen room-screen' });
    const { currentRoom, roomCode, playerId, isHost, connectionStatus } = getRoomState();
    const players = getPlayers();
    const connectedPlayerCount = players.filter((player) => player.connected !== false).length;

    const playersHTML = players.map((player, index) => {
        const isMe = player.id === playerId;
        const isHostPlayer = player.id === currentRoom.hostId;
        const isConnecting = isMe && connectionStatus === 'connecting';
        const isConnected = player.connected !== false || (isMe && connectionStatus === 'connected');
        const connectedClass = isConnected || isConnecting ? '' : 'disconnected';

        return `
            <div class="player-item ${connectedClass}">
                <span class="player-name">
                    <span class="player-number">${index + 1}</span>
                    ${escapeHtml(player.name)}
                    ${isHostPlayer ? '<span class="host-badge">Oda sahibi</span>' : ''}
                    ${isMe ? '<span class="me-badge">Sen</span>' : ''}
                </span>
                <span class="player-actions">
                    ${isConnecting ? '<span class="status-badge">Bağlanıyor…</span>' : ''}
                    ${!isConnected && !isConnecting ? '<span class="status-badge offline">Çevrimdışı</span>' : ''}
                    ${isHost && !isHostPlayer ? `<button type="button" class="btn-kick" data-kick-id="${player.id}" aria-label="${escapeHtml(player.name)} adlı oyuncuyu odadan çıkar">✕</button>` : ''}
                </span>
            </div>
        `;
    }).join('');

    const roomLink = getRoomLink();

    screen.innerHTML = `
        <button type="button" class="back-button" id="btn-leave" aria-label="Odadan ayrıl">✕</button>

        <div class="room-layout">
            <section class="room-overview" aria-labelledby="waiting-room-title">
                <div class="room-header">
                    <p class="phase-kicker">Canlı oda</p>
                    <h1 class="title" id="waiting-room-title">Bekleme Odası</h1>
                    <div class="room-code-display">
                        <span class="room-code-label">Oda kodu</span>
                        <span class="room-code-value">${escapeHtml(roomCode)}</span>
                    </div>
                </div>

                <div class="share-section">
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-copy-link">Linki Kopyala</button>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-share">Paylaş</button>
                </div>

                ${isHost ? `
                    <div class="room-actions">
                        <button type="button" class="btn btn-host btn-lg btn-block" id="btn-configure" ${connectedPlayerCount < 3 ? 'disabled' : ''}>
                            Oyunu Ayarla
                        </button>
                        <p class="text-center text-muted helper-text">
                            ${connectedPlayerCount < 3 ? 'En az 3 çevrimiçi oyuncu gerekli' : 'Kategorileri seç ve oyunu başlat'}
                        </p>
                    </div>
                ` : `
                    <p class="room-actions text-center text-muted">Oda sahibinin oyunu başlatmasını bekleyin...</p>
                `}
            </section>

            <section class="room-players-panel" aria-labelledby="player-list-title">
                <h2 class="section-title" id="player-list-title">Oyuncular (${players.length}/${MAX_PLAYERS})</h2>
                <div class="player-list">
                    ${playersHTML}
                </div>
            </section>
        </div>
    `;

    app.appendChild(screen);

    // Leave room
    document.getElementById('btn-leave').addEventListener('click', async () => {
        if (confirm('Odadan ayrılmak istediğinize emin misiniz?')) {
            feedback('click', 'light');
            try {
                await leaveRoom();
                setGameState({ phase: 'home' });
                render();
            } catch (error) {
                showError(error.message);
            }
        }
    });

    // Copy link
    document.getElementById('btn-copy-link').addEventListener('click', async () => {
        feedback('click', 'light');
        try {
            await navigator.clipboard.writeText(roomLink);
            showSuccess('Link kopyalandı!');
        } catch {
            prompt('Link:', roomLink);
        }
    });

    // Share
    document.getElementById('btn-share').addEventListener('click', async () => {
        feedback('click', 'light');
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Who Is the Impostor? - Oda Daveti',
                    text: `Bana katıl! Oda Kodu: ${roomCode}`,
                    url: roomLink
                });
            } catch (error) {
                if (error?.name !== 'AbortError') showError('Paylaşım açılamadı. Linki kopyalamayı deneyin.');
            }
        } else {
            prompt('Link:', roomLink);
        }
    });

    // Configure game (host only)
    if (isHost && document.getElementById('btn-configure')) {
        document.getElementById('btn-configure').addEventListener('click', async () => {
            feedback('click', 'light');
            try {
                await setPhase('category');
            } catch (error) {
                showError(error.message);
            }
        });
    }

    // Kick player (host only)
    document.querySelectorAll('.btn-kick').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetId = btn.dataset.kickId;
            const targetPlayer = players.find(p => p.id === targetId);
            if (targetPlayer && confirm(`${targetPlayer.name} oyuncusunu atmak istiyor musunuz?`)) {
                feedback('click', 'light');
                try {
                    btn.disabled = true;
                    await kickPlayer(targetId);
                } catch (error) {
                    btn.disabled = false;
                    showError(error.message);
                }
            }
        });
    });
}

/**
 * Render multiplayer category select (host only)
 */
export function renderMultiplayerCategorySelect() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen category-screen' });
    const { currentRoom, isHost } = getRoomState();
    const players = getPlayers().filter((player) => player.connected !== false);
    const selectedCategories = currentRoom.settings?.selectedCategories || [];
    const allSelected = selectedCategories.length === GameData.categories.length;

    if (!isHost) {
        screen.innerHTML = `
            <h1 class="title">Ayarlar Yapılıyor</h1>
            <p class="subtitle">Oda sahibi kategorileri seçiyor...</p>
            <div class="loading-spinner" aria-hidden="true">◌</div>
        `;
        app.appendChild(screen);
        return;
    }

    // Build categories HTML
    let categoriesHTML = GameData.categories.map(cat => {
        const icon = GameData.getCategoryIcon(cat);
        const isSelected = selectedCategories.includes(cat);
        return `
            <button type="button" class="category-card ${isSelected ? 'selected' : ''}" data-category="${escapeHtml(cat)}" aria-pressed="${isSelected}">
                <div class="category-checkbox ${isSelected ? 'checked' : ''}">
                    <span class="checkbox-icon">${isSelected ? '✓' : ''}</span>
                </div>
                <div class="category-icon">${icon}</div>
                <div class="category-name">${escapeHtml(cat)}</div>
            </button>
        `;
    }).join('');

    // Role config
    const roleConfigHTML = renderRoleConfigHTML(currentRoom, players);

    screen.innerHTML = `
        <button type="button" class="back-button" id="btn-back" aria-label="Bekleme odasına dön">←</button>
        <h1 class="title page-heading">Kategori Seç</h1>
        <p class="subtitle">Oynamak istediğin kategorileri işaretle</p>

        <div class="category-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-select-all">
                ${allSelected ? '✗ Tümünü Kaldır' : '✓ Tümünü Seç'}
            </button>
            <span class="category-count">${selectedCategories.length}/${GameData.categories.length} seçili</span>
        </div>

        <div class="category-grid">
            ${categoriesHTML}
        </div>

        <div class="role-config role-config-compact">
            ${roleConfigHTML}
        </div>

        <div class="screen-footer">
            <button type="button" class="btn btn-host btn-lg btn-block" id="btn-start-game" ${selectedCategories.length === 0 ? 'disabled' : ''}>
                Oyunu Başlat
            </button>
        </div>
    `;

    app.appendChild(screen);

    document.getElementById('btn-back').addEventListener('click', async () => {
        feedback('click', 'light');
        try {
            await setPhase('waiting');
        } catch (error) {
            showError(error.message);
        }
    });

    document.getElementById('btn-select-all').addEventListener('click', async (event) => {
        feedback('click', 'light');
        const button = event.currentTarget;
        button.disabled = true;
        const currentSelection = getRoomState().currentRoom?.settings?.selectedCategories || [];
        const newSelected = currentSelection.length === GameData.categories.length ? [] : [...GameData.categories];
        try {
            await updateSettings({ selectedCategories: newSelected });
        } catch (error) {
            button.disabled = false;
            showError(error.message);
        }
    });

    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', async () => {
            feedback('click', 'light');
            const cat = card.dataset.category;
            const currentSelection = getRoomState().currentRoom?.settings?.selectedCategories || [];
            const newSelected = currentSelection.includes(cat)
                ? currentSelection.filter((category) => category !== cat)
                : [...currentSelection, cat];

            card.disabled = true;
            card.classList.toggle('selected', newSelected.includes(cat));
            card.setAttribute('aria-pressed', String(newSelected.includes(cat)));
            try {
                await updateSettings({ selectedCategories: newSelected });
            } catch (error) {
                card.disabled = false;
                showError(error.message);
                render();
            }
        });
    });

    // Role config buttons
    attachRoleConfigListeners(players);

    // Start game
    document.getElementById('btn-start-game').addEventListener('click', async () => {
        const startButton = document.getElementById('btn-start-game');
        try {
            const latestRoom = getRoomState().currentRoom;
            const settings = latestRoom?.settings || {};
            const imposterCount = settings.imposterCount || 1;
            const mrWhiteCount = settings.mrWhiteCount || 0;
            const roleError = validateRoleCounts(players.length, imposterCount, mrWhiteCount);
            if (roleError) {
                showError(roleError);
                return;
            }

            startButton.disabled = true;
            startButton.textContent = 'Oyun hazırlanıyor…';
            feedback('newRound', 'success');
            await startGame();
        } catch (error) {
            startButton.disabled = false;
            startButton.textContent = 'Oyunu Başlat';
            showError(error.message);
        }
    });
}

/**
 * Render role config HTML (counter-based)
 */
function renderRoleConfigHTML(room, players) {
    const playerCount = players.length;
    const settings = room.settings || {};
    const imposterCount = settings.imposterCount || 1;
    const mrWhiteCount = settings.mrWhiteCount || 0;
    const citizenCount = playerCount - imposterCount - mrWhiteCount;

    if (playerCount < 3) {
        return '<p class="text-center text-muted">En az 3 oyuncu gerekli</p>';
    }

    const { maxImposters, maxMrWhite } = getRoleLimits(playerCount, imposterCount);

    return `
        <h3 class="section-title">Rol Dağılımı (${playerCount} oyuncu)</h3>
        <p class="text-muted role-config-help">Roller güvenli ve rastgele dağıtılacak</p>

        <div class="role-settings-list">
            <div class="role-setting-row">
                <span>Hain</span>
                <div class="role-setting-controls">
                    <button type="button" class="btn-role-adjust" data-role="imposter" data-delta="-1" ${imposterCount <= 1 ? 'disabled' : ''} aria-label="Hain sayısını azalt">−</button>
                    <span class="role-setting-count">${imposterCount}</span>
                    <button type="button" class="btn-role-adjust" data-role="imposter" data-delta="1" ${imposterCount >= maxImposters ? 'disabled' : ''} aria-label="Hain sayısını artır">+</button>
                </div>
            </div>

            <div class="role-setting-row">
                <span>Gizemli</span>
                <div class="role-setting-controls">
                    <button type="button" class="btn-role-adjust" data-role="mrwhite" data-delta="-1" ${mrWhiteCount <= 0 ? 'disabled' : ''} aria-label="Gizemli sayısını azalt">−</button>
                    <span class="role-setting-count">${mrWhiteCount}</span>
                    <button type="button" class="btn-role-adjust" data-role="mrwhite" data-delta="1" ${mrWhiteCount >= maxMrWhite ? 'disabled' : ''} aria-label="Gizemli sayısını artır">+</button>
                </div>
            </div>

            <div class="role-setting-summary">
                Vatandaş: ${citizenCount} kişi
            </div>
        </div>
    `;
}

/**
 * Attach role config button listeners (counter-based)
 */
function attachRoleConfigListeners(players) {
    document.querySelectorAll('.btn-role-adjust').forEach(btn => {
        btn.addEventListener('click', async () => {
            feedback('click', 'light');

            const role = btn.dataset.role;
            const delta = Number.parseInt(btn.dataset.delta, 10);
            const playerCount = players.length;
            const latestSettings = getRoomState().currentRoom?.settings || {};
            let imposterCount = latestSettings.imposterCount || 1;
            let mrWhiteCount = latestSettings.mrWhiteCount || 0;

            if (role === 'imposter') {
                const newCount = imposterCount + delta;
                const { maxImposters } = getRoleLimits(playerCount, imposterCount);
                if (newCount >= 1 && newCount <= maxImposters) {
                    imposterCount = newCount;
                    const { maxMrWhite } = getRoleLimits(playerCount, imposterCount);
                    mrWhiteCount = Math.min(mrWhiteCount, maxMrWhite);
                }
            } else if (role === 'mrwhite') {
                const newCount = mrWhiteCount + delta;
                const { maxMrWhite } = getRoleLimits(playerCount, imposterCount);
                if (newCount >= 0 && newCount <= maxMrWhite) {
                    mrWhiteCount = newCount;
                }
            }

            btn.disabled = true;
            try {
                await updateSettings({ imposterCount, mrWhiteCount });
            } catch (error) {
                btn.disabled = false;
                showError(error.message);
            }
        });
    });
}
