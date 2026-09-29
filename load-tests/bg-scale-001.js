import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const target = (__ENV.TARGET_URL || "").replace(/\/$/, "");
const allowProduction = __ENV.ALLOW_PRODUCTION === "I_UNDERSTAND_THIS_IS_PRODUCTION";
const productionPatterns = [
  /bizgenie-apii-[a-z0-9-]*\.a\.run\.app$/i,
  /api\.bizgenie/i,
];

if (!target) {
  throw new Error("TARGET_URL is required");
}
const host = new URL(target).host;
if (!allowProduction && productionPatterns.some((pattern) => pattern.test(host))) {
  throw new Error(
    "Refusing known production-looking target. Use an isolated candidate/load-test URL. " +
      "Production override requires ALLOW_PRODUCTION=I_UNDERSTAND_THIS_IS_PRODUCTION."
  );
}

const appErrors = new Rate("bg_app_errors");
const profile = (__ENV.PROFILE || "smoke").toLowerCase();

const profiles = {
  smoke: [
    { duration: "20s", target: 10 },
    { duration: "30s", target: 10 },
    { duration: "10s", target: 0 },
  ],
  staged2000: [
    { duration: "2m", target: 100 },
    { duration: "3m", target: 100 },
    { duration: "2m", target: 250 },
    { duration: "3m", target: 250 },
    { duration: "3m", target: 500 },
    { duration: "4m", target: 500 },
    { duration: "3m", target: 1000 },
    { duration: "5m", target: 1000 },
    { duration: "3m", target: 1500 },
    { duration: "5m", target: 1500 },
    { duration: "3m", target: 2000 },
    { duration: "8m", target: 2000 },
    { duration: "3m", target: 0 },
  ],
};

if (!profiles[profile]) {
  throw new Error(`Unknown PROFILE "${profile}". Use smoke or staged2000.`);
}

export const options = {
  stages: profiles[profile],
  gracefulRampDown: "30s",
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" }],
    http_req_duration: ["p(95)<1500"],
    bg_app_errors: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" }],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

function request(path, name) {
  const res = http.get(`${target}${path}`, {
    tags: { name },
    timeout: "10s",
  });
  const ok = check(res, {
    [`${name}: status < 500`]: (r) => r.status < 500,
  });
  appErrors.add(!ok);
  return res;
}

export default function () {
  // Safe baseline: read-only public/service-health style traffic only.
  // Authenticated/write/generation scenarios require isolated synthetic fixtures
  // and are intentionally not guessed into this first harness.
  request("/", "root");
  sleep(Math.random() * 1.5 + 0.25);
}

export function handleSummary(data) {
  const output = JSON.stringify(data, null, 2);
  return {
    stdout: output,
    "load-summary.json": output,
  };
}
