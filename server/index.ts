import { createGameServer } from './app.js';

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1–65535');
const development = process.argv.includes('--dev');
const { httpServer, io, adminPassword } = createGameServer({ development });
httpServer.listen(port, development ? '127.0.0.1' : process.env.HOST ?? '0.0.0.0', () => {
  console.log('Halloween HR Game: http://localhost:' + port + (development ? '/?room=demo' : '/'));
  if (development) console.log('DEV MODE: localhost tabs can play as independent players.');
  console.log('Admin: http://localhost:' + port + '/admin');
  if (!process.env.ADMIN_PASSWORD) console.log('Temporary admin password: ' + adminPassword);
  console.log('Stop: Ctrl+C');
});
httpServer.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  io.close();
});
