import {
    dbRef,
    get,
    getUserId,
    onDisconnect,
    onValue,
    remove,
    runTransaction,
    set,
    update
} from '../config/firebase.js';
import { GameData } from '../data/index.js';
import { loadFromStorage, saveToStorage } from '../lib/utils.js';
import {
    GAME_PHASES,
    MAX_PLAYERS,
    ROOM_STATUSES,
    normalizePlayerName,
    normalizeRoomCode
} from './domain.js';
import {
    assignRoles,
    chooseWordPair,
    createBallotResetUpdates,
    createPlayer,
    createRoomRecord,
    determineWinner,
    generateRoomCode,
    getActivePlayers,
    getEligibleVoters,
    getHighestVotedPlayerIds,
    getVoteCounts as countVotes,
    haveAllActivePlayersVoted,
    normalizeNameForComparison,
    selectNextHost,
    wordKey
} from './engine.js';
import { getRoomState, setRoomState } from './state.js';

const SESSION_KEY = 'wordImposterSession';

let roomUnsubscribe = null;
let secretUnsubscribe = null;
let voteUnsubscribe = null;
let connectionUnsubscribe = null;
let presenceDisconnect = null;
let activePresenceRef = null;
let onRoomUpdateCallback = null;
let onRoomEndedCallback = null;
let endingRoom = false;
let coordinatingRoom = false;
let pendingRoomCoordination = null;
let coordinationRetryTimer = null;
let voteSubmissionPromise = null;

export function setOnRoomUpdate(callback) {
    onRoomUpdateCallback = callback;
}

export function setOnRoomDeleted(callback) {
    onRoomEndedCallback = callback;
}

function saveSession(roomCode, playerName) {
    saveToStorage(SESSION_KEY, {
        roomCode,
        playerId: getUserId(),
        playerName
    });
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch {
        // Storage is optional; an in-memory session still works.
    }
}

function resetRoomState() {
    setRoomState({
        currentRoom: null,
        mySecret: null,
        myVote: null,
        roomCode: null,
        isHost: false,
        playerId: null,
        playerName: null,
        connectionStatus: 'idle'
    });
}

async function stopSubscriptions() {
    roomUnsubscribe?.();
    secretUnsubscribe?.();
    voteUnsubscribe?.();
    connectionUnsubscribe?.();
    roomUnsubscribe = null;
    secretUnsubscribe = null;
    voteUnsubscribe = null;
    connectionUnsubscribe = null;
    pendingRoomCoordination = null;
    if (coordinationRetryTimer) {
        clearTimeout(coordinationRetryTimer);
        coordinationRetryTimer = null;
    }

    if (presenceDisconnect) {
        try {
            await presenceDisconnect.cancel();
        } catch {
            // A lost connection can make cancellation impossible.
        }
        presenceDisconnect = null;
    }
    if (activePresenceRef) {
        try {
            await set(activePresenceRef, false);
        } catch {
            // The player or room may already have been removed.
        }
        activePresenceRef = null;
    }
}

async function handleRoomEnded(reason = 'closed') {
    if (endingRoom) return;
    endingRoom = true;
    await stopSubscriptions();
    clearSession();
    resetRoomState();
    onRoomEndedCallback?.(reason);
    endingRoom = false;
}

function setupPresence(roomCode, playerId) {
    connectionUnsubscribe?.();
    activePresenceRef = dbRef(`rooms/${roomCode}/players/${playerId}/connected`);

    connectionUnsubscribe = onValue(dbRef('.info/connected'), async (snapshot) => {
        if (snapshot.val() !== true) {
            setRoomState({ connectionStatus: 'reconnecting' });
            onRoomUpdateCallback?.(getRoomState().currentRoom);
            return;
        }

        try {
            await presenceDisconnect?.cancel();
            presenceDisconnect = onDisconnect(activePresenceRef);
            await presenceDisconnect.set(false);
            await set(activePresenceRef, true);
            setRoomState({ connectionStatus: 'connected' });
            onRoomUpdateCallback?.(getRoomState().currentRoom);
        } catch {
            setRoomState({ connectionStatus: 'reconnecting' });
            onRoomUpdateCallback?.(getRoomState().currentRoom);
        }
    });
}

