#!/usr/bin/env bash
# Shadow drop-in package: pack weights, parity (JS==Python), logging tests, perf, size. ~1.5 min. Node only.
set -euo pipefail
cd "$(dirname "$0")"
[ -d test/node_modules/fake-indexeddb ] || (cd test && npm install --no-audit --no-fund >/dev/null)
node tools/pack-glw.cjs > test/out/pack.json
node test/parity.test.cjs
node test/log.test.cjs
node bench/bench.cjs >/dev/null
node -e "const b=require('./bench/out/bench.json');console.log('perf ms p50/p95: prepare',b.ms.prepare.p50,b.ms.prepare.p95,'| v2',b.ms.scoreV2.p50,b.ms.scoreV2.p95,'| v21',b.ms.scoreV21.p50,b.ms.scoreV21.p95,'| SW',b.ms.handleSW.p50,b.ms.handleSW.p95,'| total',b.perMailTotal.p50,b.perMailTotal.p95)"
node tools/size-check.cjs
