import { escapeHtml } from '../lib/utils.js';

export function renderPrivateRevealCard(player) {
    const clue = player.role === 'mrwhite'
        ? `<div class="card-word">???</div><div class="card-category">Kategori: ${escapeHtml(player.category)}</div>`
        : `<div class="card-word">${escapeHtml(player.word)}</div>`;

    return `
        <div class="card-face card-back" id="card-back">
            ${clue}
        </div>
    `;
}
