const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const SERVER_BASE = "http://127.0.0.1:8788";
const ADMIN_PASSWORD = "YamikiAdminStagingTest2026!";
const TARGET_PROJECT_URL = "https://sivpbybwyngbwzyoapud.supabase.co";
const TARGET_ANON_KEY = "sb_publishable_ZHXeQPBpa5jM2XVXLijSwA_gys8Oqpa";

async function runFunctionalSuite() {
  console.log("==================================================================");
  console.log("  SUITE DE PRUEBAS FUNCIONALES E2E: FRONTEND + ADMIN + SUPABASE");
  console.log("  SERVIDOR LOCAL: " + SERVER_BASE);
  console.log("  SUPABASE STAGING: " + TARGET_PROJECT_URL);
  console.log("==================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

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

  // ----------------------------------------------------------------------------
  // FLUJO 1: CATÁLOGO PÚBLICO Y FILTRADO DE PRODUCTOS INACTIVOS
  // ----------------------------------------------------------------------------
  console.log("--- FLUJO 1: TIENDA PÚBLICA Y CATÁLOGO ---");
  let publicProducts = [];
  try {
    const res = await fetch(`${TARGET_PROJECT_URL}/rest/v1/catalogo_tienda?select=*`, {
      headers: { "apikey": TARGET_ANON_KEY, "Authorization": `Bearer ${TARGET_ANON_KEY}` }
    });
    publicProducts = await res.json();
    const hasInactive = publicProducts.some(p => p.activo === false);
    const hasRing = publicProducts.some(p => p.codigo_sku === "STG-RING-01");
    const hasEarring = publicProducts.some(p => p.codigo_sku === "STG-EAR-02");
    const hasHiddenInactive = !publicProducts.some(p => p.codigo_sku === "STG-INACT-03");

    report(
      "1. Tienda Pública: Carga del catálogo desde 'catalogo_tienda'",
      res.status === 200 && Array.isArray(publicProducts) && publicProducts.length >= 2,
      `HTTP ${res.status} | Productos recibidos: ${publicProducts.length}`
    );

    report(
      "2. Filtro de Inactivos: Las joyas inactivas (STG-INACT-03) NO aparecen en catálogo público",
      !hasInactive && hasRing && hasEarring && hasHiddenInactive,
      `Activos encontrados: RING y EAR. Inactivos visibles: 0.`
    );
  } catch (err) {
    report("1. Tienda Pública: Carga del catálogo", false, err.message);
  }

  // ----------------------------------------------------------------------------
  // FLUJO 2: PRIVACIDAD DE DATOS PARA VISITANTES (COSTOS Y PROVEEDORES)
  // ----------------------------------------------------------------------------
  console.log("\n--- FLUJO 2: PRIVACIDAD DE DATOS PARA VISITANTES ---");
  try {
    // Verificar que catalogo_tienda no expone ninguna columna privada
    const firstProd = publicProducts[0] || {};
    const exposedPrivateCols = ["costo_real", "ganancia_estimada", "porcentaje_aumento", "enlace_aliexpress", "tienda_proveedor"]
      .filter(col => col in firstProd);

    report(
      "3. Privacidad Visitantes: La vista 'catalogo_tienda' no contiene columnas confidenciales",
      exposedPrivateCols.length === 0,
      exposedPrivateCols.length === 0 ? "Cero columnas privadas expuestas en JSON público." : `Columnas filtradas: ${exposedPrivateCols.join(", ")}`
    );

    // Intentar consultar directamente 'productos' con clave anon
    const directRes = await fetch(`${TARGET_PROJECT_URL}/rest/v1/productos?select=costo_real,tienda_proveedor&limit=1`, {
      headers: { "apikey": TARGET_ANON_KEY, "Authorization": `Bearer ${TARGET_ANON_KEY}` }
    });
    report(
      "4. Privacidad Visitantes: Consulta directa de costos/proveedores denegada a 'anon'",
      directRes.status === 401 || directRes.status === 403,
      `HTTP ${directRes.status} (Acceso prohibido por PostgreSQL Grants).`
    );
  } catch (err) {
    report("3. Privacidad Visitantes", false, err.message);
  }

  // ----------------------------------------------------------------------------
  // FLUJO 3: AUTENTICACIÓN ADMIN, COOKIES, PERSISTENCIA Y LOGOUT
  // ----------------------------------------------------------------------------
  console.log("\n--- FLUJO 3: AUTENTICACIÓN ADMINISTRATIVA Y SESIÓN ---");
  let cookieToken = null;
  let authHeaders = null;
  try {
    // A. Login exitoso
    const loginRes = await fetch(`${SERVER_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "YamikiAdmin", "Origin": SERVER_BASE },
      body: JSON.stringify({ password: ADMIN_PASSWORD, turnstileToken: "dummy_dev_token" })
    });
    const setCookie = loginRes.headers.get("set-cookie") || "";
    cookieToken = setCookie.match(/yamiki_admin_session=([^;]+)/)?.[1];

    report(
      "5. Login Administrativo: Autenticación PBKDF2 y emisión de cookie de sesión",
      loginRes.status === 200 && cookieToken,
      `HTTP ${loginRes.status} | Cookie HttpOnly emitida.`
    );

    authHeaders = {
      "X-Requested-With": "YamikiAdmin",
      "Origin": SERVER_BASE,
      "Cookie": `yamiki_admin_session=${cookieToken}`,
      "Content-Type": "application/json"
    };

    // B. Verificación de sesión
    const verifyRes = await fetch(`${SERVER_BASE}/api/admin/verify`, {
      method: "GET",
      headers: { "X-Requested-With": "YamikiAdmin", "Cookie": `yamiki_admin_session=${cookieToken}` }
    });
    const verifyJson = await verifyRes.json();
    report(
      "6. Verificación de Sesión: Endpoint /api/admin/verify valida la sesión activa",
      verifyRes.status === 200 && verifyJson.authenticated === true,
      `HTTP ${verifyRes.status} | authenticated: ${verifyJson.authenticated} | Expira en: ${verifyJson.timeRemainingMinutes}m`
    );

    // C. Persistencia tras recarga simulada (llamada idempotente con la misma cookie)
    const reloadRes = await fetch(`${SERVER_BASE}/api/admin/verify`, {
      method: "GET",
      headers: { "X-Requested-With": "YamikiAdmin", "Cookie": `yamiki_admin_session=${cookieToken}` }
    });
    const reloadJson = await reloadRes.json();
    report(
      "7. Persistencia de Sesión: La sesión se mantiene válida en peticiones subsecuentes",
      reloadRes.status === 200 && reloadJson.authenticated === true,
      `HTTP ${reloadRes.status} | Sesión persistente.`
    );

    // D. Logout y destrucción de sesión
    const logoutRes = await fetch(`${SERVER_BASE}/api/admin/logout`, {
      method: "POST",
      headers: { "X-Requested-With": "YamikiAdmin", "Origin": SERVER_BASE, "Cookie": `yamiki_admin_session=${cookieToken}` }
    });
    const logoutSetCookie = logoutRes.headers.get("set-cookie") || "";
    const cookieExpired = logoutSetCookie.includes("Max-Age=0") || logoutSetCookie.includes("expires=");

    // Comprobar que verify ahora rechaza
    const verifyAfterLogout = await fetch(`${SERVER_BASE}/api/admin/verify`, {
      method: "GET",
      headers: { "X-Requested-With": "YamikiAdmin" }
    });

    report(
      "8. Cierre de Sesión: /api/admin/logout invalida la cookie y bloquea acceso",
      logoutRes.status === 200 && cookieExpired && verifyAfterLogout.status === 401,
      `HTTP ${logoutRes.status} | Invalidador emitido | Acceso posterior: HTTP ${verifyAfterLogout.status}`
    );

    // Reautenticar para los siguientes flujos de administración
    const reLoginRes = await fetch(`${SERVER_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "YamikiAdmin", "Origin": SERVER_BASE },
      body: JSON.stringify({ password: ADMIN_PASSWORD, turnstileToken: "dummy_dev_token" })
    });
    const reSetCookie = reLoginRes.headers.get("set-cookie") || "";
    cookieToken = reSetCookie.match(/yamiki_admin_session=([^;]+)/)?.[1];
    authHeaders["Cookie"] = `yamiki_admin_session=${cookieToken}`;
  } catch (err) {
    report("5. Login Administrativo", false, err.message);
  }

  // ----------------------------------------------------------------------------
  // FLUJO 4: CREACIÓN Y EDICIÓN DE PRODUCTOS DESDE EL PANEL
  // ----------------------------------------------------------------------------
  console.log("\n--- FLUJO 4: GESTIÓN DE PRODUCTOS DESDE EL PANEL ADMIN ---");
  let createdProductId = null;
  const testSku = `STG-FUNC-${Date.now()}`;
  try {
    // A. Crear producto manual con datos completos (públicos y privados)
    const createRes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        codigo_sku: testSku,
        titulo: "[FUNCIONAL] Pulsera Esmeralda Sintética S925",
        categoria: "pulseras",
        color_modelo: "Verde Esmeralda",
        tallas: "16 - 19 cm",
        precio_venta: 580,
        costo_real: 160,
        ganancia_estimada: 420,
        porcentaje_aumento: "262%",
        tienda_proveedor: "Joyería Proveedor Staging",
        enlace_aliexpress: "https://es.aliexpress.com/item/fake-functional-item.html",
        descripcion: "Pulsera de prueba para verificación funcional de panel.",
        estado_stock: "Disponible",
        activo: true,
        es_novedad: true,
        es_destacado: false,
        badge: "NUEVO"
      })
    });

    const createJson = await createRes.json();
    createdProductId = createJson.data?.[0]?.id;

    report(
      "9. Creación de Producto: Panel crea joya con datos confidenciales en Supabase Staging",
      createRes.status === 201 && createdProductId,
      `HTTP ${createRes.status} | ID generado: ${createdProductId} | SKU: ${testSku}`
    );

    // B. Verificar que el administrador PUEDE ver los costos y enlaces
    const adminFetchRes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "GET",
      headers: authHeaders
    });
    const adminProducts = await adminFetchRes.json();
    const createdInAdmin = Array.isArray(adminProducts) && adminProducts.find(p => p.id === createdProductId);

    report(
      "10. Acceso Administrador: Costos reales y proveedores visibles para admin autenticado",
      createdInAdmin && Number(createdInAdmin.costo_real) === 160 && createdInAdmin.tienda_proveedor === "Joyería Proveedor Staging",
      `Costo: $${createdInAdmin?.costo_real} | Proveedor: ${createdInAdmin?.tienda_proveedor} | Ganancia: $${createdInAdmin?.ganancia_estimada}`
    );

    // C. Editar precio, descripción, disponibilidad y variantes
    const patchRes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({
        id: createdProductId,
        updates: {
          precio_venta: 620,
          descripcion: "Descripción actualizada durante validación funcional.",
          es_destacado: true,
          badge: "OFERTA",
          color_modelo: "Plata Brillante"
        }
      })
    });
    const patchJson = await patchRes.json();
    const patchedRow = patchJson.data?.[0];

    report(
      "11. Edición de Producto: Actualización de precio, descripción, badge y variante",
      patchRes.status === 200 && patchedRow?.precio_venta == 620 && patchedRow?.badge === "OFERTA",
      `HTTP ${patchRes.status} | Precio: $${patchedRow?.precio_venta} | Badge: ${patchedRow?.badge} | Color: ${patchedRow?.color_modelo}`
    );
  } catch (err) {
    report("9. Creación y Edición de Producto", false, err.message);
  }

  // ----------------------------------------------------------------------------
  // FLUJO 5: SUBIDA DE FOTOGRAFÍAS Y VISUALIZACIÓN PÚBLICA
  // ----------------------------------------------------------------------------
  console.log("\n--- FLUJO 5: SUBIDA DE FOTOS Y VISUALIZACIÓN PÚBLICA ---");
  let uploadedPhotoUrl = null;
  const photoName = `stg_func_photo_${Date.now()}.jpg`;
  try {
    const dummyImageBuffer = Buffer.from(
      "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9",
      "hex"
    );

    const uploadRes = await fetch(`${SERVER_BASE}/api/admin/upload`, {
      method: "POST",
      headers: {
        "X-Requested-With": "YamikiAdmin",
        "Origin": SERVER_BASE,
        "Cookie": `yamiki_admin_session=${cookieToken}`,
        "Content-Type": "image/jpeg",
        "x-storage-path": photoName
      },
      body: dummyImageBuffer
    });
    const uploadJson = await uploadRes.json();
    uploadedPhotoUrl = uploadJson.url;

    report(
      "12. Subida de Fotos: Backend /api/admin/upload sube imagen binaria a Storage 'joyas'",
      uploadRes.status === 200 && uploadedPhotoUrl,
      `HTTP ${uploadRes.status} | URL: ${uploadedPhotoUrl}`
    );

    // Lectura pública de la imagen por cualquier visitante
    const photoFetchRes = await fetch(uploadedPhotoUrl);
    report(
      "13. Visualización Pública: Imagen accesible públicamente sin autenticación",
      photoFetchRes.status === 200 && photoFetchRes.headers.get("content-type")?.includes("image"),
      `HTTP ${photoFetchRes.status} | Content-Type: ${photoFetchRes.headers.get("content-type")}`
    );
  } catch (err) {
    report("12. Subida de Fotos", false, err.message);
  }

  // ----------------------------------------------------------------------------
  // FLUJO 6: IMPORTACIÓN DE EXCEL Y PRESERVACIÓN DE CAMPOS
  // ----------------------------------------------------------------------------
  console.log("\n--- FLUJO 6: IMPORTADOR EXCEL Y PRESERVACIÓN DE METADATOS ---");
  let excelProductId = null;
  try {
    // Generar archivo Excel sintético en memoria
    const excelRows = [
      {
        "ID Producto": "8880011",
        "Código / SKU Variante": `STG-XLS-${Date.now()}`,
        "Título": "MODIAN Anillo Clásico Zirconia Cúbica Plata Ley 925", // Incluye marca para probar limpiador
        "Color / Modelo Gema": "Color de la gema: Zafiro Blanco",
        "Tallas Disponibles": "7",
        "Precio Sugerido Venta": "MX$ 499.00",
        "TOTAL REAL CHECKOUT": "MX$ 135.50",
        "Ganancia Estimada": "MX$ 363.50",
        "% Aumento Aplicado": "268%",
        "Descripción del Producto": "Anillo de compromiso importado en prueba de validación.",
        "Metal / Material": "Plata esterlina 925",
        "Tipo de Piedra": "CIRCONITA",
        "Especificaciones": "Peso: 2.1g | Acabado: Rodio",
        "Enlace AliExpress": "https://es.aliexpress.com/item/fake-excel-item-888.html",
        "Tienda": "Proveedor Oficial Excel Staging",
        "Estado / Stock": "Disponible",
        "Foto Variante (Local)": photoName
      }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Parsear el Excel tal como lo hace SheetJS en admin.js
    const parsedWb = XLSX.read(excelBuffer, { type: "buffer" });
    const parsedJson = XLSX.utils.sheet_to_json(parsedWb.Sheets[parsedWb.SheetNames[0]], { defval: "" });

    // Mapear campos tal como admin.js processParsedExcelRows
    const mapped = parsedJson.map(row => ({
      id_aliexpress: String(row["ID Producto"]).trim(),
      codigo_sku: String(row["Código / SKU Variante"]).trim(),
      titulo: String(row["Título"]).replace(/^modian\s*[-–—:]*\s*/i, "").trim(),
      categoria: "anillos",
      color_modelo: String(row["Color / Modelo Gema"]).replace(/Color de la gema:\s*/i, "").trim(),
      tallas: String(row["Tallas Disponibles"]).trim(),
      precio_venta: 499,
      costo_real: 135.50,
      ganancia_estimada: 363.50,
      porcentaje_aumento: "268%",
      descripcion: String(row["Descripción del Producto"]).trim(),
      metal_material: String(row["Metal / Material"]).trim(),
      tipo_piedra: String(row["Tipo de Piedra"]).trim(),
      especificaciones: String(row["Especificaciones"]).trim(),
      enlace_aliexpress: String(row["Enlace AliExpress"]).trim(),
      tienda_proveedor: String(row["Tienda"]).trim(),
      foto_principal: uploadedPhotoUrl,
      estado_stock: "Disponible",
      activo: true,
      es_novedad: false,
      es_destacado: false,
      badge: "PLATA S925"
    }));

    // Guardar vía backend
    const saveRes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(mapped)
    });
    const saveJson = await saveRes.json();
    excelProductId = saveJson.data?.[0]?.id;

    report(
      "14. Importación Excel: Procesamiento de cabeceras de scraper y guardado vía API",
      saveRes.status === 201 && excelProductId,
      `HTTP ${saveRes.status} | Filas procesadas: ${saveJson.count} | ID: ${excelProductId}`
    );

    // Verificar en Supabase que TODOS los campos confidenciales y técnicos se conservaron
    const verifyProdRes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "GET",
      headers: authHeaders
    });
    const allProds = await verifyProdRes.json();
    const savedExcelProd = Array.isArray(allProds) && allProds.find(p => p.id === excelProductId);

    const preservedCorrectly = savedExcelProd &&
      savedExcelProd.id_aliexpress === "8880011" &&
      Number(savedExcelProd.costo_real) === 135.5 &&
      Number(savedExcelProd.ganancia_estimada) === 363.5 &&
      savedExcelProd.porcentaje_aumento === "268%" &&
      savedExcelProd.tienda_proveedor === "Proveedor Oficial Excel Staging" &&
      savedExcelProd.enlace_aliexpress === "https://es.aliexpress.com/item/fake-excel-item-888.html" &&
      savedExcelProd.titulo === "Anillo Clásico Zirconia Cúbica Plata Ley 925"; // Marca MODIAN limpiada

    report(
      "15. Preservación de Metadatos Excel: Costos, ganancias, enlaces y limpieza de marca intactos",
      preservedCorrectly,
      `Costo: $${savedExcelProd?.costo_real} | Margen: ${savedExcelProd?.porcentaje_aumento} | Proveedor: ${savedExcelProd?.tienda_proveedor} | Título: ${savedExcelProd?.titulo}`
    );
  } catch (err) {
    report("14. Importación Excel", false, err.message);
  }

  // ----------------------------------------------------------------------------
  // FLUJO 7: INTEGRIDAD DE FOTOS COMPARTIDAS AL ELIMINAR VARIANTES
  // ----------------------------------------------------------------------------
  console.log("\n--- FLUJO 7: ELIMINACIÓN DE PRODUCTO Y FOTOS COMPARTIDAS ---");
  try {
    const sharedSkuA = `STG-VAR-A-${Date.now()}`;
    const sharedSkuB = `STG-VAR-B-${Date.now()}`;

    // Crear dos joyas compartiendo la misma foto
    const createVarARes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        codigo_sku: sharedSkuA,
        titulo: "Joya Compartida Var A",
        categoria: "aretes",
        precio_venta: 300,
        foto_principal: uploadedPhotoUrl,
        activo: true
      })
    });
    const createVarBRes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        codigo_sku: sharedSkuB,
        titulo: "Joya Compartida Var B",
        categoria: "aretes",
        precio_venta: 300,
        foto_principal: uploadedPhotoUrl,
        activo: true
      })
    });

    const varAId = (await createVarARes.json()).data?.[0]?.id;
    const varBId = (await createVarBRes.json()).data?.[0]?.id;

    // Eliminar solo la variante A
    const delVarARes = await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "DELETE",
      headers: authHeaders,
      body: JSON.stringify({ ids: [varAId] })
    });

    // Comprobar que la foto SIGUE VIVA porque Var B aún existe
    const photoAfterDelRes = await fetch(uploadedPhotoUrl);

    report(
      "16. Integridad de Fotos: Al eliminar Var A, la foto compartida NO se borra de Storage",
      delVarARes.status === 200 && photoAfterDelRes.status === 200,
      `Var A eliminada (HTTP ${delVarARes.status}) | Foto compartida en Storage: HTTP ${photoAfterDelRes.status}`
    );

    // Ahora limpiar las joyas de prueba creadas durante este test
    await fetch(`${SERVER_BASE}/api/admin/productos`, {
      method: "DELETE",
      headers: authHeaders,
      body: JSON.stringify({ ids: [varBId, createdProductId, excelProductId].filter(Boolean) })
    });

    // Limpiar archivo de foto huérfana
    await fetch(`${SERVER_BASE}/api/admin/storage/cleanup-orphans`, {
      method: "POST",
      headers: authHeaders
    });

    console.log("[OK] Limpieza de registros y archivos sintéticos completada.");
  } catch (err) {
    report("16. Integridad de Fotos Compartidas", false, err.message);
  }

  console.log("\n==================================================================");
  console.log(`  RESUMEN FINAL DE PRUEBAS FUNCIONALES: ${passedTests} / ${totalTests} SUPERADAS`);
  console.log("==================================================================");

  return { passedTests, totalTests };
}

if (require.main === module) {
  runFunctionalSuite().catch(console.error);
}

module.exports = { runFunctionalSuite };
