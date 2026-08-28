import {
    GAME_PHASES,
    MIN_PLAYERS,
    ROOM_STATUSES,
    validateRoleCounts
} from './domain.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROLES = Object.freeze({
    CITIZEN: 'citizen',
    IMPOSTER: 'imposter',
    MR_WHITE: 'mrwhite'
});

export function generateRoomCode(random = crypto.getRandomValues.bind(crypto)) {
    const values = new Uint32Array(6);
    random(values);
    return Array.from(values, (value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]).join('');
}

export function createPlayer(id, name, now, isSpectator = false) {
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

export function createRoomRecord(code, hostId, hostName, now) {
    return {
        schemaVersion: 2,
        id: code,
        hostId,
        status: ROOM_STATUSES.WAITING,
        createdAt: now,
        updatedAt: now,
        settings: {
            selectedCategories: [],
            imposterCount: 1,
            mrWhiteCount: 0
        },
        players: { [hostId]: createPlayer(hostId, hostName, now) },
        gameState: { phase: GAME_PHASES.WAITING, roundNumber: 0 }
    };
}

export function normalizeNameForComparison(value) {
    return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function shuffle(items, random = crypto.getRandomValues.bind(crypto)) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const value = new Uint32Array(1);
        random(value);
        const swapIndex = value[0] % (index + 1);
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

export function wordKey(pair) {
    return `${pair.category}\u0000${pair.citizenWord}\u0000${pair.imposterWord}`;
}

export function chooseWordPair(words, selectedCategories, usedWordKeys = [], random = crypto.getRandomValues.bind(crypto)) {
    const categories = new Set(selectedCategories);
    const candidates = words.filter((pair) => categories.has(pair.category));
    if (candidates.length === 0) throw new Error('Seçilen kategoriler için kelime bulunamadı.');

    const used = new Set(usedWordKeys);
    const unused = candidates.filter((pair) => !used.has(wordKey(pair)));
    const pool = unused.length > 0 ? unused : candidates;
    const value = new Uint32Array(1);
    random(value);
    return pool[value[0] % pool.length];
}

export function assignRoles(players, settings, pair, random = crypto.getRandomValues.bind(crypto)) {
    const activePlayers = Object.values(players).filter((player) => player.connected !== false);
    if (activePlayers.length < MIN_PLAYERS) throw new Error('Oyunu başlatmak için en az 3 çevrimiçi oyuncu gerekli.');

    const imposterCount = Number(settings.imposterCount ?? 1);
    const mrWhiteCount = Number(settings.mrWhiteCount ?? 0);
    const roleError = validateRoleCounts(activePlayers.length, imposterCount, mrWhiteCount);
    if (roleError) throw new Error(roleError);

    const roles = shuffle([
        ...Array(activePlayers.length - imposterCount - mrWhiteCount).fill(ROLES.CITIZEN),
        ...Array(imposterCount).fill(ROLES.IMPOSTER),
        ...Array(mrWhiteCount).fill(ROLES.MR_WHITE)
    ], random);
    const shuffledPlayers = shuffle(activePlayers, random);
    const roundId = crypto.randomUUID();
    const secrets = {};

    shuffledPlayers.forEach((player, index) => {
        const role = roles[index];
        secrets[player.id] = {
            role,
            word: role === ROLES.CITIZEN ? pair.citizenWord : role === ROLES.IMPOSTER ? pair.imposterWord : null,
            category: pair.category,
            roundId
        };
    });

    return { activePlayerIds: shuffledPlayers.map((player) => player.id), roundId, secrets };
}

export function getActivePlayers(players = {}) {
    return Object.values(players).filter((player) => player.alive !== false && !player.isSpectator);
}

export function getEligibleVoters(players = {}) {
    return getActivePlayers(players).filter((player) => player.connected !== false);
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
    return maxVotes === 0 ? [] : Object.keys(counts).filter((id) => counts[id] === maxVotes);
}

export function haveAllActivePlayersVoted(players = {}, votes = {}) {
    const eligiblePlayers = getEligibleVoters(players);
    return eligiblePlayers.length > 0
        && eligiblePlayers.every((player) => Object.hasOwn(votes, player.id));
}

export function createBallotResetUpdates(roomCode, players = {}, phase, now = Date.now()) {
    const updates = {
        [`rooms/${roomCode}/gameState/phase`]: phase,
        [`rooms/${roomCode}/gameState/voteResults`]: null,
        [`rooms/${roomCode}/updatedAt`]: now,
        [`roomVotes/${roomCode}`]: null
    };
    Object.keys(players).forEach((playerId) => {
        updates[`rooms/${roomCode}/players/${playerId}/hasVoted`] = null;
    });
    return updates;
}

export function determineWinner(players = {}, secrets = {}) {
    const aliveRoles = getActivePlayers(players).map((player) => secrets[player.id]?.role).filter(Boolean);
    const citizens = aliveRoles.filter((role) => role === ROLES.CITIZEN).length;
    const badPlayers = aliveRoles.filter((role) => role === ROLES.IMPOSTER || role === ROLES.MR_WHITE).length;
    if (badPlayers === 0) return 'citizens';
    if (citizens <= badPlayers) return 'imposters';
    return null;
}

export function selectNextHost(players = {}, excludedId = null) {
    return Object.values(players)
        .filter((player) => player.id !== excludedId && player.connected !== false)
        .sort((left, right) => (left.joinedAt || 0) - (right.joinedAt || 0))[0]?.id ?? null;
}
