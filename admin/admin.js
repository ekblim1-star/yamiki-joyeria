// Helper defensivo para renderizar iconos Lucide sin riesgo de ReferenceError si falla CDN
function safeCreateIcons() {
  try {
    if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  } catch (err) {}
}
window.safeCreateIcons = safeCreateIcons;

// Fallback universal SVG para Yamiki (Ligero, elegante, 100% offline)
const YAMIKI_FALLBACK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400' width='100%25' height='100%25'%3E%3Crect width='400' height='400' fill='%23121214'/%3E%3Cg transform='translate(150, 130)' stroke='%23f472b6' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='50 10 90 40 50 90 10 40'/%3E%3Cline x1='10' y1='40' x2='90' y2='40'/%3E%3Cline x1='50' y1='10' x2='50' y2='90'/%3E%3Cpolyline points='25 25 50 40 75 25'/%3E%3Cline x1='50' y1='40' x2='25' y2='65'/%3E%3Cline x1='50' y1='40' x2='75' y2='65'/%3E%3C/g%3E%3Ctext x='200' y='255' text-anchor='middle' fill='%23e4e4e7' font-family='system-ui, -apple-system, sans-serif' font-size='13' font-weight='700' letter-spacing='2'%3EYAMIKI JOYER%C3%8DA%3C/text%3E%3Ctext x='200' y='275' text-anchor='middle' fill='%23a1a1aa' font-family='system-ui, -apple-system, sans-serif' font-size='10' font-weight='500' letter-spacing='1.5'%3EPLATA LEY S925%3C/text%3E%3C/svg%3E";
window.YAMIKI_FALLBACK_SVG = YAMIKI_FALLBACK_SVG;

function handleProductImageError(img) {
  if (!img) return;
  if (img.src && img.src.startsWith("data:")) {
    img.onerror = null;
    return;
  }
  img.onerror = null;
  img.src = YAMIKI_FALLBACK_SVG;
}
window.handleProductImageError = handleProductImageError;

// ==============================================================================
// YAMIKI JOYERÍA S925 - ADMIN PANEL CONTROLLER
// Conexión Directa a Supabase + Importador Excel + Gestor de Portada y Precios
// ==============================================================================

const SUPABASE_URL = "https://nlpsvjweybdmkmrkfkyy.supabase.co";
const SUPABASE_KEY = "sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P";
const MAX_NOVEDADES = 10; // Límite máximo de joyas en el carrusel de inicio

// Inicializar cliente Supabase
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Estado Global del Panel
const state = {
  products: [],
  filteredProducts: [],
  activeTab: "catalogo", // "catalogo" | "importar"
  activeFilter: "todas", // "todas" | "novedades" | "anillos" | "aretes" | "collares" | "pulseras" | "dijes" | "agotadas"
  searchQuery: "",
  isLoading: false,
  importedData: [],
  droppedImages: new Map(),
  currentEditPhotos: [], // filename -> File object
  stats: {
    total: 0,
    novedades: 0,
    agotadas: 0,
    anillos: 0
  }
};

// ==============================================================================
// INICIALIZACIÓN
// ==============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  if (!supabaseClient) {
    showToast("Error", "No se pudo cargar la librería de Supabase.", "error");
    return;
  }
  await checkAdminAuth();
});

function setupEventListeners() {
  // Buscador en tiempo real
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    });
  }

  // Setup Dropzone
  setupDropzone();

  // Setup Manual Product Form
  const manualForm = document.getElementById("manual-product-form");
  if (manualForm) {
    manualForm.addEventListener("submit", handleManualProductSubmit);
  }
}

// ==============================================================================
// CARGA DE PRODUCTOS DESDE SUPABASE
// ==============================================================================
async function loadProductsFromSupabase() {
  setLoading(true);
  try {
    const { data, error } = await supabaseClient
      .from("productos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.rawProducts = data || [];

    // Agrupar filas de Supabase por id_aliexpress (diseño familiar) idéntico a la tienda principal
    const groupMap = new Map();
    (data || []).forEach(row => {
      const groupId = String(row.id_aliexpress || row.id);
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId).push(row);
    });

    function getNum(u) {
      if (!u) return 999;
      const m = u.match(/foto_0*(\d+)/i) || u.match(/_0*(\d+)\.[a-z0-9]+$/i);
      return m ? parseInt(m[1], 10) : 900;
    }

    const groupedList = [];
    groupMap.forEach((rows, groupId) => {
      const primaryRow = rows.find(r => r.activo !== false && r.estado_stock !== "Agotada") || rows[0];

      // 1. Recopilar todas las fotos de galería general
      const generalGalleries = [];
      rows.forEach(r => {
        if (Array.isArray(r.galeria_fotos)) {
          r.galeria_fotos.forEach(u => {
            if (u && !generalGalleries.includes(u)) generalGalleries.push(u);
          });
        }
      });

      // 2. Determinar la foto de portada:
      // Si el admin asignó una foto principal, se respeta 100% de forma permanente.
      // Solo si está vacía, se toma foto_01 de la galería como fallback inicial.
      let coverPhoto = primaryRow.foto_principal;
      if (!coverPhoto) {
        const foto01 = generalGalleries.find(u => u && (u.includes("foto_01") || u.includes("foto_1.")));
        const cleanNonVar = generalGalleries.find(u => u && !u.includes("/variantes/"));
        coverPhoto = foto01 || cleanNonVar || primaryRow.foto_principal || "";
      }

      // 3. Galería consolidada con coverPhoto como primera foto (#1)
      const consolidatedGallery = [];
      if (coverPhoto) {
        consolidatedGallery.push(coverPhoto);
      }
      generalGalleries.forEach(u => {
        if (u && !consolidatedGallery.includes(u)) consolidatedGallery.push(u);
      });
      rows.forEach(r => {
        if (r.foto_principal && !consolidatedGallery.includes(r.foto_principal)) {
          consolidatedGallery.push(r.foto_principal);
        }
        if (Array.isArray(r.galeria_fotos)) {
          r.galeria_fotos.forEach(u => {
            if (u && !consolidatedGallery.includes(u)) consolidatedGallery.push(u);
          });
        }
      });
      const isNovedad = rows.some(r => r.es_novedad === true);
      const isOferta = rows.some(r => r.es_destacado === true || (r.badge && (r.badge.includes("%") || r.badge.includes("🔥"))));
      const allAgotado = rows.every(r => r.estado_stock === "Agotada" || r.activo === false);
      const supplierLink = rows.find(r => r.enlace_aliexpress)?.enlace_aliexpress || primaryRow.enlace_aliexpress || "";

      groupedList.push({
        ...primaryRow,
        id: String(primaryRow.id),
        groupId: groupId,
        rowIds: rows.map(r => r.id),
        variants: rows,
        hasMultipleVariants: rows.length > 1,
        foto_principal: coverPhoto,
        galeria_fotos: consolidatedGallery,
        enlace_aliexpress: supplierLink,
        es_novedad: isNovedad,
        es_destacado: isOferta,
        estado_stock: allAgotado ? "Agotada" : "Disponible"
      });
    });

    state.products = groupedList;
    calculateStats();
    applyFilters();
  } catch (err) {
    console.error("Error al cargar productos:", err);
    showToast("Error de conexión", "No se pudieron obtener las joyas de Supabase.", "error");
  } finally {
    setLoading(false);
  }
}

function calculateStats() {
  state.stats.total = state.products.length;
  state.stats.novedades = state.products.filter(p => p.es_novedad).length;
  state.stats.agotadas = state.products.filter(p => p.estado_stock === "Agotada" || !p.activo).length;
  state.stats.anillos = state.products.filter(p => p.categoria === "anillos").length;
  state.stats.ofertas = state.products.filter(p => p.es_destacado === true || (p.badge && (p.badge.includes("%") || p.badge.includes("🔥") || p.badge.toLowerCase().includes("oferta")))).length;

  const statTotal = document.getElementById("stat-total");
  if (statTotal) statTotal.textContent = state.stats.total;
  const statNov = document.getElementById("stat-novedades");
  if (statNov) statNov.textContent = `${state.stats.novedades} / ${MAX_NOVEDADES}`;
  const statAgot = document.getElementById("stat-agotadas");
  if (statAgot) statAgot.textContent = state.stats.agotadas;
  const statAn = document.getElementById("stat-anillos");
  if (statAn) statAn.textContent = state.stats.anillos;
  const statOf = document.getElementById("stat-ofertas");
  if (statOf) statOf.textContent = state.stats.ofertas;

  const tabNovCount = document.getElementById("tab-novedades-count");
  if (tabNovCount) tabNovCount.textContent = `${state.stats.novedades}/${MAX_NOVEDADES}`;

  const tabOfCount = document.getElementById("tab-ofertas-count");
  if (tabOfCount) tabOfCount.textContent = state.stats.ofertas;

  const portadaLimit = document.getElementById("portada-limit-label");
  if (portadaLimit) portadaLimit.textContent = `${state.stats.novedades} / ${MAX_NOVEDADES}`;

  const ofertasLabel = document.getElementById("ofertas-count-label");
  if (ofertasLabel) ofertasLabel.textContent = `${state.stats.ofertas} piezas`;
}

// ==============================================================================
// FILTROS Y BÚSQUEDA
// ==============================================================================
function setFilter(filterName) {
  state.activeFilter = filterName;

  // Actualizar estilos de píldoras de filtro
  document.querySelectorAll(".filter-btn").forEach(btn => {
    const isCurrent = btn.getAttribute("data-filter") === filterName;
    if (isCurrent) {
      btn.className = "filter-btn px-3.5 py-1.5 rounded-xl text-xs font-bold transition bg-[#e72380] text-white shadow-sm flex items-center gap-1.5";
    } else {
      btn.className = "filter-btn px-3.5 py-1.5 rounded-xl text-xs font-semibold transition bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-1.5";
    }
  });

  applyFilters();
}

function applyFilters() {
  let list = [...state.products];

  // Filtro de Categoría / Estado
  if (state.activeFilter === "novedades") {
    list = list.filter(p => p.es_novedad);
  } else if (state.activeFilter === "ofertas") {
    list = list.filter(p => p.es_destacado === true || (p.badge && (p.badge.includes("%") || p.badge.includes("🔥") || p.badge.toLowerCase().includes("oferta"))));
  } else if (state.activeFilter === "agotadas") {
    list = list.filter(p => p.estado_stock === "Agotada" || !p.activo);
  } else if (state.activeFilter !== "todas") {
    list = list.filter(p => p.categoria === state.activeFilter);
  }

  // Búsqueda por texto (código SKU, título, material o id)
  if (state.searchQuery) {
    const q = state.searchQuery;
    list = list.filter(p => 
      (p.codigo_sku && p.codigo_sku.toLowerCase().includes(q)) ||
      (p.titulo && p.titulo.toLowerCase().includes(q)) ||
      (p.id_aliexpress && p.id_aliexpress.toLowerCase().includes(q)) ||
      (p.tipo_piedra && p.tipo_piedra.toLowerCase().includes(q))
    );
  }

  state.filteredProducts = list;
  renderProductsTable();
}

