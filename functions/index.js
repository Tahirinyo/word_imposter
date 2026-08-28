const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { logger, setGlobalOptions } = require('firebase-functions/v2');
const { onValueWritten } = require('firebase-functions/v2/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { randomUUID } = require('node:crypto');

const words = require('./data/words.json');
const {
    MAX_PLAYERS,
    PHASES,
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
    selectNextHost,
    wordKey
} = require('./game-engine');

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 1 });

const database = getDatabase();
const categories = new Set(words.map((pair) => pair.category));
const ROOM_MAX_AGES = {
    [STATUSES.WAITING]: 6 * 60 * 60 * 1000,
    [STATUSES.FINISHED]: 2 * 60 * 60 * 1000,
    [STATUSES.PLAYING]: 24 * 60 * 60 * 1000
};

const ERROR_MESSAGES = {
    INVALID_ROOM_CODE: ['invalid-argument', 'Geçerli bir oda kodu girin.'],
    INVALID_PLAYER_NAME: ['invalid-argument', 'Oyuncu adı geçersiz.'],
    ROOM_NOT_FOUND: ['not-found', 'Oda bulunamadı.'],
    ROOM_FULL: ['resource-exhausted', `Oda dolu (en fazla ${MAX_PLAYERS} oyuncu).`],
    ROOM_CLOSED: ['failed-precondition', 'Bu oyun sona ermiş. Yeni bir oda kodu isteyin.'],
    ROOM_VERSION_UNSUPPORTED: ['failed-precondition', 'Bu oda eski bir oyun sürümüyle oluşturulmuş. Yeni bir oda açın.'],
    ROOM_STARTING: ['failed-precondition', 'Oyun şu anda başlatılıyor. Birkaç saniye sonra tekrar deneyin.'],
    NAME_TAKEN: ['already-exists', 'Bu isim odada zaten kullanılıyor.'],
    NOT_A_MEMBER: ['permission-denied', 'Artık bu odanın üyesi değilsiniz.'],
    NOT_HOST: ['permission-denied', 'Bu işlemi yalnızca oda sahibi yapabilir.'],
    NOT_ENOUGH_PLAYERS: ['failed-precondition', 'Oyunu başlatmak için en az 3 çevrimiçi oyuncu gerekli.'],
    INVALID_ROLE_COUNTS: ['failed-precondition', 'Rol dağılımı geçersiz.'],
    UNBALANCED_ROLES: ['failed-precondition', 'Geçersiz dağılım: Hainler oyunu anında kazanır!'],
    NO_CATEGORIES: ['failed-precondition', 'En az bir kategori seçin.'],
    NO_WORDS: ['failed-precondition', 'Seçilen kategoriler için kelime bulunamadı.'],
    INVALID_PHASE: ['failed-precondition', 'Bu işlem oyunun mevcut aşamasında yapılamaz.'],
    INVALID_VOTE: ['failed-precondition', 'Bu oy geçerli değil.'],
    ALREADY_VOTED: ['already-exists', 'Bu turda oyunuzu zaten verdiniz.'],
    VOTES_INCOMPLETE: ['failed-precondition', 'Tüm aktif oyuncular henüz oy vermedi.'],
    NO_ELIMINATION: ['failed-precondition', 'Elenebilecek bir oyuncu bulunamadı.']
};

function requireUser(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Devam etmek için oturum açmalısınız.');
    return request.auth.uid;
}

function fail(error, context) {
    if (error instanceof HttpsError) throw error;
    const mapped = ERROR_MESSAGES[error?.message];
    if (mapped) throw new HttpsError(mapped[0], mapped[1]);
    logger.error(context, error);
    throw new HttpsError('internal', 'İşlem tamamlanamadı. Lütfen tekrar deneyin.');
}

function getRoomCode(data) {
    return assertRoomCode(data?.roomCode);
}

