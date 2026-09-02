const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.PORT || 3000);
const INDEX = path.join(__dirname, 'retro-road-trip.html');
const rooms = new Map();

function freshState() {
  return { notes: {}, moods: {}, moodsByClient: {}, votesByClient: {}, actions: [{}, {}, {}], revision: 0 };
}

function roomFor(id) {
  if (!rooms.has(id)) rooms.set(id, { state: freshState(), clients: new Map() });
  return rooms.get(id);
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

function safeText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function snapshot(room) {
  const participants = [...room.clients.values()].map(({ name }) => name);
  return { type: 'state', state: room.state, participants };
}

function broadcast(room) {
  const payload = `data: ${JSON.stringify(snapshot(room))}\n\n`;
  for (const client of room.clients.values()) client.res.write(payload);
}

function applyAction(room, action, clientId, name) {
  const state = room.state;
  const category = safeText(action.category, 40);
  switch (action.type) {
    case 'addNote': {
      const text = safeText(action.text);
      if (!text || !category) return false;
      state.notes[category] ||= [];
      state.notes[category].push({ id: action.id || `${Date.now()}-${Math.random()}`, text, votes: 0, author: safeText(name, 40) || 'Anônimo' });
      break;
    }
    case 'deleteNote': {
      if (!category || !state.notes[category]) return false;
      state.notes[category] = state.notes[category].filter(note => String(note.id) !== String(action.id));
      break;
    }
    case 'mood': {
      const mood = safeText(action.mood, 30);
      if (!mood) return false;
      const previous = state.moodsByClient[clientId];
      if (previous === mood) return false;
      if (previous) state.moods[previous] = Math.max(0, (state.moods[previous] || 0) - 1);
      state.moodsByClient[clientId] = mood;
      state.moods[mood] = (state.moods[mood] || 0) + 1;
      break;
    }
    case 'vote': {
      const used = state.votesByClient[clientId] || 0;
      if (used >= 3) return false;
      let found;
      for (const notes of Object.values(state.notes)) {
        found = notes.find(note => String(note.id) === String(action.id));
        if (found) break;
      }
      if (!found) return false;
      found.votes = (found.votes || 0) + 1;
      state.votesByClient[clientId] = used + 1;
      break;
    }
    case 'updateAction': {
      const index = Number(action.index);
      const field = ['what', 'owner', 'when'].includes(action.field) ? action.field : null;
      if (!Number.isInteger(index) || index < 0 || index > 2 || !field) return false;
      state.actions[index][field] = safeText(action.value, 300);
      break;
    }
    case 'clear':
      room.state = freshState();
      break;
    default:
      return false;
  }
  room.state.revision++;
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Payload muito grande'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const eventMatch = url.pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{3,40})\/events$/);
  const actionMatch = url.pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{3,40})\/actions$/);

  if (req.method === 'GET' && eventMatch) {
    const room = roomFor(eventMatch[1]);
    const clientId = safeText(url.searchParams.get('clientId'), 80);
    const name = safeText(url.searchParams.get('name'), 40) || 'Anônimo';
    if (!clientId) return json(res, 400, { error: 'clientId obrigatório' });
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    res.write('retry: 1500\n\n');
    const previous = room.clients.get(clientId);
    if (previous) previous.res.end();
    room.clients.set(clientId, { res, name });
    broadcast(room);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      if (room.clients.get(clientId)?.res === res) room.clients.delete(clientId);
      broadcast(room);
    });
    return;
  }

  if (req.method === 'POST' && actionMatch) {
    try {
      const room = roomFor(actionMatch[1]);
      const body = await readBody(req);
      const clientId = safeText(body.clientId, 80);
      if (!clientId) return json(res, 400, { error: 'clientId obrigatório' });
      const changed = applyAction(room, body.action || {}, clientId, body.name);
      if (!changed) return json(res, 422, { error: 'Ação inválida ou limite atingido' });
      broadcast(room);
      return json(res, 200, { ok: true, revision: room.state.revision });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/info') {
    const address = Object.values(os.networkInterfaces()).flat().find(item => item?.family === 'IPv4' && !item.internal)?.address || '';
    return json(res, 200, { localAddress: address, port: PORT });
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/retro-road-trip.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return fs.createReadStream(INDEX).pipe(res);
  }

  json(res, 404, { error: 'Não encontrado' });
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(os.networkInterfaces()).flat().filter(item => item?.family === 'IPv4' && !item.internal);
  console.log(`Retro colaborativa: http://localhost:${PORT}`);
  for (const item of addresses) console.log(`Na rede local:       http://${item.address}:${PORT}`);
});