async function tryClaimAbandonedHost(roomCode, room, playerId) {
    if (room.hostId === playerId) return false;
    const me = room.players?.[playerId];
    const currentHost = room.players?.[room.hostId];
    if (me?.connected !== true || (currentHost && currentHost.connected !== false)) return false;
    if (selectNextHost(room.players, room.hostId) !== playerId) return false;

    const expectedHostId = room.hostId;
    const result = await runTransaction(dbRef(`rooms/${roomCode}/hostId`), (hostId) => (
        hostId === expectedHostId ? playerId : undefined
    ));
    return result.committed;
}

async function advanceRevealIfReady(roomCode) {
    await runTransaction(dbRef(`rooms/${roomCode}`), (room) => {
        if (!room || room.hostId !== getUserId() || room.gameState?.phase !== GAME_PHASES.REVEAL) {
            return undefined;
        }
        const connectedPlayers = getActivePlayers(room.players)
            .filter((player) => player.connected !== false);
        if (connectedPlayers.length === 0 || !connectedPlayers.every((player) => player.roleSeen === true)) {
            return undefined;
        }
        room.gameState.phase = GAME_PHASES.LOBBY;
        room.updatedAt = Date.now();
        return room;
    });
}

async function publishVoteResultsIfReady(roomCode, room) {
    if (room.gameState?.voteResults) return;

    const votes = (await get(dbRef(`roomVotes/${roomCode}`))).val() || {};
    const eligiblePlayers = getEligibleVoters(room.players);
    const orphanedVoteFlags = eligiblePlayers
        .filter((player) => player.hasVoted === true && !Object.hasOwn(votes, player.id))
        .map((player) => player.id);

    if (orphanedVoteFlags.length > 0) {
        await runTransaction(dbRef(`rooms/${roomCode}`), (latestRoom) => {
            if (!latestRoom || latestRoom.hostId !== getUserId()
                || latestRoom.gameState?.phase !== GAME_PHASES.VOTING
                || latestRoom.gameState?.voteResults) {
                return undefined;
            }
            orphanedVoteFlags.forEach((playerId) => {
                if (latestRoom.players?.[playerId]?.hasVoted === true) {
                    delete latestRoom.players[playerId].hasVoted;
                }
            });
            latestRoom.updatedAt = Date.now();
            return latestRoom;
        });
        return;
    }

    if (!haveAllActivePlayersVoted(room.players, votes)) return;

    await runTransaction(dbRef(`rooms/${roomCode}`), (latestRoom) => {
        if (!latestRoom || latestRoom.hostId !== getUserId() || latestRoom.gameState?.phase !== GAME_PHASES.VOTING) {
            return undefined;
        }
        if (latestRoom.gameState.voteResults) return undefined;
        const latestEligiblePlayers = getEligibleVoters(latestRoom.players);
        if (latestEligiblePlayers.length === 0
            || !latestEligiblePlayers.every((player) => player.hasVoted === true && votes[player.id])) {
            return undefined;
        }
        const eligibleIds = new Set(latestEligiblePlayers.map((player) => player.id));
        const eligibleVotes = Object.fromEntries(
            Object.entries(votes).filter(([playerId]) => eligibleIds.has(playerId))
        );
        latestRoom.gameState.voteResults = {
            counts: countVotes(eligibleVotes),
            highestIds: getHighestVotedPlayerIds(eligibleVotes),
            eligibleVoterIds: [...eligibleIds]
        };
        latestRoom.updatedAt = Date.now();
        return latestRoom;
    });
}

function scheduleCoordinationRetry() {
    if (coordinationRetryTimer) return;
    coordinationRetryTimer = setTimeout(() => {
        coordinationRetryTimer = null;
        const { roomCode, currentRoom, playerId } = getRoomState();
        if (roomCode && currentRoom && playerId) {
            void coordinateRoom(roomCode, currentRoom, playerId);
        }
    }, 1500);
}

async function coordinateRoom(roomCode, room, playerId) {
    pendingRoomCoordination = { roomCode, room, playerId };
    if (coordinatingRoom) return;

    coordinatingRoom = true;
    try {
        while (pendingRoomCoordination) {
            const next = pendingRoomCoordination;
            pendingRoomCoordination = null;

            if (next.room.hostId !== next.playerId) {
                await tryClaimAbandonedHost(next.roomCode, next.room, next.playerId);
            } else if (next.room.gameState?.phase === GAME_PHASES.REVEAL) {
                await advanceRevealIfReady(next.roomCode);
            } else if (next.room.gameState?.phase === GAME_PHASES.VOTING) {
                await publishVoteResultsIfReady(next.roomCode, next.room);
            }
        }
    } catch (error) {
        console.warn('Oda eşitleme işlemi tamamlanamadı.', error);
        scheduleCoordinationRetry();
    } finally {
        coordinatingRoom = false;
        if (pendingRoomCoordination) {
            const next = pendingRoomCoordination;
            void coordinateRoom(next.roomCode, next.room, next.playerId);
        }
    }
}

