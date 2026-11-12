const fs = require('fs');

async function auditCatalog() {
  const supabaseUrl = 'https://nlpsvjweybdmkmrkfkyy.supabase.co';
  const anonKey = 'sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P';

  const res = await fetch(supabaseUrl + '/rest/v1/catalogo_tienda?select=*&order=id_aliexpress.asc,id.asc', {
    headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey }
  });
  const rows = await res.json();

  const groupMap = new Map();
  rows.forEach(r => {
    const gid = String(r.id_aliexpress || r.id);
    if (!groupMap.has(gid)) groupMap.set(gid, []);
    groupMap.get(gid).push(r);
  });

  const sitemapXml = fs.readFileSync('sitemap.xml', 'utf8');
  const joyaUrls = [...sitemapXml.matchAll(/<loc>https:\/\/yamiki-joyeria\.pages\.dev\/joya\/([^<]+)<\/loc>/g)].map(m => decodeURIComponent(m[1]));
  const sitemapSet = new Set(joyaUrls);

  console.log('=== AUDITORIA DE LAS 47 FICHAS DE PRODUCTO ===');
  let idx = 1;
  let totalVariantesSum = 0;
  let missingUrls = [];
  const results = [];

  for (const [gid, items] of groupMap.entries()) {
    totalVariantesSum += items.length;
    const inSitemap = sitemapSet.has(gid);
    if (!inSitemap) missingUrls.push(gid);

    const primary = items[0];
    const itemData = {
      index: idx,
      groupId: gid,
      titulo: primary.titulo,
      categoria: primary.categoria,
      totalVariantes: items.length,
      enSitemap: inSitemap,
      variantes: items.map(it => ({
        id: it.id,
        sku: it.codigo_sku || String(it.id),
        color_modelo: it.color_modelo || 'Principal',
        tallas: it.tallas || 'Ajustable',
        precio: it.precio_venta,
        stock: it.estado_stock || (it.activo ? 'Disponible' : 'Agotada'),
        foto: Boolean(it.foto_principal)
      }))
    };
    results.push(itemData);
  }

  // Comprobar integridad de cada variante
  let sinFoto = 0;
  let sinPrecio = 0;
  let sinColorEnMulti = 0;
  rows.forEach(r => {
    if (!r.foto_principal) sinFoto++;
    if (!r.precio_venta || r.precio_venta <= 0) sinPrecio++;
    const gid = String(r.id_aliexpress || r.id);
    const siblings = groupMap.get(gid);
    if (siblings.length > 1 && !r.color_modelo) sinColorEnMulti++;
  });

  console.log('\n=========================================');
  console.log('RESUMEN DE VALIDACIÓN:');
  console.log(`- Total filas en catalogo_tienda: ${rows.length}`);
  console.log(`- Fichas de producto agrupadas: ${groupMap.size}`);
  console.log(`- Suma total de variantes en las fichas: ${totalVariantesSum}`);
  console.log(`- Variantes huérfanas o sin asignar: ${rows.length - totalVariantesSum}`);
  console.log(`- URLs en Sitemap: ${joyaUrls.length}`);
  console.log(`- Fichas presentes en Sitemap: ${groupMap.size - missingUrls.length} de ${groupMap.size}`);
  console.log(`- Fichas con múltiples variantes (color/gema): ${results.filter(r => r.totalVariantes > 1).length}`);
  console.log(`- Fichas con variante única: ${results.filter(r => r.totalVariantes === 1).length}`);
  console.log(`- Variantes sin fotografía: ${sinFoto}`);
  console.log(`- Variantes sin precio de venta: ${sinPrecio}`);
  console.log(`- Variantes sin color_modelo en fichas multi-variante: ${sinColorEnMulti}`);
  console.log('=========================================');

  return results;
}

auditCatalog().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
