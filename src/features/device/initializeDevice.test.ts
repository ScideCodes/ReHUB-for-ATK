import { expect, it, vi } from "vitest";

it("does not fail while another mouse operation is running", async () => {
  vi.resetModules();
  const session = await import("./deviceSession");
  session.useDeviceSession.setState({ busy: true });
  await expect(session.initializeDevice()).resolves.toBeUndefined();
  session.useDeviceSession.setState({ busy: false });
});
