// k6 load test for the esgame calculation backend (the `calcUrl` endpoint the browser POSTs to
// on each level change). Models a classroom of students submitting their allocation at once —
// the realistic load, and the bottleneck, because R/Plumber serves requests single-threaded.
//
//   k6 run -e CALC_URL=http://localhost:8000/esgame -e VUS=2 perf/calc-load.js
//
// FIRST MEASURED 2026-08-06, and the answer is smaller than this file assumed. One round against
// the deployed backend takes 12.9-28.2s (n=7, median 14.0s). Rounds do not overlap — a second
// concurrent submission simply queues behind the first — so **one replica sustains about one
// concurrent player**, and a classroom of N students pressing Next Level together waits roughly
// N x 15s for the last of them. Size replicas from that, not from a latency target.
//
// The thresholds and timeout below used to be 3s and 30s, which no round has ever satisfied: the
// timeout was shorter than a single successful round, so at VUS=2 the run reported 57% errors
// that were entirely the client hanging up on work the server went on to finish. A load test that
// cannot pass at any concurrency measures its own configuration. They are env-overridable now and
// default to values a real round can meet.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const CALC_URL = __ENV.CALC_URL || 'http://localhost:8000';
const FIELDS = Number(__ENV.FIELDS || 812); // 28x29 board
// 2, not 20: at 20 the queue alone is ~5 minutes and every request times out, which tells you
// nothing you did not already know from the single-threaded server. Raise it deliberately.
const VUS = Number(__ENV.VUS || 2);
// Must exceed a QUEUED round (VUS x round time), or a slow request is recorded as an error the
// server never saw. This is the setting that made the old numbers meaningless.
const TIMEOUT = __ENV.TIMEOUT || '180s';
// A ceiling that a real round can meet, not a target anybody has committed to. Measured max was
// 28.2s at VUS=2; 60s leaves room for a queued one without hiding a genuine regression.
const P95_MS = Number(__ENV.P95_MS || 60000);
const ERROR_RATE = Number(__ENV.ERROR_RATE || 0.01);

const latency = new Trend('calc_latency', true);
const errors = new Rate('calc_errors');

export const options = {
	scenarios: {
		classroom: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '30s', target: VUS }, // ramp up to N concurrent students
				{ duration: '1m', target: VUS },  // hold
				{ duration: '15s', target: 0 },   // ramp down
			],
		},
	},
	thresholds: {
		calc_errors: [`rate<${ERROR_RATE}`],
		calc_latency: [`p(95)<${P95_MS}`],
	},
};

function allocation(n) {
	const lulcs = [10, 20, 30, 40, 50, 60];
	const a = [];
	for (let i = 0; i < n; i++) a.push({ id: i, lulc: lulcs[i % lulcs.length] });
	return a;
}

export default function () {
	const body = JSON.stringify({
		allocation: allocation(FIELDS),
		round: 1,
		score: 9725,
		game_id: `k6-${__VU}-${__ITER}`,
	});
	const res = http.post(CALC_URL, body, {
		headers: { 'Content-Type': 'application/json' },
		timeout: TIMEOUT,
	});
	latency.add(res.timings.duration);
	const ok = check(res, {
		'status is 200': (r) => r.status === 200,
		'returns results[]': (r) => {
			try { return Array.isArray(r.json('results')); } catch { return false; }
		},
	});
	errors.add(!ok);
	sleep(1);
}
