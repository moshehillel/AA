const { json, methodNotAllowed } = require("./_lib/http");
const { requireClientSession } = require("./_lib/auth");
const { publicClient } = require("./_lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();

  try {
    const auth = await requireClientSession(event);
    if (!auth.ok) {
      return json(auth.status, { error: auth.error, authenticated: false });
    }
    return json(200, { authenticated: true, client: publicClient(auth.client) });
  } catch (error) {
    console.error("support-me error:", error);
    return json(500, { error: "Internal server error" });
  }
};
