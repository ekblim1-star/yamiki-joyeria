const fs = require('fs');
const path = require('path');
const { runLiveStagingValidation } = require('../tests/staging/test_live_supabase_staging.js');

const TARGET_PROJECT_REF = "sivpbybwyngbwzyoapud";
const TARGET_PROJECT_URL = "https://sivpbybwyngbwzyoapud.supabase.co";

async function executeCloudStagingFull(managementToken) {
  console.log("==================================================================");
  console.log("  INICIALIZACIÓN Y VALIDACIÓN AUTOMÁTICA EN SUPABASE CLOUD");
  console.log(`  PROYECTO OBJETIVO: ${TARGET_PROJECT_REF} (yamiki-staging)`);
  console.log(`  URL:               ${TARGET_PROJECT_URL}`);
  console.log("==================================================================\n");

  if (!managementToken) {
    console.error("[ERROR] Token de administración no proporcionado.");
    process.exit(1);
  }

  // 1. Verificación de seguridad del proyecto
  console.log("[1/5] Verificando proyecto en Supabase Management API...");
  const projRes = await fetch("https://api.supabase.com/v1/projects", {
    headers: { "Authorization": `Bearer ${managementToken}` }
  });

  if (!projRes.ok) {
    const errText = await projRes.text();
    console.error("[ERROR] Fallo al autenticar en Supabase API:", errText);
    process.exit(1);
  }

  const projects = await projRes.json();
  const targetProject = projects.find(p => p.id === TARGET_PROJECT_REF);

  if (!targetProject) {
    console.error(`[BLOQUEO DE SEGURIDAD]: El token no tiene acceso al proyecto autorizado '${TARGET_PROJECT_REF}'. Proyectos encontrados:`, projects.map(p => p.id));
    process.exit(1);
  }

  if (targetProject.id === "nlpsvjweybdmkmrkfkyy") {
    console.error("[BLOQUEO DE SEGURIDAD ABSOLUTO]: Se detectó el ID del proyecto de producción (nlpsvjweybdmkmrkfkyy). Operación cancelada.");
    process.exit(1);
  }

  console.log(`[PASS] Proyecto verificado: '${targetProject.name}' (ID: ${targetProject.id}, Región: ${targetProject.region}, Estado: ${targetProject.status})`);

  // 2. Cargar SQL de migración
  console.log("\n[2/5] Cargando '00_init_staging_project.sql'...");
  const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "00_init_staging_project.sql");
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  console.log(`[OK] Archivo cargado (${sqlContent.length} bytes).`);

  // 3. Ejecutar migración SQL atómica
  console.log("\n[3/5] Ejecutando migración SQL en Supabase Cloud PostgreSQL...");
  const transactionalSql = `BEGIN;\n${sqlContent}\nCOMMIT;`;

  const queryRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${managementToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: transactionalSql })
  });

  if (!queryRes.ok) {
    const errJson = await queryRes.json().catch(() => null);
    console.error("[ERROR AL APLICAR MIGRACIÓN]:", errJson || await queryRes.text());
    process.exit(1);
  }

  const queryResult = await queryRes.json();
  console.log("[PASS] Migración SQL completada y confirmada (COMMIT) con éxito.");

  // 4. Verificación de objetos creados
  console.log("\n[4/5] Verificando objetos creados en la base de datos de Staging...");
  async function runQuery(sql) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${managementToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql })
    });
    return r.json();
  }

  const tables = await runQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('productos', 'admin_rate_limit');");
  console.log("[OK] Tablas públicas:", tables.map(t => t.table_name).join(", "));

  const views = await runQuery("SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'catalogo_tienda';");
  console.log("[OK] Vistas públicas:", views.map(v => v.table_name).join(", "));

  const bucket = await runQuery("SELECT id, name, public FROM storage.buckets WHERE id = 'joyas';");
  if (bucket.length > 0) {
    console.log(`[OK] Bucket Storage '${bucket[0].id}': public=${bucket[0].public}`);
  }

  const prodCount = await runQuery("SELECT count(*) as total FROM public.productos;");
  console.log(`[OK] Filas sintéticas en 'productos': ${prodCount[0].total}`);

  // 5. Obtener claves de API oficiales para ejecutar las 16 pruebas
  console.log("\n[5/5] Obteniendo claves de API del proyecto de Staging...");
  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/api-keys`, {
    headers: { "Authorization": `Bearer ${managementToken}` }
  });

  const apiKeys = await keysRes.json();
  const anonKeyObj = apiKeys.find(k => k.name === "anon") || apiKeys.find(k => k.tags === "anon") || apiKeys[0];
  const serviceRoleKeyObj = apiKeys.find(k => k.name === "service_role") || apiKeys.find(k => k.tags === "service_role") || apiKeys.find(k => k.api_key.startsWith("sb_secret_"));

  if (!anonKeyObj || !serviceRoleKeyObj) {
    console.error("[ERROR] No se pudieron obtener las claves anon / service_role.");
    process.exit(1);
  }

  console.log("[OK] Claves de API obtenidas en memoria de forma segura.");

  console.log("\n==================================================================");
  console.log("  INICIANDO SUITE DE 16 PRUEBAS DE INTEGRACIÓN EN SUPABASE REAL");
  console.log("==================================================================");

  const testResults = await runLiveStagingValidation({
    supabaseUrl: TARGET_PROJECT_URL,
    anonKey: anonKeyObj.api_key,
    serviceRoleKey: serviceRoleKeyObj.api_key
  });

  console.log("\n[PROCESO COMPLETO]: Inicialización y pruebas finalizadas con éxito.");
  return testResults;
}

if (require.main === module) {
  const token = process.argv[2] || process.env.SUPABASE_ACCESS_TOKEN;
  executeCloudStagingFull(token).catch(console.error);
}

module.exports = { executeCloudStagingFull };
