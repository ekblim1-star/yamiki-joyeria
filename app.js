// Helper defensivo para renderizar iconos Lucide sin riesgo de ReferenceError si falla CDN
function safeCreateIcons() {
  try {
    if (typeof window !== "undefined" && window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  } catch (err) {}
}
window.safeCreateIcons = safeCreateIcons;

// Fallback universal SVG para Yamiki (Ligero, elegante, 100% offline, sin dependencias externas)
const YAMIKI_FALLBACK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400' width='100%25' height='100%25'%3E%3Crect width='400' height='400' fill='%23121214'/%3E%3Cg transform='translate(150, 130)' stroke='%23f472b6' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='50 10 90 40 50 90 10 40'/%3E%3Cline x1='10' y1='40' x2='90' y2='40'/%3E%3Cline x1='50' y1='10' x2='50' y2='90'/%3E%3Cpolyline points='25 25 50 40 75 25'/%3E%3Cline x1='50' y1='40' x2='25' y2='65'/%3E%3Cline x1='50' y1='40' x2='75' y2='65'/%3E%3C/g%3E%3Ctext x='200' y='255' text-anchor='middle' fill='%23e4e4e7' font-family='system-ui, -apple-system, sans-serif' font-size='13' font-weight='700' letter-spacing='2'%3EYAMIKI JOYER%C3%8DA%3C/text%3E%3Ctext x='200' y='275' text-anchor='middle' fill='%23a1a1aa' font-family='system-ui, -apple-system, sans-serif' font-size='10' font-weight='500' letter-spacing='1.5'%3EPLATA LEY S925%3C/text%3E%3C/svg%3E";
window.YAMIKI_FALLBACK_SVG = YAMIKI_FALLBACK_SVG;

// Manejador inteligente de fallos de red en fotos móviles (reintento automático + fallback elegante)
function handleProductImageError(img) {
  if (!img) return;
  if (img.src && img.src.startsWith("data:")) {
    img.onerror = null;
    return;
  }
  const retries = parseInt(img.getAttribute("data-img-retries") || "0", 10);
  if (retries < 2) {
    img.setAttribute("data-img-retries", String(retries + 1));
    const origSrc = img.getAttribute("data-orig-src") || img.src;
    img.setAttribute("data-orig-src", origSrc);
    setTimeout(() => {
      if (!img) return;
      const cleanSrc = origSrc.replace(/[?&]_r=\d+/, "");
      const sep = cleanSrc.includes("?") ? "&" : "?";
      img.src = `${cleanSrc}${sep}_r=${Date.now()}`;
    }, 1200);
  } else {
    img.onerror = null;
    img.src = YAMIKI_FALLBACK_SVG;
  }
}
window.handleProductImageError = handleProductImageError;

// ==============================================================================
// UTILIDADES DEFENSIVAS: XSS, SANITIZACIÓN Y LÍMITES ANTI-BOTS
// ==============================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.escapeHtml = escapeHtml;

function sanitizeOrderText(str, maxLen = 100) {
  if (!str) return "";
  return String(str)
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>{}|\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
window.sanitizeOrderText = sanitizeOrderText;

const CART_LIMITS = {
  MAX_PIECES_PER_ITEM: 10,
  MAX_DISTINCT_ITEMS: 25,
  MAX_TOTAL_ORDER_PIECES: 50,
  ORDER_COOLDOWN_MS: 15000 // 15s de espera mínima entre pedidos
};
window.CART_LIMITS = CART_LIMITS;

// ==============================================================================
// CLOUDFLARE TURNSTILE (PROTECCIÓN INTELIGENTE ANTI-BOTS)
// ==============================================================================
const TURNSTILE_CONFIG = {
  // Clave Managed Challenge oficial de Cloudflare (Verificación invisible para humanos)
  siteKey: window.__TURNSTILE_SITEKEY__ || "0x4AAAAAAF9gfgvKUxWuBR2p",
  enabled: true
};
window.TURNSTILE_CONFIG = TURNSTILE_CONFIG;

let checkoutTurnstileWidgetId = null;
let checkoutTurnstileRetries = 0;

function initCheckoutTurnstile() {
  if (!TURNSTILE_CONFIG.enabled) return;
  const container = document.getElementById("turnstile-checkout-widget");
  if (!container) return;

  if (typeof turnstile !== "undefined" && typeof turnstile.render === "function") {
    checkoutTurnstileRetries = 0;
    if (checkoutTurnstileWidgetId === null) {
      try {
        checkoutTurnstileWidgetId = turnstile.render("#turnstile-checkout-widget", {
          sitekey: TURNSTILE_CONFIG.siteKey,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          size: "flexible",
          callback: function(token) {
            state.turnstileToken = token;
          },
          "expired-callback": function() {
            state.turnstileToken = null;
          },
          "error-callback": function() {
            state.turnstileToken = "bypassed_network_fallback";
          }
        });
      } catch (err) {
        console.warn("[Turnstile Checkout] Error renderizando widget:", err);
      }
    }
  } else if (checkoutTurnstileRetries < 5) {
    checkoutTurnstileRetries++;
    setTimeout(initCheckoutTurnstile, 500);
  }
}
window.initCheckoutTurnstile = initCheckoutTurnstile;




// ==============================================================================
// SINCRONIZACIÓN EN VIVO CON SUPABASE (CATÁLOGO DINÁMICO PROTEGIDO)
// ==============================================================================
const SUPABASE_STORE_CONFIG = window.__SUPABASE_CONFIG__ || {
  url: "https://nlpsvjweybdmkmrkfkyy.supabase.co",
  anonKey: "sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P"
};

async function syncProductsFromSupabase() {
  if (!window.supabase) return;
  try {
    const client = window.supabase.createClient(SUPABASE_STORE_CONFIG.url, SUPABASE_STORE_CONFIG.anonKey);
    const { data, error } = await client
      .from("catalogo_tienda")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (data && data.length > 0) {
      // 1. Agrupar filas de Supabase por id_aliexpress (diseño familiar)
      const groupMap = new Map();

      data.forEach(row => {
        const groupId = String(row.id_aliexpress || row.id);
        if (!groupMap.has(groupId)) {
          groupMap.set(groupId, []);
        }
        groupMap.get(groupId).push(row);
      });

      const liveProducts = [];

      groupMap.forEach((rows, groupId) => {
        // Ordenar variantes: disponibles primero
        const primaryRow = rows.find(r => r.activo !== false && r.estado_stock !== "Agotada") || rows[0];
        const isRing = primaryRow.categoria === "anillos" || (primaryRow.titulo && primaryRow.titulo.toLowerCase().includes("anillo"));

        // Procesar variantes
        const variants = rows.map((vRow, vIdx) => {
          let vSizes = ["Ajustable"];
          let vDisplaySizes = "Ajustable";
          if (vRow.tallas && typeof vRow.tallas === "string") {
            const raw = vRow.tallas.trim();
            if (raw.toLowerCase().includes("ajustable") || raw.toLowerCase().includes("redimensionable") || raw.toLowerCase().includes("sin talla") || raw.toLowerCase().includes("única")) {
              vSizes = ["Ajustable"];
              vDisplaySizes = "Ajustable";
            } else {
              const cleanT = raw.replace(/\(.*?agotad.*?\)/gi, "").trim();
              const extracted = cleanT.match(/\b\d+(\.\d+)?\b/g);
              if (extracted && extracted.length > 0) {
                vSizes = extracted;
                vDisplaySizes = extracted.join(" - ");
              }
            }
          }

          const vAgotado = vRow.estado_stock === "Agotada" || vRow.activo === false;
          const vPrice = parseFloat(vRow.precio_venta) || 350;

          // Parsear precio original si existe en especificaciones o calcular si es oferta
          let vOriginalPrice = null;
          if (vRow.especificaciones) {
            const m = vRow.especificaciones.match(/\[?PrecioOriginal:\s*([\d.]+)\]?/i);
            if (m) vOriginalPrice = parseFloat(m[1]);
          }
          if (!vOriginalPrice && vRow.es_destacado) {
            vOriginalPrice = Math.round(vPrice * 1.25);
          }

          return {
            id: String(vRow.id),
            sku: vRow.codigo_sku || `YK-${vIdx + 1}`,
            color: vRow.color_modelo || "Modelo Principal",
            price: vPrice,
            originalPrice: vOriginalPrice,
            photo: vRow.foto_principal || YAMIKI_FALLBACK_SVG,
            sizes: vSizes,
            displaySizes: vDisplaySizes,
            stock: !vAgotado,
            badge: vRow.badge,
            isDiscount: vRow.es_destacado === true,
            isFeatured: vRow.es_novedad === true
          };
        });

        // 1. Recopilar fotos generales
        const rawGeneralGalleries = [];
        rows.forEach(r => {
          if (Array.isArray(r.galeria_fotos)) {
            r.galeria_fotos.forEach(u => {
              if (u && !rawGeneralGalleries.includes(u)) rawGeneralGalleries.push(u);
            });
          }
        });

        // 2. Determinar la foto de portada:
        // Si el admin asignó una foto principal, se respeta 100% de forma permanente.
        // Solo si está vacía, se toma foto_01 de la galería como fallback inicial.
        let coverPhoto = primaryRow.foto_principal;
        if (!coverPhoto) {
          const foto01 = rawGeneralGalleries.find(u => u && (u.includes("foto_01") || u.includes("foto_1.")));
          const cleanNonVar = rawGeneralGalleries.find(u => u && !u.includes("/variantes/"));
          coverPhoto = foto01 || cleanNonVar || primaryRow.foto_principal || (variants[0] ? variants[0].photo : "");
        }

        // 3. Galería consolidada con coverPhoto como primera foto (#1)
        const consolidatedGallery = [];
        if (coverPhoto) {
          consolidatedGallery.push(coverPhoto);
        }
        rawGeneralGalleries.forEach(u => {
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

        const activeVariants = variants.filter(v => v.stock);
        const minPrice = Math.min(...variants.map(v => v.price));
        const maxPrice = Math.max(...variants.map(v => v.price));
        const hasMultipleVariants = variants.length > 1;
        const hasDiscount = variants.some(v => v.isDiscount || (v.badge && v.badge.includes("%")));
        const isFeatured = variants.some(v => v.isFeatured);
        const allAgotado = variants.every(v => !v.stock);

        // Badge principal
        let mainBadge = "PLATA S925";
        if (hasDiscount) {
          mainBadge = primaryRow.badge || "🔥 -20% OFF";
        } else if (isFeatured) {
          mainBadge = "⭐ Novedad Destacada";
        } else if (allAgotado) {
          mainBadge = "Agotada";
        } else if (hasMultipleVariants) {
          mainBadge = `${variants.length} modelos`;
        }

        // Tallas consolidadas para filtro
        const allSizesSet = new Set();
        variants.forEach(v => v.sizes.forEach(s => allSizesSet.add(s)));
        const consolidatedSizes = Array.from(allSizesSet);

        // Precio original representativo
        const sampleVariantWithDiscount = variants.find(v => v.originalPrice) || variants[0];
        const repOriginalPrice = sampleVariantWithDiscount.originalPrice;

        let rawStone = (primaryRow.tipo_piedra || "").trim();
        const isStoneEmpty = !rawStone || ["ninguno", "ninguna", "none", "sin piedra", "no", "n/a"].includes(rawStone.toLowerCase());
        const cleanStone = isStoneEmpty ? null : rawStone;

        // Limpiar "Piedra: Ninguno" de notas/especificaciones
        let cleanNotes = primaryRow.especificaciones || null;
        if (cleanNotes) {
          cleanNotes = cleanNotes.replace(/Piedra:\s*Ningun[oa]\s*\|?/gi, "").trim();
          cleanNotes = cleanNotes.replace(/^[|\s]+|[|\s]+$/g, "").trim();
          if (!cleanNotes) cleanNotes = null;
        }

        liveProducts.push({
          id: String(primaryRow.id),
          groupId: groupId,
          code: primaryRow.codigo_sku || variants[0].sku,
          name: primaryRow.titulo,
          category: primaryRow.categoria || "anillos",
          stone: cleanStone,
          price: minPrice,
          maxPrice: maxPrice,
          originalPrice: repOriginalPrice,
          material: primaryRow.metal_material || "Plata Esterlina Ley S925",
          isRing: isRing,
          sizes: consolidatedSizes,
          displaySizes: variants[0].displaySizes,
          styleTag: "piedras",
          colors: variants.map(v => v.color).filter(c => c && c !== "Única"),
          isFeatured: isFeatured,
          hasDiscount: hasDiscount,
          hasMultipleVariants: hasMultipleVariants,
          badge: mainBadge,
          notes: cleanNotes,
          image: coverPhoto,
          description: primaryRow.descripcion || primaryRow.titulo,
          stock: !allAgotado,
          variants: variants,
          gallery: consolidatedGallery
        });
      });

      // Modificar el array global de productos en memoria
      PRODUCTS.splice(0, PRODUCTS.length, ...liveProducts);

      // Actualizar HERO_SHOWCASE dinámicamente con joyas reales
      if (typeof HERO_SHOWCASE !== "undefined" && Array.isArray(HERO_SHOWCASE) && liveProducts.length >= 4) {
        const featuredList = liveProducts.filter(p => p.isFeatured && p.stock);
        const heroPool = featuredList.length >= 4 ? featuredList : liveProducts.filter(p => p.stock);
        HERO_SHOWCASE.splice(0, HERO_SHOWCASE.length, ...heroPool.slice(0, 4).map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          src: p.image
        })));
      }

      console.log(`[Yamiki] Sincronizadas ${liveProducts.length} familias de joyas en vivo desde Supabase (${data.length} variantes).`);

      if (state.pendingProductRoute) {
        const pRoute = state.pendingProductRoute;
        state.pendingProductRoute = null;
        setTimeout(() => {
          navigateToProduct(pRoute.productId, pRoute.defaultSize, pRoute.defaultVariantId, { pushState: false });
        }, 50);
      }

    }
  } catch (err) {
    console.warn("[Yamiki] No se pudo sincronizar Supabase, usando catálogo local:", err);
  }
}

/**
 * ==============================================================================
 * APLICACIÓN PRINCIPAL DE JOYERÍA DE PLATA S925 - YAMIKI
 * ==============================================================================
 * Controla:
 * - Catálogo real de 141 piezas extraídas del catálogo oficial en Plata S925.
 * - Carrusel interactivo de "Novedades & Lo Más Reciente" con auto-reproducción.
 * - Filtros combinados:
 *     1. Categoría (Todos, Anillos, Collares, Aretes, Sets)
 *     2. Medida / Talla de Anillo (5, 6, 7, 8, 9, 10, Ajustable)
 *     3. Estilo / Color / Acabado (Zirconias, Multicolor, Iniciales A-Z, etc.)
 *     4. Ordenamiento por precio y código
 * - Carrito de compras interactivo con selección y edición de tallas en tiempo real.
 * - Modal y sección interactiva de "CÓMO TOMAR MEDIDAS DE ANILLOS".
 * - Generador de pedido por WhatsApp configurado al número: +52 993 290 2704.
 * ==============================================================================
 */

// Estado global de la aplicación
const state = {
  currentView: "home",
  currentCategory: "todos",
  selectedSizeFilter: "todas",
  selectedStyleFilter: "todos",
  searchQuery: "",
  sortBy: "default",
  currentPage: 1,
  itemsPerPage: 24,
  cart: [],
  selectedProductForModal: null,
  selectedModalSize: null,
  carouselIndex: 0,
  carouselTimer: null,
  heroIndex: 0,
  heroTimer: null,
  heroIsAnimating: false,
  heroIsMobile: typeof window !== "undefined" ? window.innerWidth < 640 : false,
  // Control de historial de navegación y restauración de scroll para modales
  isProductModalOpen: false,
  modalScrollPosition: 0,
  modalPushedHistory: false,
  isHistoryBackByModalClose: false,
  isGuideModalOpen: false,
  guideModalScrollPosition: 0,
  guideModalPushedHistory: false,
  isCartDrawerOpen: false,
  cartDrawerPushedHistory: false
};

const STORAGE_KEY = "yamiki_cart_s925_v3";

// ==============================================================================
// GESTIÓN DE MENÚ MÓVIL DIRECTO Y SEGURO
// ==============================================================================
function toggleMobileMenu(forceState) {
  const menu = document.getElementById("mobile-menu");
  if (!menu) return;
  if (typeof forceState === "boolean") {
    if (forceState) menu.classList.remove("hidden");
    else menu.classList.add("hidden");
  } else {
    menu.classList.toggle("hidden");
  }
}
window.toggleMobileMenu = toggleMobileMenu;

// ==============================================================================
// INICIALIZACIÓN CON BLINDAJE CONTRA ERRORES
// ==============================================================================
document.addEventListener("DOMContentLoaded", async () => {
  try { initTheme(); } catch (e) { console.error("Theme init error:", e); }
  try { loadCartFromStorage(); } catch (e) { console.error("Cart storage error:", e); }
  try { injectBusinessInfo(); } catch (e) { console.error("Business info error:", e); }
  try { await syncProductsFromSupabase(); } catch (e) { console.error("Supabase sync error:", e); }
  try { initHero3DCarousel(); } catch (e) { console.error("Hero init error:", e); }
  try { initCarousel(); } catch (e) { console.error("Carousel init error:", e); }
  try { renderCategories(); } catch (e) { console.error("Categories render error:", e); }
  try { renderSizeFilters(); } catch (e) { console.error("Size filters render error:", e); }
  try { renderStyleFilters(); } catch (e) { console.error("Style filters render error:", e); }
  try { renderProducts(); } catch (e) { console.error("Products render error:", e); }
  try { updateCartUI(); } catch (e) { console.error("Cart UI error:", e); }
  try { setupEventListeners(); } catch (e) { console.error("Event listeners error:", e); }
  try { safeCreateIcons(); } catch (e) { console.error("Lucide error:", e); }
  try { handleUrlRouting(); } catch (e) { console.error("URL routing error:", e); }
});

// Inyecta datos de configuración del negocio
function injectBusinessInfo() {
  document.querySelectorAll("[data-bind='brandName']").forEach(el => el.textContent = BUSINESS_CONFIG.brandName);
  document.querySelectorAll("[data-bind='slogan']").forEach(el => el.textContent = BUSINESS_CONFIG.slogan);
  document.querySelectorAll("[data-bind='topAnnouncement']").forEach(el => el.textContent = BUSINESS_CONFIG.topAnnouncement);
  document.querySelectorAll("[data-bind='phoneDisplay']").forEach(el => el.textContent = BUSINESS_CONFIG.phoneDisplay);
  document.querySelectorAll("[data-bind='email']").forEach(el => el.textContent = BUSINESS_CONFIG.email);
  document.querySelectorAll("[data-bind='location']").forEach(el => el.textContent = BUSINESS_CONFIG.location);
  document.querySelectorAll("[data-bind='schedule']").forEach(el => el.textContent = BUSINESS_CONFIG.schedule);
  document.querySelectorAll("[data-bind='instagram']").forEach(el => el.textContent = BUSINESS_CONFIG.instagram);

  const generalWhatsappLink = `https://api.whatsapp.com/send?phone=${BUSINESS_CONFIG.whatsappNumber}&text=${encodeURIComponent(`¡Hola ${BUSINESS_CONFIG.brandName}! Me gustaría consultar sobre su catálogo de joyería en Plata Ley S925.`)}`;
  document.querySelectorAll("[data-bind='whatsappGeneralLink']").forEach(el => {
    el.setAttribute("href", generalWhatsappLink);
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  });
}

// ==============================================================================
// CARRUSEL 3D HERO YAMIKI (ADAPTACIÓN DEL CONCEPTO TOONHUB)
// ==============================================================================
let HERO_SHOWCASE = [
  {
    id: 1,
    code: "A-01",
    name: "Anillo Flor en Plata S925",
    src: "img/products/A-01.jpg"
  },
  {
    id: 4,
    code: "A-04",
    name: "Anillo Zirconias Ajustable",
    src: "img/products/A-04.jpg"
  },
  {
    id: 37,
    code: "A-28",
    name: "Collar y Cadena Plata S925",
    src: "img/products/A-28.jpg"
  },
  {
    id: 2,
    code: "A-02",
    name: "Anillo Solitario S925",
    src: "img/products/A-02.jpg"
  }
];

let heroElements = [];

function initHero3DCarousel() {
  // Carrusel 3D de la pantalla de inicio deshabilitado a petición del usuario (fondo limpio)
  return;
}

function renderHeroRoles() {
  return;
}

function navigateHero(direction, userInitiated = true) {
  return;
}
// ==============================================================================
// CARRUSEL DE NOVEDADES & LO MÁS RECIENTE (LOOP INFINITO CONTINUO "TIPO INFINITO")
// ==============================================================================
const CAROUSEL_CLONES = 4;

function getFeaturedProducts() {
  const featured = PRODUCTS.filter(p => p.isFeatured);
  return featured.length > 0 ? featured : PRODUCTS.slice(0, 10);
}

// ==============================================================================
// GESTOR TÁCTIL Y DESLIZAMIENTO CON EL DEDO (SWIPE FLUIDO EN MÓVILES Y ARRASTRE PC)
// ==============================================================================
function enableSwipeGesture(element, onSwipeLeft, onSwipeRight, isCarousel = false) {
  if (!element) return;

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isSwiping = false;
  let startTime = 0;

  // Touch Events (Móvil)
  element.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length === 0) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = startX;
    currentY = startY;
    isSwiping = true;
    startTime = Date.now();
    if (isCarousel) stopCarouselAutoPlay();
  }, { passive: true });

  element.addEventListener("touchmove", (e) => {
    if (!isSwiping || !e.touches || e.touches.length === 0) return;
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
  }, { passive: true });

  element.addEventListener("touchend", () => {
    if (!isSwiping) return;
    isSwiping = false;

    const diffX = currentX - startX;
    const diffY = currentY - startY;
    const absX = Math.abs(diffX);
    const absY = Math.abs(diffY);

    // Si el deslizamiento horizontal es mayor al vertical y supera el umbral de 30px
    if (absX > 30 && absX > absY) {
      if (diffX < 0 && typeof onSwipeLeft === "function") {
        onSwipeLeft();
      } else if (diffX > 0 && typeof onSwipeRight === "function") {
        onSwipeRight();
      }
    } else if (isCarousel) {
      startCarouselAutoPlay();
    }
  }, { passive: true });

  element.addEventListener("touchcancel", () => {
    isSwiping = false;
    if (isCarousel) startCarouselAutoPlay();
  }, { passive: true });

  // Mouse Drag Events (Prueba en PC con ratón)
  let isMouseDown = false;
  let mouseStartX = 0;

  element.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isMouseDown = true;
    mouseStartX = e.clientX;
    if (isCarousel) stopCarouselAutoPlay();
  });

  element.addEventListener("mouseup", (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    const diffX = e.clientX - mouseStartX;
    if (Math.abs(diffX) > 35) {
      if (diffX < 0 && typeof onSwipeLeft === "function") {
        onSwipeLeft();
      } else if (diffX > 0 && typeof onSwipeRight === "function") {
        onSwipeRight();
      }
    } else if (isCarousel) {
      startCarouselAutoPlay();
    }
  });

  if (isCarousel) {
    // Pausar auto-play al posar cursor en el carrusel de inicio
    element.addEventListener("mouseenter", () => stopCarouselAutoPlay());
    element.addEventListener("mouseleave", () => startCarouselAutoPlay());
  }
}

