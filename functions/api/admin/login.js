// ==============================================================================
// CLOUDFLARE PAGES FUNCTIONS: AUTENTICACIÓN ADMINISTRATIVA (login.js)
// ==============================================================================

/**
 * Valida el token de Cloudflare Turnstile del lado del servidor contra el endpoint oficial
 * Cumplimiento estricto: Fail-Closed ante cualquier anomalía o error de red.
 */
async function verifyTurnstileToken(token, secretKey, remoteIp, isDevEnvironment = false, expectedHost = null) {
  // 1. Token obligatorio
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return false;
  }

  // 2. Si no hay secretKey configurado:
  // En producción (o por defecto si no es explícitamente dev), FALLA DE FORMA SEGURA (fail-closed)
  if (!secretKey) {
    if (isDevEnvironment && token === "dummy_dev_token") {
      console.warn("[DEV MODE]: Turnstile validado con dummy token local.");
      return true;
    }
    console.error("[SEGURIDAD]: TURNSTILE_SECRET_KEY no configurado en entorno de producción. Rechazando autenticación.");
    return false;
  }

  // 3. En producción (cuando secretKey está presente):
  // Rechazar explícitamente tokens dummy o de prueba
  if (token === "dummy_dev_token" || token.startsWith("dummy_") || token === "test_token") {
    console.warn("[SEGURIDAD]: Token de prueba rechazado explícitamente en entorno con clave secreta activa.");
    return false;
  }

  // 4. Llamada al endpoint oficial Siteverify de Cloudflare
  try {
    const formData = new FormData();
    formData.append("secret", secretKey);
    formData.append("response", token);
    // Nota de seguridad Cloudflare: no se envía remoteip para evitar falsos rechazos (invalid-remoteip)
    // causados por conexiones móviles, NAT de operadores o diferencias IPv4/IPv6 entre el iframe y la función.

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      console.error(`[SEGURIDAD]: Cloudflare Turnstile Siteverify retornó HTTP ${res.status}`);
      return false;
    }

    const outcome = await res.json();
    if (outcome.success !== true) {
      console.error("[SEGURIDAD]: Cloudflare Turnstile Siteverify denegó el token:", outcome["error-codes"] || outcome);
      return false;
    }

    // 5. Validación de Hostname (previene ataques de reenvío desde dominios externos)
    if (expectedHost && outcome.hostname) {
      const normExpected = expectedHost.toLowerCase().trim();
      const normIssued = outcome.hostname.toLowerCase().trim();
      const isAllowedHost = normIssued === normExpected ||
        normExpected.endsWith("." + normIssued) ||
        normIssued.endsWith("." + normExpected) ||
        normIssued.includes("yamiki-joyeria.pages.dev") ||
        normIssued.includes("yamikijoyeria.com") ||
        (normExpected === "localhost" && normIssued === "127.0.0.1") ||
        (normExpected === "127.0.0.1" && normIssued === "localhost");

      if (!isAllowedHost) {
        console.error(`[SEGURIDAD]: Turnstile hostname inválido. Emitido para: ${outcome.hostname}, Petición desde: ${expectedHost}`);
        return false;
      }
    }

    return true;
  } catch (err) {
    // CERO bypass por error de red: ante cualquier fallo de red se deniega el acceso de inmediato
    console.error("[SEGURIDAD]: Error de red al contactar Cloudflare Turnstile Siteverify:", err.message);
    return false;
  }
}

/**
 * Verificación de Contraseña y PIN de Seguridad Administrativa
 * Soporta PBKDF2 (HMAC-SHA512, 210,000 iteraciones) y hashes autorizados de Yamiki Joyería.
 * Normaliza espacios accidentales y diferencias de mayúsculas/minúsculas.
 */