// ==============================================================================
// RENDERIZADO DE LA TABLA DE JOYAS (INTUITIVA Y VISUAL)
// ==============================================================================
function renderProductsTable() {
  const container = document.getElementById("products-table-body");
  const mobileContainer = document.getElementById("products-mobile-cards");
  const countLabel = document.getElementById("filtered-count-label");

  if (countLabel) {
    countLabel.textContent = `Mostrando ${state.filteredProducts.length} de ${state.products.length} joyas`;
  }

  if (state.filteredProducts.length === 0) {
    const emptyHtml = `
      <div class="py-12 text-center text-gray-400 p-6 bg-[#141C18] rounded-2xl border border-white/5">
        <i data-lucide="gem" class="w-12 h-12 mx-auto mb-3 text-gray-600"></i>
        <p class="text-sm font-semibold text-gray-300">No se encontraron joyas</p>
        <p class="text-xs text-gray-500 mt-1">Prueba cambiando el filtro o la búsqueda.</p>
      </div>
    `;
    if (container) {
      container.innerHTML = `
        <tr>
          <td colspan="7" class="py-16 text-center text-gray-400">
            <i data-lucide="gem" class="w-12 h-12 mx-auto mb-3 text-gray-600"></i>
            <p class="text-sm font-semibold text-gray-300">No se encontraron joyas</p>
            <p class="text-xs text-gray-500 mt-1">Prueba cambiando el filtro o sube tu archivo Excel del scraper.</p>
          </td>
        </tr>
      `;
    }
    if (mobileContainer) {
      mobileContainer.innerHTML = emptyHtml;
    }
    safeCreateIcons();
    return;
  }

  // 1. Renderizar filas para Tabla de Escritorio (Desktop)
  if (container) {
    container.innerHTML = state.filteredProducts.map(prod => {
      const photoUrl = prod.foto_principal || YAMIKI_FALLBACK_SVG;
      const isNovedad = prod.es_novedad === true;
      const isOferta = prod.es_destacado === true || (prod.badge && (prod.badge.includes("%") || prod.badge.includes("🔥")));
      const isActivo = prod.activo !== false;
      const isAgotado = prod.estado_stock === "Agotada";

      return `
        <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
          
          <!-- 1. Foto y Código SKU -->
          <td class="py-3 px-4">
            <div class="flex items-center gap-3">
              <div class="relative w-14 h-14 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0">
                <img 
                  src="${photoUrl}" 
                  alt="${prod.codigo_sku}" 
                  loading="lazy"
                  decoding="async"
                  class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-200"
                  onerror="handleProductImageError(this)"
                />
              </div>
              <div>
                <span class="inline-block px-2 py-0.5 rounded-md bg-[#e72380]/20 text-[#e72380] border border-[#e72380]/30 text-xs font-extrabold tracking-wider">
                  ${prod.codigo_sku || 'S/C'}
                </span>
                <p class="text-[11px] text-gray-400 font-mono mt-0.5">ID: ${prod.id_aliexpress || 'Manual'}</p>
              </div>
            </div>
          </td>

          <!-- 2. Título, Categoría y Tallas -->
          <td class="py-3 px-4 max-w-xs">
            <p class="text-xs font-bold text-white line-clamp-2 leading-snug" title="${prod.titulo}">
              ${prod.titulo}
            </p>
            <div class="flex items-center gap-2 mt-1 flex-wrap">
              <span class="text-[10px] uppercase font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded">
                ${prod.categoria}
              </span>
              <span class="text-[10px] text-rose-300 font-medium">
                📏 ${prod.tallas || 'Ajustable'}
              </span>
              ${prod.hasMultipleVariants ? `
                <button 
                  type="button" 
                  onclick="toggleVariantsPreview('desk-${prod.id}')"
                  class="text-[10px] text-purple-300 hover:text-white font-bold bg-purple-950/60 hover:bg-purple-900/60 px-2 py-0.5 rounded-full border border-purple-800/40 transition flex items-center gap-1"
                >
                  <i data-lucide="layers" class="w-3 h-3 text-[#e72380]"></i>
                  <span>${prod.variants.length} modelos</span>
                  <span id="variant-arrow-desk-${prod.id}" class="text-[9px]">▾</span>
                </button>
              ` : ''}
              ${prod.color_modelo && prod.color_modelo !== 'Única' ? `
                <span class="text-[10px] text-purple-300 font-medium bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-800/40">
                  ${prod.color_modelo}
                </span>
              ` : ''}
            </div>

            ${prod.hasMultipleVariants ? `
              <div id="variants-preview-desk-${prod.id}" class="hidden mt-2 p-2 rounded-xl bg-black/50 border border-white/10 space-y-1.5">
                ${prod.variants.map((v, vIdx) => `
                  <div class="flex items-center justify-between gap-2 text-[11px] py-1 px-1.5 rounded-lg hover:bg-white/5">
                    <div class="flex items-center gap-2 min-w-0">
                      <img src="${v.foto_principal || prod.foto_principal}" class="w-7 h-7 rounded-md object-cover border border-white/10 shrink-0" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23222%22/></svg>';" />
                      <span class="font-extrabold text-white text-[10px] truncate max-w-[120px]">${v.codigo_sku || v.color_modelo || ('Mod ' + (vIdx + 1))}</span>
                      <span class="text-[9px] text-gray-400">Talla: ${v.tallas || 'Ajustable'}</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <span class="font-bold text-emerald-400 text-xs">$${Math.round(v.precio_venta || 0)}</span>
                      <button type="button" onclick="openEditProductModal('${prod.id}', '${v.id}')" class="px-2 py-0.5 rounded bg-[#e72380]/20 hover:bg-[#e72380] text-[#e72380] hover:text-white font-bold text-[9px] transition">
                        Editar
                      </button>
                    </div>
                  </div>
                `).join("")}
              </div>
            ` : ''}
          </td>

          <!-- 3. Precio de Venta (Editable en 1 clic) -->
          <td class="py-3 px-4">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-gray-400">$</span>
              <input 
                type="number" 
                step="1"
                value="${Math.round(prod.precio_venta || 0)}" 
                onblur="updateProductPrice('${prod.id}', this.value)"
                onkeydown="if(event.key==='Enter') this.blur()"
                class="price-input w-24 px-2 py-1 bg-black/40 border border-white/15 rounded-lg text-sm font-bold text-white focus:outline-none text-right"
                title="Haz clic para cambiar el precio y presiona Enter"
              />
              <span class="text-[10px] text-gray-500 font-bold">MXN</span>
            </div>
            ${prod.costo_real ? `
              <p class="text-[10px] text-gray-500 mt-1 text-right">
                Costo: <strong class="text-gray-400">$${Math.round(prod.costo_real)}</strong>
                ${prod.ganancia_estimada ? `(+$${Math.round(prod.ganancia_estimada)})` : ''}
              </p>
            ` : ''}
          </td>

          <!-- 4. Interruptor: ⭐ Novedades de Portada -->
          <td class="py-3 px-4 text-center">
            <div class="flex flex-col items-center gap-1">
              <label class="switch" title="Activa para que esta joya salga en el inicio de la tienda">
                <input 
                  type="checkbox" 
                  ${isNovedad ? 'checked' : ''} 
                  onchange="toggleNovedad('${prod.id}', this.checked, this)"
                />
                <span class="slider slider-amber"></span>
              </label>
              <span class="text-[10px] font-bold ${isNovedad ? 'text-amber-400' : 'text-gray-500'}">
                ${isNovedad ? '⭐ En Portada' : 'No'}
              </span>
            </div>
          </td>

          <!-- 5. Interruptor: Activo / Visible en Tienda -->
          <td class="py-3 px-4 text-center">
            <div class="flex flex-col items-center gap-1">
              <label class="switch" title="Ocultar o mostrar joya en la tienda">
                <input 
                  type="checkbox" 
                  ${isActivo && !isAgotado ? 'checked' : ''} 
                  onchange="toggleActivo('${prod.id}', this.checked)"
                />
                <span class="slider"></span>
              </label>
              <span class="text-[10px] font-bold ${isActivo && !isAgotado ? 'text-emerald-400' : 'text-red-400'}">
                ${isAgotado ? 'Agotada' : (isActivo ? 'Visible' : 'Oculto')}
              </span>
            </div>
          </td>

          <!-- 7. Botón de Compra Directo a AliExpress -->
          <td class="py-3 px-4 text-center">
            ${prod.enlace_aliexpress ? `
              <a 
                href="${prod.enlace_aliexpress}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500 hover:text-white transition text-xs font-bold shadow-xs whitespace-nowrap"
                title="Abrir producto exacto en AliExpress para surtir pedido"
              >
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                <span>Comprar</span>
              </a>
            ` : `
              <span class="text-xs text-gray-500 italic">Manual</span>
            `}
          </td>

          <!-- 8. Acciones (Editar / Eliminar) -->
          <td class="py-3 px-4 text-right">
            <div class="flex items-center justify-end gap-1">
              <button 
                type="button" 
                onclick="openEditProductModal('${prod.id}')"
                class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition"
                title="Editar detalles de la joya"
              >
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button 
                type="button" 
                onclick="confirmDeleteProduct('${prod.id}', '${prod.codigo_sku}')"
                class="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition"
                title="Eliminar joya"
              >
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>

        </tr>
      `;
    }).join("");
  }

  // 2. Renderizar Tarjetas Móviles Ultra Amigables (Smartphones)
  if (mobileContainer) {
    mobileContainer.innerHTML = state.filteredProducts.map(prod => {
      const photoUrl = prod.foto_principal || YAMIKI_FALLBACK_SVG;
      const isNovedad = prod.es_novedad === true;
      const isOferta = prod.es_destacado === true || (prod.badge && (prod.badge.includes("%") || prod.badge.includes("🔥")));
      const isActivo = prod.activo !== false;
      const isAgotado = prod.estado_stock === "Agotada";

      return `
        <div class="bg-[#141C18] border border-white/10 rounded-2xl p-3.5 space-y-3 shadow-md">
          <!-- Cabecera de Tarjeta Móvil: Foto + Datos -->
          <div class="flex items-start gap-3">
            <div class="relative w-16 h-16 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0">
              <img 
                src="${photoUrl}" 
                alt="${prod.codigo_sku}" 
                loading="lazy"
                decoding="async"
                class="w-full h-full object-cover"
                onerror="handleProductImageError(this)"
              />
              ${isOferta ? `
                <span class="absolute top-0.5 right-0.5 px-1 py-0.2 rounded text-[8px] font-extrabold bg-[#e72380] text-white">
                  🔥
                </span>
              ` : ''}
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="px-2 py-0.5 rounded-md bg-[#e72380]/20 text-[#e72380] border border-[#e72380]/30 text-[11px] font-extrabold">
                  ${prod.codigo_sku || 'S/C'}
                </span>
                <span class="text-[9px] uppercase font-bold text-gray-400 bg-white/5 px-1.5 py-0.5 rounded">
                  ${prod.categoria}
                </span>
                ${isNovedad ? '<span class="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">⭐ Portada</span>' : ''}
              </div>
              <p class="text-xs font-bold text-white line-clamp-2 mt-1 leading-snug">
                ${prod.titulo}
              </p>
              <p class="text-[10px] text-gray-400 font-mono mt-0.5">
                📏 ${prod.tallas || 'Ajustable'}
              </p>
            </div>
          </div>

          <!-- Desplegable de Variantes en Móvil -->
          ${prod.hasMultipleVariants ? `
            <div class="pt-0.5">
              <button 
                type="button" 
                onclick="toggleVariantsPreview('mob-${prod.id}')"
                class="w-full py-1.5 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-bold text-gray-300 flex items-center justify-between transition"
              >
                <span class="flex items-center gap-1.5">
                  <i data-lucide="layers" class="w-3.5 h-3.5 text-[#e72380]"></i>
                  <span>${prod.variants.length} modelos / variantes</span>
                </span>
                <span id="variant-arrow-mob-${prod.id}" class="text-xs text-rose-300 font-bold">Ver ▾</span>
              </button>
              <div id="variants-preview-mob-${prod.id}" class="hidden mt-2 space-y-1.5 pl-1.5 border-l-2 border-[#e72380]/40">
                ${prod.variants.map((v, vIdx) => `
                  <div class="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5 text-[11px]">
                    <div class="flex items-center gap-2 min-w-0">
                      <img src="${v.foto_principal || prod.foto_principal}" class="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23222%22/></svg>';" />
                      <div class="truncate">
                        <div class="font-extrabold text-white text-[11px] truncate">${v.codigo_sku || v.color_modelo || ('Modelo ' + (vIdx + 1))}</div>
                        <div class="text-[9px] text-gray-400">📏 ${v.tallas || 'Ajustable'}</div>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span class="font-bold text-emerald-400 text-xs">$${Math.round(v.precio_venta || 0)}</span>
                      ${(v.enlace_aliexpress || prod.enlace_aliexpress) ? `
                        <a 
                          href="${v.enlace_aliexpress || prod.enlace_aliexpress}" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          class="p-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 transition flex items-center justify-center"
                          title="Comprar este modelo en AliExpress"
                        >
                          <i data-lucide="external-link" class="w-3 h-3"></i>
                        </a>
                      ` : ''}
                      <button type="button" onclick="openEditProductModal('${prod.id}', '${v.id}')" class="px-2.5 py-1 rounded-lg bg-[#e72380]/20 hover:bg-[#e72380] text-[#e72380] hover:text-white font-bold text-[10px] transition">
                        Editar
                      </button>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          ` : ''}

          <!-- Fila de Precios Táctil y Directo -->
          <div class="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-gray-400">Precio: $</span>
              <input
                type="number"
                step="1"
                value="${Math.round(prod.precio_venta || 0)}"
                onblur="updateProductPrice('${prod.id}', this.value)"
                class="w-20 px-2 py-1 bg-black/60 border border-white/20 rounded-lg text-sm font-bold text-white text-right focus:border-[#e72380] focus:outline-none"
              />
              <span class="text-[10px] text-gray-400 font-bold">MXN</span>
            </div>
            ${prod.costo_real ? `
              <div class="text-right text-[10px] text-gray-400">
                Costo: <span class="text-gray-200 font-bold">$${Math.round(prod.costo_real)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Botones de Acción Móviles con Grandes Objetivos Táctiles -->
          <div class="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
            <button
              type="button"
              onclick="toggleNovedad('${prod.id}', ${!isNovedad})"
              class="py-2.5 px-1.5 rounded-xl text-[11px] font-bold border transition flex items-center justify-center gap-1 ${isNovedad ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-white/5 text-gray-400 border-white/10'}"
            >
              <i data-lucide="star" class="w-3.5 h-3.5 ${isNovedad ? 'fill-amber-400' : ''}"></i>
              <span>Portada</span>
            </button>

            <!-- 2. Botón Comprar en AliExpress para móvil -->
            ${prod.enlace_aliexpress ? `
              <a
                href="${prod.enlace_aliexpress}"
                target="_blank"
                rel="noopener noreferrer"
                class="py-2.5 px-1.5 rounded-xl text-[11px] font-bold bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 transition flex items-center justify-center gap-1 shadow-xs"
                title="Abrir producto exacto en AliExpress para surtir pedido"
              >
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                <span>Comprar</span>
              </a>
            ` : `
              <button
                type="button"
                onclick="openEditProductModal('${prod.id}')"
                class="py-2.5 px-1.5 rounded-xl text-[11px] font-bold bg-white/5 text-gray-500 border border-white/10 flex items-center justify-center gap-1"
                title="Agregar enlace de AliExpress en Editar"
              >
                <i data-lucide="link" class="w-3.5 h-3.5"></i>
                <span>Sin Link</span>
              </button>
            `}

            <button
              type="button"
              onclick="openEditProductModal('${prod.id}')"
              class="py-2.5 px-1.5 rounded-xl text-[11px] font-bold bg-[#e72380] hover:bg-[#d41c73] text-white flex items-center justify-center gap-1 shadow-sm"
            >
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              <span>Editar</span>
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  safeCreateIcons();
}

async function toggleDescuento(productId, newValue) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  try {
    let finalPrice = prod.precio_venta;
    let finalEspec = prod.especificaciones || "";
    let finalBadge = prod.badge || "PLATA S925";

    if (newValue) {
      // Activar oferta rápida (20% de descuento)
      let normalPrice = prod.precio_venta;
      const m = finalEspec.match(/\[?PrecioOriginal:\s*([\d.]+)\]?/i);
      if (m) {
        normalPrice = parseFloat(m[1]);
      } else {
        finalEspec = `[PrecioOriginal: ${normalPrice}] ${finalEspec}`.trim();
      }
      finalPrice = Math.round(normalPrice * 0.8);
      finalBadge = "-20% OFF";
    } else {
      // Desactivar oferta: restaurar precio normal habitual
      const m = finalEspec.match(/\[?PrecioOriginal:\s*([\d.]+)\]?/i);
      if (m) {
        finalPrice = parseFloat(m[1]);
        finalEspec = finalEspec.replace(/\[?PrecioOriginal:\s*[\d.]+\]?\s*\|?\s*/gi, "").trim();
      }
      finalBadge = "PLATA S925";
    }

    const { error } = await supabaseClient
      .from("productos")
      .update({
        precio_venta: finalPrice,
        es_destacado: newValue,
        badge: finalBadge,
        especificaciones: finalEspec || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", productId);

    if (error) throw error;

    prod.precio_venta = finalPrice;
    prod.es_destacado = newValue;
    prod.badge = finalBadge;
    prod.especificaciones = finalEspec;

    calculateStats();
    applyFilters();
    if (state.activeTab === "ofertas") {
      renderOfertasView();
    }

    showToast("Oferta Actualizada", `"${prod.titulo.slice(0, 25)}..." ${newValue ? 'puesta en Oferta (-20%) 🔥' : 'precio regular restaurado'}.`, "success");
  } catch (err) {
    console.error("Error al cambiar estado de oferta:", err);
    showToast("Error", err.message || "No se pudo actualizar el descuento.", "error");
  }
}

function renderOfertasView() {
  const container = document.getElementById("ofertas-products-grid");
  if (!container) return;

  const ofertas = state.products.filter(p => p.es_destacado === true || (p.badge && (p.badge.includes("%") || p.badge.includes("🔥"))));

  if (ofertas.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center bg-[#141C18] rounded-3xl border border-white/5 p-8">
        <div class="w-16 h-16 rounded-2xl bg-[#e72380]/15 text-[#e72380] flex items-center justify-center mx-auto mb-3 shadow-md">
          <i data-lucide="badge-percent" class="w-8 h-8"></i>
        </div>
        <h4 class="text-base font-bold text-white">No hay joyas en Oferta actualmente</h4>
        <p class="text-xs text-gray-400 mt-1 max-w-md mx-auto">
          Ve a la pestaña <strong>Catálogo General</strong> y activa el interruptor <span class="text-[#e72380] font-bold">🔥 Oferta</span> o edita una joya para asignarle un precio tachado.
        </p>
        <button 
          type="button" 
          onclick="switchTab('catalogo')" 
          class="mt-4 px-5 py-2 rounded-xl bg-[#e72380] text-white text-xs font-bold hover:bg-[#d41c73] transition shadow-md"
        >
          Ir al Catálogo General
        </button>
      </div>
    `;
    safeCreateIcons();
    return;
  }

  container.innerHTML = ofertas.map(prod => {
    const photoUrl = prod.foto_principal || YAMIKI_FALLBACK_SVG;
    return `
      <div class="bg-[#141C18] border border-rose-500/20 rounded-2xl p-4 flex flex-col justify-between space-y-3 relative overflow-hidden group shadow-md">
        
        <div class="relative w-full aspect-square rounded-xl overflow-hidden bg-black/40 border border-white/10">
          <span class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#e72380] text-white shadow-sm z-10">
            ${prod.badge || '🔥 Oferta'}
          </span>
          <img 
            src="${photoUrl}" 
            alt="${prod.codigo_sku}" 
            loading="lazy"
            decoding="async"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onerror="handleProductImageError(this)"
          />
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold text-[#e72380] font-mono">
              ${prod.codigo_sku || 'S/C'}
            </span>
            <span class="text-[10px] text-gray-400 uppercase font-bold">
              ${prod.categoria}
            </span>
          </div>
          <p class="text-xs font-bold text-white line-clamp-1" title="${prod.titulo}">
            ${prod.titulo}
          </p>
          <div class="flex items-baseline gap-2 pt-1">
            <span class="text-base font-extrabold text-white">
              $${Math.round(prod.precio_venta || 0)} MXN
            </span>
          </div>
        </div>

        <div class="pt-2 border-t border-white/10 flex items-center gap-2">
          <button 
            type="button" 
            onclick="openEditProductModal('${prod.id}')"
            class="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
          >
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            <span>Editar Descuento</span>
          </button>
          <button 
            type="button" 
            onclick="toggleDescuento('${prod.id}', false)"
            class="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 transition"
            title="Quitar de ofertas"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

      </div>
    `;
  }).join("");

  safeCreateIcons();
}

// ==============================================================================
async function updateProductPrice(productId, newPrice) {
  const price = parseFloat(newPrice);
  if (isNaN(price) || price < 0) {
    showToast("Precio inválido", "Ingresa un precio numérico válido.", "error");
    return;
  }

  const p = state.products.find(item => item.id === productId || (item.rowIds && item.rowIds.includes(productId)));
  const targetIds = p && p.rowIds ? p.rowIds : [productId];

  try {
    const { error } = await supabaseClient
      .from("productos")
      .update({ precio_venta: price, updated_at: new Date().toISOString() })
      .in("id", targetIds);

    if (error) throw error;

    if (p) p.precio_venta = price;

    showToast("Precio actualizado", `Nuevo precio: $${price} MXN`, "success");
  } catch (err) {
    console.error("Error al actualizar precio:", err);
    showToast("Error", "No se pudo actualizar el precio en Supabase.", "error");
  }
}

async function toggleNovedad(productId, isNovedad, checkboxEl) {
  // 1. Validar límite máximo de 10 joyas en portada
  if (isNovedad) {
    const currentNovedades = state.products.filter(p => p.es_novedad).length;
    if (currentNovedades >= MAX_NOVEDADES) {
      if (checkboxEl) checkboxEl.checked = false;
      showToast(
        "Límite de Portada Alcanzado",
        `Ya tienes el máximo de ${MAX_NOVEDADES} joyas en Novedades de Portada. Quita una primero para agregar otra.`,
        "error"
      );
      return;
    }
  }

  try {
    const { error } = await supabaseClient
      .from("productos")
      .update({ es_novedad: isNovedad, updated_at: new Date().toISOString() })
      .eq("id", productId);

    if (error) throw error;

    const p = state.products.find(item => item.id === productId);
    if (p) p.es_novedad = isNovedad;

    calculateStats();
    if (state.activeTab === "portada") {
      renderPortadaView();
    }

    showToast(
      isNovedad ? "⭐ Agregada a Portada" : "Retirada de Portada",
      isNovedad ? "Esta joya ahora sale en el carrusel de inicio." : "Ya no aparecerá en el carrusel de inicio.",
      "success"
    );
  } catch (err) {
    console.error("Error al cambiar novedad:", err);
    if (checkboxEl) checkboxEl.checked = !isNovedad;
    showToast("Error", "No se pudo actualizar el estado de portada.", "error");
  }
}

async function toggleActivo(productId, isActivo) {
  try {
    const { error } = await supabaseClient
      .from("productos")
      .update({ activo: isActivo, updated_at: new Date().toISOString() })
      .eq("id", productId);

    if (error) throw error;

    const p = state.products.find(item => item.id === productId);
    if (p) p.activo = isActivo;

    calculateStats();
    showToast(
      isActivo ? "Joya visible" : "Joya oculta",
      isActivo ? "Aparece en la tienda pública." : "Oculta temporalmente de la tienda.",
      "success"
    );
  } catch (err) {
    console.error("Error al cambiar visibilidad:", err);
    showToast("Error", "No se pudo actualizar la visibilidad.", "error");
  }
}

async function confirmDeleteProduct(productId, sku) {
  if (!confirm(`¿Estás seguro de eliminar la joya con código "${sku}"? Esta acción no se puede deshacer.`)) {
    return;
  }

  const prod = state.products.find(p => p.id === productId || (p.rowIds && p.rowIds.includes(productId)));
  const targetIds = prod && prod.rowIds ? prod.rowIds : [productId];

  try {
    const { error } = await supabaseClient
      .from("productos")
      .delete()
      .in("id", targetIds);

    if (error) throw error;

    state.products = state.products.filter(p => p.id !== productId && (!p.rowIds || !p.rowIds.includes(productId)));
    calculateStats();
    applyFilters();
    showToast("Joya eliminada", `Se eliminó "${sku}" correctamente.`, "success");
  } catch (err) {
    console.error("Error al eliminar joya:", err);
    showToast("Error", "No se pudo eliminar la pieza.", "error");
  }
}

// ==============================================================================
// IMPORTADOR DE EXCEL Y CARPETA DE FOTOS
// ==============================================================================
function setupDropzone() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const folderInput = document.getElementById("folder-input");

  if (!dropzone) return;

  ["dragenter", "dragover"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dropzone-active");
    });
  });

  ["dragleave", "drop"].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dropzone-active");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const files = Array.from(e.dataTransfer.files);
    handleDroppedFiles(files);
  });

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      handleDroppedFiles(files);
    });
  }

  if (folderInput) {
    folderInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files);
      handleDroppedFiles(files);
    });
  }
}

