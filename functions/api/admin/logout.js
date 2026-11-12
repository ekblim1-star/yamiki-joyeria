// ==============================================================================
// CLOUDFLARE PAGES FUNCTIONS: CIERRE DE SESIÓN (logout.js)
// ==============================================================================

export async function onRequestPost(context) {
  const isSecure = new URL(context.request.url).protocol === "https:";
  const cookieHeader = `yamiki_admin_session=; Path=/; Max-Age=0; HttpOnly; ${isSecure ? "Secure;" : ""} SameSite=Strict`;

  return new Response(
    JSON.stringify({ success: true, message: "Sesión cerrada correctamente." }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieHeader
      }
    }
  );
}
