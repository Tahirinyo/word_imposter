/**
 * Who Is the Impostor? - UI Game ES Module
 * Role reveal, discussion, voting, elimination, and game over screens
 */

import { getApp, createElement, feedback, roleNames, getRoomState, showError } from './core.js';
import {
    getPlayers,
    getAlivePlayers,
    getMyPlayer,
    markRoleSeen,
    setPhase,
    submitVote,
    getVoteCounts,
    checkAllVoted,
    getMyVote,
    getTiedPlayers,
    clearVotes,
    finalizeVote,
    processRound,
    restartWithNewWord,
    resetToWaiting
} from '../game/room.js';
import { escapeHtml } from '../lib/utils.js';
import { renderWordReminder } from './word-reminder.js';
import { renderPrivateRevealCard } from './private-reveal.js';

let lastFeedbackKey = null;

function feedbackOnce(key, soundName, vibrationName) {
    if (lastFeedbackKey === key) return;
    lastFeedbackKey = key;
    feedback(soundName, vibrationName);
}

function getVotingProgress(players) {
    const eligiblePlayers = players.filter((player) => player.connected !== false);
    return {
        totalVoters: eligiblePlayers.length,
        votedCount: eligiblePlayers.filter((player) => player.hasVoted === true).length
    };
}

/**
 * Render multiplayer role reveal screen
 */
export function renderMultiplayerReveal() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen reveal-screen' });
    const myPlayer = getMyPlayer();

    if (!myPlayer) return;

    if (!myPlayer.isSpectator && !myPlayer.role) {
        screen.innerHTML = `
            <div class="loading-spinner" aria-hidden="true">◌</div>
            <h1 class="title">Kartın hazırlanıyor</h1>
            <p class="subtitle">Güvenli kartın yükleniyor…</p>
        `;
    } else if (myPlayer.isSpectator) {
        const waitingPlayers = getPlayers().filter(p => !p.isSpectator && !p.roleSeen);

        screen.innerHTML = `
            <h1 class="title">İzleyici Modu</h1>
            <p class="subtitle">Devam eden oyuna izleyici olarak katıldınız. Bir sonraki oyunda rol alacaksınız.</p>

            <div class="private-waiting-card">
                <div class="private-waiting-label">İzleyici modu</div>
                <div class="private-waiting-note">Oyuncuların kartlarını görmesi bekleniyor.</div>
            </div>

            <div class="waiting-players">
                <p class="text-muted">Bekleyenler:</p>
                ${waitingPlayers.map(p => `<span class="waiting-player">${escapeHtml(p.name)}</span>`).join(', ')}
            </div>
        `;
    } else if (myPlayer.roleSeen) {
        // Already seen, show waiting
        const waitingPlayers = getPlayers().filter(p => !p.isSpectator && !p.roleSeen);

        screen.innerHTML = `
            <h1 class="title">Kartını Gördün!</h1>
            <p class="subtitle">Diğer oyuncuların kartlarını görmesini bekle...</p>

            <div class="private-waiting-card">
                <div class="private-waiting-label">Kartın kapalı</div>
                <div class="private-waiting-note">Kartını yalnızca gerektiğinde aç.</div>
            </div>

            ${renderWordReminder(myPlayer)}

            <div class="waiting-players">
                <p class="text-muted">Bekleyenler:</p>
                ${waitingPlayers.map(p => `<span class="waiting-player">${escapeHtml(p.name)}</span>`).join(', ')}
            </div>
        `;
    } else {
        // Show reveal card
        screen.innerHTML = `
            <p class="reveal-instruction">Kartını görmek için dokun</p>
            <h2 class="reveal-player-name">${escapeHtml(myPlayer.name)}</h2>

            <button type="button" class="card-flip-container" id="card-container" aria-label="Kartını göster">
                <div class="card-flip" id="card-flip">
                    <div class="card-face card-front">
                        <div class="card-front-icon">ÖZEL</div>
                        <div class="card-front-text">Kartını görmek için<br>dokun</div>
                    </div>
                    ${renderPrivateRevealCard(myPlayer)}
                </div>
            </button>

            <button type="button" class="btn btn-primary btn-lg reveal-next-btn" id="btn-seen">
                Kartı Kapat
            </button>
        `;
    }

    app.appendChild(screen);

    if (myPlayer.role && !myPlayer.roleSeen) {
        const card = document.getElementById('card-container');
        const seenBtn = document.getElementById('btn-seen');
        let isFlipped = false;

        card.addEventListener('click', () => {
            if (!isFlipped) {
                feedback('cardFlip', 'medium');
                document.getElementById('card-flip').classList.add('flipped');
                isFlipped = true;
                seenBtn.classList.add('visible');

                setTimeout(() => {
                    feedback('roleReveal', 'roleReveal');
                }, 400);
            }
        });

        seenBtn.addEventListener('click', async () => {
            feedback('click', 'light');

            // Instant visual update - show waiting state immediately
            seenBtn.disabled = true;
            seenBtn.textContent = 'Bekleniyor...';

            // Hide the card flip container and show waiting message
            const container = document.getElementById('card-container');
            const instruction = document.querySelector('.reveal-instruction');
            const playerName = document.querySelector('.reveal-player-name');

            if (container) container.remove();
            if (instruction) instruction.style.display = 'none';
            if (playerName) {
                playerName.textContent = 'Kartını Gördün!';
                playerName.className = 'title';
            }

            // Add waiting message
            const waitingMsg = document.createElement('p');
            waitingMsg.className = 'subtitle';
            waitingMsg.textContent = 'Diğer oyuncuların kartlarını görmesini bekle...';
            waitingMsg.id = 'instant-waiting-msg';
            seenBtn.parentNode.insertBefore(waitingMsg, seenBtn);

            // Hide the button after showing waiting state
            seenBtn.style.display = 'none';

            // Sync with Firebase in background
            try {
                await markRoleSeen();
            } catch (error) {
                showError(error.message);
                seenBtn.disabled = false;
                seenBtn.style.display = '';
            }
        });
    }
}

