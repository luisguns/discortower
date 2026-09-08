# Control Tower client

The benchmark client changes are published as
`@gunns-dev/control-tower-client@0.1.2`. The app installs that exact version
directly. A local patch preserves microphone capture constraints (AGC, echo
cancellation and noise suppression) when switching input devices. Without it,
the SDK opens the new device with browser defaults. `postinstall` applies the
patch, and `test:call-join` verifies the replacement track receives the filters.

`npm run test:call-join` tests the installed package, including parallel transport
failure cleanup, publication, mute/unmute, and browser capture cancellation.

The corresponding TypeScript changes are also in the sibling Control Tower
workspace (`packages/client/src`).

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
