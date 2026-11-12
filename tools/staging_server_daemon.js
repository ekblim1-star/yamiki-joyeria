const http = require('http');
const path = require('path');
const { createCloudflareStagingServer } = require("../tests/staging/cloudflare_staging_server.js");
const { generateHash } = require("./generate_admin_hash.js");

const TARGET_PROJECT_REF = "sivpbybwyngbwzyoapud";
const TARGET_PROJECT_URL = "https://sivpbybwyngbwzyoapud.supabase.co";
const PORT = 8788;
const ADMIN_PASSWORD = "YamikiAdminStagingTest2026!";

async function startDaemon() {
  const managementToken = process.argv[2] || process.env.SUPABASE_ACCESS_TOKEN;
  if (!managementToken) {
    console.error("[ERROR] Se requiere SUPABASE_ACCESS_TOKEN como argumento o variable de entorno.");
    process.exit(1);
  }
  
  console.log(`[Staging Server] Obteniendo credenciales de Supabase (${TARGET_PROJECT_REF})...`);
  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${TARGET_PROJECT_REF}/api-keys`, {
    headers: { "Authorization": `Bearer ${managementToken}` }
  });

  if (!keysRes.ok) {
    console.error("[ERROR] No se pudieron obtener las API keys:", await keysRes.text());
    process.exit(1);
  }

  const apiKeys = await keysRes.json();
  const serviceRoleKeyObj = apiKeys.find(k => k.name === "service_role") || apiKeys.find(k => k.tags === "service_role") || apiKeys.find(k => k.api_key.startsWith("sb_secret_"));

  if (!serviceRoleKeyObj) {
    console.error("[ERROR] service_role key no encontrada.");
    process.exit(1);
  }

  const adminHash = generateHash(ADMIN_PASSWORD);
  const sessionSecret = "staging-secret-key-32-bytes-minimum-length!";

  const stagingEnv = {
    ADMIN_PASSWORD_PBKDF2: adminHash,
    SESSION_SECRET: sessionSecret,
    SUPABASE_URL: TARGET_PROJECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKeyObj.api_key,
    TURNSTILE_SECRET_KEY: ""
  };

  const cloudflareServer = createCloudflareStagingServer(stagingEnv, PORT);
  await cloudflareServer.start();

  console.log("==================================================================");
  console.log(`  SERVIDOR STAGING ACTIVO EN: http://127.0.0.1:${PORT}`);
  console.log(`  TIENDA PÚBLICA:             http://127.0.0.1:${PORT}/`);
  console.log(`  PANEL ADMINISTRATIVO:       http://127.0.0.1:${PORT}/admin/`);
  console.log(`  PASSWORD ADMIN (PIN):       ${ADMIN_PASSWORD}`);
  console.log(`  SUPABASE CONECTADO:         ${TARGET_PROJECT_URL}`);
  console.log("==================================================================");
}

startDaemon().catch(err => {
  console.error("Fallo al iniciar servidor staging:", err);
  process.exit(1);
});