function initCarousel() {
  const track = document.getElementById("carousel-track");
  const dotsContainer = document.getElementById("carousel-dots");
  if (!track) return;

  const featured = getFeaturedProducts();
  const N = featured.length;

  // Clones al inicio (los últimos CAROUSEL_CLONES) y al final (los primeros CAROUSEL_CLONES)
  const prepended = featured.slice(-CAROUSEL_CLONES);
  const appended = featured.slice(0, CAROUSEL_CLONES);
  const allSlides = [...prepended, ...featured, ...appended];

  // Iniciar en el primer elemento real (índice CAROUSEL_CLONES = 4)
  state.carouselIndex = CAROUSEL_CLONES;
  state.carouselIsAnimating = false;

  track.innerHTML = allSlides.map((prod, slideIdx) => `
    <div class="carousel-card p-1.5 sm:p-2.5" data-slide-index="${slideIdx}">
      <div class="bg-white rounded-xl sm:rounded-2xl border border-sage-100 overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 flex flex-col h-full group">
        
        <div class="relative aspect-square bg-[#f6f6f6] overflow-hidden cursor-pointer" onclick="navigateToProduct('${prod.id}')">
          <span class="product-badge absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 z-10 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full shadow-xs">
            ${prod.hasDiscount ? '🔥 Oferta' : 'Novedad'}
          </span>
          ${prod.hasDiscount && prod.originalPrice && prod.originalPrice > prod.price ? `
            <span class="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 z-10 text-[9px] sm:text-[11px] font-black tracking-wider px-2 py-0.5 rounded-full shadow-sm bg-[#e72380] text-white">
              -${Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100)}% OFF
            </span>
          ` : ''}
          
          <img 
            src="${prod.image}" 
            alt="${prod.name}" 
            loading="lazy" 
            decoding="async"
            class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            onerror="handleProductImageError(this)"
          />

          <div class="hidden sm:flex absolute inset-0 bg-black/20 dark:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 items-center justify-center">
            <span class="product-hover-badge text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i> Ver detalles
            </span>
          </div>

          <div class="silver-tag absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 px-1.5 py-0.5 sm:px-2 rounded text-[8px] sm:text-[10px] shadow-xs">
            PLATA S925
          </div>
        </div>

        <div class="p-2.5 sm:p-4 flex flex-col flex-grow justify-between">
          <div>
            <span class="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-rose-500 block mb-0.5 truncate">
              ${getCategoryLabel(prod.category)}
            </span>
            <h4 class="font-sans font-bold text-xs sm:text-sm text-gray-900 group-hover:text-sage-700 transition line-clamp-1 leading-snug" title="${escapeHtml(prod.name)}">
              ${escapeHtml(cleanOrderTitle(prod.name))}
            </h4>
            ${prod.displaySizes ? `<p class="text-[9px] sm:text-[11px] text-gray-500 mt-1 truncate">📏 <span class="size-pill-tag font-bold px-1.5 py-0.5 rounded">${escapeHtml(prod.displaySizes)}</span></p>` : ""}
            ${prod.notes ? `<p class="text-[9px] sm:text-[10px] text-rose-600 italic mt-0.5 line-clamp-1">✨ ${escapeHtml(prod.notes)}</p>` : ""}
          </div>

          <div class="pt-2 sm:pt-3 border-t border-gray-100 mt-2 flex items-center justify-between gap-1">
            <span class="text-xs sm:text-base font-bold text-sage-900 font-sans">${formatCurrency(prod.price)}</span>
            <button 
              onclick="handleQuickAddToCart('${prod.id}', event)"
              class="add-to-cart-btn btn-press px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold flex items-center gap-1 transition shadow-xs"
              title="Agregar al pedido"
            >
              <i data-lucide="shopping-bag" class="w-3.5 h-3.5 text-white"></i>
              <span class="font-bold text-white">${prod.isRing && prod.sizes && prod.sizes.length > 1 ? 'Elegir Talla' : '+ Agregar'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>`).join("");

  // Crear indicadores de puntos (para los productos reales)
  if (dotsContainer) {
    dotsContainer.innerHTML = featured.map((_, i) => `
      <button 
        onclick="goToCarouselSlide(${i})" 
        class="carousel-dot w-2 h-2 rounded-full transition-all duration-300 ${i === 0 ? 'bg-sage-600 w-5' : 'bg-gray-300'}"
        aria-label="Ir al slide ${i + 1}"
      ></button>
    `).join("");
  }

  // Posicionar track en el índice inicial sin animación
  requestAnimationFrame(() => {
    track.style.transition = "none";
    const card = track.querySelector(".carousel-card");
    if (card) {
      const cardWidth = card.getBoundingClientRect().width;
      track.style.transform = `translate3d(-${state.carouselIndex * cardWidth}px, 0, 0)`;
    }
    void track.offsetHeight;
    track.style.transition = "transform 380ms var(--ease-out)";
  });

  // Habilitar swipe táctil y arrastre con ratón
  enableSwipeGesture(track, () => nextCarouselSlide(true), () => prevCarouselSlide(true), true);

  startCarouselAutoPlay();
}

function updateCarouselPosition(animate = true) {
  const track = document.getElementById("carousel-track");
  const dots = document.querySelectorAll(".carousel-dot");
  if (!track) return;

  const card = track.querySelector(".carousel-card");
  if (!card) return;

  const cardWidth = card.getBoundingClientRect().width;
  if (!animate) {
    track.style.transition = "none";
  } else {
    track.style.transition = "transform 380ms var(--ease-out)";
  }
  track.style.transform = `translate3d(-${state.carouselIndex * cardWidth}px, 0, 0)`;

  if (!animate) {
    void track.offsetHeight;
    track.style.transition = "transform 380ms var(--ease-out)";
  }

  // Actualizar indicadores de puntos normalizados
  const featured = getFeaturedProducts();
  const N = featured.length || 10;
  const activeDotIndex = ((state.carouselIndex - CAROUSEL_CLONES) % N + N) % N;

  dots.forEach((dot, idx) => {
    if (idx === activeDotIndex) {
      dot.className = "carousel-dot w-5 h-2 rounded-full bg-sage-600 transition-all duration-300";
    } else {
      dot.className = "carousel-dot w-2 h-2 rounded-full bg-gray-300 transition-all duration-300";
    }
  });
}

function nextCarouselSlide(userInitiated = false) {
  if (state.carouselIsAnimating) return;
  const track = document.getElementById("carousel-track");
  if (!track) return;

  const featured = getFeaturedProducts();
  const N = featured.length;
  const snapIndex = CAROUSEL_CLONES + N; // 4 + 10 = 14

  state.carouselIsAnimating = true;
  state.carouselIndex++;
  updateCarouselPosition(true);

  if (userInitiated) {
    resetCarouselTimer();
  }

  // Cuando llegamos al clone 14 (idéntico al 4), al terminar la transición reseteamos instantáneamente a 4
  if (state.carouselIndex >= snapIndex) {
    setTimeout(() => {
      state.carouselIndex = CAROUSEL_CLONES; // 4
      updateCarouselPosition(false);
      state.carouselIsAnimating = false;
    }, 390);
  } else {
    setTimeout(() => {
      state.carouselIsAnimating = false;
    }, 390);
  }
}

function prevCarouselSlide(userInitiated = false) {
  if (state.carouselIsAnimating) return;
  const track = document.getElementById("carousel-track");
  if (!track) return;

  const featured = getFeaturedProducts();
  const N = featured.length;
  const snapMinIndex = CAROUSEL_CLONES - 1; // 3

  state.carouselIsAnimating = true;
  state.carouselIndex--;
  updateCarouselPosition(true);

  if (userInitiated) {
    resetCarouselTimer();
  }

  // Si nos deslizamos a la izquierda hasta el clone 3 (idéntico al 13), reseteamos instantáneamente a 13
  if (state.carouselIndex <= snapMinIndex) {
    setTimeout(() => {
      state.carouselIndex = CAROUSEL_CLONES + N - 1; // 4 + 10 - 1 = 13
      updateCarouselPosition(false);
      state.carouselIsAnimating = false;
    }, 390);
  } else {
    setTimeout(() => {
      state.carouselIsAnimating = false;
    }, 390);
  }
}

function goToCarouselSlide(dotIndex) {
  if (state.carouselIsAnimating) return;
  state.carouselIndex = CAROUSEL_CLONES + dotIndex;
  updateCarouselPosition(true);
  resetCarouselTimer();
}

function startCarouselAutoPlay() {
  stopCarouselAutoPlay();
  state.carouselTimer = setInterval(() => {
    nextCarouselSlide(false);
  }, 4200);
}

function stopCarouselAutoPlay() {
  if (state.carouselTimer) {
    clearInterval(state.carouselTimer);
    state.carouselTimer = null;
  }
}

function resetCarouselTimer() {
  startCarouselAutoPlay();
}

// ==============================================================================
// SISTEMA DE FILTROS MODERNOS Y DESPLEGABLES ("QUE SE ABREN")
// ==============================================================================
function toggleFilterDropdown(type, event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById(`dropdown-menu-${type}`);
  const btn = document.getElementById(`filter-btn-${type}`);
  if (!menu || !btn) return;

  const isAlreadyOpen = !menu.classList.contains("hidden");

  // Cerrar todos los demás menús antes de abrir el solicitado
  closeAllFilterDropdowns();

  if (!isAlreadyOpen) {
    renderFilterDropdownOptions(type);
    menu.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    safeCreateIcons();
  }
}

function closeAllFilterDropdowns() {
  document.querySelectorAll(".filter-dropdown-menu").forEach(menu => {
    menu.classList.add("hidden");
  });
  document.querySelectorAll(".dropdown-filter-btn").forEach(btn => {
    btn.setAttribute("aria-expanded", "false");
  });
}

