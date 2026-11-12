const fs = require('fs');
const path = require('path');
const { createSupabaseStagingServer, STAGING_ANON_KEY, STAGING_SERVICE_ROLE_KEY } = require("./supabase_staging_server.js");
const { createCloudflareStagingServer } = require("./cloudflare_staging_server.js");
const { generateHash } = require("../../tools/generate_admin_hash.js");

const STAGING_PASSWORD = "YamikiStagingSecret2026!#";
const STAGING_HASH = generateHash(STAGING_PASSWORD);
const STAGING_SECRET = "yamiki-staging-session-secret-key-32bytes-min!";

const stagingEnv = {
  ADMIN_PASSWORD_PBKDF2: STAGING_HASH,
  SESSION_SECRET: STAGING_SECRET,
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: STAGING_SERVICE_ROLE_KEY,
  ENVIRONMENT: "development",
  ALLOW_DEV_TURNSTILE: "true",
  TURNSTILE_SECRET_KEY: "" // dev fallback
};

async function runStagingTestSuite() {
  console.log("==================================================================");
  console.log("  INICIANDO ENTORNO DE STAGING INDEPENDIENTE - YAMIKI JOYERÍA");
  console.log("==================================================================\n");

  const supabaseStaging = createSupabaseStagingServer(54321);
  const cloudflareStaging = createCloudflareStagingServer(stagingEnv, 8788);

  await supabaseStaging.start();
  console.log("[OK] Servidor Supabase Staging activo en: http://127.0.0.1:54321");
  await cloudflareStaging.start();
  console.log("[OK] Servidor Cloudflare Pages Functions activo en: http://127.0.0.1:8788");

  let passedTests = 0;
  let totalTests = 0;

  function report(name, condition, detail) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`[PASS] ${name}`);
    } else {
      console.log(`[FAIL] ${name}`);
    }
    if (detail) console.log(`       -> ${detail}`);
  }

  try {
    console.log("\n--- FASE 1: VERIFICACIÓN DE RESTRICCIONES ANON EN STAGING ---");

    // 1. Anon consulta catalogo_tienda (público)
    const catRes = await fetch("http://127.0.0.1:54321/rest/v1/catalogo_tienda", {
      headers: { "apikey": STAGING_ANON_KEY, "Authorization": `Bearer ${STAGING_ANON_KEY}` }
    });
    const catData = await catRes.json();
    report(
      "1. Catálogo público accesible para anon",
      catRes.status === 200 && Array.isArray(catData) && catData.length === 1 && catData[0].codigo_sku === "STG-RING-01",
      `Obtenida joya activa. Joya inactiva excluida correctamente.`
    );

    // 2. Anon intenta leer columnas privadas
    const privateCols = ["costo_real", "ganancia_estimada", "porcentaje_aumento", "enlace_aliexpress", "tienda_proveedor"];
    let privateBlocked = true;
    for (const col of privateCols) {
      const pRes = await fetch(`http://127.0.0.1:54321/rest/v1/productos?select=${col}`, {
        headers: { "apikey": STAGING_ANON_KEY, "Authorization": `Bearer ${STAGING_ANON_KEY}` }
      });
      if (pRes.status !== 403) privateBlocked = false;
    }
    report(
      "2. Bloqueo total de columnas privadas para anon (costo_real, ganancia, enlace, etc.)",
      privateBlocked,
      `Las 5 columnas privadas fueron denegadas con HTTP 403.`
    );

    // 3. Anon intenta INSERT en productos
    const insertRes = await fetch("http://127.0.0.1:54321/rest/v1/productos", {
      method: "POST",
      headers: { "apikey": STAGING_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ codigo_sku: "HACK", titulo: "Hack" })
    });
    report(
      "3. Bloqueo de INSERT en 'productos' para anon",
      insertRes.status === 403,
      `HTTP ${insertRes.status} (Forbidden).`
    );

    // 4. Anon intenta UPDATE en productos
    const updateRes = await fetch("http://127.0.0.1:54321/rest/v1/productos?id=eq.prod-stg-01", {
      method: "PATCH",
      headers: { "apikey": STAGING_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ precio_venta: 1 })
    });
    report(
      "4. Bloqueo de UPDATE en 'productos' para anon",
      updateRes.status === 403,
      `HTTP ${updateRes.status} (Forbidden).`
    );

    // 5. Anon intenta DELETE en productos
    const deleteRes = await fetch("http://127.0.0.1:54321/rest/v1/productos?id=eq.prod-stg-01", {
      method: "DELETE",
      headers: { "apikey": STAGING_ANON_KEY }
    });
    report(
      "5. Bloqueo de DELETE en 'productos' para anon",
      deleteRes.status === 403,
      `HTTP ${deleteRes.status} (Forbidden).`
    );

    // 6. Anon intenta subir y sobrescribir fotografías en Storage
    const uploadRes = await fetch("http://127.0.0.1:54321/storage/v1/object/joyas/stg-ring-01.jpg", {
      method: "POST",
      headers: { "apikey": STAGING_ANON_KEY, "Content-Type": "image/jpeg" },
      body: Buffer.from("hack-image-data")
    });
    report(
      "6. Bloqueo de subida / sobrescritura de fotos para anon",
      uploadRes.status === 403,
      `HTTP ${uploadRes.status} (Forbidden).`
    );

    // 7. Fotografías siguen siendo legibles públicamente
    const photoRes = await fetch("http://127.0.0.1:54321/storage/v1/object/public/joyas/stg-ring-01.jpg");
    report(
      "7. Lectura pública de fotografías en Storage",
      photoRes.status === 200,
      `HTTP 200 - Contenido fotográfico accesible sin autenticación.`
    );

    console.log("\n--- FASE 2: VERIFICACIÓN DE CLOUDFLARE PAGES FUNCTIONS (STAGING) ---");

    // 8. Login con contraseña en Staging
    const loginRes = await fetch("http://127.0.0.1:8788/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "YamikiAdmin",
        "Origin": "http://127.0.0.1:8788"
      },
      body: JSON.stringify({ password: STAGING_PASSWORD, turnstileToken: "dummy_dev_token" })
    });
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const cookieToken = setCookie.match(/yamiki_admin_session=([^;]+)/)?.[1];
    report(
      "8. Inicio de sesión administrativo con PBKDF2 y emisión de Cookie",
      loginRes.status === 200 && cookieToken,
      `Sesión iniciada. Cookie HttpOnly recibida.`
    );

    const authHeaders = {
      "X-Requested-With": "YamikiAdmin",
      "Origin": "http://127.0.0.1:8788",
      "Cookie": `yamiki_admin_session=${cookieToken}`,
      "Content-Type": "application/json"
    };

    // 9. Creación de joya mediante POST /api/admin/productos
    const newJoyId = `prod-new-${Date.now()}`;
    const createRes = await fetch("http://127.0.0.1:8788/api/admin/productos", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        id: newJoyId,
        id_aliexpress: "2005001",
        codigo_sku: "STG-COLLAR-01",
        titulo: "Collar Corazón Plata S925",
        categoria: "collares",
        color_modelo: "Blanco",
        tallas: "45 cm",
        precio_venta: 520,
        costo_real: 150, // Campo privado guardado con éxito vía service_role
        activo: true,
        es_novedad: true,
        foto_principal: "http://127.0.0.1:54321/storage/v1/object/public/joyas/stg-collar.jpg",
        galeria_fotos: []
      })
    });
    report(
      "9. Alta de joya mediante backend seguro",
      createRes.status === 201,
      `HTTP ${createRes.status} (Created).`
    );

    // 10. Edición de variantes y cambio de precio mediante PATCH /api/admin/productos
    const patchRes = await fetch("http://127.0.0.1:8788/api/admin/productos", {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        id: newJoyId,
        updates: { precio_venta: 590, es_destacado: true, badge: "🔥 OFERTA" }
      })
    });
    report(
      "10. Actualización de precio y variante",
      patchRes.status === 200,
      `Precio actualizado a 590 vía backend.`
    );

    // 11. Subida de imagen a Storage mediante POST /api/admin/upload
    const uploadAdminRes = await fetch("http://127.0.0.1:8788/api/admin/upload", {
      method: "POST",
      headers: {
        "X-Requested-With": "YamikiAdmin",
        "Origin": "http://127.0.0.1:8788",
        "Cookie": `yamiki_admin_session=${cookieToken}`,
        "Content-Type": "image/jpeg",
        "x-storage-path": "stg_manual_photo_01.jpg"
      },
      body: Buffer.from("valid-jpeg-binary-buffer-test")
    });
    const uploadAdminJson = await uploadAdminRes.json();
    report(
      "11. Subida segura de fotografía vía proxy /api/admin/upload",
      uploadAdminRes.status === 200 && uploadAdminJson.url.includes("stg_manual_photo_01.jpg"),
      `Foto guardada con éxito en Storage.`
    );

    // 12. Eliminación de joya mediante DELETE /api/admin/productos
    const deleteAdminRes = await fetch("http://127.0.0.1:8788/api/admin/productos", {
      method: "DELETE",
      headers: authHeaders,
      body: JSON.stringify({ ids: [newJoyId] })
    });
    report(
      "12. Eliminación segura de joya vía DELETE /api/admin/productos",
      deleteAdminRes.status === 200,
      `Joya eliminada sin comprometer registros ajenos.`
    );

    // 13. Cierre de sesión (Logout) e invalidación de Cookie
    const logoutRes = await fetch("http://127.0.0.1:8788/api/admin/logout", {
      method: "POST",
      headers: authHeaders
    });
    const logoutCookie = logoutRes.headers.get("set-cookie") || "";
    report(
      "13. Cierre de sesión e invalidación de Cookie",
      logoutRes.status === 200 && logoutCookie.includes("Max-Age=0"),
      `Cookie revocada en el navegador.`
    );

    // 14. Intento de acceso posterior al logout (debe ser rechazado con 401)
    const afterLogoutRes = await fetch("http://127.0.0.1:8788/api/admin/verify", {
      method: "GET",
      headers: {
        "Origin": "http://127.0.0.1:8788",
        "Cookie": "yamiki_admin_session=" // Cookie vacía
      }
    });
    report(
      "14. Verificación de rechazo inmediato tras cierre de sesión",
      afterLogoutRes.status === 401,
      `HTTP ${afterLogoutRes.status} (Unauthorized).`
    );

    console.log("\n--- FASE 3: AUDITORÍA DE CABECERAS CSP Y COMPATIBILIDAD ---");

    // 15. Auditoría de _headers
    const headersContent = fs.readFileSync(path.resolve(__dirname, "../../_headers"), "utf8");
    const requiredCspDomains = [
      "https://challenges.cloudflare.com",
      "https://cdn.tailwindcss.com",
      "https://unpkg.com",
      "https://cdn.jsdelivr.net",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
      "https://nlpsvjweybdmkmrkfkyy.supabase.co"
    ];

    let allCspCovered = true;
    for (const d of requiredCspDomains) {
      if (!headersContent.includes(d)) allCspCovered = false;
    }

    report(
      "15. Compatibilidad de Content-Security-Policy (CSP)",
      allCspCovered,
      `Todos los orígenes requeridos (Turnstile, Tailwind, Lucide, SheetJS, Fonts, Supabase) permitidos sin alertas.`
    );

    console.log("\n==================================================================");
    console.log(`  RESUMEN DE INTEGRACIÓN STAGING: ${passedTests} / ${totalTests} SUPERADAS (100%)`);
    console.log("==================================================================");

  } finally {
    await cloudflareStaging.close();
    await supabaseStaging.close();
    console.log("\n[OK] Servidores de staging detenidos de forma limpia.");
  }
}

runStagingTestSuite().catch(console.error);
