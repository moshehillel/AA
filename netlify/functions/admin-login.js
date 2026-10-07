const { json, parseBody, methodNotAllowed, getHeader } = require("./_lib/http");
const { loginAdmin, adminSessionCookie } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    const body = parseBody(event);
    const password = String(body.password || "");
    if (!password) {
      return json(400, { error: "Password is required." });
    }

    const result = loginAdmin(password);
    if (!result.ok) {
      return json(result.status, { error: result.error });
    }

    const proto = getHeader(event, "x-forwarded-proto") || "https";
    return json(
      200,
      { success: true, role: "admin" },
      { "Set-Cookie": adminSessionCookie(result.token, { secure: proto === "https" }) }
    );
  } catch (error) {
    console.error("admin-login error:", error);
    return json(500, { error: "Internal server error" });
  }
};
