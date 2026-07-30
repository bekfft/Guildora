import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { runMigrations } from './db/index.js';
import authRouter from './routes/auth.js';
import channelsRouter from './routes/channels.js';
import guildsRouter from './routes/guilds.js';
import invitesRouter from './routes/invites.js';
import messagesRouter from './routes/messages.js';
import releasesRouter from './routes/releases.js';
import voiceRouter from './routes/voice.js';
import socialRouter from './routes/social.js';
import uploadsRouter from './routes/uploads.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { configureRealtime } from './realtime.js';
import { clientOrigins } from './config/clientOrigins.js';

export const app = express();

app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet());
app.use(cors({
  origin: clientOrigins,
  credentials: true
}));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', releasesRouter);
app.use('/api/voice', voiceRouter);
app.use('/api/auth', authRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/social', socialRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/guilds', guildsRouter);
app.use('/api/channels', channelsRouter);
app.use('/api', messagesRouter);
app.use('/api', notFoundHandler);
app.use(errorHandler);

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const port = Number(process.env.PORT) || 3001;
  await runMigrations();
  const server = http.createServer(app);
  configureRealtime(server);
  server.listen(port, () => {
    console.log(`Guildora-API läuft auf http://localhost:${port}`);
  });
}