async function cleanupStaleRooms(excludedRoomCode) {
    const roomsSnapshot = await database.ref('rooms').get();
    if (!roomsSnapshot.exists()) return;

    const now = Date.now();
    const updates = {};

    roomsSnapshot.forEach((snapshot) => {
        if (snapshot.key === excludedRoomCode) return;
        const room = snapshot.val();
        const maxAge = ROOM_MAX_AGES[room.status] || ROOM_MAX_AGES[STATUSES.PLAYING];
        if (room.schemaVersion !== 2 || now - (room.updatedAt || room.createdAt || 0) > maxAge) {
            updates[`rooms/${snapshot.key}`] = null;
            updates[`roomSecrets/${snapshot.key}`] = null;
            updates[`roomVotes/${snapshot.key}`] = null;
            updates[`roomPresence/${snapshot.key}`] = null;
        }
    });

    if (Object.keys(updates).length > 0) await database.ref().update(updates);
}

async function publishVoteResults(roomCode) {
    const [roomSnapshot, votesSnapshot] = await Promise.all([
        database.ref(`rooms/${roomCode}`).get(),
        database.ref(`roomVotes/${roomCode}`).get()
    ]);
    const room = roomSnapshot.val();
    const votes = votesSnapshot.val() || {};
    if (!room || room.gameState?.phase !== PHASES.VOTING) return;
    if (!haveAllActivePlayersVoted(room.players, votes)) return;

    const voteResults = {
        counts: getVoteCounts(votes),
        highestIds: getHighestVotedPlayerIds(votes)
    };
    await database.ref(`rooms/${roomCode}`).transaction((latestRoom) => {
        if (!latestRoom || latestRoom.gameState?.phase !== PHASES.VOTING) return undefined;
        const eligiblePlayers = getActivePlayers(latestRoom.players)
            .filter((player) => player.connected !== false);
        if (!eligiblePlayers.every((player) => player.hasVoted === true && votes[player.id])) return undefined;
        latestRoom.gameState.voteResults = voteResults;
        return latestRoom;
    });
}

async function finishRoomIfWinner(roomCode) {
    const [roomSnapshot, secretsSnapshot] = await Promise.all([
        database.ref(`rooms/${roomCode}`).get(),
        database.ref(`roomSecrets/${roomCode}`).get()
    ]);
    const room = roomSnapshot.val();
    const secrets = secretsSnapshot.val() || {};
    if (!room || room.status !== STATUSES.PLAYING) return null;

    const winner = determineWinner(room.players, secrets);
    if (!winner) return null;

    const result = await database.ref(`rooms/${roomCode}`).transaction((latestRoom) => {
        if (!latestRoom || latestRoom.status !== STATUSES.PLAYING) return undefined;
        if (determineWinner(latestRoom.players, secrets) !== winner) return undefined;

        Object.values(latestRoom.players || {}).forEach((player) => delete player.hasVoted);
        latestRoom.status = STATUSES.FINISHED;
        latestRoom.gameState = {
            ...latestRoom.gameState,
            phase: PHASES.GAME_OVER,
            winner,
            wordPair: secrets._authority?.currentWordPair || null,
            finishedAt: Date.now()
        };
        delete latestRoom.gameState.voteResults;
        delete latestRoom.gameState.eliminatedPlayerId;
        latestRoom.updatedAt = Date.now();
        return latestRoom;
    });

    if (result.committed) {
        await database.ref(`roomVotes/${roomCode}`).remove();
        return winner;
    }
    return null;
}

exports.createRoom = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const playerName = assertPlayerName(request.data?.playerName);

        for (let attempt = 0; attempt < 10; attempt += 1) {
            const roomCode = generateRoomCode();
            const now = Date.now();
            const result = await database.ref(`rooms/${roomCode}`).transaction((current) => (
                current === null ? createRoomRecord(roomCode, userId, playerName, now) : undefined
            ));

            if (result.committed) {
                await cleanupStaleRooms(roomCode).catch((cleanupError) => {
                    logger.warn('Could not clean up stale rooms during room creation', cleanupError);
                });
                return { roomCode };
            }
        }

        throw new HttpsError('resource-exhausted', 'Benzersiz oda kodu üretilemedi. Tekrar deneyin.');
    } catch (error) {
        return fail(error, 'createRoom failed');
    }
});

