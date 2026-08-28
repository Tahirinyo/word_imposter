const { randomInt, randomUUID } = require('node:crypto');

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const PLAYER_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'’-]*$/u;

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const MAX_PLAYER_NAME_LENGTH = 15;

const PHASES = Object.freeze({
    WAITING: 'waiting',
    CATEGORY: 'category',
    STARTING: 'starting',
    REVEAL: 'reveal',
    LOBBY: 'lobby',
    VOTING: 'voting',
    ELIMINATION: 'elimination',
    GAME_OVER: 'gameover'
});

const STATUSES = Object.freeze({
    WAITING: 'waiting',
    PLAYING: 'playing',
    FINISHED: 'finished'
});

const ROLES = Object.freeze({
    CITIZEN: 'citizen',
    IMPOSTER: 'imposter',
    MR_WHITE: 'mrwhite'
});

function normalizeRoomCode(value) {
    return String(value ?? '').trim().toUpperCase();
}

function assertRoomCode(value) {
    const roomCode = normalizeRoomCode(value);
    if (!ROOM_CODE_PATTERN.test(roomCode)) throw new Error('INVALID_ROOM_CODE');
    return roomCode;
}

function generateRoomCode(randomIndex = randomInt) {
    return Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[randomIndex(ROOM_CODE_ALPHABET.length)]).join('');
}

function normalizePlayerName(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeNameForComparison(value) {
    return normalizePlayerName(value).toLocaleLowerCase('tr-TR');
}

function assertPlayerName(value) {
    const name = normalizePlayerName(value);
    const length = Array.from(name).length;
    if (length < 1 || length > MAX_PLAYER_NAME_LENGTH || !PLAYER_NAME_PATTERN.test(name)) {
        throw new Error('INVALID_PLAYER_NAME');
    }
    return name;
}

function createPlayer(id, name, now, isSpectator = false) {
    return {
        id,
        name,
        connected: false,
        isSpectator,
        alive: !isSpectator,
        roleSeen: isSpectator,
        joinedAt: now
    };
}

function createRoomRecord(code, hostId, hostName, now) {
    return {
        schemaVersion: 2,
        id: code,
        hostId,
        status: STATUSES.WAITING,
        createdAt: now,
        updatedAt: now,
        settings: {
            selectedCategories: [],
            imposterCount: 1,
            mrWhiteCount: 0
        },
        players: {
            [hostId]: createPlayer(hostId, hostName, now)
        },
        gameState: {
            phase: PHASES.WAITING,
            roundNumber: 0
        }
    };
}

function validateRoleCounts(playerCount, imposterCount, mrWhiteCount) {
    if (!Number.isInteger(imposterCount) || imposterCount < 1) throw new Error('INVALID_ROLE_COUNTS');
    if (!Number.isInteger(mrWhiteCount) || mrWhiteCount < 0) throw new Error('INVALID_ROLE_COUNTS');

    const citizenCount = playerCount - imposterCount - mrWhiteCount;
    if (citizenCount <= imposterCount + mrWhiteCount) throw new Error('UNBALANCED_ROLES');
    return citizenCount;
}

function shuffle(items, randomIndex = randomInt) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = randomIndex(index + 1);
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function wordKey(pair) {
    return `${pair.category}\u0000${pair.citizenWord}\u0000${pair.imposterWord}`;
}

function chooseWordPair(words, selectedCategories, usedWordKeys = [], randomIndex = randomInt) {
    const categorySet = new Set(selectedCategories);
    const candidates = words.filter((pair) => categorySet.has(pair.category));
    if (candidates.length === 0) throw new Error('NO_WORDS');

    const used = new Set(usedWordKeys);
    const unused = candidates.filter((pair) => !used.has(wordKey(pair)));
    const pool = unused.length > 0 ? unused : candidates;
    return pool[randomIndex(pool.length)];
}

function assignRoles(players, settings, pair, randomIndex = randomInt) {
    const activePlayers = Object.values(players).filter((player) => player.connected !== false);
    if (activePlayers.length < MIN_PLAYERS) throw new Error('NOT_ENOUGH_PLAYERS');

    const imposterCount = Number(settings.imposterCount ?? 1);
    const mrWhiteCount = Number(settings.mrWhiteCount ?? 0);
    const citizenCount = validateRoleCounts(activePlayers.length, imposterCount, mrWhiteCount);
    const roles = shuffle([
        ...Array(citizenCount).fill(ROLES.CITIZEN),
        ...Array(imposterCount).fill(ROLES.IMPOSTER),
        ...Array(mrWhiteCount).fill(ROLES.MR_WHITE)
    ], randomIndex);
    const shuffledPlayers = shuffle(activePlayers, randomIndex);
    const roundId = randomUUID();

    const secrets = {};
    shuffledPlayers.forEach((player, index) => {
        const role = roles[index];
        secrets[player.id] = {
            role,
            word: role === ROLES.CITIZEN
                ? pair.citizenWord
                : role === ROLES.IMPOSTER ? pair.imposterWord : null,
            category: pair.category,
            roundId
        };
    });

    return {
        activePlayerIds: shuffledPlayers.map((player) => player.id),
        roundId,
        secrets
    };
}

function getVoteCounts(votes = {}) {
    return Object.values(votes).reduce((counts, targetId) => {
        if (targetId) counts[targetId] = (counts[targetId] || 0) + 1;
        return counts;
    }, {});
}

function getHighestVotedPlayerIds(votes = {}) {
    const counts = getVoteCounts(votes);
    const maxVotes = Math.max(0, ...Object.values(counts));
    return maxVotes === 0 ? [] : Object.keys(counts).filter((id) => counts[id] === maxVotes);
}

function getActivePlayers(players = {}) {
    return Object.values(players).filter((player) => player.alive !== false && !player.isSpectator);
}

function haveAllActivePlayersVoted(players = {}, votes = {}) {
    return getActivePlayers(players)
        .filter((player) => player.connected !== false)
        .every((player) => Object.hasOwn(votes, player.id));
}

function determineWinner(players = {}, secrets = {}) {
    const aliveRoles = getActivePlayers(players).map((player) => secrets[player.id]?.role).filter(Boolean);
    const citizens = aliveRoles.filter((role) => role === ROLES.CITIZEN).length;
    const badPlayers = aliveRoles.filter((role) => role === ROLES.IMPOSTER || role === ROLES.MR_WHITE).length;

    if (badPlayers === 0) return 'citizens';
    if (citizens <= badPlayers) return 'imposters';
    return null;
}

function selectNextHost(players = {}, excludedId = null) {
    const candidates = Object.values(players)
        .filter((player) => player.id !== excludedId && player.connected !== false)
        .sort((left, right) => (left.joinedAt || 0) - (right.joinedAt || 0));
    return candidates[0]?.id ?? null;
}

module.exports = {
    MAX_PLAYERS,
    MIN_PLAYERS,
    PHASES,
    ROLES,
    STATUSES,
    assertPlayerName,
    assertRoomCode,
    assignRoles,
    chooseWordPair,
    createPlayer,
    createRoomRecord,
    determineWinner,
    generateRoomCode,
    getActivePlayers,
    getHighestVotedPlayerIds,
    getVoteCounts,
    haveAllActivePlayersVoted,
    normalizeNameForComparison,
    normalizePlayerName,
    normalizeRoomCode,
    selectNextHost,
    shuffle,
    validateRoleCounts,
    wordKey
};