function subscribeToRoom(roomCode, playerId) {
    roomUnsubscribe?.();
    secretUnsubscribe?.();
    voteUnsubscribe?.();

    roomUnsubscribe = onValue(
        dbRef(`rooms/${roomCode}`),
        (snapshot) => {
            if (!snapshot.exists()) {
                void handleRoomEnded('closed');
                return;
            }

            const room = snapshot.val();
            if (!room.players?.[playerId]) {
                void handleRoomEnded('removed');
                return;
            }

            setRoomState({
                currentRoom: room,
                isHost: room.hostId === playerId,
                connectionStatus: 'connected'
            });
            onRoomUpdateCallback?.(room);
            void coordinateRoom(roomCode, room, playerId);
        },
        () => void handleRoomEnded('removed')
    );

    secretUnsubscribe = onValue(
        dbRef(`roomSecrets/${roomCode}/${playerId}`),
        (snapshot) => {
            setRoomState({ mySecret: snapshot.val() || null });
            onRoomUpdateCallback?.(getRoomState().currentRoom);
        },
        () => {
            setRoomState({ mySecret: null });
            onRoomUpdateCallback?.(getRoomState().currentRoom);
        }
    );

    voteUnsubscribe = onValue(
        dbRef(`roomVotes/${roomCode}/${playerId}`),
        (snapshot) => {
            setRoomState({ myVote: snapshot.val() || null });
            onRoomUpdateCallback?.(getRoomState().currentRoom);
        },
        () => {
            setRoomState({ myVote: null });
            onRoomUpdateCallback?.(getRoomState().currentRoom);
        }
    );
}

async function enterRoom(roomCode, playerName) {
    const playerId = getUserId();
    const roomSnapshot = await get(dbRef(`rooms/${roomCode}`));
    if (!roomSnapshot.exists()) throw new Error('Oda bulunamadı.');

    const room = roomSnapshot.val();
    if (room.schemaVersion !== 2) throw new Error('Bu oda eski bir oyun sürümüyle oluşturulmuş. Yeni bir oda açın.');
    const player = room.players?.[playerId];
    if (!player) throw new Error('Odaya katılım tamamlanamadı.');

    setRoomState({
        currentRoom: room,
        mySecret: null,
        myVote: null,
        roomCode,
        isHost: room.hostId === playerId,
        playerId,
        playerName: playerName || player.name,
        connectionStatus: 'connecting'
    });
    saveSession(roomCode, playerName || player.name);
    subscribeToRoom(roomCode, playerId);
    setupPresence(roomCode, playerId);
}

export async function createRoom(hostName) {
    const playerName = normalizePlayerName(hostName);
    const playerId = getUserId();

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const roomCode = generateRoomCode();
        const now = Date.now();
        try {
            await set(dbRef(`rooms/${roomCode}`), createRoomRecord(roomCode, playerId, playerName, now));
            await enterRoom(roomCode, playerName);
            return roomCode;
        } catch (error) {
            if (error?.code !== 'PERMISSION_DENIED' && error?.code !== 'permission-denied') throw error;
        }
    }

    throw new Error('Benzersiz oda kodu üretilemedi. Tekrar deneyin.');
}

