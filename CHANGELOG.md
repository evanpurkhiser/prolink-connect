# Changelog

All notable changes to prolink-connect will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## Unreleased

- Fixed a typo in `ItemType.OriginalArtist` (was mispelled as `OrigianlArtist`)

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

- `reportRequresSilence` has been removed

- A new `mode` option has been introduced that configures how the mixstatus
  processor will generally determine when a track change has happened. The
  `ReportingMode` defines: `SmartTiming` (the default), `WaitsForSilence`
  (the replacement for `reportRequresSilence`), and a new `FollowsMaster`
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

[unreleased]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.11.0...HEAD
[v0.11.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.10.0...v0.11.0
[v0.10.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.9.0...v0.10.0
[v0.9.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.8.1...v0.9.0
[v0.8.1]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.8.0...v0.8.1
[v0.8.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.7.2...v0.8.0
[v0.7.2]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.7.1...v0.7.2
[v0.7.1]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.7.0...v0.7.1
[v0.7.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.6.0...v0.7.0
[v0.6.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.5.0...v0.6.0
[v0.5.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.4.0...v0.5.0
[v0.4.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.3.0...v0.4.0
[v0.3.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.1.0-prerelease.21...v0.1.0
[v0.1.0-prerelease.21]: https://github.com/evanpurkhiser/prolink-connect/compare/ef4b95d...v0.1.0-prerelease.21