exports.joinRoom = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        const playerName = assertPlayerName(request.data?.playerName);
        let rejection = null;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }

            const existing = room.players?.[userId];
            if (room.schemaVersion !== 2) {
                rejection = 'ROOM_VERSION_UNSUPPORTED';
                return undefined;
            }
            if (existing) {
                room.players[userId].connected = false;
                room.updatedAt = Date.now();
                return room;
            }
            if (room.gameState?.phase === PHASES.STARTING) {
                rejection = 'ROOM_STARTING';
                return undefined;
            }
            if (room.status === STATUSES.FINISHED) {
                rejection = 'ROOM_CLOSED';
                return undefined;
            }

            const currentPlayers = Object.values(room.players || {});
            if (currentPlayers.length >= MAX_PLAYERS) {
                rejection = 'ROOM_FULL';
                return undefined;
            }
            const comparableName = normalizeNameForComparison(playerName);
            if (currentPlayers.some((player) => normalizeNameForComparison(player.name) === comparableName)) {
                rejection = 'NAME_TAKEN';
                return undefined;
            }

            const now = Date.now();
            const isSpectator = room.status === STATUSES.PLAYING;
            room.players ||= {};
            room.players[userId] = createPlayer(userId, playerName, now, isSpectator);
            room.updatedAt = now;
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'ROOM_NOT_FOUND');
        return { roomCode };
    } catch (error) {
        return fail(error, 'joinRoom failed');
    }
});

exports.leaveRoom = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        let roomDeleted = false;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) return undefined;
            if (!room.players?.[userId]) return undefined;

            delete room.players[userId];
            if (Object.keys(room.players).length === 0) {
                roomDeleted = true;
                return null;
            }
            if (room.hostId === userId) {
                room.hostId = selectNextHost(room.players) || Object.keys(room.players)[0];
            }
            if (room.gameState?.phase === PHASES.REVEAL) {
                const connectedPlayers = Object.values(room.players)
                    .filter((player) => !player.isSpectator && player.connected !== false);
                if (connectedPlayers.length > 0 && connectedPlayers.every((player) => player.roleSeen === true)) {
                    room.gameState.phase = PHASES.LOBBY;
                }
            }
            delete room.gameState?.voteResults;
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) throw new Error('NOT_A_MEMBER');
        if (roomDeleted) {
            await Promise.all([
                database.ref(`roomSecrets/${roomCode}`).remove(),
                database.ref(`roomVotes/${roomCode}`).remove(),
                database.ref(`roomPresence/${roomCode}`).remove()
            ]);
        } else {
            await Promise.all([
                database.ref(`roomSecrets/${roomCode}/${userId}`).remove(),
                database.ref(`roomVotes/${roomCode}/${userId}`).remove(),
                database.ref(`roomPresence/${roomCode}/${userId}`).remove()
            ]);
            const winner = await finishRoomIfWinner(roomCode);
            if (!winner) await publishVoteResults(roomCode);
        }
        return { roomDeleted };
    } catch (error) {
        return fail(error, 'leaveRoom failed');
    }
});

exports.kickPlayer = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        const targetId = String(request.data?.targetPlayerId || '');
        let rejection = null;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            if (room.hostId !== userId) {
                rejection = 'NOT_HOST';
                return undefined;
            }
            if (![PHASES.WAITING, PHASES.CATEGORY].includes(room.gameState?.phase)) {
                rejection = 'INVALID_PHASE';
                return undefined;
            }
            if (!targetId || targetId === userId || !room.players?.[targetId]) {
                rejection = 'NOT_A_MEMBER';
                return undefined;
            }

            delete room.players[targetId];
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'NOT_A_MEMBER');
        await Promise.all([
            database.ref(`roomSecrets/${roomCode}/${targetId}`).remove(),
            database.ref(`roomVotes/${roomCode}/${targetId}`).remove(),
            database.ref(`roomPresence/${roomCode}/${targetId}`).remove()
        ]);
        return { success: true };
    } catch (error) {
        return fail(error, 'kickPlayer failed');
    }
});

