# Firestore Rules

The least-privilege rules live in `firestore.rules` and are not deployed automatically.

## Firebase Console

1. Open the Firebase project used by TrustPause.
2. Go to **Firestore Database**.
3. Open the **Rules** tab.
4. Replace the editor contents with the contents of `firestore.rules`.
5. Click **Publish** only after reviewing the diff and running the emulator tests locally.

These rules require an authenticated Firebase user, including anonymous users. They allow access only below `users/{request.auth.uid}` and reject unknown fields, oversized strings, invalid risk levels, non-integer scores, and scores outside `0..100`.

There are no public reads. The top-level user document is denied; only the explicitly listed subcollections are accessible.

## Local emulator tests

Install or use the Firebase CLI through `npx`, then run:

```bash
npm run test:rules
```

This starts the local Firestore emulator, loads `firestore.rules`, and runs [tests/firestore.rules.test.ts](../tests/firestore.rules.test.ts). It tests owner access, unauthenticated access, cross-user access, unexpected fields, oversized strings, invalid scores, invalid risk levels, and unexpected UID fields.

The test command uses the emulator only. It does not deploy rules or write to a Firebase project.
