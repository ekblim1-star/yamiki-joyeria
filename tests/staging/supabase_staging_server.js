const http = require('http');
const url = require('url');

const STAGING_ANON_KEY = "staging_anon_key_mock_s925";
const STAGING_SERVICE_ROLE_KEY = "staging_service_role_key_secret_mock_s925";

const PRIVATE_COLUMNS = new Set([
  "costo_real",
  "ganancia_estimada",
  "porcentaje_aumento",
  "enlace_aliexpress",
  "tienda_proveedor"
]);

// Base de datos de prueba en memoria (aislada de producción)
const stagingDatabase = {
  productos: [
    {
      id: "prod-stg-01",
      id_aliexpress: "1005001",
      codigo_sku: "STG-RING-01",
      titulo: "Anillo Corona Plata S925 Staging",
      categoria: "anillos",
      color_modelo: "Plateado",
      tallas: "6 - 7 - 8",
      precio_venta: 450,
      costo_real: 120, // Privado
      ganancia_estimada: 330, // Privado
      porcentaje_aumento: 275, // Privado
      enlace_aliexpress: "https://aliexpress.com/item/1005001.html", // Privado
      tienda_proveedor: "AliSupplier Joyas", // Privado
      descripcion: "Joya de plata ley 925 de prueba.",
      metal_material: "Plata esterlina 925",
      tipo_piedra: "CIRCONITA",
      especificaciones: "Certificado S925",
      foto_principal: "http://127.0.0.1:54321/storage/v1/object/public/joyas/stg-ring-01.jpg",
      galeria_fotos: ["http://127.0.0.1:54321/storage/v1/object/public/joyas/stg-ring-01-side.jpg"],
      estado_stock: "Disponible",
      activo: true,
      es_novedad: true,
      es_destacado: false,
      badge: "PLATA S925",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: "prod-stg-02",
      id_aliexpress: "1005002",
      codigo_sku: "STG-RING-02-INACTIVO",
      titulo: "Anillo Inactivo Fuera de Catálogo",
      categoria: "anillos",
      precio_venta: 300,
      costo_real: 80,
      ganancia_estimada: 220,
      porcentaje_aumento: 275,
      enlace_aliexpress: "https://aliexpress.com/item/1005002.html",
      tienda_proveedor: "AliSupplier Joyas",
      activo: false, // Inactivo: NO debe aparecer en catalogo_tienda
      estado_stock: "Agotada",
      created_at: new Date().toISOString()
    }
  ],
  admin_rate_limit: new Map(),
  storage: new Map([
    ["stg-ring-01.jpg", Buffer.from("fake-jpeg-data-ring-01")],
    ["stg-ring-01-side.jpg", Buffer.from("fake-jpeg-data-ring-side")]
  ])
};

