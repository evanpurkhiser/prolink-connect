<p align="center">
<img src="https://user-images.githubusercontent.com/1421724/81906669-75e9e400-957b-11ea-8f1f-38ca25dd5bed.png" alt="prolink-connect" />
</p>

<h3 align="center">
	Pioneer's PRO DJ LINK protocol, unlocked.
	<br>
	Consume CDJ states + Retrieve complete track metadata.
</h3>

<p align="center">
	<img src="https://github.com/EvanPurkhiser/prolink-connect/workflows/build/badge.svg" alt="build" />
	<a href="https://www.npmjs.com/package/prolink-connect"><img alt="npm" src="https://img.shields.io/npm/v/prolink-connect"></a>
</p>

---

This library implments the Pioneer PROLINK network protocol + additional
functionality to interact with the prolink network.

Used as part of [Prolink Tools](https://prolink.tools/).

## Usage

### Connecting to the network

To talk with Prolink devices on the network you'll first need to...

 1. Bring the network online 
 2. Configure the network to be connected to.
 3. Connect to the devices on the network

```ts
async function main() {
  // Bring the prolink network online.
  //
  // This will begin listening for prolink devices on the network that send
  // regular announcment packets over UDP.
  //
  // This will FAIL if Rekordbox is running on the same computer, or a second
  // instance of the prolink-connect library is running on the same machine.
  console.info('Bringing the network online');
  const network = await bringOnline();

  // Once online we can listen for appearning on the network
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
  // 1. Automatically - You can ask prolink-connect to wait for a device to
  //    appear on the network to determine what network interface devices exist
  //    on. Device ID 5 will be used in auto configure mode.
  //
  // 2. Manually - In this case you will need to manually specify the network
  //    device and device ID.
  //
  // NOTES on the Device ID:
  //
  //  It's recommended that you use a Device ID of `5` for the virtual device.
  //  Using a ID between 1 - 4 will take up ONE SLOT on the network that normally
  //  a CDJ would occupy. When a 1-4 ID is used You may ONLY HAVE 3 CDJs on the
  //  network. Attempting to connect a 4th CDJ will conflict with the virtual
  //  device announced on the network by prolink-connect.
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
  network.connect();

  // If you're using trypescript, you can now type gaurd [0] to coerce the type
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

