import {mockDevice} from 'tests/utils';

import type {Socket} from 'node:dgram';
import {EventEmitter} from 'node:events';

import {VIRTUAL_CDJ_NAME} from 'src/constants';
import DeviceManager from 'src/devices';
import {deviceFromPacket} from 'src/devices/utils';

vi.mock('src/devices/utils', () => ({
  deviceFromPacket: vi.fn(),
}));

const dfpMock = vi.mocked(deviceFromPacket);

vi.useFakeTimers();

const announcement = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

function watchLifecycle(manager: DeviceManager) {
  const announced = vi.fn();
  const connected = vi.fn();
  const disconnected = vi.fn();

  manager.on('announced', announced);
  manager.on('connected', connected);
  manager.on('disconnected', disconnected);

  return {announced, connected, disconnected};
}

describe('DeviceManager', () => {
  const mockSocket = new EventEmitter() as Socket;

  it('produces device lifecycle events', () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});

    const {
      announced: announceFn,
      connected: connectedFn,
      disconnected: disconnectedFn,
    } = watchLifecycle(dm);

    const deviceExample = mockDevice();

    dfpMock.mockReturnValue(deviceExample);

    // Trigger device announcement
    mockSocket.emit('message', announcement);

    expect(deviceFromPacket).toHaveBeenCalledWith(announcement);
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
    mockSocket.emit('message', announcement);

    expect(connectedFn).not.toHaveBeenCalled();
    expect(announceFn).toHaveBeenCalledWith(deviceExample);

    // Device is still kept alive, as it has not expired since its last
    // announcement
    vi.advanceTimersByTime(75);

    // Device will now timeout
    vi.advanceTimersByTime(25);
    expect(disconnectedFn).toHaveBeenCalledWith(deviceExample);
    expect(dm.devices.size).toBe(0);
  });

  it('uses the new timeout when a disconnected device returns', () => {
    const socket = new EventEmitter() as Socket;
    const dm = new DeviceManager(socket, {deviceTimeout: 100});
    const {connected, disconnected} = watchLifecycle(dm);
    const device = mockDevice();
    dfpMock.mockReturnValue(device);

    socket.emit('message', announcement);
    vi.advanceTimersByTime(100);
    expect(disconnected).toHaveBeenCalledWith(device);

    dm.reconfigure({deviceTimeout: 500});
    connected.mockClear();
    disconnected.mockClear();
    socket.emit('message', announcement);
    expect(connected).toHaveBeenCalledWith(device);

    vi.advanceTimersByTime(400);
    expect(disconnected).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(disconnected).toHaveBeenCalledWith(device);
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

  it('immediately returns a device when it already exists using getDeviceEnsured', async () => {
    const dm = new DeviceManager(mockSocket, {deviceTimeout: 100});
    const deviceExample = mockDevice();
    dfpMock.mockReturnValue(deviceExample);
    mockSocket.emit('message', Buffer.of());

    await expect(dm.getDeviceEnsured(1, 100)).resolves.toBe(deviceExample);
  });
});
