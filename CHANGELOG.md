# Changelog

All notable changes to prolink-connect will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet

## [0.4.0] - 2021-02-01

### Fixed

- Bind announcement to the configured interface. This corrects an issue where
  prolink connect could fail to correctly to the CDJs when the OS's routing
  table did not correctly route the announce broadcast packets.

- Disconnect all sockets when calling `disconnect` on the network.

## [v0.3.0] - 2020-12-03

### Added

- Allow the mixstatus processor to be configured.

## [v0.2.0] - 2020-11-18

### Added

- Introduced a method to play and cue CDJs.

- Device manager has learned `getDeviceEnsured`, which will wait until the
  device appears on the network before resolving. Useful for when you know a
  device should be on the netowrk, but maybe has not yet announced itself

- Use `getDeviceEnsured` when querying the aggregate database. This will help
  with situations where a device reports having a track loaded from a device
  which has not yet announced itself on the network.

- A new `prolink-connect/lib/types` file is available, which only exports types
  and enums, and does NOT rquire any runtime dependencies. This may be useful
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

- Fixed various false-positive now-playing reportings with the mixstatus
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
  number of interupt beats, causing the track to incorrectly NOT be cleared
  from having been marked as having reported itself as playing.

## [v0.1.0-prerelease.21] - 2020-06-17

### Added

- Initial working implementation. This is currently being used to re-implement
  [prolink-tools](https://github.com/evanpurkhiser/prolink-tools).

[Unreleased]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.4.0...HEAD
[v0.4.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.3.0...v0.4.0
[v0.3.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.2.0...v0.3.0
[v0.2.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.1.0...v0.2.0
[v0.1.0]: https://github.com/evanpurkhiser/prolink-connect/compare/v0.1.0-prerelease.21...v0.1.0
[v0.1.0-prerelease.210.1.0]: https://github.com/evanpurkhiser/prolink-connect/compare/ef4b95d...v0.1.0-prerelease.21
