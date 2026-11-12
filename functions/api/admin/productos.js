// ==============================================================================
// CLOUDFLARE PAGES FUNCTIONS: GESTIÓN DE PRODUCTOS Y VARIANTES (productos.js)
// ==============================================================================

const ALLOWED_COLUMNS = new Set([
  "id",
  "id_aliexpress",
  "codigo_sku",
  "titulo",
  "categoria",
  "color_modelo",
  "tallas",
  "especificaciones",
  "descripcion",
  "precio_venta",
  "costo_real",
  "ganancia_estimada",
  "porcentaje_aumento",
  "tienda_proveedor",
  "activo",
  "estado_stock",
  "es_novedad",
  "es_destacado",
  "badge",
  "enlace_aliexpress",
  "foto_principal",
  "galeria_fotos",
  "metal_material",
  "tipo_piedra",
  "updated_at",
  "created_at"
]);

function sanitizeProductPayload(item) {
  if (!item || typeof item !== "object") return null;

  const clean = {};
  for (const [key, value] of Object.entries(item)) {
    if (!ALLOWED_COLUMNS.has(key)) continue;

    if (typeof value === "string") {
      clean[key] = value.replace(/\0/g, "").trim();
    } else if (typeof value === "number") {
      if (isNaN(value)) clean[key] = null;
      else clean[key] = value;
    } else if (typeof value === "boolean") {
      clean[key] = value;
    } else if (Array.isArray(value)) {
      clean[key] = value;
    } else if (value === null || value === undefined) {
      clean[key] = null;
    } else {
      clean[key] = value;
    }
  }

  if (clean.precio_venta !== undefined && clean.precio_venta !== null) {
    const num = Number(clean.precio_venta);
    if (isNaN(num) || num < 0) {
      throw new Error(`Precio de venta inválido: ${clean.precio_venta}`);
    }
    clean.precio_venta = num;
  }

  if (clean.costo_real !== undefined && clean.costo_real !== null) {
    const num = Number(clean.costo_real);
    clean.costo_real = isNaN(num) || num < 0 ? null : num;
  }

  if (Object.keys(clean).length === 0) {
    return null;
  }

  return clean;
}

function extractStoragePathFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/\/storage\/v1\/object\/public\/joyas\/(.+)$/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

