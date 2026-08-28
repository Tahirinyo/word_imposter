# Who Is the Impostor?

A mobile-first Turkish social deduction game built with Vite, Firebase Authentication, Realtime Database, and Hosting.

## Deployment profile

This repository is configured for Firebase's no-cost Spark plan and a small group of friends. Multiplayer game actions run in the browsers and synchronize through Realtime Database; Cloud Functions are not required or deployed.

This restores no-billing operation, with an intentional trust tradeoff: the host browser selects the words, assigns roles, tallies votes, and determines the winner. A technically curious host can inspect or modify that information. Do not use this design for a public or competitive game.

## Requirements

- Node.js 22+
- A Firebase project with Anonymous Authentication, Realtime Database, and Hosting enabled
- A supported Java JDK when running the Firebase database emulator

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and enter the Firebase web-app configuration shown in Firebase Console → Project settings.

3. Enable Anonymous sign-in in Firebase Console → Authentication → Sign-in method.

4. Run the app:

   ```bash
   npm run dev
   ```

For local emulators, set `VITE_USE_FIREBASE_EMULATORS=true`, start `npm run emulators`, and run `npm run dev` in another terminal.

## Quality checks

```bash
npm run verify:spark
```

## Deploy

Select the correct project in `.firebaserc`, then run:

```bash
npm run deploy
```

The deployment publishes only Realtime Database rules and Hosting. `src/data/words.json` is the authoritative word-pair catalog for the current application. The `functions/data/words.json` file belongs to the retained historical Functions implementation, is not part of the Spark deployment, and is not synchronized with the current catalog.

## Project structure

```text
src/
  config/       Firebase Authentication and Realtime Database initialization
  data/         Browser-visible categories, roles, and word-pair catalog
  game/         Spark game engine, room synchronization, validation, and stores
  lib/          Audio, haptics, DOM, escaping, and storage helpers
  styles/       Tokens, base styles, components, and screens
  ui/           Phase renderers and modal UI
tests/          Client engine, domain, and Realtime Database rule tests
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the lifecycle, data model, and trust boundary.
