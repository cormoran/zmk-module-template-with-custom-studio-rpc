#!/usr/bin/env bash

# BLE (BabbleSim) test runner for this ZMK module.
#
# Adapted from ZMK's app/run-ble-test.sh to work for an out-of-tree module:
# the DUT is built from the workspace ZMK app with this module added via
# -DZMK_EXTRA_MODULES, and test cases live under tests/ble/ in this repo.
#
# A directory is a test case iff it contains nrf52_bsim.keymap. Each case may
# also contain:
#   nrf52_bsim.conf      Kconfig fragment shared by the DUT and peripherals
#   central.conf         Kconfig fragment applied to the DUT (central) only
#   peripheral*.overlay  One split peripheral build per file. Presence of any
#                        such file makes the DUT build a split central.
#   peripheral.conf      Kconfig fragment applied to peripheral builds only
#   siblings.txt         One command line per simulated device (device ids
#                        start at -d=2; -d=0 is the DUT, -d=1 the handbrake)
#   events.patterns      sed -E -n script filtering the combined output log
#   events.snapshot      Expected filtered output
#   pending              If present, a snapshot mismatch is reported as
#                        PENDING instead of FAILED
#
# Requires BSIM_OUT_PATH to point at a compiled BabbleSim tree (Linux only).
# Set ZMK_TESTS_AUTO_ACCEPT=y to (re)generate events.snapshot files.

set -uo pipefail

MODULE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

if [ -z "${1:-}" ]; then
    echo "Usage: $0 <path to testcase under tests/ble, or 'all'>"
    exit 1
fi

if [ -z "${BSIM_OUT_PATH:-}" ]; then
    echo "BSIM_OUT_PATH needs to be set before running this script."
    exit 1
fi

path="$1"
if [ "$path" = "all" ]; then
    path="$MODULE_DIR/tests/ble"
elif [ ! -e "$path" ] && [ -e "$MODULE_DIR/$path" ]; then
    path="$MODULE_DIR/$path"
fi
path="$(cd "$path" && pwd)"

cd "$MODULE_DIR"

WEST_TOPDIR="$(west topdir)"
if [ "$WEST_TOPDIR" != "$MODULE_DIR" ] && [ "$WEST_TOPDIR" != "$(dirname "$MODULE_DIR")" ]; then
    # Guard against silently picking up an unrelated enclosing west workspace,
    # which would build with a different module/zephyr set than CI.
    echo "WARNING: west topdir is $WEST_TOPDIR, not this module's test workspace." >&2
    echo "Initialize one first (see README 'Setup for running test')." >&2
fi
ZMK_APP="$(west list -f '{abspath}' zmk)/app"
if [ -z "$ZMK_APP" ]; then
    echo "Could not find the 'zmk' project in the west workspace." >&2
    exit 1
fi
BUILD_ROOT="$WEST_TOPDIR/build/ble"

mkdir -p "$BUILD_ROOT"

build_app() {
    # build_app <build subdir> <source dir> <installed exe name> [extra cmake args...]
    local build_dir="$BUILD_ROOT/$1"
    local src_dir="$2"
    local exe_name="$3"
    shift 3

    if [ ! -e "$build_dir" ]; then
        west build -d "$build_dir" -b nrf52_bsim "$src_dir" -- "$@" > "$build_dir.build.log" 2>&1
    else
        west build -d "$build_dir" > "$build_dir.build.log" 2>&1
    fi

    if [ $? -gt 0 ]; then
        echo "FAILED: building $src_dir (see $build_dir.build.log)"
        exit 1
    fi

    cp "$build_dir/zephyr/zephyr.exe" "${BSIM_OUT_PATH}/bin/$exe_name"
}

if [ -z "${BLE_TESTS_NO_CENTRAL_BUILD:-}" ]; then
    # The generic BLE host ("computer") simulator from ZMK, subscribing to HID
    # reports, plus this module's Studio RPC host speaking the Studio RPC
    # protocol over the ZMK Studio GATT service.
    build_app central "$ZMK_APP/tests/ble/central" ble_test_central.exe
    build_app studio_rpc_central "$MODULE_DIR/tests/ble/studio_rpc_central" studio_rpc_central.exe
fi

testcases=$(find "$path" -name nrf52_bsim.keymap -exec dirname \{\} \; | sort)
num_cases=$(echo "$testcases" | wc -l)
if [ "$num_cases" -gt 1 ] || [ "$testcases" != "$path" ]; then
    echo "$testcases"
    mkdir -p "$BUILD_ROOT/tests"
    : > "$BUILD_ROOT/tests/pass-fail.log"
    err=0
    for testcase in $testcases; do
        BLE_TESTS_NO_CENTRAL_BUILD=y "$0" "$testcase" || err=1
    done
    sort -k2 "$BUILD_ROOT/tests/pass-fail.log"
    exit $err
fi

