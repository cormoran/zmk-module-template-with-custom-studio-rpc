/**
 * Key Diagnostics - Custom Studio RPC Handler
 *
 * Provides diagnostics data for investigating unstable or non-working keys.
 */

#include <pb_decode.h>
#include <pb_encode.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/devicetree.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include <zmk/event_manager.h>
#include <zmk/events/position_state_changed.h>
#include <zmk/matrix.h>
#include <zmk/matrix_transform.h>
#include <zmk/physical_layouts.h>
#include <zmk/studio/custom.h>

#include <zmk/key_diagnostics/custom.pb.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#define KSCAN_NODE DT_CHOSEN(zmk_kscan)

#if DT_HAS_CHOSEN(zmk_kscan) && DT_NODE_HAS_COMPAT(KSCAN_NODE, zmk_kscan_gpio_charlieplex)
#define ZMK_KEY_DIAGNOSTICS_CHARLIEPLEX 1
#else
#define ZMK_KEY_DIAGNOSTICS_CHARLIEPLEX 0
#endif

#if ZMK_KEY_DIAGNOSTICS_CHARLIEPLEX
#define ZMK_KEY_DIAGNOSTICS_GPIO_SPEC(node_id, prop, idx)                                          \
    GPIO_DT_SPEC_GET_BY_IDX(node_id, prop, idx),

static const struct gpio_dt_spec charlieplex_gpios[] = {
    DT_FOREACH_PROP_ELEM(KSCAN_NODE, gpios, ZMK_KEY_DIAGNOSTICS_GPIO_SPEC)};
#endif

struct key_diagnostics_stats {
    uint32_t press_count;
    uint32_t release_count;
    uint32_t chatter_count;
    int64_t last_change_ms;
    bool last_state;
};

struct key_gpio_mapping {
    uint32_t row;
    uint32_t column;
    bool valid;
};

static struct key_diagnostics_stats key_stats[ZMK_KEYMAP_LEN];
static struct key_gpio_mapping key_mappings[ZMK_KEYMAP_LEN];
static const struct zmk_physical_layout *cached_layout;
static uint8_t cached_layout_index;
static bool cached_layout_valid;

K_MUTEX_DEFINE(key_stats_mutex);

/**
 * Metadata for the custom subsystem.
 * - ui_urls: URLs where the custom UI can be loaded from
 * - security: Security level for the RPC handler
 */
static struct zmk_rpc_custom_subsystem_meta key_diagnostics_meta = {
    ZMK_RPC_CUSTOM_SUBSYSTEM_UI_URLS("http://localhost:5173"),
    // Unsecured is suggested by default to avoid unlocking in un-reliable
    // environments.
    .security = ZMK_STUDIO_RPC_HANDLER_UNSECURED,
};

/**
 * Register the custom RPC subsystem.
 * The first argument is the subsystem name used to route requests from the
 * frontend. Format: <namespace>__<feature> (double underscore)
 */
ZMK_RPC_CUSTOM_SUBSYSTEM(zmk__key_diagnostics, &key_diagnostics_meta,
                         key_diagnostics_rpc_handle_request);

ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER(zmk__key_diagnostics,
                                         zmk_key_diagnostics_Response);

static int handle_get_report_request(
    const zmk_key_diagnostics_GetDiagnosticsRequest *req,
    zmk_key_diagnostics_Response *resp);
static int handle_reset_request(zmk_key_diagnostics_Response *resp);

static void key_diagnostics_reset_stats(void) {
    k_mutex_lock(&key_stats_mutex, K_FOREVER);
    memset(key_stats, 0, sizeof(key_stats));
    k_mutex_unlock(&key_stats_mutex);
}

static void key_diagnostics_refresh_layout_cache(void) {
    const struct zmk_physical_layout *const *layouts;
    size_t layout_count = zmk_physical_layouts_get_list(&layouts);

    cached_layout = NULL;
    cached_layout_index = 0;
    cached_layout_valid = false;

    if (layout_count == 0) {
        return;
    }

    int selected_index = zmk_physical_layouts_get_selected();
    if (selected_index < 0 || (size_t)selected_index >= layout_count) {
        selected_index = 0;
    }

    cached_layout_index = (uint8_t)selected_index;
    cached_layout = layouts[selected_index];
    cached_layout_valid = cached_layout != NULL;
}

static enum zmk_key_diagnostics_KscanType key_diagnostics_get_kscan_type(void) {
#if ZMK_KEY_DIAGNOSTICS_CHARLIEPLEX
    return zmk_key_diagnostics_KscanType_KSCAN_TYPE_CHARLIEPLEX;
#else
    return zmk_key_diagnostics_KscanType_KSCAN_TYPE_UNSUPPORTED;
#endif
}