function createSupabaseStagingServer(port = 54321) {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const authHeader = req.headers["authorization"] || "";
    const apiKey = req.headers["apikey"] || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "");

    const isServiceRole = apiKey === STAGING_SERVICE_ROLE_KEY;
    const isAnon = apiKey === STAGING_ANON_KEY;

    // Helper respuesta JSON
    const sendJson = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    // Helper lectura body
    let bodyBuffer = [];
    req.on("data", chunk => bodyBuffer.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(bodyBuffer);
      let jsonBody = null;
      try {
        if (rawBody.length > 0 && req.headers["content-type"]?.includes("application/json")) {
          jsonBody = JSON.parse(rawBody.toString("utf8"));
        }
      } catch (e) {}

      // ==============================================================
      // 1. ENDPOINTS DE STORAGE (Bucket 'joyas')
      // ==============================================================
      if (pathname.startsWith("/storage/v1/object/public/joyas/")) {
        const filePath = decodeURIComponent(pathname.replace("/storage/v1/object/public/joyas/", ""));
        if (stagingDatabase.storage.has(filePath)) {
          res.writeHead(200, { "Content-Type": "image/jpeg" });
          res.end(stagingDatabase.storage.get(filePath));
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
        }
        return;
      }

      if (pathname.startsWith("/storage/v1/object/joyas/")) {
        const filePath = decodeURIComponent(pathname.replace("/storage/v1/object/joyas/", ""));

        // Regla RLS: anon NO puede subir ni sobrescribir archivos
        if (req.method === "POST" || req.method === "PUT") {
          if (!isServiceRole) {
            return sendJson(403, { code: "42501", message: "permission denied for table storage.objects" });
          }
          stagingDatabase.storage.set(filePath, rawBody);
          return sendJson(200, { Key: `joyas/${filePath}`, Id: "stg-file-id" });
        }
      }

      if (pathname === "/storage/v1/object/joyas" && req.method === "DELETE") {
        if (!isServiceRole) {
          return sendJson(403, { code: "42501", message: "permission denied for table storage.objects" });
        }
        const prefixes = jsonBody?.prefixes || [];
        prefixes.forEach(p => stagingDatabase.storage.delete(p));
        return sendJson(200, prefixes.map(p => ({ name: p })));
      }

      if (pathname === "/storage/v1/object/list/joyas" && req.method === "POST") {
        const files = Array.from(stagingDatabase.storage.keys()).map(k => ({
          name: k,
          id: `id-${k}`,
          metadata: { size: stagingDatabase.storage.get(k).length }
        }));
        return sendJson(200, files);
      }

      // ==============================================================
      // 2. ENDPOINTS DE RATE LIMITING (admin_rate_limit)
      // ==============================================================
      if (pathname.startsWith("/rest/v1/admin_rate_limit")) {
        if (!isServiceRole) {
          return sendJson(403, { code: "42501", message: "permission denied for table admin_rate_limit" });
        }
        if (req.method === "GET") {
          const ipParam = parsedUrl.query["ip_address"];
          const ip = ipParam ? ipParam.replace("eq.", "") : null;
          if (ip && stagingDatabase.admin_rate_limit.has(ip)) {
            return sendJson(200, [stagingDatabase.admin_rate_limit.get(ip)]);
          }
          return sendJson(200, []);
        }
        if (req.method === "POST") {
          if (jsonBody && jsonBody.ip_address) {
            stagingDatabase.admin_rate_limit.set(jsonBody.ip_address, jsonBody);
            return sendJson(201, [jsonBody]);
          }
        }
        if (req.method === "DELETE") {
          const ipParam = parsedUrl.query["ip_address"];
          const ip = ipParam ? ipParam.replace("eq.", "") : null;
          if (ip) stagingDatabase.admin_rate_limit.delete(ip);
          return sendJson(200, []);
        }
      }

      // ==============================================================
      // 3. TABLA 'productos'
      // ==============================================================
      if (pathname.startsWith("/rest/v1/productos")) {
        // Regla SQL: anon NO tiene INSERT, UPDATE ni DELETE
        if (req.method === "POST" || req.method === "PATCH" || req.method === "DELETE") {
          if (!isServiceRole) {
            return sendJson(403, { code: "42501", message: "permission denied for relation productos" });
          }

          if (req.method === "POST") {
            const items = Array.isArray(jsonBody) ? jsonBody : [jsonBody];
            items.forEach(item => {
              if (!item.id) item.id = `prod-stg-${Date.now()}-${Math.floor(Math.random()*1000)}`;
              stagingDatabase.productos.push(item);
            });
            return sendJson(201, items);
          }

          if (req.method === "PATCH") {
            const idFilter = parsedUrl.query["id"] || "";
            let updatedCount = 0;
            stagingDatabase.productos.forEach(p => {
              if (idFilter.includes(p.id) || idFilter.includes(p.codigo_sku)) {
                Object.assign(p, jsonBody, { updated_at: new Date().toISOString() });
                updatedCount++;
              }
            });
            return sendJson(200, [{ count: updatedCount }]);
          }

          if (req.method === "DELETE") {
            const idFilter = parsedUrl.query["id"] || "";
            const initialCount = stagingDatabase.productos.length;
            stagingDatabase.productos = stagingDatabase.productos.filter(p => !idFilter.includes(p.id));
            const deleted = initialCount - stagingDatabase.productos.length;
            return sendJson(200, [{ deletedCount: deleted }]);
          }
        }

        // Regla SELECT para anon: Column-Level Permissions
        if (req.method === "GET") {
          const selectQuery = parsedUrl.query["select"] || "*";
          if (!isServiceRole) {
            // Verificar si anon intenta leer columnas privadas
            const requestedCols = selectQuery.split(",").map(c => c.trim().toLowerCase());
            for (const col of requestedCols) {
              if (PRIVATE_COLUMNS.has(col) || selectQuery === "*") {
                return sendJson(403, {
                  code: "42501",
                  message: `permission denied for column ${col || 'private'} of relation productos`
                });
              }
            }
          }

          // RLS: Si es anon, filtrar únicamente filas activas
          let results = stagingDatabase.productos;
          if (!isServiceRole) {
            results = results.filter(p => p.activo === true);
          }
          return sendJson(200, results);
        }
      }

      // ==============================================================
      // 4. VISTA PÚBLICA SEGURA 'catalogo_tienda' (security_invoker = true)
      // ==============================================================
      if (pathname.startsWith("/rest/v1/catalogo_tienda")) {
        // Regla: Prohibido cualquier INSERT, UPDATE o DELETE en la vista
        if (req.method !== "GET") {
          return sendJson(403, { code: "42501", message: "permission denied: cannot modify view catalogo_tienda" });
        }

        // SELECT en catalogo_tienda: Filtra activo = true y excluye columnas privadas
        const publicRows = stagingDatabase.productos
          .filter(p => p.activo === true)
          .map(p => {
            const copy = { ...p };
            PRIVATE_COLUMNS.forEach(col => delete copy[col]);
            return copy;
          });

        return sendJson(200, publicRows);
      }

      res.writeHead(404);
      res.end("Endpoint no encontrado");
    });
  });

  return {
    server,
    start: () => new Promise(resolve => server.listen(port, resolve)),
    close: () => new Promise(resolve => server.close(resolve)),
    database: stagingDatabase
  };
}

module.exports = {
  createSupabaseStagingServer,
  STAGING_ANON_KEY,
  STAGING_SERVICE_ROLE_KEY
};
