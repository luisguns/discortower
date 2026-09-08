# Control Tower client 0.1.1

The pinned client patch adds native microphone `publishTrack(track, { source })`
compatibility with LiveKit and overlaps send/receive transport creation. It keeps
the existing data-channel readiness guarantee before `Room.connect` resolves.

`npm ci` applies the patch and fails if it no longer matches the installed SDK.
`npm run test:call-join` tests the installed package, including parallel transport
failure cleanup, publication, mute/unmute, and browser capture cancellation.

The corresponding TypeScript changes are also in the sibling Control Tower
workspace (`packages/client/src/participant.ts` and `room.ts`). When an upstream
release includes them, upgrade the exact dependency version, remove this patch,
and rerun the tests before removing patch-package.
