# ZMK Key Diagnostics Module with Custom Web UI

This repository provides a ZMK module and Web UI to help investigate unstable
or non-working keys. It focuses on charlieplex matrix scans first, surfacing
per-key chatter counts and the associated GPIO pair so you can pinpoint cold
solder joints or hot swap socket issues.

The firmware uses the **unofficial** custom ZMK Studio RPC protocol, and the
frontend renders the physical layout plus diagnostic metrics for each key.

## Features

- Per-key press/release counters and chatter detection window tracking.
- GPIO mapping for charlieplex matrices (row/column == drive/sense pins).
- Physical key layout visualization using ZMK Studio physical layouts.
- Interactive UI to highlight suspect keys and inspect details.

## Setup

You can use this zmk-module with the below setup.

1. Add dependency to your `config/west.yml`.

   ```yaml:config/west.yml
   # Please update with your account and repository name after creating this repository
   manifest:
   remotes:
       ...
       - name: cormoran
       url-base: https://github.com/cormoran
   projects:
       ...
       - name: zmk-module-template-with-custom-studio-rpc
       remote: cormoran
       revision: main # or latest commit hash
       # import: true # if this module has other dependencies
       ...
       # Below setting required to use unofficial studio custom PRC feature
       - name: zmk
       remote: cormoran
       revision: v0.3+custom-studio-protocol
       import:
           file: app/west.yml
   ```

1. Enable flag in your `config/<shield>.conf`

   ```conf:<shield>.conf
   # Enable key diagnostics
   CONFIG_ZMK_KEY_DIAGNOSTICS=y

   # Optionally enable studio custom RPC features
   CONFIG_ZMK_STUDIO=y
   CONFIG_ZMK_KEY_DIAGNOSTICS_STUDIO_RPC=y

   # Optional: tune chatter window (ms)
   # CONFIG_ZMK_KEY_DIAGNOSTICS_CHATTER_WINDOW_MS=40
   ```

1. Ensure your keyboard defines a physical layout and matrix transform (required for ZMK Studio).

1. For charlieplex matrices, keep using the standard ZMK definitions:
   - `compatible = "zmk,kscan-gpio-charlieplex";`
   - `gpios` list in the order used by your matrix transform (row/col).
   - A matrix transform that maps `(row, col)` pairs to key positions.

## Diagnostics Protocol

The custom RPC schema lives at:

- proto: `proto/zmk/key_diagnostics/custom.proto` and `custom.options`
- handler: `src/studio/custom_handler.c`

The protocol returns per-key diagnostics, physical key geometry, and GPIO
mapping for charlieplex matrices. The response is designed to be extensible to
other kscan drivers in the future.

## Web UI

The web UI lives in `./web` and provides an interactive visualization of the
diagnostic report. It relies on ZMK Studio physical layouts to render key
positions.

### Interpreting Results

- **Chatter detected (red)**: The key toggled state within the configured
  chatter window. This often points to a loose hot swap socket or insufficient
  solder.
- **Imbalanced press/release (amber)**: The counts differ, indicating the
  switch is intermittently dropping events.
- **Stable (gray)**: No chatter and balanced counts.

Use the detail panel to identify the charlieplex GPIO pair (drive/sense pins)
associated with the key and inspect the corresponding solder joints.

## Development Guide

### Setup

There are two west workspace layout options.

#### Option1: Download dependencies in parent directory

This option is west's standard way. Choose this option if you want to re-use dependent projects in other zephyr module development.

```bash
mkdir west-workspace
cd west-workspace # this directory becomes west workspace root (topdir)
git clone <this repository>
# rm -r .west # if exists to reset workspace
west init -l . --mf tests/west-test.yml
west update --narrow
west zephyr-export
```

The directory structure becomes like below:

```
west-workspace
  - .west/config
  - build : build output directory
  - <this repository>
  # other dependencies
  - zmk
  - zephyr
  - ...
  # You can develop other zephyr modules in this workspace
  - your-other-repo
```

You can switch between modules by removing `west-workspace/.west` and re-executing `west init ...`.

#### Option2: Download dependencies in ./dependencies (Enabled in dev-container)

Choose this option if you want to download dependencies under this directory (like node_modules in npm). This option is useful for specifying cache target in CI. The layout is relatively easy to recognize if you want to isolate dependencies.

```bash
git clone <this repository>
cd <cloned directory>
west init -l west --mf west-test-standalone.yml
# If you use dev container, start from below commands. Above commands are executed
# automatically.
west update --narrow
west zephyr-export
```

The directory structure becomes like below:

```
<this repository>
  - .west/config
  - build : build output directory
  - dependencies
    - zmk
    - zephyr
    - ...
```

### Dev container

Dev container is configured for setup option2. The container creates below volumes to re-use resources among containers.

- zmk-dependencies: dependencies dir for setup option2
- zmk-build: build output directory
- zmk-root-user: /root, the same to ZMK's official dev container

### Web UI

Please refer [./web/README.md](./web/README.md).

## Test

**ZMK firmware test**

`./tests` directory contains test config for posix to confirm module functionality and config for xiao board to confirm build works.

Tests can be executed by below command:

```bash
# Run all test case and verify results
python -m unittest
```

If you want to execute west command manually, run below. (for zmk-build, the result is not verified.)

```
# Build test firmware for xiao
# `-m tests/zmk-config .` means tests/zmk-config and this repo are added as additional zephyr module
west zmk-build tests/zmk-config/config -m tests/zmk-config .

# Run zmk test cases
# -m . is required to add this module to build
west zmk-test tests -m .
```

**Web UI test**

The `./web` directory includes Jest tests. See [./web/README.md](./web/README.md#testing) for more details.

```bash
cd web
npm test
```

## Publishing Web UI

Github actions are pre-configured to publish web UI to github pages.

1. Visit Settings>Pages
1. Set source as "Github Actions"
1. Visit Actions>"Test and Build Web UI"
1. Click "Run workflow"

Then, the Web UI will be available in
`https://<your github account>.github.io/<repository name>/` like https://cormoran.github.io/zmk-module-template-with-custom-studio-rpc.

## More Info

For more info on modules, you can read through through the
[Zephyr modules page](https://docs.zephyrproject.org/3.5.0/develop/modules.html)
and [ZMK's page on using modules](https://zmk.dev/docs/features/modules).
[Zephyr's west manifest page](https://docs.zephyrproject.org/3.5.0/develop/west/manifest.html#west-manifests)
may also be of use.