static void key_diagnostics_build_gpio_mapping(void) {
    memset(key_mappings, 0, sizeof(key_mappings));

#if ZMK_KEY_DIAGNOSTICS_CHARLIEPLEX
    if (!cached_layout_valid) {
        return;
    }

    const size_t gpio_count = ARRAY_SIZE(charlieplex_gpios);
    zmk_matrix_transform_t transform = cached_layout->matrix_transform;

    for (uint32_t row = 0; row < gpio_count; row++) {
        for (uint32_t column = 0; column < gpio_count; column++) {
            if (row == column) {
                continue;
            }

            int32_t position =
                zmk_matrix_transform_row_column_to_position(transform, row, column);
            if (position < 0 || position >= (int32_t)ZMK_KEYMAP_LEN) {
                continue;
            }

            key_mappings[position] = (struct key_gpio_mapping){
                .row = row,
                .column = column,
                .valid = true,
            };
        }
    }
#endif
}

static void key_diagnostics_fill_gpio_pin(const struct gpio_dt_spec *spec,
                                          zmk_key_diagnostics_GpioPin *pin) {
    if (!spec || !spec->port) {
        return;
    }

    snprintf(pin->port, sizeof(pin->port), "%s", spec->port->name);
    pin->pin = spec->pin;
    pin->flags = spec->dt_flags;
}

static void key_diagnostics_apply_stats(uint32_t position,
                                        const struct key_diagnostics_stats *stats,
                                        zmk_key_diagnostics_KeyDiagnostics *entry) {
    entry->position = position;
    entry->press_count = stats->press_count;
    entry->release_count = stats->release_count;
    entry->chatter_count = stats->chatter_count;
    entry->is_pressed = stats->last_state;
    entry->last_change_ms = stats->last_change_ms;

    if (position >= ZMK_KEYMAP_LEN) {
        return;
    }

    if (key_mappings[position].valid) {
        entry->row = key_mappings[position].row;
        entry->column = key_mappings[position].column;
        entry->has_gpio_mapping = true;

#if ZMK_KEY_DIAGNOSTICS_CHARLIEPLEX
        key_diagnostics_fill_gpio_pin(&charlieplex_gpios[key_mappings[position].row],
                                      &entry->drive_gpio);
        key_diagnostics_fill_gpio_pin(&charlieplex_gpios[key_mappings[position].column],
                                      &entry->sense_gpio);
#endif
    }
}

static void key_diagnostics_fill_physical_keys(zmk_key_diagnostics_DiagnosticsReport *report) {
    if (!cached_layout_valid || !cached_layout->keys) {
        return;
    }

    const size_t max_keys = ARRAY_SIZE(report->physical_keys);
    size_t key_count = cached_layout->keys_len;

    if (key_count > max_keys) {
        key_count = max_keys;
    }

    for (size_t i = 0; i < key_count; i++) {
        const struct zmk_key_physical_attrs *attrs = &cached_layout->keys[i];
        report->physical_keys[i] = (zmk_key_diagnostics_KeyPhysical){
            .position = (uint32_t)i,
            .x = attrs->x,
            .y = attrs->y,
            .width = attrs->width,
            .height = attrs->height,
#if IS_ENABLED(CONFIG_ZMK_PHYSICAL_LAYOUT_KEY_ROTATION)
            .rx = attrs->rx,
            .ry = attrs->ry,
            .r = attrs->r,
#endif
        };
    }

    report->physical_keys_count = key_count;
}

static void key_diagnostics_fill_report(zmk_key_diagnostics_DiagnosticsReport *report) {
    key_diagnostics_refresh_layout_cache();
    key_diagnostics_build_gpio_mapping();

    report->kscan_type = key_diagnostics_get_kscan_type();
    report->chatter_window_ms = CONFIG_ZMK_KEY_DIAGNOSTICS_CHATTER_WINDOW_MS;
    report->layout_index = cached_layout_index;

    if (cached_layout_valid && cached_layout->display_name) {
        snprintf(report->layout_name, sizeof(report->layout_name), "%s",
                 cached_layout->display_name);
    }

    key_diagnostics_fill_physical_keys(report);

    const size_t max_keys = ARRAY_SIZE(report->keys);
    size_t key_count = cached_layout_valid ? cached_layout->keys_len : ZMK_KEYMAP_LEN;
    if (key_count > max_keys) {
        key_count = max_keys;
    }

    k_mutex_lock(&key_stats_mutex, K_FOREVER);
    for (size_t i = 0; i < key_count; i++) {
        key_diagnostics_apply_stats(i, &key_stats[i], &report->keys[i]);
    }
    k_mutex_unlock(&key_stats_mutex);

    report->keys_count = key_count;
}

