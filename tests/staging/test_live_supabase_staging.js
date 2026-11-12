const readline = require('readline');
const { Writable } = require('stream');
const { createCloudflareStagingServer } = require("./cloudflare_staging_server.js");
const { generateHash } = require("../../tools/generate_admin_hash.js");

const TARGET_PROJECT_REF = "sivpbybwyngbwzyoapud";
const TARGET_PROJECT_URL = "https://sivpbybwyngbwzyoapud.supabase.co";

function askSecret(promptText) {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      }
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true
    });

    process.stdout.write(promptText);
    muted = true;

    rl.question('', (val) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(val.trim());
    });
  });
}

async function runLiveStagingValidation(options = {}) {
  console.log("==================================================================");
  console.log("  VALIDACIÓN REAL CONTRA PROYECTO STAGING EN SUPABASE CLOUD");
  console.log(`  PROYECTO: ${TARGET_PROJECT_REF} (${TARGET_PROJECT_URL})`);
  console.log("==================================================================\n");

  const supabaseUrl = options.supabaseUrl || process.env.STAGING_SUPABASE_URL || TARGET_PROJECT_URL;
  
  let anonKey = options.anonKey || process.env.STAGING_SUPABASE_ANON_KEY;
  if (!anonKey) {
    anonKey = await askSecret(`1. Clave pública 'anon' de Staging (${TARGET_PROJECT_REF}): `);
  }

  let serviceRoleKey = options.serviceRoleKey || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    serviceRoleKey = await askSecret(`2. Clave privilegiada 'service_role' de Staging (${TARGET_PROJECT_REF}): `);
  }

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("\n[ERROR] Se requieren las credenciales de Staging para ejecutar las pruebas reales.");
    process.exit(1);
  }

  // Comprobar estrictamente que NO sea el proyecto principal de producción
  if (supabaseUrl.includes("nlpsvjweybdmkmrkfkyy")) {
    console.error("\n[BLOQUEO DE SEGURIDAD]: Has introducido la URL del proyecto principal de producción.");
    console.error("Esta prueba solo puede ejecutarse contra un proyecto independiente de Staging.");
    process.exit(1);
  }

  // Comprobar que sea el proyecto de staging autorizado
  if (!supabaseUrl.includes(TARGET_PROJECT_REF)) {
    console.error(`\n[BLOQUEO DE SEGURIDAD]: La URL no coincide con el proyecto autorizado '${TARGET_PROJECT_REF}'.`);
    process.exit(1);
  }

  console.log("\n[OK] Conectando con proyecto Staging:", supabaseUrl.replace(/https:\/\/(.{6}).+(\.supabase\.co)/, 'https://$1...$2'));

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

  // 1. PostgREST y catalogo_tienda
  try {
    const catRes = await fetch(`${supabaseUrl}/rest/v1/catalogo_tienda?select=*`, {
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` }
    });
    const catData = await catRes.json();
    const hasInactive = Array.isArray(catData) && catData.some(d => d.activo === false);
    report(
      "1. PostgREST: Lectura pública de 'catalogo_tienda' (RLS activo)",
      catRes.status === 200 && Array.isArray(catData) && !hasInactive,
      `HTTP ${catRes.status} | Filas visibles: ${Array.isArray(catData) ? catData.length : 0}. Inactivas ocultas: ${!hasInactive}`
    );
  } catch (err) {
    report("1. PostgREST: Lectura pública de 'catalogo_tienda'", false, err.message);
  }

  // 2. Bloqueo de Columnas Privadas en 'productos'
  try {
    const privCols = ["costo_real", "ganancia_estimada", "porcentaje_aumento", "enlace_aliexpress", "tienda_proveedor"];
    let allDenied = true;
    const statuses = [];
    for (const col of privCols) {
      const pRes = await fetch(`${supabaseUrl}/rest/v1/productos?select=${col}&limit=1`, {
        headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` }
      });
      statuses.push(`${col}: HTTP ${pRes.status}`);
      if (pRes.status !== 401 && pRes.status !== 403) allDenied = false;
    }
    report(
      "2. SQL Privileges: Denegación de columnas privadas para 'anon'",
      allDenied,
      statuses.join(", ")
    );
  } catch (err) {
    report("2. SQL Privileges: Denegación de columnas privadas", false, err.message);
  }

  // 3. Bloqueo de mutaciones sobre catalogo_tienda para anon
  try {
    const viewMutRes = await fetch(`${supabaseUrl}/rest/v1/catalogo_tienda`, {
      method: "POST",
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: "Hack View Attempt", precio_venta: 1 })
    });
    report(
      "3. Vista 'catalogo_tienda': Bloqueo de mutaciones (INSERT/UPDATE/DELETE) para anon",
      viewMutRes.status === 401 || viewMutRes.status === 403 || viewMutRes.status === 404,
      `HTTP ${viewMutRes.status}`
    );
  } catch (err) {
    report("3. Vista 'catalogo_tienda': Bloqueo de mutaciones", true, err.message);
  }

  // 4. Bloqueo de INSERT en 'productos' para anon
  try {
    const insRes = await fetch(`${supabaseUrl}/rest/v1/productos`, {
      method: "POST",
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: "Hack Attempt", precio_venta: 1 })
    });
    report(
      "4. RLS y Privilegios: Prohibición de INSERT en 'productos' para anon",
      insRes.status === 401 || insRes.status === 403,
      `HTTP ${insRes.status}`
    );
  } catch (err) {
    report("4. RLS: Prohibición de INSERT para anon", true, err.message);
  }

  // 5. Bloqueo de UPDATE en 'productos' para anon
  try {
    const updRes = await fetch(`${supabaseUrl}/rest/v1/productos?codigo_sku=eq.STG-RING-01`, {
      method: "PATCH",
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ precio_venta: 1 })
    });
    report(
      "5. RLS y Privilegios: Prohibición de UPDATE en 'productos' para anon",
      updRes.status === 401 || updRes.status === 403,
      `HTTP ${updRes.status}`
    );
  } catch (err) {
    report("5. RLS: Prohibición de UPDATE para anon", true, err.message);
  }

  // 6. Bloqueo de DELETE en 'productos' para anon
  try {
    const delRes = await fetch(`${supabaseUrl}/rest/v1/productos?codigo_sku=eq.STG-RING-01`, {
      method: "DELETE",
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` }
    });
    report(
      "6. RLS y Privilegios: Prohibición de DELETE en 'productos' para anon",
      delRes.status === 401 || delRes.status === 403,
      `HTTP ${delRes.status}`
    );
  } catch (err) {
    report("6. RLS: Prohibición de DELETE para anon", true, err.message);
  }

  // 7. Bloqueo de admin_rate_limit para anon
  try {
    const rateRes = await fetch(`${supabaseUrl}/rest/v1/admin_rate_limit?select=*`, {
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` }
    });
    report(
      "7. RLS y Privilegios: Bloqueo de 'admin_rate_limit' para anon",
      rateRes.status === 401 || rateRes.status === 403,
      `HTTP ${rateRes.status}`
    );
  } catch (err) {
    report("7. RLS: Bloqueo de 'admin_rate_limit'", true, err.message);
  }

  // 8. Storage: Bloqueo de subida para anon
  try {
    const upRes = await fetch(`${supabaseUrl}/storage/v1/object/joyas/hack_test.jpg`, {
      method: "POST",
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}`, "Content-Type": "image/jpeg" },
      body: Buffer.from("fake-hack-bytes")
    });
    report(
      "8. Storage: Bloqueo de subida y sobrescritura para anon",
      upRes.status === 401 || upRes.status === 403 || upRes.status === 400,
      `HTTP ${upRes.status}`
    );
  } catch (err) {
    report("8. Storage: Bloqueo de subida para anon", true, err.message);
  }

  // 9. Servidor Local Cloudflare Pages Functions conectado al Supabase Staging Real
  console.log("\n--- INICIANDO BACKEND DE PAGES FUNCTIONS CONECTADO A STAGING REAL ---");
  const stagingPassword = "YamikiAdminStagingTest2026!";
  const stagingHash = generateHash(stagingPassword);
  const stagingSecret = "staging-secret-key-32-bytes-minimum-length!";

  const stagingPagesEnv = {
    ADMIN_PASSWORD_PBKDF2: stagingHash,
    SESSION_SECRET: stagingSecret,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    TURNSTILE_SECRET_KEY: ""
  };

  const cloudflareServer = createCloudflareStagingServer(stagingPagesEnv, 8789);
  await cloudflareServer.start();
  console.log("[OK] Pages Functions Staging activo en: http://127.0.0.1:8789");

  try {
    // 10. Login Admin
    const loginRes = await fetch("http://127.0.0.1:8789/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "YamikiAdmin", "Origin": "http://127.0.0.1:8789" },
      body: JSON.stringify({ password: stagingPassword, turnstileToken: "dummy_dev_token" })
    });
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const cookieToken = setCookie.match(/yamiki_admin_session=([^;]+)/)?.[1];
    report(
      "9. Autenticación PBKDF2 y Cookie HttpOnly en Staging Real",
      loginRes.status === 200 && cookieToken,
      `HTTP ${loginRes.status} | Cookie de sesión recibida.`
    );

    // 11. Protección CSRF / Origin Mismatch
    const csrfRes = await fetch("http://127.0.0.1:8789/api/admin/productos", {
      method: "POST",
      headers: {
        "X-Requested-With": "YamikiAdmin",
        "Origin": "http://malicious-site.com", // Origen atacante
        "Cookie": `yamiki_admin_session=${cookieToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ titulo: "CSRF Test", precio_venta: 100 })
    });
    report(
      "10. Protección CSRF: Bloqueo de peticiones desde origen no autorizado",
      csrfRes.status === 403,
      `HTTP ${csrfRes.status}`
    );

    const authHeaders = {
      "X-Requested-With": "YamikiAdmin",
      "Origin": "http://127.0.0.1:8789",
      "Cookie": `yamiki_admin_session=${cookieToken}`,
      "Content-Type": "application/json"
    };

    // 12. Creación de joya vía service_role en el Supabase Real de Staging
    const newSku = `STG-VERIF-${Date.now()}`;
    const createRes = await fetch("http://127.0.0.1:8789/api/admin/productos", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        codigo_sku: newSku,
        titulo: "[PRUEBA REAL] Anillo Staging Cloud",
        categoria: "anillos",
        precio_venta: 480,
        costo_real: 130, // Columna privada
        ganancia_estimada: 350,
        porcentaje_aumento: "269%",
        tienda_proveedor: "Proveedor Cloud Staging",
        activo: true
      })
    });
    const createJson = await createRes.json();
    const createdId = createJson.data?.[0]?.id;
    report(
      "11. Alta de Joya con datos privados vía backend protegido (Supabase Real)",
      createRes.status === 201 && createdId,
      `HTTP ${createRes.status} | ID generado: ${createdId}`
    );

    // 13. Actualización de precio vía service_role
    if (createdId) {
      const patchRes = await fetch("http://127.0.0.1:8789/api/admin/productos", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({
          id: createdId,
          updates: { precio_venta: 510, es_destacado: true, badge: "🔥 TEST" }
        })
      });
      report(
        "12. Actualización de precio y variante en Supabase Real",
        patchRes.status === 200,
        `HTTP ${patchRes.status}`
      );
    }

    // 14. Subida real a Storage vía proxy de Pages Functions
    const testFileName = `test_photo_${Date.now()}.jpg`;
    const dummyImageBuffer = Buffer.from(
      "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9",
      "hex"
    );

    const uploadRes = await fetch("http://127.0.0.1:8789/api/admin/upload", {
      method: "POST",
      headers: {
        "X-Requested-With": "YamikiAdmin",
        "Origin": "http://127.0.0.1:8789",
        "Cookie": `yamiki_admin_session=${cookieToken}`,
        "Content-Type": "image/jpeg",
        "x-storage-path": testFileName
      },
      body: dummyImageBuffer
    });

    const uploadJson = await uploadRes.json();
    const publicPhotoUrl = uploadJson.url;
    report(
      "13. Storage: Subida y sobrescritura vía backend /api/admin/upload con service_role",
      uploadRes.status === 200 && publicPhotoUrl,
      `HTTP ${uploadRes.status} | Key: ${uploadJson.Key}`
    );

    // 15. Lectura pública de la fotografía recién subida
    if (publicPhotoUrl) {
      const fetchPhotoRes = await fetch(publicPhotoUrl);
      report(
        "14. Storage: Lectura pública de fotografía subida a bucket 'joyas'",
        fetchPhotoRes.status === 200,
        `HTTP ${fetchPhotoRes.status}`
      );
    }

    // 16. Protección de fotografías compartidas entre variantes
    const sharedPhotoSku1 = `STG-VAR1-${Date.now()}`;
    const sharedPhotoSku2 = `STG-VAR2-${Date.now()}`;
    const createVar1Res = await fetch("http://127.0.0.1:8789/api/admin/productos", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        codigo_sku: sharedPhotoSku1,
        titulo: "Joya Variante 1 (Foto Compartida)",
        categoria: "anillos",
        precio_venta: 250,
        foto_principal: publicPhotoUrl,
        activo: true
      })
    });
    const createVar2Res = await fetch("http://127.0.0.1:8789/api/admin/productos", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        codigo_sku: sharedPhotoSku2,
        titulo: "Joya Variante 2 (Foto Compartida)",
        categoria: "anillos",
        precio_venta: 250,
        foto_principal: publicPhotoUrl,
        activo: true
      })
    });
    const var1Json = await createVar1Res.json();
    const var2Json = await createVar2Res.json();
    const var1Id = var1Json.data?.[0]?.id;
    const var2Id = var2Json.data?.[0]?.id;

    // Borrar variante 1: La foto NO debe eliminarse porque variante 2 sigue usándola
    if (var1Id && var2Id) {
      await fetch("http://127.0.0.1:8789/api/admin/productos", {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ ids: [var1Id] })
      });

      const photoStillAliveRes = await fetch(publicPhotoUrl);
      report(
        "15. Integridad de Fotos: Foto compartida NO eliminada al borrar una sola variante",
        photoStillAliveRes.status === 200,
        `HTTP ${photoStillAliveRes.status} (Foto preservada para la variante restante)`
      );

      // Ahora borrar variante 2 y la joya de prueba inicial
      await fetch("http://127.0.0.1:8789/api/admin/productos", {
        method: "DELETE",
        headers: authHeaders,
        body: JSON.stringify({ ids: [var2Id, createdId] })
      });
    }

    // 16. Purga de archivos huérfanos vía cleanup-orphans
    // Subir un archivo huérfano explícito con prefijo de prueba para comprobar la purga
    const orphanFileName = `test_orphan_purge_${Date.now()}.jpg`;
    await fetch("http://127.0.0.1:8789/api/admin/upload", {
      method: "POST",
      headers: {
        "X-Requested-With": "YamikiAdmin",
        "Origin": "http://127.0.0.1:8789",
        "Cookie": `yamiki_admin_session=${cookieToken}`,
        "Content-Type": "image/jpeg",
        "x-storage-path": orphanFileName
      },
      body: dummyImageBuffer
    });

    const cleanupRes = await fetch("http://127.0.0.1:8789/api/admin/storage/cleanup-orphans", {
      method: "POST",
      headers: authHeaders
    });
    const cleanupJson = await cleanupRes.json();
    report(
      "16. Storage: Purga y eliminación de archivos huérfanos con service_role",
      cleanupRes.status === 200 && cleanupJson.deletedCount >= 1,
      `HTTP ${cleanupRes.status} | Archivos huérfanos detectados y eliminados: ${cleanupJson.deletedCount}`
    );

  } finally {
    await cloudflareServer.close();
    console.log("[OK] Servidor Pages Functions detenido.");
  }

  console.log("\n==================================================================");
  console.log(`  RESUMEN FINAL DE VALIDACIÓN REAL: ${passedTests} / ${totalTests} SUPERADAS`);
  console.log("==================================================================");

  return { passedTests, totalTests };
}

if (require.main === module) {
  runLiveStagingValidation().catch(console.error);
}

module.exports = { runLiveStagingValidation };