exports.updateRoomSettings = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        const incoming = request.data?.settings || {};
        const selectedCategories = Array.isArray(incoming.selectedCategories)
            ? [...new Set(incoming.selectedCategories.filter((category) => categories.has(category)))]
            : null;
        const imposterCount = Number.isInteger(incoming.imposterCount) ? incoming.imposterCount : null;
        const mrWhiteCount = Number.isInteger(incoming.mrWhiteCount) ? incoming.mrWhiteCount : null;
        let rejection = null;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            if (room.hostId !== userId) {
                rejection = 'NOT_HOST';
                return undefined;
            }
            if (![PHASES.WAITING, PHASES.CATEGORY].includes(room.gameState?.phase)) {
                rejection = 'INVALID_PHASE';
                return undefined;
            }

            room.settings ||= { selectedCategories: [], imposterCount: 1, mrWhiteCount: 0 };
            if (selectedCategories) room.settings.selectedCategories = selectedCategories;
            if (imposterCount !== null) room.settings.imposterCount = imposterCount;
            if (mrWhiteCount !== null) room.settings.mrWhiteCount = mrWhiteCount;
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'INVALID_PHASE');
        return { settings: result.snapshot.val().settings };
    } catch (error) {
        return fail(error, 'updateRoomSettings failed');
    }
});

exports.changePhase = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        const nextPhase = String(request.data?.phase || '');
        const allowedTransitions = {
            [PHASES.WAITING]: [PHASES.CATEGORY],
            [PHASES.CATEGORY]: [PHASES.WAITING],
            [PHASES.LOBBY]: [PHASES.VOTING],
            [PHASES.VOTING]: [PHASES.LOBBY]
        };
        let rejection = null;
        let phaseChanged = false;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            phaseChanged = false;
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            if (room.hostId !== userId) {
                rejection = 'NOT_HOST';
                return undefined;
            }
            const currentPhase = room.gameState?.phase;
            if (currentPhase === nextPhase) return room;
            if (!allowedTransitions[currentPhase]?.includes(nextPhase)) {
                rejection = 'INVALID_PHASE';
                return undefined;
            }
            if (nextPhase === PHASES.CATEGORY && getActivePlayers(room.players).filter((player) => player.connected !== false).length < 3) {
                rejection = 'NOT_ENOUGH_PLAYERS';
                return undefined;
            }

            phaseChanged = true;
            room.gameState.phase = nextPhase;
            if (currentPhase === PHASES.VOTING || nextPhase === PHASES.VOTING) {
                delete room.gameState.voteResults;
                Object.values(room.players || {}).forEach((player) => delete player.hasVoted);
            }
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'INVALID_PHASE');
        if (phaseChanged && (nextPhase === PHASES.LOBBY || nextPhase === PHASES.VOTING)) {
            await database.ref(`roomVotes/${roomCode}`).remove();
        }
        return { phase: nextPhase };
    } catch (error) {
        return fail(error, 'changePhase failed');
    }
});

