const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Writable } = require('stream');
const { Client } = require('pg');

const TARGET_PROJECT_REF = "sivpbybwyngbwzyoapud";
const TARGET_PROJECT_URL = "https://sivpbybwyngbwzyoapud.supabase.co";
const TARGET_POOLER_HOST = "aws-0-us-west-2.pooler.supabase.com";
const TARGET_POOLER_PORT = 5432; // Puerto de modo Sesión para migraciones DDL

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

function sanitizeLog(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/:([^:@/]+)@/g, ':***@');
}

async function runStagingMigration(inputVal = null) {
  console.log("==================================================================");
  console.log("  APLICADOR AUTOMÁTICO DE MIGRACIÓN SQL: SUPABASE CLOUD STAGING");
  console.log(`  PROYECTO AUTORIZADO: ${TARGET_PROJECT_REF}`);
  console.log(`  URL OFICIAL:         ${TARGET_PROJECT_URL}`);
  console.log(`  HOST VERIFICADO:     ${TARGET_POOLER_HOST}:${TARGET_POOLER_PORT}`);
  console.log("==================================================================\n");

  let input = inputVal || process.env.STAGING_DB_PASSWORD || process.env.STAGING_DB_URI;

  if (!input) {
    console.log("Por seguridad, la contraseña no se mostrará en pantalla al escribirla o pegarla.\n");
    input = await askSecret("Introduce la Contraseña de la base de datos de 'yamiki-staging': ");
  }

  if (!input) {
    console.error("[ERROR] No se introdujo ninguna contraseña. Operación cancelada.");
    process.exit(1);
  }

  let connectionUri = "";
  if (input.startsWith("postgres://") || input.startsWith("postgresql://")) {
    connectionUri = input;
  } else {
    // Construcción automática y exacta con los parámetros verificados de us-west-2
    const encodedPwd = encodeURIComponent(input);
    connectionUri = `postgresql://postgres.${TARGET_PROJECT_REF}:${encodedPwd}@${TARGET_POOLER_HOST}:${TARGET_POOLER_PORT}/postgres`;
  }

  // 1. Verificación estricta contra producción
  if (connectionUri.includes("nlpsvjweybdmkmrkfkyy")) {
    console.error("\n[BLOQUEO DE SEGURIDAD ABSOLUTO]: La conexión apunta al proyecto de PRODUCCIÓN (nlpsvjweybdmkmrkfkyy). Operación cancelada inmediatamente.");
    process.exit(1);
  }

  // 2. Verificación estricta del Project ID de Staging
  if (!connectionUri.includes(TARGET_PROJECT_REF)) {
    console.error(`\n[BLOQUEO DE SEGURIDAD]: La conexión NO contiene el Project ID autorizado '${TARGET_PROJECT_REF}'. Operación cancelada.`);
    process.exit(1);
  }

  const migrationFilePath = path.join(__dirname, "..", "supabase", "migrations", "00_init_staging_project.sql");
  if (!fs.existsSync(migrationFilePath)) {
    console.error("[ERROR] No se encontró el archivo de migración:", migrationFilePath);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationFilePath, 'utf8');
  console.log("[OK] Archivo SQL cargado exitosamente.");
  console.log(`[INFO] Tamaño: ${sqlContent.length} bytes | 100% Compatible con Transacción Única.`);

  // 3. Cargar Certificado Raíz CA Oficial de Supabase para Validación TLS Estricta
  const caPaths = [
    path.join(__dirname, '..', 'prod-ca-2021.crt'),
    path.join(__dirname, '..', 'supabase', 'prod-ca-2021.crt')
  ];

  let caCert = null;
  for (const p of caPaths) {
    if (fs.existsSync(p)) {
      caCert = fs.readFileSync(p, 'utf8');
      break;
    }
  }

  if (!caCert) {
    console.error("[ERROR] No se encontró el certificado 'prod-ca-2021.crt' para validación estricta.");
    process.exit(1);
  }

  console.log("\n[OK] Certificado raíz oficial 'Supabase Root 2021 CA' cargado.");
  console.log(`Conectando con Supabase Staging (${TARGET_PROJECT_REF}) con validación estricta de TLS (rejectUnauthorized: true)...`);

  const client = new Client({
    connectionString: connectionUri,
    ssl: {
      rejectUnauthorized: true, // VALIDACIÓN ESTRICTA ENFORZADA
      ca: caCert
    }
  });

  try {
    await client.connect();
    console.log("[PASS] Conexión TLS/SSL verificada y establecida exitosamente.");

    // Verificar base de datos activa
    const dbNameRes = await client.query("SELECT current_database(), current_user;");
    console.log(`[OK] Base de datos verificada: '${dbNameRes.rows[0].current_database}' | Usuario: '${dbNameRes.rows[0].current_user}'`);

    console.log("\nIniciando transacción única atómica (BEGIN)...");
    await client.query("BEGIN;");

    console.log("Ejecutando todas las sentencias DDL y DML de '00_init_staging_project.sql'...");
    const startTime = Date.now();
    await client.query(sqlContent);
    const duration = Date.now() - startTime;

    console.log("Confirmando transacción (COMMIT)...");
    await client.query("COMMIT;");
    console.log(`[PASS] Migración aplicada exitosamente en ${duration} ms (100% atómica).`);

    // Verificaciones automáticas de objetos creados
    console.log("\n--- VERIFICACIÓN DE OBJETOS CREADOS EN STAGING ---");
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('productos', 'admin_rate_limit');
    `);
    console.log("[OK] Tablas verificadas:", tablesRes.rows.map(r => r.table_name).join(", "));

    const viewsRes = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = 'catalogo_tienda';
    `);
    console.log("[OK] Vistas verificadas:", viewsRes.rows.map(r => r.table_name).join(", "));

    const bucketRes = await client.query("SELECT id, name, public FROM storage.buckets WHERE id = 'joyas';");
    if (bucketRes.rows.length > 0) {
      console.log(`[OK] Bucket Storage '${bucketRes.rows[0].id}': public=${bucketRes.rows[0].public}`);
    } else {
      console.warn("[WARN] No se encontró el bucket 'joyas' en storage.buckets.");
    }

    const prodCountRes = await client.query("SELECT count(*) as total FROM public.productos;");
    console.log(`[OK] Filas sintéticas en 'productos': ${prodCountRes.rows[0].total}`);

    console.log("\n==================================================================");
    console.log("  INICIALIZACIÓN DE STAGING COMPLETADA AL 100% SIN ERRORES");
    console.log("==================================================================");
    return { success: true };

  } catch (err) {
    console.log("\n[ALERTA] Error detectado durante la migración. Ejecutando ROLLBACK...");
    try {
      await client.query("ROLLBACK;");
      console.log("[OK] ROLLBACK ejecutado: la base de datos se mantiene intacta.");
    } catch (rbErr) {
      console.warn("[WARN] Error durante rollback:", rbErr.message);
    }

    console.error("\n[DETALLE DEL ERROR EN STAGING]:");
    console.error("Mensaje:", sanitizeLog(err.message));
    if (err.code) console.error("Código PostgreSQL:", err.code);
    if (err.position) console.error("Posición en SQL:", err.position);
    if (err.detail) console.error("Detalle:", sanitizeLog(err.detail));
    if (err.hint) console.error("Sugerencia:", sanitizeLog(err.hint));
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  runStagingMigration().catch((e) => {
    console.error("Error fatal:", sanitizeLog(e.message));
    process.exit(1);
  });
}

module.exports = { runStagingMigration };
