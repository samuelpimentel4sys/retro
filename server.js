const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();

function retroState() {
  return { notes: {}, moods: {}, moodsByClient: {}, survivals: {}, survivalByClient: {}, votesByClient: {}, actions: [{}, {}, {}], revision: 0 };
}

function nexusState() {
  return { notes: [], votesByClient: {}, bets: {}, authorsHidden: true, revision: 0 };
}

function safeText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function applyRetroAction(room, action, clientId, name) {
  const state = room.state;
  const category = safeText(action.category, 40);
  switch (action.type) {
    case 'addNote': {
      const text = safeText(action.text);
      if (!text || !category) return false;
      state.notes[category] ||= [];
      state.notes[category].push({ id: safeText(action.id, 100) || `${Date.now()}-${Math.random()}`, text, votes: 0, author: safeText(name, 40) || 'Anônimo' });
      break;
    }
    case 'deleteNote': {
      if (!category || !state.notes[category]) return false;
      const length = state.notes[category].length;
      state.notes[category] = state.notes[category].filter(note => String(note.id) !== String(action.id));
      if (length === state.notes[category].length) return false;
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
    case 'survival': {
      const survival = safeText(action.survival, 30);
      if (!survival) return false;
      const previous = state.survivalByClient[clientId];
      if (previous === survival) return false;
      if (previous) state.survivals[previous] = Math.max(0, (state.survivals[previous] || 0) - 1);
      state.survivalByClient[clientId] = survival;
      state.survivals[survival] = (state.survivals[survival] || 0) + 1;
      break;
    }
    case 'vote': {
      const used = state.votesByClient[clientId] || 0;
      if (used >= 3) return false;
      const found = Object.values(state.notes).flat().find(note => String(note.id) === String(action.id));
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
      return resetRoom(room, retroState);
    default:
      return false;
  }
  state.revision++;
  return true;
}

function findNexusNote(state, id) {
  return state.notes.find(note => String(note.id) === String(id));
}

function applyNexusAction(room, action, clientId, name) {
  const state = room.state;
  switch (action.type) {
    case 'addNote': {
      const text = safeText(action.text);
      const zone = safeText(action.zone, 40);
      const color = safeText(action.color, 20);
      if (!text || !zone || !['yellow', 'green', 'blue', 'purple', 'pink', 'gray'].includes(color)) return false;
      state.notes.push({
        id: safeText(action.id, 100) || `${Date.now()}-${Math.random()}`,
        zone,
        text,
        color,
        votes: 0,
        author: safeText(name, 40) || 'Anônimo'
      });
      break;
    }
    case 'deleteNote': {
      const length = state.notes.length;
      state.notes = state.notes.filter(note => String(note.id) !== String(action.id));
      if (length === state.notes.length) return false;
      for (const votes of Object.values(state.votesByClient)) delete votes[action.id];
      break;
    }
    case 'moveNote': {
      const note = findNexusNote(state, action.id);
      const zone = safeText(action.zone, 40);
      if (!note || !zone || (note.votes || 0) > 0) return false;
      note.zone = zone;
      break;
    }
    case 'changeVote': {
      const note = findNexusNote(state, action.id);
      if (!note) return false;
      const delta = Number(action.delta);
      if (![1, -1].includes(delta)) return false;
      state.votesByClient[clientId] ||= {};
      const myVotes = state.votesByClient[clientId];
      const noteVotes = Number(myVotes[action.id]) || 0;
      if (delta === -1) {
        if (noteVotes <= 0) return false;
        if (noteVotes === 1) delete myVotes[action.id];
        else myVotes[action.id] = noteVotes - 1;
        note.votes = Math.max(0, (note.votes || 0) - 1);
      } else {
        const usedInZone = state.notes
          .filter(item => item.zone === note.zone)
          .reduce((total, item) => total + (Number(myVotes[item.id]) || 0), 0);
        if (usedInZone >= 3) return false;
        myVotes[action.id] = noteVotes + 1;
        note.votes = (note.votes || 0) + 1;
      }
      break;
    }
    case 'setAuthorsHidden': {
      if (room.masterClientId !== clientId || typeof action.hidden !== 'boolean') return false;
      state.authorsHidden = action.hidden;
      break;
    }
    case 'updateBet': {
      const field = safeText(action.field, 20);
      if (!/^bet[1-3][ohpfs]$/.test(field)) return false;
      state.bets[field] = safeText(action.value, 1000);
      break;
    }
    case 'clear':
      return resetRoom(room, nexusState);
    default:
      return false;
  }
  state.revision++;
  return true;
}

const activities = {
  retro: { freshState: retroState, applyAction: applyRetroAction },
  nexus: { freshState: nexusState, applyAction: applyNexusAction }
};

function resetRoom(room, freshState) {
  const nextRevision = room.state.revision + 1;
  room.state = freshState();
  room.state.revision = nextRevision;
  return true;
}

function roomFor(activityId, roomId) {
  const key = `${activityId}:${roomId}`;
  if (!rooms.has(key)) rooms.set(key, { state: activities[activityId].freshState(), clients: new Map(), participants: new Map(), masterClientId: null });
  return rooms.get(key);
}

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

function snapshot(room, clientId) {
  const now = Date.now();
  for (const [id, participant] of room.participants) {
    if (now - participant.lastSeen > 15_000) room.participants.delete(id);
  }
  return { type: 'state', state: room.state, participants: [...room.participants.values()].map(({ name }) => name), isMaster: room.masterClientId === clientId };
}

function touchParticipant(room, clientId, name) {
  if (!clientId) return;
  if (!room.masterClientId) room.masterClientId = clientId;
  room.participants.set(clientId, { name: safeText(name, 40) || 'Anônimo', lastSeen: Date.now() });
}

function broadcast(room) {
  for (const [clientId, client] of room.clients) {
    const payload = `data: ${JSON.stringify(snapshot(room, clientId))}\n\n`;
    client.res.write(payload);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let rejected = false;
    req.on('data', chunk => {
      if (rejected) return;
      body += chunk;
      if (body.length > 1_000_000) {
        rejected = true;
        reject(new Error('Payload muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (rejected) return;
      try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function matchApi(pathname) {
  const current = pathname.match(/^\/api\/activities\/(retro|nexus)\/rooms\/([a-zA-Z0-9_-]{3,40})\/(events|actions|state)$/);
  if (current) return { activityId: current[1], roomId: current[2], resource: current[3] };
  const legacy = pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]{3,40})\/(events|actions|state)$/);
  if (legacy) return { activityId: 'retro', roomId: legacy[1], resource: legacy[2] };
  return null;
}

function serveHtml(res, filename) {
  const file = path.join(__dirname, filename);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  fs.createReadStream(file).on('error', () => {
    if (!res.headersSent) json(res, 404, { error: 'Não encontrado' });
    else res.destroy();
  }).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const api = matchApi(url.pathname);

  if (req.method === 'GET' && api?.resource === 'events') {
    const room = roomFor(api.activityId, api.roomId);
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
    touchParticipant(room, clientId, name);
    broadcast(room);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      if (room.clients.get(clientId)?.res === res) room.clients.delete(clientId);
      broadcast(room);
    });
    return;
  }

  if (req.method === 'GET' && api?.resource === 'state') {
    const room = roomFor(api.activityId, api.roomId);
    const clientId = safeText(url.searchParams.get('clientId'), 80);
    const name = safeText(url.searchParams.get('name'), 40) || 'Anônimo';
    if (!clientId) return json(res, 400, { error: 'clientId obrigatório' });
    touchParticipant(room, clientId, name);
    return json(res, 200, snapshot(room, clientId));
  }

  if (req.method === 'POST' && api?.resource === 'actions') {
    try {
      const room = roomFor(api.activityId, api.roomId);
      const body = await readBody(req);
      const clientId = safeText(body.clientId, 80);
      if (!clientId) return json(res, 400, { error: 'clientId obrigatório' });
      touchParticipant(room, clientId, body.name);
      const changed = activities[api.activityId].applyAction(room, body.action || {}, clientId, body.name);
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

  if (req.method === 'GET' && url.pathname === '/' && url.searchParams.has('room')) {
    res.writeHead(302, { location: `/retro-road-trip.html${url.search}` });
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/') return serveHtml(res, 'index.html');
  if (req.method === 'GET' && url.pathname === '/retro-road-trip.html') return serveHtml(res, 'retro-road-trip.html');
  if (req.method === 'GET' && url.pathname === '/nexus-workshop.html') return serveHtml(res, 'nexus-workshop.html');

  return json(res, 404, { error: 'Não encontrado' });
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(os.networkInterfaces()).flat().filter(item => item?.family === 'IPv4' && !item.internal);
  console.log(`Hub colaborativo: http://localhost:${PORT}`);
  for (const item of addresses) console.log(`Na rede local:     http://${item.address}:${PORT}`);
});
