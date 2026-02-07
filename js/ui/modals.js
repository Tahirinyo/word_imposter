/**
 * Word Imposter - UI Modals Module
 * How to play, stats, and settings modals
 */

// Extend UI object with modal methods
Object.assign(UI, {
    // =====================================
    // HOW TO PLAY MODAL
    // =====================================
    showHowToPlay() {
        const overlay = Utils.createElement('div', { className: 'modal-overlay' });

        overlay.innerHTML = `
            <div class="modal how-to-play-modal" style="max-width: 420px;">
                <h2 class="modal-title">📖 Nasıl Oynanır?</h2>
                
                <div class="how-to-section">
                    <h3 class="how-to-heading">🎯 Amaç</h3>
                    <p>Hainleri ve Gizemlileri bul, oyundan ele!</p>
                </div>
                
                <div class="how-to-section">
                    <h3 class="how-to-heading">👥 Roller</h3>
                    <div class="role-cards">
                        <div class="role-card citizen">
                            <span class="role-icon">👤</span>
                            <span class="role-label">Vatandaş</span>
                            <span class="role-desc">Aynı kelime</span>
                        </div>
                        <div class="role-card imposter">
                            <span class="role-icon">🎭</span>
                            <span class="role-label">Hain</span>
                            <span class="role-desc">Benzer kelime</span>
                        </div>
                        <div class="role-card mrwhite">
                            <span class="role-icon">❓</span>
                            <span class="role-label">Gizemli</span>
                            <span class="role-desc">Sadece kategori</span>
                        </div>
                    </div>
                </div>
                
                <div class="how-to-section">
                    <h3 class="how-to-heading">🔄 Oyun Akışı</h3>
                    <ol class="how-to-steps">
                        <li>Herkes kartını görür</li>
                        <li>Sırayla <strong>TEK KELİME</strong> ile açıkla</li>
                        <li>Tartış ve şüphelen</li>
                        <li>Herkes oy verir</li>
                        <li>En çok oy alan elenir</li>
                    </ol>
                </div>
                
                <div class="how-to-section">
                    <h3 class="how-to-heading">⚖️ Berabere</h3>
                    <p>Eşit oy çıkarsa beraberlik bozulana kadar tekrar oylama yapılır.</p>
                </div>
                
                <div class="how-to-section">
                    <h3 class="how-to-heading">🏆 Kazanma</h3>
                    <p><strong style="color: var(--color-citizen);">Vatandaşlar:</strong> Tüm hainler elenirse</p>
                    <p><strong style="color: var(--color-imposter);">Hainler:</strong> Vatandaşlarla eşit kalırsa</p>
                </div>
                
                <button class="btn btn-primary btn-block" id="close-modal">Anladım!</button>
            </div>
        `;

        this.app.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.id === 'close-modal') {
                Audio.feedback('click', 'light');
                overlay.remove();
            }
        });
    },



    // =====================================
    // SETTINGS MODAL
    // =====================================
    showSettings() {
        const overlay = Utils.createElement('div', { className: 'modal-overlay' });

        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>⚙️ Ayarlar</h2>
                    <button class="modal-close" id="close-settings">&times;</button>
                </div>
                <div style="padding: var(--space-lg);">
                    <div class="settings-row">
                        <div class="settings-label">
                            <span>🔊</span>
                            <span>Ses Efektleri</span>
                        </div>
                        <div class="toggle-switch ${Audio.enabled ? 'active' : ''}" id="toggle-sound"></div>
                    </div>
                    <div class="settings-row">
                        <div class="settings-label">
                            <span>📳</span>
                            <span>Titreşim</span>
                        </div>
                        <div class="toggle-switch ${Audio.vibrationEnabled ? 'active' : ''}" id="toggle-vibration"></div>
                    </div>
                    ${!Audio.isVibrationSupported() ? '<p style="color: var(--text-muted); font-size: var(--font-size-sm); text-align: center;">Bu cihaz titreşimi desteklemiyor</p>' : ''}
                </div>
            </div>
        `;

        this.app.appendChild(overlay);

        // Close modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.id === 'close-settings') {
                Audio.feedback('click', 'light');
                overlay.remove();
            }
        });

        // Sound toggle
        document.getElementById('toggle-sound').addEventListener('click', (e) => {
            const isEnabled = Audio.toggleSound();
            e.target.classList.toggle('active', isEnabled);
            if (isEnabled) Audio.play('success');
        });

        // Vibration toggle
        document.getElementById('toggle-vibration').addEventListener('click', (e) => {
            const isEnabled = Audio.toggleVibration();
            e.target.classList.toggle('active', isEnabled);
            if (isEnabled) Audio.vibrate('light');
        });
    }
});
