// ==============================================================================
// YAMIKI JOYERÍA S925 - CONFIGURACIÓN CENTRALIZADA DE CLIENTE SUPABASE
// ==============================================================================
// Este archivo es la ÚNICA fuente de verdad para la conexión pública del frontend.
// En producción, apunta al proyecto principal de Yamiki Joyería.
// En staging o pruebas locales, el servidor de staging inyecta automáticamente la URL
// y clave pública correspondientes sin requerir editar archivos de código.
// ==============================================================================

window.__SUPABASE_CONFIG__ = window.__SUPABASE_CONFIG__ || {
  url: "https://nlpsvjweybdmkmrkfkyy.supabase.co",
  anonKey: "sb_publishable_EYkY5I4lzoh0i1gNOE_1GA_1BBHmw8P"
};

window.__TURNSTILE_SITEKEY__ = "0x4AAAAAAF9gfgvKUxWuBR2p";
