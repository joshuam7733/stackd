// Entry point: `npm start` (or `node server/main.js`).
import { startApp } from './app.js';

const app = await startApp();
const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
