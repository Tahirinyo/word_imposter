/**
 * Who Is the Impostor? - UI Modals ES Module
 * How to play and settings modals
 */

import { getApp, createElement, feedback, isSoundEnabled, isVibrationEnabled, isVibrationSupported, toggleSound, toggleVibration } from './core.js';
import { play } from '../lib/audio.js';

/**
 * Show how to play modal
 */
export function showHowToPlay() {
    const app = getApp();
    const overlay = createElement('div', { className: 'modal-overlay' });

    overlay.innerHTML = `
        <div class="modal how-to-play-modal" role="dialog" aria-modal="true" aria-labelledby="how-to-title">
            <h2 class="modal-title" id="how-to-title">Nasıl Oynanır?</h2>

            <div class="how-to-section">
                <h3 class="how-to-heading">Amaç</h3>
                <p>Hainleri ve Gizemlileri bul, oyundan ele!</p>
            </div>

            <div class="how-to-section">
                <h3 class="how-to-heading">Roller</h3>
                <div class="role-cards">
                    <div class="role-card citizen">
                        <span class="role-icon">01</span>
                        <span class="role-label">Vatandaş</span>
                        <span class="role-desc">Aynı kelime</span>
                    </div>
                    <div class="role-card imposter">
                        <span class="role-icon">02</span>
                        <span class="role-label">Hain</span>
                        <span class="role-desc">Benzer kelime</span>
                    </div>
                    <div class="role-card mrwhite">
                        <span class="role-icon">03</span>
                        <span class="role-label">Gizemli</span>
                        <span class="role-desc">Sadece kategori</span>
                    </div>
                </div>
            </div>

            <div class="how-to-section">
                <h3 class="how-to-heading">Oyun Akışı</h3>
                <ol class="how-to-steps">
                    <li>Herkes kartını görür</li>
                    <li>Sırayla <strong>TEK KELİME</strong> ile açıkla</li>
                    <li>Tartış ve şüphelen</li>
                    <li>Herkes oy verir</li>
                    <li>En çok oy alan elenir</li>
                </ol>
            </div>

            <div class="how-to-section">
                <h3 class="how-to-heading">Berabere</h3>
                <p>Eşit oy çıkarsa beraberlik bozulana kadar tekrar oylama yapılır.</p>
            </div>

            <div class="how-to-section">
                <h3 class="how-to-heading">Kazanma</h3>
                <p><strong>Vatandaşlar:</strong> Tüm hainler elenirse</p>
                <p><strong>Hainler:</strong> Vatandaşlarla eşit kalırsa</p>
            </div>

            <button type="button" class="btn btn-primary btn-block" id="close-modal">Anladım!</button>
        </div>
    `;

    app.appendChild(overlay);

    const close = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
    };
    const handleKeydown = (event) => {
        if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeydown);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.id === 'close-modal') {
            feedback('click', 'light');
            close();
        }
    });
    document.getElementById('close-modal').focus();
}

/**
 * Show settings modal
 */
export function showSettings() {
    const app = getApp();
    const overlay = createElement('div', { className: 'modal-overlay' });

    overlay.innerHTML = `
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div class="modal-header">
                <h2 id="settings-title">Ayarlar</h2>
                <button type="button" class="modal-close" id="close-settings" aria-label="Ayarları kapat">&times;</button>
            </div>
            <div class="modal-body">
                <div class="settings-row">
                    <div class="settings-label">
                        <span>Ses Efektleri</span>
                    </div>
                    <button type="button" class="toggle-switch ${isSoundEnabled() ? 'active' : ''}" id="toggle-sound" aria-label="Ses efektlerini aç veya kapat" aria-pressed="${isSoundEnabled()}"></button>
                </div>
                <div class="settings-row">
                    <div class="settings-label">
                        <span>Titreşim</span>
                    </div>
                    <button type="button" class="toggle-switch ${isVibrationEnabled() ? 'active' : ''}" id="toggle-vibration" aria-label="Titreşimi aç veya kapat" aria-pressed="${isVibrationEnabled()}"></button>
                </div>
                ${!isVibrationSupported() ? '<p class="modal-support-note">Bu cihaz titreşimi desteklemiyor</p>' : ''}
            </div>
        </div>
    `;

    app.appendChild(overlay);

    const close = () => {
        document.removeEventListener('keydown', handleKeydown);
        overlay.remove();
    };
    const handleKeydown = (event) => {
        if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeydown);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.id === 'close-settings') {
            feedback('click', 'light');
            close();
        }
    });

    document.getElementById('toggle-sound').addEventListener('click', (e) => {
        const isEnabled = toggleSound();
        e.currentTarget.classList.toggle('active', isEnabled);
        e.currentTarget.setAttribute('aria-pressed', String(isEnabled));
        if (isEnabled) play('success');
    });

    document.getElementById('toggle-vibration').addEventListener('click', (e) => {
        const isEnabled = toggleVibration();
        e.currentTarget.classList.toggle('active', isEnabled);
        e.currentTarget.setAttribute('aria-pressed', String(isEnabled));
    });
    document.getElementById('close-settings').focus();
}
