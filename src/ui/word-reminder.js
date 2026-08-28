import { escapeHtml } from '../lib/utils.js';

export function renderWordReminder(player) {
    if (!player?.role || player.isSpectator) return '';
    const clue = player.role === 'mrwhite'
        ? `Kategori: ${escapeHtml(player.category)}`
        : `Kelimen: ${escapeHtml(player.word)}`;

    return `
        <details class="role-reminder">
            <summary>
                <span class="role-reminder-label role-reminder-label-closed">Kartımı Göster</span>
                <span class="role-reminder-label role-reminder-label-open">Kartımı Gizle</span>
            </summary>
            <div class="role-reminder-content">
                <span>${clue}</span>
            </div>
        </details>
    `;
}
