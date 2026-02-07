/**
 * Word Imposter - UI Home Module
 * Home screen, create room, and join room screens
 */

// Extend UI object with home-related methods
Object.assign(UI, {
    // =====================================
    // HOME SCREEN
    // =====================================
    renderHome() {
        const screen = Utils.createElement('div', { className: 'screen home-screen' });

        screen.innerHTML = ` 
            <div class="logo-container">
                <div class="logo">🎭</div>
            </div>
            <div>
                <h1 class="home-title">Who Is<br>Imposter?</h1>
                <p class="home-subtitle">Hainleri bul, Gizemlileri yakala!</p>
            </div>
            <div class="home-buttons">
                <button class="btn btn-primary btn-lg btn-block" id="btn-create-room">
                    🏠 Oda Oluştur
                </button>
                <button class="btn btn-secondary btn-block" id="btn-join-room">
                    🚪 Odaya Katıl
                </button>
                <button class="btn btn-ghost btn-block" id="btn-how-to-play">
                    📖 Nasıl Oynanır?
                </button>

                <button class="btn btn-ghost btn-block" id="btn-settings">
                    ⚙️ Ayarlar
                </button>
            </div>
        `;

        this.app.appendChild(screen);

        // Event listeners with audio feedback
        document.getElementById('btn-create-room').addEventListener('click', () => {
            Audio.feedback('click', 'light');
            Game.setPhase('create');
            this.render();
        });

        document.getElementById('btn-join-room').addEventListener('click', () => {
            Audio.feedback('click', 'light');
            Game.setPhase('join');
            this.render();
        });

        document.getElementById('btn-how-to-play').addEventListener('click', () => {
            Audio.feedback('click', 'light');
            this.showHowToPlay();
        });



        document.getElementById('btn-settings').addEventListener('click', () => {
            Audio.feedback('click', 'light');
            this.showSettings();
        });
    },

    // =====================================
    // CREATE ROOM SCREEN
    // =====================================
    renderCreateRoom() {
        const screen = Utils.createElement('div', { className: 'screen' });

        screen.innerHTML = `
            <button class="back-button" id="btn-back">←</button>
            <h1 class="title" style="margin-top: var(--space-xl);">Oda Oluştur</h1>
            <p class="subtitle">Önce adını gir</p>
            
            <div style="margin-top: var(--space-xl);">
                <input type="text" class="input" id="host-name-input" placeholder="Adınız..." maxlength="15" autofocus>
            </div>
            
            <div style="margin-top: auto; padding-top: var(--space-xl);">
                <button class="btn btn-primary btn-lg btn-block" id="btn-create">
                    🚀 Oda Oluştur
                </button>
            </div>
        `;

        this.app.appendChild(screen);

        document.getElementById('btn-back').addEventListener('click', () => {
            Audio.feedback('click', 'light');
            Game.setPhase('home');
            this.render();
        });

        const input = document.getElementById('host-name-input');
        const createBtn = document.getElementById('btn-create');

        const createRoom = async () => {
            const name = input.value.trim();
            if (!name) {
                this.showError('Lütfen adınızı girin');
                return;
            }

            createBtn.disabled = true;
            createBtn.textContent = 'Oluşturuluyor...';

            try {
                Audio.feedback('success', 'medium');
                await Room.createRoom(name);
                this.render();
            } catch (error) {
                this.showError('Oda oluşturulamadı: ' + error.message);
                createBtn.disabled = false;
                createBtn.textContent = '🚀 Oda Oluştur';
            }
        };

        createBtn.addEventListener('click', createRoom);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') createRoom();
        });
    },

    // =====================================
    // JOIN ROOM SCREEN
    // =====================================
    renderJoinRoom() {
        const screen = Utils.createElement('div', { className: 'screen' });
        const prefilledCode = Game.state.joinRoomCode || '';

        screen.innerHTML = `
            <button class="back-button" id="btn-back">←</button>
            <h1 class="title" style="margin-top: var(--space-xl);">Odaya Katıl</h1>
            <p class="subtitle">Oda kodunu ve adını gir</p>
            
            <div style="margin-top: var(--space-xl);">
                <input type="text" class="input" id="room-code-input" placeholder="Oda Kodu (örn: ABC123)" maxlength="6" value="${prefilledCode}" style="text-transform: uppercase; letter-spacing: 0.2em; text-align: center; font-size: 1.5rem;">
                <input type="text" class="input" id="player-name-input" placeholder="Adınız..." maxlength="15" style="margin-top: var(--space-md);">
            </div>
            
            <div style="margin-top: auto; padding-top: var(--space-xl);">
                <button class="btn btn-primary btn-lg btn-block" id="btn-join">
                    🚪 Odaya Katıl
                </button>
            </div>
        `;

        this.app.appendChild(screen);

        document.getElementById('btn-back').addEventListener('click', () => {
            Audio.feedback('click', 'light');
            Game.state.joinRoomCode = null;
            Game.setPhase('home');
            this.render();
        });

        const codeInput = document.getElementById('room-code-input');
        const nameInput = document.getElementById('player-name-input');
        const joinBtn = document.getElementById('btn-join');

        // Focus on name if code is prefilled
        if (prefilledCode) {
            nameInput.focus();
        }

        const joinRoom = async () => {
            const code = codeInput.value.trim().toUpperCase();
            const name = nameInput.value.trim();

            if (!code || code.length < 6) {
                this.showError('Lütfen geçerli bir oda kodu girin');
                return;
            }
            if (!name) {
                this.showError('Lütfen adınızı girin');
                return;
            }

            joinBtn.disabled = true;
            joinBtn.textContent = 'Katılınıyor...';

            try {
                Audio.feedback('playerJoin', 'medium');
                await Room.joinRoom(code, name);
                Game.state.joinRoomCode = null;
                this.render();
            } catch (error) {
                this.showError(error.message);
                joinBtn.disabled = false;
                joinBtn.textContent = '🚪 Odaya Katıl';
            }
        };

        joinBtn.addEventListener('click', joinRoom);
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') joinRoom();
        });
    }
});
