# Changelog

## v0.19.1

- ci: upgrade npm before publishing so OIDC trusted publishing works


## v0.19.0

- ci: check out metadata-connect and onelibrary-connect siblings so publish workflow can install
- ci: switch publish workflow to OIDC trusted publishing
- feat: add an opt-in to announce to Stagehand
- fix(ci): publish workflow uses Node 22 so yarn install no longer aborts on engine mismatch
- fix(ci): publish no longer fails when several connect repos release together
- ci: pin Node globally so onelibrary-connect's native build matches the test runtime
- ci: switch build workflow from yarn to npm so SQLite native binaries dedupe
- test: skip pcap-adapter test setup failure when cap is not installed
- fix(db): drop dangling hostDevice constructor parameter from Database
- test: stop CI test runs from crashing on onelibrary-connect ESM imports
- style: fix lint errors blocking CI
- ci: build sibling repos before installing so file deps resolve in CI
- chore: bump volta node pin to 22.13.0 so yarn install passes vite engine check
- ci: check out sibling repos so CI install no longer fails on missing file deps
- fix(mixstatus): stop double-counting same track when DJ cue-juggles mid-set
- feat(db): fetch waveform preview and detailed for streaming tracks
- chore: regenerate lockfiles after dependency install
- chore: update lockfiles
- fix(db): restore GetTrackInfo query for streaming tracks to capture Beatport file path
- feat(virtualcdj): expose ready promise that resolves when startup protocol completes
- fix(remotedb): prevent deadlocks and silent hangs on streaming track queries
- refactor: remove debugStreamingQueries now that getMetadata handles streaming
- fix: tolerate missing file path in passive remotedb getTrackMetadata
- feat: support metadata lookup for streaming tracks (Beatport)
- feat: support metadata lookup for unanalyzed tracks from USB
- chore: update lockfile
- chore: update lockfiles for onelibrary-connect dependency
- refactor: consume onelibrary-connect for OneLibrary database access
- test: add pcap-adapter Windows interface resolution tests
- fix: resolve Windows interface names for pcap
- chore: regenerate lockfiles for metadata-connect 1.1.4
- chore: add npm publish verification step
- chore: regenerate lockfile for v0.18.0
- Bump to v0.18.0 with streaming service detection
- Fix PWV6 and PWV7 parsing that failed on all real .2EX files
- Streaming tracks no longer crash when remotedb fields are missing
- chore: update lockfiles
- fix: correct function signature in getFile module
- refactor: replace console logging with pluggable logger
- chore: update package-lock.json for 0.17.1
- chore: bump version to 0.17.1
- fix: Correct PWVC vocal config byte layout to match real .2EX files
- Add example for 3-band waveform and vocal detection from .2EX files
- Add example for looking up vocal detection config from local rekordbox
- Add example for looking up vocal detection config from USB
- Add tests for requesting vocal detection configuration
- docs: update README and bump package-lock
- chore: bump version to 0.17.0
- test: add .2EX parser and integration tests
- feat: add .2EX file parsing for 3-band waveforms and vocal detection
- feat: NFS access for rekordbox slot and stability fixes
- fix: use correct NFS portmap port for rekordbox
- fix: correct media slot name parsing and add waveform color preview
- fix: correct media slot name parsing offset
- fix: resolve security vulnerabilities in dependencies
- chore: update lockfiles
- chore: update package and yarn lock files
- refactor: split rekordbox adapter into focused modules
- refactor: split OneLibrary adapter into focused modules
- feat: add full metadata extraction with partial file reads
- chore: rename package from prolink-connect to alphatheta-connect
- fix: add contents write permission for git push
- fix: handle yarn.lock and improve changelog generation
- ci: auto-version bump and publish on push to main
- rename package from prolink-connect to alphatheta-connect
- docs: add Pro DJ Link protocol documentation
- refactor: add database adapter abstraction for OneLibrary support
- chore: remove NowPlaying-specific debug logging
- docs: update README with new features and add passive mode guide
- feat: add findAllAlphaThetaInterfaces() to detect multiple Pro DJ Link networks
- feat: support all-in-one DJ controllers (XDJ-XZ, XDJ-RX) in passive mode
- chore: bump version to 0.15.0
- chore: move cap to optionalDependencies for passive mode
- chore: code formatting and OneLibrary schema types
- feat: add comprehensive LocalDB and OneLibrary test suite
- chore: add jest mock for .ksy parser files
- feat: add passive mode for pcap-based Pro DJ Link monitoring
- refactor: rename getArtworkFromFile to getArtwork as the default method
- feat: add artwork extraction from audio files via NFS
- chore: bump version to 0.14.0
- fix: resolve lint errors in localdb and telemetry
- chore: fix prettier formatting in telemetry
- chore: remove debug logging from status emitter
- feat: optimize database hydration with SQLite transactions
- fix: NFS buffer handling for reliable database streaming
- fix: improve network handling
- Stop tracking build artifacts to prevent non-deterministic diffs
- fix: correct 1Password secret path for npm token
- Add CI workflows and release script for automated npm publishing
- fix: correct TypeScript type union order in field declarations
- temp: disable Sentry to fix Electron asar bundling issues
- fix: correct TypeScript type union order in field declarations
- Update build artifacts and lock files
- Replace js-xdr internal imports with local implementations
- feat(telemetry): allow Sentry DSN to be configured via environment variable
- chore: bump all dependencies to latest versions
- chore: update dependencies to latest versions
- feat: make virtual CDJ name configurable
- chore: add coverage to gitignore
- test: improve code coverage with additional unit tests
- fix: resolve lint errors and fix tests for upstream compatibility
- feat: implement optional full DJ Link startup protocol
- feat: implement 6-channel on-air support for CDJ-3000 + DJM-V10
- feat: implement extended ANLZ features (PCO2, PSSI, waveforms)
- feat: add absolute position packet support for CDJ-3000+
- Rebuild lib output
- fix: add lru_map dependency for Sentry v6 compatibility
- build: update compiled output
- feat: enable socket reuse for Rekordbox coexistence
- docs: add project instructions
- feat: Add opt-in telemetry and fix npm install from git
- Closing the announce sockets shouldn't depend on attachment to the device.
- Add parameter to allow getFile to read 8k chunks.
- Rename getArtwork to reflect it gets thumbnails.
- Update to be closer to what it was originally.
- Get file POC.
- Launch CLI via VSC.
- Update CDJ name
- Identify as Now Playing in ProLink network
- Update the build
- Update for CDJ3000
- bump version
- Add compiled lib. bump version.
- Upgrade sqlite3
- add iconv-lite
- Ignore node modules
- Bump typedoc
- Remove png logo
- Switch readme to use SVG logo
- Add SVG logo
- Bump better-sqlite3
- Bump node types
- Bump prettier
- Bump build deps
- Update changelog
- Lower minimum node to 20
- Bump workflows
- Update typedoc
- Small bumps
- Bump ts-patch
- Bump webpack things
- Correct comment on autoconfigFromPeers
- Bump types / ts-node
- Remove eslint plugin jest
- Bump prettier
- Bump eslint to v9
- Bump node types
- Upgrade jest
- Bump typescript-transform-paths
- Bump typescript
- Bump sqlite3
- Fix typos
- Switch prettier to mjs file
- Move jest config to module file type
- Bump node / yarn
- Typo in GenericMetadataItems
- Fix typo in ItemType.OriginalArtist (was OrigianlArtist)
- Typos
- Consistent .eslintrc
- Bump pretiter / eslint
- Consistent publish action
- Prefer interface over type
- Bump to node 18 LTS
- Move kaitai-struct-loader to devdeps
- Fix engine version constraint
- Match node / volta across all repos
- Update gha volta-cli -> v4
- Update gha checkout -> v3
- Add typedoc-plugin-missing-exports
- v0.11.0
- Formatting
- Bump @types/node
- Require node 16
- Replace UUID with crypto UUID
- Bump webpack
- Upgrade typescript
- Bump typescript
- Move around some type dependencies
- Move signale to dev dependency
- Bump better-sqlite3
- Fix problmatic type in remotedb/fields
- Bump node / yarn
- Bump eslint / prettier
- Bump jest
- Fix {@link ...} typedocs
- Fix tests
- EvanPurkhiser -> evanpurkhiser
- Include the import in the README.md (#15)
- Fix typo (#16)
- Bump prettier
- Bump jest
- Bump to node 16
- Ignore docs folder
- Fix docs build
- Bump ws from 7.4.5 to 7.4.6 (#8)
- v0.10.0
- Add missing transient dependency for kaitai struct loader
- Formatting fixup
- Changelog formatting fixup
- Switch to using player 7 as the CDJ
- Bump packages
- v0.9.0
- Add changelog entry for getPlaylist
- Minor typo fix in changelog
- Fix wording on local db error
- Add db.getPlaylist
- Fix limit calculation bug in renderItems
- Bump eslint config
- v0.8.1
- Bump packages
- v0.8.0
- Fix type exports
- Update outdated packages
- Bump to latest packages
- Add db.getWaveforms
- Fix tests
- Restructure hydrateAnlz to not mutate Track objects
- Add isEmergencyMode
- Bump some packages
- v0.7.2
- Fix types bundle to not include extra stuff
- v0.7.1
- Correctly export mixstatus mode
- v0.7.0
- Fix link in changelog
- Export MixstatusMode
- v0.6.0
- Implement master following in mixstatus
- Bump ini from 1.3.5 to 1.3.8 (#5)
- Bump highlight.js from 10.4.0 to 10.4.1 (#4)
- v0.5.0
- Changelog spelling
- Upgrade to latest webpack
- Update kaitai struct definitions
- Announce directly to devices, fixing connections once again
- Correctly remove udpBind error handlers after connecting
- Another minor change log wording fix
- Minor changelog formatting fix
- Check lint and test on version
- v0.4.0
- Update changelog format
- Update changelog
- Fix disconnecting
- Correctly rebind the announce socket during discovery
- Disable waveform hydration for now
- v0.4.0-test.0
- Bind the announce port to the interface discovered / configured
- Bump packages
- Updated changelog
- Add waveform HD lookup to metadat query
- Bump node-notifier from 8.0.0 to 8.0.1
- v0.3.0
- Allow mixstatus to be configured with various options
- Missed a few import sorts
- Sort imports
- v0.2.0
- Bump changelog
- fix: Don't hard error on failed artwork lookup
- fix: Don't hard error on failed artwork lookup
- Allow analyzeDate and dateAdded to be null
- Ensure basic id/name always has string for name
- Fix trackTypeNames mapping


All notable changes to alphatheta-connect (formerly prolink-connect) will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [v0.18.1] - 2026-03-18

### Fixed

- **Windows passive mode**: Translate Node.js network interface names (e.g. "Ethernet") to Npcap device paths (`\Device\NPF_{GUID}`) when opening packet capture. Previously, `PcapAdapter.start()` would fail on Windows because the `cap` module requires Npcap device paths, not OS-level friendly names.

### Added

- `resolveWindowsInterface()` helper in PcapAdapter that cross-references `os.networkInterfaces()` with `Cap.deviceList()` by matching IPv4 addresses
- Test suite for Windows interface resolution (9 tests covering matching, fallback, passthrough, and cross-platform behavior)

## [v0.18.0] - 2026-03-12

### Added

- **Streaming service detection**: Added support for detecting streaming sources (Beatport, Streaming Direct Play, TIDAL, Apple Music) via MediaSlot enum
- `MediaSlot.StreamingDirectPlay = 0x06` for Streaming Direct Play tracks
- `MediaSlot.Beatport = 0x09` for Beatport streaming tracks
- Placeholder slots for unknown streaming services (0x05, 0x07, 0x08) - likely TIDAL and Apple Music
- CDJ-3000X supports: Beatport, TIDAL, Apple Music, and Streaming Direct Play via CloudDirectPlay

## [v0.17.0] - 2026-03-02

### Added

- `.2EX` file loading via `loadAnlz(track, '2EX', resolver)` with graceful fallback for older exports
- TypeScript types for 3-band waveform data: `Waveform3BandPreview`, `Waveform3BandDetail`, `VocalConfig`
- Parser functions for PWV6 (3-band color preview), PWV7 (3-band color detail), and PWVC (vocal config) sections
- `AnlzResponse2EX` response type with nullable fields for each section
- `getTrackAnalysis()` now loads `.2EX` files in parallel with `.EXT` and includes 3-band waveform and vocal config data
- Comprehensive test suite for `.2EX` parsing (40 unit and integration tests)

## [v0.16.0] - 2026-03-01

### Fixed

- Prevent Pioneer Stagehand lighting app from crashing by excluding it from announcer packets
- Restrict database queries to CDJ devices with IDs 1-6 to avoid querying non-player devices
- Return null instead of throwing when requesting databases from non-CDJ devices

### Changed

- Virtual CDJ firmware version updated from 1.43 to 3.20

### Added

- NFS access for rekordbox (RB) media slot with support for both macOS and Windows file paths
- Query filePath from remote database for track lookups

## [v0.15.0] - 2026-01-19

### Added

- **Passive monitoring mode**: Monitor Pro DJ Link networks via packet capture (pcap) without joining the network as a virtual CDJ. Allows monitoring alongside rekordbox.
- **Artwork extraction from audio files via NFS**: Extract album artwork directly from audio files (MP3, FLAC, AIFF, M4A) over NFS when artwork is not available in the rekordbox database.
- **OneLibrary database support**: Full support for rekordbox 7.x's new OneLibrary format (exportLibrary.db) with SQLCipher encryption, including tracks, playlists, cues, hot cue banks, myTags, and history.
- New ANLZ parsing for `.2EX` files (PWV6, PWV7, PWVC sections)
- Comprehensive test suite for LocalDB and OneLibrary functionality

### Changed

- `getArtwork` is now the default method name (renamed from `getArtworkFromFile`)
- `cap` moved to optionalDependencies for easier installation when passive mode is not needed

## [v0.14.0] - 2026-01-16

### Changed

- Optimized database hydration with SQLite transactions (10-100x faster)
- Added prepared statement caching for bulk inserts
- Batched progress updates every 100 rows instead of every row
- Fixed NFS buffer handling for reliable database streaming
- Added error handling for media slot queries (returns null instead of throwing)

### Added

- Optional profiling via `NP_PROFILE_HYDRATION=1` environment variable
- Optional debug logging via `NP_PRODJLINK_TAG=1` environment variable

## [v0.13.0] - 2025-12-15

### Added

- CDJ-3000 support with absolute position packet handling
- 6-channel on-air support for DJM-V10 mixers
- Extended ANLZ features (PCO2, PSSI, enhanced waveforms)
- Full DJ Link startup protocol (optional, for CDJ-3000 compatibility)
- Socket reuse option for Rekordbox coexistence
- Configurable virtual CDJ name via `network.configure({ vcdjName })`
- Configurable Sentry DSN via `PROLINK_CONNECT_SENTRY_DSN` environment variable
- Optional telemetry for performance monitoring

### Changed

- Require Node 20 minimum version
- Replaced js-xdr internal imports with local implementations for better bundling
- Virtual CDJ now identifies as "Now Playing" on the ProLink network
- Bumped all dependencies to latest versions

### Fixed

- TypeScript type union order in field declarations
- Fixed a typo in `ItemType.OriginalArtist` (was misspelled as `OrigianlArtist`)
- Network handling improvements for stability
- Lint errors and test compatibility

## [v0.11.0] - 2022-10-24

- Package updates. No changes

## [v0.10.0] - 2021-05-23

### Changed

- Switch to using Player ID 7 for the virtual CDJ. Freeing up slot 5 for
  CDJ-3000s.

## [v0.9.0] - 2021-05-18

### Added

- You can now call `network.db.getPlaylist` to receive the listing for a
  playlist. Without specifying the playlist to lookup the root playlist will be
  queried.

### Fixed

- Remote database calls could fail for requests that result in a large number
  of rows. Unless you were using the remotedb query interface directly, it is
  unlikely you would have ran into this problem. The two implemented queries do
  not return enough rows to result in the error.

## [v0.8.1] - 2021-04-23

### Changed

- Bumped to latest js-xdr to remove node Buffer warnings.

## [v0.8.0] - 2021-04-12

### Added

- You can now call `network.db.getWaveforms` to load waveforms for a track.

- The `isEmergencyMode` flag has been added to the CDJStatus type. This reports
  if the CDJ is in an emergency loop (or just emergency mode in newer players)

## [v0.7.2] - 2021-02-15

### Fixed

- Do not import the mixstatus module in the types export, as this exports more
  things that we really don't want.

## [v0.7.1] - 2021-02-15

### Fixed

- Actually export `MixstatusMode`, not just the type.

## [v0.7.0] - 2021-02-14

### Changed

- `ReportingMode` has been renamed to `MixstatusMode` and is now exported in
  `prolink-connect/lib/types`.

## [v0.6.0] - 2021-02-14

### Added

- A new `triggerNextTrack` method has been introduced to the Mixstatus service.
  Calling this will immediately report the player which has been playing for
  the longest as now playing.

- the Mixstatus service has learned to follow master. See the changes to
  Mixstatus below.

### Changed

- The Mixstatus service's configuration has been restructured and has learned
  how to follow master.

- `reportRequiresSilence` has been removed

- A new `mode` option has been introduced that configures how the mixstatus
  processor will generally determine when a track change has happened. The
  `ReportingMode` defines: `SmartTiming` (the default), `WaitsForSilence`
  (the replacement for `reportRequiresSilence`), and a new `FollowsMaster`
  mode, which simply causes tracks to be reported when the player becomes
  master (assuming it is on air and playing).

## [v0.5.0] - 2021-02-01

### Fixed

- Binding to the detected interface to broadcast the announcement packets is not
  the best approach, since we then can no longer receive broadcast packets.
  Instead, we can just announce to all connected devices on each announcement
  tick.

### Changed

- Upgraded to latest Kaitai struct definitions for rekordbox database decoding.
  Thank you [@brunchboy](https://github.com/brunchboy).

## [v0.4.0] - 2021-02-01

### Fixed

- Bind announcement to the configured interface. This corrects an issue where
  prolink connect could fail to correctly connect to the CDJs when the OS's
  routing table did not correctly route the announce broadcast packets.

- Disconnect all sockets when calling `disconnect` on the network.

## [v0.3.0] - 2020-12-03

### Added

- Allow the mixstatus processor to be configured.

## [v0.2.0] - 2020-11-18

### Added

- Introduced a method to play and cue CDJs.

- Device manager has learned `getDeviceEnsured`, which will wait until the
  device appears on the network before resolving. Useful for when you know a
  device should be on the network, but maybe has not yet announced itself

- Use `getDeviceEnsured` when querying the aggregate database. This will help
  with situations where a device reports having a track loaded from a device
  which has not yet announced itself on the network.

- A new `prolink-connect/lib/types` file is available, which only exports types
  and enums, and does NOT require any runtime dependencies. This may be useful
  when you want to use prolink-connect types in a frontend application, and do
  not want to accidentally bundle various node.js dependencies into your app.

  This specifically will fix an issue where `@sentry/node` was being bundled
  into frontend apps.

### Changed

- Expose the mixstatus processor as a service getter on the Network object.
  This makes it easier to share a single instance of the mixstatus processor
  within an app.

- Remove the `mikro-orm` dependency. We now directly use SQLite to cache pdb
  databases locally.

### Fixed

- Fixed various false-positive now-playing repostings with the mixstatus
  processor, along with some missing now-playing events.

  This removes a _huge_ dependency from the library, and makes consumption
  significantly easier if you plan to bundle your application.

  There should be no API changes because of this.

- Fixed a minor bug in trackTypeNames mapping.

- Avoid hard errors on failed artwork lookups.

## [v0.1.0] - 2020-06-23

### Fixed

- Fixed a bug in mixstatus when ending a track by taking the deck off-air and
  then cueing before it finished determining if the off-air action passed the
  number of interrupt beats, causing the track to incorrectly NOT be cleared
  from having been marked as having reported itself as playing.

## [v0.1.0-prerelease.21] - 2020-06-17

### Added

- Initial working implementation. This is currently being used to re-implement
  [prolink-tools](https://github.com/evanpurkhiser/prolink-tools).
