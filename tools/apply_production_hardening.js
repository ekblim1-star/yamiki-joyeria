const fs = require('fs');
const path = require('path');

const TARGET_PROJECT_REF = "nlpsvjweybdmkmrkfkyy";
const TARGET_PROJECT_URL = "https://nlpsvjweybdmkmrkfkyy.supabase.co";

async function applyProductionHardening(pat) {
  console.log("==================================================================");
  console.log("  APLICACIÓN DE BLINDAJE DE SEGURIDAD EN SUPABASE PRODUCCIÓN");
  console.log(`  PROYECTO: ${TARGET_PROJECT_REF} (${TARGET_PROJECT_URL})`);
  console.log("==================================================================\n");

  if (!pat) {
    throw new Error("Token de acceso de Supabase no proporcionado.");
  }

  // 1. Verificación previa de seguridad
  console.log("[1/4] Verificando acceso y conteo de catálogo antes de migrar...");
  const preCheckRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "SELECT count(*) FROM public.productos;" })
  });

  if (!preCheckRes.ok) {
    const err = await preCheckRes.text();
    throw new Error(`Fallo en verificación previa: ${err}`);
  }

  const preRows = await preCheckRes.json();
  const preCount = parseInt(preRows[0].count, 10);
  console.log(`[OK] Catálogo verificado previo a migración: ${preCount} productos.`);

  if (preCount !== 121) {
    throw new Error(`Conteo inesperado de productos (${preCount} != 121). Abortando por seguridad.`);
  }

  // 2. Cargar SQL de migración
  console.log("\n[2/4] Cargando 'supabase/migrations/01_security_hardening.sql'...");
  const sqlPath = path.join(__dirname, "..", "supabase", "migrations", "01_security_hardening.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  console.log(`[OK] Script SQL cargado (${sql.length} caracteres).`);

  // 3. Ejecutar migración atómica
  console.log("\n[3/4] Ejecutando migración atómica en Supabase Cloud PostgreSQL...");
  const transactionalSql = `BEGIN;\n${sql}\nCOMMIT;`;

  const queryRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: transactionalSql })
  });

  if (!queryRes.ok) {
    const errText = await queryRes.text();
    throw new Error(`Fallo al ejecutar SQL en Supabase: ${errText}`);
  }

  const queryResult = await queryRes.json();
  console.log("[OK] Sentencias DDL y políticas de seguridad aplicadas exitosamente.");

  // 4. Verificación exhaustiva post-migración
  console.log("\n[4/4] Verificando integridad de datos y blindaje de seguridad post-migración...");

  // A. Conteo de productos
  const postCheckRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "SELECT count(*) FROM public.productos;" })
  });
  const postRows = await postCheckRes.json();
  const postCount = parseInt(postRows[0].count, 10);
  console.log(`  - Conteo total de productos: ${postCount} / 121`);

  // B. Vista catalogo_tienda
  const viewRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "SELECT count(*) FROM public.catalogo_tienda;" })
  });
  const viewRows = await viewRes.json();
  const viewCount = parseInt(viewRows[0].count, 10);
  console.log(`  - Conteo vista catalogo_tienda (joyas activas): ${viewCount} productos.`);

  // C. Tabla admin_rate_limit
  const rlRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pat}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "SELECT count(*) FROM public.admin_rate_limit;" })
  });
  const rlRows = await rlRes.json();
  console.log(`  - Tabla admin_rate_limit verificada: ${rlRows[0].count} registros.`);

  if (postCount !== 121) {
    throw new Error(`Discrepancia de productos post-migración (${postCount} != 121).`);
  }

  console.log("\n==================================================================");
  console.log("  MIGRACIÓN EN PRODUCCIÓN FINALIZADA CON ÉXITO ABSOLUTO (100% OK)");
  console.log("==================================================================\n");

  return { success: true, count: postCount, activeCount: viewCount };
}

if (require.main === module) {
  const pat = process.argv[2];
  applyProductionHardening(pat).catch(err => {
    console.error("\n[ERROR CRÍTICO DURANTE LA MIGRACIÓN]:", err.message);
    process.exit(1);
  });
}

module.exports = { applyProductionHardening };