function handleDroppedFiles(files) {
  let excelFile = null;

  files.forEach(file => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
      excelFile = file;
    } else if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png") || name.endsWith(".webp")) {
      // Guardar imagen en el mapa por nombre de archivo
      state.droppedImages.set(file.name.toLowerCase(), file);
      // También guardar por nombre sin extensión
      const baseName = file.name.substring(0, file.name.lastIndexOf(".")).toLowerCase();
      state.droppedImages.set(baseName, file);
    }
  });

  updatePhotosCountDisplay();

  if (excelFile) {
    parseExcelFile(excelFile);
  }
}

function updatePhotosCountDisplay() {
  const label = document.getElementById("photos-loaded-badge");
  if (label) {
    const count = Math.floor(state.droppedImages.size / 2); // aprox por alias
    if (count > 0) {
      label.classList.remove("hidden");
      label.textContent = `📷 ${count} foto(s) cargadas en memoria`;
    }
  }
}

function parseExcelFile(file) {
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

      if (!json || json.length === 0) {
        showToast("Archivo vacío", "El archivo Excel no tiene filas con datos.", "error");
        return;
      }

      await processParsedExcelRows(json);
    } catch (err) {
      console.error("Error al leer Excel:", err);
      showToast("Error al procesar", "No se pudo leer el archivo Excel.", "error");
    }
  };

  reader.readAsArrayBuffer(file);
}

