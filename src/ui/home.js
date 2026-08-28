/**
 * Who Is the Impostor? - UI Home ES Module
 * Home screen, create room, and join room screens
 */

import { getApp, showError, createElement, feedback, getGameState, setGameState } from './core.js';
import { createRoom, joinRoom } from '../game/room.js';
import { showHowToPlay, showSettings } from './modals.js';
import { render } from './renderer.js';
import {
    isValidRoomCode,
    MAX_PLAYER_NAME_LENGTH,
    normalizeRoomCode,
    validatePlayerName
} from '../game/domain.js';
import { escapeHtml } from '../lib/utils.js';

/**
 * Render home screen
 */
export function renderHome() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen home-screen' });

    screen.innerHTML = `
        <section class="home-brand" aria-labelledby="home-title">
            <p class="brand-kicker">Sosyal çıkarım oyunu</p>
            <h1 class="home-title" id="home-title">Who Is the <span>Impostor?</span></h1>
            <p class="home-subtitle">Aynı kelimeyi paylaş, ipuçlarını tart ve aranızdaki sahte oyuncuyu ortaya çıkar.</p>
        </section>
        <section class="home-actions" aria-label="Oyun seçenekleri">
            <p class="home-actions-label">Bir masa kur veya mevcut bir odaya katıl.</p>
            <div class="home-buttons">
                <button type="button" class="btn btn-primary btn-lg btn-block" id="btn-create-room">
                    Oda Oluştur
                </button>
                <button type="button" class="btn btn-secondary btn-lg btn-block" id="btn-join-room">
                    Odaya Katıl
                </button>
            </div>
            <div class="home-utility-actions">
                <button type="button" class="btn btn-ghost" id="btn-how-to-play">Nasıl Oynanır?</button>
                <button type="button" class="btn btn-ghost" id="btn-settings">Ayarlar</button>
            </div>
        </section>
    `;

    app.appendChild(screen);

    // Event listeners
    document.getElementById('btn-create-room').addEventListener('click', () => {
        feedback('click', 'light');
        setGameState({ phase: 'create' });
        render();
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
        feedback('click', 'light');
        setGameState({ phase: 'join' });
        render();
    });

    document.getElementById('btn-how-to-play').addEventListener('click', () => {
        feedback('click', 'light');
        showHowToPlay();
    });

    document.getElementById('btn-settings').addEventListener('click', () => {
        feedback('click', 'light');
        showSettings();
    });
}

/**
 * Render create room screen
 */
export function renderCreateRoom() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen form-screen' });

    screen.innerHTML = `
        <button type="button" class="back-button" id="btn-back" aria-label="Ana ekrana dön">←</button>
        <h1 class="title page-heading">Oda Oluştur</h1>
        <p class="subtitle">Önce adını gir</p>

        <div class="form-stack">
            <label class="input-label" for="host-name-input">Oyuncu adı</label>
            <input type="text" class="input" id="host-name-input" placeholder="Adınız..." maxlength="${MAX_PLAYER_NAME_LENGTH}" autocomplete="nickname" enterkeyhint="go">
        </div>

        <div class="screen-footer">
            <button type="button" class="btn btn-primary btn-lg btn-block" id="btn-create">
                Oda Oluştur
            </button>
        </div>
    `;

    app.appendChild(screen);

    document.getElementById('btn-back').addEventListener('click', () => {
        feedback('click', 'light');
        setGameState({ phase: 'home' });
        render();
    });

    const input = document.getElementById('host-name-input');
    const createBtn = document.getElementById('btn-create');

    const handleCreateRoom = async () => {
        const nameError = validatePlayerName(input.value);
        if (nameError) {
            showError(nameError);
            input.focus();
            return;
        }

        createBtn.disabled = true;
        createBtn.textContent = 'Oluşturuluyor...';

        try {
            feedback('success', 'medium');
            await createRoom(input.value);
            render();
        } catch (error) {
            showError('Oda oluşturulamadı: ' + error.message);
            createBtn.disabled = false;
            createBtn.textContent = 'Oda Oluştur';
        }
    };

    createBtn.addEventListener('click', handleCreateRoom);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void handleCreateRoom();
        }
    });
    input.focus();
}

/**
 * Render join room screen
 */
export function renderJoinRoom() {
    const app = getApp();
    const screen = createElement('main', { className: 'screen form-screen' });
    const prefilledCode = normalizeRoomCode(getGameState().joinRoomCode || '');

    screen.innerHTML = `
        <button type="button" class="back-button" id="btn-back" aria-label="Ana ekrana dön">←</button>
        <h1 class="title page-heading">Odaya Katıl</h1>
        <p class="subtitle">Oda kodunu ve adını gir</p>

        <div class="form-stack">
            <label class="input-label" for="room-code-input">Oda kodu</label>
            <input type="text" class="input room-code-input" id="room-code-input" placeholder="ABC123" maxlength="6" value="${escapeHtml(prefilledCode)}" autocomplete="off" autocapitalize="characters">
            <label class="input-label input-label-spaced" for="player-name-input">Oyuncu adı</label>
            <input type="text" class="input" id="player-name-input" placeholder="Adınız..." maxlength="${MAX_PLAYER_NAME_LENGTH}" autocomplete="nickname" enterkeyhint="go">
        </div>

        <div class="screen-footer">
            <button type="button" class="btn btn-primary btn-lg btn-block" id="btn-join">
                Odaya Katıl
            </button>
        </div>
    `;

    app.appendChild(screen);

    document.getElementById('btn-back').addEventListener('click', () => {
        feedback('click', 'light');
        setGameState({ joinRoomCode: null, phase: 'home' });
        render();
    });

    const codeInput = document.getElementById('room-code-input');
    const nameInput = document.getElementById('player-name-input');
    const joinBtn = document.getElementById('btn-join');

    if (prefilledCode) {
        nameInput.focus();
    }

    const handleJoinRoom = async () => {
        const code = normalizeRoomCode(codeInput.value);
        const nameError = validatePlayerName(nameInput.value);

        if (!isValidRoomCode(code)) {
            showError('Lütfen geçerli bir oda kodu girin');
            codeInput.focus();
            return;
        }
        if (nameError) {
            showError(nameError);
            nameInput.focus();
            return;
        }

        joinBtn.disabled = true;
        joinBtn.textContent = 'Katılınıyor...';

        try {
            feedback('playerJoin', 'medium');
            await joinRoom(code, nameInput.value);
            setGameState({ joinRoomCode: null });
            render();
        } catch (error) {
            showError(error.message);
            joinBtn.disabled = false;
            joinBtn.textContent = 'Odaya Katıl';
        }
    };

    joinBtn.addEventListener('click', handleJoinRoom);
    for (const input of [codeInput, nameInput]) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                void handleJoinRoom();
            }
        });
    }
    codeInput.addEventListener('input', () => {
        codeInput.value = normalizeRoomCode(codeInput.value).replace(/[^A-Z2-9]/g, '');
    });
}
