// ==============================================================================
// CLOUDFLARE PAGES FUNCTIONS: LIMPIEZA DE FOTOS HUÉRFANAS (cleanup-orphans.js)
// ==============================================================================

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Verificación estricta de sesión administrativa (Capa defensiva directa)
  if (!context.data?.adminSession?.admin) {
    return new Response(
      JSON.stringify({ error: "No autorizado. Sesión administrativa requerida." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 2. Obtener TODAS las fotos referenciadas en productos (Paginación exhaustiva)
    const activePhotoKeys = new Set();
    const activeBasenames = new Set();
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const prodRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/productos?select=foto_principal,galeria_fotos&offset=${offset}&limit=${batchSize}`,
        {
          headers: {
            "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
          }
        }
      );

      if (!prodRes.ok) {
        const errText = await prodRes.text();
        return new Response(
          JSON.stringify({ error: `Error al consultar productos: ${errText}` }),
          { status: prodRes.status, headers: { "Content-Type": "application/json" } }
        );
      }

      const rows = await prodRes.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        hasMore = false;
        break;
      }

      rows.forEach((r) => {
        // Analizar foto principal
        if (r.foto_principal && typeof r.foto_principal === "string") {
          const raw = r.foto_principal;
          const m = raw.match(/\/storage\/v1\/object\/public\/joyas\/(.+)$/);
          if (m) {
            const decoded = decodeURIComponent(m[1]);
            activePhotoKeys.add(decoded);
            const base = decoded.split("/").pop();
            if (base) activeBasenames.add(base.toLowerCase());
          } else {
            activePhotoKeys.add(raw);
            const base = raw.split("/").pop();
            if (base) activeBasenames.add(base.toLowerCase());
          }
        }

        // Analizar galería de fotos
        if (Array.isArray(r.galeria_fotos)) {
          r.galeria_fotos.forEach((u) => {
            if (u && typeof u === "string") {
              const m = u.match(/\/storage\/v1\/object\/public\/joyas\/(.+)$/);
              if (m) {
                const decoded = decodeURIComponent(m[1]);
                activePhotoKeys.add(decoded);
                const base = decoded.split("/").pop();
                if (base) activeBasenames.add(base.toLowerCase());
              } else {
                activePhotoKeys.add(u);
                const base = u.split("/").pop();
                if (base) activeBasenames.add(base.toLowerCase());
              }
            }
          });
        }
      });

      offset += rows.length;
      if (rows.length < batchSize) hasMore = false;
    }

    // 3. Listar archivos en bucket joyas
    const listRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/joyas`, {
      method: "POST",
      headers: {
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prefix: "", limit: 1000 })
    });

    if (!listRes.ok) {
      const errText = await listRes.text();
      return new Response(
        JSON.stringify({ error: errText }),
        { status: listRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const files = await listRes.json();
    const orphanFiles = [];

    files.forEach((f) => {
      // Ignorar carpetas virtuales
      if (f.id === null && !f.metadata) return;

      const fileName = f.name;
      const lowerName = fileName.toLowerCase();

      // Verificar si el archivo está en uso por clave exacta o por nombre base
      const isReferenced = activePhotoKeys.has(fileName) || activeBasenames.has(lowerName);

      // Si NO está referenciado, verificar si coincide con prefijos de prueba temporales
      // para evitar borrar fotos históricas subidas por error
      if (!isReferenced) {
        if (
          fileName.startsWith("test_") ||
          fileName.startsWith("verify_") ||
          fileName.startsWith("audit_") ||
          fileName.startsWith("hack_")
        ) {
          orphanFiles.push(fileName);
        }
      }
    });

    // 4. Eliminación de archivos huérfanos confirmados
    let deletedCount = 0;
    if (orphanFiles.length > 0) {
      const delRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/joyas`, {
        method: "DELETE",
        headers: {
          "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prefixes: orphanFiles })
      });
      if (delRes.ok) deletedCount = orphanFiles.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        activePhotosCount: activePhotoKeys.size,
        orphanFilesDetected: orphanFiles.length,
        deletedCount: deletedCount,
        purgedFiles: orphanFiles
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
