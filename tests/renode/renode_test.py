#!/usr/bin/env python3
"""Hardware-free functional test: boot this module's firmware in the Renode
emulator and exercise its own custom Studio RPC subsystem end to end.

This is the one test file a real module built from this template is
expected to rewrite -- everything generic (booting, the core Studio RPC
GetDeviceInfo round-trip) already ran as the "smoke test" step of the
`zmk-renode-test` GitHub Action (see cormoran/zmk-workspace's
`.github/actions/zmk-renode-test/`) before this file even runs. This file
only needs to know about *this module's own* RPC surface.

How it's wired together (see README.md's "Hardware-free Renode testing"
section for the full story):
  - `ZMK_RENODE_ELF` (env var) points at the firmware ELF the action already
    built with the Renode Studio-RPC-over-UART overlay + transport (real
    hardware normally carries Studio RPC over USB; Renode's USB model is a
    non-functional register stub, so testing under emulation swaps in a
    wired-UART carrier with identical RPC framing -- see zmk-workspace's
    skills/test-zmk-renode/SKILL.md for why).
  - `renode_harness` (a module from that same zmk-workspace checkout) is
    importable via PYTHONPATH -- the action sets this up. It provides
    RenodeSession/boot_single/wait_for_text/proto compiling, so this file
    doesn't need to reimplement any of the Renode-specific plumbing.
  - The custom RPC "envelope": ZMK Studio's `zmk.custom` subsystem is a
    generic pass-through -- a module's own proto messages travel as opaque
    `bytes` inside `zmk.custom.CallRequest.payload`/`CallResponse.payload`,
    addressed by a runtime-assigned `subsystem_index` (see dependencies'
    zmk-studio-messages proto/zmk/custom.proto). This module registers
    itself under the fixed string identifier "your_name__template"
    (src/studio/template_handler.c,
    `ZMK_RPC_CUSTOM_SUBSYSTEM(your_name__template, ...)`), always as the
    first (and, in this stock template, only) registered subsystem, i.e.
    index 0.

*** KNOWN FIRMWARE BUG, discovered by this test suite (2026-07-08) ***
Bringing this test up found a genuine, reproducible bug in the vendored
"custom-studio-protocol" ZMK fork this template depends on (NOT a Renode
artifact -- confirmed with careful byte-paced UART delivery and Renode
CPU-instruction-count sampling to rule out timing/transport causes; see
the zmk-workspace PR that added this test for the full writeup):

  Any Studio RPC response that goes through a *registered* custom
  subsystem's callback-based response encoding
  (`ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER_ALLOCATE` /
  `zmk_rpc_custom_subsystem_encode_response_payload`,
  dependencies/zmk/app/include/zmk/studio/custom.h +
  dependencies/zmk/app/src/studio/custom_subsystem.c) makes the
  `studio_rpc_thread` spin forever inside `rpc_tx_buffer_write`'s
  `ring_buf_put_claim`/`ring_buf_put_finish` loop
  (dependencies/zmk/app/src/studio/rpc.c) -- confirmed via Renode monitor
  `sysbus.cpu ExecutedInstructions` growing at a steady ~5*10^8/s (a genuine
  busy spin, not a blocked/sleeping thread) and `sysbus.cpu PC` sampled
  repeatedly inside `ring_buf_area_claim`/`ring_buf_area_finish`
  (dependencies/zephyr/lib/utils/ring_buffer.c). This reproduces for BOTH
  a real successful SampleResponse *and* this module's own small
  ErrorResponse (the decode-failure path) -- i.e. it is not about response
  size, only about whether a *real* registered subsystem's callback
  encoding path is exercised at all. `custom.call` to a subsystem index
  that does *not* exist takes a different, callback-free "fast path"
  (`meta.simple_error` / RPC_NOT_FOUND) and works fine -- see
  `test_custom_rpc_invalid_index_dispatch` below, which is a genuine,
  affirmative proof the custom-subsystem envelope/dispatch machinery works
  end-to-end (framing, oneof selection, index validation) for everything
  *except* actually returning a real subsystem's response.

This is a template/protocol-level bug, not something introduced by (or
fixable from) this module's own `src/studio/template_handler.c` -- fixing
it means patching vendored `dependencies/zmk/app/src/studio/rpc.c`, which
is out of scope for a module template's own test file. Per this project's
own convention for documented-but-not-chased-further findings (see
zmk-workspace's test-zmk-renode skill, T3/BLE), the real end-to-end round
trip is captured below as a test that asserts the *known failure*
(so a future fix will make it visibly start failing, prompting an update)
rather than silently skipped.

Run locally (from this repo's root, with a west workspace already set up --
see README.md):

    python3 tests/renode/renode_test.py -v

(Named `renode_test.py`, not `test_renode.py`, on purpose: the existing
`python3 -m unittest -v` build-job step at the repo root auto-discovers
every `test*.py`, and this file needs a real firmware ELF + PYTHONPATH the
build job doesn't set up -- keeping it out of that pattern keeps the two
test surfaces independent. The `zmk-renode-test` action instead runs
everything under `tests/renode/` explicitly, with `ZMK_RENODE_ELF` and
PYTHONPATH already set.)

The Renode-testable ELF must already be built; see README.md for the exact
`build_fw.py` invocation, or let the composite action do it in CI.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# renode_harness comes from the zmk-workspace checkout the action provides
# on PYTHONPATH. Support running this file directly too (e.g. a developer
# who has zmk-workspace checked out as a sibling directory) by falling back
# to a conventional relative location.
try:
    import renode_harness
except ImportError:  # pragma: no cover - convenience fallback for local dev
    fallback = REPO_ROOT.parent / "zmk-workspace" / "skills" / "test-zmk-renode" / "scripts"
    if fallback.is_dir():
        sys.path.insert(0, str(fallback))
        import renode_harness
    else:
        raise


SUBSYSTEM_IDENTIFIER = "your_name__template"
# This template registers exactly one custom subsystem, so its index is
# deterministically 0 -- but see the KNOWN FIRMWARE BUG note above:
# `ListCustomSubsystemRequest` (the normal way to discover this at runtime)
# hits the very same bug and hangs too, so this test hardcodes the index
# rather than discovering it.
KNOWN_SUBSYSTEM_INDEX = 0
# Always out of range regardless of how many custom subsystems a given
# module registers -- used to exercise the *working* fast-path dispatch
# (see test_custom_rpc_invalid_index_dispatch).
INVALID_SUBSYSTEM_INDEX = 99


class RenodeTemplateModuleTests(unittest.TestCase):
    """Boots the module's own Renode-testable ELF once for the whole class
    (like the skill's own T0/T1 tests, boot is the slow part) and exercises
    the custom subsystem envelope/dispatch machinery."""

    renode_path: str
    elf: Path
    studio_pb2 = None
    template_pb2 = None

    @classmethod
    def setUpClass(cls):
        cls.renode_path = renode_harness.find_or_install_renode()
        if cls.renode_path is None:
            raise unittest.SkipTest("Renode is not installed and could not be auto-installed")

        elf_env = os.environ.get("ZMK_RENODE_ELF")
        if not elf_env:
            raise unittest.SkipTest(
                "ZMK_RENODE_ELF not set -- build the Renode-testable ELF first (see README.md)"
            )
        cls.elf = Path(elf_env)
        if not cls.elf.is_file():
            raise unittest.SkipTest(f"ZMK_RENODE_ELF does not exist: {cls.elf}")

        # Core zmk.studio.* messages (Request/Response envelope, core.proto,
        # custom.proto for the generic custom-subsystem envelope).
        studio_proto_dir = renode_harness.find_studio_proto_dir(REPO_ROOT)
        cls.studio_pb2 = renode_harness.load_studio_pb2(studio_proto_dir)

        # This module's own proto (proto/your-name/template/template.proto,
        # package your_name.template) -- compiled separately since it lives
        # outside zmk-studio-messages. protoc normalizes the hyphenated
        # on-disk path ("your-name") to a valid Python package
        # ("your_name") in its generated output.
        out_dir = renode_harness.compile_protos(
            [REPO_ROOT / "proto" / "your-name" / "template" / "template.proto"],
            include_dirs=[REPO_ROOT / "proto"],
        )
        sys.path.insert(0, str(out_dir))
        import your_name.template.template_pb2 as template_pb2  # type: ignore

        cls.template_pb2 = template_pb2

    def setUp(self):
        self.session, self.console, self.rpc = renode_harness.boot_single(self.renode_path, self.elf)
        self.addCleanup(self.session.stop)
        self.addCleanup(self.console.close)
        self.addCleanup(self.rpc.close)

        banner = renode_harness.wait_for_text(self.console._sock, "Welcome to ZMK", timeout=15)
        self.assertIn("Welcome to ZMK", banner, f"never saw ZMK boot banner; got:\n{banner}")

    def _send_call(self, subsystem_index: int, payload: bytes, request_id: int = 1):
        req = self.studio_pb2.Request()
        req.request_id = request_id
        req.custom.call.subsystem_index = subsystem_index
        req.custom.call.payload = payload
        self.rpc.send(req.SerializeToString())

    # -- Affirmative proof the custom-subsystem envelope works -----------

    def test_custom_rpc_invalid_index_dispatch(self):
        """`custom.call` to a subsystem index that doesn't exist proves the
        whole custom-subsystem *envelope* round-trips correctly end to end
        (Request.custom oneof selection, CallRequest field encoding,
        subsystem-count/index validation, meta.simple_error response
        encoding/decoding) -- everything except actually reaching a real
        subsystem's handler, which hits the known bug documented in this
        file's module docstring."""
        self._send_call(INVALID_SUBSYSTEM_INDEX, b"", request_id=7)

        resp_bytes = self.rpc.read_frame(timeout=10.0)
        self.assertIsNotNone(resp_bytes, "no response to custom.call with an invalid index (timeout)")
        resp = self.studio_pb2.Response()
        resp.ParseFromString(resp_bytes)
        self.assertEqual(resp.WhichOneof("type"), "request_response")
        self.assertEqual(resp.request_response.request_id, 7)
        self.assertEqual(resp.request_response.WhichOneof("subsystem"), "meta")
        self.assertEqual(resp.request_response.meta.WhichOneof("response_type"), "simple_error")
        # zmk.meta.ErrorConditions.RPC_NOT_FOUND == 2
        self.assertEqual(resp.request_response.meta.simple_error, 2)

    # -- Known bug: documented, asserted, not silently skipped -----------

    def test_custom_rpc_sample_round_trip_KNOWN_BROKEN(self):
        """Documents the known firmware bug (see this file's module
        docstring): sending a real SampleRequest to this module's own
        registered subsystem (index 0) should get back a SampleResponse
        with `"Hello from firmware! Received: 42"` (see
        handle_sample_request() in src/studio/template_handler.c) -- but
        currently the RPC thread spins forever inside the vendored ZMK
        `rpc_tx_buffer_write()` and no response is ever sent. This test
        asserts *that exact failure* (a read timeout) so it will start
        failing -- loudly, as a signal to update this test -- the day the
        underlying vendored bug is fixed upstream."""
        inner_req = self.template_pb2.Request()
        inner_req.sample.value = 42
        self._send_call(KNOWN_SUBSYSTEM_INDEX, inner_req.SerializeToString())

        resp_bytes = self.rpc.read_frame(timeout=10.0)
        self.assertIsNone(
            resp_bytes,
            "custom.call to the real registered subsystem got a response -- the known "
            "vendored-zmk RPC-TX-encoding bug documented in this file's module docstring "
            "appears to be fixed! Update this test to assert the real SampleResponse "
            "round-trip instead (see test_custom_rpc_invalid_index_dispatch for the "
            "request-building pattern), and consider re-adding subsystem discovery via "
            "ListCustomSubsystemRequest.",
        )


if __name__ == "__main__":
    unittest.main()
