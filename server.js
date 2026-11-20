const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Retained buffers for controlled memory ramp / leak / reclaim tests.
const retainedBuffers = [];
let totalAllocatedMB = 0;

function rssMB() {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;
}

function heapUsedMB() {
  return Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 100) / 100;
}

app.get('/', (_req, res) => {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Keterix Benchmark App</title></head>
<body>
  <h1>Keterix Framework Benchmark Service</h1>
  <p>RSS: ${rssMB()} MB | Heap Used: ${heapUsedMB()} MB | Retained Buffers: ${totalAllocatedMB} MB | Uptime: ${Math.round(process.uptime())}s</p>
</body>
</html>`;
  res.status(200).type('html').send(html);
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    rss_mb: rssMB(),
    heap_used_mb: heapUsedMB(),
    retained_mb: totalAllocatedMB,
    uptime_sec: Math.round(process.uptime()),
  });
});

// Simulates SSR/API CPU work + transient allocation released after ms.
app.get('/work', (req, res) => {
  const mb = Math.min(Math.max(parseInt(req.query.mb || '4', 10) || 4, 1), 128);
  const ms = Math.min(Math.max(parseInt(req.query.ms || '25', 10) || 25, 1), 2000);

  const transient = Buffer.alloc(mb * 1024 * 1024, 0x42);
  const digest = crypto.createHash('sha256').update(transient.subarray(0, 4096)).digest('hex').slice(0, 12);

  setTimeout(() => {
    res.status(200).json({
      status: 'worked',
      transient_mb: mb,
      digest,
      rss_mb: rssMB(),
      retained_mb: totalAllocatedMB,
    });
  }, ms);
});

// Allocates and touches physical pages so cgroup RSS grows predictably.
app.all('/alloc', (req, res) => {
  const mb = Math.min(Math.max(parseInt(req.query.mb || '16', 10) || 16, 1), 256);
  const buf = Buffer.alloc(mb * 1024 * 1024, 0x41);
  // Touch every 4KB page to force Linux page commitment in cgroup RSS.
  for (let i = 0; i < buf.length; i += 4096) {
    buf[i] = (i & 0xff) ^ 0x55;
  }
  retainedBuffers.push(buf);
  totalAllocatedMB += mb;

  res.status(200).json({
    status: 'allocated',
    added_mb: mb,
    retained_mb: totalAllocatedMB,
    rss_mb: rssMB(),
  });
});

// Frees retained buffers so AI scale-down / overprovision_reclaim can be observed.
app.all('/free', (_req, res) => {
  retainedBuffers.length = 0;
  totalAllocatedMB = 0;
  if (typeof global.gc === 'function') {
    global.gc();
  }
  res.status(200).json({
    status: 'freed',
    retained_mb: totalAllocatedMB,
    rss_mb: rssMB(),
  });
});

// Deliberate rapid OOM trigger for Closed-Loop Auto-Heal / RCA verification.
app.all('/oom', (_req, res) => {
  res.status(202).json({ status: 'triggering_oom' });
  setImmediate(() => {
    while (true) {
      const chunk = Buffer.alloc(32 * 1024 * 1024, 0x4f);
      for (let i = 0; i < chunk.length; i += 4096) {
        chunk[i] = 0x4f;
      }
      retainedBuffers.push(chunk);
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`keterix-bench-app listening on port ${PORT}`);
});
