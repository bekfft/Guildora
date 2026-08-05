const { execFile } = require('node:child_process');
const net = require('node:net');

const SCAN_INTERVAL_MS = 15_000;
const MAX_RPC_FRAME_BYTES = 16 * 1024;
const PIPE_NAME = '\\\\.\\pipe\\guildora-rich-presence';
const ACTIVITY_TYPES = new Set(['playing', 'streaming', 'listening', 'watching', 'competing']);

const GAME_CATALOG = [
  [/^minecraft\.windows\.exe$/i, 'Minecraft'],
  [/^fortniteclient-win64-shipping\.exe$/i, 'Fortnite'],
  [/^gta5\.exe$/i, 'Grand Theft Auto V'],
  [/^valorant-win64-shipping\.exe$/i, 'VALORANT'],
  [/^league of legends\.exe$/i, 'League of Legends'],
  [/^rocketleague\.exe$/i, 'Rocket League'],
  [/^cs2\.exe$/i, 'Counter-Strike 2'],
  [/^overwatch\.exe$/i, 'Overwatch 2'],
  [/^wow(?:classic)?\.exe$/i, 'World of Warcraft'],
  [/^diablo iv\.exe$/i, 'Diablo IV'],
  [/^robloxplayerbeta\.exe$/i, 'Roblox'],
  [/^fivem(?:_b\d+)?_gtaProcess\.exe$/i, 'FiveM'],
  [/^r5apex\.exe$/i, 'Apex Legends'],
  [/^eldenring\.exe$/i, 'Elden Ring'],
  [/^cyberpunk2077\.exe$/i, 'Cyberpunk 2077'],
  [/^witcher3\.exe$/i, 'The Witcher 3'],
  [/^bg3(?:_dx11)?\.exe$/i, "Baldur's Gate 3"],
  [/^dota2\.exe$/i, 'Dota 2'],
  [/^cod\.exe$/i, 'Call of Duty'],
  [/^rainbowsix(?:_vulkan)?\.exe$/i, "Tom Clancy's Rainbow Six Siege"],
  [/^deadbydaylight-win64-shipping\.exe$/i, 'Dead by Daylight'],
  [/^terraria\.exe$/i, 'Terraria'],
  [/^stardew valley\.exe$/i, 'Stardew Valley'],
  [/^among us\.exe$/i, 'Among Us'],
  [/^phasmophobia\.exe$/i, 'Phasmophobia'],
  [/^palworld-win64-shipping\.exe$/i, 'Palworld'],
  [/^helldivers2\.exe$/i, 'Helldivers 2'],
  [/^destiny2\.exe$/i, 'Destiny 2'],
  [/^warframe\.x64\.exe$/i, 'Warframe'],
  [/^eurotrucks2\.exe$/i, 'Euro Truck Simulator 2'],
  [/^aces\.exe$/i, 'War Thunder'],
  [/^worldoftanks\.exe$/i, 'World of Tanks'],
  [/^theforest\.exe$/i, 'The Forest'],
  [/^sonsOfTheForest\.exe$/i, 'Sons of the Forest'],
  [/^rustclient\.exe$/i, 'Rust'],
  [/^dayz_x64\.exe$/i, 'DayZ'],
  [/^escapeFromTarkov\.exe$/i, 'Escape from Tarkov'],
  [/^factorygame-win64-shipping\.exe$/i, 'Satisfactory'],
  [/^civilizationvi(?:_dx12)?\.exe$/i, 'Civilization VI'],
  [/^hoi4\.exe$/i, 'Hearts of Iron IV'],
  [/^eu4\.exe$/i, 'Europa Universalis IV'],
  [/^stellaris\.exe$/i, 'Stellaris']
];

function parseTasklist(output) {
  const processes = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^"([^"]+)","(\d+)"/);
    if (match) processes.push({ executable: match[1], pid: Number(match[2]) });
  }
  return processes;
}

