// ==============================================================================
// CLOUDFLARE PAGES FUNCTIONS: VERIFICACIÓN DE SESIÓN (verify.js)
// ==============================================================================

export async function onRequestGet(context) {
  // El middleware ya verificó la cookie de sesión y adjuntó data.adminSession
  const session = context.data.adminSession;
  if (!session || !session.admin) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      expiresAt: session.exp,
      timeRemainingMinutes: Math.max(0, Math.floor((session.exp - Math.floor(Date.now() / 1000)) / 60))
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
