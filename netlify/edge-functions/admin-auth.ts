import type { Context } from "https://edge.netlify.com";

// Only normalize /admin → /admin/. Auth is handled by the admin login
// form + session cookie so API calls to /.netlify/functions also work.
export default async (request: Request, context: Context) => {
  const url = new URL(request.url);

  if (url.pathname === "/admin") {
    const redirectUrl = new URL(url);
    redirectUrl.pathname = "/admin/";
    return Response.redirect(redirectUrl, 301);
  }

  return context.next();
};

export const config = { path: ["/admin", "/admin/*"] };
