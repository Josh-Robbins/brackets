import http from 'node:http';

function json(body) {
  return JSON.stringify(body, null, 2);
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end('Missing URL');
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');

  if (url.pathname === '/api/summary') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(json({
      remoteCount: 7,
      remoteMessage: 'Remote summary loaded through the framework API contract.'
    }));
    return;
  }

  if (url.pathname === '/api/status') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8'
    });
    res.end(json({
      ok: true
    }));
    return;
  }

  if (url.pathname === '/events/counts') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      res.write(`event: datastar-patch-signals\n`);
      res.write(`data: ${JSON.stringify({ liveCount: count })}\n\n`);
    }, 1000);

    req.on('close', () => {
      clearInterval(timer);
      res.end();
    });
    return;
  }

  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Not found');
});

server.listen(4174, '127.0.0.1', () => {
  console.log('Remote demo backend running at http://127.0.0.1:4174');
});
