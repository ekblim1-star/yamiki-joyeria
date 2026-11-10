# 💍 Yamiki - Catálogo Oficial de Joyería en Plata Ley S925

Aplicación web moderna, interactiva y profesional para la venta de joyería en **Plata Esterlina Ley S925** sobre pedido, sincronizada con las **141 piezas reales** del catálogo oficial.

---

## 🎨 1. Identidad Visual & Diseño
- **Paleta de Colores:** 
  - **Verde Salvia (`#5B7A6A` / `#476153`):** Serenidad, distinción, confianza y sofisticación.
  - **Rosa Pastel / Blush (`#E8B4B8` / `#FAEFF0`):** Suavidad, toque femenino y acabados contemporáneos.
  - **Plata y Perla (`#FAF9F6`):** Fondos limpios que resaltan el brillo metálico de cada joya.
- **Tipografía Editorial:** Encabezados en *Cormorant Garamond* y lectura limpia en *Plus Jakarta Sans*.
- **100% Responsivo:** Adaptado con Tailwind CSS para teléfonos móviles, tablets y computadoras.

---

## 💎 2. Catálogo Oficial Real (141 Piezas Extraídas del PDF)
Las 141 piezas del catálogo PDF han sido procesadas, extrayendo sus fotos individuales en alta definición a la carpeta `img/products/` con sus precios y especificaciones reales:

1. **Anillos de Plata S925 (Modelos A-01 al A-27 y A-19-B al A-24-B):**
   - Disponibles con tallas específicas de fábrica (ej. Tallas 5, 6, 7, 8, 9, 10 o rangos 6-7, 7-8) y modelos con diseño **Talla Ajustable**.
2. **Cadenas y Collares de Plata S925 (Modelos A-28 al A-90):**
   - Gran variedad de dijes, cristales, cadenas venecianas y modelos con **Iniciales de la A a la Z** (A-34/A-35).
3. **Aretes y Huggies de Plata S925 (Modelos A-91 al A-132):**
   - Arracadas, broqueles, aretes colgantes y modelos multicolor (A-92 con opciones en Azul, Rosa, Verde y Negro).
4. **Sets Especiales (A-23):**
   - Dúo de Anillo y Aretes en Plata S925.

---

## 📏 3. Selección de Medidas de Anillo & Guía de Medición
Cumpliendo con tu requerimiento, el sistema ahora integra la gestión completa de tallas:

1. **En el Catálogo y Modal de Vista Rápida:**
   - Si el artículo es un anillo con varias tallas, muestra botones interactivos para seleccionar la medida deseada (`Talla 5`, `Talla 6`, etc., o `Talla Ajustable`) antes de añadir al pedido.
2. **En el Carrito de Compras:**
   - Cada anillo en el carrito cuenta con un selector desplegable (`Medida: [Talla 7]`) para que el cliente pueda confirmar o cambiar su talla en cualquier momento.
   - Si hay anillos en el carrito, se despliega una alerta amigable recordando verificar las medidas antes de enviar.
3. **Apartado y Modal "¿Cómo tomar medidas de tu anillo?":**
   - Sección dedicada (`#guia-medidas`) y ventana emergente accesible desde el menú, desde el carrito y desde el catálogo.
   - **Método 1:** Con tira de papel o hilo alrededor del dedo midiendo la circunferencia en milímetros.
   - **Método 2:** Medición del diámetro interior con una regla de un anillo actual.
   - **Tabla comparativa de Tallas (México / USA):**
     - Talla 5 (49.3 mm)
     - Talla 6 (51.8 mm)
     - Talla 7 (54.4 mm)
     - Talla 8 (56.9 mm)
     - Talla 9 (59.5 mm)
     - Talla 10 (62.1 mm)
     - Modelos Ajustables universales.

---

## 🛍️ 4. Carrito de Compras & Pedido por WhatsApp con Anticipo 50%
De acuerdo con las políticas oficiales del catálogo:
- Los pedidos se solicitan directamente con el proveedor en pedidos grupales (meta de 7 pedidos).
- Se requiere un **50% de anticipo** para apartar y confirmar la pieza y la talla. El 50% restante se liquida a la entrega.
- El carrito calcula automáticamente el monto del anticipo del 50% y el saldo restante.
- Al presionar **"Enviar Pedido con Tallas por WhatsApp"**, se genera el texto estructurado:

```text
¡Hola Yamiki! ✨ Deseo realizar el siguiente pedido de joyería en Plata Ley S925 sobre encargo:

🛍️ PIEZAS SELECCIONADAS:
------------------------------------
1. *[A-01]* Anillo de Plata S925 (A-01) (Talla: *7*)
   • Cantidad: 1 pza(s) x $260
   • Subtotal: $260
2. *[A-28]* Collar y Cadena Plata S925 (A-28)
   • Cantidad: 1 pza(s) x $220
   • Subtotal: $220
------------------------------------
📦 Total de piezas: 2
💰 TOTAL GENERAL: $480 MXN
💳 Anticipo 50% requerido: $240 MXN
🤝 Saldo restante contra entrega: $240 MXN

👤 DATOS DEL CLIENTE:
• Nombre: Mariana López
• Ciudad/Dirección: Guadalajara, Jal.
• Notas: Todo en orden

¿Me podrían confirmar los datos de transferencia/depósito para realizar mi anticipo del 50% y asegurar mis piezas? ¡Muchas gracias! 💖
```

---

## ⚙️ 5. Configurar tu Número de WhatsApp en `products.js`
Abre el archivo [**`products.js`**](file:///c:/Users/evboe/Downloads/yamiki/products.js) y en la línea 19 coloca tu número de WhatsApp real con código de país (sin el signo `+` ni espacios ni guiones):

```javascript
const BUSINESS_CONFIG = {
  brandName: "Yamiki",
  slogan: "Joyería de plata única y elegante hecha para ti",
  
  // Escribe tu número aquí:
  whatsappNumber: "521XXXXXXXXXX", 
  // ...
};
```

---

## 🚀 6. Cómo Abrir la Página
Haz doble clic sobre el archivo [**`index.html`**](file:///c:/Users/evboe/Downloads/yamiki/index.html) en cualquier navegador (Google Chrome, Edge, Safari, Firefox). ¡Funciona al instante sin instalaciones!
