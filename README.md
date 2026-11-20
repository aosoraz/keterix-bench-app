# keterix-bench-app

Framework benchmark & chaos-testing Node.js/Express application for **Keterix PaaS**.

## Endpoints
- `GET /` — Lightweight HTML status page
- `GET /health` — JSON health check with RSS/Heap metrics
- `GET /work?mb=4&ms=25` — Transient CPU + buffer work simulation
- `POST /alloc?mb=16` — Commits physical RSS memory pages for leak/OOM forecast testing
- `POST /free` — Releases retained buffers for `overprovision_reclaim` scale-down testing
- `POST /oom` — Intentional memory exhaustion for Closed-Loop Auto-Heal RCA testing
