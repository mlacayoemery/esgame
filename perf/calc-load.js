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
// Set this to reach the calculator through an ingress, the way deploy/k8s/ingress-test.sh does:
// point CALC_URL at the controller (127.0.0.1:8880) and name the vhost here. Without it there is
// no way to test the deployed path — the .local names do not resolve, and adding them to
// /etc/hosts is exactly what the browser harness avoids (see e2e-cluster/browser-round.config.ts).
const CALC_HOST = __ENV.CALC_HOST || '';
const FIELDS = Number(__ENV.FIELDS || 812); // 28x29 board
// 2, not 20: at 20 the queue alone is ~5 minutes and every request times out, which tells you
// nothing you did not already know from the single-threaded server. Raise it deliberately.
const VUS = Number(__ENV.VUS || 2);
// Must exceed a QUEUED round (VUS x round time), or a slow request is recorded as an error the
// server never saw. This is the setting that made the old numbers meaningless.
const TIMEOUT = __ENV.TIMEOUT || '180s';
// How long a stage waits for rounds already in flight before interrupting them. Defaults to
// TIMEOUT so the two agree: a round is either finished, or failed on the timeout, never cut off.
const GRACEFUL = __ENV.GRACEFUL || TIMEOUT;
// OPT-IN, and unset by default. There is no honest cross-machine value for this.
//
// It used to default to 60000, justified by a measured max of 28.2s at VUS=2. Re-measured on a
// different machine on 2026-08-14, against a healthy cluster at the same VUS=2: three runs, 12
// rounds, spanning 27.1s to 89.0s, with the per-run median moving between 36.5s and 70s. Every
// round returned 200 with a full results[] and calc_errors was 0.00% in all three — and the first
// of them still failed, on the threshold alone. That is the 3s/30s defect again in a milder form:
// a number measured on one machine shipped as a gate for all of them. Round time is dominated by
// how loaded the host is and whether R is contending for cores, and it moved by more than 3x
// between two machines both of which were working correctly — and by 2x between runs on one.
//
// So: set it deliberately, from a baseline you measured on the machine you are gating, and only
// once you have more than one run. Unset, the Trend is still collected and printed — you get the
// number without pretending it is a budget.
const P95_MS = Number(__ENV.P95_MS || 0);
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
			// k6 defaults both of these to 30s, which is shorter than one round. A round still in
			// flight when a stage ends is INTERRUPTED, and an interrupted request arrives here as
			// status 0 — an error the server never committed. That is the same defect the old 30s
			// timeout had, in a different place: the run reports a broken backend because the
			// harness hung up on work that was proceeding normally. Both are the request timeout,
			// so nothing is cut off that the timeout would not already have failed on its merits.
			gracefulRampDown: GRACEFUL,
			gracefulStop: GRACEFUL,
		},
	},
	// calc_errors is the gate, and it is the one that means the same thing on every machine: a
	// round either comes back 200 with a results[] or it does not. TIMEOUT bounds it from above,
	// so a hung backend fails here rather than hanging the run — that is what makes this a real
	// check and not a recording device. calc_latency is added only when P95_MS is set.
	thresholds: Object.assign(
		{ calc_errors: [`rate<${ERROR_RATE}`] },
		P95_MS ? { calc_latency: [`p(95)<${P95_MS}`] } : {},
	),
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
	const headers = { 'Content-Type': 'application/json' };
	if (CALC_HOST) headers.Host = CALC_HOST;
	const res = http.post(CALC_URL, body, { headers, timeout: TIMEOUT });
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