const ALLOWED_ADMIN_SHA256 = [
  "2fdb26c08f0dec644da0057a69ec9720eedb71c90de0fc2f871f6d6ba24bc349", // Yamitaeslamasbonitamymonkeynovia
  "7b4282e8cfed588a578a4b55f6eb6e9546fe1a979c737c5928a571778db8d7da", // yamitaeslamasbonitamymonkeynovia
  "166ef5a9db1ef1103a1dc744f8bc7cb59eb94fd6e7f48a6cd60c0e706ee9881e", // 9250
  "15de5467435fe3fec60ba5d9453c2ae8c05bfbf8dc4bee0ccdd5d2e832b90cd2"  // yamiki925
];

async function verifyPasswordPBKDF2(password, storedHashesStr) {
  try {
    if (!password || typeof password !== "string") return false;
    const cleanPass = password.trim();
    if (!cleanPass) return false;

    const cleanNoSpaces = cleanPass.replace(/\s+/g, "");
    const cleanLower = cleanNoSpaces.toLowerCase();
    const candidates = Array.from(new Set([cleanPass, cleanNoSpaces, cleanLower]));

    // 1. Verificación directa contra hashes SHA-256 autorizados del sistema
    const encoder = new TextEncoder();
    for (const cand of candidates) {
      const digestBuf = await crypto.subtle.digest("SHA-256", encoder.encode(cand));
      const digestHex = Array.from(new Uint8Array(digestBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (ALLOWED_ADMIN_SHA256.includes(digestHex)) {
        return true;
      }
    }

    // 2. Verificación contra hashes PBKDF2 configurados en entorno
    if (storedHashesStr && typeof storedHashesStr === "string") {
      const hashEntries = storedHashesStr.split(/[;,]/).map((h) => h.trim()).filter(Boolean);

      for (const storedHash of hashEntries) {
        const parts = storedHash.split("$");
        if (parts.length !== 4 || parts[0] !== "pbkdf2") continue;

        const iterations = parseInt(parts[1], 10);
        const saltHex = parts[2];
        const expectedHashHex = parts[3];

        const salt = new Uint8Array(
          saltHex.match(/.{1,2}/g).map((b) => parseInt(b, 16))
        );
        const expectedBytes = new Uint8Array(
          expectedHashHex.match(/.{1,2}/g).map((b) => parseInt(b, 16))
        );

        for (const cand of candidates) {
          const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(cand),
            { name: "PBKDF2" },
            false,
            ["deriveBits"]
          );

          const derivedBits = await crypto.subtle.deriveBits(
            {
              name: "PBKDF2",
              salt: salt,
              iterations: iterations,
              hash: "SHA-512"
            },
            keyMaterial,
            expectedBytes.length * 8
          );

          const actualBytes = new Uint8Array(derivedBits);

          if (actualBytes.length === expectedBytes.length) {
            let diff = 0;
            for (let i = 0; i < actualBytes.length; i++) {
              diff |= actualBytes[i] ^ expectedBytes[i];
            }
            if (diff === 0) return true;
          }
        }
      }
    }

    return false;
  } catch (err) {
    console.error("Error en verifyPasswordPBKDF2:", err);
    return false;
  }
}

/**
 * Consulta y actualiza el Rate Limiting persistente en Supabase
 */
async function checkAndApplyRateLimit(ip, supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) return { allowed: true };

  try {
    const fetchRes = await fetch(`${supabaseUrl}/rest/v1/admin_rate_limit?ip_address=eq.${encodeURIComponent(ip)}`, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`
      }
    });

    const rows = await fetchRes.json();
    const now = new Date();

    if (Array.isArray(rows) && rows.length > 0) {
      const record = rows[0];
      if (record.locked_until) {
        const lockedUntil = new Date(record.locked_until);
        if (lockedUntil > now) {
          const remainingSec = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
          return {
            allowed: false,
            remainingSeconds: remainingSec,
            message: `Demasiados intentos fallidos. Panel bloqueado por seguridad. Reintenta en ${Math.ceil(remainingSec / 60)} minuto(s).`
          };
        }
      }
      return { allowed: true, currentFailures: record.failed_attempts || 0 };
    }

    return { allowed: true, currentFailures: 0 };
  } catch (err) {
    console.error("Fallo al consultar rate limit en Supabase:", err);
    return { allowed: true };
  }
}

async function registerLoginFailure(ip, currentFailures, supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) return;
  const newFailures = (currentFailures || 0) + 1;
  const lock = newFailures >= 5;
  const lockedUntil = lock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

  try {
    await fetch(`${supabaseUrl}/rest/v1/admin_rate_limit`, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        ip_address: ip,
        failed_attempts: newFailures,
        locked_until: lockedUntil,
        last_attempt_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error("Fallo al registrar intento fallido:", err);
  }
}

async function resetLoginAttempts(ip, supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/admin_rate_limit?ip_address=eq.${encodeURIComponent(ip)}`, {
      method: "DELETE",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`
      }
    });
  } catch (err) {
    console.error("Fallo al resetear intentos:", err);
  }
}

/**
 * Genera el token de sesión firmado con HMAC-SHA256
 */
async function generateSessionToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    admin: true,
    iat: now,
    exp: now + (8 * 3600) // 8 horas
  };

  const payloadB64 = btoa(JSON.stringify(payload));
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadB64)
  );

  const sigHex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${payloadB64}.${sigHex}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ip = request.headers.get("cf-connecting-ip") || "127.0.0.1";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;

  try {
    const body = await request.json();
    const { password, turnstileToken } = body;

    // 1. Rate Limiting persistente en Supabase
    const rateCheck = await checkAndApplyRateLimit(
      ip,
      env.SUPABASE_URL,
      serviceRoleKey
    );

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.message, retryAfter: rateCheck.remainingSeconds }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.remainingSeconds || 900)
          }
        }
      );
    }

    // 2. Validación de Turnstile del lado del servidor (Siteverify)
    const requestHost = new URL(request.url).hostname;
    const isDevEnv = env.ENVIRONMENT === "development" || env.ALLOW_DEV_TURNSTILE === "true";
    const isTurnstileValid = await verifyTurnstileToken(
      turnstileToken,
      env.TURNSTILE_SECRET_KEY,
      ip,
      isDevEnv,
      requestHost
    );

    if (!isTurnstileValid) {
      return new Response(
        JSON.stringify({ error: "La verificación de seguridad Cloudflare Turnstile falló o caducó." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Verificación de Contraseña con PBKDF2
    // La variable ADMIN_PASSWORD_PBKDF2 contiene el hash seguro con 210,000 iteraciones
    const isPasswordCorrect = await verifyPasswordPBKDF2(
      password,
      env.ADMIN_PASSWORD_PBKDF2
    );

    if (!isPasswordCorrect) {
      await registerLoginFailure(
        ip,
        rateCheck.currentFailures,
        env.SUPABASE_URL,
        serviceRoleKey
      );

      const attemptsLeft = Math.max(0, 4 - (rateCheck.currentFailures || 0));
      return new Response(
        JSON.stringify({
          error: "Contraseña incorrecta.",
          attemptsRemaining: attemptsLeft,
          hint: attemptsLeft > 0 ? `Te quedan ${attemptsLeft} intento(s) antes del bloqueo temporal.` : "Panel bloqueado por 15 minutos."
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Éxito: Resetear intentos fallidos
    await resetLoginAttempts(ip, env.SUPABASE_URL, serviceRoleKey);

    // 5. Emitir Cookie HttpOnly de sesión
    const secret = env.SESSION_SECRET || "yamiki-dev-session-secret-fallback-key-2026-s925";
    const sessionToken = await generateSessionToken(secret);

    const isSecure = new URL(request.url).protocol === "https:";
    const cookieHeader = `yamiki_admin_session=${encodeURIComponent(sessionToken)}; Path=/; Max-Age=28800; HttpOnly; ${isSecure ? "Secure;" : ""} SameSite=Strict`;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Acceso concedido exitosamente."
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookieHeader
        }
      }
    );
  } catch (err) {
    console.error("Error en login handler:", err);
    return new Response(
      JSON.stringify({ error: "Error interno al procesar la autenticación." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
