# Architecture

## Overview

The browser is a vanilla ES-module application. A central renderer selects a screen from local menu state or the synchronized room phase. Firebase Anonymous Authentication supplies a stable player ID, while Realtime Database listeners synchronize rooms, private role records, and votes.

The project targets Firebase's Spark plan. The host browser coordinates game mutations that previously ran in callable Cloud Functions. This is suitable for a private game among trusted friends, not a public competitive service.

## Game lifecycle

```text
home → create/join → waiting → category → starting → reveal
                                                   ↓
gameover ← elimination ← voting ← discussion/lobby
   ↓                         ↖──────── tie ────────┘
new word or reset to waiting
```

- Three connected players are required to start.
- The host chooses categories and role counts.
- The host browser selects the word pair, assigns roles, and stores each secret separately.
- Each player reads their own role path and acknowledges it.
- Each player writes one private vote; the host publishes totals when all active players vote.
- The host eliminates the selected player and determines the winner.

## Realtime Database model

```text
rooms/{roomCode}
  schemaVersion, hostId, status, timestamps
  settings
  players/{uid}
    name, connected, alive, isSpectator, roleSeen, hasVoted
    revealedRole/revealedWord
  gameState
    phase, roundNumber, roundId, voteResults
    eliminatedPlayerId, winner, wordPair

roomSecrets/{roomCode}/{uid}
  role, word, category, roundId

roomSecrets/{roomCode}/_authority
  currentWordPair, usedWordKeys

roomVotes/{roomCode}/{uid}
  targetUid
```

Only room members can read a room, and the collection root remains unreadable. A prospective player joins through a tightly constrained write to their own player record; after that succeeds, they can read the room. Capacity and duplicate-name checks run immediately afterward. Players can update their own connection/reveal/vote fields and read their own role and vote. The host can update the full room and private branches.

## Presence and recovery

Each browser registers `onDisconnect()` on its own public `connected` field before setting it to `true`. This works directly on Spark and does not require a database trigger. Local session storage remembers the room code, UID, and display name for refresh recovery.

If the host disconnects, the earliest connected player can claim `hostId`. Realtime Database transactions prevent two clients from winning that claim simultaneously.

## Trust and security

- Anonymous authentication and database rules prevent ordinary accidental cross-room writes.
- User text remains normalized and HTML-escaped.
- Hosting retains CSP, framing, MIME-sniffing, referrer, and permissions headers.
- The word catalog is included in the browser bundle.
- The host can read all role assignments and votes because its browser coordinates the game.
- Database rules cannot make browser-selected roles, votes, or winner calculations authoritative.
- Capacity and duplicate-name checks are friendly client checks rather than tamper-proof server constraints.

For a public or adversarial environment, restore the server-authoritative Cloud Functions design and Blaze billing.
