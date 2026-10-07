const fs = require("fs");
const path = require("path");
const { connectLambda, getStore } = require("@netlify/blobs");

const FILE_ROOT = path.join(process.cwd(), ".netlify", "support-data");

let storeMode = null; // "blobs" | "file"

// Classic Netlify Functions run in Lambda compatibility mode: Blobs context
// is not auto-injected. Call this with the Lambda `event` before any store I/O.
function initBlobs(event) {
  if (event && event.blobs) {
    connectLambda(event);
    storeMode = "blobs";
    return;
  }
  // Local / unlinked netlify dev: fall through to detectMode on first use.
}

function detectMode() {
  if (storeMode) return storeMode;
  if (process.env.SUPPORT_STORE === "file") {
    storeMode = "file";
    return storeMode;
  }
  try {
    getStore("support-clients");
    storeMode = "blobs";
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (
      error.name === "MissingBlobsEnvironmentError" ||
      message.includes("Netlify Blobs") ||
      message.includes("siteID")
    ) {
      console.warn("Netlify Blobs unavailable; using local file store at", FILE_ROOT);
      storeMode = "file";
    } else {
      throw error;
    }
  }
  return storeMode;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function encodeKey(key) {
  return Buffer.from(String(key), "utf8").toString("base64url");
}

function decodeKey(encoded) {
  return Buffer.from(String(encoded), "base64url").toString("utf8");
}

function encodedFilePath(storeName, key) {
  return path.join(FILE_ROOT, storeName, `${encodeKey(key)}.json`);
}

async function storeGet(storeName, key, { type = "json" } = {}) {
  if (detectMode() === "blobs") {
    return getStore(storeName).get(key, { type });
  }
  const full = encodedFilePath(storeName, key);
  if (!fs.existsSync(full)) return null;
  const raw = fs.readFileSync(full, "utf8");
  if (type === "text") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "string" ? parsed : String(parsed);
    } catch {
      return raw;
    }
  }
  return JSON.parse(raw);
}

async function storeSetJSON(storeName, key, value) {
  if (detectMode() === "blobs") {
    await getStore(storeName).setJSON(key, value);
    return;
  }
  const full = encodedFilePath(storeName, key);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, JSON.stringify(value), "utf8");
}

async function storeSetText(storeName, key, value) {
  if (detectMode() === "blobs") {
    await getStore(storeName).set(key, value);
    return;
  }
  const full = encodedFilePath(storeName, key);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, JSON.stringify(value), "utf8");
}

async function storeListKeys(storeName) {
  if (detectMode() === "blobs") {
    const { blobs } = await getStore(storeName).list();
    return blobs.map((b) => b.key);
  }
  const dir = path.join(FILE_ROOT, storeName);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => decodeKey(name.slice(0, -5)));
}

const CLIENTS = "support-clients";
const TICKETS = "support-tickets";

async function listClients() {
  const keys = await storeListKeys(CLIENTS);
  const clients = [];
  for (const key of keys) {
    const client = await storeGet(CLIENTS, key, { type: "json" });
    if (client) clients.push(client);
  }
  clients.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return clients;
}

async function getClient(slug) {
  if (!slug) return null;
  return storeGet(CLIENTS, slug, { type: "json" });
}

async function saveClient(client) {
  await storeSetJSON(CLIENTS, client.slug, client);
  return client;
}

async function listTickets() {
  const keys = await storeListKeys(TICKETS);
  const tickets = [];
  for (const key of keys) {
    if (!key.startsWith("id:")) continue;
    const ticket = await storeGet(TICKETS, key, { type: "json" });
    if (ticket) tickets.push(ticket);
  }
  tickets.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return tickets;
}

async function getTicketById(id) {
  if (!id) return null;
  return storeGet(TICKETS, `id:${id}`, { type: "json" });
}

async function getTicketByToken(trackToken) {
  if (!trackToken) return null;
  const id = await storeGet(TICKETS, `token:${trackToken}`, { type: "text" });
  if (!id) return null;
  return getTicketById(id);
}

async function saveTicket(ticket) {
  await storeSetJSON(TICKETS, `id:${ticket.id}`, ticket);
  await storeSetText(TICKETS, `token:${ticket.trackToken}`, ticket.id);
  return ticket;
}

function publicTicket(ticket) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    trackToken: ticket.trackToken,
    clientSlug: ticket.clientSlug,
    clientName: ticket.clientName,
    requesterName: ticket.requesterName,
    requesterEmail: ticket.requesterEmail,
    subject: ticket.subject,
    status: ticket.status,
    messages: ticket.messages || [],
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function publicClient(client) {
  if (!client) return null;
  return {
    slug: client.slug,
    name: client.name,
    active: client.active !== false,
    createdAt: client.createdAt,
  };
}

module.exports = {
  initBlobs,
  listClients,
  getClient,
  saveClient,
  listTickets,
  getTicketById,
  getTicketByToken,
  saveTicket,
  publicTicket,
  publicClient,
};