export async function joinRoom(code, name) {
    const roomCode = normalizeRoomCode(code);
    const playerName = normalizePlayerName(name);
    const playerId = getUserId();

    try {
        const existingRoom = (await get(dbRef(`rooms/${roomCode}`))).val();
        if (existingRoom?.players?.[playerId]) {
            await enterRoom(roomCode, existingRoom.players[playerId].name);
            return true;
        }
    } catch {
        // Non-members cannot inspect a room. A constrained self-membership write below
        // proves whether the code is open for joining without exposing room data first.
    }

    const playerRef = dbRef(`rooms/${roomCode}/players/${playerId}`);
    const joinedAt = Date.now();
    try {
        await set(playerRef, createPlayer(playerId, playerName, joinedAt, false));
    } catch {
        try {
            await set(playerRef, createPlayer(playerId, playerName, joinedAt, true));
        } catch (spectatorJoinError) {
            throw new Error('Oda bulunamadı veya oyun katılıma kapalı.', {
                cause: spectatorJoinError
            });
        }
    }

    const joinedRoom = (await get(dbRef(`rooms/${roomCode}`))).val();
    const orderedPlayers = Object.values(joinedRoom?.players || {})
        .sort((left, right) => (left.joinedAt || 0) - (right.joinedAt || 0));
    const myIndex = orderedPlayers.findIndex((player) => player.id === playerId);
    const comparableName = normalizeNameForComparison(playerName);
    const duplicateBeforeMe = orderedPlayers
        .slice(0, Math.max(0, myIndex))
        .some((player) => normalizeNameForComparison(player.name) === comparableName);
    if (orderedPlayers.length > MAX_PLAYERS || duplicateBeforeMe) {
        await remove(dbRef(`rooms/${roomCode}/players/${playerId}`));
        if (orderedPlayers.length > MAX_PLAYERS) {
            throw new Error(`Oda dolu (en fazla ${MAX_PLAYERS} oyuncu).`);
        }
        throw new Error('Bu isim odada zaten kullanılıyor.');
    }

    await enterRoom(roomCode, playerName);
    return true;
}

export async function tryReconnect() {
    const session = loadFromStorage(SESSION_KEY);
    const playerId = getUserId();

    if (!session?.roomCode || session.playerId !== playerId) {
        clearSession();
        return false;
    }

    try {
        await enterRoom(normalizeRoomCode(session.roomCode), session.playerName);
        return true;
    } catch {
        clearSession();
        resetRoomState();
        return false;
    }
}

export async function leaveRoom() {
    const { roomCode, playerId, isHost } = getRoomState();
    if (!roomCode || !playerId) return;

    endingRoom = true;
    setRoomState({ connectionStatus: 'leaving' });
    try {
        if (isHost) {
            const roomSnapshot = await get(dbRef(`rooms/${roomCode}`));
            const room = roomSnapshot.val();
            if (room?.hostId === playerId) {
                const remainingPlayers = Object.fromEntries(
                    Object.entries(room.players || {}).filter(([id]) => id !== playerId)
                );
                if (Object.keys(remainingPlayers).length === 0) {
                    await Promise.all([
                        remove(dbRef(`roomSecrets/${roomCode}`)),
                        remove(dbRef(`roomVotes/${roomCode}`))
                    ]);
                    await remove(dbRef(`rooms/${roomCode}`));
                    return;
                }

                await Promise.all([
                    remove(dbRef(`roomSecrets/${roomCode}/${playerId}`)),
                    remove(dbRef(`roomVotes/${roomCode}`))
                ]);
                await runTransaction(dbRef(`rooms/${roomCode}`), (latestRoom) => {
                    if (!latestRoom?.players?.[playerId] || latestRoom.hostId !== playerId) return undefined;
                    delete latestRoom.players[playerId];
                    latestRoom.hostId = selectNextHost(latestRoom.players)
                        || Object.values(latestRoom.players).sort((left, right) => (left.joinedAt || 0) - (right.joinedAt || 0))[0]?.id;
                    delete latestRoom.gameState?.voteResults;
                    Object.values(latestRoom.players).forEach((player) => delete player.hasVoted);
                    latestRoom.updatedAt = Date.now();
                    return latestRoom;
                });
            }
        } else {
            await Promise.all([
                remove(dbRef(`roomSecrets/${roomCode}/${playerId}`)),
                remove(dbRef(`roomVotes/${roomCode}/${playerId}`))
            ]);
            await remove(dbRef(`rooms/${roomCode}/players/${playerId}`));
        }
    } finally {
        await stopSubscriptions();
        clearSession();
        resetRoomState();
        endingRoom = false;
    }
}

function requireCurrentRoom() {
    const { roomCode } = getRoomState();
    if (!roomCode) throw new Error('Aktif oda bulunamadı.');
    return roomCode;
}

function requireHostRoom() {
    const state = getRoomState();
    if (!state.roomCode) throw new Error('Aktif oda bulunamadı.');
    if (!state.isHost) throw new Error('Bu işlemi yalnızca oda sahibi yapabilir.');
    return state.roomCode;
}