/**
 * Render multiplayer lobby (discussion)
 */
export function renderMultiplayerLobby() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen discussion-screen' });
    const { isHost } = getRoomState();
    const alivePlayers = getAlivePlayers();
    const myPlayer = getMyPlayer();
    const amSpectator = myPlayer?.isSpectator === true;

    let playersHTML = alivePlayers.map((player, index) => {
        const isMe = player.id === getRoomState().playerId;
        return `
            <div class="alive-player ${isMe ? 'is-me' : ''}">
                <div class="alive-player-avatar">${String(index + 1).padStart(2, '0')}</div>
                <div class="alive-player-name">${escapeHtml(player.name)}${isMe ? ' (Sen)' : ''}</div>
            </div>
        `;
    }).join('');

    screen.innerHTML = `
        <div class="lobby-header">
            <h1 class="lobby-title">Tartışma Zamanı!</h1>
        </div>

        <div class="discussion-layout">
            <section class="alive-players" aria-label="Oyundaki oyuncular">
                ${playersHTML}
            </section>

            <aside class="discussion-sidebar">
                <div class="lobby-tip">
                    <div class="lobby-tip-label">Tartışma kuralı</div>
                    <div class="lobby-tip-text">Her oyuncu sırayla kelimesini tek kelimeyle açıklasın.</div>
                </div>
                ${renderWordReminder(myPlayer)}
                ${amSpectator ? '<p class="spectator-note">İzleyici modundasınız. Bir sonraki oyunda rol alacaksınız.</p>' : ''}
            </aside>
        </div>
        ${isHost ? `
            <div class="screen-footer">
                <button type="button" class="btn btn-host btn-lg btn-block" id="btn-vote">
                    Oylamaya Geç
                </button>
            </div>
        ` : `
            <div class="screen-footer">
                <p class="text-center text-muted">Oda sahibi oylamayı başlatacak...</p>
            </div>
        `}
    `;

    app.appendChild(screen);

    if (isHost) {
        document.getElementById('btn-vote').addEventListener('click', async () => {
            feedback('vote', 'medium');
            const button = document.getElementById('btn-vote');
            button.disabled = true;
            try {
                await setPhase('voting');
            } catch (error) {
                button.disabled = false;
                showError(error.message);
            }
        });
    }
}

/**
 * Render multiplayer voting
 */