// 1. GET: Consulta de productos para el panel (con campos administrativos)
export async function onRequestGet(context) {
  // Capa de defensa en profundidad
  if (!context.data?.adminSession?.admin) {
    return new Response(JSON.stringify({ error: "No autorizado. Sesión administrativa requerida." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { env } = context;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const url = new URL(context.request.url);
  const selectQuery = url.searchParams.get("select") || "*";

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/productos?select=${encodeURIComponent(selectQuery)}&order=created_at.desc`, {
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// 2. POST: Alta o importación masiva en lote
export async function onRequestPost(context) {
  if (!context.data?.adminSession?.admin) {
    return new Response(JSON.stringify({ error: "No autorizado. Sesión administrativa requerida." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { request, env } = context;

  try {
    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];

    const sanitizedItems = items.map(sanitizeProductPayload).filter(Boolean);
    if (sanitizedItems.length === 0) {
      return new Response(JSON.stringify({ error: "No se proporcionaron datos válidos para guardar." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/productos`, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=merge-duplicates"
      },
      body: JSON.stringify(sanitizedItems)
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    const savedData = await res.json();
    return new Response(JSON.stringify({ success: true, count: savedData.length, data: savedData }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// 3. PATCH: Edición de un producto, variante o grupo completo
export async function onRequestPatch(context) {
  if (!context.data?.adminSession?.admin) {
    return new Response(JSON.stringify({ error: "No autorizado. Sesión administrativa requerida." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { request, env } = context;

  try {
    const body = await request.json();
    const { id, ids, updates } = body;

    const targetIds = Array.isArray(ids) && ids.length > 0 ? ids : (id ? [id] : []);
    if (targetIds.length === 0) {
      return new Response(JSON.stringify({ error: "Se requiere 'id' o 'ids' para actualizar." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const cleanUpdates = sanitizeProductPayload(updates);
    if (!cleanUpdates) {
      return new Response(JSON.stringify({ error: "No se proporcionaron campos válidos para actualizar." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    cleanUpdates.updated_at = new Date().toISOString();

    const idFilter = targetIds.map(i => `"${i}"`).join(",");
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/productos?id=in.(${idFilter})`, {
      method: "PATCH",
      headers: {
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(cleanUpdates)
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: errText }), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    const updatedData = await res.json();
    return new Response(JSON.stringify({ success: true, updated: updatedData.length, data: updatedData }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// 4. DELETE: Eliminación de joya con protección de fotos compartidas entre variantes
export async function onRequestDelete(context) {
  if (!context.data?.adminSession?.admin) {
    return new Response(JSON.stringify({ error: "No autorizado. Sesión administrativa requerida." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { request, env } = context;

  try {
    let targetIds = [];
    const url = new URL(request.url);
    const paramId = url.searchParams.get("id");

    if (paramId) {
      targetIds = [paramId];
    } else {
      const body = await request.json().catch(() => ({}));
      if (body && Array.isArray(body.ids)) targetIds = body.ids;
      else if (body && body.id) targetIds = [body.id];
    }

    if (targetIds.length === 0) {
      return new Response(JSON.stringify({ error: "Se requieren 'ids' válidos para eliminar." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Paso A: Obtener fotos de los registros a eliminar
    const idFilter = targetIds.map(i => `"${i}"`).join(",");
    const selectRes = await fetch(`${env.SUPABASE_URL}/rest/v1/productos?id=in.(${idFilter})&select=foto_principal,galeria_fotos`, {
      headers: {
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    const candidatePhotos = new Set();
    if (selectRes.ok) {
      const rows = await selectRes.json();
      rows.forEach(r => {
        const mainPath = extractStoragePathFromUrl(r.foto_principal);
        if (mainPath) candidatePhotos.add(mainPath);

        if (Array.isArray(r.galeria_fotos)) {
          r.galeria_fotos.forEach(u => {
            const galPath = extractStoragePathFromUrl(u);
            if (galPath) candidatePhotos.add(galPath);
          });
        }
      });
    }

    // Paso B: Eliminar filas en Supabase
    const delRes = await fetch(`${env.SUPABASE_URL}/rest/v1/productos?id=in.(${idFilter})`, {
      method: "DELETE",
      headers: {
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=representation"
      }
    });

    if (!delRes.ok) {
      const errText = await delRes.text();
      return new Response(JSON.stringify({ error: errText }), { status: delRes.status, headers: { "Content-Type": "application/json" } });
    }

    const deletedRows = await delRes.json();

    // Paso C: Protección de fotos compartidas:
    // Comprobar si las fotos candidatas siguen siendo utilizadas por ALGÚN OTRO producto restante
    let deletedPhotosCount = 0;
    if (candidatePhotos.size > 0) {
      try {
        const remainRes = await fetch(`${env.SUPABASE_URL}/rest/v1/productos?select=foto_principal,galeria_fotos`, {
          headers: {
            "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        });

        const activePhotos = new Set();
        if (remainRes.ok) {
          const remainingRows = await remainRes.json();
          remainingRows.forEach(r => {
            const mPath = extractStoragePathFromUrl(r.foto_principal);
            if (mPath) activePhotos.add(mPath);
            if (Array.isArray(r.galeria_fotos)) {
              r.galeria_fotos.forEach(u => {
                const gPath = extractStoragePathFromUrl(u);
                if (gPath) activePhotos.add(gPath);
              });
            }
          });
        }

        // Solo eliminar aquellas que NO están en uso por otros productos
        const safeToDelete = Array.from(candidatePhotos).filter(p => !activePhotos.has(p));

        if (safeToDelete.length > 0) {
          const delStorageRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/joyas`, {
            method: "DELETE",
            headers: {
              "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ prefixes: safeToDelete })
          });
          if (delStorageRes.ok) {
            deletedPhotosCount = safeToDelete.length;
          }
        }
      } catch (e) {
        console.warn("Advertencia: No se pudieron borrar algunas fotos de Storage:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      deletedCount: deletedRows.length,
      deletedPhotos: deletedPhotosCount
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