testcase="$path"
case_rel="${testcase#"$MODULE_DIR/tests/ble/"}"
case_build="$BUILD_ROOT/$case_rel"
mkdir -p "$case_build" "$BUILD_ROOT/tests"
echo "Running $case_rel:"

# Executable names inside $BSIM_OUT_PATH/bin, referenced from siblings.txt
exe_name="tmpl_ble_${case_rel//\//_}"

extra_central_args=()
if [ -e "$testcase/central.conf" ]; then
    extra_central_args+=("-DEXTRA_CONF_FILE=$testcase/central.conf")
fi
extra_peripheral_args=()
if [ -e "$testcase/peripheral.conf" ]; then
    extra_peripheral_args+=("-DEXTRA_CONF_FILE=$testcase/peripheral.conf")
fi

shopt -s nullglob
for file in "$testcase"/peripheral*.overlay; do
    pn=$(basename -s .overlay "$file")
    west build -d "$case_build/$pn" -b nrf52_bsim//zmk_test_mock "$ZMK_APP" -- \
        -DZMK_CONFIG="$testcase" \
        -DZMK_EXTRA_MODULES="$MODULE_DIR" \
        -DEXTRA_DTC_OVERLAY_FILE="$file" \
        "${extra_peripheral_args[@]}" > "$case_build/$pn.build.log" 2>&1

    if [ $? -gt 0 ]; then
        echo "FAILED: $case_rel peripheral $pn did not build (see $case_build/$pn.build.log)" | tee -a "$BUILD_ROOT/tests/pass-fail.log"
        exit 1
    fi
done
shopt -u nullglob

if ls "$testcase"/peripheral*.overlay > /dev/null 2>&1; then
    echo "Found peripheral overlays, building the test as a split central"
    extra_central_args+=("-DCONFIG_ZMK_SPLIT_ROLE_CENTRAL=y")
fi

west build -d "$case_build/dut" -b nrf52_bsim//zmk_test_mock "$ZMK_APP" -- \
    -DZMK_CONFIG="$testcase" \
    -DZMK_EXTRA_MODULES="$MODULE_DIR" \
    "${extra_central_args[@]}" > "$case_build/dut.build.log" 2>&1
if [ $? -gt 0 ]; then
    echo "FAILED: $case_rel did not build (see $case_build/dut.build.log)" | tee -a "$BUILD_ROOT/tests/pass-fail.log"
    exit 1
fi

if [ -n "${BLE_TESTS_QUIET_OUTPUT:-}" ]; then
    output_dev="/dev/null"
else
    output_dev="/dev/stdout"
fi

cp "$case_build/dut/zephyr/zmk.exe" "${BSIM_OUT_PATH}/bin/${exe_name}"

shopt -s nullglob
for file in "$testcase"/peripheral*.overlay; do
    pn=$(basename -s .overlay "$file")
    cp "$case_build/$pn/zephyr/zmk.exe" "${BSIM_OUT_PATH}/bin/${exe_name}_${pn}.exe"
done
shopt -u nullglob

rm -f "$case_build/output.log"

sibling_counts=$(wc -l < "$testcase/siblings.txt")

pushd "${BSIM_OUT_PATH}/bin" > /dev/null 2>&1

"./${exe_name}" -d=0 -s="${exe_name}" | tee -a "$case_build/output.log" > "${output_dev}" &
./bs_device_handbrake -s="${exe_name}" -d=1 -r=10 > "${output_dev}" &

while IFS= read -r line; do
    ${line} -s="${exe_name}" | tee -a "$case_build/output.log" > "${output_dev}" &
done < "$testcase/siblings.txt"

./bs_2G4_phy_v1 -s="${exe_name}" -D=$((2 + sibling_counts)) -sim_length=50e6 > "${output_dev}" 2>&1

popd > /dev/null 2>&1

# Group lines by device (stable sort keeps each device's own order) before
# filtering: the combined log interleaves devices in wall-clock order, which
# is not deterministic across runs, while each device's own stream is.
sort -s -t ':' -k 1,1 "$case_build/output.log" |
    sed -E -n -f "$testcase/events.patterns" > "$case_build/filtered_output.log"

diff -auZ "$testcase/events.snapshot" "$case_build/filtered_output.log"
if [ $? -gt 0 ]; then
    if [ -f "$testcase/pending" ]; then
        echo "PENDING: $case_rel" | tee -a "$BUILD_ROOT/tests/pass-fail.log"
        exit 0
    fi

    if [ -n "${ZMK_TESTS_AUTO_ACCEPT:-}" ]; then
        echo "Auto-accepting failure for $case_rel"
        cp "$case_build/filtered_output.log" "$testcase/events.snapshot"
    else
        echo "FAILED: $case_rel" | tee -a "$BUILD_ROOT/tests/pass-fail.log"
        exit 1
    fi
fi

echo "PASS: $case_rel" | tee -a "$BUILD_ROOT/tests/pass-fail.log"
exit 0
