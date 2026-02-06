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
            <div class="modal" style="max-width: 400px;">
                <h2 class="modal-title">📖 Nasıl Oynanır?</h2>
                <div style="text-align: left; margin-bottom: var(--space-lg);">
                    <p style="margin-bottom: var(--space-md); color: var(--text-secondary);">
                        <strong style="color: var(--color-citizen);">👤 Vatandaşlar:</strong><br>
                        Aynı kelimeyi alır. Hainleri ve Gizemlileri bulmaya çalışır.
                    </p>
                    <p style="margin-bottom: var(--space-md); color: var(--text-secondary);">
                        <strong style="color: var(--color-imposter);">🎭 Hainler:</strong><br>
                        Benzer ama farklı bir kelime alır. Vatandaş gibi davranmaya çalışır.
                    </p>
                    <p style="margin-bottom: var(--space-md); color: var(--text-secondary);">
                        <strong style="color: var(--color-mrwhite);">❓ Gizemli:</strong><br>
                        Sadece kategoriyi bilir. Kelimeyi tahmin etmeye çalışır.
                    </p>
                    <p style="color: var(--text-secondary);">
                        <strong>🗣️ Açıklama:</strong> Her oyuncu sırayla kelimesini TEK KELİME ile açıklar.
                    </p>
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
    // STATS MODAL
    // =====================================
    showStats() {
        const overlay = Utils.createElement('div', { className: 'modal-overlay' });

        overlay.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>📊 İstatistikler</h2>
                    <button class="modal-close" id="close-stats">&times;</button>
                </div>
                ${Score.renderStatsHTML()}
                <div style="padding: var(--space-lg); padding-top: 0;">
                    <button class="btn btn-danger btn-block btn-sm" id="btn-reset-stats">
                        🗑️ İstatistikleri Sıfırla
                    </button>
                </div>
            </div>
        `;

        this.app.appendChild(overlay);

        // Close modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.id === 'close-stats') {
                Audio.feedback('click', 'light');
                overlay.remove();
            }
        });

        // Reset stats button
        document.getElementById('btn-reset-stats').addEventListener('click', () => {
            if (confirm('Tüm istatistikler silinecek. Emin misin?')) {
                Audio.feedback('success', 'medium');
                Score.resetStats();
                overlay.remove();
                this.showStats(); // Refresh stats view
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