export function renderMultiplayerVoting() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen voting-screen' });
    const { playerId, isHost, currentRoom } = getRoomState();
    const alivePlayers = getAlivePlayers();
    const myPlayer = getMyPlayer();
    const myVote = getMyVote();
    const voteSubmitted = Boolean(myVote || myPlayer?.hasVoted);
    const allVoted = checkAllVoted();

    // Check if I'm eliminated - show spectator view
    const amEliminated = myPlayer?.alive === false;

    // If all voted, show vote summary
    if (currentRoom?.gameState?.voteResults || allVoted) {
        renderVoteSummary(screen);
        return;
    }

    // If eliminated, show spectator view
    if (amEliminated) {
        const { votedCount, totalVoters } = getVotingProgress(alivePlayers);
        const amSpectator = myPlayer?.isSpectator === true;

        screen.innerHTML = `
            <div class="voting-header">
                <p class="phase-kicker">Oylama</p>
                <h1 class="voting-title">Oylamayı İzliyorsun</h1>
                <p class="voting-subtitle">${amSpectator ? 'İzleyici modundasınız, oy veremezsiniz' : 'Elendiğin için oy veremezsin'}</p>
                <p class="voting-progress">${votedCount}/${totalVoters} oyuncu oy verdi</p>
            </div>
        `;

        app.appendChild(screen);
        return;
    }

    // Filter out self from voting options
    const votableOptions = alivePlayers.filter(p => p.id !== playerId);

    const optionsHTML = votableOptions.map((player) => `
        <div class="vote-option ${myVote === player.id ? 'selected' : ''} ${voteSubmitted ? 'is-locked' : ''}"
             data-id="${player.id}" aria-disabled="${voteSubmitted}">
            <div class="vote-avatar">${String(alivePlayers.indexOf(player) + 1).padStart(2, '0')}</div>
            <span class="vote-name">${escapeHtml(player.name)}</span>
            ${myVote === player.id ? '<span class="vote-check">✓</span>' : ''}
        </div>
    `).join('');

    // Count how many have voted
    const { votedCount, totalVoters } = getVotingProgress(alivePlayers);

    screen.innerHTML = `
        ${isHost ? '<button class="back-button" id="btn-back">←</button>' : ''}
        <div class="voting-header">
            <p class="phase-kicker">Gizli oy</p>
            <h1 class="voting-title">Kimi Elemek İstiyorsun?</h1>
            <p class="voting-subtitle">${votedCount}/${totalVoters} oyuncu oy verdi</p>
        </div>

        <div class="vote-options">
            ${optionsHTML}
        </div>

        <div class="private-card-utility">
            ${renderWordReminder(myPlayer)}
        </div>

        <div class="voting-footer">
            ${voteSubmitted
            ? '<p class="text-center text-muted">Oyun verildi. Diğer oyuncular bekleniyor...</p>'
            : '<p class="text-center text-muted">Bir oyuncu seçin</p>'}
        </div>
    `;

    app.appendChild(screen);

    // Back button (host only)
    if (isHost && document.getElementById('btn-back')) {
        document.getElementById('btn-back').addEventListener('click', async () => {
            feedback('click', 'light');
            const button = document.getElementById('btn-back');
            button.disabled = true;
            try {
                await clearVotes();
            } catch (error) {
                button.disabled = false;
                showError(error.message);
            }
        });
    }

    // Vote selection
    let votePending = false;
    document.querySelectorAll('.vote-option').forEach(option => {
        option.addEventListener('click', async () => {
            if (voteSubmitted || votePending) return;
            votePending = true;
            feedback('vote', 'light');
            document.querySelectorAll('.vote-option').forEach(candidate => {
                candidate.classList.add('pending');
                candidate.setAttribute('aria-disabled', 'true');
            });
            try {
                await submitVote(option.dataset.id);
            } catch (error) {
                votePending = false;
                document.querySelectorAll('.vote-option').forEach(candidate => {
                    candidate.classList.remove('pending');
                    candidate.setAttribute('aria-disabled', 'false');
                });
                showError(error.message);
            }
        });
    });
}

/**
 * Render vote summary screen
 */