/**
 * Main request handler for the custom RPC subsystem.
 * Sets up the encoding callback for the response.
 */
static bool
key_diagnostics_rpc_handle_request(const zmk_custom_CallRequest *raw_request,
                                   pb_callback_t *encode_response) {
    zmk_key_diagnostics_Response *resp =
        ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER_ALLOCATE(zmk__key_diagnostics,
                                                          encode_response);

    zmk_key_diagnostics_Request req = zmk_key_diagnostics_Request_init_zero;

    // Decode the incoming request from the raw payload
    pb_istream_t req_stream = pb_istream_from_buffer(raw_request->payload.bytes,
                                                     raw_request->payload.size);
    if (!pb_decode(&req_stream, zmk_key_diagnostics_Request_fields, &req)) {
        LOG_WRN("Failed to decode key diagnostics request: %s", PB_GET_ERROR(&req_stream));
        zmk_key_diagnostics_ErrorResponse err = zmk_key_diagnostics_ErrorResponse_init_zero;
        snprintf(err.message, sizeof(err.message), "Failed to decode request");
        resp->which_response_type = zmk_key_diagnostics_Response_error_tag;
        resp->response_type.error = err;
        return true;
    }

    int rc = 0;
    switch (req.which_request_type) {
    case zmk_key_diagnostics_Request_get_report_tag:
        rc = handle_get_report_request(&req.request_type.get_report, resp);
        break;
    case zmk_key_diagnostics_Request_reset_tag:
        rc = handle_reset_request(resp);
        break;
    default:
        LOG_WRN("Unsupported key diagnostics request type: %d",
                req.which_request_type);
        rc = -1;
    }

    if (rc != 0) {
        zmk_key_diagnostics_ErrorResponse err = zmk_key_diagnostics_ErrorResponse_init_zero;
        snprintf(err.message, sizeof(err.message), "Failed to process request");
        resp->which_response_type = zmk_key_diagnostics_Response_error_tag;
        resp->response_type.error = err;
    }
    return true;
}

static int handle_get_report_request(
    const zmk_key_diagnostics_GetDiagnosticsRequest *req,
    zmk_key_diagnostics_Response *resp) {
    zmk_key_diagnostics_DiagnosticsReport report =
        zmk_key_diagnostics_DiagnosticsReport_init_zero;

    key_diagnostics_fill_report(&report);

    resp->which_response_type = zmk_key_diagnostics_Response_diagnostics_tag;
    resp->response_type.diagnostics = report;

    if (req->reset_after) {
        key_diagnostics_reset_stats();
    }

    return 0;
}

static int handle_reset_request(zmk_key_diagnostics_Response *resp) {
    key_diagnostics_reset_stats();

    zmk_key_diagnostics_ResetDiagnosticsResponse reset =
        zmk_key_diagnostics_ResetDiagnosticsResponse_init_zero;
    reset.ok = true;

    resp->which_response_type = zmk_key_diagnostics_Response_reset_tag;
    resp->response_type.reset = reset;
    return 0;
}

static int key_diagnostics_listener(const zmk_event_t *eh) {
    const struct zmk_position_state_changed *ev = as_zmk_position_state_changed(eh);
    if (!ev) {
        return ZMK_EV_EVENT_BUBBLE;
    }

    if (ev->position >= ZMK_KEYMAP_LEN) {
        return ZMK_EV_EVENT_BUBBLE;
    }

    k_mutex_lock(&key_stats_mutex, K_FOREVER);
    struct key_diagnostics_stats *stats = &key_stats[ev->position];

    if (ev->state) {
        stats->press_count++;
    } else {
        stats->release_count++;
    }

    if (stats->last_change_ms > 0) {
        int64_t delta = ev->timestamp - stats->last_change_ms;
        if (delta >= 0 &&
            delta <= CONFIG_ZMK_KEY_DIAGNOSTICS_CHATTER_WINDOW_MS) {
            stats->chatter_count++;
        }
    }

    stats->last_change_ms = ev->timestamp;
    stats->last_state = ev->state;
    k_mutex_unlock(&key_stats_mutex);

    return ZMK_EV_EVENT_BUBBLE;
}

ZMK_LISTENER(key_diagnostics, key_diagnostics_listener);
ZMK_SUBSCRIPTION(key_diagnostics, zmk_position_state_changed);
