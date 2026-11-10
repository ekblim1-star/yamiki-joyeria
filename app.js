
// ==============================================================================
// SINCRONIZACIÓN EN VIVO CON SUPABASE (CATÁLOGO DINÁMICO PROTEGIDO)
// ==============================================================================
const SUPABASE_STORE_CONFIG = {
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
            photo: vRow.foto_principal || "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80",
            sizes: vSizes,
            displaySizes: vDisplaySizes,
            stock: !vAgotado,
            badge: vRow.badge,
            isDiscount: vRow.es_destacado === true,
            isFeatured: vRow.es_novedad === true
          };
        });

        function getNum(u) {
          if (!u) return 999;
          const m = u.match(/foto_0*(\d+)/i) || u.match(/_0*(\d+)\.[a-z0-9]+$/i);
          return m ? parseInt(m[1], 10) : 900;
        }

        // Galería de fotos combinada ordenada estrictamente (1 al 5...)
        const generalGalleries = [];
        rows.forEach(r => {
          if (Array.isArray(r.galeria_fotos)) {
            r.galeria_fotos.forEach(u => {
              if (u && !generalGalleries.includes(u)) generalGalleries.push(u);
            });
          }
        });
        generalGalleries.sort((a, b) => getNum(a) - getNum(b));
        const coverPhoto = (generalGalleries.length > 0) ? generalGalleries[0] : (primaryRow.foto_principal || variants[0].photo);

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
          gallery: generalGalleries
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
  heroIsMobile: typeof window !== "undefined" ? window.innerWidth < 640 : false
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
  try { if (window.lucide && typeof lucide.createIcons === "function") lucide.createIcons(); } catch (e) { console.error("Lucide error:", e); }
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

  const generalWhatsappLink = `https://wa.me/${BUSINESS_CONFIG.whatsappNumber}?text=${encodeURIComponent(`¡Hola ${BUSINESS_CONFIG.brandName}! Me gustaría consultar sobre su catálogo de joyería de plata ley S925 sobre pedido.`)}`;
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
// GESTOR TÁCTIL Y DESLIZAMIENTO CON EL DEDO (SWIPE FLUIDO EN MÓVILES)
// ==============================================================================
function enableSwipeGesture(element, onSwipeLeft, onSwipeRight) {
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
    stopCarouselAutoPlay();
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

    // Si el deslizamiento horizontal es mayor al vertical y supera el umbral de 35px
    if (absX > 35 && absX > absY) {
      if (diffX < 0 && typeof onSwipeLeft === "function") {
        onSwipeLeft();
      } else if (diffX > 0 && typeof onSwipeRight === "function") {
        onSwipeRight();
      }
    } else {
      startCarouselAutoPlay();
    }
  }, { passive: true });

  element.addEventListener("touchcancel", () => {
    isSwiping = false;
    startCarouselAutoPlay();
  }, { passive: true });

  // Mouse Drag Events (Prueba en PC con ratón)
  let isMouseDown = false;
  let mouseStartX = 0;

  element.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isMouseDown = true;
    mouseStartX = e.clientX;
    stopCarouselAutoPlay();
  });

  window.addEventListener("mouseup", (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    const diffX = e.clientX - mouseStartX;
    if (Math.abs(diffX) > 40) {
      if (diffX < 0 && typeof onSwipeLeft === "function") {
        onSwipeLeft();
      } else if (diffX > 0 && typeof onSwipeRight === "function") {
        onSwipeRight();
      }
    } else {
      startCarouselAutoPlay();
    }
  });

  // Pausar auto-play al posar cursor
  element.addEventListener("mouseenter", () => stopCarouselAutoPlay());
  element.addEventListener("mouseleave", () => startCarouselAutoPlay());
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
        
        <div class="relative aspect-square bg-[#f6f6f6] overflow-hidden cursor-pointer" onclick="openProductModal('${prod.id}')">
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
            class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            onerror="this.src='https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80'"
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
            <h4 class="font-sans font-bold text-xs sm:text-sm text-gray-900 group-hover:text-sage-700 transition line-clamp-1 leading-snug" title="${prod.name}">
              ${prod.name}
            </h4>
            ${prod.displaySizes ? `<p class="text-[9px] sm:text-[11px] text-gray-500 mt-1 truncate">📏 <span class="size-pill-tag font-bold px-1.5 py-0.5 rounded">${prod.displaySizes}</span></p>` : ""}
            ${prod.notes ? `<p class="text-[9px] sm:text-[10px] text-rose-600 italic mt-0.5 line-clamp-1">✨ ${prod.notes}</p>` : ""}
          </div>

          <div class="pt-2 sm:pt-3 border-t border-gray-100 mt-2 flex items-center justify-between gap-1">
            <span class="text-xs sm:text-base font-bold text-sage-900 font-sans">${formatCurrency(prod.price)}</span>
            <button 
              onclick="handleQuickAddToCart(${prod.id}, event)"
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
  enableSwipeGesture(track, () => nextCarouselSlide(true), () => prevCarouselSlide(true));

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
    lucide.createIcons();
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
  const isHome = state.currentView === "home";
  const navHome = document.getElementById("nav-link-home");
  const navCat = document.getElementById("nav-link-catalogo");
  
  if (navHome) {
    if (isHome) {
      navHome.classList.add("active-nav-tab");
      navHome.classList.remove("border-transparent");
    } else {
      navHome.classList.remove("active-nav-tab");
      navHome.classList.add("border-transparent");
    }
  }

  if (navCat) {
    if (!isHome) {
      navCat.classList.add("active-nav-tab");
      navCat.classList.remove("border-transparent");
    } else {
      navCat.classList.remove("active-nav-tab");
      navCat.classList.add("border-transparent");
    }
  }
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
  history.replaceState(null, "", "#/catalogo");
}

