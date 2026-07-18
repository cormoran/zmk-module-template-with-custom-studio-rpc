/*
 * Simulated BLE host that exercises the ZMK Studio RPC custom subsystem over
 * the Studio GATT service, for BabbleSim BLE tests.
 *
 * Based on ZMK's app/tests/ble/central test app (Apache-2.0).
 *
 * Flow: scan for a HIDS advertiser -> connect -> encrypt (Just Works pairing)
 * -> discover the Studio RPC service/characteristic/CCC -> subscribe
 * (indications) -> write a framed ListCustomSubsystemRequest -> on response,
 * write a framed custom CallRequest for subsystem 0 (your_name__template
 * SampleRequest{value: 42}) -> hexdump each de-framed response payload.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/types.h>
#include <stddef.h>
#include <stdlib.h>
#include <errno.h>
#include <zephyr/kernel.h>

#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(studio_rpc_central, 4);

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/sys/byteorder.h>

/* Matches ZMK_BT_STUDIO_UUID in zmk/app/src/studio/uuid.h */
#define ZMK_BT_STUDIO_UUID(num) BT_UUID_128_ENCODE(num, 0x0196, 0x6107, 0xc967, 0xc5cfb1c2482a)

static const struct bt_uuid_128 studio_svc_uuid = BT_UUID_INIT_128(ZMK_BT_STUDIO_UUID(0x00000000));
static const struct bt_uuid_128 studio_chrc_uuid = BT_UUID_INIT_128(ZMK_BT_STUDIO_UUID(0x00000001));

/* ZMK Studio RPC framing bytes (zmk/app/src/studio/msg_framing.h) */
#define FRAMING_SOF 0xAB
#define FRAMING_ESC 0xAC
#define FRAMING_EOF 0xAD

/*
 * Pre-encoded, framed zmk.studio.Request messages.
 *
 * REQ_LIST: {request_id: 1, custom: {list_custom_subsystems: {}}}
 * REQ_CALL: {request_id: 2, custom: {call: {subsystem_index: 0, payload:
 *           your_name.template.Request{sample: {value: 42}}}}}
 *
 * None of the payload bytes collide with the framing bytes, so no escaping is
 * needed.
 */
static const uint8_t req_list_subsystems[] = {
    FRAMING_SOF, 0x08, 0x01, 0xA2, 0x06, 0x02, 0x0A, 0x00, FRAMING_EOF,
};

static const uint8_t req_call_sample[] = {
    FRAMING_SOF, 0x08, 0x02, 0xA2, 0x06, 0x08, 0x12,        0x06,
    0x12,        0x04, 0x0A, 0x02, 0x08, 0x2A, FRAMING_EOF,
};

static int start_scan(void);

static struct bt_conn *default_conn;

static struct bt_uuid_128 uuid128 = BT_UUID_INIT_128(0);
static struct bt_uuid_16 uuid16 = BT_UUID_INIT_16(0);
static struct bt_gatt_discover_params discover_params;
static struct bt_gatt_subscribe_params subscribe_params;
static struct bt_gatt_write_params write_params;

static uint16_t rpc_value_handle;
static int responses_received;

/* Incremental decoder for the Studio RPC framing protocol */
static uint8_t frame_buf[256];
static size_t frame_len;
static bool in_frame;
static bool escaped;

static void send_request(struct bt_conn *conn, const uint8_t *data, uint16_t len);

static void handle_frame(struct bt_conn *conn, const uint8_t *frame, size_t len) {
    responses_received++;
    LOG_DBG("[RPC RESPONSE %d]", responses_received);
    LOG_HEXDUMP_DBG(frame, len, "payload");

    if (responses_received == 1) {
        send_request(conn, req_call_sample, sizeof(req_call_sample));
    } else if (responses_received == 2) {
        LOG_DBG("[ALL RESPONSES RECEIVED]");
    }
}

static void frame_rx_byte(struct bt_conn *conn, uint8_t byte) {
    if (!in_frame) {
        if (byte == FRAMING_SOF) {
            in_frame = true;
            escaped = false;
            frame_len = 0;
        }
        return;
    }

    if (escaped) {
        escaped = false;
    } else if (byte == FRAMING_ESC) {
        escaped = true;
        return;
    } else if (byte == FRAMING_EOF) {
        in_frame = false;
        handle_frame(conn, frame_buf, frame_len);
        return;
    } else if (byte == FRAMING_SOF) {
        frame_len = 0;
        escaped = false;
        return;
    }

    if (frame_len < sizeof(frame_buf)) {
        frame_buf[frame_len++] = byte;
    }
}