export async function updateSettings(settings) {
    const roomCode = requireHostRoom();
    const accepted = {};
    if (Array.isArray(settings.selectedCategories)) {
        accepted.selectedCategories = [...new Set(settings.selectedCategories)]
            .filter((category) => GameData.categories.includes(category));
    }
    if (Number.isInteger(settings.imposterCount)) accepted.imposterCount = settings.imposterCount;
    if (Number.isInteger(settings.mrWhiteCount)) accepted.mrWhiteCount = settings.mrWhiteCount;
    if (Object.keys(accepted).length === 0) return {};

    const phase = getRoomState().currentRoom?.gameState?.phase;
    if (![GAME_PHASES.WAITING, GAME_PHASES.CATEGORY].includes(phase)) {
        throw new Error('Bu işlem oyunun mevcut aşamasında yapılamaz.');
    }
    await update(dbRef(`rooms/${roomCode}`), {
        ...Object.fromEntries(Object.entries(accepted).map(([key, value]) => [`settings/${key}`, value])),
        updatedAt: Date.now()
    });
    return { settings: accepted };
}

export async function setPhase(phase) {
    const roomCode = requireHostRoom();
    if ([GAME_PHASES.LOBBY, GAME_PHASES.VOTING].includes(phase)) {
        const room = (await get(dbRef(`rooms/${roomCode}`))).val();
        if (!room || room.hostId !== getUserId()) {
            throw new Error('Bu işlemi yalnızca oda sahibi yapabilir.');
        }
        const expectedPhase = phase === GAME_PHASES.VOTING ? GAME_PHASES.LOBBY : GAME_PHASES.VOTING;
        if (room.gameState?.phase !== expectedPhase) {
            throw new Error('Bu işlem oyunun mevcut aşamasında yapılamaz.');
        }
        if (phase === GAME_PHASES.VOTING && getEligibleVoters(room.players).length === 0) {
            throw new Error('Oylamaya geçmek için en az bir çevrimiçi oyuncu gerekli.');
        }
        await update(dbRef(), createBallotResetUpdates(roomCode, room.players, phase));
        return { phase };
    }

    const allowedTransitions = {
        [GAME_PHASES.WAITING]: [GAME_PHASES.CATEGORY],
        [GAME_PHASES.CATEGORY]: [GAME_PHASES.WAITING]
    };
    let rejection = null;
    const result = await runTransaction(dbRef(`rooms/${roomCode}`), (room) => {
        if (!room || room.hostId !== getUserId()) {
            rejection = 'Bu işlemi yalnızca oda sahibi yapabilir.';
            return undefined;
        }
        const currentPhase = room.gameState?.phase;
        if (!allowedTransitions[currentPhase]?.includes(phase)) {
            rejection = 'Bu işlem oyunun mevcut aşamasında yapılamaz.';
            return undefined;
        }
        if (phase === GAME_PHASES.CATEGORY) {
            const connectedCount = Object.values(room.players || {})
                .filter((player) => player.connected !== false).length;
            if (connectedCount < 3) {
                rejection = 'Oyunu başlatmak için en az 3 çevrimiçi oyuncu gerekli.';
                return undefined;
            }
        }
        room.gameState.phase = phase;
        delete room.gameState.voteResults;
        Object.values(room.players || {}).forEach((player) => delete player.hasVoted);
        room.updatedAt = Date.now();
        return room;
    });
    if (!result.committed) throw new Error(rejection || 'Oyun aşaması değiştirilemedi.');
    return { phase };
}

