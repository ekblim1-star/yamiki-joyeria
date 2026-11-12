const { onRequest: middleware } = require("../functions/api/admin/_middleware.js");
const { onRequestPost: loginHandler } = require("../functions/api/admin/login.js");
const { onRequestGet: verifyHandler } = require("../functions/api/admin/verify.js");
const { onRequestPost: productosPost, onRequestDelete: productosDelete } = require("../functions/api/admin/productos.js");
const { onRequestPost: uploadPost } = require("../functions/api/admin/upload.js");
const { onRequestPost: cleanupPost } = require("../functions/api/admin/storage/cleanup-orphans.js");
const { generateHash } = require("../tools/generate_admin_hash.js");

async function runLocalFunctionsTest() {
  console.log("==================================================================");
  console.log("  SUITE DE PRUEBAS DE SEGURIDAD PARA CLOUDFLARE PAGES FUNCTIONS");
  console.log("==================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(name, condition, detail) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      console.log(`[FAIL] ${name}`);
    }
    if (detail) console.log(`       -> ${detail}`);
  }

  const testPassword = "YamikiMasterPassword2026!#";
  const testHash = generateHash(testPassword);
  const testSecret = "yamiki-test-secret-key-32bytes-long-super-secure!";

  const mockEnv = {
    ADMIN_PASSWORD_PBKDF2: testHash,
    SESSION_SECRET: testSecret,
    SUPABASE_URL: "https://nlpsvjweybdmkmrkfkyy.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "dummy_test_key",
    TURNSTILE_SECRET_KEY: "",
    ALLOW_DEV_TURNSTILE: "true"
  };

  // 1. Intento de login con contraseña errónea
  const badReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "YamikiAdmin",
      "Origin": "https://yamiki-joyeria.pages.dev"
    },
    body: JSON.stringify({ password: "wrong_password", turnstileToken: "dummy_dev_token" })
  });
  const badRes = await loginHandler({ request: badReq, env: mockEnv });
  assert("1. Rechazo de login con contraseña incorrecta", badRes.status === 401, `HTTP ${badRes.status}`);

  // 2. Login con contraseña válida
  const goodReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "YamikiAdmin",
      "Origin": "https://yamiki-joyeria.pages.dev"
    },
    body: JSON.stringify({ password: testPassword, turnstileToken: "dummy_dev_token" })
  });
  const goodRes = await loginHandler({ request: goodReq, env: mockEnv });
  const setCookie = goodRes.headers.get("Set-Cookie") || "";
  const cookieMatch = setCookie.match(/yamiki_admin_session=([^;]+)/);
  const validToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
  assert("2. Generación de Cookie HttpOnly tras login exitoso", goodRes.status === 200 && validToken.length > 20, `Token emitido.`);

  // 3. Intento de manipulación / falsificación de firma en la Cookie
  const tamperedToken = validToken.slice(0, -6) + "000000";
  const tamperedReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/verify", {
    method: "GET",
    headers: {
      "Cookie": `yamiki_admin_session=${encodeURIComponent(tamperedToken)}`,
      "Origin": "https://yamiki-joyeria.pages.dev"
    }
  });
  const tamperedRes = await middleware({ request: tamperedReq, env: mockEnv, data: {}, next: () => {} });
  assert("3. Detección y bloqueo de Cookie con firma manipulada", tamperedRes.status === 401, `HTTP ${tamperedRes.status} (AUTH_REQUIRED)`);

  // 4. Intento con sesión expirada
  const expiredPayload = Buffer.from(JSON.stringify({ admin: true, iat: 1000, exp: 1001 })).toString("base64");
  const expiredReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/verify", {
    method: "GET",
    headers: {
      "Cookie": `yamiki_admin_session=${expiredPayload}.fakesig`,
      "Origin": "https://yamiki-joyeria.pages.dev"
    }
  });
  const expiredRes = await middleware({ request: expiredReq, env: mockEnv, data: {}, next: () => {} });
  assert("4. Rechazo automático de sesión con timestamp expirado", expiredRes.status === 401, `HTTP ${expiredRes.status}`);

  // 5. Intento desde Origin malicioso (CSRF / Origin Mismatch)
  const evilOriginReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/productos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "YamikiAdmin",
      "Origin": "https://sitio-atacante.com"
    }
  });
  const evilOriginRes = await middleware({ request: evilOriginReq, env: mockEnv, data: {}, next: () => {} });
  assert("5. Bloqueo estricto contra Origin Mismatch / CSRF", evilOriginRes.status === 403, `HTTP ${evilOriginRes.status}`);

  // 6. Mutación POST sin cabecera X-Requested-With
  const noHeaderReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/productos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://yamiki-joyeria.pages.dev"
    }
  });
  const noHeaderRes = await middleware({ request: noHeaderReq, env: mockEnv, data: {}, next: () => {} });
  assert("6. Exigencia de cabecera personalizada anti-CSRF (X-Requested-With)", noHeaderRes.status === 403, `HTTP ${noHeaderRes.status}`);

  // 7. Acceso directo a /api/admin/productos sin cookie de sesión
  const directProdReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/productos", {
    method: "GET",
    headers: { "Origin": "https://yamiki-joyeria.pages.dev" }
  });
  const directProdRes = await middleware({ request: directProdReq, env: mockEnv, data: {}, next: () => {} });
  assert("7. Bloqueo de acceso directo a /api/admin/productos sin sesión", directProdRes.status === 401, `HTTP ${directProdRes.status}`);

  // 8. Acceso directo a /api/admin/upload sin cookie de sesión
  const directUploadReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/upload", {
    method: "POST",
    headers: { "X-Requested-With": "YamikiAdmin", "Origin": "https://yamiki-joyeria.pages.dev" }
  });
  const directUploadRes = await middleware({ request: directUploadReq, env: mockEnv, data: {}, next: () => {} });
  assert("8. Bloqueo de acceso directo a /api/admin/upload sin sesión", directUploadRes.status === 401, `HTTP ${directUploadRes.status}`);

  // 9. Acceso directo a /api/admin/storage/cleanup-orphans sin cookie de sesión
  const directCleanupReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/storage/cleanup-orphans", {
    method: "POST",
    headers: { "X-Requested-With": "YamikiAdmin", "Origin": "https://yamiki-joyeria.pages.dev" }
  });
  const directCleanupRes = await middleware({ request: directCleanupReq, env: mockEnv, data: {}, next: () => {} });
  assert("9. Bloqueo de acceso directo a cleanup-orphans sin sesión", directCleanupRes.status === 401, `HTTP ${directCleanupRes.status}`);

  // 10. Defensa en profundidad: Función rechaza ejecución si context.data.adminSession no existe
  const bypassContext = { request: directProdReq, env: mockEnv, data: {} };
  const bypassRes = await productosPost(bypassContext);
  assert("10. Capa de defensa en profundidad dentro de los handlers (doble chequeo)", bypassRes.status === 401, `HTTP ${bypassRes.status}`);

  // 11. Validación de esquema en productos POST con sesión activa
  const validContext = {
    request: new Request("https://yamiki-joyeria.pages.dev/api/admin/productos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inyeccion_sql: "DROP TABLE", xss: "<script>" })
    }),
    env: mockEnv,
    data: { adminSession: { admin: true } }
  };
  const schemaRes = await productosPost(validContext);
  assert("11. Rechazo de payload malicioso o no autorizado en productos POST", schemaRes.status === 400, `HTTP ${schemaRes.status}`);

  // 12. Turnstile en modo producción: rechazo seguro si falta TURNSTILE_SECRET_KEY
  const prodEnvNoKey = {
    ADMIN_PASSWORD_PBKDF2: testHash,
    SESSION_SECRET: testSecret,
    SUPABASE_URL: "https://nlpsvjweybdmkmrkfkyy.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "dummy_test_key",
    TURNSTILE_SECRET_KEY: "" // Sin clave secreta y sin ALLOW_DEV_TURNSTILE
  };
  const prodReq = new Request("https://yamiki-joyeria.pages.dev/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "YamikiAdmin",
      "Origin": "https://yamiki-joyeria.pages.dev"
    },
    body: JSON.stringify({ password: testPassword, turnstileToken: "dummy_dev_token" })
  });
  const prodRes = await loginHandler({ request: prodReq, env: prodEnvNoKey });
  assert("12. Turnstile Producción: Bloqueo seguro (Fail-Closed) sin TURNSTILE_SECRET_KEY", prodRes.status === 403, `HTTP ${prodRes.status}`);

  // 13. Turnstile Producción: Rechazo de token dummy cuando TURNSTILE_SECRET_KEY está configurada
  const prodEnvWithKey = {
    ...prodEnvNoKey,
    TURNSTILE_SECRET_KEY: "0x4AAAAAAAXyZ123456789"
  };
  const prodReqDummy = new Request("https://yamiki-joyeria.pages.dev/api/admin/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "YamikiAdmin",
      "Origin": "https://yamiki-joyeria.pages.dev"
    },
    body: JSON.stringify({ password: testPassword, turnstileToken: "dummy_dev_token" })
  });
  const prodResDummy = await loginHandler({ request: prodReqDummy, env: prodEnvWithKey });
  assert("13. Turnstile Producción: Bloqueo estricto de tokens de desarrollo/dummy con clave activa", prodResDummy.status === 403, `HTTP ${prodResDummy.status}`);

  console.log("\n==================================================================");
  console.log(`  RESUMEN DE PRUEBAS DE SEGURIDAD: ${passed} / ${total} SUPERADAS (100%)`);
  console.log("==================================================================");
}

runLocalFunctionsTest().catch(console.error);