static void write_func(struct bt_conn *conn, uint8_t err, struct bt_gatt_write_params *params) {
    if (err) {
        LOG_DBG("[Write failed] (err %d)", err);
    } else {
        LOG_DBG("[WROTE REQUEST]");
    }
}

static void send_request(struct bt_conn *conn, const uint8_t *data, uint16_t len) {
    write_params.func = write_func;
    write_params.handle = rpc_value_handle;
    write_params.offset = 0;
    write_params.data = data;
    write_params.length = len;

    int err = bt_gatt_write(conn, &write_params);
    if (err) {
        LOG_DBG("[Write request failed] (err %d)", err);
    }
}

static uint8_t indicate_func(struct bt_conn *conn, struct bt_gatt_subscribe_params *params,
                             const void *data, uint16_t length) {
    if (!data) {
        LOG_DBG("[UNSUBSCRIBED]");
        params->value_handle = 0U;
        return BT_GATT_ITER_STOP;
    }

    const uint8_t *bytes = data;
    for (uint16_t i = 0; i < length; i++) {
        frame_rx_byte(conn, bytes[i]);
    }

    return BT_GATT_ITER_CONTINUE;
}

static uint8_t discover_func(struct bt_conn *conn, const struct bt_gatt_attr *attr,
                             struct bt_gatt_discover_params *params) {
    int err;

    if (!attr) {
        LOG_DBG("[Discover complete]");
        (void)memset(params, 0, sizeof(*params));
        return BT_GATT_ITER_STOP;
    }

    LOG_DBG("[ATTRIBUTE] handle %u", attr->handle);

    if (!bt_uuid_cmp(discover_params.uuid, &studio_svc_uuid.uuid)) {
        /* Found the Studio service, now discover its RPC characteristic */
        memcpy(&uuid128, &studio_chrc_uuid, sizeof(uuid128));
        discover_params.uuid = &uuid128.uuid;
        discover_params.start_handle = attr->handle + 1;
        discover_params.type = BT_GATT_DISCOVER_CHARACTERISTIC;

        err = bt_gatt_discover(conn, &discover_params);
        if (err) {
            LOG_DBG("[Discover failed] (err %d)", err);
        }
    } else if (!bt_uuid_cmp(discover_params.uuid, &studio_chrc_uuid.uuid)) {
        /* Found the RPC characteristic, now discover its CCC descriptor */
        memcpy(&uuid16, BT_UUID_GATT_CCC, sizeof(uuid16));
        discover_params.uuid = &uuid16.uuid;
        discover_params.start_handle = attr->handle + 2;
        discover_params.type = BT_GATT_DISCOVER_DESCRIPTOR;
        subscribe_params.value_handle = bt_gatt_attr_value_handle(attr);
        rpc_value_handle = bt_gatt_attr_value_handle(attr);

        err = bt_gatt_discover(conn, &discover_params);
        if (err) {
            LOG_DBG("[Discover failed] (err %d)", err);
        }
    } else {
        /* The Studio RPC transport responds with GATT indications */
        subscribe_params.notify = indicate_func;
        subscribe_params.value = BT_GATT_CCC_INDICATE;
        subscribe_params.ccc_handle = attr->handle;

        err = bt_gatt_subscribe(conn, &subscribe_params);
        if (err && err != -EALREADY) {
            LOG_DBG("[Subscribe failed] (err %d)", err);
        } else {
            LOG_DBG("[SUBSCRIBED]");
            send_request(conn, req_list_subsystems, sizeof(req_list_subsystems));
        }

        return BT_GATT_ITER_STOP;
    }

    return BT_GATT_ITER_STOP;
}

static void discover_conn(struct bt_conn *conn) {
    int err;

    LOG_DBG("[Discovery started for conn]");
    memcpy(&uuid128, &studio_svc_uuid, sizeof(uuid128));
    discover_params.uuid = &uuid128.uuid;
    discover_params.func = discover_func;
    discover_params.start_handle = BT_ATT_FIRST_ATTRIBUTE_HANDLE;
    discover_params.end_handle = BT_ATT_LAST_ATTRIBUTE_HANDLE;
    discover_params.type = BT_GATT_DISCOVER_PRIMARY;

    err = bt_gatt_discover(conn, &discover_params);
    if (err) {
        LOG_DBG("[Discover failed] (err %d)", err);
        return;
    }
}