async function processParsedExcelRows(rows) {
  // Consultar fotos ya existentes en el bucket 'joyas'
  let bucketMap = new Map();
  try {
    const { data: bucketFiles } = await supabaseClient.storage
      .from("joyas")
      .list("", { limit: 1000 });
    
    if (bucketFiles && bucketFiles.length > 0) {
      bucketFiles.forEach(f => {
        const cleanKey = f.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        bucketMap.set(cleanKey, f.name);
      });
      console.log(`[Yamiki] Detectadas ${bucketFiles.length} fotos ya subidas en el bucket joyas.`);
    }
  } catch (err) {
    console.warn("No se pudo listar el bucket:", err);
  }

  const mapped = [];

  rows.forEach(row => {
    // 1. Obtener campos según las cabeceras exactas del scraper
    const rawId = String(row["ID Producto"] || "").trim();
    const rawSku = String(row["Código / SKU Variante"] || row["Codigo"] || "").trim();
    const rawTitulo = String(row["Título"] || row["Titulo"] || "").trim();
    const rawColor = String(row["Color / Modelo Gema"] || row["Color"] || "Única").replace(/Color de la gema:\\s*/i, "").trim();
    const rawStock = String(row["Estado / Stock"] || "Disponible").trim();
    const rawTallas = String(row["Tallas Disponibles"] || "Ajustable").trim();
    
    // Parsear precios (limpiar "MX$", comas y espacios)
    const rawPrecioVenta = cleanCurrency(row["Precio Sugerido Venta"]);
    const rawCostoReal = cleanCurrency(row["TOTAL REAL CHECKOUT"]);
    const rawGanancia = cleanCurrency(row["Ganancia Estimada"]);
    const rawMargen = String(row["% Aumento Aplicado"] || "").trim();

    const rawDesc = String(row["Descripción del Producto"] || "").trim();
    const rawMaterial = String(row["Metal / Material"] || "Plata esterlina 925").trim();
    const rawPiedra = String(row["Tipo de Piedra"] || "CIRCONITA").trim();
    const rawSpecs = String(row["Especificaciones"] || "").trim();
    const rawLinkAli = String(row["Enlace AliExpress"] || "").trim();
    const rawTienda = String(row["Tienda"] || "").trim();
    const rawFotoLocal = String(row["Foto Variante (Local)"] || "").trim();

    if (!rawTitulo && !rawSku) return; // ignorar filas vacías

    // Limpiar título de marcas de fábrica (MODIAN, BAMOER, Ailmay, etc.)
    const cleanTitle = cleanBrandNames(rawTitulo);

    // Auto-detectar categoría
    const categoria = detectCategory(cleanTitle);

    // Extraer nombre de foto local (ej. "RHR1550.jpg")
    let fotoFilename = "";
    if (rawFotoLocal) {
      const parts = rawFotoLocal.split(/[\\\\/]/);
      fotoFilename = parts[parts.length - 1];
    } else if (rawSku && rawSku !== "Única") {
      fotoFilename = `${rawSku}.jpg`;
    }

    // Buscar si la foto ya está en el bucket de Supabase
    let fotoUrl = null;
    const targetKey1 = `${rawId}_${rawSku}.jpg`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetKey2 = `${rawSku}.jpg`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetKey3 = fotoFilename ? fotoFilename.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

    const matchedFile = bucketMap.get(targetKey1) || bucketMap.get(targetKey2) || bucketMap.get(targetKey3);
    if (matchedFile) {
      fotoUrl = `${SUPABASE_URL}/storage/v1/object/public/joyas/${matchedFile}`;
    }

    mapped.push({
      id_aliexpress: rawId || null,
      codigo_sku: rawSku || (rawId ? `YK-${rawId.slice(-4)}` : "YK-01"),
      titulo: cleanTitle || "Joya de Plata S925",
      categoria: categoria,
      color_modelo: rawColor || "Única",
      tallas: rawTallas || "Ajustable",
      precio_venta: Math.max(1, Math.round(rawPrecioVenta || 350)),
      costo_real: rawCostoReal > 0 ? rawCostoReal : null,
      ganancia_estimada: rawGanancia > 0 ? rawGanancia : null,
      porcentaje_aumento: rawMargen || null,
      descripcion: rawDesc || cleanTitle,
      metal_material: rawMaterial || "Plata esterlina 925",
      tipo_piedra: rawPiedra || "CIRCONITA",
      especificaciones: rawSpecs || null,
      enlace_aliexpress: rawLinkAli || null,
      tienda_proveedor: rawTienda || null,
      estado_stock: rawStock.toLowerCase().includes("agotad") ? "Agotada" : "Disponible",
      activo: !rawStock.toLowerCase().includes("agotad"),
      es_novedad: false,
      es_destacado: false,
      badge: "PLATA S925",
      foto_filename: fotoFilename,
      foto_principal: fotoUrl
    });
  });

  state.importedData = mapped;
  renderImportPreview();
}

function cleanCurrency(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned) || 0;
}

function cleanBrandNames(str) {
  return str
    .replace(/^bamoer\s*[-–—:]*\s*/i, "")
    .replace(/^modian\s*[-–—:]*\s*/i, "")
    .replace(/^ailmay\s*[-–—:]*\s*/i, "")
    .replace(/^wostu\s*[-–—:]*\s*/i, "")
    .replace(/^bisaer\s*[-–—:]*\s*/i, "")
    .replace(/bamoer/gi, "Yamiki")
    .replace(/modian/gi, "Yamiki")
    .trim();
}

function detectCategory(title) {
  const t = title.toLowerCase();
  if (t.includes("anillo") || t.includes("sortija") || t.includes("banda")) return "anillos";
  if (t.includes("pendiente") || t.includes("arete") || t.includes("tuerca")) return "aretes";
  if (t.includes("collar") || t.includes("colgante") || t.includes("cadena")) return "collares";
  if (t.includes("dije") || t.includes("charm") || t.includes("abalorio")) return "dijes";
  if (t.includes("pulsera") || t.includes("brazalete")) return "pulseras";
  return "anillos";
}

function renderImportPreview() {
  const previewContainer = document.getElementById("import-preview-section");
  const tableBody = document.getElementById("import-preview-body");
  const countLabel = document.getElementById("import-count-badge");

  if (!previewContainer || !tableBody) return;

  previewContainer.classList.remove("hidden");
  if (countLabel) {
    countLabel.textContent = `${state.importedData.length} joyas detectadas`;
  }

  tableBody.innerHTML = state.importedData.slice(0, 50).map((item, idx) => {
    const hasPhoto = item.foto_filename && (
      state.droppedImages.has(item.foto_filename.toLowerCase()) || 
      state.droppedImages.has(item.codigo_sku.toLowerCase())
    );

    return `
      <tr class="border-b border-white/5 text-xs text-gray-300">
        <td class="py-2.5 px-3 font-mono font-bold text-[#e72380]">${item.codigo_sku}</td>
        <td class="py-2.5 px-3 max-w-xs truncate" title="${item.titulo}">${item.titulo}</td>
        <td class="py-2.5 px-3 uppercase font-bold text-gray-400">${item.categoria}</td>
        <td class="py-2.5 px-3">${item.tallas}</td>
        <td class="py-2.5 px-3 text-right font-bold text-white">$${item.precio_venta}</td>
        <td class="py-2.5 px-3 text-right text-gray-400">$${Math.round(item.costo_real || 0)}</td>
        <td class="py-2.5 px-3 text-center">
          ${hasPhoto ? `
            <span class="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
              <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Lista
            </span>
          ` : `
            <span class="text-[11px] text-gray-500">Pendiente</span>
          `}
        </td>
      </tr>
    `;
  }).join("");

  if (state.importedData.length > 50) {
    tableBody.innerHTML += `
      <tr>
        <td colspan="7" class="py-3 text-center text-xs text-gray-500">
          ... y ${state.importedData.length - 50} joyas más listas para publicar.
        </td>
      </tr>
    `;
  }

  safeCreateIcons();
}

// ==============================================================================
// MODAL DE PROGRESO EN TIEMPO REAL
// ==============================================================================
function showProgressModal(title, subtitle) {
  const modal = document.getElementById("upload-progress-modal");
  const t = document.getElementById("progress-title");
  const s = document.getElementById("progress-subtitle");
  const bar = document.getElementById("progress-bar-fill");
  const pct = document.getElementById("progress-percentage-text");
  const st = document.getElementById("progress-status-text");
  const errBox = document.getElementById("progress-error-box");
  const barBox = document.getElementById("progress-bar-container");

  if (t) t.textContent = title;
  if (s) s.textContent = subtitle;
  if (bar) bar.style.width = "0%";
  if (pct) pct.textContent = "0%";
  if (st) st.textContent = "Iniciando...";
  if (errBox) errBox.classList.add("hidden");
  if (barBox) barBox.classList.remove("hidden");

  if (modal) {
    modal.classList.remove("hidden");
    requestAnimationFrame(() => modal.classList.add("modal-active"));
    safeCreateIcons();
  }
}

function updateProgressBar(percentage, statusText) {
  const p = Math.min(100, Math.max(0, Math.round(percentage)));
  const bar = document.getElementById("progress-bar-fill");
  const pct = document.getElementById("progress-percentage-text");
  const st = document.getElementById("progress-status-text");

  if (bar) bar.style.width = `${p}%`;
  if (pct) pct.textContent = `${p}%`;
  if (st) st.textContent = statusText;
}

function closeProgressModal() {
  const modal = document.getElementById("upload-progress-modal");
  if (modal) {
    modal.classList.remove("modal-active");
    setTimeout(() => modal.classList.add("hidden"), 200);
  }
}

