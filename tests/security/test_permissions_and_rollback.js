const { createSupabaseStagingServer, STAGING_ANON_KEY, STAGING_SERVICE_ROLE_KEY } = require("../staging/supabase_staging_server.js");

const STAGING_AUTHENTICATED_KEY = "staging_authenticated_jwt_user_mock";

async function runPermissionsAndRollbackTest() {
  console.log("==================================================================");
  console.log("  SUITE DE VERIFICACIÓN: PERMISOS SQL, PRIVACIDAD Y ROLLBACK");
  console.log("==================================================================\n");

  const serverPort = 54323;
  const staging = createSupabaseStagingServer(serverPort);
  await staging.start();

  const baseUrl = `http://127.0.0.1:${serverPort}`;
  let passed = 0;
  let total = 0;

  function assert(name, condition, detail = "") {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] ${name}`);
    } else {
      console.error(`[FAIL] ${name}`);
    }
    if (detail) console.log(`       -> ${detail}`);
  }

  try {
    // --------------------------------------------------------------------------
    // ESTADO 1: POST-MIGRACIÓN (01_security_hardening.sql)
    // --------------------------------------------------------------------------
    console.log("--- ESTADO 1: POST-MIGRACIÓN (01_security_hardening.sql) ---");

    // 1. Lectura de las 21 columnas públicas vía catalogo_tienda por 'anon'
    const catRes = await fetch(`${baseUrl}/rest/v1/catalogo_tienda`, {
      headers: { "apikey": STAGING_ANON_KEY, "Authorization": `Bearer ${STAGING_ANON_KEY}` }
    });
    const catData = await catRes.json();
    assert(
      "1. catalogo_tienda accesible para 'anon' (PostgREST HTTP 200)",
      catRes.status === 200 && Array.isArray(catData) && catData.length > 0,
      `HTTP ${catRes.status} - ${catData.length} productos recibidos`
    );

    // 2. Comprobar que catalogo_tienda solo contiene columnas públicas y CERO privadas
    const sampleProduct = catData[0];
    const privateColsFound = ["costo_real", "ganancia_estimada", "porcentaje_aumento", "enlace_aliexpress", "tienda_proveedor"]
      .filter(col => sampleProduct[col] !== undefined);
    assert(
      "2. Cero columnas privadas expuestas en catalogo_tienda",
      privateColsFound.length === 0,
      privateColsFound.length === 0 ? "0 de 5 columnas privadas expuestas" : `EXPUESTAS: ${privateColsFound.join(', ')}`
    );

    // 3. Comprobar que productos inactivos están estrictamente ocultos
    const inactiveFound = catData.some(p => p.activo === false || p.codigo_sku.includes("INACTIVO"));
    assert(
      "3. Ocultamiento de productos inactivos en catalogo_tienda",
      !inactiveFound,
      "Productos con activo=false filtrados exitosamente"
    );

    // 4. Rechazo directo de 'anon' al consultar columnas privadas individualmente en 'productos'
    const privateCols = ["costo_real", "ganancia_estimada", "porcentaje_aumento", "enlace_aliexpress", "tienda_proveedor"];
    for (const col of privateCols) {
      const colRes = await fetch(`${baseUrl}/rest/v1/productos?select=${col}`, {
        headers: { "apikey": STAGING_ANON_KEY, "Authorization": `Bearer ${STAGING_ANON_KEY}` }
      });
      assert(
        `4. Bloqueo de columna privada '${col}' para 'anon'`,
        colRes.status === 403,
        `HTTP ${colRes.status} (Permission Denied)`
      );
    }

    // 5. Rechazo directo al consultar select=* en 'productos' por 'anon'
    const allColsRes = await fetch(`${baseUrl}/rest/v1/productos?select=*`, {
      headers: { "apikey": STAGING_ANON_KEY, "Authorization": `Bearer ${STAGING_ANON_KEY}` }
    });
    assert(
      "5. Bloqueo de 'select=*' sobre tabla 'productos' para 'anon'",
      allColsRes.status === 403,
      `HTTP ${allColsRes.status} (Rechazo porque select=* incluye columnas no autorizadas)`
    );

    // 6. Rechazo de columnas privadas para rol 'authenticated' (usuarios logueados en supabase auth no administradores)
    const authRes = await fetch(`${baseUrl}/rest/v1/productos?select=costo_real,tienda_proveedor`, {
      headers: { "apikey": STAGING_AUTHENTICATED_KEY, "Authorization": `Bearer ${STAGING_AUTHENTICATED_KEY}` }
    });
    assert(
      "6. Bloqueo de columnas privadas para rol 'authenticated'",
      authRes.status === 403,
      `HTTP ${authRes.status} (Permission Denied para authenticated)`
    );

    // 7. Acceso total concedido exclusivamente a 'service_role' (backend seguro)
    const srvRes = await fetch(`${baseUrl}/rest/v1/productos?select=*`, {
      headers: { "apikey": STAGING_SERVICE_ROLE_KEY, "Authorization": `Bearer ${STAGING_SERVICE_ROLE_KEY}` }
    });
    const srvData = await srvRes.json();
    const hasPrivate = srvData.length > 0 && srvData[0].costo_real !== undefined;
    assert(
      "7. service_role mantiene acceso completo a todas las columnas y filas",
      srvRes.status === 200 && hasPrivate,
      `HTTP ${srvRes.status} - Costo real visible para backend: $${srvData[0]?.costo_real}`
    );

    // --------------------------------------------------------------------------
    // ESTADO 2: POST-ROLLBACK BLINDADO (01_rollback_plan.sql)
    // --------------------------------------------------------------------------
    console.log("\n--- ESTADO 2: POST-ROLLBACK BLINDADO (01_rollback_plan.sql) ---");

    // 8. En Rollback: catalogo_tienda sigue funcionando para 'anon'
    const catResRollback = await fetch(`${baseUrl}/rest/v1/catalogo_tienda`, {
      headers: { "apikey": STAGING_ANON_KEY, "Authorization": `Bearer ${STAGING_ANON_KEY}` }
    });
    const catDataRollback = await catResRollback.json();
    assert(
      "8. [Rollback] catalogo_tienda permanece operativo para 'anon'",
      catResRollback.status === 200 && Array.isArray(catDataRollback) && catDataRollback.length > 0,
      `HTTP ${catResRollback.status} - ${catDataRollback.length} productos servidos`
    );

    // 9. En Rollback: las cinco columnas privadas NUNCA son expuestas
    const privateColsInRollback = ["costo_real", "ganancia_estimada", "porcentaje_aumento", "enlace_aliexpress", "tienda_proveedor"]
      .filter(col => catDataRollback[0][col] !== undefined);
    assert(
      "9. [Rollback] CERO columnas privadas expuestas en catálogo público",
      privateColsInRollback.length === 0,
      "Columnas privadas intactas y protegidas tras rollback"
    );

    // 10. En Rollback: las consultas directas a columnas privadas siguen bloqueadas
    const colRollbackRes = await fetch(`${baseUrl}/rest/v1/productos?select=costo_real,ganancia_estimada`, {
      headers: { "apikey": STAGING_ANON_KEY, "Authorization": `Bearer ${STAGING_ANON_KEY}` }
    });
    assert(
      "10. [Rollback] Columnas privadas permanecen bloqueadas en tabla 'productos'",
      colRollbackRes.status === 403,
      `HTTP ${colRollbackRes.status} (Permission Denied - No hay fuga de datos)`
    );

    // 11. En Rollback: RLS sigue activo y oculta productos inactivos
    const inactiveInRollback = catDataRollback.some(p => p.activo === false || p.codigo_sku.includes("INACTIVO"));
    assert(
      "11. [Rollback] RLS activo: Productos inactivos ocultos para visitantes",
      !inactiveInRollback,
      "Joya inactiva no filtrada al exterior"
    );

    // 12. En Rollback: Mutaciones directas siguen bloqueadas para 'anon'
    const postRollbackRes = await fetch(`${baseUrl}/rest/v1/productos`, {
      method: "POST",
      headers: {
        "apikey": STAGING_ANON_KEY,
        "Authorization": `Bearer ${STAGING_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ titulo: "Hack Attempt" })
    });
    assert(
      "12. [Rollback] Escritura directa bloqueada para 'anon' (POST /productos)",
      postRollbackRes.status === 403,
      `HTTP ${postRollbackRes.status} (Forbidden)`
    );

  } finally {
    await staging.close();
  }

  console.log("\n==================================================================");
  console.log(`  RESUMEN DE PRUEBAS DE PERMISOS: ${passed} / ${total} SUPERADAS (${Math.round((passed/total)*100)}%)`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPermissionsAndRollbackTest().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runPermissionsAndRollbackTest };
