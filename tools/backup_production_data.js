const fs = require('fs');
const path = require('path');

const PROD_URL = "https://nlpsvjweybdmkmrkfkyy.supabase.co";
const PROD_ANON_KEY = "sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P";

async function performProductionDataBackup() {
  console.log("==================================================================");
  console.log("  EXTRACCIÓN DE RESPALDO DE DATOS - SUPABASE PRODUCCIÓN");
  console.log(`  PROYECTO: nlpsvjweybdmkmrkfkyy (${PROD_URL})`);
  console.log("  MODO: Lectura Estricta (GET sin mutación ni bloqueo)");
  console.log("==================================================================\n");

  const backupsDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(backupsDir, `backup_production_productos_${timestamp}.json`);
  const sqlPath = path.join(backupsDir, `backup_production_productos_${timestamp}.sql`);

  console.log("Consultando catálogo completo de producción...");
  const res = await fetch(`${PROD_URL}/rest/v1/productos?select=*&order=created_at.asc`, {
    headers: {
      "apikey": PROD_ANON_KEY,
      "Authorization": `Bearer ${PROD_ANON_KEY}`
    }
  });

  if (!res.ok) {
    throw new Error(`Fallo al consultar Supabase producción: HTTP ${res.status} ${res.statusText}`);
  }

  const products = await res.json();
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error("No se recibieron registros o la respuesta no es un arreglo válido.");
  }

  console.log(`[OK] Descargados exitosamente ${products.length} productos de producción.`);

  // 1. Guardar JSON estructurado
  fs.writeFileSync(jsonPath, JSON.stringify(products, null, 2), "utf8");
  console.log(`[OK] Respaldo JSON guardado en: ${jsonPath}`);

  // 2. Generar SQL de inserción / restauración de contingencia
  let sqlStatements = `-- ==============================================================================\n`;
  sqlStatements += `-- RESPALDO DE DATOS: SUPABASE PRODUCCIÓN (nlpsvjweybdmkmrkfkyy)\n`;
  sqlStatements += `-- Fecha de extracción: ${new Date().toISOString()}\n`;
  sqlStatements += `-- Total de productos respaldados: ${products.length}\n`;
  sqlStatements += `-- ==============================================================================\n\n`;

  for (const p of products) {
    const cols = Object.keys(p);
    const colList = cols.map(c => `"${c}"`).join(", ");
    const valList = cols.map(c => {
      const v = p[c];
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "boolean" || typeof v === "number") return v;
      if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      return `'${String(v).replace(/'/g, "''")}'`;
    }).join(", ");

    sqlStatements += `INSERT INTO public.productos (${colList}) VALUES (${valList}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  fs.writeFileSync(sqlPath, sqlStatements, "utf8");
  console.log(`[OK] Respaldo SQL generado en: ${sqlPath}`);

  // 3. Verificación de integridad
  const jsonStat = fs.statSync(jsonPath);
  const sqlStat = fs.statSync(sqlPath);

  const reRead = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (reRead.length !== products.length) {
    throw new Error("Verificación de integridad fallida: discrepancia en conteo de filas.");
  }

  console.log("\n==================================================================");
  console.log("  VERIFICACIÓN DE INTEGRIDAD DEL RESPALDO: EXITOSA");
  console.log(`  - Registros verificados: ${reRead.length} / ${products.length}`);
  console.log(`  - Tamaño archivo JSON:   ${(jsonStat.size / 1024).toFixed(2)} KB`);
  console.log(`  - Tamaño archivo SQL:    ${(sqlStat.size / 1024).toFixed(2)} KB`);
  console.log("==================================================================\n");

  return { jsonPath, sqlPath, count: products.length };
}

if (require.main === module) {
  performProductionDataBackup().catch(err => {
    console.error("[ERROR CRÍTICO]:", err.message);
    process.exit(1);
  });
}

module.exports = { performProductionDataBackup };
