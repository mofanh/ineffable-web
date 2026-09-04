import assert from "node:assert/strict"

import {
  ADMIN_USAGE_RANGES,
  buildModelUsageChart,
  buildUserUsageChart,
  formatUsageBucket,
  formatUsageMetricValue,
} from "../src/features/admin-usage/usage-timeseries.tsx"

assert.deepEqual(ADMIN_USAGE_RANGES, ["24h", "7d", "30d", "6m", "12m"])

const modelChart = buildModelUsageChart(
  [{ id: "model-a", display_name: "Model A" }],
  {
    range: "24h",
    granularity: "hour",
    has_data: true,
    points: [
      {
        model_profile_id: "model-a",
        bucket_start: "2026-09-04T00:00:00Z",
        request_count: 4,
        failed_request_count: 1,
        raw_total_tokens: 100,
        charged_credits: 2,
        average_latency_ms: 80,
      },
      {
        model_profile_id: "model-a",
        bucket_start: "2026-09-04T01:00:00Z",
        request_count: 0,
        failed_request_count: 0,
        raw_total_tokens: 0,
        charged_credits: 0,
        average_latency_ms: null,
      },
    ],
  },
  "failureRate",
)
assert.equal(modelChart.data.length, 2)
assert.equal(modelChart.data[0].model_model_a, 25)
assert.equal(modelChart.data[1].model_model_a, 0)
assert.equal(modelChart.series[0].label, "Model A")

const userChart = buildUserUsageChart(
  {
    range: "30d",
    granularity: "day",
    has_data: true,
    points: [
      {
        user_id: "user-a",
        bucket_start: "2026-09-04T00:00:00Z",
        request_count: 2,
        raw_total_tokens: 50,
        charged_credits: 7,
      },
    ],
  },
  "credits",
)
assert.equal(userChart.data[0].value, 7)
assert.ok(userChart.series[0].label.length > 0)
assert.ok(formatUsageBucket("2026-09-04T00:00:00Z", "day").length > 0)
assert.match(formatUsageMetricValue("failureRate", 12.5), /12[.,]5%/)
assert.equal(buildUserUsageChart(null, "tokens").data.length, 0)

console.log("admin usage timeseries checks passed")
