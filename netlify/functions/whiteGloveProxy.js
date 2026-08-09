/** Proxy White Glove dashboard + sandbox APIs (keeps AWS keys server-side). */
exports.handler = async (event) => {
  const baseUrl = process.env.WHITE_GLOVE_API_URL;
  const apiKey = process.env.WHITE_GLOVE_API_KEY;
  const sandboxUrl = process.env.WHITE_GLOVE_SANDBOX_URL;
  const sandboxKey = process.env.WHITE_GLOVE_SANDBOX_KEY;

  const params = event.queryStringParameters || {};
  const action = params.action || "status";
  const method = event.httpMethod === "OPTIONS" ? "OPTIONS" : event.httpMethod;

  const jsonHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        ...jsonHeaders,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (action === "sandbox") {
    if (!sandboxUrl || !sandboxKey) {
      return {
        statusCode: 503,
        headers: jsonHeaders,
        body: JSON.stringify({
          error:
            "Sandbox not configured (WHITE_GLOVE_SANDBOX_URL / WHITE_GLOVE_SANDBOX_KEY)",
        }),
      };
    }

    if (method !== "POST") {
      return {
        statusCode: 405,
        headers: jsonHeaders,
        body: JSON.stringify({error: "Use POST for sandbox action"}),
      };
    }

    try {
      const target = new URL(sandboxUrl);
      target.searchParams.set("key", sandboxKey);
      target.searchParams.set("format", "json");

      const res = await fetch(target.toString(), {
        method: "GET",
        headers: {Accept: "application/json"},
      });
      const text = await res.text();

      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = JSON.parse(text);
        if (!res.ok) {
          return {
            statusCode: res.status,
            headers: jsonHeaders,
            body: JSON.stringify({error: data.error || data.message || text}),
          };
        }
        return {
          statusCode: res.status,
          headers: jsonHeaders,
          body: JSON.stringify(data),
        };
      }

      if (res.status === 202 || res.ok) {
        const runIdMatch = text.match(/Run ID:\s*<code>([^<]+)<\/code>/i);
        return {
          statusCode: 202,
          headers: jsonHeaders,
          body: JSON.stringify({
            ok: true,
            runId: runIdMatch ? runIdMatch[1] : null,
            message:
              "Sandbox run started. Same logic as live — no HHA writes. Email summary in 5–20 minutes.",
          }),
        };
      }

      return {
        statusCode: res.status,
        headers: jsonHeaders,
        body: JSON.stringify({error: text.slice(0, 300) || "Sandbox trigger failed"}),
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: jsonHeaders,
        body: JSON.stringify({error: err.message || "Sandbox request failed"}),
      };
    }
  }

  if (!baseUrl || !apiKey) {
    return {
      statusCode: 503,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: "White Glove API not configured (WHITE_GLOVE_API_URL / WHITE_GLOVE_API_KEY)",
      }),
    };
  }

  const target = new URL(baseUrl);
  target.searchParams.set("key", apiKey);
  target.searchParams.set("action", action);

  const init = {
    method: method === "GET" ? "GET" : "POST",
    headers: {"Content-Type": "application/json"},
  };
  if (method === "POST" && event.body) {
    init.body = event.body;
  }

  try {
    const res = await fetch(target.toString(), init);
    const text = await res.text();
    return {
      statusCode: res.status,
      headers: jsonHeaders,
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: jsonHeaders,
      body: JSON.stringify({error: err.message || "Upstream request failed"}),
    };
  }
};
