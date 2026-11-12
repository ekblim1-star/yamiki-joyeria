const fs = require('fs');

async function buildSitemap() {
  const supabaseUrl = 'https://nlpsvjweybdmkmrkfkyy.supabase.co';
  const anonKey = 'sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P';

  const res = await fetch(`${supabaseUrl}/rest/v1/catalogo_tienda?select=id,codigo_sku,id_aliexpress,titulo,foto_principal,created_at`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`
    }
  });

  if (!res.ok) {
    throw new Error(`Error fetching catalogo_tienda: HTTP ${res.status}`);
  }

  const rows = await res.json();
  console.log(`Productos obtenidos para sitemap: ${rows.length}`);

  // Agrupar por id_aliexpress / código para slugs limpios
  const seenSlugs = new Set();
  const productEntries = [];

  const now = new Date().toISOString().split('T')[0];

  for (const row of rows) {
    const slug = encodeURIComponent(row.id_aliexpress || row.codigo_sku || row.id);
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);

    productEntries.push({
      loc: `https://yamiki-joyeria.pages.dev/joya/${slug}`,
      lastmod: row.created_at ? row.created_at.split('T')[0] : now,
      changefreq: 'weekly',
      priority: '0.8',
      image: row.foto_principal || null,
      title: row.titulo || 'Joyería Plata Ley S925'
    });
  }

  const staticPages = [
    { loc: 'https://yamiki-joyeria.pages.dev/', changefreq: 'daily', priority: '1.0' },
    { loc: 'https://yamiki-joyeria.pages.dev/catalogo', changefreq: 'daily', priority: '0.9' },
    { loc: 'https://yamiki-joyeria.pages.dev/guia-tallas', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://yamiki-joyeria.pages.dev/garantia', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://yamiki-joyeria.pages.dev/politicas', changefreq: 'monthly', priority: '0.7' },
    { loc: 'https://yamiki-joyeria.pages.dev/nosotros', changefreq: 'monthly', priority: '0.6' }
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  // Static pages
  for (const p of staticPages) {
    xml += `  <url>\n`;
    xml += `    <loc>${p.loc}</loc>\n`;
    xml += `    <lastmod>${now}</lastmod>\n`;
    xml += `    <changefreq>${p.changefreq}</changefreq>\n`;
    xml += `    <priority>${p.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // Product pages
  for (const p of productEntries) {
    xml += `  <url>\n`;
    xml += `    <loc>${p.loc}</loc>\n`;
    xml += `    <lastmod>${p.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${p.changefreq}</changefreq>\n`;
    xml += `    <priority>${p.priority}</priority>\n`;
    if (p.image) {
      xml += `    <image:image>\n`;
      xml += `      <image:loc>${escapeXml(p.image)}</image:loc>\n`;
      xml += `      <image:title>${escapeXml(p.title)}</image:title>\n`;
      xml += `    </image:image>\n`;
    }
    xml += `  </url>\n`;
  }

  xml += `</urlset>\n`;

  fs.writeFileSync('sitemap.xml', xml, 'utf8');
  console.log(`sitemap.xml generado con éxito (${staticPages.length} páginas estáticas + ${productEntries.length} joyas).`);
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

buildSitemap().catch(err => {
  console.error('Error generando sitemap:', err);
  process.exit(1);
});
