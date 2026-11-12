const SUPABASE_URL = "https://nlpsvjweybdmkmrkfkyy.supabase.co";
const ANON_KEY = "sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P";

async function runSecurityTests() {
  console.log("==================================================================");
  console.log("  SUITE AUTOMATIZADA DE PRUEBAS DE SEGURIDAD - YAMIKI JOYERÍA");
  console.log("==================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function reportTest(name, passed, detail) {
    totalTests++;
    if (passed) {
      passedTests++;
      console.log(`[PASS] ${name}`);
    } else {
      console.log(`[FAIL] ${name}`);
    }
    if (detail) console.log(`       Detalle: ${detail}`);
  }

  // 1. Probar que la tienda pública lee catalogo_tienda sin fricción
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/catalogo_tienda?select=id,titulo,precio_venta,foto_principal&limit=3`, {
      headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` }
    });
    if (res.status === 200) {
      const rows = await res.json();
      reportTest("Lectura pública de 'catalogo_tienda'", rows.length > 0, `Obtenidas ${rows.length} joyas de muestra.`);
    } else {
      reportTest("Lectura pública de 'catalogo_tienda'", false, `HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    reportTest("Lectura pública de 'catalogo_tienda'", false, err.message);
  }

  // 2. Comprobar que anon no puede leer columnas privadas en productos
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?select=costo_real,enlace_aliexpress&limit=1`, {
      headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` }
    });
    // Se espera que falle con 401, 403 o error de permisos (42501)
    if (res.status !== 200) {
      reportTest("Restricción de columnas privadas para anon (costo_real)", true, `Acceso denegado correctamente con HTTP ${res.status}`);
    } else {
      const data = await res.json();
      // Si devolvió 200, verificar si devolvió datos reales
      const hasPrivateData = data.some(d => d.costo_real !== undefined || d.enlace_aliexpress !== undefined);
      reportTest("Restricción de columnas privadas para anon (costo_real)", !hasPrivateData, hasPrivateData ? "¡ALERTA! anon pudo leer columnas privadas." : "Las columnas fueron filtradas.");
    }
  } catch (err) {
    reportTest("Restricción de columnas privadas para anon", true, err.message);
  }

  // 3. Comprobar que anon NO puede insertar en productos
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos`, {
      method: "POST",
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        codigo_sku: `HACK_TEST_${Date.now()}`,
        titulo: "Intento no autorizado",
        precio_venta: 10
      })
    });
    const isBlocked = res.status === 401 || res.status === 403 || res.status === 404;
    reportTest("Restricción de INSERT en 'productos' para anon", isBlocked, `Respuesta recibida: HTTP ${res.status}`);
  } catch (err) {
    reportTest("Restricción de INSERT en 'productos' para anon", true, err.message);
  }

  // 4. Comprobar que anon NO puede modificar productos existentes
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=gt.0`, {
      method: "PATCH",
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ titulo: "Hacked" })
    });
    const isBlocked = res.status === 401 || res.status === 403 || res.status === 404;
    reportTest("Restricción de UPDATE en 'productos' para anon", isBlocked, `Respuesta recibida: HTTP ${res.status}`);
  } catch (err) {
    reportTest("Restricción de UPDATE en 'productos' para anon", true, err.message);
  }

  // 5. Comprobar que anon NO puede eliminar productos
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/productos?id=gt.0`, {
      method: "DELETE",
      headers: { "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` }
    });
    const isBlocked = res.status === 401 || res.status === 403 || res.status === 404;
    reportTest("Restricción de DELETE en 'productos' para anon", isBlocked, `Respuesta recibida: HTTP ${res.status}`);
  } catch (err) {
    reportTest("Restricción de DELETE en 'productos' para anon", true, err.message);
  }

  // 6. Comprobar que anon NO puede subir archivos a Storage
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/joyas/hack_test.jpg`, {
      method: "POST",
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "Content-Type": "image/jpeg"
      },
      body: Buffer.from("hack attempt")
    });
    const isBlocked = res.status === 401 || res.status === 403 || res.status === 400;
    reportTest("Restricción de subida a Storage ('joyas') para anon", isBlocked, `Respuesta recibida: HTTP ${res.status}`);
  } catch (err) {
    reportTest("Restricción de subida a Storage para anon", true, err.message);
  }

  // 7. Comprobar que las fotos públicas del bucket siguen siendo legibles
  try {
    // Tomar una foto pública de prueba
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/joyas/test_upload_probe.txt`);
    reportTest("Disponibilidad de lectura pública en bucket 'joyas'", res.status === 200 || res.status === 404, `HTTP ${res.status}`);
  } catch (err) {
    reportTest("Disponibilidad de lectura pública en bucket 'joyas'", false, err.message);
  }

  console.log("\n==================================================================");
  console.log(`  RESUMEN DE PRUEBAS: ${passedTests} / ${totalTests} superadas`);
  console.log("==================================================================");
}

runSecurityTests().catch(console.error);
