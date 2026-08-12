#!/usr/bin/env bash
#
# Paste this into Codex Cloud's environment setup command, or run it from the
# repository root with: bash .codex/setup-codex-cloud.sh
#
# This mirrors the ZMK toolchain setup used by GitHub Copilot and the
# devcontainer, but does not install interactive coding-agent CLIs.
set -euo pipefail

ZEPHYR_SDK_VERSION="${ZEPHYR_SDK_VERSION:-0.17.0}"
ZEPHYR_SDK_DIR="${ZEPHYR_SDK_DIR:-$HOME/zephyr-sdk-${ZEPHYR_SDK_VERSION}}"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! command -v sudo >/dev/null; then
    echo "This setup script requires sudo to install system packages." >&2
    exit 1
fi

echo "==> Installing system packages"
sudo apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git cmake ninja-build gperf ccache dfu-util device-tree-compiler wget curl \
    python3-dev python3-pip python3-setuptools python3-tk python3-wheel xz-utils \
    file make gcc gcc-multilib g++-multilib libsdl2-dev libmagic1

echo "==> Installing Python tools"
python3 -m pip install --user --upgrade west pyelftools grpcio-tools pre-commit
export PATH="$HOME/.local/bin:$PATH"
path_export='export PATH="$HOME/.local/bin:$PATH"'
if ! grep -qsF "$path_export" "$HOME/.bashrc"; then
    printf '%s\n' "$path_export" >>"$HOME/.bashrc"
fi

echo "==> Installing Zephyr SDK ${ZEPHYR_SDK_VERSION}"
if [ ! -x "$ZEPHYR_SDK_DIR/setup.sh" ]; then
    archive="zephyr-sdk-${ZEPHYR_SDK_VERSION}_linux-x86_64.tar.xz"
    download_dir="$(mktemp -d)"
    trap 'rm -rf "$download_dir"' EXIT

    wget -q -P "$download_dir" \
        "https://github.com/zephyrproject-rtos/sdk-ng/releases/download/v${ZEPHYR_SDK_VERSION}/${archive}"
    wget -q -O "$download_dir/sha256.sum" \
        "https://github.com/zephyrproject-rtos/sdk-ng/releases/download/v${ZEPHYR_SDK_VERSION}/sha256.sum"
    (
        cd "$download_dir"
        sha256sum --check --ignore-missing sha256.sum
    )
    tar -C "$(dirname "$ZEPHYR_SDK_DIR")" -xf "$download_dir/$archive"
fi
"$ZEPHYR_SDK_DIR/setup.sh" -h -c -t arm-zephyr-eabi
export ZEPHYR_SDK_INSTALL_DIR="$ZEPHYR_SDK_DIR"

echo "==> Initializing the West workspace"
git config --global --add safe.directory "$repo_root"
bash scripts/setup_workspace.sh

echo "==> Installing web dependencies and Git hooks"
npm --prefix web ci
pre-commit install

echo "==> Verifying the toolchain"
west zmk-build tests/zmk-config -n

echo "Codex Cloud environment is ready."
