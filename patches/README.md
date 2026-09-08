# Control Tower client 0.1.1

The pinned client patch includes the benchmark package 0/1/2: sender-scoped data
assembly with bounded queues and receiver acknowledgements, media cleanup, refreshed credentials and full
rejoin, local audio diagnostics and playback status. It also retains native
microphone `publishTrack(track, { source })` compatibility, overlapping transport
creation and data-channel readiness before `Room.connect` resolves.

`npm ci` applies the patch and fails if it no longer matches the installed SDK.
`npm run test:call-join` tests the installed package, including parallel transport
failure cleanup, publication, mute/unmute, and browser capture cancellation.

The corresponding TypeScript changes are also in the sibling Control Tower
workspace (`packages/client/src`). No npm release was published in this package.
The patch is the reproducible integration until the joint release. When an upstream
release includes them, upgrade the exact dependency version, remove this patch,
and rerun the tests before removing patch-package.

The local package 3/4/5 adds real producer mute, consumer pause/resume, subscription
preferences across rejoin, video quality/demand control and the screen audio preset.
The splotys app defaults to `speech32` after blind listening in clean and moderate
networks; `standard` is the explicit rollback and remains the SDK default for compatibility.
The installed-package test also checks that the video
demand flag reaches the server's produce envelope.

Deploy the matching server/protocol before clients using consumer controls and demand.
Full benchmark evidence is in the sibling workspace's `specs/004-control-tower-benchmark/package-345.md`.

Large streams (>64 KiB) require the updated server and recipient SDKs. Deploy the
server before this app in the joint release, then reload old clients. Small v1
messages remain compatible; mixed cohorts get an explicit error for large sends.
