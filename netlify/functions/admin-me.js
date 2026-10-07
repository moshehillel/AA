const { json, methodNotAllowed } = require("./_lib/http");
const { requireAdmin } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return methodNotAllowed();
  const admin = requireAdmin(event);
  if (!admin.ok) {
    return json(admin.status, { authenticated: false, error: admin.error });
  }
  return json(200, { authenticated: true, role: "admin" });
};
