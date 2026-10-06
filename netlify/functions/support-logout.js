const { json, methodNotAllowed, getHeader } = require("./_lib/http");
const { sessionCookie } = require("./_lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const proto = getHeader(event, "x-forwarded-proto") || "https";
  return json(
    200,
    { success: true },
    { "Set-Cookie": sessionCookie("", { clear: true, secure: proto === "https" }) }
  );
};