static bool eir_found(struct bt_data *data, void *user_data) {
    bt_addr_le_t *addr = user_data;
    int i;

    LOG_DBG("[AD]: %u data_len %u", data->type, data->data_len);

    switch (data->type) {
    case BT_DATA_UUID16_SOME:
    case BT_DATA_UUID16_ALL:
        if (data->data_len % sizeof(uint16_t) != 0U) {
            LOG_DBG("[AD malformed]");
            return true;
        }

        for (i = 0; i < data->data_len; i += sizeof(uint16_t)) {
            struct bt_le_conn_param *param;
            struct bt_uuid *uuid;
            uint16_t u16;
            int err;

            memcpy(&u16, &data->data[i], sizeof(u16));
            uuid = BT_UUID_DECLARE_16(sys_le16_to_cpu(u16));
            if (bt_uuid_cmp(uuid, BT_UUID_HIDS)) {
                continue;
            }

            err = bt_le_scan_stop();
            if (err) {
                LOG_DBG("[Stop LE scan failed] (err %d)", err);
                continue;
            }

            param = BT_LE_CONN_PARAM_DEFAULT;
            err = bt_conn_le_create(addr, BT_CONN_LE_CREATE_CONN, param, &default_conn);
            if (err) {
                LOG_DBG("[Create conn failed] (err %d)", err);
                start_scan();
            }

            return false;
        }
    }

    return true;
}

static void device_found(const bt_addr_le_t *addr, int8_t rssi, uint8_t type,
                         struct net_buf_simple *ad) {
    char dev[BT_ADDR_LE_STR_LEN];

    bt_addr_le_to_str(addr, dev, sizeof(dev));
    LOG_DBG("[DEVICE]: %s, AD evt type %u, AD data len %u, RSSI %i", dev, type, ad->len, rssi);

    /* We're only interested in connectable events */
    if (type == BT_GAP_ADV_TYPE_ADV_IND) {
        bt_data_parse(ad, eir_found, (void *)addr);
    }
}

static int start_scan(void) {
    int err;

    struct bt_le_scan_param scan_param = {
        .type = BT_LE_SCAN_TYPE_ACTIVE,
        .options = BT_LE_SCAN_OPT_NONE,
        .interval = BT_GAP_SCAN_FAST_INTERVAL,
        .window = BT_GAP_SCAN_FAST_WINDOW,
    };

    err = bt_le_scan_start(&scan_param, device_found);
    if (err) {
        LOG_DBG("[Scanning failed to start] (err %d)", err);
        return err;
    }

    LOG_DBG("[Scanning successfully started]");
    return 0;
}

static void connected(struct bt_conn *conn, uint8_t conn_err) {
    char addr[BT_ADDR_LE_STR_LEN];

    bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));

    if (conn_err) {
        LOG_DBG("[Failed to connect to %s] (%u)", addr, conn_err);

        bt_conn_unref(default_conn);
        default_conn = NULL;

        start_scan();
        return;
    }

    LOG_DBG("[Connected]: %s", addr);

    if (conn == default_conn) {
        /* The Studio RPC characteristic requires an encrypted connection */
        LOG_DBG("[Setting the security for the connection]");
        bt_conn_set_security(conn, BT_SECURITY_L2);
    }
}

static void pairing_complete(struct bt_conn *conn, bool bonded) { LOG_DBG("Pairing complete"); }

static void mtu_exchanged(struct bt_conn *conn, uint8_t err,
                          struct bt_gatt_exchange_params *params) {
    LOG_DBG("[MTU exchanged] (err %d) mtu %u", err, bt_gatt_get_mtu(conn));
    discover_conn(conn);
}

static struct bt_gatt_exchange_params mtu_params = {
    .func = mtu_exchanged,
};

static void security_changed(struct bt_conn *conn, bt_security_t level, enum bt_security_err err) {
    if (err > BT_SECURITY_ERR_SUCCESS) {
        LOG_DBG("[Security Change Failed]");
        exit(1);
    }

    /* The Studio RPC GATT transport sends indications larger than the
     * default 23 byte ATT MTU, so negotiate a larger one like real Studio
     * clients do before starting discovery. */
    int ret = bt_gatt_exchange_mtu(conn, &mtu_params);
    if (ret) {
        LOG_DBG("[MTU exchange failed] (err %d)", ret);
        discover_conn(conn);
    }
}

static void disconnected(struct bt_conn *conn, uint8_t reason) {
    char addr[BT_ADDR_LE_STR_LEN];

    bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));

    LOG_DBG("[Disconnected]: %s (reason 0x%02x)", addr, reason);

    if (default_conn != conn) {
        return;
    }

    bt_conn_unref(default_conn);
    default_conn = NULL;

    start_scan();
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
    .security_changed = security_changed,
};

struct bt_conn_auth_info_cb auth_info_cb = {
    .pairing_complete = pairing_complete,
};

int main(void) {
    int err;

    err = bt_conn_auth_info_cb_register(&auth_info_cb);

    err = bt_enable(NULL);

    if (err) {
        LOG_DBG("[Bluetooth init failed] (err %d)", err);
        return err;
    }

    LOG_DBG("[Bluetooth initialized]");

    return start_scan();
}
