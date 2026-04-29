import {mockDevice} from 'tests/utils';

import type {Socket} from 'dgram';
import {EventEmitter} from 'events';

import {VIRTUAL_CDJ_NAME} from 'src/constants';
import DeviceManager from 'src/devices';
import {deviceFromPacket} from 'src/devices/utils';

vi.mock('src/devices/utils', () => ({
  deviceFromPacket: vi.fn(),
}));

const dfpMock = vi.mocked(deviceFromPacket);

vi.useFakeTimers();

describe('DeviceManager', () => {
  const mockSocket = new EventEmitter() as Socket;

  it('produces device lifecycle events', () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});

    const announceFn = vi.fn();
    dm.on('announced', announceFn);

    const connectedFn = vi.fn();
    dm.on('connected', connectedFn);

    const disconnectedFn = vi.fn();
    dm.on('disconnected', disconnectedFn);

    // Mocked message value
    const deadBeef = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    const deviceExample = mockDevice();

    dfpMock.mockReturnValue(deviceExample);

    // Trigger device announcement
    mockSocket.emit('message', deadBeef);

    expect(deviceFromPacket).toHaveBeenCalledWith(deadBeef);
    expect(connectedFn).toHaveBeenCalledWith(deviceExample);
    expect(announceFn).toHaveBeenCalledWith(deviceExample);
    expect(dm.devices.size).toBe(1);
    expect(dm.devices.get(1)).toBe(deviceExample);

    // Reset our emitter mocks for the next announcement
    announceFn.mockClear();
    connectedFn.mockReset();

    // Move forward 75ms, the device should not have timed out yet
    vi.advanceTimersByTime(75);

    // Trigger device announcement
    mockSocket.emit('message', deadBeef);

    expect(connectedFn).not.toHaveBeenCalled();
    expect(announceFn).toHaveBeenCalledWith(deviceExample);

    // Device is still kept alive, as it has not expired since its last
    // announcement
    vi.advanceTimersByTime(75);

    // Device will now timeout
    vi.advanceTimersByTime(25);
    expect(disconnectedFn).toHaveBeenCalledWith(deviceExample);
    expect(dm.devices.size).toBe(0);

    // Reconfigure for longer timeout
    dm.reconfigure({deviceTimeout: 500});

    // Device reconnects and emits a new connection event
    connectedFn.mockReset();
    mockSocket.emit('message', deadBeef);

    expect(connectedFn).toHaveBeenCalledWith(deviceExample);

    disconnectedFn.mockReset();

    // Device will not timeout with reconfigured timeout
    vi.advanceTimersByTime(400);
    expect(disconnectedFn).not.toHaveBeenCalled();

    // Device will now timeout
    vi.advanceTimersByTime(100);
    expect(disconnectedFn).toHaveBeenCalledWith(deviceExample);
  });

  it('does not announce invalid announce packets', () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});

    const announceFn = vi.fn();
    dm.on('announced', announceFn);

    dfpMock.mockReturnValue(null);

    // Trigger device announcement
    mockSocket.emit('message', Buffer.of());

    expect(announceFn).not.toHaveBeenCalled();
    expect(dm.devices.size).toBe(0);
  });

  it('does not announce or track virtual CDJ announcements', () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});

    const announceFn = vi.fn();
    dm.on('announced', announceFn);

    const deviceExample = mockDevice({name: VIRTUAL_CDJ_NAME});

    dfpMock.mockReturnValue(deviceExample);

    // Trigger device announcement
    mockSocket.emit('message', Buffer.of());

    expect(announceFn).not.toHaveBeenCalled();
    expect(dm.devices.size).toBe(0);
  });

  it('waits for a device to appear using getDeviceEnsured', async () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});

    const deviceExample = mockDevice();
    const gotDevice = dm.getDeviceEnsured(1);

    vi.advanceTimersByTime(75);

    dfpMock.mockReturnValue(deviceExample);

    // Trigger device announcement
    mockSocket.emit('message', Buffer.of());

    await expect(gotDevice).resolves.toBe(deviceExample);
  });

  it('timesout when waiting for device using getDeviceEnsured', async () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});

    const gotDevice = dm.getDeviceEnsured(1, 150);

    vi.advanceTimersByTime(150);
    await expect(gotDevice).resolves.toBe(null);
  });

  it('immedaitely returns a device when it already exists using getDeviceEnsured', async () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});
    const deviceExample = mockDevice();
    dfpMock.mockReturnValue(deviceExample);
    mockSocket.emit('message', Buffer.of());

    await expect(dm.getDeviceEnsured(1, 100)).resolves.toBe(deviceExample);
  });
});