export async function startGame() {
    const roomCode = requireHostRoom();
    const roomRef = dbRef(`rooms/${roomCode}`);
    const startToken = crypto.randomUUID();
    let priorSecrets = null;
    let previousPhase = null;
    let secretsWritten = false;
    let rejection = null;

    const lock = await runTransaction(roomRef, (room) => {
        if (!room || room.hostId !== getUserId()) {
            rejection = 'Bu işlemi yalnızca oda sahibi yapabilir.';
            return undefined;
        }
        if (![GAME_PHASES.CATEGORY, GAME_PHASES.GAME_OVER].includes(room.gameState?.phase)) {
            rejection = 'Bu işlem oyunun mevcut aşamasında yapılamaz.';
            return undefined;
        }
        if (!room.settings?.selectedCategories?.length) {
            rejection = 'En az bir kategori seçin.';
            return undefined;
        }
        previousPhase = room.gameState.phase;
        room.gameState.phase = GAME_PHASES.STARTING;
        room.gameState.startToken = startToken;
        room.updatedAt = Date.now();
        return room;
    });
    if (!lock.committed) throw new Error(rejection || 'Oyun başlatılamadı.');

    try {
        const room = lock.snapshot.val();
        const priorSecretsSnapshot = await get(dbRef(`roomSecrets/${roomCode}`));
        priorSecrets = priorSecretsSnapshot.val();
        const authority = priorSecrets?._authority || {};
        const pair = chooseWordPair(
            GameData.wordPairs,
            room.settings.selectedCategories,
            authority.usedWordKeys || []
        );
        const assignment = assignRoles(room.players || {}, room.settings || {}, pair);
        const activeIds = new Set(assignment.activePlayerIds);
        const publicPlayers = {};

        Object.values(room.players || {}).forEach((player) => {
            const isActive = activeIds.has(player.id);
            publicPlayers[player.id] = {
                ...player,
                alive: isActive,
                isSpectator: !isActive,
                roleSeen: !isActive
            };
            delete publicPlayers[player.id].revealedRole;
            delete publicPlayers[player.id].revealedWord;
            delete publicPlayers[player.id].hasVoted;
        });

        const usedWordKeys = [...new Set([...(authority.usedWordKeys || []), wordKey(pair)])].slice(-100);
        const secretBranch = {
            _authority: {
                currentWordPair: pair,
                roundId: assignment.roundId,
                usedWordKeys
            },
            ...assignment.secrets
        };
        await set(dbRef(`roomSecrets/${roomCode}`), secretBranch);
        secretsWritten = true;

        const assignedIds = Object.keys(publicPlayers).sort();
        const finalResult = await runTransaction(roomRef, (latestRoom) => {
            if (!latestRoom || latestRoom.hostId !== getUserId() || latestRoom.gameState?.startToken !== startToken) {
                return undefined;
            }
            const latestIds = Object.keys(latestRoom.players || {}).sort();
            if (latestIds.length !== assignedIds.length || latestIds.some((id, index) => id !== assignedIds[index])) {
                return undefined;
            }
            Object.entries(publicPlayers).forEach(([playerId, player]) => {
                latestRoom.players[playerId] = {
                    ...player,
                    connected: latestRoom.players[playerId].connected
                };
            });
            latestRoom.status = ROOM_STATUSES.PLAYING;
            latestRoom.updatedAt = Date.now();
            latestRoom.gameState = {
                phase: GAME_PHASES.REVEAL,
                roundNumber: 1,
                roundId: assignment.roundId,
                startedAt: Date.now()
            };
            return latestRoom;
        });
        if (!finalResult.committed) throw new Error('Oyuncu listesi değişti. Oyunu tekrar başlatın.');
        await remove(dbRef(`roomVotes/${roomCode}`)).catch((error) => {
            console.warn('Önceki tur oyları hemen temizlenemedi.', error);
        });
        return { success: true };
    } catch (error) {
        if (secretsWritten) {
            await set(dbRef(`roomSecrets/${roomCode}`), priorSecrets).catch(() => {});
        }
        await runTransaction(roomRef, (room) => {
            if (room?.gameState?.startToken !== startToken) return undefined;
            room.gameState.phase = previousPhase || GAME_PHASES.CATEGORY;
            delete room.gameState.startToken;
            room.updatedAt = Date.now();
            return room;
        }).catch(() => {});
        throw error;
    }
}

export async function markRoleSeen() {
    const roomCode = requireCurrentRoom();
    const { playerId, currentRoom } = getRoomState();
    const player = currentRoom?.players?.[playerId];
    if (currentRoom?.gameState?.phase !== GAME_PHASES.REVEAL || !player || player.isSpectator) {
        throw new Error('Bu işlem oyunun mevcut aşamasında yapılamaz.');
    }
    await set(dbRef(`rooms/${roomCode}/players/${playerId}/roleSeen`), true);
    return { success: true };
}

export async function checkAndAdvanceIfAllSeen() {
    const { roomCode, isHost } = getRoomState();
    if (roomCode && isHost) await advanceRevealIfReady(roomCode);
}

