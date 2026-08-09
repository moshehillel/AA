/** Proxy White Glove dashboard API (keeps AWS key server-side). */
exports.handler = async (event) => {
  const baseUrl = process.env.WHITE_GLOVE_API_URL;
  const apiKey = process.env.WHITE_GLOVE_API_KEY;
  if (!baseUrl || !apiKey) {
    return {
      statusCode: 503,
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        error: "White Glove API not configured (WHITE_GLOVE_API_URL / WHITE_GLOVE_API_KEY)",
      }),
    };
  }

  const params = event.queryStringParameters || {};
  const action = params.action || "status";
  const method = event.httpMethod === "OPTIONS" ? "OPTIONS" : event.httpMethod;

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
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
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({error: err.message || "Upstream request failed"}),
    };
  }
};