function renderFilterDropdownOptions(type) {
  if (type === "category") {
    const menu = document.getElementById("dropdown-menu-category");
    if (!menu) return;

    menu.innerHTML = `
      <div class="px-2 py-1.5 text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100 mb-1">
        Selecciona una Categoría
      </div>
      <div class="space-y-1">
        ${CATEGORIES.map(cat => {
          const isActive = cat.id === state.currentCategory;
          return `
            <button 
              type="button"
              onclick="selectCategoryFilter('${cat.id}')"
              class="w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 transition hover:bg-sage-50 btn-press ${isActive ? 'bg-sage-100 text-sage-900 font-bold' : 'text-gray-700'}"
            >
              <span class="flex items-center gap-2 truncate">
                <i data-lucide="${cat.icon}" class="w-4 h-4 text-sage-600 shrink-0"></i>
                <span class="truncate">${cat.label}</span>
              </span>
              ${isActive ? '<i data-lucide="check" class="w-4 h-4 text-sage-700 shrink-0"></i>' : ''}
            </button>
          `;
        }).join("")}
      </div>
    `;
  } else if (type === "size") {
    const menu = document.getElementById("dropdown-menu-size");
    if (!menu) return;

    const isAllActive = state.selectedSizeFilter === "todas";
    const isAdjActive = state.selectedSizeFilter === "Ajustable";
    const numericSizes = RING_SIZES.filter(s => s.id !== "todas" && s.id !== "Ajustable");

    menu.innerHTML = `
      <div class="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
        <span class="text-[10px] uppercase font-bold text-gray-400">Medida de Anillo</span>
        <button 
          type="button"
          onclick="openRingSizeGuideModal(); closeAllFilterDropdowns();"
          class="text-xs text-rose-500 hover:text-rose-700 font-semibold underline flex items-center gap-1"
        >
          <i data-lucide="help-circle" class="w-3 h-3"></i> ¿Cómo medir?
        </button>
      </div>

      <!-- Opción: Todas las medidas -->
      <button 
        type="button"
        onclick="selectSizeFilter('todas')"
        class="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 mb-2 transition hover:bg-rose-50 btn-press ${isAllActive ? 'bg-rose-100 text-rose-900' : 'text-gray-700 bg-gray-50'}"
      >
        <span>Todas las medidas</span>
        ${isAllActive ? '<i data-lucide="check" class="w-4 h-4 text-rose-600 shrink-0"></i>' : ''}
      </button>

      <!-- Cuadrícula de Tallas 5 a 13 -->
      <div class="grid grid-cols-3 gap-1.5 mb-2">
        ${numericSizes.map(sz => {
          const isActive = state.selectedSizeFilter === sz.id;
          return `
            <button 
              type="button"
              onclick="selectSizeFilter('${sz.id}')"
              class="px-2 py-2 rounded-xl text-xs font-semibold border text-center transition btn-press flex flex-col items-center justify-center ${isActive ? 'bg-rose-500 text-white border-rose-500 shadow-xs' : 'bg-white hover:bg-rose-50 text-gray-800 border-gray-200'}"
            >
              <span class="leading-none text-xs">Talla ${sz.id}</span>
              <span class="text-[9px] opacity-75 leading-tight mt-0.5">${sz.label.replace(/.*\(|\).*/g, '')}</span>
            </button>
          `;
        }).join("")}
      </div>

      <!-- Opción: Ajustable -->
      <button 
        type="button"
        onclick="selectSizeFilter('Ajustable')"
        class="w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition btn-press ${isAdjActive ? 'bg-rose-500 text-white font-bold' : 'bg-rose-50/70 hover:bg-rose-100 text-rose-700 border border-rose-200'}"
      >
        <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
        <span>✨ Medida Ajustable (Universal)</span>
      </button>
    `;
  } else if (type === "style") {
    const menu = document.getElementById("dropdown-menu-style");
    if (!menu) return;

    menu.innerHTML = `
      <div class="px-2 py-1.5 text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100 mb-1">
        Filtrar por Estilo y Acabado
      </div>
      <div class="space-y-1">
        ${STYLE_FILTERS.map(st => {
          const isActive = state.selectedStyleFilter === st.id;
          return `
            <button 
              type="button"
              onclick="selectStyleFilter('${st.id}')"
              class="w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 transition hover:bg-amber-50 btn-press ${isActive ? 'bg-amber-100 text-amber-900 font-bold' : 'text-gray-700'}"
            >
              <span class="truncate">${st.label}</span>
              ${isActive ? '<i data-lucide="check" class="w-4 h-4 text-amber-700 shrink-0"></i>' : ''}
            </button>
          `;
        }).join("")}
      </div>
    `;
  } else if (type === "sort") {
    const menu = document.getElementById("dropdown-menu-sort");
    if (!menu) return;

    const sortOptions = [
      { id: "default", label: "✨ Recomendados" },
      { id: "price-asc", label: "💵 Precio: Menor a Mayor" },
      { id: "price-desc", label: "💎 Precio: Mayor a Menor" },
      { id: "code-asc", label: "🔤 Código (A-01 → A-141)" }
    ];

    menu.innerHTML = `
      <div class="px-2 py-1.5 text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100 mb-1">
        Ordenar Catálogo
      </div>
      <div class="space-y-1">
        ${sortOptions.map(opt => {
          const isActive = state.sortBy === opt.id;
          return `
            <button 
              type="button"
              onclick="selectSortFilter('${opt.id}')"
              class="w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between gap-2 transition hover:bg-sage-50 btn-press ${isActive ? 'bg-sage-100 text-sage-900 font-bold' : 'text-gray-700'}"
            >
              <span class="truncate">${opt.label}</span>
              ${isActive ? '<i data-lucide="check" class="w-4 h-4 text-sage-700 shrink-0"></i>' : ''}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }
}

function updateFilterTriggerLabels() {
  // 1. Categoría
  const catLabelEl = document.getElementById("filter-label-category");
  const catBtnEl = document.getElementById("filter-btn-category");
  if (catLabelEl && catBtnEl) {
    if (state.currentCategory === "todos") {
      catLabelEl.textContent = "Todas las piezas";
      catBtnEl.classList.remove("filter-active");
    } else {
      catLabelEl.textContent = getCategoryLabel(state.currentCategory);
      catBtnEl.classList.add("filter-active");
    }
  }

  // 2. Talla de Anillo
  const sizeLabelEl = document.getElementById("filter-label-size");
  const sizeBtnEl = document.getElementById("filter-btn-size");
  if (sizeLabelEl && sizeBtnEl) {
    if (state.selectedSizeFilter === "todas") {
      sizeLabelEl.textContent = "Todas las tallas";
      sizeBtnEl.classList.remove("filter-active");
    } else if (state.selectedSizeFilter === "Ajustable") {
      sizeLabelEl.textContent = "✨ Ajustable";
      sizeBtnEl.classList.add("filter-active");
    } else {
      sizeLabelEl.textContent = `Talla ${state.selectedSizeFilter}`;
      sizeBtnEl.classList.add("filter-active");
    }
  }

  // 3. Estilo / Color
  const styleLabelEl = document.getElementById("filter-label-style");
  const styleBtnEl = document.getElementById("filter-btn-style");
  if (styleLabelEl && styleBtnEl) {
    if (state.selectedStyleFilter === "todos") {
      styleLabelEl.textContent = "Todos los acabados";
      styleBtnEl.classList.remove("filter-active");
    } else {
      const found = STYLE_FILTERS.find(s => s.id === state.selectedStyleFilter);
      styleLabelEl.textContent = found ? found.label.replace(/\s*\(.*\)/, '').trim() : "Estilo activo";
      styleBtnEl.classList.add("filter-active");
    }
  }

  // 4. Orden
  const sortLabelEl = document.getElementById("filter-label-sort");
  const sortBtnEl = document.getElementById("filter-btn-sort");
  if (sortLabelEl && sortBtnEl) {
    const sortLabels = {
      "default": "Recomendados",
      "price-asc": "Menor Precio",
      "price-desc": "Mayor Precio",
      "code-asc": "Código A-01"
    };
    sortLabelEl.textContent = sortLabels[state.sortBy] || "Recomendados";
    if (state.sortBy !== "default") {
      sortBtnEl.classList.add("filter-active");
    } else {
      sortBtnEl.classList.remove("filter-active");
    }
  }

  // Botón de limpiar búsqueda
  const clearBtn = document.getElementById("search-clear-btn");
  if (clearBtn) {
    if (state.searchQuery && state.searchQuery.trim().length > 0) {
      clearBtn.classList.remove("hidden");
    } else {
      clearBtn.classList.add("hidden");
    }
  }
}

// ==============================================================================
// SISTEMA DE RUTAS Y NAVEGACIÓN LIMPIA (SPA ROUTER)
// ==============================================================================

/**
 * Actualiza el indicador visual de pestaña activa en el navbar fijo superior
 */
function updateNavTabsHighlight() {
  const current = state.currentView;
  const navHome = document.getElementById("nav-link-home");
  const navCat = document.getElementById("nav-link-catalogo");
  const navOfertas = document.getElementById("nav-link-ofertas");
  const navTallas = document.getElementById("nav-link-tallas");
  const navGarantia = document.getElementById("nav-link-garantia");
  const navNosotros = document.getElementById("nav-link-nosotros");

  const setTab = (el, active) => {
    if (!el) return;
    if (active) {
      el.classList.add("active-nav-tab");
      el.classList.remove("border-transparent");
    } else {
      el.classList.remove("active-nav-tab");
      el.classList.add("border-transparent");
    }
  };

  const isOfertas = current === "catalogo" && state.currentCategory === "ofertas";

  setTab(navHome, current === "home");
  setTab(navCat, current === "catalogo" && !isOfertas);
  setTab(navOfertas, isOfertas);
  setTab(navTallas, current === "guia-tallas");
  setTab(navGarantia, current === "garantia");
  setTab(navNosotros, current === "nosotros");
}

/**
 * Actualiza la insignia (badge) de la categoría activa en la barra de breadcrumbs del catálogo
 */
function updateBreadcrumbCategoryBadge() {
  const badge = document.getElementById("breadcrumb-category-badge");
  if (!badge) return;

  if (state.currentCategory && state.currentCategory !== "todos") {
    const catLabel = getCategoryLabel(state.currentCategory);
    badge.innerHTML = `
      <span>${catLabel}</span>
      <button 
        type="button" 
        onclick="clearCategoryFilter(event)" 
        class="ml-1 hover:text-rose-800 dark:hover:text-white transition rounded-full p-0.5"
        title="Quitar filtro y ver todas las categorías"
      >
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    `;
    badge.classList.remove("hidden");
    badge.classList.add("flex");
  } else {
    badge.classList.add("hidden");
    badge.classList.remove("flex");
    badge.innerHTML = "";
  }
}

/**
 * Remueve el filtro de categoría y muestra todas las piezas del catálogo
 */
function clearCategoryFilter(event) {
  if (event) event.stopPropagation();
  selectCategoryFilter("todos");
  history.replaceState(null, "", "/catalogo");
}

/**
 * Navega de forma limpia y fluida entre todas las subpáginas dedicadas de Yamiki
 * @param {string} viewName - "home" | "catalogo" | "producto" | "garantia" | "guia-tallas" | "nosotros"
 * @param {object} options - { category, scrollTo, pushState, restoreScroll }
 */