async function submitVoteOnce(targetPlayerId) {
    const roomCode = requireCurrentRoom();
    const { playerId, currentRoom, myVote } = getRoomState();
    const voter = currentRoom?.players?.[playerId];
    const target = currentRoom?.players?.[targetPlayerId];
    if (currentRoom?.gameState?.phase !== GAME_PHASES.VOTING
        || currentRoom.gameState?.voteResults
        || !voter || voter.alive === false || voter.isSpectator
        || !target || target.alive === false || target.isSpectator
        || targetPlayerId === playerId) {
        throw new Error('Bu oy geçerli değil.');
    }
    if (myVote || voter.hasVoted === true) {
        if (!myVote || myVote === targetPlayerId) return { success: true, alreadySubmitted: true };
        throw new Error('Bu turda oyunuzu zaten kullandınız.');
    }

    try {
        await update(dbRef(), {
            [`roomVotes/${roomCode}/${playerId}`]: targetPlayerId,
            [`rooms/${roomCode}/players/${playerId}/hasVoted`]: true
        });
    } catch (error) {
        const existingVote = await get(dbRef(`roomVotes/${roomCode}/${playerId}`))
            .then((snapshot) => snapshot.val())
            .catch(() => null);
        if (!existingVote) throw error;
        setRoomState({ myVote: existingVote });
        return { success: true, alreadySubmitted: true };
    }
    setRoomState({ myVote: targetPlayerId });
    return { success: true };
}

export async function submitVote(targetPlayerId) {
    if (voteSubmissionPromise) return voteSubmissionPromise;
    const submission = submitVoteOnce(targetPlayerId);
    voteSubmissionPromise = submission;
    try {
        return await submission;
    } finally {
        if (voteSubmissionPromise === submission) voteSubmissionPromise = null;
    }
}

export async function finalizeVote() {
    const roomCode = requireHostRoom();
    const [roomSnapshot, secretsSnapshot] = await Promise.all([
        get(dbRef(`rooms/${roomCode}`)),
        get(dbRef(`roomSecrets/${roomCode}`))
    ]);
    const room = roomSnapshot.val();
    const secrets = secretsSnapshot.val() || {};
    if (!room || room.gameState?.phase !== GAME_PHASES.VOTING) {
        throw new Error('Bu işlem oyunun mevcut aşamasında yapılamaz.');
    }
    const highestIds = room.gameState?.voteResults?.highestIds || [];
    if (highestIds.length !== 1) throw new Error('Oylama sonucu henüz kesinleşmedi.');
    const eliminatedId = highestIds[0];
    const secret = secrets[eliminatedId];
    if (!eliminatedId || !secret) throw new Error('Elenebilecek bir oyuncu bulunamadı.');
    let rejection = null;
    const result = await runTransaction(dbRef(`rooms/${roomCode}`), (latestRoom) => {
        if (!latestRoom || latestRoom.hostId !== getUserId() || latestRoom.gameState?.phase !== GAME_PHASES.VOTING) {
            rejection = 'Bu işlem oyunun mevcut aşamasında yapılamaz.';
            return undefined;
        }
        const latestHighestIds = latestRoom.gameState?.voteResults?.highestIds || [];
        if (latestHighestIds.length !== 1 || latestHighestIds[0] !== eliminatedId) {
            rejection = 'Oylama sonucu değişti. Lütfen yeniden deneyin.';
            return undefined;
        }
        const eliminated = latestRoom.players?.[eliminatedId];
        if (!eliminated || eliminated.alive === false) {
            rejection = 'Elenebilecek bir oyuncu bulunamadı.';
            return undefined;
        }
        eliminated.alive = false;
        eliminated.revealedRole = secret.role;
        if (secret.role === 'imposter') eliminated.revealedWord = secret.word;
        latestRoom.gameState.phase = GAME_PHASES.ELIMINATION;
        latestRoom.gameState.eliminatedPlayerId = eliminatedId;
        latestRoom.updatedAt = Date.now();
        return latestRoom;
    });
    if (!result.committed) throw new Error(rejection || 'Oylama tamamlanamadı.');
    return { tie: false, playerId: eliminatedId };
}

