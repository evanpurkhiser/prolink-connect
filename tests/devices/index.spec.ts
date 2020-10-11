import {Socket} from 'dgram';
import DeviceManager from 'src/devices';

describe('DeviceManager', () => {
  it('Fires a `connected` event when a device is first annoucned', async () => {
    const mockSocket = new Socket();

    const dm = new DeviceManager(mockSocket);

    mockSocket.on;
  });

  return;
});