exports.startGame = onCall(async (request) => {
    let roomCode = null;
    let startToken = null;
    let previousPhase = null;
    let priorSecrets = null;
    let secretsWritten = false;
    let startCommitted = false;

    try {
        const userId = requireUser(request);
        roomCode = getRoomCode(request.data);
        startToken = randomUUID();
        let rejection = null;
        const lock = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            if (room.hostId !== userId) {
                rejection = 'NOT_HOST';
                return undefined;
            }
            if (![PHASES.CATEGORY, PHASES.GAME_OVER].includes(room.gameState?.phase)) {
                rejection = 'INVALID_PHASE';
                return undefined;
            }
            previousPhase = room.gameState.phase;
            room.gameState.phase = PHASES.STARTING;
            room.gameState.startToken = startToken;
            room.updatedAt = Date.now();
            return room;
        });
        if (!lock.committed) throw new Error(rejection || 'INVALID_PHASE');

        const latestRoomSnapshot = await database.ref(`rooms/${roomCode}`).get();
        const room = latestRoomSnapshot.val();
        if (!room || room.hostId !== userId || room.gameState?.startToken !== startToken) {
            throw new Error(room ? 'NOT_HOST' : 'ROOM_NOT_FOUND');
        }
        const selectedCategories = room.settings?.selectedCategories || [];
        if (selectedCategories.length === 0) throw new Error('NO_CATEGORIES');

        const priorSecretsSnapshot = await database.ref(`roomSecrets/${roomCode}`).get();
        priorSecrets = priorSecretsSnapshot.val();
        const authority = priorSecrets?._authority || {};
        const pair = chooseWordPair(words, selectedCategories, authority.usedWordKeys || []);
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
        const now = Date.now();
        const secretBranch = {
            _authority: {
                currentWordPair: pair,
                roundId: assignment.roundId,
                usedWordKeys
            },
            ...assignment.secrets
        };

        await database.ref(`roomSecrets/${roomCode}`).set(secretBranch);
        secretsWritten = true;

        const startResult = await database.ref(`rooms/${roomCode}`).transaction((latestRoom) => {
            if (!latestRoom || latestRoom.hostId !== userId || latestRoom.gameState?.startToken !== startToken) {
                return undefined;
            }
            const latestIds = Object.keys(latestRoom.players || {}).sort();
            const assignedIds = Object.keys(publicPlayers).sort();
            if (latestIds.length !== assignedIds.length || latestIds.some((id, index) => id !== assignedIds[index])) {
                return undefined;
            }

            Object.entries(publicPlayers).forEach(([playerId, player]) => {
                latestRoom.players[playerId] = {
                    ...player,
                    connected: latestRoom.players[playerId].connected
                };
            });
            latestRoom.status = STATUSES.PLAYING;
            latestRoom.updatedAt = now;
            latestRoom.gameState = {
                phase: PHASES.REVEAL,
                roundNumber: 1,
                roundId: assignment.roundId,
                startedAt: now
            };
            return latestRoom;
        });
        if (!startResult.committed) throw new Error('INVALID_PHASE');
        startCommitted = true;
        await database.ref(`roomVotes/${roomCode}`).remove().catch((cleanupError) => {
            logger.error('Could not clear prior votes after game start', cleanupError);
        });
        return { success: true };
    } catch (error) {
        if (secretsWritten && !startCommitted && roomCode) {
            await database.ref(`roomSecrets/${roomCode}`).set(priorSecrets).catch((restoreError) => {
                logger.error('startGame secret rollback failed', restoreError);
            });
        }
        if (roomCode && startToken) {
            const roomRef = database.ref(`rooms/${roomCode}`);
            await roomRef.transaction((room) => {
                if (room?.gameState?.startToken !== startToken) return undefined;
                room.gameState.phase = previousPhase || PHASES.CATEGORY;
                delete room.gameState.startToken;
                return room;
            }).catch((rollbackError) => logger.error('startGame rollback failed', rollbackError));
        }
        return fail(error, 'startGame failed');
    }
});

exports.markRoleSeen = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        let rejection = null;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            const player = room.players?.[userId];
            if (!player) {
                rejection = 'NOT_A_MEMBER';
                return undefined;
            }
            if (room.gameState?.phase !== PHASES.REVEAL || player.isSpectator) {
                rejection = 'INVALID_PHASE';
                return undefined;
            }

            player.roleSeen = true;
            const activePlayers = Object.values(room.players)
                .filter((candidate) => !candidate.isSpectator && candidate.connected !== false);
            if (activePlayers.every((candidate) => candidate.roleSeen === true)) {
                room.gameState.phase = PHASES.LOBBY;
            }
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'INVALID_PHASE');
        return { phase: result.snapshot.val().gameState.phase };
    } catch (error) {
        return fail(error, 'markRoleSeen failed');
    }
});

