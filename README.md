A Typescript / JavaScript library that is able to talk to AlphaTheta ProDJLink enabled DJ equipment

<p align="center">
<img src=".github/logo.svg" alt="alphatheta-connect" />
</p>

<h3 align="center">
	AlphaTheta's PRO DJ LINK protocol, unlocked.
	<br>
	Consume CDJ states + Retrieve complete track metadata.
</h3>

<p align="center">
	<img src="https://github.com/chrisle/alphatheta-connect/workflows/build/badge.svg" alt="build" />
	<a href="https://www.npmjs.com/package/alphatheta-connect"><img alt="npm" src="https://img.shields.io/npm/v/alphatheta-connect"></a>
</p>

---

This library implements the AlphaTheta PROLINK network protocol + additional
functionality to interact with the prolink network. This library is used as
part of [Prolink Tools](https://prolink.tools/).

Alternative implementations of the Prolink protocol: [Java](https://github.com/Deep-Symmetry/beat-link), [golang](https://github.com/evanpurkhiser/prolink-go).

## Features

- **Support for AlphaTheta Opus Quad, XDJ-RX3, XDJ-RX2, XDJ-RX, and XDJ-XZ** *(new)* -
  Passive mode monitoring via pcap-based packet capture for all-in-one controllers
  where traditional virtual CDJ connection isn't possible.
  See [ALL_IN_ONE_UNITS.md](docs/ALL_IN_ONE_UNITS.md) for details.

- **OneLibrary Support** *(new)* - Full support for rekordbox 7.x's new OneLibrary
  format (exportLibrary.db) with SQLCipher encryption, including tracks, playlists,
  cues, hot cue banks, myTags, and history.

- **6-Channel On-Air Support** - Full support for 6-channel configurations with
  CDJ-3000, CDJ-3000x, and DJM-V10 mixers.
  See [ON_AIR_CHANNELS.md](docs/ON_AIR_CHANNELS.md) for details.

- **Artwork Extraction via NFS** - Extract album artwork directly from audio files
  on connected media via the NFS protocol.

- **Configurable Virtual CDJ Name** - Customize the name that appears on the network
  for your virtual CDJ device.

- **Optional Full DJ Link Startup Protocol** - Enable the complete startup handshake
  sequence for better compatibility with certain device configurations.
  See [FULL_STARTUP.md](docs/FULL_STARTUP.md) for details.

- **Extended ANLZ Support** - Full support for rekordbox analysis files including:
  - Extended cues with RGB colors and comments (PCO2)
  - Song structure / phrase analysis for CDJ-3000 (PSSI)
  - Multiple waveform formats (PWAV, PWV2, PWV3, PWV4, PWV5)
  - See [EXTENDED_ANLZ.md](docs/EXTENDED_ANLZ.md) for details

- **CDJ-3000 Features** - Complete support for CDJ-3000 specific features:
  - Absolute position tracking (30ms updates)
  - Compatible startup packets for devices on channels 5-6
  - See [ABSOLUTE_POSITION.md](docs/ABSOLUTE_POSITION.md) for details

- **Written in Typescript** - Accurate typings making implementation a breeze.
  Autocompete your DJ tools to completion.

- **CDJ Status** - Receive Player state details for each CDJ on the network.
  The status is reported as a [`CDJStatus.State`](https://connect.prolink.tools/modules/_src_status_types_.html).

- **Metadata Database** - Access metadata of currently the currently playing
  (or not!) tracks stored in the connected Rekordbox formatted USB / SD
  device, or via Rekordbox link.

- **Opt-in Telemetry** - Optional error reporting via Sentry to help improve the
  library (disabled by default, configurable via environment variable).

## Library usage

### Connecting to the network

To talk with Prolink devices on the network you'll first need to...

1.  Bring the network online
2.  Configure the network to be connected to.
3.  Connect to the devices on the network

```ts
import {bringOnline} from 'alphatheta-connect';

async function main() {
  // Bring the prolink network online.
  //
  // This will begin listening for prolink devices on the network that send
  // regular announcement packets over UDP.
  //
  // This will FAIL if Rekordbox is running on the same computer, or a second
  // instance of the alphatheta-connect library is running on the same machine.
  console.info('Bringing the network online');
  const network = await bringOnline();

  // Once online we can listen for appearing on the network
  network.deviceManager.on('connected', device =>
    console.log('New device on network:', device)
  );

  // To configure the online network to be "connected" we must need to specify
  // what network device to use to announce ourselves as a "virtual" device
  // onto the network, and what ID we want to announce ourselves as. By
  // announcing ourselves this will cause other devices to send us more detailed
  // information.
  //
  // There are two ways to configure the network:
  //
  // 1. Automatically - You can ask alphatheta-connect to wait for a device to
  //    appear on the network to determine what network interface devices exist
  //    on. Device ID 5 will be used in auto configure mode.
  //
  // 2. Manually - In this case you will need to manually specify the network
  //    device and device ID.
  //
  // NOTES on the Device ID:
  //
  //  It's recommended that you use a Device ID of `5` for the virtual device.
  //  Using a ID between 1 - 6 will take up ONE SLOT on the network that normally
  //  a CDJ would occupy. When a 1-6 ID is used You may ONLY HAVE 5 CDJs on the
  //  network. Attempting to connect a 6th CDJ will conflict with the virtual
  //  device announced on the network by alphatheta-connect. (On models older than
  //  2000s the rande is 1-4.)
  //
  //  There are some cases where you may want your virtual device to announce
  //  itself with "real" device ID, but this library does not currently support
  //  the scenarios that would requrie that (Becoming master and sending a master
  //  tempo)

  // 1. AUTO CONFIGURATION
  console.info('Auto configuring the network');
  await network.autoconfigFromPeers();

  // 2. MANUAL CONFIGURATION
  //
  // const configuredIface = getNetworkInterfaceInfoIPv4()
  // network.configure({vcdjId: 2, iface: configuredIface})

  // We can now connect to the network.
  //
  // This will begin announcing ourself on the network, as well as enable various
  // services on the network service object.
  console.info('Connecting to the network');
  await network.connect();

  // If you're using trypescript, you can now type guard [0] to coerce the type
  // to ProlinkNetworkConnected, marking all services as non-null.
  //
  // [0]: https://www.typescriptlang.org/docs/handbook/advanced-types.html#using-type-predicates
  //
  // You don't need to do this if you're not using trypescript
  if (!network.isConnected()) {
    console.error('Failed to connect to the network');
    return;
  }
}
```

## Thanks To

- [@evanpurkhiser](https://github.com/evanpurkhiser) - Original author of alphatheta-connect (formerly prolink-connect) and [Prolink Tools](https://prolink.tools/)
- [@brunchboy](https://github.com/brunchboy) - For his incredible work on [dysentery](https://github.com/brunchboy/dysentery) reverse engineering the Pro DJ Link protocol and [beat-link](https://github.com/Deep-Symmetry/beat-link) Java implementation
- [Deep Symmetry](https://github.com/Deep-Symmetry) - For [crate-digger](https://github.com/Deep-Symmetry/crate-digger) and maintaining comprehensive Pro DJ Link protocol documentation
- [@henrybetts](https://github.com/henrybetts) and [@flesniak](https://github.com/flesniak) - For reverse-engineering the rekordbox database format
- [@GreyCat](https://github.com/GreyCat) - For Kaitai Struct expertise and guidance

## Related Projects

- [stagelinq](https://github.com/chrisle/stagelinq) — Denon StageLinq protocol integration
- [metadata-connect](https://github.com/chrisle/metadata-connect) — Audio metadata extraction with partial file reads
- [rekordbox-connect](https://github.com/chrisle/rekordbox-connect) — Rekordbox database integration
- [serato-connect](https://github.com/chrisle/serato-connect) — Serato DJ integration

These libraries power [Now Playing](https://nowplayingapp.com) — a real-time track display app for DJs and streamers.