/**
 * Navega de forma limpia y fluida entre las subpáginas (Home y Catálogo)
 * @param {string} viewName - "home" o "catalogo"
 * @param {object} options - { category, scrollTo, pushState }
 */
function navigateTo(viewName, options = {}) {
  const targetView = (viewName === "catalogo" || viewName === "catalog") ? "catalogo" : "home";
  state.currentView = targetView;

  const viewHome = document.getElementById("view-home");
  const viewCatalogo = document.getElementById("view-catalogo");

  if (targetView === "home") {
    if (viewHome) {
      viewHome.classList.remove("hidden");
      viewHome.classList.add("page-view");
    }
    if (viewCatalogo) {
      viewCatalogo.classList.add("hidden");
    }

    // Reanudar carruseles de la portada
    if (typeof startHeroAutoPlay === "function") startHeroAutoPlay();
    if (typeof startCarouselAutoPlay === "function") startCarouselAutoPlay();

    // Actualizar URL
    if (options.pushState !== false) {
      if (options.scrollTo) {
        history.pushState(null, "", `#/inicio#${options.scrollTo}`);
      } else {
        history.pushState(null, "", "#/");
      }
    }

    // Desplazamiento suave
    if (options.scrollTo) {
      setTimeout(() => {
        const targetEl = document.getElementById(options.scrollTo);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

  } else {
    // targetView === 'catalogo'
    if (viewHome) {
      viewHome.classList.add("hidden");
    }
    if (viewCatalogo) {
      viewCatalogo.classList.remove("hidden");
      viewCatalogo.classList.add("page-view");
    }

    // Pausar carruseles pesados de la portada para máximo rendimiento
    if (typeof stopHeroAutoPlay === "function") stopHeroAutoPlay();
    if (typeof stopCarouselAutoPlay === "function") stopCarouselAutoPlay();

    // Filtro de categoría directo
    if (options.category) {
      state.currentCategory = options.category;
      state.currentPage = 1;
    }

    updateBreadcrumbCategoryBadge();
    closeAllFilterDropdowns();
    updateFilterTriggerLabels();
    renderProducts();

    // Actualizar URL
    if (options.pushState !== false) {
      if (options.category && options.category !== "todos") {
        history.pushState(null, "", `#/catalogo?categoria=${options.category}`);
      } else {
        history.pushState(null, "", "#/catalogo");
      }
    }

    // Desplazamiento suave
    if (options.scrollTo) {
      setTimeout(() => {
        const targetEl = document.getElementById(options.scrollTo);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  updateNavTabsHighlight();

  if (window.lucide && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }
}

/**
 * Escucha cambios en el hash de la URL o botones de Atrás / Adelante del navegador
 */
function handleUrlRouting() {
  const hash = window.location.hash || "#/";

  if (hash.startsWith("#/catalogo") || hash === "#catalogo") {
    let category = "todos";
    if (hash.includes("categoria=")) {
      const match = hash.match(/categoria=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        category = match[1];
      }
    }
    navigateTo("catalogo", { category: category, pushState: false });
  } else if (hash.includes("#novedades-carousel") || hash.includes("#pedidos-encargo") || hash.includes("#inicio")) {
    let scrollTarget = "inicio";
    if (hash.includes("novedades-carousel")) scrollTarget = "novedades-carousel";
    else if (hash.includes("pedidos-encargo")) scrollTarget = "pedidos-encargo";
    navigateTo("home", { scrollTo: scrollTarget, pushState: false });
  } else {
    navigateTo("home", { pushState: false });
  }
}

// Escuchadores de eventos para navegación nativa del navegador
window.addEventListener("hashchange", handleUrlRouting);
window.addEventListener("popstate", handleUrlRouting);

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

  // Actualizar URL sin recargar
  if (categoryId && categoryId !== "todos") {
    history.replaceState(null, "", `#/catalogo?categoria=${categoryId}`);
  } else {
    history.replaceState(null, "", "#/catalogo");
  }

  if (window.lucide && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }
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

    // 2. Filtro por Buscador (código, nombre, notas, descripción)
    const q = state.searchQuery.toLowerCase().trim();
    const matchesQuery = !q || 
      prod.code.toLowerCase().includes(q) || 
      prod.name.toLowerCase().includes(q) || 
      prod.description.toLowerCase().includes(q) ||
      (prod.notes && prod.notes.toLowerCase().includes(q)) ||
      (prod.displaySizes && prod.displaySizes.toLowerCase().includes(q));

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
          <span>Búsqueda: "${state.searchQuery.trim()}"</span>
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
    lucide.createIcons();
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
        <div class="relative w-full aspect-square bg-[#f6f6f6] overflow-hidden cursor-pointer" onclick="openProductModal('${prod.id}')">
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
            class="product-image w-full h-full object-cover object-center"
            onerror="this.src='https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80'"
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
              <span class="text-[8px] sm:text-[10px] text-gray-400 font-medium hidden xs:inline">Sobre pedido</span>
            </div>
            
            <h3 
              onclick="openProductModal('${prod.id}')"
              class="font-sans text-xs sm:text-base font-bold text-gray-900 dark:text-white group-hover:text-sage-700 dark:group-hover:text-rose-400 transition-colors cursor-pointer line-clamp-1 leading-snug"
              title="${prod.name}"
            >
              ${prod.name}
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
              onclick="handleQuickAddToCart(${prod.id}, event)"
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
  lucide.createIcons();
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
  lucide.createIcons();
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
  const prod = PRODUCTS.find(p => p.id === productId);
  if (!prod) return;

  // Si es un anillo con varias tallas, abrir modal para que elija su medida exacta
  if (prod.isRing && prod.sizes && prod.sizes.length > 1 && prod.sizes[0] !== "Ajustable") {
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
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.style.backgroundColor = "";
      lucide.createIcons();
    }, 1200);
  }
}

// ==============================================================================
// GESTIÓN DEL CARRITO
// ==============================================================================
function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.cart = JSON.parse(raw);
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

function addToCart(productId, quantity = 1, selectedSize = null, event = null, selectedVariant = null) {
  if (event) event.stopPropagation();

  const product = PRODUCTS.find(p => String(p.id) === String(productId) || (p.variants && p.variants.some(v => String(v.id) === String(productId))));
  if (!product) return;

  const variant = selectedVariant || (state.selectedProductForModal && state.selectedProductForModal.id === product.id ? state.selectedModalVariant : (product.variants ? product.variants[0] : null));
  const variantId = variant ? String(variant.id) : String(product.id);
  const variantCode = variant ? variant.sku : product.code;
  const variantPhoto = variant ? variant.photo : product.image;
  const variantPrice = variant ? variant.price : product.price;
  const variantName = (variant && variant.color && variant.color !== "Única" && variant.color !== "Modelo Principal") 
    ? `${product.name} (${variant.color})` 
    : product.name;

  let sizeToSet = selectedSize;
  const validSizes = variant ? variant.sizes : product.sizes;
  if (!sizeToSet && product.isRing && validSizes && validSizes.length > 0) {
    sizeToSet = validSizes[0];
  }

  const existingIndex = state.cart.findIndex(
    item => String(item.variantId || item.id) === String(variantId) && item.selectedSize === sizeToSet
  );

  if (existingIndex > -1) {
    state.cart[existingIndex].quantity += quantity;
  } else {
    state.cart.push({
      id: product.id,
      variantId: variantId,
      code: variantCode,
      name: variantName,
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

  state.cart[cartIndex].quantity += delta;
  if (state.cart[cartIndex].quantity <= 0) {
    removeFromCart(cartIndex);
    return;
  }

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
                  class="w-full h-full object-cover group-hover/img:scale-110 transition duration-300"
                  onerror="this.src='https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=300&q=80'"
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
      lucide.createIcons();
    }
  }
}

function toggleCartDrawer(open = true) {
  const drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("cart-overlay");
  const panel = document.getElementById("cart-panel");
  if (!drawer || !overlay || !panel) return;

  if (open) {
    drawer.style.display = "block";
    drawer.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => {
      overlay.classList.remove("opacity-0");
      overlay.classList.add("opacity-100");
      panel.classList.remove("translate-x-full");
      panel.classList.add("translate-x-0");
    });
  } else {
    overlay.classList.remove("opacity-100");
    overlay.classList.add("opacity-0");
    panel.classList.remove("translate-x-0");
    panel.classList.add("translate-x-full");
    document.body.classList.remove("overflow-hidden");
    setTimeout(() => {
      drawer.classList.add("hidden");
      drawer.style.display = "none";
    }, 280);
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

  const customerNameInput = document.getElementById("checkout-customer-name");
  const customerAddressInput = document.getElementById("checkout-customer-address");
  const customerNotesInput = document.getElementById("checkout-customer-notes");

  const customerName = customerNameInput ? customerNameInput.value.trim() : "";
  const customerAddress = customerAddressInput ? customerAddressInput.value.trim() : "";
  const customerNotes = customerNotesInput ? customerNotesInput.value.trim() : "";

  const totalAmount = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalPieces = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const advanceAmount = Math.round(totalAmount * 0.5);
  const remainingAmount = totalAmount - advanceAmount;

  let message = `¡Hola *${BUSINESS_CONFIG.brandName}*! ✨ Deseo realizar el siguiente pedido de joyería en *Plata Ley S925* sobre encargo:\n\n`;
  message += `🛍️ *PIEZAS SELECCIONADAS:*\n`;
  message += `------------------------------------\n`;

  state.cart.forEach((item, index) => {
    const itemSubtotal = formatCurrency(item.price * item.quantity);
    let sizeDetails = "";
    if (item.isRing && item.selectedSize) {
      sizeDetails = ` (Talla: *${item.selectedSize}*)`;
    }

    message += `${index + 1}. *[${item.code}]* ${item.name}${sizeDetails}\n`;
    message += `   • Cantidad: ${item.quantity} pza(s) x ${formatCurrency(item.price)}\n`;
    message += `   • Subtotal: ${itemSubtotal}\n`;
  });

  message += `------------------------------------\n`;
  message += `📦 *Total de piezas:* ${totalPieces}\n`;
  message += `💰 *TOTAL GENERAL:* *${formatCurrency(totalAmount)} ${BUSINESS_CONFIG.currencyCode}*\n`;
  message += `🛡️ *GARANTÍA INCLUIDA:* 30 días contra cualquier defecto de fábrica en Plata Ley S925\n\n`;

  message += `👤 *DATOS DEL CLIENTE:*\n`;
  message += `• *Nombre:* ${customerName ? customerName : "Por acordar"}\n`;
  if (customerAddress) {
    message += `• *Ciudad/Dirección:* ${customerAddress}\n`;
  }
  if (customerNotes) {
    message += `• *Notas:* ${customerNotes}\n`;
  }

  message += `\n¿Me podrían confirmar disponibilidad y los datos de pago/transferencia para procesar mi pedido? ¡Muchas gracias! 💖`;

  const whatsappUrl = `https://wa.me/${BUSINESS_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank");
  showToast("¡Redirigiendo a WhatsApp con tu pedido y tallas!", null, "success");
}

// ==============================================================================
// MODAL DE VISTA RÁPIDA (CON SELECTOR DE TALLA)
// ==============================================================================
function openProductModal(productId, defaultSize = null, defaultVariantId = null) {
  const product = PRODUCTS.find(p => String(p.id) === String(productId) || (p.variants && p.variants.some(v => String(v.id) === String(productId))));
  if (!product) return;

  state.selectedProductForModal = product;

  // Seleccionar variante inicial
  let activeVariant = product.variants ? product.variants[0] : null;
  if (defaultVariantId && product.variants) {
    const found = product.variants.find(v => String(v.id) === String(defaultVariantId));
    if (found) activeVariant = found;
  } else if (product.variants) {
    const matched = product.variants.find(v => String(v.id) === String(productId));
    if (matched) activeVariant = matched;
  }
  state.selectedModalVariant = activeVariant;

  // Medida seleccionada
  const activeSizes = activeVariant ? activeVariant.sizes : product.sizes;
  if (defaultSize && activeSizes && activeSizes.includes(defaultSize)) {
    state.selectedModalSize = defaultSize;
  } else {
    state.selectedModalSize = (product.isRing && activeSizes && activeSizes.length > 0) ? activeSizes[0] : null;
  }

  const modal = document.getElementById("product-modal");
  const modalImage = document.getElementById("modal-product-image");
  const modalName = document.getElementById("modal-product-name");
  const modalCategory = document.getElementById("modal-product-category");
  const modalMaterial = document.getElementById("modal-product-material");
  const modalDescription = document.getElementById("modal-product-description");
  const modalQtyInput = document.getElementById("modal-qty-input");

  if (modalName) modalName.textContent = product.name;
  if (modalCategory) modalCategory.textContent = getCategoryLabel(product.category);
  if (modalMaterial) modalMaterial.textContent = product.material;
  if (modalDescription) modalDescription.textContent = product.description;
  if (modalQtyInput) modalQtyInput.value = 1;

  // Mostrar Piedra / Gema SOLO si existe y no es Ninguno
  const stoneRow = document.getElementById("modal-product-stone-row");
  const stoneText = document.getElementById("modal-product-stone");
  if (stoneRow && stoneText) {
    if (product.stone) {
      stoneRow.classList.remove("hidden");
      stoneText.textContent = product.stone;
    } else {
      stoneRow.classList.add("hidden");
    }
  }

  // Precios con cálculo automático de descuento
  const curPrice = activeVariant ? activeVariant.price : product.price;
  const curOrigPrice = activeVariant ? activeVariant.originalPrice : product.originalPrice;
  const isDisc = (activeVariant && activeVariant.isDiscount) || product.hasDiscount;

  const modalPrice = document.getElementById("modal-product-price");
  const modalOrigPrice = document.getElementById("modal-product-original-price");
  const modalDiscPill = document.getElementById("modal-product-discount-pill");
  const modalDiscBadge = document.getElementById("modal-product-discount-badge");

  if (modalPrice) modalPrice.textContent = formatCurrency(curPrice);

  if (isDisc && curOrigPrice && curOrigPrice > curPrice) {
    const pct = Math.round(((curOrigPrice - curPrice) / curOrigPrice) * 100);
    const ahorro = Math.round(curOrigPrice - curPrice);

    if (modalOrigPrice) {
      modalOrigPrice.textContent = formatCurrency(curOrigPrice);
      modalOrigPrice.classList.remove("hidden");
    }
    if (modalDiscPill) {
      modalDiscPill.textContent = `🔥 -${pct}% OFF (Ahorro de $${ahorro} MXN)`;
      modalDiscPill.classList.remove("hidden");
    }
    if (modalDiscBadge) {
      modalDiscBadge.textContent = `🔥 -${pct}% OFF`;
      modalDiscBadge.classList.remove("hidden");
    }
  } else {
    if (modalOrigPrice) modalOrigPrice.classList.add("hidden");
    if (modalDiscPill) modalDiscPill.classList.add("hidden");
    if (modalDiscBadge) modalDiscBadge.classList.add("hidden");
  }

  // Coleccionar todas las fotos para la galería en orden numérico estricto (1 al 5...)
  const photoList = [];
  const seenUrls = new Set();

  function getPhotoNum(u) {
    if (!u) return 999;
    const m = u.match(/foto_0*(\d+)/i) || u.match(/_0*(\d+)\.[a-z0-9]+$/i);
    return m ? parseInt(m[1], 10) : 900;
  }

  // 1. Fotos de galería general ordenadas numéricamente (foto_01, foto_02...)
  const sortedGallery = [...(product.gallery || [])].sort((a, b) => getPhotoNum(a) - getPhotoNum(b));
  sortedGallery.forEach((url, idx) => {
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      const num = getPhotoNum(url);
      photoList.push({
        url: url,
        label: num < 900 ? `Foto ${num}` : `Foto ${idx + 1}`,
        variantId: null
      });
    }
  });

  // 2. Fotos de variantes
  if (product.variants && product.variants.length > 0) {
    product.variants.forEach((v, idx) => {
      if (v.photo) {
        if (!seenUrls.has(v.photo)) {
          seenUrls.add(v.photo);
          photoList.push({
            url: v.photo,
            label: v.color && v.color !== "Única" ? v.color : `Modelo ${idx + 1}`,
            variantId: String(v.id)
          });
        } else {
          // Si la URL ya estaba en la galería, vincular variantId para interactividad bidireccional
          const existing = photoList.find(p => p.url === v.photo);
          if (existing && !existing.variantId) {
            existing.variantId = String(v.id);
          }
        }
      }
    });
  } else if (product.image && !seenUrls.has(product.image)) {
    seenUrls.add(product.image);
    photoList.push({ url: product.image, label: "Foto 1", variantId: String(product.id) });
  }

  state.modalPhotos = photoList;
  state.currentModalPhotoIdx = 0;

  // La foto inicial SIEMPRE es foto_01.jpg (photoList[0])
  const initPhoto = photoList[0] ? photoList[0].url : product.image;
  if (modalImage) modalImage.src = initPhoto;

  const foundInitIdx = photoList.findIndex(p => p.url === initPhoto);
  if (foundInitIdx !== -1) state.currentModalPhotoIdx = foundInitIdx;

  // Renderizar tira de miniaturas
  const strip = document.getElementById("modal-thumbnails-strip");
  if (strip) {
    if (photoList.length > 1) {
      strip.classList.remove("hidden");
      strip.innerHTML = photoList.map((p, idx) => `
        <button
          type="button"
          onclick="selectModalPhoto(${idx})"
          class="gallery-thumb-btn ${idx === state.currentModalPhotoIdx ? 'is-active' : ''}"
          title="${p.label}"
          data-thumb-idx="${idx}"
        >
          <img src="${p.url}" alt="${p.label}" class="w-full h-full object-cover" />
        </button>
      `).join("");
    } else {
      strip.classList.add("hidden");
      strip.innerHTML = "";
    }
  }

  // Renderizar selector de variantes
  const variantsSection = document.getElementById("modal-variants-section");
  const variantsList = document.getElementById("modal-variants-list");
  const variantLabel = document.getElementById("modal-selected-variant-label");

  if (variantsSection && variantsList) {
    if (product.variants && product.variants.length > 1) {
      variantsSection.classList.remove("hidden");
      if (variantLabel && activeVariant) {
        variantLabel.textContent = activeVariant.color && activeVariant.color !== 'Única' ? activeVariant.color : activeVariant.sku;
      }
      variantsList.innerHTML = product.variants.map(v => {
        const isSelected = activeVariant && v.id === activeVariant.id;
        const labelText = v.color && v.color !== 'Única' ? v.color : v.sku;
        return `
          <button
            type="button"
            onclick="selectModalVariant('${v.id}')"
            class="variant-pill-btn ${isSelected ? 'is-selected' : ''}"
            data-variant-id="${v.id}"
          >
            <img src="${v.photo}" alt="${labelText}" />
            <span>${labelText}</span>
            <span class="text-[10px] opacity-75 font-mono">$${Math.round(v.price)}</span>
          </button>
        `;
      }).join("");
    } else {
      variantsSection.classList.add("hidden");
      variantsList.innerHTML = "";
    }
  }

  // Renderizar tallas de anillo
  renderModalRingSizes(activeSizes);

  if (modal) {
    modal.style.display = "flex";
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => {
      modal.classList.add("modal-active");
    });
  }
  lucide.createIcons();
}

function selectModalPhoto(idx) {
  if (!state.modalPhotos || !state.modalPhotos[idx]) return;
  state.currentModalPhotoIdx = idx;
  const photo = state.modalPhotos[idx];

  const modalImg = document.getElementById("modal-product-image");
  if (modalImg) {
    modalImg.src = photo.url;
  }

  const thumbs = document.querySelectorAll("#modal-thumbnails-strip .gallery-thumb-btn");
  thumbs.forEach(t => {
    const tIdx = parseInt(t.getAttribute("data-thumb-idx"), 10);
    if (tIdx === idx) {
      t.classList.add("is-active");
      t.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } else {
      t.classList.remove("is-active");
    }
  });

  if (photo.variantId && state.selectedProductForModal && state.selectedProductForModal.variants) {
    const v = state.selectedProductForModal.variants.find(item => String(item.id) === String(photo.variantId));
    if (v && (!state.selectedModalVariant || String(state.selectedModalVariant.id) !== String(v.id))) {
      selectModalVariant(v.id, false);
    }
  }
}

function prevModalPhoto() {
  if (!state.modalPhotos || state.modalPhotos.length <= 1) return;
  let newIdx = state.currentModalPhotoIdx - 1;
  if (newIdx < 0) newIdx = state.modalPhotos.length - 1;
  selectModalPhoto(newIdx);
}

function nextModalPhoto() {
  if (!state.modalPhotos || state.modalPhotos.length <= 1) return;
  let newIdx = state.currentModalPhotoIdx + 1;
  if (newIdx >= state.modalPhotos.length) newIdx = 0;
  selectModalPhoto(newIdx);
}

function selectModalVariant(variantId, changePhoto = true) {
  const product = state.selectedProductForModal;
  if (!product || !product.variants) return;

  const variant = product.variants.find(v => String(v.id) === String(variantId));
  if (!variant) return;

  state.selectedModalVariant = variant;

  const variantLabel = document.getElementById("modal-selected-variant-label");
  if (variantLabel) {
    variantLabel.textContent = variant.color && variant.color !== 'Única' ? variant.color : variant.sku;
  }

  const pills = document.querySelectorAll("#modal-variants-list .variant-pill-btn");
  pills.forEach(p => {
    if (String(p.getAttribute("data-variant-id")) === String(variantId)) {
      p.classList.add("is-selected");
    } else {
      p.classList.remove("is-selected");
    }
  });

  const modalPrice = document.getElementById("modal-product-price");
  const modalOrigPrice = document.getElementById("modal-product-original-price");
  const modalDiscPill = document.getElementById("modal-product-discount-pill");
  const modalDiscBadge = document.getElementById("modal-product-discount-badge");

  if (modalPrice) modalPrice.textContent = formatCurrency(variant.price);

  if (variant.isDiscount && variant.originalPrice && variant.originalPrice > variant.price) {
    const pct = Math.round(((variant.originalPrice - variant.price) / variant.originalPrice) * 100);
    const ahorro = Math.round(variant.originalPrice - variant.price);

    if (modalOrigPrice) {
      modalOrigPrice.textContent = formatCurrency(variant.originalPrice);
      modalOrigPrice.classList.remove("hidden");
    }
    if (modalDiscPill) {
      modalDiscPill.textContent = `🔥 -${pct}% OFF (Ahorro de $${ahorro} MXN)`;
      modalDiscPill.classList.remove("hidden");
    }
    if (modalDiscBadge) {
      modalDiscBadge.textContent = `🔥 -${pct}% OFF`;
      modalDiscBadge.classList.remove("hidden");
    }
  } else {
    if (modalOrigPrice) modalOrigPrice.classList.add("hidden");
    if (modalDiscPill) modalDiscPill.classList.add("hidden");
    if (modalDiscBadge) modalDiscBadge.classList.add("hidden");
  }

  if (changePhoto && variant.photo) {
    const photoIdx = state.modalPhotos ? state.modalPhotos.findIndex(p => p.url === variant.photo) : -1;
    if (photoIdx !== -1) {
      selectModalPhoto(photoIdx);
    } else {
      const modalImg = document.getElementById("modal-product-image");
      if (modalImg) modalImg.src = variant.photo;
    }
  }

  renderModalRingSizes(variant.sizes);
}

function renderModalRingSizes(sizes) {
  const modalRingSizesContainer = document.getElementById("modal-ring-sizes-container");
  const product = state.selectedProductForModal;
  if (!modalRingSizesContainer || !product) return;

  const isRing = product.isRing;
  if (isRing && sizes && sizes.length > 0) {
    modalRingSizesContainer.classList.remove("hidden");
    
    if (!state.selectedModalSize || !sizes.includes(state.selectedModalSize)) {
      state.selectedModalSize = sizes[0];
    }

    if (sizes.length === 1 && sizes[0] === "Ajustable") {
      modalRingSizesContainer.innerHTML = `
        <div class="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/50 shadow-xs">
          <span class="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
            <i data-lucide="sparkles" class="w-4 h-4 text-rose-500"></i> Talla Ajustable Universal
          </span>
          <p class="text-[11px] text-gray-600 dark:text-gray-300 mt-1">Este diseño abierto se gradúa con suavidad para adaptarse perfectamente a cualquier dedo.</p>
        </div>
      `;
    } else {
      modalRingSizesContainer.innerHTML = `
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-gray-800 dark:text-white flex items-center gap-1.5">
              <i data-lucide="ruler" class="w-3.5 h-3.5 text-sage-600 dark:text-rose-400"></i>
              Selecciona tu Talla de Anillo:
            </label>
            <button 
              type="button" 
              onclick="openRingSizeGuideModal()"
              class="text-[11px] text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 underline font-semibold"
            >
              📏 ¿Cómo saber tu talla?
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            ${sizes.map(sz => `
              <button 
                type="button" 
                onclick="selectModalSize('${sz}')"
                class="size-pill-btn px-3 py-1.5 rounded-xl text-xs font-bold border transition ${state.selectedModalSize === sz ? 'is-selected' : ''}"
                data-size="${sz}"
              >
                Talla ${sz}
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }
  } else {
    modalRingSizesContainer.classList.add("hidden");
    modalRingSizesContainer.innerHTML = "";
  }
  lucide.createIcons();
}

function selectModalSize(size) {
  state.selectedModalSize = size;
  const pills = document.querySelectorAll(".size-pill-btn");
  pills.forEach(pill => {
    const isSelected = pill.getAttribute("data-size") === size;
    pill.classList.toggle("is-selected", isSelected);
  });
}

function closeProductModal() {
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
  state.selectedProductForModal = null;
  state.selectedModalSize = null;
}

function addModalProductToCart() {
  if (!state.selectedProductForModal) return;
  const qtyInput = document.getElementById("modal-qty-input");
  const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value) || 1) : 1;
  addToCart(state.selectedProductForModal.id, qty, state.selectedModalSize, null, state.selectedModalVariant);
  closeProductModal();
}

// ==============================================================================
// MODAL DE GUÍA PARA MEDIR TALLAS
// ==============================================================================
function openRingSizeGuideModal() {
  const modal = document.getElementById("ring-size-guide-modal");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    requestAnimationFrame(() => {
      modal.classList.add("modal-active");
    });
    lucide.createIcons();
  }
}

function closeRingSizeGuideModal() {
  const modal = document.getElementById("ring-size-guide-modal");
  if (modal) {
    modal.classList.remove("modal-active");
    setTimeout(() => {
      modal.classList.add("hidden");
      modal.style.display = "none";
      if (!state.selectedProductForModal && document.getElementById("cart-drawer").classList.contains("hidden")) {
        document.body.classList.remove("overflow-hidden");
      }
    }, 200);
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
  lucide.createIcons();
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
  lucide.createIcons();
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
    lucide.createIcons();
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
    ? `<img src="${image}" alt="Joya" class="w-11 h-11 rounded-xl object-cover bg-black/40 flex-shrink-0 border border-white/20 shadow-xs" onerror="this.src='https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=200&q=80'" />`
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
  lucide.createIcons();

  const dismissTimer = setTimeout(() => {
    dismissToast(toast);
  }, 4000);

  toast.dataset.timer = dismissTimer;
}

function dismissToast(toastEl) {
  if (!toastEl || toastEl.classList.contains("toast-exit")) return;
  toastEl.classList.add("toast-exit");
  setTimeout(() => {
    if (toastEl.parentElement) toastEl.remove();
  }, 190);
}

function formatCurrency(amount) {
  return `${BUSINESS_CONFIG.currencySymbol}${Number(amount).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

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
  const navSections = ["inicio", "novedades-carousel", "catalogo", "guia-medidas", "pedidos-encargo"];

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