function renderVoteSummary(screen) {
    const app = getApp();
    const { currentRoom, isHost } = getRoomState();
    if (!currentRoom?.gameState?.voteResults) {
        screen.innerHTML = `
            <div class="loading-spinner" aria-hidden="true">◌</div>
            <h1 class="title">Oylar sayılıyor</h1>
            <p class="subtitle">Sonuç hazırlanıyor…</p>
        `;
        app.appendChild(screen);
        return;
    }
    const alivePlayers = getAlivePlayers();
    const voteCounts = getVoteCounts();
    const tiedPlayers = getTiedPlayers();
    const isTie = tiedPlayers.length > 1;

    // Sort players by vote count
    const sortedPlayers = alivePlayers
        .map(p => ({ ...p, votes: voteCounts[p.id] || 0 }))
        .filter(p => p.votes > 0)
        .sort((a, b) => b.votes - a.votes);

    let resultsHTML = sortedPlayers.map((player, index) => `
        <div class="vote-result ${tiedPlayers.includes(player.id) ? 'tied' : ''} ${index === 0 && !isTie ? 'eliminated' : ''}">
            <span class="vote-result-name">${escapeHtml(player.name)}</span>
            <span class="vote-result-count">${player.votes} oy</span>
        </div>
    `).join('');

    if (isTie) {
        feedbackOnce(`tie-${getRoomState().currentRoom?.gameState?.roundNumber}`, 'error', 'medium');
        const tiedNames = tiedPlayers
            .map(id => alivePlayers.find(p => p.id === id)?.name)
            .filter(Boolean)
            .map(escapeHtml)
            .join(', ');

        screen.innerHTML = `
            <div class="voting-header">
                <p class="phase-kicker">Oylama sonucu</p>
                <h1 class="voting-title">Berabere</h1>
                <p class="voting-subtitle">Oylar eşit çıktı</p>
            </div>

            <div class="vote-results">
                ${resultsHTML}
            </div>

            <div class="tie-info">
                <p>Beraberlik: <strong>${tiedNames}</strong></p>
                <p class="text-muted">Beraberlik bozulana kadar tekrar oylama yapılacak.</p>
            </div>

            ${isHost ? `
                <div class="voting-footer">
                    <button type="button" class="btn btn-host btn-lg btn-block" id="btn-revote">
                        Tartışmaya Dön
                    </button>
                </div>
            ` : `
                <div class="voting-footer">
                    <p class="text-center text-muted">Oda sahibi tartışmaya dönebilir...</p>
                </div>
            `}
        `;

        app.appendChild(screen);

        if (isHost && document.getElementById('btn-revote')) {
            document.getElementById('btn-revote').addEventListener('click', async () => {
                feedback('click', 'light');
                const button = document.getElementById('btn-revote');
                button.disabled = true;
                try {
                    await clearVotes();
                } catch (error) {
                    button.disabled = false;
                    showError(error.message);
                }
            });
        }
    } else {
        const eliminatedId = tiedPlayers[0];
        const eliminatedPlayer = alivePlayers.find(p => p.id === eliminatedId);

        feedbackOnce(`vote-result-${getRoomState().currentRoom?.gameState?.roundNumber}`, 'vote', 'medium');

        screen.innerHTML = `
            <div class="voting-header">
                <p class="phase-kicker">Oylar sayıldı</p>
                <h1 class="voting-title">Oylama Sonucu</h1>
            </div>

            <div class="vote-results">
                ${resultsHTML}
            </div>

            <div class="elimination-preview">
                <p>Elenen oyuncu:</p>
                <h2 class="eliminated-preview-name">${escapeHtml(eliminatedPlayer?.name || '?')}</h2>
            </div>

            ${isHost ? `
                <div class="voting-footer">
                    <button type="button" class="btn btn-danger btn-lg btn-block" id="btn-confirm-eliminate">
                        Devam Et
                    </button>
                </div>
            ` : `
                <div class="voting-footer">
                    <p class="text-center text-muted">Oda sahibi devam ettirecek...</p>
                </div>
            `}
        `;

        app.appendChild(screen);

        if (isHost && document.getElementById('btn-confirm-eliminate')) {
            document.getElementById('btn-confirm-eliminate').addEventListener('click', async () => {
                feedback('eliminate', 'eliminate');
                const button = document.getElementById('btn-confirm-eliminate');
                button.disabled = true;
                try {
                    await finalizeVote();
                } catch (error) {
                    button.disabled = false;
                    showError(error.message);
                }
            });
        }
    }
}

/**
 * Render multiplayer elimination screen
 */
