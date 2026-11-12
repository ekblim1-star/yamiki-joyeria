// ==============================================================================
// CLOUDFLARE PAGES FUNCTIONS: SUBIDA SEGURA DE IMÁGENES (upload.js)
// ==============================================================================

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Sanitiza la ruta de almacenamiento para evitar Path Traversal
 */
function sanitizeStoragePath(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return `foto_${Date.now()}.jpg`;

  // Remover componentes '..' o barras invertidas
  const clean = rawPath
    .replace(/\\/g, "/")
    .replace(/\.\.+/g, "")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9_\-\.\/]/g, "_");

  return clean || `foto_${Date.now()}.jpg`;
}

export async function onRequestPost(context) {
  // Capa de defensa en profundidad
  if (!context.data?.adminSession?.admin) {
    return new Response(JSON.stringify({ error: "No autorizado. Sesión administrativa requerida." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { request, env } = context;

  try {
    const contentType = request.headers.get("content-type") || "";

    let fileBuffer = null;
    let fileMime = "image/jpeg";
    let storagePath = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const pathParam = formData.get("storagePath") || formData.get("filename") || "";

      if (!file || typeof file === "string") {
        return new Response(JSON.stringify({ error: "Archivo no encontrado en FormData." }), { status: 400, headers: { "Content-Type": "application/json" } });
      }

      fileBuffer = await file.arrayBuffer();
      fileMime = file.type || "image/jpeg";
      storagePath = sanitizeStoragePath(String(pathParam || file.name || "foto.jpg"));
    } else {
      // Subida binaria directa con cabecera de ruta
      const pathHeader = request.headers.get("x-storage-path") || `foto_${Date.now()}.jpg`;
      storagePath = sanitizeStoragePath(pathHeader);
      fileMime = contentType || "image/jpeg";
      fileBuffer = await request.arrayBuffer();
    }

    // Validar tipo MIME
    if (!ALLOWED_MIME_TYPES.has(fileMime)) {
      return new Response(
        JSON.stringify({ error: `Tipo de archivo no permitido: '${fileMime}'. Solo se admiten JPG, PNG y WEBP.` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validar tamaño máximo
    if (!fileBuffer || fileBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      return new Response(
        JSON.stringify({ error: "El archivo supera el tamaño máximo permitido de 10 MB." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Subir a Supabase Storage con service_role
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
    const uploadRes = await fetch(`${env.SUPABASE_URL}/storage/v1/object/joyas/${storagePath}`, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": fileMime,
        "x-upsert": "true"
      },
      body: fileBuffer
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return new Response(
        JSON.stringify({ error: `Error en Supabase Storage: ${errText}` }),
        { status: uploadRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/joyas/${storagePath}`;

    return new Response(
      JSON.stringify({
        success: true,
        Key: `joyas/${storagePath}`,
        url: publicUrl
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Error al procesar subida de archivo." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
