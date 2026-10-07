const { json, parseBody, methodNotAllowed } = require("./_lib/http");
const { requireAdmin } = require("./_lib/auth");
const { initBlobs, listClients, getClient, saveClient, publicClient } = require("./_lib/store");
const { hashPassword, slugify } = require("./_lib/passwords");

exports.handler = async (event) => {
  try {
    initBlobs(event);
    const admin = requireAdmin(event);
    if (!admin.ok) {
      return json(admin.status, { error: admin.error }, admin.status === 401 ? {
        "WWW-Authenticate": 'Basic realm="AA Admin", charset="UTF-8"',
      } : {});
    }

    if (event.httpMethod === "GET") {
      const clients = await listClients();
      return json(200, { clients: clients.map(publicClient) });
    }

    if (event.httpMethod === "POST") {
      const body = parseBody(event);
      const name = String(body.name || "").trim();
      const password = String(body.password || "");
      const defaultName = String(body.defaultName || "").trim();
      const defaultEmail = String(body.defaultEmail || "").trim();
      let slug = String(body.slug || slugify(name)).trim().toLowerCase();
      slug = slugify(slug);

      if (!name || !slug || !password) {
        return json(400, { error: "Name, slug, and password are required." });
      }
      if (password.length < 6) {
        return json(400, { error: "Password must be at least 6 characters." });
      }
      if (defaultEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultEmail)) {
        return json(400, { error: "Invalid default email format." });
      }

      const existing = await getClient(slug);
      if (existing) {
        return json(409, { error: "A client with that slug already exists." });
      }

      const client = {
        slug,
        name,
        defaultName,
        defaultEmail,
        passwordHash: hashPassword(password),
        active: true,
        createdAt: new Date().toISOString(),
      };
      await saveClient(client);
      return json(201, { client: publicClient(client) });
    }

    if (event.httpMethod === "PATCH") {
      const body = parseBody(event);
      const slug = String(body.slug || "").trim().toLowerCase();
      if (!slug) return json(400, { error: "Slug is required." });

      const client = await getClient(slug);
      if (!client) return json(404, { error: "Client not found." });

      if (typeof body.name === "string" && body.name.trim()) {
        client.name = body.name.trim();
      }
      if (typeof body.defaultName === "string") {
        client.defaultName = body.defaultName.trim();
      }
      if (typeof body.defaultEmail === "string") {
        const defaultEmail = body.defaultEmail.trim();
        if (defaultEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(defaultEmail)) {
          return json(400, { error: "Invalid default email format." });
        }
        client.defaultEmail = defaultEmail;
      }
      if (typeof body.active === "boolean") {
        client.active = body.active;
      }
      if (typeof body.password === "string" && body.password) {
        if (body.password.length < 6) {
          return json(400, { error: "Password must be at least 6 characters." });
        }
        client.passwordHash = hashPassword(body.password);
      }
      client.updatedAt = new Date().toISOString();
      await saveClient(client);
      return json(200, { client: publicClient(client) });
    }

    return methodNotAllowed();
  } catch (error) {
    console.error("admin-clients error:", error);
    return json(500, { error: "Internal server error" });
  }
};
