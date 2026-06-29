# J-Link Notes For ZMK Modules

Use these notes when adapting hardware verification to a ZMK module. Keep module-specific artifact
names, subsystem identifiers, and expected RPC payloads in the module's own code or web CLI.

## Build

Build hardware firmware with debugger support:

```bash
west zmk-build <zmk-config-dir> --debug-jlink
```

Use module-specific `--artifact-filter` and `--parallelism` options when the repo already uses them.
Confirm the generated build directory under the west top directory before flashing.

## Flash

Flash the generated ELF or HEX with `JLinkExe`. Prefer the ELF when available so symbols remain useful
for debugging.

```text
r
halt
loadfile <build-dir>/zephyr/zmk.elf
r
g
exit
```

Typical nRF52840 options:

```bash
JLinkExe -device nRF52840_xxAA -if SWD -speed 4000 -autoconnect 1 -CommanderScript <script>
```

## Probe

After flashing, prove the debugger can still control the target:

```text
r
halt
regs
g
exit
```

Treat a successful probe as evidence that SWD access, target voltage, reset, and core control are
working. It does not prove that the target USB Studio serial endpoint is available.

## RTT

`west zmk-build --debug-jlink` enables RTT console/shell options. RTT logs can still be sparse if the
module or dependency disables the RTT log backend. Use RTT as additional evidence, not the only pass
condition.

## Studio RPC

J-Link SWD is separate from ZMK Studio RPC. Custom RPC verification still needs the target firmware to
expose a Studio transport such as USB CDC. J-Link OB serial ports may enumerate as host serial devices
but can be debugger-side UARTs rather than the target Studio endpoint.

Prefer a project-owned Node CLI in `web/` for custom RPC because it can share the web UI's generated
protobuf types and the `@zmkfirmware/zmk-studio-ts-client` framing/custom-call implementation.