function navigateTo(viewName, options = {}) {
  let targetView = "home";
  const v = (viewName || "").toLowerCase().trim();
  if (v === "catalogo" || v === "catalog") {
    targetView = "catalogo";
  } else if (v === "producto" || v === "product") {
    targetView = "producto";
  } else if (v === "garantia") {
    targetView = "garantia";
  } else if (v === "guia-tallas" || v === "tallas") {
    targetView = "guia-tallas";
  } else if (v === "nosotros") {
    targetView = "nosotros";
  }
  state.currentView = targetView;

  const views = {
    home: document.getElementById("view-home"),
    catalogo: document.getElementById("view-catalogo"),
    producto: document.getElementById("view-producto"),
    garantia: document.getElementById("view-garantia"),
    "guia-tallas": document.getElementById("view-guia-tallas"),
    nosotros: document.getElementById("view-nosotros")
  };

  Object.entries(views).forEach(([name, el]) => {
    if (!el) return;
    if (name === targetView) {
      el.classList.remove("hidden");
      el.classList.add("page-view");
    } else {
      el.classList.add("hidden");
    }
  });

  if (targetView === "home") {
    if (typeof startHeroAutoPlay === "function") startHeroAutoPlay();
    if (typeof startCarouselAutoPlay === "function") startCarouselAutoPlay();

    document.title = "Yamiki Joyería | Plata Esterlina Ley S925";

    if (options.pushState !== false) {
      if (options.scrollTo) {
        history.pushState(null, "", `/#${options.scrollTo}`);
      } else {
        history.pushState(null, "", "/");
      }
    }

    if (options.scrollTo) {
      setTimeout(() => {
        const targetEl = document.getElementById(options.scrollTo);
        if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

  } else if (targetView === "catalogo") {
    if (typeof stopHeroAutoPlay === "function") stopHeroAutoPlay();
    if (typeof stopCarouselAutoPlay === "function") stopCarouselAutoPlay();

    if (options.category) {
      state.currentCategory = options.category;
      state.currentPage = 1;
    }

    updateBreadcrumbCategoryBadge();
    closeAllFilterDropdowns();
    updateFilterTriggerLabels();
    renderProducts();

    const cat = state.currentCategory;
    if (cat === "anillos") {
      document.title = "Anillos en Plata Ley S925 | Yamiki Joyería";
    } else if (cat === "aretes") {
      document.title = "Aretes y Pendientes en Plata S925 | Yamiki Joyería";
    } else if (cat === "collares") {
      document.title = "Collares y Cadenas en Plata S925 | Yamiki Joyería";
    } else if (cat === "pulseras") {
      document.title = "Pulseras en Plata Ley S925 | Yamiki Joyería";
    } else if (cat === "ofertas") {
      document.title = "Ofertas y Promociones Activas | Yamiki Joyería";
    } else {
      document.title = "Catálogo Oficial de Joyería S925 | Yamiki Joyería";
    }

    if (options.pushState !== false) {
      if (cat && cat !== "todos" && ["anillos", "aretes", "collares", "pulseras", "ofertas"].includes(cat)) {
        history.pushState(null, "", `/${cat}`);
      } else if (cat && cat !== "todos") {
        history.pushState(null, "", `/catalogo?categoria=${cat}`);
      } else {
        history.pushState(null, "", "/catalogo");
      }
    }

    if (options.scrollTo) {
      setTimeout(() => {
        const targetEl = document.getElementById(options.scrollTo);
        if (targetEl) targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } else if (!options.restoreScroll) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

  } else if (targetView === "producto") {
    if (typeof stopHeroAutoPlay === "function") stopHeroAutoPlay();
    if (typeof stopCarouselAutoPlay === "function") stopCarouselAutoPlay();
    window.scrollTo({ top: 0, behavior: "instant" });

  } else if (targetView === "garantia") {
    if (typeof stopHeroAutoPlay === "function") stopHeroAutoPlay();
    if (typeof stopCarouselAutoPlay === "function") stopCarouselAutoPlay();
    document.title = "Garantía Oficial y Pureza S925 | Yamiki Joyería";
    if (options.pushState !== false) {
      history.pushState(null, "", "/garantia");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

  } else if (targetView === "guia-tallas") {
    if (typeof stopHeroAutoPlay === "function") stopHeroAutoPlay();
    if (typeof stopCarouselAutoPlay === "function") stopCarouselAutoPlay();
    document.title = "Guía Oficial de Tallas y Medidas de Anillos | Yamiki Joyería";
    if (options.pushState !== false) {
      history.pushState(null, "", "/guia-tallas");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

  } else if (targetView === "nosotros") {
    if (typeof stopHeroAutoPlay === "function") stopHeroAutoPlay();
    if (typeof stopCarouselAutoPlay === "function") stopCarouselAutoPlay();
    document.title = "Sobre Nosotros y Compromiso S925 | Yamiki Joyería";
    if (options.pushState !== false) {
      history.pushState(null, "", "/nosotros");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  updateNavTabsHighlight();
  safeCreateIcons();
}

/**
 * Escucha cambios en la URL (subpáginas limpias, popstate, hash de compatibilidad y botones Atrás/Adelante)
 */
function handleUrlRouting(event) {
  // 1. Si el popstate fue originado por nuestro propio history.back() al cerrar con la X o UI
  if (state.isHistoryBackByModalClose) {
    state.isHistoryBackByModalClose = false;
    const savedY = state.modalScrollPosition;
    if (typeof savedY === "number") {
      window.scrollTo({ top: savedY, behavior: "instant" });
      requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: "instant" }));
    }
    return;
  }

  // 2. Si el visor Lightbox de infografías está abierto, cerrarlo sin cambiar de página
  const lightboxModal = document.getElementById("lightbox-modal");
  const isLightboxOpen = lightboxModal && !lightboxModal.classList.contains("hidden") && lightboxModal.style.display !== "none";
  if (isLightboxOpen) {
    closeLightbox();
    return;
  }

  // 3. Si la guía de medidas modal está abierta, cerrarla y volver al modal o vista previa
  const guideModal = document.getElementById("ring-size-guide-modal");
  const isGuideModalOpen = state.isGuideModalOpen || (guideModal && !guideModal.classList.contains("hidden") && guideModal.style.display !== "none");
  if (isGuideModalOpen) {
    const savedY = state.guideModalScrollPosition;
    state.guideModalPushedHistory = false;
    closeRingSizeGuideModal(false);
    if (typeof savedY === "number" && !state.isProductModalOpen) {
      window.scrollTo({ top: savedY, behavior: "instant" });
      requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: "instant" }));
    }
    return;
  }

  // 4. Si el modal de producto está abierto, cerrarlo y restaurar EXACTAMENTE la posición de scroll
  const productModal = document.getElementById("product-modal");
  const isProductModalOpen = state.isProductModalOpen || (productModal && !productModal.classList.contains("hidden") && productModal.style.display !== "none");
  if (isProductModalOpen) {
    const savedY = state.modalScrollPosition;
    state.modalPushedHistory = false;
    closeProductModal(false);
    if (typeof savedY === "number") {
      window.scrollTo({ top: savedY, behavior: "instant" });
      requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: "instant" }));
      setTimeout(() => window.scrollTo({ top: savedY, behavior: "instant" }), 50);
    }
    return;
  }

  // 5. Si el carrito está abierto, cerrarlo y no salir de la tienda
  const cartDrawer = document.getElementById("cart-drawer");
  const isCartDrawerOpen = state.isCartDrawerOpen || (cartDrawer && !cartDrawer.classList.contains("hidden") && cartDrawer.style.display !== "none");
  if (isCartDrawerOpen) {
    state.cartDrawerPushedHistory = false;
    toggleCartDrawer(false, false);
    return;
  }

  // 6. Subpáginas limpias (Pathname prioritario + Hash de compatibilidad histórica)
  const rawPath = (window.location && window.location.pathname) ? window.location.pathname : "/";
  const pathname = rawPath.toLowerCase().replace(/\/+$/, "") || "/";
  const hash = (window.location && window.location.hash) || "";
  const search = (window.location && window.location.search) || "";

  // Detección de subpágina de producto (/joya/:slug o /producto/:slug o #/joya/:slug)
  let productSlug = null;
  const pathMatch = pathname.match(/^\/(joya|producto)\/([^/]+)/);
  if (pathMatch && pathMatch[2]) {
    productSlug = decodeURIComponent(pathMatch[2]);
  } else if (hash.startsWith("#/joya/") || hash.startsWith("#/producto/")) {
    productSlug = decodeURIComponent(hash.replace(/^#\/(joya|producto)\//, "").split("?")[0].trim());
  } else if (search.includes("id=") || hash.includes("id=")) {
    const match = (search + hash).match(/id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) productSlug = match[1];
  }

  if (productSlug) {
    navigateToProduct(productSlug, null, null, { pushState: false });
    return;
  }

  // Subpágina /garantia
  if (pathname === "/garantia" || hash === "#/garantia" || hash === "#garantia") {
    navigateTo("garantia", { pushState: false });
    return;
  }

  // Subpágina /guia-tallas
  if (pathname === "/guia-tallas" || pathname === "/tallas" || hash === "#/guia-tallas" || hash === "#guia-tallas") {
    navigateTo("guia-tallas", { pushState: false });
    return;
  }

  // Subpágina /nosotros
  if (pathname === "/nosotros" || pathname === "/sobre-nosotros" || hash === "#/nosotros" || hash === "#nosotros") {
    navigateTo("nosotros", { pushState: false });
    return;
  }

  // Categorías directas con URL limpia (/anillos, /aretes, /collares, /pulseras, /ofertas, /sets)
  const directCats = ["anillos", "aretes", "collares", "pulseras", "ofertas", "sets"];
  const directCat = directCats.find(c => pathname === `/${c}` || hash === `#/${c}`);
  if (directCat) {
    navigateTo("catalogo", { category: directCat, pushState: false });
    return;
  }

  // Catálogo completo (/catalogo o #/catalogo)
  if (pathname === "/catalogo" || hash.startsWith("#/catalogo") || hash === "#catalogo") {
    let category = "todos";
    const query = search + hash;
    if (query.includes("categoria=")) {
      const match = query.match(/categoria=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) category = match[1];
    }
    navigateTo("catalogo", { category: category, pushState: false });
    return;
  }

  // Sección de novedades o carrusel en Home
  if (hash.includes("novedades-carousel") || pathname.includes("novedades")) {
    navigateTo("home", { scrollTo: "novedades-carousel", pushState: false });
    return;
  }

  // Por defecto: Home
  navigateTo("home", { pushState: false });
}

// Escuchadores de eventos para navegación limpia y nativa del navegador
window.addEventListener("hashchange", handleUrlRouting);
window.addEventListener("popstate", handleUrlRouting);

// Interceptor global para enlaces internos con subpáginas limpias (0 segundos de recarga)
document.addEventListener("click", function(event) {
  const link = event.target && event.target.closest ? event.target.closest("a") : null;
  if (!link) return;
  const href = link.getAttribute("href");
  if (!href) return;

  // Ignorar enlaces externos, mails, tel, descargas o nuevas pestañas
  if (link.target === "_blank" || href.startsWith("http://") || href.startsWith("https://") || 
      href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:") ||
      link.hasAttribute("download")) {
    return;
  }

  // Rutas internas de subpáginas (ej: /, /catalogo, /anillos, /garantia, /guia-tallas, /nosotros, /joya/...)
  if (href.startsWith("/") && !href.startsWith("//")) {
    // Si apunta al panel de administración, dejar que el navegador abra el archivo admin
    if (href.startsWith("/admin")) return;

    event.preventDefault();
    history.pushState(null, "", href);
    handleUrlRouting();
  }
});

function selectCategoryFilter(categoryId) {
  state.currentCategory = categoryId;
  state.currentPage = 1;

  // Si estamos en la portada (Home), cambiar automáticamente a la vista de Catálogo
  if (state.currentView !== "catalogo") {
    navigateTo("catalogo", { category: categoryId });
    return;
  }

  updateBreadcrumbCategoryBadge();
  closeAllFilterDropdowns();
  updateFilterTriggerLabels();
  renderProducts();

  // Actualizar URL limpia sin recargar
  if (categoryId && categoryId !== "todos") {
    if (["anillos", "aretes", "collares", "pulseras", "ofertas"].includes(categoryId)) {
      history.replaceState(null, "", `/${categoryId}`);
    } else {
      history.replaceState(null, "", `/catalogo?categoria=${categoryId}`);
    }
  } else {
    history.replaceState(null, "", "/catalogo");
  }

  safeCreateIcons();
}

function selectSizeFilter(sizeId) {
  state.selectedSizeFilter = sizeId;
  state.currentPage = 1;
  // Si selecciona una talla específica y estaba en collares/aretes, pasamos a anillos
  if (sizeId !== "todas" && (state.currentCategory === "collares" || state.currentCategory === "aretes")) {
    state.currentCategory = "anillos";
  }
  closeAllFilterDropdowns();
  updateFilterTriggerLabels();
  renderProducts();
}

function selectStyleFilter(styleId) {
  state.selectedStyleFilter = styleId;
  state.currentPage = 1;
  closeAllFilterDropdowns();
  updateFilterTriggerLabels();
  renderProducts();
}

function selectSortFilter(sortValue) {
  state.sortBy = sortValue;
  state.currentPage = 1;
  closeAllFilterDropdowns();
  updateFilterTriggerLabels();
  renderProducts();
}

function clearSearchInput() {
  state.searchQuery = "";
  state.currentPage = 1;
  const input = document.getElementById("search-input");
  if (input) input.value = "";
  const clearBtn = document.getElementById("search-clear-btn");
  if (clearBtn) clearBtn.classList.add("hidden");
  renderProducts();
}

// Aliases para compatibilidad con código existente
function setCategory(catId) { selectCategoryFilter(catId); }
function setSizeFilter(sizeId) { selectSizeFilter(sizeId); }
function setStyleFilter(styleId) { selectStyleFilter(styleId); }
function setSortBy(sortVal) { selectSortFilter(sortVal); }
function renderCategories() { updateFilterTriggerLabels(); }
function renderSizeFilters() { updateFilterTriggerLabels(); }
function renderStyleFilters() { updateFilterTriggerLabels(); }

function resetAllFilters() {
  state.currentCategory = "todos";
  state.selectedSizeFilter = "todas";
  state.selectedStyleFilter = "todos";
  state.searchQuery = "";
  state.sortBy = "default";
  state.currentPage = 1;

  const searchInput = document.getElementById("search-input");
  if (searchInput) searchInput.value = "";
  const clearBtn = document.getElementById("search-clear-btn");
  if (clearBtn) clearBtn.classList.add("hidden");

  closeAllFilterDropdowns();
  updateFilterTriggerLabels();
  renderProducts();
}
// ==============================================================================
// FILTRADO Y RENDERIZADO DEL CATÁLOGO
// ==============================================================================
function getFilteredProducts() {
  let list = PRODUCTS.filter(prod => {
    // 1. Filtro por Categoría
    let matchesCategory = false;
    if (state.currentCategory === "todos") {
      matchesCategory = true;
    } else if (state.currentCategory === "ofertas") {
      matchesCategory = prod.hasDiscount === true || (prod.badge && (prod.badge.includes("%") || prod.badge.includes("🔥") || prod.badge.toLowerCase().includes("oferta")));
    } else {
      matchesCategory = prod.category === state.currentCategory;
    }

    // 2. Filtro por Buscador Avanzado (código, nombre, notas, descripción, piedras y variantes sin distinción de acentos)
    const norm = str => String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const q = norm(state.searchQuery);

    const matchesQuery = !q || 
      norm(prod.code).includes(q) || 
      (prod.groupId && norm(prod.groupId).includes(q)) ||
      norm(prod.name).includes(q) || 
      norm(prod.description).includes(q) ||
      (prod.stone && norm(prod.stone).includes(q)) ||
      (prod.notes && norm(prod.notes).includes(q)) ||
      (prod.displaySizes && norm(prod.displaySizes).includes(q)) ||
      (Array.isArray(prod.colors) && prod.colors.some(c => norm(c).includes(q))) ||
      (Array.isArray(prod.variants) && prod.variants.some(v => 
        norm(v.color).includes(q) || norm(v.sku).includes(q)
      ));

    // 3. Filtro por Medida / Talla de Anillo
    let matchesSize = true;
    if (state.selectedSizeFilter !== "todas") {
      if (state.selectedSizeFilter === "Ajustable") {
        matchesSize = prod.sizes && prod.sizes.includes("Ajustable");
      } else {
        matchesSize = prod.sizes && (
          prod.sizes.includes(state.selectedSizeFilter) || 
          prod.sizes.includes("Ajustable")
        );
      }
    }

    // 4. Filtro por Estilo / Color
    let matchesStyle = true;
    if (state.selectedStyleFilter !== "todos") {
      matchesStyle = prod.styleTag === state.selectedStyleFilter;
    }

    return matchesCategory && matchesQuery && matchesSize && matchesStyle;
  });

  // Ordenamiento
  if (state.sortBy === "price-asc") {
    list.sort((a, b) => a.price - b.price);
  } else if (state.sortBy === "price-desc") {
    list.sort((a, b) => b.price - a.price);
  } else if (state.sortBy === "code-asc") {
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  return list;
}

function renderProducts() {
  const grid = document.getElementById("products-grid");
  const countDisplay = document.getElementById("products-count");
  const activeFiltersContainer = document.getElementById("active-filters-badges");
  const paginationContainer = document.getElementById("pagination-container");
  if (!grid) return;

  const filtered = getFilteredProducts();

  if (countDisplay) {
    countDisplay.textContent = `Mostrando ${filtered.length} ${filtered.length === 1 ? 'pieza de plata' : 'piezas de plata S925'}`;
  }

  // Renderizar píldoras de filtros activos
  if (activeFiltersContainer) {
    let pills = [];
    if (state.currentCategory !== "todos") {
      pills.push(`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sage-100 text-sage-900 text-xs font-semibold border border-sage-200">
          <span>Categoría: ${getCategoryLabel(state.currentCategory)}</span>
          <button onclick="selectCategoryFilter('todos')" class="hover:text-red-600 font-bold ml-0.5 transition" title="Quitar filtro">✕</button>
        </span>
      `);
    }
    if (state.selectedSizeFilter !== "todas") {
      pills.push(`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 text-xs font-semibold border border-rose-200">
          <span>Talla: ${state.selectedSizeFilter}</span>
          <button onclick="selectSizeFilter('todas')" class="hover:text-red-600 font-bold ml-0.5 transition" title="Quitar filtro">✕</button>
        </span>
      `);
    }
    if (state.selectedStyleFilter !== "todos") {
      const found = STYLE_FILTERS.find(s => s.id === state.selectedStyleFilter);
      pills.push(`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-200">
          <span>${found ? found.label.replace(/\s*\(.*\)/, '').trim() : state.selectedStyleFilter}</span>
          <button onclick="selectStyleFilter('todos')" class="hover:text-red-600 font-bold ml-0.5 transition" title="Quitar filtro">✕</button>
        </span>
      `);
    }
    if (state.searchQuery && state.searchQuery.trim().length > 0) {
      pills.push(`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold border border-gray-200">
          <span>Búsqueda: "${escapeHtml(state.searchQuery.trim())}"</span>
          <button onclick="clearSearchInput()" class="hover:text-red-600 font-bold ml-0.5 transition" title="Borrar búsqueda">✕</button>
        </span>
      `);
    }

    if (pills.length > 0) {
      activeFiltersContainer.innerHTML = `
        <div class="flex items-center flex-wrap gap-2 pt-1">
          <span class="text-xs text-gray-400 font-bold uppercase tracking-wider">Activos:</span>
          ${pills.join("")}
          <button onclick="resetAllFilters()" class="text-xs text-rose-600 hover:text-rose-800 font-bold underline ml-1 transition">
            Limpiar filtros
          </button>
        </div>
      `;
    } else {
      activeFiltersContainer.innerHTML = "";
    }
  }

  updateFilterTriggerLabels();

  // Estado vacío si no hay coincidencias
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
        <div class="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <i data-lucide="search-x" class="w-8 h-8"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-800 mb-2 font-sans tracking-tight">No se encontraron piezas con esos filtros</h3>
        <p class="text-gray-500 text-sm mb-6 max-w-md mx-auto">
          Prueba cambiando la medida de anillo seleccionada o restablece los filtros para ver todas las 141 opciones.
        </p>
        <button 
          onclick="resetAllFilters()"
          class="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-sage-600 text-white text-sm font-medium hover:bg-sage-700 transition shadow-sm"
        >
          <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
          Restablecer todos los filtros
        </button>
      </div>
    `;
    if (paginationContainer) paginationContainer.innerHTML = "";
    safeCreateIcons();
    return;
  }

  // Paginación
  const totalPages = Math.ceil(filtered.length / state.itemsPerPage);
  const startIndex = (state.currentPage - 1) * state.itemsPerPage;
  const paginated = filtered.slice(startIndex, startIndex + state.itemsPerPage);

  grid.innerHTML = paginated.map((prod, index) => {
    const formattedPrice = formatCurrency(prod.price);

    let ringSizeHtml = "";
    if (prod.isRing && prod.sizes && prod.sizes.length > 0) {
      if (prod.sizes.length === 1 && prod.sizes[0] === "Ajustable") {
        ringSizeHtml = `
          <div class="adjustable-tag mt-1 sm:mt-1.5 text-[9px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1">
            <i data-lucide="sparkles" class="w-2.5 h-2.5 sm:w-3 sm:h-3"></i> Ajustable
          </div>
        `;
      } else {
        ringSizeHtml = `
          <div class="mt-1 sm:mt-1.5 text-[9px] sm:text-[11px] flex items-center justify-between gap-1">
            <span class="font-medium text-gray-500 hidden sm:inline">Tallas:</span>
            <span class="size-pill-tag font-bold px-1.5 py-0.5 rounded text-[9px] sm:text-xs truncate">${prod.displaySizes}</span>
          </div>
        `;
      }
    }

    return `
      <div class="product-card stagger-card group bg-white rounded-xl sm:rounded-2xl overflow-hidden border border-sage-100 flex flex-col relative" style="animation-delay: ${Math.min(index * 20, 200)}ms;">
        
        <!-- Imagen -->
        <div class="relative w-full aspect-square bg-[#f6f6f6] overflow-hidden cursor-pointer" onclick="navigateToProduct('${prod.id}')">
          <!-- Badge Dinámico (Porcentaje de Descuento Automático o Modelos) -->
          ${prod.hasDiscount && prod.originalPrice && prod.originalPrice > prod.price ? `
            <span class="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 z-10 text-[9px] sm:text-[11px] font-black tracking-wider px-2.5 py-1 rounded-full shadow-md bg-[#e72380] text-white border border-white/20">
              🔥 -${Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100)}% OFF
            </span>
          ` : (prod.hasMultipleVariants ? `
            <span class="product-badge absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 z-10 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full shadow-xs">
              ${prod.variants.length} modelos
            </span>
          ` : `
            <span class="product-badge absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 z-10 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full shadow-xs">
              ${prod.badge || 'PLATA S925'}
            </span>
          `)}

          <img 
            src="${prod.image}" 
            alt="${prod.name}" 
            loading="lazy" 
            decoding="async"
            class="product-image w-full h-full object-cover object-center"
            onerror="handleProductImageError(this)"
          />

          <div class="hidden sm:flex absolute inset-0 bg-black/25 dark:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 items-center justify-center p-4">
            <button 
              type="button" 
              class="product-hover-badge text-xs font-bold px-4 py-2 rounded-full transform translate-y-2 group-hover:translate-y-0 transition-all duration-200 flex items-center gap-1.5 btn-press"
            >
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              Ver detalles y tallas
            </button>
          </div>

          <div class="silver-tag absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 px-1.5 py-0.5 sm:px-2 rounded text-[8px] sm:text-[10px] shadow-xs">
            PLATA S925
          </div>
        </div>

        <!-- Contenido -->
        <div class="p-2.5 sm:p-4 flex flex-col flex-grow justify-between">
          <div>
            <div class="flex items-center justify-between mb-0.5 sm:mb-1">
              <span class="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-rose-500 truncate">
                ${getCategoryLabel(prod.category)}
              </span>
              <span class="text-[8px] sm:text-[10px] text-gray-400 font-medium hidden xs:inline">Plata Ley S925</span>
            </div>
            
            <h3 
              onclick="navigateToProduct('${prod.id}')"
              class="font-sans text-xs sm:text-base font-bold text-gray-900 dark:text-white group-hover:text-sage-700 dark:group-hover:text-rose-400 transition-colors cursor-pointer line-clamp-1 leading-snug"
              title="${prod.name}"
            >
              ${cleanOrderTitle(prod.name)}
            </h3>

            ${ringSizeHtml}

            ${prod.notes ? `
              <p class="text-[9px] sm:text-[11px] text-rose-600 mt-0.5 line-clamp-1 italic">
                ✨ ${prod.notes}
              </p>
            ` : ""}
          </div>

          <div class="pt-2 sm:pt-3 border-t border-gray-100 mt-2 sm:mt-3 flex items-center justify-between gap-1 sm:gap-2">
            <div>
              ${prod.hasDiscount && prod.originalPrice && prod.originalPrice > prod.price ? `
                <div class="flex items-baseline gap-1.5">
                  <span class="text-xs sm:text-lg font-extrabold text-[#e72380] dark:text-rose-400 font-sans block leading-none">
                    ${prod.hasMultipleVariants ? 'Desde ' : ''}${formattedPrice}
                  </span>
                  <span class="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 line-through font-medium">
                    ${formatCurrency(prod.originalPrice)}
                  </span>
                </div>
              ` : `
                <span class="text-xs sm:text-lg font-bold text-sage-900 dark:text-white font-sans block leading-none">
                  ${prod.hasMultipleVariants ? 'Desde ' : ''}${formattedPrice}
                </span>
              `}
              <span class="text-[8px] sm:text-[10px] text-gray-400 font-medium">${prod.hasMultipleVariants ? 'Desde ' : ''}${BUSINESS_CONFIG.currencyCode}</span>
            </div>

            <button 
              onclick="handleQuickAddToCart('${prod.id}', event)"
              class="add-to-cart-btn btn-press px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs flex-shrink-0"
              title="Agregar al pedido"
            >
              <i data-lucide="shopping-bag" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"></i>
              <span class="font-bold text-white">${prod.isRing && prod.sizes && prod.sizes.length > 1 ? 'Elegir Talla' : '+ Agregar'}</span>
            </button>
          </div>
        </div>

      </div>
    `;  }).join("");

  renderPagination(totalPages);
  safeCreateIcons();
}

function renderPagination(totalPages) {
  const container = document.getElementById("pagination-container");
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let html = `<div class="flex items-center justify-center gap-1.5 py-4">`;
  
  html += `
    <button 
      onclick="changePage(${state.currentPage - 1})"
      ${state.currentPage === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-sage-100 text-gray-700"'}
      class="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium flex items-center gap-1 transition"
    >
      <i data-lucide="chevron-left" class="w-4 h-4"></i>
      <span>Anterior</span>
    </button>
  `;

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
      const isActive = i === state.currentPage;
      html += `
        <button 
          onclick="changePage(${i})"
          class="w-8 h-8 rounded-lg text-xs font-bold transition ${isActive ? 'bg-sage-600 text-white shadow-xs' : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'}"
        >
          ${i}
        </button>
      `;
    } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
      html += `<span class="px-1 text-gray-400 text-xs">...</span>`;
    }
  }

  html += `
    <button 
      onclick="changePage(${state.currentPage + 1})"
      ${state.currentPage === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-sage-100 text-gray-700"'}
      class="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium flex items-center gap-1 transition"
    >
      <span>Siguiente</span>
      <i data-lucide="chevron-right" class="w-4 h-4"></i>
    </button>
  `;

  html += `</div>`;
  container.innerHTML = html;
  safeCreateIcons();
}

function changePage(page) {
  const filtered = getFilteredProducts();
  const totalPages = Math.ceil(filtered.length / state.itemsPerPage);
  if (page < 1 || page > totalPages) return;
  state.currentPage = page;
  renderProducts();
  document.getElementById("catalogo").scrollIntoView({ behavior: "smooth" });
}

function getCategoryLabel(catId) {
  const found = CATEGORIES.find(c => c.id === catId);
  return found ? found.label.replace(/\s*\(\d+\)/, '') : "Joyería S925";
}

function handleQuickAddToCart(productId, event) {
  if (event) event.stopPropagation();
  const prod = PRODUCTS.find(p => String(p.id) === String(productId) || (p.groupId && String(p.groupId) === String(productId)));
  if (!prod) return;

  // Si la joya tiene varios modelos o tallas de anillo, abrir modal para que elija su favorito
  if (prod.hasMultipleVariants || (prod.isRing && prod.sizes && prod.sizes.length > 1 && prod.sizes[0] !== "Ajustable")) {
    openProductModal(productId);
    return;
  }

  const defaultSize = (prod.isRing && prod.sizes && prod.sizes.length > 0) ? prod.sizes[0] : null;
  addToCart(productId, 1, defaultSize);

  // Microinteracción: feedback visual inmediato en el botón pulsado
  const btn = event && event.currentTarget ? event.currentTarget : null;
  if (btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-300"></i> <span class="font-bold text-white text-[10px] sm:text-xs">¡Agregado!</span>`;
    btn.style.backgroundColor = "#15803d";
    safeCreateIcons();
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.style.backgroundColor = "";
      safeCreateIcons();
    }, 1200);
  }
}

// ==============================================================================
// GESTIÓN DEL CARRITO
// ==============================================================================
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        state.cart = parsed.filter(item => {
          return item && typeof item === "object" &&
                 item.code &&
                 typeof item.price === "number" && !isNaN(item.price) && item.price > 0 &&
                 typeof item.quantity === "number" && !isNaN(item.quantity) && item.quantity > 0;
        }).slice(0, CART_LIMITS.MAX_DISTINCT_ITEMS).map(item => ({
          ...item,
          quantity: Math.min(CART_LIMITS.MAX_PIECES_PER_ITEM, Math.max(1, Math.round(item.quantity)))
        }));
      } else {
        state.cart = [];
      }
    }
  } catch (err) {
    state.cart = [];
  }
}

function saveCartToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  } catch (err) {
    console.error("Error al guardar carrito:", err);
  }
}

function cleanOrderTitle(title) {
  if (!title) return "Joya de Plata Ley S925";
  let t = String(title).replace(/^[,.\s]+/, "").trim();
  // Quitar la parte de palabras clave tras la primera coma que no sea numérica (ej: no cortar 3,5 quilates)
  const parts = t.split(/,\s+(?![0-9])/);
  let main = parts[0].trim();
  // Quitar coletillas de búsqueda de AliExpress
  main = main.replace(/(?:\s+(?:para mujer(?:es)?(?:\s+y\s+(?:adolescentes|ni[ñas]))?|para adolescentes|de lujo|de alta calidad|regalo de joyería|regalo de boda|joyería fina|sortija de compromiso|moda femenina|para fiesta))+$/i, "").trim();
  if (main.length > 0) {
    main = main.charAt(0).toUpperCase() + main.slice(1);
  }
  return main.length > 5 ? main : t;
}

function cleanOrderVariantLabel(label) {
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

function addToCart(productId, quantity = 1, selectedSize = null, event = null, selectedVariant = null) {
  if (event) event.stopPropagation();

  const product = PRODUCTS.find(p => String(p.id) === String(productId) || (p.variants && p.variants.some(v => String(v.id) === String(productId))));
  if (!product) return;

  const variant = selectedVariant || (state.selectedProductForModal && state.selectedProductForModal.id === product.id ? state.selectedModalVariant : (product.variants ? product.variants[0] : null));
  const variantId = variant ? String(variant.id) : String(product.id);
  const variantCode = variant ? variant.sku : product.code;
  const variantPhoto = variant ? variant.photo : product.image;
  const variantPrice = variant ? variant.price : product.price;
  
  const cleanColor = cleanOrderVariantLabel(variant ? variant.color : null);
  const cleanTitle = cleanOrderTitle(product.name);
  const variantName = (cleanColor && cleanColor !== "Única" && cleanColor !== "Modelo Principal" && cleanColor.toLowerCase() !== variantCode.toLowerCase()) 
    ? `${cleanTitle} (${cleanColor})` 
    : cleanTitle;

  let sizeToSet = selectedSize;
  const validSizes = variant ? variant.sizes : product.sizes;
  if (!sizeToSet && product.isRing && validSizes && validSizes.length > 0) {
    sizeToSet = validSizes[0];
  }

  const existingIndex = state.cart.findIndex(
    item => String(item.variantId || item.id) === String(variantId) && item.selectedSize === sizeToSet
  );

  // Límite de ítems distintos en el carrito
  if (existingIndex === -1 && state.cart.length >= CART_LIMITS.MAX_DISTINCT_ITEMS) {
    showToast("Límite de pedido alcanzado", "Tienes 25 piezas distintas en tu pedido. Para compras mayores o de mayoreo contáctanos por WhatsApp.", "info");
    return;
  }

  const safeQty = Math.max(1, Math.min(CART_LIMITS.MAX_PIECES_PER_ITEM, parseInt(quantity, 10) || 1));

  if (existingIndex > -1) {
    const newQty = state.cart[existingIndex].quantity + safeQty;
    if (newQty > CART_LIMITS.MAX_PIECES_PER_ITEM) {
      state.cart[existingIndex].quantity = CART_LIMITS.MAX_PIECES_PER_ITEM;
      showToast("Límite por modelo", "Se ajustó al límite máximo de 10 piezas por modelo.", "info");
    } else {
      state.cart[existingIndex].quantity = newQty;
    }
  } else {
    state.cart.push({
      id: product.id,
      variantId: variantId,
      code: variantCode,
      name: cleanTitle,
      variantColor: cleanColor,
      price: variantPrice,
      image: variantPhoto,
      category: product.category,
      isRing: product.isRing,
      sizes: validSizes || [],
      selectedSize: sizeToSet,
      quantity: quantity
    });
  }

  saveCartToStorage();
  updateCartUI();
  
  const sizeMsg = sizeToSet ? ` (Talla: ${sizeToSet})` : "";
  showToast(`¡Añadiste "${variantCode} - ${variantName}"${sizeMsg} al pedido!`, variantPhoto);
}

function updateCartItemSize(cartIndex, newSize) {
  if (!state.cart[cartIndex]) return;
  state.cart[cartIndex].selectedSize = newSize;
  saveCartToStorage();
  updateCartUI();
  showToast(`Talla actualizada a: ${newSize}`, null, "info");
}

function updateCartQuantity(cartIndex, delta) {
  if (!state.cart[cartIndex]) return;

  const current = state.cart[cartIndex].quantity;
  const newQty = current + delta;
  if (newQty <= 0) {
    removeFromCart(cartIndex);
    return;
  }
  if (newQty > CART_LIMITS.MAX_PIECES_PER_ITEM) {
    state.cart[cartIndex].quantity = CART_LIMITS.MAX_PIECES_PER_ITEM;
    showToast("Límite por modelo", "El límite máximo por modelo en tienda online es de 10 piezas.", "info");
    saveCartToStorage();
    updateCartUI();
    return;
  }

  state.cart[cartIndex].quantity = newQty;
  saveCartToStorage();
  updateCartUI();
}

function removeFromCart(cartIndex) {
  const removedItem = state.cart[cartIndex];
  state.cart.splice(cartIndex, 1);
  saveCartToStorage();
  updateCartUI();

  if (removedItem) {
    showToast(`Se eliminó "${removedItem.code}" del pedido.`, null, "info");
  }
}

function clearCart() {
  if (state.cart.length === 0) return;
  if (confirm("¿Deseas vaciar tu pedido actual?")) {
    state.cart = [];
    saveCartToStorage();
    updateCartUI();
    showToast("Pedido vaciado correctamente.", null, "info");
  }
}

function updateCartUI() {
  const countBadges = document.querySelectorAll(".cart-counter-badge");
  const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const advanceAmount = Math.round(totalAmount * 0.5);
  const remainingAmount = totalAmount - advanceAmount;

  countBadges.forEach(badge => {
    badge.textContent = totalItems;
    if (totalItems > 0) {
      badge.classList.remove("hidden");
      badge.classList.remove("badge-pop");
      void badge.offsetWidth; // Forzar reflow para reiniciar la animación pop
      badge.classList.add("badge-pop");
    } else {
      badge.classList.add("hidden");
      badge.classList.remove("badge-pop");
    }
  });

  const cartList = document.getElementById("cart-items-container");
  const cartSubtotal = document.getElementById("cart-subtotal");
  const cartTotal = document.getElementById("cart-total");
  const cartAdvance = document.getElementById("cart-advance");
  const cartRemaining = document.getElementById("cart-remaining");
  const cartEmptyState = document.getElementById("cart-empty-state");
  const cartFooter = document.getElementById("cart-footer");
  const ringSizeAlert = document.getElementById("cart-ring-size-alert");

  if (cartSubtotal) cartSubtotal.textContent = formatCurrency(totalAmount);
  if (cartTotal) cartTotal.textContent = formatCurrency(totalAmount);
  if (cartAdvance) cartAdvance.textContent = formatCurrency(advanceAmount);
  if (cartRemaining) cartRemaining.textContent = formatCurrency(remainingAmount);

  const hasRings = state.cart.some(item => item.isRing);
  if (ringSizeAlert) {
    if (hasRings) ringSizeAlert.classList.remove("hidden");
    else ringSizeAlert.classList.add("hidden");
  }

  if (state.cart.length === 0) {
    if (cartEmptyState) cartEmptyState.classList.remove("hidden");
    if (cartList) cartList.classList.add("hidden");
    if (cartFooter) cartFooter.classList.add("hidden");
  } else {
    if (cartEmptyState) cartEmptyState.classList.add("hidden");
    if (cartList) cartList.classList.remove("hidden");
    if (cartFooter) cartFooter.classList.remove("hidden");

    if (cartList) {
      cartList.innerHTML = state.cart.map((item, index) => {
        let sizeSelectorHtml = "";
        if (item.isRing && item.sizes && item.sizes.length > 0) {
          if (item.sizes.length === 1 && item.sizes[0] === "Ajustable") {
            sizeSelectorHtml = `
              <div class="mt-1 flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                <i data-lucide="sparkles" class="w-3 h-3 text-rose-500"></i> Talla Ajustable
              </div>
            `;
          } else {
            const options = item.sizes.map(sz => `
              <option value="${sz}" ${item.selectedSize === sz ? 'selected' : ''}>Talla ${sz}</option>
            `).join("");

            sizeSelectorHtml = `
              <div class="mt-1.5 flex items-center gap-2">
                <label class="text-[11px] font-bold text-sage-800 dark:text-gray-300 flex items-center gap-1">
                  <i data-lucide="ruler" class="w-3 h-3 text-rose-500"></i> Medida:
                </label>
                <select 
                  onchange="updateCartItemSize(${index}, this.value)"
                  class="cart-size-select text-xs font-semibold rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-sage-500 transition"
                >
                  ${options}
                </select>
                <button 
                  type="button" 
                  onclick="openRingSizeGuideModal()" 
                  class="text-[10px] text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 underline font-semibold"
                  title="¿Cómo saber tu medida?"
                >
                  ¿Cómo medir?
                </button>
              </div>
            `;
          }
        }

        return `
          <div class="cart-item-card p-3 bg-white dark:bg-[#121212] rounded-xl border border-gray-100 dark:border-white/10 shadow-xs hover:border-sage-200 dark:hover:border-rose-400/40 transition-colors">
            <div class="flex items-start gap-3">
              
              <!-- Imagen clickeable para abrir la ventana del producto -->
              <div 
                onclick="openProductModal('${item.id}', '${item.selectedSize || ''}')"
                class="w-16 h-16 rounded-lg overflow-hidden bg-gray-50 dark:bg-black/30 flex-shrink-0 border border-gray-100 dark:border-white/10 cursor-pointer group/img relative shadow-xs"
                title="Toca para ver detalles y fotos de la pieza"
              >
                <img 
                  src="${item.image}" 
                  alt="${item.name}" 
                  loading="lazy"
                  decoding="async"
                  class="w-full h-full object-cover group-hover/img:scale-110 transition duration-300"
                  onerror="handleProductImageError(this)"
                />
                <div class="absolute inset-0 bg-black/35 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition text-white">
                  <i data-lucide="eye" class="w-4 h-4 drop-shadow-md"></i>
                </div>
              </div>
              
              <div class="flex-grow min-w-0">
                <div class="flex items-center justify-between gap-1">
                  <!-- Código clickeable -->
                  <span 
                    onclick="openProductModal('${item.id}', '${item.selectedSize || ''}')"
                    class="text-[10px] font-bold bg-sage-100 text-sage-800 dark:bg-sage-900/80 dark:text-sage-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-sage-200 dark:hover:bg-sage-800 transition"
                    title="Ver detalles de ${item.code}"
                  >
                    ${item.code}
                  </span>
                  <button 
                    onclick="removeFromCart(${index})"
                    class="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 transition"
                    title="Eliminar del pedido"
                  >
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
                </div>

                <!-- Título clickeable para abrir la ventana del producto -->
                <h4 
                  onclick="openProductModal('${item.id}', '${item.selectedSize || ''}')"
                  class="font-sans font-bold text-xs text-gray-900 dark:text-white truncate mt-0.5 cursor-pointer hover:text-rose-500 dark:hover:text-rose-400 transition" 
                  title="Toca para ver ${item.name}"
                >
                  ${item.name}
                </h4>
                <p class="text-xs text-sage-700 dark:text-rose-400 font-bold">${formatCurrency(item.price)}</p>

                ${sizeSelectorHtml}

                <div class="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100 dark:border-white/5">
                  <div class="flex items-center border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden bg-gray-50 dark:bg-white/5">
                    <button 
                      onclick="updateCartQuantity(${index}, -1)" 
                      class="px-2 py-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 text-xs transition"
                    >-</button>
                    <span class="px-2 text-xs font-bold text-gray-800 dark:text-white">${item.quantity}</span>
                    <button 
                      onclick="updateCartQuantity(${index}, 1)" 
                      class="px-2 py-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 text-xs transition"
                    >+</button>
                  </div>
                  <span class="text-xs font-bold text-gray-900 dark:text-white">${formatCurrency(item.price * item.quantity)}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");
      safeCreateIcons();
    }
  }
}

function toggleCartDrawer(open = true, triggerHistoryBack = true) {
  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("cart-overlay");
  const panel = document.getElementById("cart-panel");
  if (!drawer || !overlay || !panel) return;

  if (open) {
    state.isCartDrawerOpen = true;
    if (!state.cartDrawerPushedHistory) {
      state.cartDrawerPushedHistory = true;
      try {
        history.pushState({ modalOpen: true, modalType: "cart" }, "");
      } catch (err) {
        console.warn("No se pudo registrar historial del carrito:", err);
      }
    }
    drawer.style.display = "block";
    drawer.classList.remove("hidden");
    initCheckoutTurnstile();
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => {
      overlay.classList.remove("opacity-0");
      overlay.classList.add("opacity-100");
      panel.classList.remove("translate-x-full");
      panel.classList.add("translate-x-0");
    });
  } else {
    state.isCartDrawerOpen = false;
    overlay.classList.remove("opacity-100");
    overlay.classList.add("opacity-0");
    panel.classList.remove("translate-x-0");
    panel.classList.add("translate-x-full");
    if (!state.isProductModalOpen && !state.isGuideModalOpen) {
      document.body.classList.remove("overflow-hidden");
    }
    setTimeout(() => {
      drawer.classList.add("hidden");
      drawer.style.display = "none";
    }, 280);

    if (triggerHistoryBack && state.cartDrawerPushedHistory) {
      state.cartDrawerPushedHistory = false;
      state.isHistoryBackByModalClose = true;
      history.back();
    } else {
      state.cartDrawerPushedHistory = false;
    }
  }
}

// ==============================================================================
// GENERADOR DE PEDIDO A WHATSAPP (CONFIGURADO AL NÚMERO 529932902704)
// ==============================================================================
function sendOrderToWhatsApp() {
  if (state.cart.length === 0) {
    alert("Tu carrito está vacío. Agrega alguna hermosa pieza de plata antes de enviar tu pedido.");
    return;
  }

  // 1. Detección defensiva de Trampa Honeypot contra Bots
  const botTrap = document.getElementById("checkout-bot-trap");
  if (botTrap && botTrap.value && botTrap.value.trim().length > 0) {
    console.warn("[Seguridad] Bot detectado en formulario de pedido.");
    showToast("Pedido en revisión", "Validando orden con el sistema...", "info");
    return;
  }

  // 2. Verificación Inteligente de Cloudflare Turnstile
  if (TURNSTILE_CONFIG.enabled && typeof turnstile !== "undefined" && !state.turnstileToken) {
    showToast("Verificación de seguridad", "Comprobando que eres humano antes de procesar tu pedido...", "info");
    initCheckoutTurnstile();
    return;
  }

  // 2. Control de Frecuencia Anti-Spam / Anti-Flood (Rate Limiting)
  const now = Date.now();
  const lastOrderTime = (typeof sessionStorage !== "undefined" && sessionStorage.getItem) 
    ? parseInt(sessionStorage.getItem("yamiki_last_order_ts") || "0", 10) 
    : (state.lastOrderTimestamp || 0);
  if (lastOrderTime && (now - lastOrderTime < CART_LIMITS.ORDER_COOLDOWN_MS)) {
    const remainingSec = Math.ceil((CART_LIMITS.ORDER_COOLDOWN_MS - (now - lastOrderTime)) / 1000);
    showToast("Espera un momento", `Por favor espera ${remainingSec}s antes de enviar otro pedido para evitar pedidos duplicados.`, "info");
    return;
  }

  // 3. Sanitización estricta y límite de caracteres en datos del cliente
  const customerNameInput = document.getElementById("checkout-customer-name");
  const customerAddressInput = document.getElementById("checkout-customer-address");
  const customerNotesInput = document.getElementById("checkout-customer-notes");

  const customerName = sanitizeOrderText(customerNameInput ? customerNameInput.value : "", 60);
  const customerAddress = sanitizeOrderText(customerAddressInput ? customerAddressInput.value : "", 120);
  const customerNotes = sanitizeOrderText(customerNotesInput ? customerNotesInput.value : "", 160);

  // 4. Validación de cordura de total de piezas
  const totalPiecesCheck = state.cart.reduce((sum, item) => sum + Math.min(10, item.quantity), 0);
  if (totalPiecesCheck > CART_LIMITS.MAX_TOTAL_ORDER_PIECES) {
    showToast("Límite de pedido", `El pedido supera el máximo permitido (${CART_LIMITS.MAX_TOTAL_ORDER_PIECES} piezas). Contáctanos para cotización de mayoreo.`, "info");
    return;
  }

  // 5. Debounce y protección visual en el botón
  const checkoutBtn = document.getElementById("whatsapp-checkout-btn");
  const btnText = document.getElementById("whatsapp-btn-text");
  if (checkoutBtn) {
    checkoutBtn.disabled = true;
    if (btnText) btnText.textContent = "Abriendo WhatsApp...";
    setTimeout(() => {
      if (checkoutBtn) checkoutBtn.disabled = false;
      if (btnText) btnText.textContent = "Enviar Pedido a WhatsApp (+52 993 290 2704)";
    }, 3000);
  }

  if (typeof sessionStorage !== "undefined" && sessionStorage.setItem) {
    sessionStorage.setItem("yamiki_last_order_ts", String(now));
  }
  state.lastOrderTimestamp = now;

  const totalAmount = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalPieces = state.cart.reduce((sum, item) => sum + item.quantity, 0);

  let message = `¡Hola *${BUSINESS_CONFIG.brandName}*! Deseo realizar el siguiente pedido de joyería en *Plata Ley S925*:\n\n`;
  message += `*PIEZAS SELECCIONADAS:*\n`;
  message += `────────────────────\n`;

  state.cart.forEach((item, index) => {
    const itemSubtotal = formatCurrency(item.price * item.quantity);
    const title = cleanOrderTitle(item.name);
    const variantLabel = cleanOrderVariantLabel(item.variantColor || item.color);

    message += `${index + 1}. *[${item.code}]* ${title}\n`;
    if (variantLabel && variantLabel.toLowerCase() !== item.code.toLowerCase()) {
      message += `   • Modelo: *${variantLabel}*\n`;
    }
    if (item.isRing && item.selectedSize) {
      message += `   • Talla: *${item.selectedSize}*\n`;
    }
    message += `   • Cantidad: ${item.quantity} pza(s) x ${formatCurrency(item.price)}\n`;
    message += `   • Subtotal: *${itemSubtotal}*\n\n`;
  });

  message += `────────────────────\n`;
  message += `• *Total de piezas:* ${totalPieces}\n`;
  message += `• *TOTAL GENERAL:* *${formatCurrency(totalAmount)} ${BUSINESS_CONFIG.currencyCode}*\n`;
  message += `• *GARANTÍA INCLUIDA:* 30 días contra cualquier defecto de fábrica en Plata Ley S925\n\n`;

  message += `*DATOS DEL CLIENTE:*\n`;
  message += `• *Nombre:* ${customerName ? customerName : "Por acordar"}\n`;
  if (customerAddress) {
    message += `• *Ciudad/Dirección:* ${customerAddress}\n`;
  }
  if (customerNotes) {
    message += `• *Notas:* ${customerNotes}\n`;
  }

  message += `\n¿Me podrían confirmar disponibilidad y los datos de pago/transferencia para procesar mi pedido? ¡Muchas gracias!`;

  // Usar endpoint directo de api.whatsapp.com/send para evitar que el redirect 302 de wa.me corrompa los emojis a 
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${BUSINESS_CONFIG.whatsappNumber}&text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank");
  showToast("¡Redirigiendo a WhatsApp con tu pedido y tallas!", null, "success");
}

// ==============================================================================
// MODAL DE VISTA RÁPIDA (CON SELECTOR DE TALLA)
// ==============================================================================
function openProductModal(productId, defaultSize = null, defaultVariantId = null) {
  // Redirigir siempre a la subpágina dedicada de la joya
  return navigateToProduct(productId, defaultSize, defaultVariantId);
}

function closeProductModal(triggerHistoryBack = true) {
  state.isProductModalOpen = false;
  const modal = document.getElementById("product-modal");
  if (modal) {
    modal.classList.remove("modal-active");
    setTimeout(() => {
      modal.classList.add("hidden");
      modal.style.display = "none";
      // Si el carrito de compras sigue abierto, no quitar overflow-hidden para no romper el scroll
      const cartDrawer = document.getElementById("cart-drawer");
      const isCartOpen = cartDrawer && !cartDrawer.classList.contains("hidden") && cartDrawer.style.display !== "none";
      if (!isCartOpen) {
        document.body.classList.remove("overflow-hidden");
      }
    }, 200);
  }

  // Restaurar de inmediato la posición exacta de desplazamiento previa
  const savedScroll = state.modalScrollPosition;
  if (typeof savedScroll === "number") {
    window.scrollTo({ top: savedScroll, behavior: "instant" });
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedScroll, behavior: "instant" });
    });
    setTimeout(() => {
      window.scrollTo({ top: savedScroll, behavior: "instant" });
    }, 50);
  }

  if (triggerHistoryBack && state.modalPushedHistory) {
    state.modalPushedHistory = false;
    state.isHistoryBackByModalClose = true;
    history.back();
  } else {
    state.modalPushedHistory = false;
  }

  state.selectedProductForModal = null;
  state.selectedModalSize = null;
}

function addModalProductToCart() {
  if (!state.selectedProductForModal) return;
  const product = state.selectedProductForModal;

  // Si tiene varios modelos y el cliente no ha seleccionado ninguno, solicitarlo amablemente
  if (product.hasMultipleVariants && !state.selectedModalVariant) {
    showToast("Por favor selecciona un modelo antes de agregar al pedido.", "error");
    const variantsSection = document.getElementById("modal-variants-section");
    if (variantsSection) {
      variantsSection.scrollIntoView({ behavior: "smooth", block: "center" });
      variantsSection.classList.add("ring-2", "ring-[#e72380]", "p-2", "rounded-2xl");
      setTimeout(() => {
        variantsSection.classList.remove("ring-2", "ring-[#e72380]", "p-2", "rounded-2xl");
      }, 1500);
    }
    return;
  }

  const qtyInput = document.getElementById("modal-qty-input");
  const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
  addToCart(product.id, qty, state.selectedModalSize, null, state.selectedModalVariant);
  closeProductModal();
}

// ==============================================================================
// MODAL DE GUÍA PARA MEDIR TALLAS
// ==============================================================================
function openRingSizeGuideModal() {
  const modal = document.getElementById("ring-size-guide-modal");
  if (modal) {
    state.guideModalScrollPosition = window.pageYOffset || document.documentElement.scrollTop || window.scrollY || 0;
    state.isGuideModalOpen = true;
    if (!state.guideModalPushedHistory) {
      state.guideModalPushedHistory = true;
      try {
        history.pushState({ modalOpen: true, modalType: "guide", scrollY: state.guideModalScrollPosition }, "");
      } catch (err) {
        console.warn("No se pudo registrar historial de la guía:", err);
      }
    }

    modal.style.display = "flex";
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => {
      modal.classList.add("modal-active");
    });
    safeCreateIcons();
  }
}

function closeRingSizeGuideModal(triggerHistoryBack = true) {
  state.isGuideModalOpen = false;
  const modal = document.getElementById("ring-size-guide-modal");
  if (modal) {
    modal.classList.remove("modal-active");
    setTimeout(() => {
      modal.classList.add("hidden");
      modal.style.display = "none";
      const cartDrawer = document.getElementById("cart-drawer");
      const isCartOpen = cartDrawer && !cartDrawer.classList.contains("hidden") && cartDrawer.style.display !== "none";
      if (!state.isProductModalOpen && !isCartOpen) {
        document.body.classList.remove("overflow-hidden");
      }
    }, 200);
  }

  if (triggerHistoryBack && state.guideModalPushedHistory) {
    state.guideModalPushedHistory = false;
    state.isHistoryBackByModalClose = true;
    history.back();
  } else {
    state.guideModalPushedHistory = false;
  }
}

// ==============================================================================
// GESTIÓN DE TABS Y LIGHTBOX PARA LA GUÍA OFICIAL DE MEDIDAS YAMIKI
// ==============================================================================
function switchGuideModalTab(tabName) {
  const tabs = ["infografias", "tabla", "pasos"];
  tabs.forEach(t => {
    const btn = document.getElementById(`guide-tab-btn-${t}`);
    const content = document.getElementById(`guide-tab-content-${t}`);
    if (btn && content) {
      if (t === tabName) {
        btn.className = "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition bg-rose-500 text-white shadow-xs btn-press flex items-center justify-center gap-1";
        content.classList.remove("hidden");
      } else {
        btn.className = "flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 btn-press flex items-center justify-center gap-1";
        content.classList.add("hidden");
      }
    }
  });
  safeCreateIcons();
}

function openLightbox(src, caption = "") {
  const modal = document.getElementById("lightbox-modal");
  const img = document.getElementById("lightbox-image");
  const cap = document.getElementById("lightbox-caption");
  if (!modal || !img) return;

  img.src = src;
  if (cap) cap.textContent = caption;

  modal.style.display = "flex";
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
  requestAnimationFrame(() => {
    modal.classList.add("active");
  });
  safeCreateIcons();
}

function closeLightbox() {
  const modal = document.getElementById("lightbox-modal");
  if (!modal) return;

  modal.classList.remove("active");
  setTimeout(() => {
    modal.classList.add("hidden");
    modal.style.display = "none";
    const guideModal = document.getElementById("ring-size-guide-modal");
    const cartDrawer = document.getElementById("cart-drawer");
    const isGuideOpen = guideModal && !guideModal.classList.contains("hidden");
    const isCartOpen = cartDrawer && !cartDrawer.classList.contains("hidden");
    if (!state.selectedProductForModal && !isGuideOpen && !isCartOpen) {
      document.body.classList.remove("overflow-hidden");
    }
  }, 220);
}

function filterSizeTable(query, tableId = "size-table-body") {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  const q = query.toLowerCase().trim();
  const rows = tbody.querySelectorAll("tr");
  rows.forEach(row => {
    if (!q) {
      row.style.display = "";
      return;
    }
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? "" : "none";
  });
}

// ==============================================================================
// ==============================================================================
// GESTIÓN DEL MODO NOCHE (DARK MODE)
// ==============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem("yamiki_theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = savedTheme === "dark" || (!savedTheme && prefersDark);
  applyTheme(isDark, false);
}

function applyTheme(isDark, shouldNotify = false) {
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  updateThemeIcons(isDark);
  if (shouldNotify) {
    showToast(isDark ? "🌙 Modo Noche activado" : "☀️ Modo Día activado", null, "info");
  }
}

function toggleDarkMode() {
  const isCurrentlyDark = document.documentElement.classList.contains("dark");
  const newDark = !isCurrentlyDark;
  localStorage.setItem("yamiki_theme", newDark ? "dark" : "light");
  applyTheme(newDark, true);
}

function updateThemeIcons(isDark) {
  const icon = document.getElementById("theme-toggle-icon");
  if (icon) {
    icon.setAttribute("data-lucide", isDark ? "sun" : "moon");
  }
  const mobileIcon = document.getElementById("mobile-theme-icon");
  if (mobileIcon) {
    mobileIcon.setAttribute("data-lucide", isDark ? "sun" : "moon");
  }
  const mobileText = document.getElementById("mobile-theme-toggle-text");
  if (mobileText) {
    mobileText.textContent = isDark ? "☀️ Modo Día" : "🌙 Modo Noche";
    if (isDark) {
      mobileText.className = "px-3 py-1.5 rounded-full text-xs font-bold transition btn-press bg-amber-400 text-gray-950 shadow-xs";
    } else {
      mobileText.className = "px-3 py-1.5 rounded-full text-xs font-bold transition btn-press bg-sage-800 text-white shadow-xs";
    }
  }
  if (typeof lucide !== "undefined") {
    safeCreateIcons();
  }
}

// NOTIFICACIONES TOAST ESTILO "SONNER" (ALTO CONTRASTE Y LEGIBILIDAD)
// ==============================================================================
function showToast(message, image = null, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  // Feedback táctil suave para dispositivos móviles (Apple Style)
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(12); } catch (_) {}
  }

  const toast = document.createElement("div");
  // Sonner styling: fondo oscuro obsidian #000000 con texto blanco brillante 100% visible
  toast.className = "toast-item flex items-center gap-3 p-3.5 rounded-2xl border backdrop-blur-md transition-all shadow-xl bg-[#000000] text-white border-white/20";

  let imageHtml = image 
    ? `<img src="${image}" alt="Joya" class="w-11 h-11 rounded-xl object-cover bg-black/40 flex-shrink-0 border border-white/20 shadow-xs" onerror="handleProductImageError(this)" />`
    : `<div class="w-10 h-10 rounded-xl bg-sage-800/90 text-rose-300 flex items-center justify-center flex-shrink-0 border border-white/10 shadow-xs"><i data-lucide="${type === "info" ? "sparkles" : "shopping-bag"}" class="w-5 h-5 text-emerald-400"></i></div>`;

  toast.innerHTML = `
    ${imageHtml}
    <div class="flex-grow min-w-0 pr-1">
      <p class="text-xs font-bold text-white leading-snug drop-shadow-xs">${message}</p>
      ${type === "success" ? `<button onclick="toggleCartDrawer(true)" class="inline-flex items-center gap-1 text-[11px] text-emerald-300 hover:text-white underline font-semibold mt-1 block btn-press transition">Ver Carrito →</button>` : ""}
    </div>
    <button onclick="dismissToast(this.parentElement)" class="text-white/60 hover:text-white p-1 rounded-lg transition btn-press flex-shrink-0" aria-label="Cerrar notificación">
      <i data-lucide="x" class="w-4 h-4"></i>
    </button>
  `;

  container.appendChild(toast);
  safeCreateIcons();

  const dismissTimer = setTimeout(() => {
    dismissToast(toast);
  }, 4000);

  toast.dataset.timer = dismissTimer;
}

function dismissToast(toastEl) {
  if (!toastEl || !toastEl.classList || typeof toastEl.classList.contains !== "function" || toastEl.classList.contains("toast-exit")) return;
  toastEl.classList.add("toast-exit");
  setTimeout(() => {
    if (toastEl.parentElement) toastEl.remove();
  }, 190);
}

function formatCurrency(amount) {
  return `${BUSINESS_CONFIG.currencySymbol}${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function prevModalPhoto() {
  if (state.currentView === "producto") {
    changeProductPagePhoto(-1);
    return;
  }
}
window.prevModalPhoto = prevModalPhoto;

function nextModalPhoto() {
  if (state.currentView === "producto") {
    changeProductPagePhoto(1);
    return;
  }
}
window.nextModalPhoto = nextModalPhoto;

function setupEventListeners() {
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      state.currentPage = 1;
      const clearBtn = document.getElementById("search-clear-btn");
      if (clearBtn) {
        if (state.searchQuery.trim().length > 0) clearBtn.classList.remove("hidden");
        else clearBtn.classList.add("hidden");
      }
      renderProducts();
    });
  }

  // Cerrar menús desplegables al hacer clic en cualquier parte exterior
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".dropdown-filter-wrapper")) {
      closeAllFilterDropdowns();
    }
  });

  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenuBtn) {
    mobileMenuBtn.onclick = (e) => {
      e.stopPropagation();
      toggleMobileMenu();
    };
  }

  // Cerrar menú móvil al hacer clic fuera
  document.addEventListener("click", (e) => {
    if (mobileMenu && !mobileMenu.classList.contains("hidden")) {
      if (!mobileMenu.contains(e.target) && mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
        toggleMobileMenu(false);
      }
    }
  });

  const productModal = document.getElementById("product-modal");
  if (productModal) {
    productModal.addEventListener("click", (e) => {
      if (e.target === productModal) closeProductModal();
    });
  }

  // Habilitar swipe táctil en móvil y arrastre con ratón en PC para la galería del modal
  const modalImgContainer = document.getElementById("modal-image-container");
  if (modalImgContainer) {
    enableSwipeGesture(
      modalImgContainer,
      () => nextModalPhoto(),
      () => prevModalPhoto(),
      false
    );
  }

  // Navegación por teclado en PC (flecha izquierda/derecha y escape)
  document.addEventListener("keydown", (e) => {
    // Si la vista actual es la subpágina dedicada de la joya
    if (state.currentView === "producto") {
      const lb = document.getElementById("lightbox-modal");
      const isLbOpen = lb && !lb.classList.contains("hidden") && lb.style.display !== "none";

      if (e.key === "ArrowLeft") {
        changeProductPagePhoto(-1);
      } else if (e.key === "ArrowRight") {
        changeProductPagePhoto(1);
      } else if (e.key === "Escape") {
        if (isLbOpen) {
          closeLightbox();
        } else {
          returnToCatalog();
        }
      }
      return;
    }

    const modal = document.getElementById("product-modal");
    if (!modal || modal.classList.contains("hidden") || modal.style.display === "none") return;

    if (e.key === "ArrowLeft") {
      prevModalPhoto();
    } else if (e.key === "ArrowRight") {
      nextModalPhoto();
    } else if (e.key === "Escape") {
      closeProductModal();
    }
  });

  const guideModal = document.getElementById("ring-size-guide-modal");
  if (guideModal) {
    guideModal.addEventListener("click", (e) => {
      if (e.target === guideModal) closeRingSizeGuideModal();
    });
  }

  // Pausar carrusel al pasar el cursor
  const carouselContainer = document.getElementById("carousel-container");
  if (carouselContainer) {
    carouselContainer.addEventListener("mouseenter", () => {
      stopCarouselAutoPlay();
    });
    carouselContainer.addEventListener("mouseleave", () => {
      startCarouselAutoPlay();
    });
  }

  window.addEventListener("resize", () => {
    const newIsMobile = window.innerWidth < 640;
    if (newIsMobile !== state.heroIsMobile) {
      state.heroIsMobile = newIsMobile;
      renderHeroRoles();
    }
    updateCarouselPosition(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllFilterDropdowns();
      closeLightbox();
      closeProductModal();
      closeRingSizeGuideModal();
      toggleCartDrawer(false);
    }
    
    // Navegación con flechas del teclado para el carrusel 3D del Hero
    const productModal = document.getElementById("product-modal");
    const isModalOpen = productModal && !productModal.classList.contains("hidden");
    if (!isModalOpen) {
      if (e.key === "ArrowRight") navigateHero("next");
      if (e.key === "ArrowLeft") navigateHero("prev");
    }
  });

  // Control de la barra de navegación permanente y resaltado de pestaña activa
  const mainHeader = document.querySelector("header.glass-nav");
  const navTabLinks = document.querySelectorAll(".desktop-nav .nav-tab-link");
  const navSections = ["inicio", "novedades-carousel", "catalogo", "guia-medidas"];

  function handleNavbarScroll() {
    if (mainHeader) {
      if (window.scrollY > 15) {
        mainHeader.classList.add("is-scrolled");
      } else {
        mainHeader.classList.remove("is-scrolled");
      }
    }

    if (navTabLinks.length && navSections.length) {
      const scrollPos = window.scrollY + 120;
      let activeSectionId = navSections[0];

      for (const sectionId of navSections) {
        const secEl = document.getElementById(sectionId);
        if (secEl) {
          const top = secEl.offsetTop;
          if (scrollPos >= top) {
            activeSectionId = sectionId;
          }
        }
      }

      navTabLinks.forEach(link => {
        const targetId = (link.getAttribute("href") || "").replace("#", "");
        if (targetId === activeSectionId) {
          link.classList.add("active-nav-tab");
        } else {
          link.classList.remove("active-nav-tab");
        }
      });
    }
  }

  window.addEventListener("scroll", handleNavbarScroll, { passive: true });
  handleNavbarScroll();
}


