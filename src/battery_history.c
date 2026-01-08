/**
 * Battery History Module
 *
 * Collects battery percentage samples on an interval and stores them in RAM.
 * Designed to avoid frequent writes to persistent storage.
 */

#include <zephyr/kernel.h>
#include <zephyr/sys/util.h>
#include <zmk/battery.h>

#include "zmk/battery_history.h"

#include <zephyr/logging/log.h>
LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#define BATTERY_HISTORY_INTERVAL                                              \
  K_SECONDS(CONFIG_ZMK_BATTERY_HISTORY_SAMPLE_INTERVAL_SECONDS)

static struct zmk_battery_history_sample
    battery_history[CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES];
static size_t battery_history_count;
static size_t battery_history_head;
static struct k_mutex battery_history_mutex;
static struct k_work_delayable battery_history_work;

static void battery_history_record_sample(uint8_t level_percent) {
  struct zmk_battery_history_sample sample = {
      .timestamp_seconds = (uint32_t)(k_uptime_get() / 1000),
      .level_percent = level_percent,
  };

  k_mutex_lock(&battery_history_mutex, K_FOREVER);
  battery_history[battery_history_head] = sample;
  battery_history_head =
      (battery_history_head + 1) % CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES;
  if (battery_history_count < CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES) {
    battery_history_count++;
  }
  k_mutex_unlock(&battery_history_mutex);
}

static void battery_history_work_handler(struct k_work *work) {
  ARG_UNUSED(work);

  uint8_t level_percent = zmk_battery_state_of_charge();
  battery_history_record_sample(level_percent);

  k_work_schedule(&battery_history_work, BATTERY_HISTORY_INTERVAL);
}

size_t zmk_battery_history_get_samples(struct zmk_battery_history_sample *buffer,
                                       size_t max_entries) {
  if (!buffer || max_entries == 0) {
    return 0;
  }

  k_mutex_lock(&battery_history_mutex, K_FOREVER);
  size_t total_entries = battery_history_count;
  size_t available = MIN(total_entries, max_entries);
  size_t skip = total_entries > available ? total_entries - available : 0;
  size_t start_index =
      (battery_history_head + CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES -
       total_entries + skip) %
      CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES;

  for (size_t i = 0; i < available; i++) {
    size_t index =
        (start_index + i) % CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES;
    buffer[i] = battery_history[index];
  }
  k_mutex_unlock(&battery_history_mutex);

  return available;
}

size_t zmk_battery_history_get_total_entries(void) {
  k_mutex_lock(&battery_history_mutex, K_FOREVER);
  size_t entries = battery_history_count;
  k_mutex_unlock(&battery_history_mutex);
  return entries;
}

size_t zmk_battery_history_get_capacity(void) {
  return CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES;
}

uint32_t zmk_battery_history_get_sample_interval_seconds(void) {
  return CONFIG_ZMK_BATTERY_HISTORY_SAMPLE_INTERVAL_SECONDS;
}

void zmk_battery_history_clear(void) {
  k_mutex_lock(&battery_history_mutex, K_FOREVER);
  battery_history_count = 0;
  battery_history_head = 0;
  k_mutex_unlock(&battery_history_mutex);
}

static int zmk_battery_history_init(void) {
  k_mutex_init(&battery_history_mutex);
  k_work_init_delayable(&battery_history_work, battery_history_work_handler);
  k_work_schedule(&battery_history_work, K_NO_WAIT);
  LOG_INF("Battery history sampling every %u seconds (capacity %u)",
          CONFIG_ZMK_BATTERY_HISTORY_SAMPLE_INTERVAL_SECONDS,
          CONFIG_ZMK_BATTERY_HISTORY_MAX_ENTRIES);
  return 0;
}

SYS_INIT(zmk_battery_history_init, APPLICATION, CONFIG_APPLICATION_INIT_PRIORITY);
