#pragma once

#include <stddef.h>
#include <stdint.h>

struct zmk_battery_history_sample {
  uint32_t timestamp_seconds;
  uint8_t level_percent;
};

size_t zmk_battery_history_get_samples(struct zmk_battery_history_sample *buffer,
                                       size_t max_entries);
size_t zmk_battery_history_get_total_entries(void);
size_t zmk_battery_history_get_capacity(void);
uint32_t zmk_battery_history_get_sample_interval_seconds(void);
void zmk_battery_history_clear(void);
