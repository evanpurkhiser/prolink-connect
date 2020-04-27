import dgram from 'dgram-as-promised';

import {ANNOUNCE_PORT, VIRTUAL_CDJ_NAME} from 'src/constants';
import {deviceFromPacket, getMatchingInterface, getBroadcastAddress} from 'src/utils';
import {Device, DeviceType, TrackSlot, TrackType} from 'src/types';
import {packetToStatus} from 'src/status';
import {RemoteDatabase, MenuTarget} from 'src/remotedb';
import {Request} from 'src/remotedb/message/types';
import {getVirtualCDJ, makeAnnouncePacket} from 'src/vcdj';

export async function setupConnections() {
  const announceSocket = dgram.createSocket('udp4');
  await announceSocket.bind(ANNOUNCE_PORT, '0.0.0.0');
  announceSocket.setBroadcast(true);

  const firstDeviceSeen = new Promise<Device>(markFirstDevice =>
    announceSocket.socket.on('message', packet => {
      const device = deviceFromPacket(packet);

      if (device.name === VIRTUAL_CDJ_NAME) {
        return;
      }

      if (device.type === DeviceType.CDJ) {
        markFirstDevice(device);
      }
    })
  );

  const statusSocket = dgram.createSocket('udp4');
  await statusSocket.bind(50002, '0.0.0.0');

  const firstDevice = await firstDeviceSeen;

  console.log(firstDevice);

  const iface = getMatchingInterface(firstDevice.ip);
  if (iface === null) {
    throw new Error('Unable to determine network interface');
  }
  const vcdj = getVirtualCDJ(iface, 0x01);

  setInterval(() => {
    const announcePacket = makeAnnouncePacket(vcdj);

    announceSocket.send(announcePacket, 50000, getBroadcastAddress(iface));
  }, 1000);

  statusSocket.socket.on('message', d => {
    //console.log(packetToStatus(d));
  });

  const dm = new RemoteDatabase(vcdj);
  console.log('connecting...');

  await dm.connectToDevice(firstDevice);
  console.log('connected');

  const queryDescriptor = {
    hostDevice: vcdj,
    targetDevice: firstDevice,
    trackSlot: TrackSlot.USB,
    trackType: TrackType.RB,
    menuTarget: MenuTarget.Main,
  };

  const test = await dm.query({
    queryDescriptor,
    query: Request.GetMetadata,
    args: {trackId: 1},
  });

  console.log(test);

  return firstDevice;
}
