import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const BUILD_ID = "BUILD-OK-V3";

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Build-Id', BUILD_ID);
    next();
  });

  app.get('/health', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send("OK");
  });

  app.get('/__build', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(BUILD_ID);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FocusBuddy Server [${BUILD_ID}]`);
    console.log(`Listening on port ${PORT}`);
  });
}

startServer();
