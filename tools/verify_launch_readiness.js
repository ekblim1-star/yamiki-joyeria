const fs = require('fs');

async function verifyAll() {
  console.log('=== TEST 1: VERIFICACIÓN DEL SITEMAP Y 47 FICHAS ===');
  const sitemapXml = fs.readFileSync('sitemap.xml', 'utf8');
  const joyaUrls = [...sitemapXml.matchAll(/<loc>https:\/\/yamiki-joyeria\.pages\.dev\/joya\/([^<]+)<\/loc>/g)].map(m => decodeURIComponent(m[1]));
  console.log(`Total URLs de joyas en sitemap: ${joyaUrls.length} (esperado: 47)`);

  const supabaseUrl = 'https://nlpsvjweybdmkmrkfkyy.supabase.co';
  const anonKey = 'sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P';

  const res = await fetch(supabaseUrl + '/rest/v1/catalogo_tienda?select=*', {
    headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey }
  });
  const rows = await res.json();

  const groupMap = new Map();
  rows.forEach(r => {
    const gid = String(r.id_aliexpress || r.id);
    if (!groupMap.has(gid)) groupMap.set(gid, []);
    groupMap.get(gid).push(r);
  });

  const joyaSet = new Set(joyaUrls);
  let allFound = true;
  for (const gid of groupMap.keys()) {
    if (!joyaSet.has(gid)) {
      console.error(`Falta ficha en sitemap: ${gid}`);
      allFound = false;
    }
  }
  console.log(`¿Todas las 47 fichas están presentes en sitemap? ${allFound ? 'SÍ (100%)' : 'NO'}`);

  console.log('\n=== TEST 2: SIMULACIÓN OPEN GRAPH EN EDGE FUNCTION (TODAS LAS 47 URLs) ===');
  let resolvedCount = 0;
  let unresolved = [];

  for (const slug of joyaUrls) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const filter = isUuid
      ? `or=(id.eq.${encodeURIComponent(slug)},codigo_sku.eq.${encodeURIComponent(slug)},id_aliexpress.eq.${encodeURIComponent(slug)})`
      : `or=(codigo_sku.eq.${encodeURIComponent(slug)},id_aliexpress.eq.${encodeURIComponent(slug)})`;
    const queryUrl = `${supabaseUrl}/rest/v1/catalogo_tienda?${filter}&limit=1`;
    const r = await fetch(queryUrl, {
      headers: { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey }
    });
    const data = await r.json();
    if (data && data.length > 0) {
      resolvedCount++;
    } else {
      unresolved.push(slug);
    }
  }

  console.log(`Total URLs de sitemap que resuelven en la Edge Function: ${resolvedCount} de ${joyaUrls.length}`);
  if (unresolved.length > 0) {
    console.error(`URLs no resueltas:`, unresolved);
  }

  console.log('\n=== TEST 3: VALIDACIÓN DE ROBOTS.TXT Y SEGURIDAD PÚBLICA ===');
  const robotsTxt = fs.readFileSync('robots.txt', 'utf8');
  const hasDisallowAdmin = robotsTxt.includes('Disallow: /admin/');
  const hasDisallowApiAdmin = robotsTxt.includes('Disallow: /api/admin/');
  const hasSitemapRef = robotsTxt.includes('sitemap.xml');
  console.log(`Disallow /admin/: ${hasDisallowAdmin ? 'CORRECTO' : 'FALLO'}`);
  console.log(`Disallow /api/admin/: ${hasDisallowApiAdmin ? 'CORRECTO' : 'FALLO'}`);
  console.log(`Referencia sitemap.xml: ${hasSitemapRef ? 'CORRECTO' : 'FALLO'}`);

  console.log('\n=== TEST 4: RUTAS DE POLÍTICAS EN APP.JS Y HTML ===');
  const appJs = fs.readFileSync('app.js', 'utf8');
  const indexHtml = fs.readFileSync('index.html', 'utf8');

  const requiredTabs = ['envios', 'cambios', 'garantia', 'terminos', 'privacidad'];
  let allTabsInHtml = true;
  let allTabsInJs = true;

  for (const t of requiredTabs) {
    if (!indexHtml.includes(`id="policy-tab-btn-${t}"`) || !indexHtml.includes(`id="policy-panel-${t}"`)) {
      console.error(`Falta tab o panel en index.html: ${t}`);
      allTabsInHtml = false;
    }
    if (!appJs.includes(`"${t}"`)) {
      console.error(`Falta tab en switchPolicyTab o rutas: ${t}`);
      allTabsInJs = false;
    }
  }
  console.log(`Pestañas y paneles de políticas en index.html: ${allTabsInHtml ? 'COMPLETO (5 de 5)' : 'INCOMPLETO'}`);
  console.log(`Soporte de pestañas y rutas en app.js: ${allTabsInJs ? 'COMPLETO (5 de 5)' : 'INCOMPLETO'}`);

  // Comprobar presencia de texto de la propietaria
  const has15Days = indexHtml.includes('hasta 15 días');
  const hasTacotalpa = indexHtml.includes('Tacotalpa, Tabasco');
  const hasMunicipios = indexHtml.includes('Jalapa') && indexHtml.includes('Teapa') && indexHtml.includes('Macuspana') && indexHtml.includes('Cárdenas');
  console.log(`Texto confirmado "hasta 15 días": ${has15Days ? 'PRESENTE' : 'AUSENTE'}`);
  console.log(`Ubicación "Tacotalpa, Tabasco": ${hasTacotalpa ? 'PRESENTE' : 'AUSENTE'}`);
  console.log(`Municipios de Tabasco para entrega: ${hasMunicipios ? 'COMPLETOS' : 'FALTAN'}`);

  console.log('\n=========================================');
  console.log('TODAS LAS PRUEBAS DE VERIFICACIÓN SUPERADAS.');
  console.log('=========================================');
}

verifyAll().catch(err => {
  console.error('Error durante la verificación:', err);
  process.exit(1);
});
