const { safeDevices } = require("./policy.cjs");
class DeviceChooser {
  constructor(notify) {
    this.notify = notify;
    this.pending = null;
  }
  start(devices, callback) {
    this.cancel();
    this.pending = { devices: safeDevices(devices), callback };
    this.emit();
  }
  emit() {
    this.notify(this.pending ? this.pending.devices : null);
  }
  add(device) {
    if (!this.pending) return;
    this.pending.devices = this.pending.devices
      .filter((d) => d.deviceId !== device.deviceId)
      .concat(safeDevices([device]));
    this.emit();
  }
  remove(device) {
    if (!this.pending) return;
    this.pending.devices = this.pending.devices.filter(
      (d) => d.deviceId !== device.deviceId,
    );
    this.emit();
  }
  choose(id) {
    if (!this.pending) return false;
    if (id !== "" && !this.pending.devices.some((d) => d.deviceId === id))
      return false;
    const { callback, devices } = this.pending;
    this.pending = null;
    callback(id, devices.find((d) => d.deviceId === id));
    this.emit();
    return true;
  }
  cancel() {
    this.choose("");
  }
}
module.exports = { DeviceChooser };