export async function processRound() {
    const roomCode = requireHostRoom();
    const secrets = (await get(dbRef(`roomSecrets/${roomCode}`))).val() || {};
    let winner = null;
    let rejection = null;
    const result = await runTransaction(dbRef(`rooms/${roomCode}`), (room) => {
        if (!room || room.hostId !== getUserId() || room.gameState?.phase !== GAME_PHASES.ELIMINATION) {
            rejection = 'Bu işlem oyunun mevcut aşamasında yapılamaz.';
            return undefined;
        }
        winner = determineWinner(room.players, secrets);
        if (winner) {
            room.status = ROOM_STATUSES.FINISHED;
            room.gameState = {
                ...room.gameState,
                phase: GAME_PHASES.GAME_OVER,
                winner,
                wordPair: secrets._authority?.currentWordPair || null,
                finishedAt: Date.now()
            };
        } else {
            room.gameState.phase = GAME_PHASES.LOBBY;
            room.gameState.roundNumber = (room.gameState.roundNumber || 1) + 1;
            delete room.gameState.eliminatedPlayerId;
        }
        delete room.gameState.voteResults;
        Object.values(room.players || {}).forEach((player) => delete player.hasVoted);
        room.updatedAt = Date.now();
        return room;
    });
    if (!result.committed) throw new Error(rejection || 'Tur tamamlanamadı.');
    await remove(dbRef(`roomVotes/${roomCode}`)).catch((error) => {
        console.warn('Tamamlanan tur oyları hemen temizlenemedi.', error);
    });
    return winner || 'continue';
}

export async function restartWithNewWord() {
    return startGame();
}

export async function resetToWaiting() {
    const roomCode = requireHostRoom();
    let rejection = null;
    const result = await runTransaction(dbRef(`rooms/${roomCode}`), (room) => {
        if (!room || room.hostId !== getUserId() || room.gameState?.phase !== GAME_PHASES.GAME_OVER) {
            rejection = 'Bu işlem oyunun mevcut aşamasında yapılamaz.';
            return undefined;
        }
        Object.values(room.players || {}).forEach((player) => {
            player.alive = true;
            player.isSpectator = false;
            player.roleSeen = false;
            delete player.revealedRole;
            delete player.revealedWord;
            delete player.hasVoted;
        });
        room.status = ROOM_STATUSES.WAITING;
        room.gameState = { phase: GAME_PHASES.WAITING, roundNumber: 0 };
        room.updatedAt = Date.now();
        return room;
    });
    if (!result.committed) throw new Error(rejection || 'Bekleme odasına dönülemedi.');
    await Promise.all([
        remove(dbRef(`roomSecrets/${roomCode}`)),
        remove(dbRef(`roomVotes/${roomCode}`))
    ]);
    return { success: true };
}

export async function kickPlayer(targetPlayerId) {
    const roomCode = requireHostRoom();
    const room = getRoomState().currentRoom;
    if (![GAME_PHASES.WAITING, GAME_PHASES.CATEGORY].includes(room?.gameState?.phase)
        || !targetPlayerId || targetPlayerId === getUserId() || !room.players?.[targetPlayerId]) {
        throw new Error('Oyuncu odadan çıkarılamadı.');
    }
    await update(dbRef(), {
        [`roomSecrets/${roomCode}/${targetPlayerId}`]: null,
        [`roomVotes/${roomCode}/${targetPlayerId}`]: null,
        [`rooms/${roomCode}/players/${targetPlayerId}`]: null,
        [`rooms/${roomCode}/updatedAt`]: Date.now()
    });
    return { success: true };
}

export function getMyPlayer() {
    const { currentRoom, mySecret, playerId } = getRoomState();
    const player = currentRoom?.players?.[playerId];
    return player ? { ...player, ...(mySecret || {}) } : null;
}

export function getPlayers() {
    const players = Object.values(getRoomState().currentRoom?.players || {});
    return players.sort((left, right) => (left.joinedAt || 0) - (right.joinedAt || 0));
}

export function getAlivePlayers() {
    return getPlayers().filter((player) => player.alive !== false && !player.isSpectator);
}

export function getVoteCounts() {
    return getRoomState().currentRoom?.gameState?.voteResults?.counts || {};
}

export function checkAllVoted() {
    const players = Object.values(getRoomState().currentRoom?.players || {});
    return players
        .filter((player) => player.alive !== false && !player.isSpectator && player.connected !== false)
        .every((player) => player.hasVoted === true);
}

export function getMyVote() {
    return getRoomState().myVote;
}

export function getTiedPlayers() {
    return getRoomState().currentRoom?.gameState?.voteResults?.highestIds || [];
}

export async function clearVotes() {
    return setPhase(GAME_PHASES.LOBBY);
}

export function getRoomLink() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('room', getRoomState().roomCode || '');
    return url.toString();
}