exports.castVote = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        const targetId = String(request.data?.targetPlayerId || '');
        let rejection = null;

        const initialRoomSnapshot = await database.ref(`rooms/${roomCode}`).get();
        const initialRoom = initialRoomSnapshot.val();
        const voter = initialRoom?.players?.[userId];
        const target = initialRoom?.players?.[targetId];
        if (!initialRoom) throw new Error('ROOM_NOT_FOUND');
        if (initialRoom.gameState?.phase !== PHASES.VOTING || !voter || voter.alive === false || voter.isSpectator) {
            throw new Error('INVALID_VOTE');
        }
        if (!target || target.alive === false || target.isSpectator || targetId === userId) {
            throw new Error('INVALID_VOTE');
        }

        const voteRef = database.ref(`roomVotes/${roomCode}/${userId}`);
        let isRetry = false;
        const voteClaim = await voteRef.transaction((currentVote) => {
            if (currentVote === null) return targetId;
            if (currentVote === targetId) {
                isRetry = true;
                return currentVote;
            }
            return undefined;
        });
        if (!voteClaim.committed) throw new Error('ALREADY_VOTED');

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            const latestVoter = room.players?.[userId];
            const latestTarget = room.players?.[targetId];
            if (room.gameState?.phase !== PHASES.VOTING || !latestVoter || latestVoter.alive === false || latestVoter.isSpectator) {
                rejection = 'INVALID_VOTE';
                return undefined;
            }
            if (!latestTarget || latestTarget.alive === false || latestTarget.isSpectator || targetId === userId) {
                rejection = 'INVALID_VOTE';
                return undefined;
            }
            if (latestVoter.hasVoted) {
                if (isRetry) return room;
                rejection = 'ALREADY_VOTED';
                return undefined;
            }

            latestVoter.hasVoted = true;
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) {
            await voteRef.remove();
            throw new Error(rejection || 'INVALID_VOTE');
        }
        await publishVoteResults(roomCode);
        return { success: true };
    } catch (error) {
        return fail(error, 'castVote failed');
    }
});

exports.finalizeVote = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        const [secretsSnapshot, votesSnapshot] = await Promise.all([
            database.ref(`roomSecrets/${roomCode}`).get(),
            database.ref(`roomVotes/${roomCode}`).get()
        ]);
        const secrets = secretsSnapshot.val() || {};
        const votes = votesSnapshot.val() || {};
        let outcome = null;
        let rejection = null;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            if (room.hostId !== userId) {
                rejection = 'NOT_HOST';
                return undefined;
            }
            if (room.gameState?.phase !== PHASES.VOTING) {
                rejection = 'INVALID_PHASE';
                return undefined;
            }
            if (!haveAllActivePlayersVoted(room.players, votes)) {
                rejection = 'VOTES_INCOMPLETE';
                return undefined;
            }

            const highestIds = getHighestVotedPlayerIds(votes);
            if (highestIds.length > 1) {
                outcome = { tie: true, playerIds: highestIds };
                return room;
            }
            const eliminatedId = highestIds[0];
            const eliminated = room.players?.[eliminatedId];
            const secret = secrets[eliminatedId];
            if (!eliminated || !secret) {
                rejection = 'NO_ELIMINATION';
                return undefined;
            }

            eliminated.alive = false;
            eliminated.revealedRole = secret.role;
            if (secret.role === 'imposter') eliminated.revealedWord = secret.word;
            room.gameState.phase = PHASES.ELIMINATION;
            room.gameState.eliminatedPlayerId = eliminatedId;
            room.updatedAt = Date.now();
            outcome = { tie: false, playerId: eliminatedId };
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'INVALID_PHASE');
        return outcome;
    } catch (error) {
        return fail(error, 'finalizeVote failed');
    }
});