// ==============================================================================
// SUBPÁGINA DEDICADA DE PRODUCTO / JOYA (ESTRUCTURA SPA CON ENLACES DIRECTOS)
// ==============================================================================

function findProductById(idOrSlug) {
  if (!idOrSlug) return null;
  const target = String(idOrSlug).toLowerCase().trim();

  // 1. Coincidencia directa por ID o GroupId (id_aliexpress) o SKU
  let found = PRODUCTS.find(p => {
    if (String(p.id).toLowerCase() === target) return true;
    if (p.groupId && String(p.groupId).toLowerCase() === target) return true;
    if (p.code && p.code.toLowerCase() === target) return true;
    if (p.variants && p.variants.some(v => 
      String(v.id).toLowerCase() === target || 
      (v.sku && v.sku.toLowerCase() === target) ||
      (v.color && v.color.toLowerCase() === target)
    )) return true;
    return false;
  });

  if (found) return found;

  // 2. Coincidencia parcial si target es un SKU o identificador corto o está en el título
  found = PRODUCTS.find(p => {
    if (p.code && p.code.toLowerCase().includes(target)) return true;
    if (p.groupId && String(p.groupId).toLowerCase().includes(target)) return true;
    if (p.name && p.name.toLowerCase().includes(target)) return true;
    return false;
  });

  return found || null;
}

