const { json, parseBody, methodNotAllowed, getHeader } = require("./_lib/http");
const { loginClient, sessionCookie, adminSessionCookie } = require("./_lib/auth");
const { initBlobs, publicClient } = require("./_lib/store");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  try {
    initBlobs(event);
    const body = parseBody(event);
    const slug = String(body.slug || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!slug || !password) {
      return json(400, { error: "Slug and password are required." });
    }

    const result = await loginClient(slug, password);
    if (!result.ok) {
      return json(result.status, { error: result.error });
    }

    const proto = getHeader(event, "x-forwarded-proto") || "https";
    const secure = proto === "https";
    // Clear any admin session so leftover admin cookies cannot leak other clients' tickets.
    return json(
      200,
      { success: true, client: publicClient(result.client) },
      {
        "Set-Cookie": [
          sessionCookie(result.token, { secure }),
          adminSessionCookie("", { clear: true, secure }),
        ],
      }
    );
  } catch (error) {
    console.error("support-login error:", error);
    return json(500, { error: "Internal server error" });
  }
};