export function renderMultiplayerElimination() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen elimination-screen' });
    const { currentRoom, isHost } = getRoomState();
    const eliminatedId = currentRoom.gameState?.eliminatedPlayerId;
    const player = getPlayers().find(p => p.id === eliminatedId);

    if (!player) return;

    feedbackOnce(`eliminated-${eliminatedId}`, 'eliminate', 'eliminate');

    const revealedRole = player.revealedRole;
    const revealedWord = player.revealedWord;

    screen.innerHTML = `
        <h2 class="elimination-title">Elenen Oyuncu</h2>

        <div class="eliminated-player-card ${escapeHtml(revealedRole)}">
            <h1 class="eliminated-name">${escapeHtml(player.name)}</h1>
            <span class="eliminated-role ${escapeHtml(revealedRole)}">${escapeHtml(roleNames[revealedRole] || 'Bilinmiyor')}</span>
            ${revealedRole === 'imposter' ? `<p class="eliminated-word">Kelimesi: <strong>${escapeHtml(revealedWord)}</strong></p>` : ''}
        </div>

        ${isHost ? `
            <button type="button" class="btn btn-primary btn-lg btn-block" id="btn-continue">
                Devam Et →
            </button>
        ` : `
            <p class="text-center text-muted">Oda sahibi devam edecek...</p>
        `}
    `;

    app.appendChild(screen);

    if (isHost) {
        document.getElementById('btn-continue').addEventListener('click', async () => {
            feedback('click', 'light');
            const button = document.getElementById('btn-continue');
            button.disabled = true;
            try {
                await processRound();
            } catch (error) {
                button.disabled = false;
                showError(error.message);
            }
        });
    }
}

/**
 * Render multiplayer game over screen
 */
export function renderMultiplayerGameOver() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen gameover-screen' });
    const { currentRoom, isHost } = getRoomState();
    const winner = currentRoom.gameState?.winner;
    const isCitizensWin = winner === 'citizens';
    const wordPair = currentRoom.gameState?.wordPair;

    const myPlayer = getMyPlayer();
    const didIWin = (isCitizensWin && myPlayer?.role === 'citizen') ||
        (!isCitizensWin && (myPlayer?.role === 'imposter' || myPlayer?.role === 'mrwhite'));

    feedbackOnce(`gameover-${currentRoom.gameState?.roundId}`, didIWin ? 'victory' : 'gameOver', didIWin ? 'victory' : 'heavy');

    screen.innerHTML = `
        <div class="gameover-mark">Oyun tamamlandı</div>
        <h1 class="gameover-title ${winner}">${isCitizensWin ? 'Vatandaşlar Kazandı!' : 'Hainler Kazandı!'}</h1>
        <p class="gameover-subtitle">${isCitizensWin ? 'Tüm kötüler yakalandı!' : 'Hainler saklanabildiler!'}</p>

        <div class="gameover-words">
            <div class="gameover-word-row">
                <span class="gameover-word-label">Vatandaş Kelimesi</span>
                <span class="gameover-word-value">${escapeHtml(wordPair?.citizenWord || '-')}</span>
            </div>
            <div class="gameover-word-row">
                <span class="gameover-word-label">Hain Kelimesi</span>
                <span class="gameover-word-value">${escapeHtml(wordPair?.imposterWord || '-')}</span>
            </div>
            <div class="gameover-word-row">
                <span class="gameover-word-label">Kategori</span>
                <span class="gameover-word-value">${escapeHtml(wordPair?.category || '-')}</span>
            </div>
        </div>

        ${isHost ? `
            <div class="gameover-buttons">
                <button type="button" class="btn btn-primary btn-block" id="btn-new-word">
                    Yeni Kelime ile Oyna
                </button>
                <button type="button" class="btn btn-secondary btn-block" id="btn-lobby">
                    Bekleme Odasına Dön
                </button>
            </div>
        ` : `
            <div class="gameover-buttons">
                <p class="text-center text-muted">Oda sahibi yeni oyun başlatabilir...</p>
            </div>
        `}
    `;

    app.appendChild(screen);

    if (isHost) {
        document.getElementById('btn-new-word').addEventListener('click', async () => {
            feedback('newRound', 'success');
            const button = document.getElementById('btn-new-word');
            button.disabled = true;
            try {
                await restartWithNewWord();
            } catch (error) {
                button.disabled = false;
                showError(error.message);
            }
        });

        document.getElementById('btn-lobby').addEventListener('click', async () => {
            feedback('click', 'light');
            const button = document.getElementById('btn-lobby');
            button.disabled = true;
            try {
                await resetToWaiting();
            } catch (error) {
                button.disabled = false;
                showError(error.message);
            }
        });
    }
}