function detectedGame(processes, registeredGames = []) {
  for (const game of registeredGames) {
    const process = processes.find((entry) => entry.executable.toLowerCase() === game.executable.toLowerCase());
    if (process) return { ...process, name: game.name };
  }
  for (const [pattern, name] of GAME_CATALOG) {
    const process = processes.find((entry) => pattern.test(entry.executable));
    if (process) return { ...process, name };
  }
  return null;
}

function cleanText(value, max, nullable = true) {
  if (typeof value !== 'string') return nullable ? null : '';
  const clean = value.trim().slice(0, max);
  return clean || (nullable ? null : '');
}

function normalizeRpcActivity(input, clientId) {
  if (!input || typeof input !== 'object') return null;
  const type = ACTIVITY_TYPES.has(input.type) ? input.type : 'playing';
  const name = cleanText(input.name, 128, false);
  if (!name) return null;
  const buttons = Array.isArray(input.buttons) ? input.buttons.slice(0, 2).map((button) => ({
    label: cleanText(button?.label, 32, false),
    url: cleanText(button?.url, 500, false)
  })).filter((button) => button.label && /^https?:\/\//i.test(button.url)) : [];
  const party = input.party && Number.isInteger(input.party.currentSize) && Number.isInteger(input.party.maxSize)
    && input.party.currentSize >= 0 && input.party.maxSize >= input.party.currentSize
    ? { id: cleanText(input.party.id, 128), currentSize: input.party.currentSize, maxSize: input.party.maxSize }
    : null;
  const assets = input.assets && typeof input.assets === 'object' ? {
    largeImage: cleanText(input.assets.largeImage, 500),
    largeText: cleanText(input.assets.largeText, 128),
    smallImage: cleanText(input.assets.smallImage, 500),
    smallText: cleanText(input.assets.smallText, 128)
  } : null;
  return {
    type,
    name,
    details: cleanText(input.details, 128),
    state: cleanText(input.state, 128),
    startedAt: Number.isSafeInteger(input.startedAt) && input.startedAt >= 0 ? input.startedAt : null,
    endsAt: Number.isSafeInteger(input.endsAt) && input.endsAt >= 0 ? input.endsAt : null,
    applicationId: cleanText(clientId, 80),
    source: 'rpc',
    assets,
    party,
    buttons,
    joinSecret: cleanText(input.joinSecret, 256)
  };
}

class ActivityBridge {
  constructor({ onActivity, runTasklist = execFile, platform = process.platform } = {}) {
    this.onActivity = onActivity || (() => {});
    this.runTasklist = runTasklist;
    this.platform = platform;
    this.enabled = true;
    this.detectGames = true;
    this.current = null;
    this.detected = null;
    this.detectedKey = null;
    this.rpcActivities = new Map();
    this.sequence = 0;
    this.registeredGames = [];
  }

  start() {
    this.startRpc();
    if (this.platform === 'win32') {
      void this.scan();
      this.scanTimer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
      this.scanTimer.unref?.();
    }
  }

  stop() {
    clearInterval(this.scanTimer);
    this.scanTimer = null;
    for (const socket of this.rpcActivities.keys()) socket.destroy();
    this.rpcActivities.clear();
    this.server?.close();
    this.server = null;
    this.publish(null);
  }

  configure({ enabled, detectGames, registeredGames } = {}) {
    if (typeof enabled === 'boolean') this.enabled = enabled;
    if (typeof detectGames === 'boolean') this.detectGames = detectGames;
    if (Array.isArray(registeredGames)) this.registeredGames = registeredGames.slice(0, 50);
    if (!this.detectGames) this.detected = null;
    if (this.enabled && this.detectGames) void this.scan();
    this.selectActivity();
    return { enabled: this.enabled, detectGames: this.detectGames, activity: this.current };
  }

  getActivity() {
    return this.current;
  }

  listProcesses() {
    if (this.platform !== 'win32') return Promise.resolve([]);
    return new Promise((resolve) => {
      this.runTasklist('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 4_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
        if (error) return resolve([]);
        const ignored = /^(?:system|idle|svchost|conhost|csrss|wininit|services|lsass|smss|dwm|explorer|tasklist|guildora|electron)\.exe$/i;
        const unique = new Map();
        for (const process of parseTasklist(stdout)) {
          if (!ignored.test(process.executable)) unique.set(process.executable.toLowerCase(), process);
        }
        resolve([...unique.values()].sort((a, b) => a.executable.localeCompare(b.executable)).slice(0, 200));
      });
    });
  }

  sendJoin({ applicationId, joinSecret } = {}) {
    const secret = cleanText(joinSecret, 256, false);
    if (!secret) return false;
    let delivered = false;
    for (const [socket, entry] of this.rpcActivities) {
      if (applicationId && entry.activity.applicationId !== applicationId) continue;
      socket.write(`${JSON.stringify({ event: 'ACTIVITY_JOIN', secret })}\n`);
      delivered = true;
    }
    return delivered;
  }

  scan() {
    if (!this.enabled || !this.detectGames || this.platform !== 'win32') return Promise.resolve();
    return new Promise((resolve) => {
      this.runTasklist('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 4_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
        if (!error) {
          const game = detectedGame(parseTasklist(stdout), this.registeredGames);
          if (!game) {
            this.detected = null;
            this.detectedKey = null;
          } else {
            const key = `${game.executable.toLowerCase()}:${game.pid}`;
            const startedAt = key === this.detectedKey ? this.detected?.startedAt : Date.now();
            this.detectedKey = key;
            this.detected = {
              type: 'playing', name: game.name, details: null, state: null,
              startedAt, endsAt: null, applicationId: null, source: 'detected',
              assets: null, party: null, buttons: [], joinSecret: null
            };
          }
          this.selectActivity();
        }
        resolve();
      });
    });
  }

  selectActivity() {
    if (!this.enabled) return this.publish(null);
    const rpc = [...this.rpcActivities.values()].sort((a, b) => b.sequence - a.sequence)[0];
    this.publish(rpc?.activity || (this.detectGames ? this.detected : null));
  }

  publish(activity) {
    if (JSON.stringify(activity) === JSON.stringify(this.current)) return;
    this.current = activity;
    this.onActivity(activity);
  }

  startRpc() {
    if (this.platform !== 'win32') return;
    this.server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer, 'utf8') > MAX_RPC_FRAME_BYTES) return socket.destroy();
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const frame = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          this.handleRpcFrame(socket, frame);
        }
      });
      socket.on('close', () => {
        if (this.rpcActivities.delete(socket)) this.selectActivity();
      });
      socket.on('error', () => {});
    });
    this.server.on('error', () => {});
    this.server.listen(PIPE_NAME);
  }

  handleRpcFrame(socket, frame) {
    try {
      const message = JSON.parse(frame);
      if (message.command === 'CLEAR_ACTIVITY') {
        this.rpcActivities.delete(socket);
        this.selectActivity();
        socket.write('{"ok":true}\n');
        return;
      }
      if (message.command !== 'SET_ACTIVITY') throw new Error('UNKNOWN_COMMAND');
      const activity = normalizeRpcActivity(message.activity, message.clientId);
      if (!activity) throw new Error('INVALID_ACTIVITY');
      this.rpcActivities.set(socket, { activity, sequence: ++this.sequence });
      this.selectActivity();
      socket.write('{"ok":true}\n');
    } catch (error) {
      socket.write(`${JSON.stringify({ ok: false, error: error.message })}\n`);
    }
  }
}

module.exports = {
  ACTIVITY_TYPES,
  GAME_CATALOG,
  PIPE_NAME,
  SCAN_INTERVAL_MS,
  ActivityBridge,
  detectedGame,
  normalizeRpcActivity,
  parseTasklist
};
