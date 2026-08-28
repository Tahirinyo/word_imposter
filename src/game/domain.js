export const ROOM_CODE_LENGTH = 6;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const MAX_PLAYER_NAME_LENGTH = 15;

export const ROOM_STATUSES = Object.freeze({
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
});

export const GAME_PHASES = Object.freeze({
    WAITING: 'waiting',
    CATEGORY: 'category',
    STARTING: 'starting',
    REVEAL: 'reveal',
    LOBBY: 'lobby',
    VOTING: 'voting',
    ELIMINATION: 'elimination',
    GAME_OVER: 'gameover'
});

export const ROLES = Object.freeze({
    CITIZEN: 'citizen',
    IMPOSTER: 'imposter',
    MR_WHITE: 'mrwhite'
});

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const PLAYER_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'’-]*$/u;

export function normalizeRoomCode(value) {
    return String(value ?? '').trim().toUpperCase();
}

export function isValidRoomCode(value) {
    return ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
}

export function normalizePlayerName(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');
}

export function validatePlayerName(value) {
    const name = normalizePlayerName(value);
    const length = Array.from(name).length;

    if (length < 1) return 'Lütfen adınızı girin';
    if (length > MAX_PLAYER_NAME_LENGTH) {
        return `Adınız en fazla ${MAX_PLAYER_NAME_LENGTH} karakter olabilir`;
    }
    if (!PLAYER_NAME_PATTERN.test(name)) {
        return 'Ad yalnızca harf, sayı, boşluk, nokta, tire ve kesme işareti içerebilir';
    }

    return null;
}

export function getRoleLimits(playerCount, imposterCount = 1) {
    return {
        maxImposters: Math.max(1, Math.floor((playerCount - 1) / 2)),
        maxMrWhite: Math.max(0, Math.floor((playerCount - imposterCount - 1) / 2))
    };
}

export function validateRoleCounts(playerCount, imposterCount, mrWhiteCount) {
    if (!Number.isInteger(imposterCount) || imposterCount < 1) {
        return 'En az bir Hain gerekli';
    }
    if (!Number.isInteger(mrWhiteCount) || mrWhiteCount < 0) {
        return 'Gizemli sayısı geçersiz';
    }

    const citizenCount = playerCount - imposterCount - mrWhiteCount;
    if (citizenCount <= imposterCount + mrWhiteCount) {
        return 'Geçersiz dağılım: Hainler oyunu anında kazanır!';
    }

    return null;
}

export function getVoteCounts(votes = {}) {
    return Object.values(votes).reduce((counts, targetId) => {
        if (targetId) counts[targetId] = (counts[targetId] || 0) + 1;
        return counts;
    }, {});
}

export function getHighestVotedPlayerIds(votes = {}) {
    const counts = getVoteCounts(votes);
    const maxVotes = Math.max(0, ...Object.values(counts));
    return maxVotes === 0
        ? []
        : Object.keys(counts).filter((playerId) => counts[playerId] === maxVotes);
}

export function haveAllAlivePlayersVoted(players = {}, votes = {}) {
    return Object.values(players)
        .filter((player) => player.alive !== false && !player.isSpectator && player.connected !== false)
        .every((player) => Object.hasOwn(votes, player.id));
}