/**
 * Abre la subpágina dedicada de una joya y actualiza la URL para compartir
 */
function navigateToProduct(productId, defaultSize = null, defaultVariantId = null, options = {}) {
  // Asegurar que menús, gaveta de carrito o modales abiertos se cierren limpiamente
  if (typeof closeCart === "function") closeCart();
  if (typeof closeProductModal === "function") closeProductModal(false);
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenu && !mobileMenu.classList.contains("hidden")) mobileMenu.classList.add("hidden");

  const prod = findProductById(productId);
  if (!prod) {
    if (!PRODUCTS || PRODUCTS.length === 0) {
      state.pendingProductRoute = { productId, defaultSize, defaultVariantId };
      return;
    }
    console.warn("Joya no encontrada:", productId);
    navigateTo("catalogo");
    return;
  }

  // Guardar posición previa de scroll y vista de procedencia
  if (state.currentView !== "producto") {
    state.catalogScrollPosition = window.pageYOffset || window.scrollY || 0;
    state.sourceViewBeforeProduct = state.currentView || "catalogo";
  }

  // Activar vista producto
  navigateTo("producto", { pushState: false });

  // Renderizar la joya en view-producto
  renderProductPage(prod, defaultSize, defaultVariantId);

  // Actualizar título de la pestaña del navegador
  try {
    const cleanT = cleanOrderTitle(prod.name);
    document.title = `${cleanT} | Yamiki Joyería S925`;
  } catch (e) {}

  // Actualizar URL limpia para compartir
  if (options.pushState !== false) {
    const slug = encodeURIComponent(prod.groupId || prod.code || prod.id);
    history.pushState({ type: "producto", id: prod.id }, "", `/joya/${slug}`);
  }

  window.scrollTo({ top: 0, behavior: options.instantScroll ? "instant" : "smooth" });
}

/**
 * Regresa suavemente al catálogo o a la vista de origen restaurando la posición de scroll
 */
function returnToCatalog() {
  document.title = "Yamiki Joyería | Plata Esterlina Ley S925";
  const target = state.sourceViewBeforeProduct || "catalogo";
  const savedY = state.catalogScrollPosition || 0;

  if (target === "home") {
    navigateTo("home", { pushState: true });
  } else {
    navigateTo("catalogo", { pushState: true, restoreScroll: true });
  }

  if (typeof savedY === "number" && savedY > 0) {
    window.scrollTo({ top: savedY, behavior: "instant" });
    requestAnimationFrame(() => window.scrollTo({ top: savedY, behavior: "instant" }));
    setTimeout(() => window.scrollTo({ top: savedY, behavior: "instant" }), 60);
  }
}

/**
 * Renderiza todos los datos, fotos, variantes y recomendaciones en view-producto
 */
function renderProductPage(prod, defaultSize = null, defaultVariantId = null) {
  if (!prod) return;

  // 1. Recopilar y consolidar fotos garantizando que foto_01 esté primero (#1)
  const photos = [];
  if (prod.image) photos.push(prod.image);
  if (Array.isArray(prod.gallery)) {
    prod.gallery.forEach(u => {
      if (u && !photos.includes(u)) photos.push(u);
    });
  }
  if (prod.variants && prod.variants.length > 0) {
    prod.variants.forEach(v => {
      if (v.photo && !photos.includes(v.photo)) photos.push(v.photo);
    });
  }

  // Foto 01 como portada si existe
  const f01Idx = photos.findIndex(u => u && (u.includes("foto_01") || u.includes("foto_1.")));
  if (f01Idx > 0) {
    const [f01] = photos.splice(f01Idx, 1);
    photos.unshift(f01);
  }

  // Variante seleccionada inicialmente:
  // Si tiene múltiples variantes, NO forzar ninguna al abrir para que muestre la foto 1 limpia (según petición)
  let activeVariant = null;
  if (defaultVariantId && prod.variants) {
    activeVariant = prod.variants.find(v => String(v.id) === String(defaultVariantId));
  } else if (prod.variants && prod.variants.length === 1) {
    activeVariant = prod.variants[0];
  }

  // Talla inicial
  const activeSizes = activeVariant ? activeVariant.sizes : prod.sizes;
  let activeSize = defaultSize;
  if (!activeSize && activeSizes && activeSizes.length > 0) {
    activeSize = activeSizes[0];
  }

  state.currentProductPage = {
    product: prod,
    photos: photos,
    currentPhotoIndex: 0,
    selectedVariant: activeVariant,
    selectedSize: activeSize,
    quantity: 1
  };

  // Breadcrumbs
  const bCat = document.getElementById("product-page-breadcrumb-cat");
  if (bCat) bCat.textContent = getCategoryLabel(prod.category);
  const bTitle = document.getElementById("product-page-breadcrumb-title");
  if (bTitle) bTitle.textContent = cleanOrderTitle(prod.name);

  // Categoría & SKU Tag
  const cTag = document.getElementById("product-page-category-tag");
  if (cTag) cTag.textContent = getCategoryLabel(prod.category);
  const skuTag = document.getElementById("product-page-sku-tag");
  if (skuTag) skuTag.textContent = `SKU: ${prod.code || prod.groupId || 'YK'}`;

  // Título
  const titleEl = document.getElementById("product-page-title");
  if (titleEl) titleEl.textContent = cleanOrderTitle(prod.name);

  // Descripción
  const descEl = document.getElementById("product-page-description");
  if (descEl) {
    let dText = prod.description || prod.name || "";
    if (prod.notes) dText += `\n\n📌 Especificaciones:\n${prod.notes}`;
    descEl.textContent = dText;
  }

  // Cantidad inicial
  const qtyEl = document.getElementById("product-page-quantity");
  if (qtyEl) qtyEl.textContent = "1";

  // Precios
  updateProductPagePrice();

  // Galería y Miniaturas
  setProductPagePhoto(0);
  renderProductPageThumbnails();

  // Variantes
  renderProductPageVariantPills();

  // Tallas
  renderProductPageSizes();

  // Joyas Relacionadas
  renderProductPageRelated();

  // Gestos táctiles para deslizar fotos en móvil
  setupProductPageTouchGestures();

  safeCreateIcons();
}

function updateProductPagePrice() {
  const pState = state.currentProductPage;
  if (!pState) return;
  const prod = pState.product;
  const v = pState.selectedVariant;

  const currentPrice = v ? v.price : prod.price;
  const origPrice = v ? v.originalPrice : prod.originalPrice;
  const isDiscount = (v && v.isDiscount) || prod.hasDiscount || (origPrice && origPrice > currentPrice);

  const priceEl = document.getElementById("product-page-price");
  if (priceEl) priceEl.textContent = `$${Math.round(currentPrice)}`;

  const origPriceEl = document.getElementById("product-page-orig-price");
  const savingsBadge = document.getElementById("product-page-savings-badge");

  if (isDiscount && origPrice && origPrice > currentPrice) {
    if (origPriceEl) {
      origPriceEl.textContent = `$${Math.round(origPrice)} MXN`;
      origPriceEl.classList.remove("hidden");
    }
    if (savingsBadge) {
      const ahorro = Math.round(origPrice - currentPrice);
      const pct = Math.round(((origPrice - currentPrice) / origPrice) * 100);
      savingsBadge.textContent = `Ahorras $${ahorro} MXN (-${pct}%)`;
      savingsBadge.classList.remove("hidden");
    }
  } else {
    if (origPriceEl) origPriceEl.classList.add("hidden");
    if (savingsBadge) savingsBadge.classList.add("hidden");
  }

  // Actualizar Badge en la foto
  const badgeEl = document.getElementById("product-page-badge");
  if (badgeEl) {
    if (isDiscount && origPrice && origPrice > currentPrice) {
      const pct = Math.round(((origPrice - currentPrice) / origPrice) * 100);
      badgeEl.textContent = `🔥 -${pct}% OFF`;
      badgeEl.className = "px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-[#e72380] text-white shadow-md";
    } else {
      badgeEl.textContent = "PLATA S925";
      badgeEl.className = "px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-rose-500 text-white shadow-md";
    }
  }
}

