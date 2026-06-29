---
name: verify-firmware-with-jlink
description: Build, flash, debug, and verify ZMK module firmware on real hardware through a SEGGER J-Link debugger, including nRF52840 targets built with `west zmk-build --debug-jlink`, debugger probe checks, RTT diagnostics, and custom ZMK Studio RPC smoke tests through the module's own web CLI. Use when Codex needs to confirm firmware actually runs on a connected board or document hardware verification evidence.
---

# Verify Firmware With J-Link

Use this skill to prove that a ZMK module firmware works on attached hardware, not only in unit/build
tests. Keep module-specific RPC encoding and expected responses in the module itself, preferably in a
Node CLI under `web/` that shares code with the web UI.

## Workflow

1. Inspect the repo first. Confirm the build config directory, artifact names, board/shield target,
   firmware output path, RPC subsystem identifier, and available `web/` CLI commands.
2. Build the firmware with J-Link debug support:
   ```bash
   west zmk-build <zmk-config-dir> --debug-jlink
   ```
   If the build output is outside the writable workspace root, request escalation before running it.
3. Flash through J-Link with the generated `zmk.elf` or `zephyr.hex`, then reset and resume the target.
4. Prove debugger access by resetting, halting, reading registers, and resuming with `JLinkExe`.
5. Exercise custom Studio RPC through the module's project-owned CLI, not through browser-only UI:
   ```bash
   cd web
   npm run cli -- sample --port <target-studio-port>
   ```
6. Include an edge-case RPC request with a bounded large payload when the module supports it. Treat a
   timeout, disconnect, reboot, missing response, or Zephyr stack fault after that request as a
   failure even if the small request passed.
7. Report the build command, artifact used, J-Link probe result, Studio port selection, subsystem
   found at runtime, decoded RPC response, large payload size/checksum when applicable, and any
   hardware limitation observed.

## Debugging Notes

- Use `references/jlink.md` for generic J-Link command scripts and nRF52840 options.
- Studio serial uses baud `12500`.
- Custom subsystem indices are runtime values. Always list subsystems and find the identifier before
  sending a custom call.
- Keep large-payload checks within the firmware's configured RX/payload bounds.
- `west zmk-build --debug-jlink` enables RTT console/shell for J-Link. Treat RPC responses and J-Link
  probe results as the primary pass/fail signals unless the module explicitly relies on RTT logs.
- If `JLinkExe` reports that it cannot connect, check whether another process is using the probe, then retry with escalation because USB debugger access may be blocked by the sandbox.
- J-Link SWD access does not carry the Studio serial transport. For RPC verification, the target firmware must expose its own USB CDC Studio port to the host. J-Link OB CDC ports may enumerate as serial devices but still time out because they are debugger-side UARTs, not the target's USB Studio endpoint.
- If RPC times out after flashing, wait for USB re-enumeration, list ports with the module's web CLI,
  and retry with `--port <target-studio-port>`.
- If one port answers with unrelated custom subsystems, that is a different ZMK device. Unplug unrelated keyboards or pass the exact target port with `--port`.
