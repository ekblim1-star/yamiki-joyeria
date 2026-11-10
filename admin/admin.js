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
  droppedImages: new Map(), // filename -> File object
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
document.addEventListener("DOMContentLoaded", () => {
  if (!supabaseClient) {
    showToast("Error", "No se pudo cargar la librería de Supabase.", "error");
    return;
  }
  setupEventListeners();
  checkAdminAuth();
  loadProductsFromSupabase();
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

    state.products = data || [];
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

  document.getElementById("stat-total").textContent = state.stats.total;
  document.getElementById("stat-novedades").textContent = `${state.stats.novedades} / ${MAX_NOVEDADES}`;
  document.getElementById("stat-agotadas").textContent = state.stats.agotadas;
  document.getElementById("stat-anillos").textContent = state.stats.anillos;

  const tabNovCount = document.getElementById("tab-novedades-count");
  if (tabNovCount) tabNovCount.textContent = `${state.stats.novedades}/${MAX_NOVEDADES}`;

  const portadaLimit = document.getElementById("portada-limit-label");
  if (portadaLimit) portadaLimit.textContent = `${state.stats.novedades} / ${MAX_NOVEDADES}`;
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
  const countLabel = document.getElementById("filtered-count-label");
  if (!container) return;

  if (countLabel) {
    countLabel.textContent = `Mostrando ${state.filteredProducts.length} de ${state.products.length} joyas`;
  }

  if (state.filteredProducts.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="py-16 text-center text-gray-400">
          <i data-lucide="gem" class="w-12 h-12 mx-auto mb-3 text-gray-600"></i>
          <p class="text-sm font-semibold text-gray-300">No se encontraron joyas</p>
          <p class="text-xs text-gray-500 mt-1">Prueba cambiando el filtro o sube tu archivo Excel del scraper.</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = state.filteredProducts.map(prod => {
    const photoUrl = prod.foto_principal || 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80';
    const isNovedad = prod.es_novedad === true;
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
                class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-200"
                onerror="this.src='https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80'"
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
            ${prod.color_modelo && prod.color_modelo !== 'Única' ? `
              <span class="text-[10px] text-purple-300 font-medium bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-800/40">
                ${prod.color_modelo}
              </span>
            ` : ''}
          </div>
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

        <!-- 6. Botón de Compra Directo a AliExpress -->
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

        <!-- 7. Acciones (Editar / Eliminar) -->
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

  lucide.createIcons();
}

// ==============================================================================
// EDICIÓN RÁPIDA EN TIEMPO REAL
// ==============================================================================
async function updateProductPrice(productId, newPrice) {
  const price = parseFloat(newPrice);
  if (isNaN(price) || price < 0) {
    showToast("Precio inválido", "Ingresa un precio numérico válido.", "error");
    return;
  }

  try {
    const { error } = await supabaseClient
      .from("productos")
      .update({ precio_venta: price, updated_at: new Date().toISOString() })
      .eq("id", productId);

    if (error) throw error;

    // Actualizar estado local
    const p = state.products.find(item => item.id === productId);
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

  try {
    const { error } = await supabaseClient
      .from("productos")
      .delete()
      .eq("id", productId);

    if (error) throw error;

    state.products = state.products.filter(p => p.id !== productId);
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

  lucide.createIcons();
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
    lucide.createIcons();
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
        const { error: uploadErr } = await supabaseClient.storage
          .from("joyas")
          .upload(cleanName, matchingFile, { upsert: true });

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
      lucide.createIcons();
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
    lucide.createIcons();
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

    // Subir foto si se seleccionó archivo
    if (fotoInput.files && fotoInput.files[0]) {
      const file = fotoInput.files[0];
      const filename = `manual_${sku}_${Date.now()}.jpg`;
      const { data, error: uploadErr } = await supabaseClient.storage
        .from("joyas")
        .upload(filename, file, { upsert: true });

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

  if (tabName === "catalogo") {
    if (viewCatalogo) viewCatalogo.classList.remove("hidden");
    if (tabCatalogo) tabCatalogo.className = activeTabClass;
  } else if (tabName === "portada") {
    if (viewPortada) viewPortada.classList.remove("hidden");
    if (tabPortada) tabPortada.className = activeTabClass;
    renderPortadaView();
  } else if (tabName === "importar") {
    if (viewImportar) viewImportar.classList.remove("hidden");
    if (tabImportar) tabImportar.className = activeTabClass;
  }

  lucide.createIcons();
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
    lucide.createIcons();
    return;
  }

  container.innerHTML = novedades.map(prod => {
    const photoUrl = prod.foto_principal || 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80';

    return `
      <div class="bg-[#141C18] rounded-2xl border border-white/10 overflow-hidden flex flex-col justify-between group hover:border-amber-500/40 transition-all shadow-md">
        
        <div>
          <!-- Foto con Badge Novedad -->
          <div class="relative w-full aspect-square bg-black/40 overflow-hidden">
            <img 
              src="${photoUrl}" 
              alt="${prod.codigo_sku}" 
              class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
              onerror="this.src='https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80'"
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

  lucide.createIcons();
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
  lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2");
  });

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==============================================================================
// MODAL DE EDICIÓN COMPLETA DE JOYAS (TÍTULO, DESCRIPCIÓN, TALLAS, FOTOS, STOCK)
// ==============================================================================
function openEditProductModal(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) {
    showToast("Error", "No se encontró la joya seleccionada.", "error");
    return;
  }

  const modal = document.getElementById("edit-product-modal");
  if (!modal) return;

  // Poblar campos
  document.getElementById("edit-product-id").value = prod.id;
  document.getElementById("edit-sku-badge").textContent = `SKU: ${prod.codigo_sku || 'S/C'}`;
  document.getElementById("edit-titulo").value = prod.titulo || "";
  document.getElementById("edit-descripcion").value = prod.descripcion || "";
  document.getElementById("edit-categoria").value = prod.categoria || "anillos";
  
  // Limpiar tallas si tienen "(Agotadas: ...)"
  const cleanT = (prod.tallas || "Ajustable").replace(/\(.*?agotad.*?\)/gi, "").trim();
  document.getElementById("edit-tallas").value = cleanT;
  
  document.getElementById("edit-precio").value = Math.round(prod.precio_venta || 0);
  document.getElementById("edit-costo").value = prod.costo_real ? Math.round(prod.costo_real) : "";
  document.getElementById("edit-stock").value = prod.estado_stock || "Disponible";
  document.getElementById("edit-enlace").value = prod.enlace_aliexpress || "";
  
  const currentPhoto = prod.foto_principal || 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80';
  document.getElementById("edit-foto-preview").src = currentPhoto;
  document.getElementById("edit-foto-url").value = prod.foto_principal || "";
  document.getElementById("edit-foto-file").value = "";

  document.getElementById("edit-es-novedad").checked = prod.es_novedad === true;
  document.getElementById("edit-activo").checked = prod.activo !== false && prod.estado_stock !== "Agotada";

  // Listener para previsualizar foto nueva si se sube archivo
  const fileInput = document.getElementById("edit-foto-file");
  fileInput.onchange = function() {
    if (this.files && this.files[0]) {
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById("edit-foto-preview").src = e.target.result;
      };
      reader.readAsDataURL(this.files[0]);
    }
  };

  // Listener para previsualizar URL pegada
  const urlInput = document.getElementById("edit-foto-url");
  urlInput.oninput = function() {
    if (this.value) {
      document.getElementById("edit-foto-preview").src = this.value;
    }
  };

  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("modal-active"));
  lucide.createIcons();
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
  const productId = document.getElementById("edit-product-id").value;
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const saveBtn = document.getElementById("edit-save-btn");
  const origBtnContent = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Guardando...</span>`;
  lucide.createIcons();

  try {
    const titulo = document.getElementById("edit-titulo").value.trim();
    const descripcion = document.getElementById("edit-descripcion").value.trim();
    const categoria = document.getElementById("edit-categoria").value;
    let tallas = document.getElementById("edit-tallas").value.trim();
    // Limpiar patrones de agotadas en tallas
    tallas = tallas.replace(/\(.*?agotad.*?\)/gi, "").trim() || "Ajustable";
    
    const precio = parseFloat(document.getElementById("edit-precio").value);
    const costo = parseFloat(document.getElementById("edit-costo").value || 0);
    const stock = document.getElementById("edit-stock").value;
    const enlace = document.getElementById("edit-enlace").value.trim();
    const esNovedad = document.getElementById("edit-es-novedad").checked;
    const activo = document.getElementById("edit-activo").checked;

    // Validar límite si se intenta marcar como novedad
    if (esNovedad && !prod.es_novedad) {
      const currentNovs = state.products.filter(p => p.es_novedad).length;
      if (currentNovs >= MAX_NOVEDADES) {
        showToast("Límite de Portada", `Solo puedes tener máximo ${MAX_NOVEDADES} joyas en novedades. Desmarca una primero.`, "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = origBtnContent;
        lucide.createIcons();
        return;
      }
    }

    let fotoUrl = document.getElementById("edit-foto-url").value.trim() || prod.foto_principal;
    const fileInput = document.getElementById("edit-foto-file");

    // Si seleccionó un archivo nuevo, subir a Supabase Storage
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const filename = `joya_${productId}.jpg`;
      const { error: upErr } = await supabaseClient.storage
        .from("joyas")
        .upload(filename, file, { upsert: true });

      if (upErr) {
        console.error("Error al subir nueva foto:", upErr);
      } else {
        fotoUrl = `${SUPABASE_URL}/storage/v1/object/public/joyas/${filename}?t=${Date.now()}`;
      }
    }

    const updates = {
      titulo: titulo,
      descripcion: descripcion,
      categoria: categoria,
      tallas: tallas,
      precio_venta: precio,
      costo_real: costo > 0 ? costo : null,
      estado_stock: stock,
      enlace_aliexpress: enlace || null,
      foto_principal: fotoUrl,
      es_novedad: esNovedad,
      activo: stock === "Agotada" ? false : activo,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
      .from("productos")
      .update(updates)
      .eq("id", productId);

    if (error) throw error;

    // Actualizar producto en estado local
    Object.assign(prod, updates);

    calculateStats();
    applyFilters();
    if (state.activeTab === "portada") {
      renderPortadaView();
    }

    closeEditProductModal();
    showToast("Joya Actualizada", `"${titulo.slice(0, 30)}..." se guardó con éxito.`, "success");

  } catch (err) {
    console.error("Error al guardar cambios:", err);
    showToast("Error al guardar", err.message || "No se pudo actualizar la joya.", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = origBtnContent;
    lucide.createIcons();
  }
}

// ==============================================================================
// SISTEMA DE SEGURIDAD Y PIN DE ACCESO
// ==============================================================================
const DEFAULT_PINS = ["9250", "yamiki925", "1234"];
const STORAGE_AUTH_KEY = "yamiki_admin_authenticated";
const STORAGE_CUSTOM_PIN_KEY = "yamiki_admin_custom_pin";

function getActivePins() {
  const custom = localStorage.getItem(STORAGE_CUSTOM_PIN_KEY);
  return custom ? [custom, ...DEFAULT_PINS] : DEFAULT_PINS;
}

function checkAdminAuth() {
  const isAuth = sessionStorage.getItem(STORAGE_AUTH_KEY) === "true";
  const lockScreen = document.getElementById("admin-lock-screen");
  if (!lockScreen) return;

  if (isAuth) {
    lockScreen.classList.add("hidden");
  } else {
    lockScreen.classList.remove("hidden");
    const pinInput = document.getElementById("admin-pin-input");
    if (pinInput) {
      setTimeout(() => pinInput.focus(), 150);
    }
  }
}

function handlePinSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("admin-pin-input");
  const errorMsg = document.getElementById("pin-error-msg");
  const lockScreen = document.getElementById("admin-lock-screen");
  const val = input.value.trim();

  const validPins = getActivePins();
  if (validPins.includes(val)) {
    sessionStorage.setItem(STORAGE_AUTH_KEY, "true");
    if (errorMsg) errorMsg.classList.add("hidden");
    lockScreen.classList.add("hidden");
    input.value = "";
    showToast("Bienvenido", "Panel de administración desbloqueado.", "success");
    if (state.products.length === 0) {
      checkAdminAuth();
  loadProductsFromSupabase();
    }
  } else {
    if (errorMsg) {
      errorMsg.textContent = "PIN incorrecto. Intenta con 9250 o tu clave.";
      errorMsg.classList.remove("hidden");
    }
    input.classList.add("border-rose-500", "animate-shake");
    setTimeout(() => input.classList.remove("border-rose-500", "animate-shake"), 600);
    input.value = "";
    input.focus();
  }
}

function lockAdminPanel() {
  sessionStorage.removeItem(STORAGE_AUTH_KEY);
  const lockScreen = document.getElementById("admin-lock-screen");
  if (lockScreen) {
    lockScreen.classList.remove("hidden");
    const pinInput = document.getElementById("admin-pin-input");
    if (pinInput) {
      pinInput.value = "";
      pinInput.focus();
    }
  }
  showToast("Sesión Cerrada", "El panel ha sido bloqueado.", "success");
}

function togglePinVisibility() {
  const input = document.getElementById("admin-pin-input");
  const icon = document.getElementById("pin-eye-icon");
  if (!input) return;
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  if (icon) {
    icon.setAttribute("data-lucide", isPassword ? "eye-off" : "eye");
    lucide.createIcons();
  }
}