exports.continueAfterElimination = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        const secretsSnapshot = await database.ref(`roomSecrets/${roomCode}`).get();
        const secrets = secretsSnapshot.val() || {};
        let rejection = null;
        let winner = null;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            if (room.hostId !== userId) {
                rejection = 'NOT_HOST';
                return undefined;
            }
            if (room.gameState?.phase !== PHASES.ELIMINATION) {
                rejection = 'INVALID_PHASE';
                return undefined;
            }

            winner = determineWinner(room.players, secrets);
            if (winner) {
                room.status = STATUSES.FINISHED;
                room.gameState = {
                    ...room.gameState,
                    phase: PHASES.GAME_OVER,
                    winner,
                    wordPair: secrets._authority?.currentWordPair || null,
                    finishedAt: Date.now()
                };
            } else {
                room.gameState.phase = PHASES.LOBBY;
                room.gameState.roundNumber = (room.gameState.roundNumber || 1) + 1;
                delete room.gameState.eliminatedPlayerId;
            }
            delete room.gameState.voteResults;
            Object.values(room.players || {}).forEach((player) => delete player.hasVoted);
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'INVALID_PHASE');
        await database.ref(`roomVotes/${roomCode}`).remove();
        return { winner };
    } catch (error) {
        return fail(error, 'continueAfterElimination failed');
    }
});

exports.resetToWaiting = onCall(async (request) => {
    try {
        const userId = requireUser(request);
        const roomCode = getRoomCode(request.data);
        let rejection = null;

        const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
            if (!room) {
                rejection = 'ROOM_NOT_FOUND';
                return undefined;
            }
            if (room.hostId !== userId) {
                rejection = 'NOT_HOST';
                return undefined;
            }
            if (room.gameState?.phase !== PHASES.GAME_OVER) {
                rejection = 'INVALID_PHASE';
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
            room.status = STATUSES.WAITING;
            room.gameState = { phase: PHASES.WAITING, roundNumber: 0 };
            room.updatedAt = Date.now();
            return room;
        });

        if (!result.committed) throw new Error(rejection || 'INVALID_PHASE');
        await Promise.all([
            database.ref(`roomSecrets/${roomCode}`).remove(),
            database.ref(`roomVotes/${roomCode}`).remove()
        ]);
        return { success: true };
    } catch (error) {
        return fail(error, 'resetToWaiting failed');
    }
});

exports.syncPlayerPresence = onValueWritten('/roomPresence/{roomCode}/{playerId}/{connectionId}', async (event) => {
    const { roomCode, playerId } = event.params;
    // Read the authoritative collection rather than deriving it from the event snapshot.
    // Eventarc deliveries can arrive after a newer tab connection change, so every
    // invocation must converge on the player's current multi-tab presence state.
    const connectionsSnapshot = await database.ref(`roomPresence/${roomCode}/${playerId}`).get();
    const connected = connectionsSnapshot.exists();

    const result = await database.ref(`rooms/${roomCode}`).transaction((room) => {
        const player = room?.players?.[playerId];
        if (!player || player.connected === connected) return undefined;
        player.connected = connected;

        if (!connected && room.hostId === playerId) {
            const nextHostId = selectNextHost(room.players, playerId);
            if (nextHostId) room.hostId = nextHostId;
        }

        if (!connected && room.gameState?.phase === PHASES.REVEAL) {
            const connectedPlayers = Object.values(room.players || {})
                .filter((candidate) => !candidate.isSpectator && candidate.connected !== false);
            if (connectedPlayers.length > 0 && connectedPlayers.every((candidate) => candidate.roleSeen === true)) {
                room.gameState.phase = PHASES.LOBBY;
            }
        }

        room.updatedAt = Date.now();
        return room;
    });

    if (!result.committed) {
        logger.debug('Presence state already current or player no longer exists', {
            roomCode,
            playerId,
            connected
        });
    }
    await publishVoteResults(roomCode);
});
