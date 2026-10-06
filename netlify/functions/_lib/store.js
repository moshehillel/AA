const { getStore } = require("@netlify/blobs");

function clientsStore() {
  return getStore("support-clients");
}

function ticketsStore() {
  return getStore("support-tickets");
}

async function listClients() {
  const store = clientsStore();
  const { blobs } = await store.list();
  const clients = [];
  for (const blob of blobs) {
    const client = await store.get(blob.key, { type: "json" });
    if (client) clients.push(client);
  }
  clients.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return clients;
}

async function getClient(slug) {
  if (!slug) return null;
  return clientsStore().get(slug, { type: "json" });
}

async function saveClient(client) {
  await clientsStore().setJSON(client.slug, client);
  return client;
}

async function listTickets() {
  const store = ticketsStore();
  const { blobs } = await store.list();
  const tickets = [];
  for (const blob of blobs) {
    if (!blob.key.startsWith("id:")) continue;
    const ticket = await store.get(blob.key, { type: "json" });
    if (ticket) tickets.push(ticket);
  }
  tickets.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return tickets;
}

async function getTicketById(id) {
  if (!id) return null;
  return ticketsStore().get(`id:${id}`, { type: "json" });
}

async function getTicketByToken(trackToken) {
  if (!trackToken) return null;
  const store = ticketsStore();
  const id = await store.get(`token:${trackToken}`, { type: "text" });
  if (!id) return null;
  return getTicketById(id);
}

async function saveTicket(ticket) {
  const store = ticketsStore();
  await store.setJSON(`id:${ticket.id}`, ticket);
  await store.set(`token:${ticket.trackToken}`, ticket.id);
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