// ==============================================================================
// SUBIDA FINAL A SUPABASE (BD + STORAGE) CON BARRA DE PROGRESO
// ==============================================================================
async function commitImportToSupabase() {
  if (!state.importedData || state.importedData.length === 0) {
    showToast("Nada que subir", "Primero arrastra o selecciona un archivo Excel.", "error");
    return;
  }

  const totalItems = state.importedData.length;
  showProgressModal("Subiendo joyas a Supabase...", `Procesando ${totalItems} piezas del catálogo...`);

  let uploadedPhotos = 0;
  let savedCount = 0;

  try {
    // Paso 1: Consultar joyas existentes para actualizar por ID o insertar nuevas sin duplicar
    updateProgressBar(5, "Verificando catálogo existente...");
    const { data: existingRows } = await supabaseClient
      .from("productos")
      .select("id, id_aliexpress, codigo_sku, color_modelo");

    const existingMap = new Map();
    (existingRows || []).forEach(row => {
      const key = `${row.id_aliexpress || ''}_${row.codigo_sku || ''}_${row.color_modelo || ''}`.toLowerCase();
      existingMap.set(key, row.id);
    });

    // Paso 2: Subir fotos a Supabase Storage si se cargaron archivos locales
    const itemsWithPhotos = state.importedData.filter(item => 
      item.foto_filename && (
        state.droppedImages.has(item.foto_filename.toLowerCase()) || 
        state.droppedImages.has(item.codigo_sku.toLowerCase())
      )
    );

    let photoIdx = 0;
    for (let item of state.importedData) {
      let matchingFile = null;

      if (item.foto_filename && state.droppedImages.has(item.foto_filename.toLowerCase())) {
        matchingFile = state.droppedImages.get(item.foto_filename.toLowerCase());
      } else if (item.codigo_sku && state.droppedImages.has(item.codigo_sku.toLowerCase())) {
        matchingFile = state.droppedImages.get(item.codigo_sku.toLowerCase());
      }

      if (matchingFile) {
        photoIdx++;
        const pct = 5 + Math.round((photoIdx / Math.max(1, itemsWithPhotos.length)) * 25);
        updateProgressBar(pct, `Subiendo foto ${photoIdx} de ${itemsWithPhotos.length}...`);

        const cleanName = `${item.id_aliexpress || 'joya'}_${item.codigo_sku.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`;
        const processedFile = await processImageForUpload(matchingFile);
        const { error: uploadErr } = await supabaseClient.storage
          .from("joyas")
          .upload(cleanName, processedFile, { upsert: true, contentType: "image/jpeg" });

        if (!uploadErr) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/joyas/${cleanName}`;
          item.foto_principal = publicUrl;
          uploadedPhotos++;
        }
      }

      delete item.foto_filename; // limpiar campo auxiliar antes de insertar a BD
    }

    // Paso 3: Asignar ID existente si ya existía en Supabase
    const toSave = state.importedData.map(item => {
      const key = `${item.id_aliexpress || ''}_${item.codigo_sku || ''}_${item.color_modelo || ''}`.toLowerCase();
      const existingId = existingMap.get(key);
      const cleanItem = { ...item };
      if (existingId) {
        cleanItem.id = existingId;
      }
      return cleanItem;
    });

    // Paso 4: Guardar en lotes de 25 en Supabase
    const chunkSize = 25;
    const totalChunks = Math.ceil(toSave.length / chunkSize);

    for (let c = 0; c < totalChunks; c++) {
      const chunk = toSave.slice(c * chunkSize, (c + 1) * chunkSize);
      const startPct = 30 + Math.round((c / totalChunks) * 65);
      updateProgressBar(startPct, `Guardando lote ${c + 1} de ${totalChunks} (${chunk.length} joyas)...`);

      // Guardar lote sin requerir restricción de unicidad ajena al ID primario
      const { error: saveErr } = await supabaseClient
        .from("productos")
        .upsert(chunk);

      if (saveErr) {
        console.error("Error en lote:", saveErr);
        // Si upsert general falla, intentar inserción directa
        const { error: insertErr } = await supabaseClient
          .from("productos")
          .insert(chunk);
        if (insertErr) throw insertErr;
      }

      savedCount += chunk.length;
    }

    // Paso 5: Éxito total al 100%
    updateProgressBar(100, "¡Completado con éxito!");
    const t = document.getElementById("progress-title");
    const s = document.getElementById("progress-subtitle");
    const iconBox = document.getElementById("progress-icon-box");

    if (t) t.textContent = "¡Joyas publicadas con éxito!";
    if (s) s.textContent = `Se guardaron ${savedCount} joyas y ${uploadedPhotos} fotos en tu catálogo.`;
    if (iconBox) {
      iconBox.className = "w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20";
      iconBox.innerHTML = '<i data-lucide="check-circle" class="w-8 h-8"></i>';
      safeCreateIcons();
    }

    showToast(
      "¡Publicación Exitosa!",
      `Se guardaron ${savedCount} joyas en Supabase.`,
      "success"
    );

    // Esperar 1.4 segundos para que la persona vea la felicitación
    setTimeout(async () => {
      closeProgressModal();
      state.importedData = [];
      document.getElementById("import-preview-section").classList.add("hidden");
      switchTab("catalogo");
      await checkAdminAuth();
  loadProductsFromSupabase();
    }, 1400);

  } catch (err) {
    console.error("Error al publicar en Supabase:", err);
    const errBox = document.getElementById("progress-error-box");
    const errMsg = document.getElementById("progress-error-msg");
    const barBox = document.getElementById("progress-bar-container");

    if (barBox) barBox.classList.add("hidden");
    if (errBox) errBox.classList.remove("hidden");
    if (errMsg) errMsg.textContent = err.message || JSON.stringify(err);

    showToast("Error al importar", err.message || "Ocurrió un error al guardar.", "error");
    safeCreateIcons();
  }
}

// ==============================================================================
// MODAL DE CREACIÓN MANUAL DE JOYAS
// ==============================================================================
function openManualModal() {
  const modal = document.getElementById("manual-product-modal");
  if (modal) {
    modal.classList.remove("hidden");
    requestAnimationFrame(() => modal.classList.add("modal-active"));
  }
}

function closeManualModal() {
  const modal = document.getElementById("manual-product-modal");
  if (modal) {
    modal.classList.remove("modal-active");
    setTimeout(() => modal.classList.add("hidden"), 200);
  }
}

async function handleManualProductSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector("button[type='submit']");

  const sku = form.sku.value.trim().toUpperCase();
  const titulo = form.titulo.value.trim();
  const categoria = form.categoria.value;
  const precio = parseFloat(form.precio.value);
  const costo = parseFloat(form.costo.value || 0);
  const tallas = form.tallas.value.trim() || "Ajustable";
  const enlace = form.enlace.value.trim();
  const esNovedad = form.es_novedad.checked;
  const fotoInput = form.foto_file;

  if (!sku || !titulo || isNaN(precio)) {
    showToast("Campos incompletos", "SKU, Título y Precio son obligatorios.", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    let fotoUrl = null;

    // Subir foto si se seleccionó archivo (comprimido automáticamente para evitar timeouts)
    if (fotoInput.files && fotoInput.files[0]) {
      const rawFile = fotoInput.files[0];
      const file = await processImageForUpload(rawFile);
      const filename = `manual_${sku}_${Date.now()}.jpg`;
      const { data, error: uploadErr } = await supabaseClient.storage
        .from("joyas")
        .upload(filename, file, { upsert: true, contentType: "image/jpeg" });

      if (!uploadErr) {
        fotoUrl = `${SUPABASE_URL}/storage/v1/object/public/joyas/${filename}`;
      }
    }

    const newProd = {
      codigo_sku: sku,
      titulo: titulo,
      categoria: categoria,
      precio_venta: precio,
      costo_real: costo || null,
      tallas: tallas,
      enlace_aliexpress: enlace || null,
      foto_principal: fotoUrl,
      es_novedad: esNovedad,
      activo: true,
      metal_material: "Plata esterlina 925",
      tipo_piedra: "CIRCONITA"
    };

    const { error: insertErr } = await supabaseClient
      .from("productos")
      .insert([newProd]);

    if (insertErr) throw insertErr;

    showToast("Joya agregada", `"${sku}" ya está publicada en la tienda.`, "success");
    closeManualModal();
    form.reset();
    await checkAdminAuth();
  loadProductsFromSupabase();

  } catch (err) {
    console.error("Error al crear joya:", err);
    showToast("Error al guardar", err.message || "No se pudo guardar la joya.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar y Publicar";
  }
}

// ==============================================================================
// NAVEGACIÓN POR PESTAÑAS DEL PANEL
// ==============================================================================
function switchTab(tabName) {
  state.activeTab = tabName;

  const viewCatalogo = document.getElementById("view-catalogo");
  const viewPortada = document.getElementById("view-portada");
  const viewImportar = document.getElementById("view-importar");
  const tabCatalogo = document.getElementById("tab-btn-catalogo");
  const tabPortada = document.getElementById("tab-btn-portada");
  const tabImportar = document.getElementById("tab-btn-importar");

  // Reset all views
  if (viewCatalogo) viewCatalogo.classList.add("hidden");
  if (viewPortada) viewPortada.classList.add("hidden");
  if (viewImportar) viewImportar.classList.add("hidden");

  // Reset tab button styles
  const defaultTabClass = "tab-btn px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition flex items-center gap-2";
  const activeTabClass = "tab-btn active px-4 py-2 rounded-xl text-xs font-bold text-white bg-white/10 flex items-center gap-2";

  if (tabCatalogo) tabCatalogo.className = defaultTabClass;
  if (tabPortada) tabPortada.className = defaultTabClass;
  if (tabImportar) tabImportar.className = defaultTabClass;

  const viewOfertas = document.getElementById("view-ofertas");
  const tabOfertas = document.getElementById("tab-btn-ofertas");
  if (viewOfertas) viewOfertas.classList.add("hidden");
  if (tabOfertas) tabOfertas.className = defaultTabClass;

  if (tabName === "catalogo") {
    if (viewCatalogo) viewCatalogo.classList.remove("hidden");
    if (tabCatalogo) tabCatalogo.className = activeTabClass;
  } else if (tabName === "portada") {
    if (viewPortada) viewPortada.classList.remove("hidden");
    if (tabPortada) tabPortada.className = activeTabClass;
    renderPortadaView();
  } else if (tabName === "ofertas") {
    if (viewOfertas) viewOfertas.classList.remove("hidden");
    if (tabOfertas) tabOfertas.className = activeTabClass;
    renderOfertasView();
  } else if (tabName === "importar") {
    if (viewImportar) viewImportar.classList.remove("hidden");
    if (tabImportar) tabImportar.className = activeTabClass;
  }

  safeCreateIcons();
}

function renderPortadaView() {
  const container = document.getElementById("portada-products-grid");
  if (!container) return;

  const novedades = state.products.filter(p => p.es_novedad);

  if (novedades.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center bg-[#141C18] rounded-3xl border border-white/5 p-8">
        <div class="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto mb-3 shadow-md">
          <i data-lucide="star" class="w-8 h-8"></i>
        </div>
        <h4 class="text-base font-bold text-white">No hay joyas seleccionadas para la Portada</h4>
        <p class="text-xs text-gray-400 mt-1 max-w-md mx-auto">
          Ve a la pestaña <strong>Catálogo General</strong> y activa el interruptor <span class="text-amber-400 font-bold">⭐ En Portada</span> en hasta ${MAX_NOVEDADES} joyas para que se muestren en el inicio.
        </p>
        <button 
          type="button" 
          onclick="switchTab('catalogo')" 
          class="mt-4 px-5 py-2 rounded-xl bg-[#e72380] text-white text-xs font-bold hover:bg-[#d41c73] transition shadow-md"
        >
          Ir al Catálogo para Elegir
        </button>
      </div>
    `;
    safeCreateIcons();
    return;
  }

  container.innerHTML = novedades.map(prod => {
    const photoUrl = prod.foto_principal || YAMIKI_FALLBACK_SVG;

    return `
      <div class="bg-[#141C18] rounded-2xl border border-white/10 overflow-hidden flex flex-col justify-between group hover:border-amber-500/40 transition-all shadow-md">
        
        <div>
          <!-- Foto con Badge Novedad -->
          <div class="relative w-full aspect-square bg-black/40 overflow-hidden">
            <img 
              src="${photoUrl}" 
              alt="${prod.codigo_sku}" 
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
              onerror="handleProductImageError(this)"
            />
            
            <div class="absolute top-2 left-2 flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-md bg-[#e72380] text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                ${prod.codigo_sku}
              </span>
              <span class="px-2 py-0.5 rounded-md bg-amber-500 text-black text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                <span>⭐ Portada</span>
              </span>
            </div>

            <span class="absolute bottom-2 left-2 text-[10px] font-bold text-gray-300 bg-black/70 backdrop-blur-xs px-2 py-0.5 rounded">
              📏 ${prod.tallas || 'Ajustable'}
            </span>
          </div>

          <!-- Contenido -->
          <div class="p-3.5 space-y-1.5">
            <span class="text-[10px] uppercase font-bold text-gray-400 block">${prod.categoria}</span>
            <h4 class="text-xs font-bold text-white line-clamp-2 leading-snug" title="${prod.titulo}">
              ${prod.titulo}
            </h4>
            <div class="flex items-center justify-between pt-1">
              <div>
                <span class="text-sm font-extrabold text-[#e72380]">$${Math.round(prod.precio_venta || 0)}</span>
                <span class="text-[10px] text-gray-400 font-bold">MXN</span>
              </div>
              ${prod.costo_real ? `
                <span class="text-[10px] text-gray-500 font-mono">Costo: $${Math.round(prod.costo_real)}</span>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Acciones Inferiores -->
        <div class="p-3 pt-0 flex items-center gap-2">
          ${prod.enlace_aliexpress ? `
            <a 
              href="${prod.enlace_aliexpress}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="flex-1 py-1.5 rounded-xl bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-500/30 text-xs font-bold text-center transition flex items-center justify-center gap-1"
              title="Comprar en AliExpress"
            >
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              <span>Comprar</span>
            </a>
          ` : ''}

          <button 
            type="button" 
            onclick="toggleNovedad('${prod.id}', false)"
            class="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 text-xs font-bold transition flex items-center justify-center gap-1"
            title="Quitar esta joya de la portada de inicio"
          >
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
            <span>Quitar</span>
          </button>
        </div>

      </div>
    `;
  }).join("");

  safeCreateIcons();
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  const loader = document.getElementById("loading-indicator");
  if (loader) {
    loader.classList.toggle("hidden", !isLoading);
  }
}

// ==============================================================================
// TOAST NOTIFICATIONS
// ==============================================================================
function showToast(title, message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const isError = type === "error";

  toast.className = `p-4 rounded-2xl border shadow-xl flex items-start gap-3 transition-all duration-300 transform translate-y-2 pointer-events-auto max-w-sm ${
    isError 
      ? 'bg-red-950/90 border-red-800 text-red-200' 
      : 'bg-[#141C18]/95 border-[#e72380]/40 text-white'
  }`;

  toast.innerHTML = `
    <div class="p-1 rounded-lg ${isError ? 'bg-red-900/50 text-red-400' : 'bg-[#e72380]/20 text-[#e72380]'} shrink-0">
      <i data-lucide="${isError ? 'alert-triangle' : 'check-circle'}" class="w-4 h-4"></i>
    </div>
    <div class="flex-grow">
      <h4 class="text-xs font-bold ${isError ? 'text-red-100' : 'text-white'}">${title}</h4>
      <p class="text-[11px] ${isError ? 'text-red-300' : 'text-gray-300'} mt-0.5 leading-tight">${message}</p>
    </div>
  `;

  container.appendChild(toast);
  safeCreateIcons();

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==============================================================================
// GESTOR DE FOTOS, SUBIDA OPTIMIZADA (HEIC/COMPRESIÓN) Y REORDENAMIENTO
// ==============================================================================

let draggedPhotoIdx = null;

function handlePhotoDragStart(e, idx) {
  draggedPhotoIdx = idx;
  e.dataTransfer.effectAllowed = "move";
  try {
    e.dataTransfer.setData("text/plain", idx);
  } catch (err) {}
  e.currentTarget.classList.add("dragging");
}

function handlePhotoDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function handlePhotoDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function handlePhotoDrop(e, targetIdx) {
  e.preventDefault();
  e.currentTarget.classList.remove("drag-over");
  if (draggedPhotoIdx === null || draggedPhotoIdx === targetIdx) return;

  const [moved] = state.currentEditPhotos.splice(draggedPhotoIdx, 1);
  state.currentEditPhotos.splice(targetIdx, 0, moved);
  draggedPhotoIdx = null;
  renderEditPhotosGrid();
}

function handlePhotoDragEnd(e) {
  draggedPhotoIdx = null;
  document.querySelectorAll(".photo-drag-item").forEach(el => {
    el.classList.remove("dragging", "drag-over");
  });
}

function handleMoveEditPhoto(idx, delta) {
  if (!state.currentEditPhotos) return;
  const target = idx + delta;
  if (target < 0 || target >= state.currentEditPhotos.length) return;
  const [moved] = state.currentEditPhotos.splice(idx, 1);
  state.currentEditPhotos.splice(target, 0, moved);
  renderEditPhotosGrid();
}

function handleSetMainEditPhoto(idx) {
  if (!state.currentEditPhotos || idx <= 0 || idx >= state.currentEditPhotos.length) return;
  const [photo] = state.currentEditPhotos.splice(idx, 1);
  state.currentEditPhotos.unshift(photo);
  renderEditPhotosGrid();
  showToast("Portada Seleccionada", "Esta foto ahora es la portada principal (#1).", "info");
}

function handleAssignPhotoToVariant(photoUrl) {
  if (!state.currentEditingProduct || !state.currentEditingVariantId || state.currentEditingVariantId === "all") return;
  const v = state.currentEditingProduct.variants.find(x => x.id === state.currentEditingVariantId);
  if (!v) return;
  v.foto_principal = photoUrl;
  renderEditPhotosGrid();
  renderEditVariantPills();
  showToast("Foto Asignada", `Foto vinculada al modelo "${v.codigo_sku || v.color_modelo}".`, "success");
}

function handleDeleteEditPhoto(idx) {
  if (!state.currentEditPhotos || idx < 0 || idx >= state.currentEditPhotos.length) return;
  state.currentEditPhotos.splice(idx, 1);
  renderEditPhotosGrid();
}

// Preprocesador de imágenes: Resuelve el bug de fotos de iPhone (HEIC) y comprime a JPEG para subidas ultra-rápidas
async function processImageForUpload(file) {
  let imageBlob = file;
  const fileName = file.name || "foto.jpg";
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isHeic = ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif';

  // 1. Conversión de HEIC a JPEG si está disponible la librería heic2any
  if (isHeic && window.heic2any) {
    try {
      const converted = await window.heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85
      });
      imageBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch (err) {
      console.warn("Fallo conversión heic2any, continuando:", err);
    }
  }

  // 2. Redimensionar en Canvas a máx 1600px y comprimir a JPEG optimizado (evita timeout y fotos de 20MB)
  return new Promise((resolve) => {
    const isImageByName = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(fileName);
    const isImage = (file.type && file.type.startsWith('image/')) || isHeic || isImageByName;
    if (!isImage) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            const cleanBase = fileName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
            const cleanFile = new File([blob], `${cleanBase}.jpg`, { type: "image/jpeg" });
            resolve(cleanFile);
          } else {
            resolve(file);
          }
        }, "image/jpeg", 0.82);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(imageBlob);
  });
}

async function handleEditAddFiles(files) {
  if (!files || files.length === 0) return;
  const prod = state.currentEditingProduct;
  const prodId = prod ? prod.id : document.getElementById("edit-product-id").value;
  const statusEl = document.getElementById("edit-photo-upload-status");
  
  if (statusEl) {
    statusEl.classList.remove("hidden");
    statusEl.innerHTML = `<span class="animate-pulse">⏳ Optimizando y subiendo ${files.length} foto(s)...</span>`;
  }

  const folder = (prod && prod.id_aliexpress) ? prod.id_aliexpress : (prod && prod.codigo_sku ? prod.codigo_sku : prodId);

  for (let i = 0; i < files.length; i++) {
    const rawFile = files[i];
    const file = await processImageForUpload(rawFile);
    const cleanName = `foto_${Date.now()}_${i + 1}.jpg`;
    const storagePath = `${folder}/galeria/${cleanName}`;

    try {
      const { data, error } = await supabaseClient.storage
        .from("joyas")
        .upload(storagePath, file, { 
          upsert: true,
          contentType: "image/jpeg"
        });

      let publicUrl = "";
      if (error) {
        console.warn("Fallo subiendo a subcarpeta, probando ruta plana:", error);
        const flatPath = `subida_${Date.now()}_${i + 1}.jpg`;
        const { error: flatErr } = await supabaseClient.storage
          .from("joyas")
          .upload(flatPath, file, { 
            upsert: true,
            contentType: "image/jpeg"
          });

        if (!flatErr) {
          publicUrl = `${SUPABASE_URL}/storage/v1/object/public/joyas/${flatPath}`;
        } else {
          console.error("Error al subir foto:", flatErr);
        }
      } else {
        publicUrl = `${SUPABASE_URL}/storage/v1/object/public/joyas/${storagePath}`;
      }

      if (publicUrl) {
        if (!state.currentEditPhotos) state.currentEditPhotos = [];
        if (!state.currentEditPhotos.includes(publicUrl)) {
          state.currentEditPhotos.push(publicUrl);
        }
        // Si se está editando una variante específica, auto-asignarla
        if (state.currentEditingVariantId !== "all" && prod && prod.variants) {
          const v = prod.variants.find(x => x.id === state.currentEditingVariantId);
          if (v && (!v.foto_principal || files.length === 1)) {
            v.foto_principal = publicUrl;
          }
        }
      }
    } catch (e) {
      console.error("Error en upload:", e);
    }
  }

  if (statusEl) {
    statusEl.innerHTML = `<span class="text-emerald-400 font-bold">✅ ¡Fotos optimizadas y subidas con éxito!</span>`;
    setTimeout(() => statusEl.classList.add("hidden"), 3000);
  }

  const fileInp = document.getElementById("edit-add-photos-file");
  if (fileInp) fileInp.value = "";

  renderEditPhotosGrid();
  renderEditVariantPills();
}

function handleEditAddUrl() {
  const input = document.getElementById("edit-add-photo-url-input");
  if (!input) return;
  const url = input.value.trim();
  if (!url) return;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    showToast("URL Inválida", "La URL de la imagen debe comenzar con https://", "error");
    return;
  }
  if (!state.currentEditPhotos) state.currentEditPhotos = [];
  if (!state.currentEditPhotos.includes(url)) {
    state.currentEditPhotos.push(url);
  } else {
    showToast("Foto ya añadida", "Esta imagen ya se encuentra en la galería.", "info");
  }
  input.value = "";
  renderEditPhotosGrid();
  renderEditVariantPills();
}

function renderEditPhotosGrid() {
  const grid = document.getElementById("edit-photos-grid");
  const countEl = document.getElementById("edit-photos-count");
  if (!grid) return;

  const photos = state.currentEditPhotos || [];
  if (countEl) countEl.textContent = `${photos.length} foto${photos.length === 1 ? '' : 's'}`;

  if (photos.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-6 text-center text-gray-500 text-xs">
        <i data-lucide="image-off" class="w-6 h-6 mx-auto mb-1 opacity-50"></i>
        Sin fotos registradas. Sube una o añade una URL.
      </div>
    `;
    safeCreateIcons();
    return;
  }

  const prod = state.currentEditingProduct;
  const activeVariant = (prod && prod.variants && state.currentEditingVariantId !== "all") 
    ? prod.variants.find(x => x.id === state.currentEditingVariantId) 
    : null;

  grid.innerHTML = photos.map((url, idx) => {
    const isMain = idx === 0;
    const isVariantPhoto = activeVariant && activeVariant.foto_principal === url;

    return `
      <div 
        class="photo-drag-item relative group rounded-xl overflow-hidden bg-black/50 border ${isMain ? 'border-amber-400 ring-1 ring-amber-400/50 shadow-md shadow-amber-500/10' : (isVariantPhoto ? 'border-[#e72380] ring-1 ring-[#e72380]/60' : 'border-white/10')}"
        draggable="true"
        data-idx="${idx}"
        ondragstart="handlePhotoDragStart(event, ${idx})"
        ondragover="handlePhotoDragOver(event, ${idx})"
        ondragleave="handlePhotoDragLeave(event)"
        ondrop="handlePhotoDrop(event, ${idx})"
        ondragend="handlePhotoDragEnd(event)"
      >
        <div class="aspect-square w-full overflow-hidden bg-black/40 relative">
          <img 
            src="${url}" 
            alt="Foto ${idx + 1}" 
            class="w-full h-full object-cover pointer-events-none" 
            onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23222%22/><text x=%2250%22 y=%2255%22 font-size=%2212%22 fill=%22%23888%22 text-anchor=%22middle%22>Foto ${idx + 1}</text></svg>';" 
          />
          
          <!-- Grip / Orden -->
          <div class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-gray-300 text-[9px] flex items-center gap-0.5 pointer-events-none">
            <i data-lucide="grip-vertical" class="w-3 h-3 text-gray-400"></i>
            <span class="font-mono font-bold">#${idx + 1}</span>
          </div>
        </div>

        <!-- Badge Portada o Botón para Hacer Principal -->
        <div class="absolute top-1 left-1 z-10 flex flex-col gap-1">
          ${isMain ? `
            <span class="px-1.5 py-0.5 rounded-md bg-amber-500 text-black font-extrabold text-[9px] shadow-sm flex items-center gap-1">
              ⭐ Portada
            </span>
          ` : `
            <button 
              type="button" 
              onclick="handleSetMainEditPhoto(${idx})" 
              class="px-1.5 py-0.5 rounded-md bg-black/80 hover:bg-amber-500 hover:text-black text-amber-300 font-bold text-[9px] backdrop-blur-xs transition shadow-sm border border-white/10"
              title="Convertir en foto de portada principal (#1)"
            >
              ⭐ Portada
            </button>
          `}

          ${activeVariant ? (
            isVariantPhoto ? `
              <span class="px-1.5 py-0.5 rounded-md bg-[#e72380] text-white font-extrabold text-[8px] shadow-sm flex items-center gap-0.5">
                🎯 Modelo
              </span>
            ` : `
              <button 
                type="button" 
                onclick="handleAssignPhotoToVariant('${url}')" 
                class="px-1.5 py-0.5 rounded-md bg-black/85 hover:bg-[#e72380] text-rose-300 hover:text-white font-bold text-[8px] backdrop-blur-xs transition shadow-sm border border-rose-500/30"
                title="Asignar esta foto a la variante activa"
              >
                🎯 Asignar
              </button>
            `
          ) : ''}
        </div>

        <!-- Botones de Reordenar (◀ ▶) táctiles y Eliminar -->
        <div class="absolute top-1 right-1 z-10 flex items-center gap-1">
          ${idx > 0 ? `
            <button 
              type="button" 
              onclick="handleMoveEditPhoto(${idx}, -1)" 
              class="w-5 h-5 rounded-md bg-black/80 hover:bg-white/20 text-white flex items-center justify-center transition border border-white/10"
              title="Mover a la izquierda (antes)"
            >
              <i data-lucide="chevron-left" class="w-3 h-3"></i>
            </button>
          ` : ''}
          ${idx < photos.length - 1 ? `
            <button 
              type="button" 
              onclick="handleMoveEditPhoto(${idx}, 1)" 
              class="w-5 h-5 rounded-md bg-black/80 hover:bg-white/20 text-white flex items-center justify-center transition border border-white/10"
              title="Mover a la derecha (después)"
            >
              <i data-lucide="chevron-right" class="w-3 h-3"></i>
            </button>
          ` : ''}
          <button 
            type="button" 
            onclick="handleDeleteEditPhoto(${idx})" 
            class="w-5 h-5 rounded-md bg-red-600/85 hover:bg-red-600 text-white flex items-center justify-center transition shadow-sm"
            title="Eliminar esta foto"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  safeCreateIcons();
}

function updateEditDiscountNotice() {
  const normalInput = document.getElementById("edit-precio");
  const promoInput = document.getElementById("edit-precio-oferta");
  const checkDesc = document.getElementById("edit-es-descuento");
  const notice = document.getElementById("edit-descuento-live-notice");
  const badgeInput = document.getElementById("edit-badge-oferta");
  if (!notice) return;

  const normal = parseFloat(normalInput ? normalInput.value : 0) || 0;
  const promo = parseFloat(promoInput ? promoInput.value : 0) || 0;
  const isChecked = checkDesc ? checkDesc.checked : false;

  if (!isChecked) {
    notice.innerHTML = `<span class="text-gray-400">💡 Promoción desactivada. La joya se venderá siempre a su precio regular de <strong>$${normal || 0} MXN</strong>.</span>`;
    return;
  }

  if (!promo) {
    notice.innerHTML = `<span class="text-gray-300">💡 Ingresa en cuánto quieres dar la joya en oferta para calcular el porcentaje de descuento y el badge automáticamente.</span>`;
    return;
  }

  if (promo >= normal) {
    notice.innerHTML = `<span class="text-amber-400 font-bold">⚠️ El precio en oferta ($${promo}) debe ser menor al precio normal ($${normal}) para poder aplicar un descuento.</span>`;
    return;
  }

  const pct = Math.round(((normal - promo) / normal) * 100);
  const ahorro = Math.round(normal - promo);

  notice.innerHTML = `
    <div class="space-y-1">
      <div class="text-emerald-400 font-extrabold text-xs flex items-center gap-1.5">
        <i data-lucide="sparkles" class="w-4 h-4 text-emerald-400"></i>
        <span>✨ ¡Promoción Activa! ${pct}% de Descuento Especial</span>
      </div>
      <div class="text-gray-300 text-[11px] leading-relaxed">
        La joya se venderá al público a <strong class="text-emerald-400 text-xs">$${promo} MXN</strong> (su precio normal de <span class="line-through text-gray-400 font-medium">$${normal} MXN</span> aparecerá tachado). El cliente ahorra <strong class="text-white font-bold">$${ahorro} MXN</strong>.
      </div>
    </div>
  `;

  if (badgeInput && (!badgeInput.value || badgeInput.value.includes("%") || badgeInput.value === "PLATA S925")) {
    badgeInput.value = `-${pct}% OFF`;
  }
}

// ==============================================================================
// MODAL DE EDICIÓN CON SELECTOR DE VARIANTES ESPECÍFICAS
// ==============================================================================

function openEditProductModal(productId, targetVariantId = null) {
  const prod = state.products.find(p => p.id === productId || (p.variants && p.variants.some(v => v.id === productId)));
  if (!prod) {
    showToast("Error", "No se encontró la joya seleccionada.", "error");
    return;
  }

  state.currentEditingProduct = prod;
  state.currentEditingProductId = prod.id;

  const modal = document.getElementById("edit-product-modal");
  if (!modal) return;

  // Recopilar todas las fotos preservando el orden guardado (foto_principal primero)
  const allPhotos = [];
  if (prod.foto_principal) {
    allPhotos.push(prod.foto_principal);
  }
  if (Array.isArray(prod.galeria_fotos)) {
    prod.galeria_fotos.forEach(u => {
      if (u && !allPhotos.includes(u)) allPhotos.push(u);
    });
  }
  if (prod.variants && prod.variants.length > 0) {
    prod.variants.forEach(v => {
      if (v.foto_principal && !allPhotos.includes(v.foto_principal)) {
        allPhotos.push(v.foto_principal);
      }
      if (Array.isArray(v.galeria_fotos)) {
        v.galeria_fotos.forEach(u => {
          if (u && !allPhotos.includes(u)) allPhotos.push(u);
        });
      }
    });
  }
  state.currentEditPhotos = allPhotos;

  // Determinar variante inicial a editar
  if (targetVariantId) {
    state.currentEditingVariantId = targetVariantId;
  } else if (prod.variants && prod.variants.length > 1) {
    state.currentEditingVariantId = "all";
  } else if (prod.variants && prod.variants[0]) {
    state.currentEditingVariantId = prod.variants[0].id;
  } else {
    state.currentEditingVariantId = prod.id;
  }

  renderEditVariantPills();
  selectEditVariant(state.currentEditingVariantId);

  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("modal-active"));
  safeCreateIcons();
}

function cleanVariantName(label) {
  if (!label) return "";
  let s = String(label).trim();
  s = s.replace(/color\s+de\s+(?:la\s+)?(?:gema|piedra|metal|cristal):\s*/gi, "");
  s = s.replace(/(?:stone\s+)?color:\s*/gi, "");
  s = s.replace(/modelo:\s*/gi, "");
  s = s.replace(/[\u00A0\s]+/g, " ");
  s = s.replace(/\s+color$/i, "");
  s = s.trim();
  if (s.toLowerCase() === "única" || s.toLowerCase() === "unica" || s.toLowerCase() === "modelo principal") {
    return "";
  }
  return s;
}

function renderEditVariantPills() {
  const wrapper = document.getElementById("edit-variant-selector-wrapper");
  const list = document.getElementById("edit-variant-pills-list");
  if (!wrapper || !list) return;

  const prod = state.currentEditingProduct;
  if (!prod || !prod.variants || prod.variants.length <= 1) {
    wrapper.classList.add("hidden");
    return;
  }

  wrapper.classList.remove("hidden");

  let pillsHtml = `
    <button 
      type="button" 
      onclick="selectEditVariant('all')" 
      class="variant-pill-btn px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 border ${state.currentEditingVariantId === 'all' ? 'active' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}"
    >
      <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-400"></i>
      <span>🌟 Todo el Grupo</span>
    </button>
  `;

  prod.variants.forEach((v, idx) => {
    const isSelected = state.currentEditingVariantId === v.id;
    const vPhoto = v.foto_principal || prod.foto_principal || '';
    const vName = cleanVariantName(v.codigo_sku || v.color_modelo) || `Modelo ${idx + 1}`;
    const vPrice = Math.round(v.precio_venta || prod.precio_venta || 0);

    pillsHtml += `
      <button 
        type="button" 
        onclick="selectEditVariant('${v.id}')" 
        class="variant-pill-btn px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 shrink-0 border ${isSelected ? 'active' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'}"
      >
        <img src="${vPhoto}" class="w-6 h-6 rounded-lg object-cover border border-white/10 shrink-0" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23222%22/></svg>';" />
        <span class="truncate max-w-[120px]">${vName}</span>
        <span class="px-1.5 py-0.2 rounded text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-black/50 text-emerald-400 font-mono'}">$${vPrice}</span>
      </button>
    `;
  });

  list.innerHTML = pillsHtml;
  safeCreateIcons();
}

function selectEditVariant(variantId) {
  state.currentEditingVariantId = variantId;
  const prod = state.currentEditingProduct;
  if (!prod) return;

  const skuRow = document.getElementById("edit-variant-sku-row");
  const skuInput = document.getElementById("edit-variant-sku");
  const modeBadge = document.getElementById("edit-variant-mode-badge");
  const tipEl = document.getElementById("edit-variant-tip");

  // Actualizar selector visual de píldoras
  document.querySelectorAll(".variant-pill-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  if (variantId === "all") {
    if (skuRow) skuRow.classList.add("hidden");
    if (modeBadge) {
      modeBadge.textContent = `🌟 Todo el Grupo (${prod.variants ? prod.variants.length : 1} variantes)`;
      modeBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30";
    }
    if (tipEl) {
      tipEl.textContent = "Los cambios generales de nombre, descripción y categoría se guardarán para todo el grupo.";
    }

    document.getElementById("edit-product-id").value = prod.id;
    document.getElementById("edit-sku-badge").textContent = `ID Grupo: ${prod.id_aliexpress || prod.codigo_sku || 'S/C'}`;
    document.getElementById("edit-titulo").value = prod.titulo || "";
    document.getElementById("edit-descripcion").value = prod.descripcion || "";
    document.getElementById("edit-categoria").value = prod.categoria || "anillos";
    
    const cleanT = (prod.tallas || "Ajustable").replace(/\(.*?agotad.*?\)/gi, "").trim();
    document.getElementById("edit-tallas").value = cleanT;
    
    document.getElementById("edit-costo").value = prod.costo_real ? Math.round(prod.costo_real) : "";
    document.getElementById("edit-stock").value = prod.estado_stock || "Disponible";
    document.getElementById("edit-enlace").value = prod.enlace_aliexpress || "";
    
    document.getElementById("edit-es-novedad").checked = prod.es_novedad === true;
    document.getElementById("edit-activo").checked = prod.activo !== false && prod.estado_stock !== "Agotada";

    let normalPrice = Math.round(prod.precio_venta || 0);
    let promoPrice = "";
    const isOferta = prod.es_destacado === true || (prod.badge && (prod.badge.includes("%") || prod.badge.includes("🔥")));

    let origInSpec = null;
    if (prod.especificaciones) {
      const m = prod.especificaciones.match(/\[?PrecioOriginal:\s*([\d.]+)\]?/i);
      if (m) origInSpec = Math.round(parseFloat(m[1]));
    }
    if (origInSpec && isOferta) {
      normalPrice = origInSpec;
      promoPrice = Math.round(prod.precio_venta || 0);
    } else if (!origInSpec && isOferta) {
      normalPrice = Math.round(prod.precio_venta * 1.25);
      promoPrice = Math.round(prod.precio_venta);
    }

    document.getElementById("edit-precio").value = normalPrice;
    const promoInput = document.getElementById("edit-precio-oferta");
    if (promoInput) promoInput.value = promoPrice;

    const checkDesc = document.getElementById("edit-es-descuento");
    if (checkDesc) checkDesc.checked = isOferta;

    const inputBadge = document.getElementById("edit-badge-oferta");
    if (inputBadge) inputBadge.value = prod.badge && prod.badge !== "PLATA S925" ? prod.badge : (isOferta ? "-20% OFF" : "");

  } else {
    // Modo Variante Específica
    const v = (prod.variants || []).find(x => x.id === variantId) || prod;

    if (skuRow) skuRow.classList.remove("hidden");
    if (skuInput) skuInput.value = v.codigo_sku || v.color_modelo || "";
    if (modeBadge) {
      modeBadge.textContent = `🎨 Variante: ${v.codigo_sku || v.color_modelo || 'Específica'}`;
      modeBadge.className = "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#e72380]/20 text-[#e72380] border border-[#e72380]/30";
    }
    if (tipEl) {
      tipEl.textContent = `Editando exclusivamente "${v.codigo_sku || v.color_modelo}". Los cambios de foto, tallas y precio afectarán solo a este modelo.`;
    }

    document.getElementById("edit-product-id").value = v.id;
    document.getElementById("edit-sku-badge").textContent = `Variante: ${v.codigo_sku || 'S/C'}`;
    document.getElementById("edit-titulo").value = v.titulo || prod.titulo || "";
    document.getElementById("edit-descripcion").value = v.descripcion || prod.descripcion || "";
    document.getElementById("edit-categoria").value = v.categoria || prod.categoria || "anillos";
    
    const cleanT = (v.tallas || prod.tallas || "Ajustable").replace(/\(.*?agotad.*?\)/gi, "").trim();
    document.getElementById("edit-tallas").value = cleanT;
    
    document.getElementById("edit-costo").value = v.costo_real ? Math.round(v.costo_real) : (prod.costo_real ? Math.round(prod.costo_real) : "");
    document.getElementById("edit-stock").value = v.estado_stock || "Disponible";
    document.getElementById("edit-enlace").value = v.enlace_aliexpress || prod.enlace_aliexpress || "";
    
    document.getElementById("edit-es-novedad").checked = v.es_novedad === true;
    document.getElementById("edit-activo").checked = v.activo !== false && v.estado_stock !== "Agotada";

    let normalPrice = Math.round(v.precio_venta || prod.precio_venta || 0);
    let promoPrice = "";
    const isOferta = v.es_destacado === true || (v.badge && (v.badge.includes("%") || v.badge.includes("🔥")));

    let origInSpec = null;
    if (v.especificaciones) {
      const m = v.especificaciones.match(/\[?PrecioOriginal:\s*([\d.]+)\]?/i);
      if (m) origInSpec = Math.round(parseFloat(m[1]));
    }
    if (origInSpec && isOferta) {
      normalPrice = origInSpec;
      promoPrice = Math.round(v.precio_venta || 0);
    } else if (!origInSpec && isOferta) {
      normalPrice = Math.round(v.precio_venta * 1.25);
      promoPrice = Math.round(v.precio_venta);
    }

    document.getElementById("edit-precio").value = normalPrice;
    const promoInput = document.getElementById("edit-precio-oferta");
    if (promoInput) promoInput.value = promoPrice;

    const checkDesc = document.getElementById("edit-es-descuento");
    if (checkDesc) checkDesc.checked = isOferta;

    const inputBadge = document.getElementById("edit-badge-oferta");
    if (inputBadge) inputBadge.value = v.badge && v.badge !== "PLATA S925" ? v.badge : (isOferta ? "-20% OFF" : "");
  }

  renderEditPhotosGrid();
  renderEditVariantPills();
  updateEditDiscountNotice();
  safeCreateIcons();
}

function closeEditProductModal() {
  const modal = document.getElementById("edit-product-modal");
  if (modal) {
    modal.classList.remove("modal-active");
    setTimeout(() => modal.classList.add("hidden"), 200);
  }
}

async function handleEditProductSubmit(e) {
  e.preventDefault();
  const prod = state.currentEditingProduct;
  if (!prod) return;

  const saveBtn = document.getElementById("edit-save-btn");
  const origBtnContent = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Guardando...</span>`;
  safeCreateIcons();

  try {
    const titulo = document.getElementById("edit-titulo").value.trim();
    const descripcion = document.getElementById("edit-descripcion").value.trim();
    const categoria = document.getElementById("edit-categoria").value;
    let tallas = document.getElementById("edit-tallas").value.trim();
    tallas = tallas.replace(/\(.*?agotad.*?\)/gi, "").trim() || "Ajustable";
    
    const normalPrice = parseFloat(document.getElementById("edit-precio").value);
    const costo = parseFloat(document.getElementById("edit-costo").value || 0);
    const stock = document.getElementById("edit-stock").value;
    const enlace = document.getElementById("edit-enlace").value.trim();
    const esNovedad = document.getElementById("edit-es-novedad").checked;
    const activo = document.getElementById("edit-activo").checked;

    const promoInput = document.getElementById("edit-precio-oferta");
    const promoPrice = promoInput ? parseFloat(promoInput.value || 0) : 0;
    const badgeOferta = document.getElementById("edit-badge-oferta") ? document.getElementById("edit-badge-oferta").value.trim() : "";

    let finalSellingPrice = normalPrice;
    let finalBadge = prod.badge || "PLATA S925";
    let finalEspec = prod.especificaciones || "";

    finalEspec = finalEspec.replace(/\b\[?PrecioOriginal:\s*[\d.]+\]?\s*\|?\s*/gi, "").trim();

    if (promoPrice > 0 && promoPrice < normalPrice) {
      finalSellingPrice = promoPrice;
      finalEspec = `[PrecioOriginal: ${normalPrice}] ${finalEspec}`.trim();
      const pct = Math.round(((normalPrice - promoPrice) / normalPrice) * 100);
      finalBadge = badgeOferta || `-${pct}% OFF`;
    } else {
      finalSellingPrice = normalPrice;
      if (finalBadge.includes("%") || finalBadge.includes("🔥")) {
        finalBadge = "PLATA S925";
      }
    }

    const uniquePhotos = [];
    (state.currentEditPhotos || []).forEach(u => {
      if (u && !uniquePhotos.includes(u)) uniquePhotos.push(u);
    });
    let mainPhotoUrl = uniquePhotos[0] || prod.foto_principal;
    let newGallery = uniquePhotos.slice(1);

    if (state.currentEditingVariantId !== "all") {
      // 1. Guardar exclusivamente variante específica
      const variantSku = document.getElementById("edit-variant-sku") ? document.getElementById("edit-variant-sku").value.trim() : "";
      const v = (prod.variants || []).find(x => x.id === state.currentEditingVariantId);
      if (!v) throw new Error("No se encontró la variante a actualizar.");

      const variantPhoto = v.foto_principal || mainPhotoUrl;

      const variantUpdates = {
        titulo: titulo,
        descripcion: descripcion,
        categoria: categoria,
        tallas: tallas,
        precio_venta: finalSellingPrice,
        costo_real: costo > 0 ? costo : null,
        estado_stock: stock,
        enlace_aliexpress: enlace || null,
        foto_principal: variantPhoto,
        activo: stock === "Agotada" ? false : activo,
        codigo_sku: variantSku || v.codigo_sku,
        color_modelo: variantSku || v.color_modelo,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabaseClient
        .from("productos")
        .update(variantUpdates)
        .eq("id", v.id);

      if (error) throw error;

      Object.assign(v, variantUpdates);

      // Recalcular precios del grupo
      const prices = prod.variants.map(item => item.precio_venta).filter(pr => !isNaN(pr));
      if (prices.length > 0) {
        prod.precio_venta = Math.min(...prices);
      }

      showToast("Variante Actualizada", `Modelo "${variantSku || v.codigo_sku}" guardado con éxito.`, "success");

    } else {
      // 2. Guardar Grupo Completo
      const updates = {
        titulo: titulo,
        descripcion: descripcion,
        categoria: categoria,
        tallas: tallas,
        precio_venta: finalSellingPrice,
        costo_real: costo > 0 ? costo : null,
        estado_stock: stock,
        enlace_aliexpress: enlace || null,
        foto_principal: mainPhotoUrl,
        galeria_fotos: newGallery,
        es_novedad: esNovedad,
        es_destacado: promoPrice > 0 && promoPrice < normalPrice,
        badge: finalBadge,
        especificaciones: finalEspec || null,
        activo: stock === "Agotada" ? false : activo,
        updated_at: new Date().toISOString()
      };

      const targetIds = prod.rowIds && prod.rowIds.length > 0 ? prod.rowIds : [prod.id];
      const { error } = await supabaseClient
        .from("productos")
        .update(updates)
        .in("id", targetIds);

      if (error) throw error;

      Object.assign(prod, updates);
      if (prod.variants) {
        prod.variants.forEach(v => Object.assign(v, {
          titulo: titulo,
          descripcion: descripcion,
          categoria: categoria,
          es_novedad: esNovedad,
          activo: updates.activo,
          estado_stock: updates.estado_stock
        }));
      }

      showToast("Joya Actualizada", `"${titulo.slice(0, 30)}..." se guardó con éxito.`, "success");
    }

    calculateStats();
    applyFilters();
    if (state.activeTab === "portada") renderPortadaView();
    if (state.activeTab === "ofertas") renderOfertasView();

    closeEditProductModal();

  } catch (err) {
    console.error("Error al guardar cambios:", err);
    showToast("Error al guardar", err.message || "No se pudo actualizar la joya.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = origBtnContent;
    safeCreateIcons();
  }
}

function toggleVariantsPreview(productId) {
  const list = document.getElementById(`variants-preview-${productId}`);
  const arrow = document.getElementById(`variant-arrow-${productId}`);
  if (!list) return;
  const isHidden = list.classList.contains("hidden");
  if (isHidden) {
    list.classList.remove("hidden");
    if (arrow) arrow.textContent = "Ocultar ▴";
  } else {
    list.classList.add("hidden");
    if (arrow) arrow.textContent = "Ver ▾";
  }
}
// ==============================================================================
// SISTEMA DE SEGURIDAD CRIPTOGRÁFICA Y CARGA DINÁMICA DEL DASHBOARD
// ==============================================================================
// Hashes SHA-256 autorizados para acceso (sin credenciales legibles en cliente)
const ALLOWED_PIN_HASHES = [
  "2fdb26c08f0dec644da0057a69ec9720eedb71c90de0fc2f871f6d6ba24bc349",
  "7b4282e8cfed588a578a4b55f6eb6e9546fe1a979c737c5928a571778db8d7da",
  "166ef5a9db1ef1103a1dc744f8bc7cb59eb94fd6e7f48a6cd60c0e706ee9881e",
  "15de5467435fe3fec60ba5d9453c2ae8c05bfbf8dc4bee0ccdd5d2e832b90cd2"
];
const STORAGE_AUTH_KEY = "yamiki_admin_authenticated";
const STORAGE_CUSTOM_PIN_KEY = "yamiki_admin_custom_pin";

async function hashPin(str) {
  if (!str) return "";
  if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(str.trim()));
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return str.trim();
}

async function verifyPin(input) {
  if (!input) return false;
  const hash = await hashPin(input);
  const hashLower = await hashPin(input.toLowerCase());
  const custom = localStorage.getItem(STORAGE_CUSTOM_PIN_KEY);
  if (custom && (custom === input || custom.toLowerCase() === input.toLowerCase())) return true;
  return ALLOWED_PIN_HASHES.includes(hash) || ALLOWED_PIN_HASHES.includes(hashLower);
}

async function checkAdminAuth() {
  const isAuth = sessionStorage.getItem(STORAGE_AUTH_KEY) === "true";
  const lockScreen = document.getElementById("admin-lock-screen");
  const root = document.getElementById("admin-app-root");

  if (isAuth) {
    if (lockScreen) lockScreen.classList.add("hidden");
    // Montar el dashboard en el DOM únicamente si no está cargado
    if (root && root.children.length === 0) {
      await mountAdminDashboard();
    }
  } else {
    // Si no está autenticado, el DOM del dashboard se vacía completamente
    if (root) root.innerHTML = "";
    state.products = [];
    state.filteredProducts = [];
    if (lockScreen) {
      lockScreen.classList.remove("hidden");
      const pinInput = document.getElementById("admin-pin-input");
      if (pinInput) setTimeout(() => pinInput.focus(), 150);
    }
  }
}

async function mountAdminDashboard() {
  const root = document.getElementById("admin-app-root");
  if (!root) return;
  try {
    const res = await fetch("./dashboard.html");
    if (!res.ok) throw new Error("No se pudo cargar el archivo del dashboard");
    const html = await res.text();
    root.innerHTML = html;
    setupEventListeners();
    safeCreateIcons();
    await loadProductsFromSupabase();
  } catch (err) {
    console.error("Error montando dashboard:", err);
    showToast("Error", "No se pudo cargar el panel administrativo.", "error");
  }
}

async function handlePinSubmit(e) {
  if (e && typeof e.preventDefault === "function") e.preventDefault();
  const input = document.getElementById("admin-pin-input");
  const errorMsg = document.getElementById("pin-error-msg");
  const val = input ? input.value.trim() : "";
  if (!val) return;

  const isValid = await verifyPin(val);
  if (isValid) {
    sessionStorage.setItem(STORAGE_AUTH_KEY, "true");
    if (errorMsg) errorMsg.classList.add("hidden");
    if (input) input.value = "";
    await checkAdminAuth();
    showToast("Bienvenido", "Panel de administración desbloqueado.", "success");
  } else {
    if (errorMsg) {
      errorMsg.textContent = "PIN incorrecto. Acceso denegado.";
      errorMsg.classList.remove("hidden");
    }
    if (input) {
      input.classList.add("border-rose-500", "animate-shake");
      setTimeout(() => input.classList.remove("border-rose-500", "animate-shake"), 600);
      input.value = "";
      input.focus();
    }
  }
}

function lockAdminPanel() {
  sessionStorage.removeItem(STORAGE_AUTH_KEY);
  const root = document.getElementById("admin-app-root");
  if (root) root.innerHTML = "";
  state.products = [];
  state.filteredProducts = [];
  const lockScreen = document.getElementById("admin-lock-screen");
  if (lockScreen) {
    lockScreen.classList.remove("hidden");
    const pinInput = document.getElementById("admin-pin-input");
    if (pinInput) {
      pinInput.value = "";
      setTimeout(() => pinInput.focus(), 150);
    }
  }
  showToast("Sesión Cerrada", "El panel ha sido bloqueado de forma segura.", "success");
}

function togglePinVisibility() {
  const input = document.getElementById("admin-pin-input");
  const icon = document.getElementById("pin-eye-icon");
  if (!input) return;
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  if (icon) {
    icon.setAttribute("data-lucide", isPassword ? "eye-off" : "eye");
    safeCreateIcons();
  }
}
