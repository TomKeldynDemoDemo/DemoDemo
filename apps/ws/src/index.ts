import { WebSocketServer } from 'ws';
import { GameManager } from './GameManager';
import url from 'url';
import dotenv from 'dotenv';
import path from 'path';
import { extractAuthUser } from './auth';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../backend/.env') });

const wss = new WebSocketServer({ port: 8080 });

const gameManager = new GameManager();

wss.on('connection', async function connection(ws, req) {
  const token = url.parse(req.url || '', true).query.token;
  if (typeof token !== 'string') {
    ws.close();
    return;
  }
  try {
    const user = await extractAuthUser(token, ws);
    if (!user) {
      ws.close();
      return;
    }
    gameManager.addUser(user);
  } catch (error) {
    console.error(error);
    ws.close();
  }

  ws.on('close', () => {
    gameManager.removeUser(ws);
  });
});

console.log('done');
