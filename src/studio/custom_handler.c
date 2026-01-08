/**
 * Battery History - Custom Studio RPC Handler
 *
 * Implements a custom RPC subsystem for ZMK Studio to expose
 * battery history data captured on the device.
 */

#include <pb_decode.h>
#include <pb_encode.h>
#include <zmk/studio/custom.h>
#include <zmk/battery_history.h>
#include <zmk/battery_history/custom.pb.h>

#include <zephyr/logging/log.h>
LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

/**
 * Metadata for the custom subsystem.
 * - ui_urls: URLs where the custom UI can be loaded from
 * - security: Security level for the RPC handler
 */
static struct zmk_rpc_custom_subsystem_meta battery_history_meta = {
    ZMK_RPC_CUSTOM_SUBSYSTEM_UI_URLS("http://localhost:5173"),
    // Unsecured is suggested by default to avoid unlocking in un-reliable
    // environments.
    .security = ZMK_STUDIO_RPC_HANDLER_UNSECURED,
};

static bool
battery_history_rpc_handle_request(const zmk_custom_CallRequest *raw_request,
                                   pb_callback_t *encode_response);

/**
 * Register the custom RPC subsystem.
 * The first argument is the subsystem name used to route requests from the
 * frontend. Format: <namespace>__<feature> (double underscore)
 */
ZMK_RPC_CUSTOM_SUBSYSTEM(zmk__battery_history, &battery_history_meta,
                         battery_history_rpc_handle_request);

ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER(zmk__battery_history,
                                         zmk_battery_history_Response);

static int
handle_get_history_request(const zmk_battery_history_GetHistoryRequest *req,
                           zmk_battery_history_Response *resp);
static int
handle_clear_history_request(const zmk_battery_history_ClearHistoryRequest *req,
                             zmk_battery_history_Response *resp);

/**
 * Main request handler for the custom RPC subsystem.
 * Sets up the encoding callback for the response.
 */
static bool
battery_history_rpc_handle_request(const zmk_custom_CallRequest *raw_request,
                                   pb_callback_t *encode_response) {
  zmk_battery_history_Response *resp =
      ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER_ALLOCATE(zmk__battery_history,
                                                        encode_response);

  zmk_battery_history_Request req = zmk_battery_history_Request_init_zero;

  // Decode the incoming request from the raw payload
  pb_istream_t req_stream = pb_istream_from_buffer(raw_request->payload.bytes,
                                                   raw_request->payload.size);
  if (!pb_decode(&req_stream, zmk_battery_history_Request_fields, &req)) {
    LOG_WRN("Failed to decode battery history request: %s",
            PB_GET_ERROR(&req_stream));
    zmk_battery_history_ErrorResponse err =
        zmk_battery_history_ErrorResponse_init_zero;
    snprintf(err.message, sizeof(err.message), "Failed to decode request");
    resp->which_response_type = zmk_battery_history_Response_error_tag;
    resp->response_type.error = err;
    return true;
  }

  int rc = 0;
  switch (req.which_request_type) {
  case zmk_battery_history_Request_get_history_tag:
    rc = handle_get_history_request(&req.request_type.get_history, resp);
    break;
  case zmk_battery_history_Request_clear_history_tag:
    rc = handle_clear_history_request(&req.request_type.clear_history, resp);
    break;
  default:
    LOG_WRN("Unsupported battery history request type: %d",
            req.which_request_type);
    rc = -1;
  }

  if (rc != 0) {
    zmk_battery_history_ErrorResponse err =
        zmk_battery_history_ErrorResponse_init_zero;
    snprintf(err.message, sizeof(err.message), "Failed to process request");
    resp->which_response_type = zmk_battery_history_Response_error_tag;
    resp->response_type.error = err;
  }
  return true;
}

/**
 * Handle the history request and populate the response.
 */
static int
handle_get_history_request(const zmk_battery_history_GetHistoryRequest *req,
                           zmk_battery_history_Response *resp) {
  size_t capacity = zmk_battery_history_get_capacity();
  size_t max_entries = req->max_entries == 0
                           ? capacity
                           : MIN(req->max_entries, capacity);

  struct zmk_battery_history_sample
      samples[CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES];
  size_t count = zmk_battery_history_get_samples(samples, max_entries);

  zmk_battery_history_HistoryResponse history =
      zmk_battery_history_HistoryResponse_init_zero;
  history.sample_interval_seconds =
      zmk_battery_history_get_sample_interval_seconds();
  history.capacity = capacity;
  history.total_entries = zmk_battery_history_get_total_entries();
  history.samples_count = count;

  for (size_t i = 0; i < count; i++) {
    history.samples[i].timestamp_seconds = samples[i].timestamp_seconds;
    history.samples[i].level_percent = samples[i].level_percent;
  }

  resp->which_response_type = zmk_battery_history_Response_history_tag;
  resp->response_type.history = history;
  return 0;
}

static int
handle_clear_history_request(
    const zmk_battery_history_ClearHistoryRequest *req,
    zmk_battery_history_Response *resp) {
  ARG_UNUSED(req);
  zmk_battery_history_clear();

  zmk_battery_history_ClearHistoryResponse result =
      zmk_battery_history_ClearHistoryResponse_init_zero;
  result.success = true;

  resp->which_response_type = zmk_battery_history_Response_clear_history_tag;
  resp->response_type.clear_history = result;
  return 0;
}
