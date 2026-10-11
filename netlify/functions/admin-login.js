const { json, parseBody, methodNotAllowed, getHeader } = require("./_lib/http");
const { loginAdmin, adminSessionCookie, sessionCookie } = require("./_lib/auth");

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
    const secure = proto === "https";
    // Clear any client session when signing into admin.
    return json(
      200,
      { success: true, role: "admin" },
      {
        "Set-Cookie": [
          adminSessionCookie(result.token, { secure }),
          sessionCookie("", { clear: true, secure }),
        ],
      }
    );
  } catch (error) {
    console.error("admin-login error:", error);
    return json(500, { error: "Internal server error" });
  }
};
