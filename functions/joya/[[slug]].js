// ==============================================================================
// CLOUDFLARE PAGES FUNCTION: ENRIQUECIMIENTO DINÁMICO DE OPEN GRAPH PARA JOYAS
// Permite que al compartir enlaces /joya/:slug por WhatsApp, Facebook o redes
// se visualice la foto real de la joya, su título y su precio.
// ==============================================================================

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function onRequest(context) {
  const { request, params, env, next } = context;
  const slug = params.slug ? (Array.isArray(params.slug) ? params.slug.join("/") : params.slug) : "";

  // 1. Obtener index.html base del servidor estático
  const response = await next();
  if (!slug || !response.ok) {
    return response;
  }

  // 2. Consultar la joya en Supabase (vista pública catalogo_tienda)
  const supabaseUrl = env.SUPABASE_URL || "https://nlpsvjweybdmkmrkfkyy.supabase.co";
  const anonKey = "sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P";

  try {
    const querySlug = decodeURIComponent(slug).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(querySlug);
    const filter = isUuid
      ? `or=(id.eq.${encodeURIComponent(querySlug)},codigo_sku.eq.${encodeURIComponent(querySlug)},id_aliexpress.eq.${encodeURIComponent(querySlug)})`
      : `or=(codigo_sku.eq.${encodeURIComponent(querySlug)},id_aliexpress.eq.${encodeURIComponent(querySlug)})`;
    const apiUrl = `${supabaseUrl}/rest/v1/catalogo_tienda?${filter}&limit=1`;
    
    const apiRes = await fetch(apiUrl, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`
      }
    });

    if (!apiRes.ok) return response;
    const items = await apiRes.json();
    if (!items || items.length === 0) return response;

    const prod = items[0];
    const rawHtml = await response.text();

    const title = `${prod.titulo || "Joya en Plata Ley S925"} | Yamiki Joyería`;
    const priceText = prod.precio_venta ? `$${Math.round(prod.precio_venta)} MXN` : "Plata Ley S925";
    const desc = prod.descripcion
      ? prod.descripcion.substring(0, 160).trim()
      : `Hermosa pieza en Plata Esterlina Ley S925. Precio: ${priceText}. Envíos protegidos a todo México y garantía de autenticidad S925.`;
    const photo = prod.foto_principal || "https://yamiki-joyeria.pages.dev/img/hero-bg-pc-dark.webp";
    const canonicalUrl = `https://yamiki-joyeria.pages.dev/joya/${encodeURIComponent(slug)}`;

    // Generar tags Open Graph, Twitter Cards y Schema.org Product
    const metaTags = `
  <!-- Metadatos Dinámicos del Producto para WhatsApp, Facebook y Google -->
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Yamiki Joyería" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:image" content="${escapeHtml(photo)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(photo)}" />
  <meta property="og:image:alt" content="${escapeHtml(prod.titulo || 'Joya Yamiki')}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="product:price:amount" content="${prod.precio_venta || ''}" />
  <meta property="product:price:currency" content="MXN" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(desc)}" />
  <meta name="twitter:image" content="${escapeHtml(photo)}" />

  <!-- Datos Estructurados Schema.org para Producto -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": ${JSON.stringify(prod.titulo || "Joya en Plata Ley S925")},
    "image": [${JSON.stringify(photo)}],
    "description": ${JSON.stringify(desc)},
    "sku": ${JSON.stringify(prod.codigo_sku || slug)},
    "material": "Plata Esterlina Ley S925",
    "brand": {
      "@type": "Brand",
      "name": "Yamiki Joyería"
    },
    "offers": {
      "@type": "Offer",
      "url": ${JSON.stringify(canonicalUrl)},
      "priceCurrency": "MXN",
      "price": ${JSON.stringify(String(Math.round(prod.precio_venta || 350)))},
      "itemCondition": "https://schema.org/NewCondition",
      "availability": "https://schema.org/InStock",
      "seller": {
        "@type": "Organization",
        "name": "Yamiki Joyería"
      }
    }
  }
  </script>
`;

    // Reemplazar la etiqueta <title> estática existente y añadir los meta tags antes de </head>
    let modifiedHtml = rawHtml.replace(/<title>.*?<\/title>/i, "");
    modifiedHtml = modifiedHtml.replace("</head>", `${metaTags}\n</head>`);

    return new Response(modifiedHtml, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "index, follow"
      }
    });
  } catch (err) {
    console.error("Fallo al enriquecer joya con Open Graph:", err);
    return response;
  }
}