function changeProductPagePhoto(dir) {
  const pState = state.currentProductPage;
  if (!pState || !pState.photos || pState.photos.length <= 1) return;
  let newIdx = pState.currentPhotoIndex + dir;
  if (newIdx < 0) newIdx = pState.photos.length - 1;
  if (newIdx >= pState.photos.length) newIdx = 0;
  setProductPagePhoto(newIdx);
}

function setProductPagePhoto(index) {
  const pState = state.currentProductPage;
  if (!pState || !pState.photos || pState.photos.length === 0) return;

  if (index < 0) index = pState.photos.length - 1;
  if (index >= pState.photos.length) index = 0;
  pState.currentPhotoIndex = index;

  const currentUrl = pState.photos[index];
  const imgEl = document.getElementById("product-page-main-img");
  if (imgEl) imgEl.src = currentUrl;

  const counterEl = document.getElementById("product-page-photo-counter");
  if (counterEl) counterEl.textContent = `${index + 1} / ${pState.photos.length}`;

  updateProductPageThumbnailsActive();

  // Sincronización bidireccional: si la foto corresponde a una variante, seleccionarla automáticamente
  if (pState.product && pState.product.variants && pState.product.variants.length > 1) {
    const currentBase = currentUrl.split("/").pop().split("?")[0];
    const matchVar = pState.product.variants.find(v => {
      if (!v.photo) return false;
      return v.photo === currentUrl || v.photo.split("/").pop().split("?")[0] === currentBase;
    });
    if (matchVar && (!pState.selectedVariant || pState.selectedVariant.id !== matchVar.id)) {
      pState.selectedVariant = matchVar;
      renderProductPageVariantPills();
      updateProductPagePrice();
      renderProductPageSizes();
    }
  }
}

function renderProductPageThumbnails() {
  const pState = state.currentProductPage;
  const container = document.getElementById("product-page-thumbnails");
  if (!container || !pState || !pState.photos) return;

  if (pState.photos.length <= 1) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = pState.photos.map((url, idx) => {
    const isActive = idx === pState.currentPhotoIndex;
    return `
      <button 
        type="button" 
        onclick="setProductPagePhoto(${idx})" 
        class="product-thumb-item relative w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 lg:w-22 lg:h-22 rounded-2xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${isActive ? 'border-[#e72380] ring-2 ring-[#e72380]/40 scale-[1.02] opacity-100 shadow-md' : 'border-sage-200 dark:border-white/10 opacity-70 hover:opacity-100 hover:border-sage-400 dark:hover:border-white/30'}"
        data-thumb-idx="${idx}"
        title="Ver foto ${idx + 1}"
      >
        <img 
          src="${url}" 
          alt="Miniatura ${idx + 1}" 
          loading="lazy"
          decoding="async"
          class="w-full h-full object-cover pointer-events-none" 
          onerror="handleProductImageError(this)" 
        />
      </button>
    `;
  }).join("");
}

function updateProductPageThumbnailsActive() {
  const pState = state.currentProductPage;
  if (!pState) return;
  const currentIdx = pState.currentPhotoIndex;
  const container = document.getElementById("product-page-thumbnails");
  
  document.querySelectorAll(".product-thumb-item").forEach((thumb, idx) => {
    if (idx === currentIdx) {
      thumb.className = "product-thumb-item relative w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 lg:w-22 lg:h-22 rounded-2xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer border-[#e72380] ring-2 ring-[#e72380]/40 scale-[1.02] opacity-100 shadow-md";
      
      // Auto-desplazamiento confinado EXCLUSIVAMENTE al contenedor (NUNCA desplazar la página principal)
      if (container && typeof container.scrollTo === "function") {
        const isVertical = typeof window !== "undefined" && window.innerWidth >= 768;
        if (isVertical) {
          const tTop = thumb.offsetTop;
          const tHeight = thumb.offsetHeight;
          const cTop = container.scrollTop;
          const cHeight = container.clientHeight;
          if (tTop < cTop) {
            container.scrollTo({ top: tTop, behavior: "smooth" });
          } else if (tTop + tHeight > cTop + cHeight) {
            container.scrollTo({ top: tTop + tHeight - cHeight, behavior: "smooth" });
          }
        } else {
          const tLeft = thumb.offsetLeft;
          const tWidth = thumb.offsetWidth;
          const cLeft = container.scrollLeft;
          const cWidth = container.clientWidth;
          if (tLeft < cLeft) {
            container.scrollTo({ left: tLeft, behavior: "smooth" });
          } else if (tLeft + tWidth > cLeft + cWidth) {
            container.scrollTo({ left: tLeft + tWidth - cWidth, behavior: "smooth" });
          }
        }
      }
    } else {
      thumb.className = "product-thumb-item relative w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 lg:w-22 lg:h-22 rounded-2xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer border-sage-200 dark:border-white/10 opacity-70 hover:opacity-100 hover:border-sage-400 dark:hover:border-white/30";
    }
  });
}

function renderProductPageVariantPills() {
  const pState = state.currentProductPage;
  const section = document.getElementById("product-page-variants-section");
  const list = document.getElementById("product-page-variants-list");
  const nameLabel = document.getElementById("product-page-selected-variant-name");
  if (!section || !list || !pState) return;

  const prod = pState.product;
  if (!prod.variants || prod.variants.length <= 1) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  const selectedV = pState.selectedVariant;
  
  if (nameLabel) {
    nameLabel.textContent = selectedV ? cleanOrderVariantLabel(selectedV.color || selectedV.sku) : "Toca uno para elegir";
  }

  list.innerHTML = prod.variants.map((v, idx) => {
    const isSelected = selectedV && selectedV.id === v.id;
    const vName = cleanOrderVariantLabel(v.color || v.sku || `Modelo ${idx + 1}`);
    const vPhoto = v.photo || prod.image;
    const vPrice = Math.round(v.price || prod.price);

    return `
      <button 
        type="button" 
        onclick="selectProductPageVariant('${v.id}')" 
        class="group relative flex items-center gap-2 px-3 py-2 rounded-2xl border transition-all text-xs font-bold cursor-pointer ${isSelected ? 'border-[#e72380] bg-rose-500/15 text-rose-600 dark:text-[#ff3d9a] ring-1 ring-[#e72380]' : 'border-sage-200 dark:border-white/10 bg-white dark:bg-white/5 text-sage-800 dark:text-gray-300 hover:border-sage-400 dark:hover:border-white/30'}"
      >
        <img 
          src="${vPhoto}" 
          alt="${vName}" 
          loading="lazy"
          decoding="async"
          class="w-7 h-7 rounded-lg object-cover border border-white/20 shrink-0" 
          onerror="handleProductImageError(this)" 
        />
        <span class="truncate max-w-[130px]">${vName}</span>
        <span class="font-mono text-[11px] px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-rose-500 text-white font-extrabold' : 'bg-sage-100 dark:bg-white/10 text-sage-700 dark:text-gray-300'}">$${vPrice}</span>
      </button>
    `;
  }).join("");
}

function selectProductPageVariant(variantId) {
  const pState = state.currentProductPage;
  if (!pState || !pState.product || !pState.product.variants) return;
  const v = pState.product.variants.find(x => x.id === variantId);
  if (!v) return;

  pState.selectedVariant = v;
  renderProductPageVariantPills();
  updateProductPagePrice();
  renderProductPageSizes();

  // Sincronizar foto hacia la galería
  if (v.photo) {
    const vBase = v.photo.split("/").pop().split("?")[0];
    const photoIdx = pState.photos.findIndex(u => u === v.photo || u.split("/").pop().split("?")[0] === vBase);
    if (photoIdx !== -1) {
      setProductPagePhoto(photoIdx);
    }
  }
}

function renderProductPageSizes() {
  const pState = state.currentProductPage;
  const section = document.getElementById("product-page-sizes-section");
  const list = document.getElementById("product-page-sizes-list");
  if (!section || !list || !pState) return;

  const prod = pState.product;
  const v = pState.selectedVariant;
  const sizes = (v && v.sizes && v.sizes.length > 0) ? v.sizes : prod.sizes;

  if (!prod.isRing || !sizes || sizes.length === 0) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");
  
  if (!pState.selectedSize || !sizes.includes(pState.selectedSize)) {
    pState.selectedSize = sizes[0];
  }

  list.innerHTML = sizes.map(s => {
    const isSelected = pState.selectedSize === s;
    return `
      <button 
        type="button" 
        onclick="selectProductPageSize('${s}')" 
        class="px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${isSelected ? 'border-[#e72380] bg-rose-500 text-white shadow-sm ring-1 ring-[#e72380]' : 'border-sage-200 dark:border-white/10 bg-white dark:bg-white/5 text-sage-800 dark:text-gray-300 hover:border-sage-400 dark:hover:border-white/20'}"
      >
        ${s === 'Ajustable' ? '✨ Talla Ajustable' : `Talla ${s}`}
      </button>
    `;
  }).join("");
}

function selectProductPageSize(size) {
  const pState = state.currentProductPage;
  if (!pState) return;
  pState.selectedSize = size;
  renderProductPageSizes();
}

function changeProductPageQuantity(delta) {
  const pState = state.currentProductPage;
  if (!pState) return;
  let q = (pState.quantity || 1) + delta;
  if (q < 1) q = 1;
  if (q > 10) q = 10;
  pState.quantity = q;
  const qtyEl = document.getElementById("product-page-quantity");
  if (qtyEl) qtyEl.textContent = String(q);
}

function handleProductPageAddToCart() {
  const pState = state.currentProductPage;
  if (!pState) return;
  const prod = pState.product;

  // Si tiene varios modelos y el cliente no ha seleccionado uno
  if (prod.variants && prod.variants.length > 1 && !pState.selectedVariant) {
    const vSection = document.getElementById("product-page-variants-section");
    if (vSection) {
      vSection.scrollIntoView({ behavior: "smooth", block: "center" });
      vSection.classList.add("ring-2", "ring-[#e72380]", "rounded-2xl", "p-2");
      setTimeout(() => vSection.classList.remove("ring-2", "ring-[#e72380]", "p-2"), 2000);
    }
    showToast("Elige tu modelo", "Por favor selecciona el color o diseño de tu joya arriba.", "info");
    return;
  }

  const v = pState.selectedVariant;
  const size = pState.selectedSize;
  const qty = pState.quantity || 1;

  addToCart(prod.id, qty, size, null, v);
  toggleCartDrawer(true);
}

function handleProductPageWhatsAppOrder() {
  const pState = state.currentProductPage;
  if (!pState) return;
  const prod = pState.product;

  // Rate Limiting anti-spam
  const now = Date.now();
  const lastOrderTime = (typeof sessionStorage !== "undefined" && sessionStorage.getItem) 
    ? parseInt(sessionStorage.getItem("yamiki_last_order_ts") || "0", 10) 
    : (state.lastOrderTimestamp || 0);
  if (lastOrderTime && (now - lastOrderTime < CART_LIMITS.ORDER_COOLDOWN_MS)) {
    const remainingSec = Math.ceil((CART_LIMITS.ORDER_COOLDOWN_MS - (now - lastOrderTime)) / 1000);
    showToast("Espera un momento", `Por favor espera ${remainingSec}s antes de enviar otro pedido por WhatsApp.`, "info");
    return;
  }

  // Si tiene varios modelos y el cliente no ha seleccionado uno
  if (prod.variants && prod.variants.length > 1 && !pState.selectedVariant) {
    const vSection = document.getElementById("product-page-variants-section");
    if (vSection) {
      vSection.scrollIntoView({ behavior: "smooth", block: "center" });
      vSection.classList.add("ring-2", "ring-[#e72380]", "rounded-2xl", "p-2");
      setTimeout(() => vSection.classList.remove("ring-2", "ring-[#e72380]", "p-2"), 2000);
    }
    showToast("Elige tu modelo", "Por favor selecciona el color o diseño de tu joya antes de pedir.", "info");
    return;
  }

  const v = pState.selectedVariant;
  const size = pState.selectedSize;
  const qty = pState.quantity || 1;
  const price = v ? v.price : prod.price;
  const total = price * qty;
  const cleanTitle = cleanOrderTitle(prod.name);
  const cleanVar = v ? cleanOrderVariantLabel(v.color || v.sku) : null;

  let msg = `¡Hola *Yamiki*! Deseo pedir la siguiente joya en *Plata Ley S925*:\n\n`;
  msg += `💎 *Joya:* ${cleanTitle}\n`;
  if (cleanVar && cleanVar !== "Única" && cleanVar !== "Modelo Principal") {
    msg += `🎨 *Modelo/Color:* ${cleanVar}\n`;
  }
  if (prod.isRing && size) {
    msg += `📏 *Talla:* ${size}\n`;
  }
  msg += `🔢 *Cantidad:* ${qty} pza(s) x $${price}\n`;
  msg += `💰 *Total:* *$${total} MXN*\n\n`;
  msg += `¿Me podrían confirmar disponibilidad y datos para realizar mi pedido? ¡Muchas gracias!`;

  const waUrl = `https://api.whatsapp.com/send?phone=${BUSINESS_CONFIG.whatsappNumber}&text=${encodeURIComponent(msg)}`;
  window.open(waUrl, "_blank");
}

function openProductPageLightbox() {
  const pState = state.currentProductPage;
  if (!pState || !pState.photos || pState.photos.length === 0) return;
  const currentPhoto = pState.photos[pState.currentPhotoIndex];
  const prod = pState.product;
  const caption = prod ? `${cleanOrderTitle(prod.name)} (Foto ${pState.currentPhotoIndex + 1} de ${pState.photos.length})` : "Yamiki Joyería S925";
  openLightbox(currentPhoto, caption);
}

function shareCurrentProduct() {
  const pState = state.currentProductPage;
  const url = window.location.href;
  const title = pState && pState.product ? pState.product.name : "Joyería Yamiki";

  if (navigator.share) {
    navigator.share({
      title: title,
      text: `Mira esta hermosa joya en Yamiki Joyería S925:`,
      url: url
    }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showToast("¡Enlace copiado!", "El link de la joya se copió a tu portapapeles para compartir.", "success");
    }).catch(() => {
      prompt("Copia este enlace para compartir:", url);
    });
  } else {
    prompt("Copia este enlace para compartir:", url);
  }
}

function renderProductPageRelated() {
  const pState = state.currentProductPage;
  const grid = document.getElementById("product-page-related-grid");
  if (!grid || !pState) return;

  const currentProd = pState.product;
  let related = PRODUCTS
    .filter(p => p.id !== currentProd.id && p.category === currentProd.category && p.stock)
    .slice(0, 4);

  if (related.length === 0) {
    related = PRODUCTS.filter(p => p.id !== currentProd.id && p.stock).slice(0, 4);
  }

  grid.innerHTML = related.map(prod => {
    return `
      <div 
        onclick="navigateToProduct('${prod.id}')"
        class="group bg-white dark:bg-[#121915] rounded-2xl overflow-hidden border border-sage-200/80 dark:border-white/10 hover:border-rose-400 dark:hover:border-rose-500/50 transition-all cursor-pointer flex flex-col shadow-xs hover:shadow-md"
      >
        <div class="aspect-square w-full overflow-hidden bg-sage-50 dark:bg-black/30 relative">
          <img 
            src="${prod.image}" 
            alt="${escapeHtml(prod.name)}" 
            loading="lazy"
            decoding="async"
            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
            onerror="handleProductImageError(this)" 
          />
          <div class="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold bg-black/60 text-white backdrop-blur-xs">
            ${getCategoryLabel(prod.category)}
          </div>
        </div>
        <div class="p-3 flex flex-col flex-grow justify-between">
          <h4 class="text-xs font-bold text-sage-900 dark:text-white line-clamp-1 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
            ${cleanOrderTitle(prod.name)}
          </h4>
          <div class="mt-1 flex items-baseline justify-between">
            <span class="text-xs sm:text-sm font-extrabold text-rose-600 dark:text-[#ff3d9a]">
              $${Math.round(prod.price)} MXN
            </span>
            <span class="text-[10px] text-sage-400 dark:text-gray-400 font-bold">Ver joya →</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  safeCreateIcons();
}

let productTouchStartX = 0;
let productTouchEndX = 0;

function setupProductPageTouchGestures() {
  const box = document.getElementById("product-page-image-box");
  if (!box || box._hasSwipeListener) return;
  box._hasSwipeListener = true;

  box.addEventListener("touchstart", (e) => {
    productTouchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  box.addEventListener("touchend", (e) => {
    productTouchEndX = e.changedTouches[0].screenX;
    const diff = productTouchEndX - productTouchStartX;
    if (Math.abs(diff) > 40) {
      if (diff < 0) {
        changeProductPagePhoto(1);
      } else {
        changeProductPagePhoto(-1);
      }
    }
  }, { passive: true });
}
