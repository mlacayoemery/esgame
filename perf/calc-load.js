// k6 load test for the esgame calculation backend (the `calcUrl` endpoint the browser POSTs to
// on each level change). Models a classroom of students submitting their allocation at once —
// the realistic load, and the likely bottleneck since R/Plumber is single-threaded.
//
//   k6 run -e CALC_URL=http://localhost:8000 -e VUS=20 perf/calc-load.js
//
// Tune VUS (concurrent students) until p95 latency / error thresholds break to find how many
// concurrent players one backend replica sustains — informs the K8s replica count.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const CALC_URL = __ENV.CALC_URL || 'http://localhost:8000';
const FIELDS = Number(__ENV.FIELDS || 812); // 28x29 board
const VUS = Number(__ENV.VUS || 20);

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
		calc_errors: ['rate<0.01'],      // <1% errors
		calc_latency: ['p(95)<3000'],    // 95% of level submits under 3s
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
		timeout: '30s',
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
