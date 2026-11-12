// ==============================================================================
// CLOUDFLARE PAGES FUNCTIONS: MIDDLEWARE DE SEGURIDAD ADMINISTRATIVO
// ==============================================================================

/**
 * Valida la firma HMAC-SHA256 de una cookie de sesión
 */
async function verifySessionToken(token, secret) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, signatureHex] = parts;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Convertir hex a Uint8Array
    const sigBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
    );

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payloadB64)
    );

    if (!isValid) return null;

    // Decodificar payload
    const payloadJson = atob(payloadB64);
    const session = JSON.parse(payloadJson);

    // Comprobar expiración
    const now = Math.floor(Date.now() / 1000);
    if (!session.exp || session.exp < now) {
      return null;
    }

    return session;
  } catch (err) {
    return null;
  }
}

/**
 * Parsea cookies de la cabecera Cookie
 */
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;

  cookieHeader.split(";").forEach((cookie) => {
    let [name, ...rest] = cookie.split("=");
    name = name.trim();
    if (!name) return;
    const value = rest.join("=").trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 1. Manejo de preflight CORS (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": url.origin,
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        "Access-Control-Allow-Credentials": "true"
      }
    });
  }

  // 2. Validación de ORIGIN y Sec-Fetch-Site para mitigar CSRF
  const origin = request.headers.get("origin");
  const currentHost = request.headers.get("host") || url.host;
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isCurrentLocal = currentHost.includes("localhost") || currentHost.includes("127.0.0.1");
      const isOriginLocal = originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";

      if (originUrl.host !== currentHost) {
        // En entorno local, solo permitimos si ambos son orígenes locales
        // Cualquier origen externo no autorizado (ej: malicious-site.com) se bloquea con 403
        if (!isCurrentLocal || !isOriginLocal) {
          return new Response(
            JSON.stringify({ error: "Origen no autorizado (Origin Mismatch)." }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Formato de origen inválido." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (secFetchSite && secFetchSite === "cross-site") {
    return new Response(
      JSON.stringify({ error: "Petición rechazada por política Cross-Site." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Validación de cabecera anti-CSRF en mutaciones (POST, PATCH, DELETE, PUT)
  const isMutation = ["POST", "PATCH", "DELETE", "PUT"].includes(request.method);
  if (isMutation) {
    const customHeader = request.headers.get("x-requested-with");
    if (customHeader !== "YamikiAdmin") {
      return new Response(
        JSON.stringify({ error: "Cabecera de seguridad X-Requested-With requerida." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // 4. Ruta pública de Login: no requiere sesión previa
  if (url.pathname === "/api/admin/login") {
    return context.next();
  }

  // 5. Verificación de sesión administrativa mediante Cookie HttpOnly
  const cookies = parseCookies(request.headers.get("Cookie"));
  const sessionToken = cookies["yamiki_admin_session"];
  const secret = env.SESSION_SECRET || "yamiki-dev-session-secret-fallback-key-2026-s925";

  const session = await verifySessionToken(sessionToken, secret);
  if (!session || !session.admin) {
    return new Response(
      JSON.stringify({ error: "Sesión no válida o expirada. Por favor identifícate nuevamente.", code: "AUTH_REQUIRED" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "yamiki_admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"
        }
      }
    );
  }

  // Sesión validada correctamente; adjuntar a contexto y continuar
  context.data.adminSession = session;
  return context.next();
}
