# Handoff: interfaz de MeAI (Biblioteca · Conversación · Evidencia)

## Overview
Nueva interfaz para MeAI (repo `Asiel091307/MeAI`, Next.js + TypeScript): memoria personal sobre los documentos del usuario. Tres paneles: **Biblioteca** (espacios + documentos + historial + línea de tiempo), **Conversación** (modos Preguntar/Recordar, respuestas con citas en streaming, estado "No recuerdo") y **Evidencia** (fragmentos citados + visor de PDF). Todo el texto de la UI está en español.

## About the Design Files
`MeAI v2.dc.html` es una **referencia de diseño hecha en HTML**: un prototipo que muestra el aspecto y el comportamiento deseados, no código de producción. Ábrelo en el navegador (necesita `support.js` al lado). La tarea es **recrearlo en la app Next.js existente** con sus patrones: componentes React/TSX en `components/`, App Router en `app/` y las rutas API que ya existen. Los datos del prototipo (documentos, respuestas, fragmentos) son simulados; conéctalos a las APIs reales.

En el prototipo, el Tweak "pantalla" (1–8) salta a cada estado: Conversación, No recuerdo, Visor de PDF, Modo Recordar, Estado vacío, Biblioteca, Paleta de comandos y Móvil. "tema" cambia entre claro y oscuro, y "plan" entre gratuito y de pago.

## Fidelity
**Alta fidelidad.** Colores, tipografía, espaciados, radios y textos son finales. Recréalos fielmente.

## Layout
- Contenedor: `display:flex; height:100vh; overflow:hidden; position:relative`.
- **Escritorio (≥1180 px):** Biblioteca (280 px por defecto, redimensionable de 220 a 640) | Conversación (flex:1) | Evidencia (360 px, colapsable).
- **Tablet (760–1179 px):** la Evidencia es un drawer absoluto a la derecha (360 px, máx. 90 %) con fondo oscurecido; se abre desde las citas.
- **Móvil (<760 px):** una columna. La Biblioteca es un drawer izquierdo (86 %, máx. 320 px) que abre el botón hamburguesa. La Evidencia es un bottom sheet (72 % de alto, radio superior 16 px). El objetivo táctil `--hit` sube de 32 px a 44 px.

## Screens / Views

### 1. Biblioteca (panel izquierdo, fondo `--panel`, borde derecho `1px --line`)
- Logo: cuadro de 18×18 px con radio 6 y fondo `--ac`, más "MeAI" en 16/600 con letter-spacing −.01em. Padding 16/16/12.
- Buscador: botón a ancho completo, alto `--hit`, borde `--line`, radio 8, fondo `--bg`. Dice "Buscar…" y lleva un kbd "Ctrl+K" en mono 11 px. Abre la paleta de comandos.
- **Tirador de ancho:** franja de 8 px en el borde derecho, `cursor: col-resize`, hover `--ac-bg`. Arrastrar cambia el ancho (220–640) y doble clic lo devuelve a 280. Se guarda en `localStorage['meai-libw']`. No existe en móvil.
- **Espacios:** etiqueta "ESPACIOS" (11/600, mayúsculas, tracking .06em, `--faint`). Cada fila es un botón de alto `--hit`, radio 8, 13.5 px, con el contador en mono 12 `--faint`. El activo usa fondo `--ac-bg`, texto `--ac-text` y peso 600. Un espacio sensible muestra la píldora "sensible" (11 px, borde `--line`). Al final va "+ Nuevo espacio". La lista tiene `max-height` variable (por defecto 400) y scroll.
- **Tirador de alto:** barra de 14 px con una píldora de 36×4 px, `cursor: row-resize`. Arrastrar cambia el alto de la lista de Espacios (0–500) y así da más espacio a la sección de abajo. Doble clic restablece. Se guarda en `localStorage['meai-spacesh']`.
- **Pestañas** (control segmentado, fondo `--bg`, padding 3, radio 9): Documentos / Historial / Línea de tiempo. La activa usa fondo `--raise`, texto `--text` y peso 600.
- **Documentos:**
  - **Botón "Subir documentos"**, primero de la lista: borde 1.5 px discontinuo `--ac`, radio 10, fondo `--ac-bg`. Lleva un ícono de subida de Lucide en un cuadro de 32 px (fondo `--ac`). Texto: "Subir documentos" (13/600 `--ac-text`) y debajo "PDF hasta 10 MB · o arrástralos aquí" (11.5 `--muted`). Usa un `input type=file multiple` oculto.
  - **Tarjeta de documento:** padding 10, borde `--line`, radio 10, fondo `--raise`, gap 6. Contiene:
    - Fila superior: chip de tipo (PDF, OCR, NOTA o IMG; mono 10, fondo `--bg`), nombre (mono 12.5, con elipsis) y botón ⋯.
    - Resumen de una línea (12.5 `--muted`, con elipsis).
    - **Listo:** etiquetas en píldora (11 px, borde `--line`) y, a la derecha, "14 mar 2025 · 9 pág." en mono 11.
    - **Procesando:** 5 barras de 4 px de alto, rellenas en `--ac` hasta la etapa actual, más la etiqueta "OCR · 2/5" en mono 11 `--ac-text`. Etapas: Extrayendo → OCR → Fragmentando → Embeddings → Listo.
    - **Error:** chip con fondo `--err-bg` y texto `--err` (p. ej. "Cuota de Gemini agotada") más el botón "Reintentar".
  - **Menú ⋯:** Ver, Reprocesar, "Mover a {siguiente espacio}" y Eliminar (en `--err`).
  - **Confirmación de borrado** en línea: "¿Eliminar este documento? Se borran el PDF, sus fragmentos y sus embeddings. No se puede deshacer." Botones: Eliminar (borde y texto `--err`) y Cancelar.
- **Historial:** filas con el título (13 px) y "Hoy · Trabajo" en mono 11 `--faint`.
- **Línea de tiempo:** grupos por fecha (mono 11), con elementos sangrados y un borde izquierdo de 2 px `--line`. Cada elemento tiene la clase ("Conversación" o "Documento", 11 px, 76 px de ancho) y la etiqueta.
- **Pie:** punto de 8 px (`--warn` en plan gratuito, `--ok` en plan de pago) y "Gemini · plan gratuito" en mono. Tooltip del plan gratuito: "En el plan gratuito, Google puede usar el texto enviado (fragmentos y preguntas) para mejorar sus productos. Todo lo demás se queda en tu equipo."

### 2. Conversación (centro, fondo `--bg`)
- **Header** (padding 10/16, borde inferior `--line`): botón hamburguesa (alterna la Biblioteca), título editable (input 14/600, borde transparente que se vuelve `--line` en hover y `--ac` en focus), chip con el espacio activo, control segmentado **Preguntar | Recordar** y botón "Evidencia".
- **Columna de mensajes:** máx. 720 px, centrada, padding 28/20/20, gap 22.
  - **Usuario:** a la derecha, máx. 85 %, padding 9/14, radio 12, fondo `--raise`, borde `--line`, 15 px.
  - **Etapa previa:** texto `--muted` 14 px, p. ej. "Buscando en 12 documentos…", con un cursor de 7×16 px en `--ac` que parpadea (`steps(1)`, 1 s).
  - **Respuesta:** sin burbuja, 16 px con interlineado 1.7. Las **citas** son chips en línea numerados (mín. 20×20, radio 6, mono 11.5, fondo `--ac-bg`, texto `--ac-text`; el activo usa `--ac` con texto `--on-ac`). Tooltip: "Contrato_2025.pdf · p. 4". Al hacer clic se abre la Evidencia y se resalta esa tarjeta. Mientras llega el texto se muestra el cursor parpadeante.
  - **Acciones** de la respuesta (12.5 `--muted`, botones ghost): Copiar, Regenerar, Me sirve, No me sirve y Ver evidencia (en `--ac-text`).
  - **Tarjeta "Sobre mí"** en línea (fondo `--panel`, radio 10): "Sobre mí · ¿Guardo que trabajas en backend y automatización?", con los botones Guardar (primario) e Ignorar. Al guardar se lee "Guardado en Sobre mí."
- **Estado "No recuerdo"** (tarjeta con padding 18, radio 12, fondo `--panel`, gap 18):
  - "No encontré esto con seguridad en tus documentos." (16/600) y debajo "Prefiero decírtelo antes que inventar una respuesta."
  - **Esto se parece:** 2–3 fragmentos como botones, cada uno con "doc · p. N" en mono, el % de similitud en `--ac-text` y el texto. Al hacer clic se abre el visor.
  - **Aclaración:** "¿Te refieres al contrato de 2024 o al de 2025?" con dos botones de opción que rellenan el campo de texto.
  - **"Prueba a preguntarlo así":** chips en píldora con reformulaciones que rellenan el campo.
  - **"Buscar más a fondo"** (primario): amplía la búsqueda a todos los espacios y añade coincidencia por palabras exactas. Junto a él va el enlace "Subir un documento que lo contenga", que abre el selector de archivos.
- **Modo Recordar:** no usa IA generativa. Muestra el resumen "Modo Recordar, sin IA generativa. 5 fragmentos en 3 documentos, ordenados por similitud." y la lista de fragmentos ordenados (n.º, ref., %, texto).
- **Estado vacío:**
  - H1 "¿Qué necesitas recordar?" (26/600, tracking −.02em) y debajo "Respondo solo con lo que dicen tus documentos, y te muestro dónde lo dice."
  - Si no hay documentos, una zona grande para soltar archivos (borde 1.5 px discontinuo `--faint`, radio 12, padding 44) con el botón "Elegir archivos".
  - 4 preguntas de ejemplo como tarjetas en una cuadrícula `auto-fit minmax(220px,1fr)`.
- **Barra de entrada** (fija abajo, máx. 720 px):
  - Encima, chips de contexto ("Espacio: Trabajo", "Sobre mí: activo") en `--ac-bg`.
  - Caja con borde `--line`, radio 12 y fondo `--panel`. Dentro, un textarea autoajustable (15 px, máx. 180 px de alto, `maxlength` 1000).
  - Fila inferior: "Adjuntar", contador "0/1000" en mono y el botón de enviar ("Enviar" o "Recordar" según el modo).
  - Enter envía y Shift+Enter hace salto de línea.
  - Validación: si el campo está vacío, se muestra "Escribe una pregunta para consultar tus documentos."; si no hay documentos listos, "Todavía no hay documentos listos en este espacio. Sube uno para empezar."

### 3. Evidencia (panel derecho, fondo `--panel`)
- Header: "Evidencia de esta respuesta", "Fragmentos cercanos" o "Resultados" según el caso, más "3 fragmentos" en mono y el botón de cerrar ×.
- **Tarjeta de fragmento:** padding 12, radio 10, fondo `--raise`. El borde es `--ac` si está activa y `--line` si no. Contiene:
  - El n.º en un cuadro de 20 px (`--ac-bg`) y la ref. "Contrato_2025.pdf · p. 4" en mono 12.
  - Una barra de similitud de 4 px rellena en `--ac`, con el % en mono.
  - El extracto (13.5, `--muted`) con la frase relevante resaltada (fondo `--ac-bg`, texto `--ac-text`).
  - El botón "Abrir en el documento".
- Si no hay nada: "Aquí verás los fragmentos de tus documentos en los que se apoya cada respuesta."
- **Visor de PDF:**
  - Botón "← Volver a la evidencia" y la línea "nombre · p. N" en mono.
  - Debajo, la página del PDF (fondo `#fbfaf7`, radio 6) con el fragmento resaltado en `oklch(0.88 0.07 130)`. En producción, renderiza la página real (p. ej. con pdf.js) y resalta el fragmento.

### Overlays
- **Paleta de comandos** (Ctrl/⌘+K alterna, Esc cierra):
  - Fondo `rgba(60,50,30,.4)`. Caja de `min(560px,100%)` a 12vh del borde superior, radio 12.
  - Input de 48 px de alto con el placeholder "Buscar documentos, espacios o acciones…".
  - Comandos: Nueva conversación, Nueva nota rápida, Cambiar a modo Recordar/Preguntar, "Ir a {Espacio}" y cada documento. Cada uno muestra su grupo en mono a la derecha.
  - Sin resultados: "Nada coincide con esa búsqueda."
- **Aviso de espacio sensible:** aparece antes de enviar una pregunta en un espacio sensible con el plan gratuito. Texto: "Este espacio está marcado como sensible" / "Estás usando el plan gratuito de Gemini. Google puede usar tu pregunta y los fragmentos enviados para mejorar sus productos." Botones: Cancelar y "Enviar de todos modos".
- **Arrastrar y soltar** en cualquier parte: overlay `rgba(40,44,32,.78)` con un recuadro de borde discontinuo `--ac` que dice "Suelta para agregar a {Espacio}".

## Interactions & Behavior
- Respuesta en streaming: el texto entra token a token y cada chip de cita aparece cuando su frase está completa. Se conecta a la ruta de chat existente con streaming.
- Indexación: el estado de cada documento avanza por las 5 etapas. En el backend, expone la etapa actual (por polling o SSE).
- Eliminar documento: borra el PDF, sus fragmentos y sus embeddings. Las citas que apuntaban a él deben mostrarse como no disponibles.
- Hover: los botones ghost toman fondo `--raise`; las filas toman borde `--faint`.
- Focus: `outline 2px var(--ac)`, offset 2.
- El panel izquierdo y el de Evidencia se colapsan con sus botones. Al cambiar de breakpoint se restablece su estado abierto o cerrado.

## State Management
- Del espacio y la biblioteca: `space`, `spaces[]` (`{id, name, sensitive}`), `docs[]` (`{id, spaceId, type, name, summary, tags[], date, pages, status: 'ready'|'processing'|'error', stage 0-4, error}`).
- De la conversación: `mode: 'preguntar'|'recordar'`, `turns[]` (usuario / etapa / respuesta con `citations[]` / unknown con `near[]` / recall con `results[]`), `draft`, `busy`, `title`.
- De la interfaz: `libOpen`, `evOpen`, `activeCite`, `viewer` (`{doc, page, chunk}`), `paletteOpen`, `tab`, `libWidth`, `spacesH` (estos dos persisten en localStorage).
- Privacidad: `plan: 'gratuito'|'de pago'`, que viene de la configuración del servidor.
- Funciones nuevas en el backend: espacios, resumen y etiquetas al indexar, etapas de indexación, modo Recordar (solo búsqueda vectorial top-K, sin LLM), fragmentos cercanos con % de similitud cuando la evidencia no basta, "Buscar más a fondo" (búsqueda híbrida con coincidencia por palabras) e historial guardado de conversaciones. **No añadir nube ni cuentas:** todo es local salvo las llamadas a Gemini.

## Design Tokens (tema claro, por defecto)
| Token | Valor | Uso |
|---|---|---|
| --bg | #f4efe4 | fondo de la conversación |
| --panel | #ece5d6 | paneles laterales y tarjetas |
| --raise | #fbf8f1 | tarjetas elevadas, burbuja del usuario |
| --line | rgba(74,62,40,.13) | bordes |
| --text | #2a2a22 | texto |
| --muted | #5e5a4c | texto secundario |
| --faint | #6e6a5b | metadatos |
| --ac | oklch(0.56 0.07 140) | acento salvia: solo memoria, citas y evidencia |
| --on-ac | #fbf8f1 | texto sobre el acento |
| --ac-bg | oklch(0.56 0.07 140 / .14) | relleno tenue del acento |
| --ac-text | oklch(0.42 0.07 140) | texto en el acento |
| --err / --err-bg | oklch(0.52 0.12 40) / oklch(0.6 0.11 40 / .13) | errores (terracota) |
| --warn | oklch(0.52 0.1 75) | aviso del plan gratuito |
| --ok | oklch(0.5 0.08 145) | plan de pago |

Tema oscuro: --bg #1d1f19, --panel #23261f, --raise #2c3027, --line rgba(235,225,200,.1), --text #ece6d6, --muted #b3ad9c, --faint #9a9584, --ac oklch(0.74 0.08 140), --on-ac #1d1f19, --ac-text oklch(0.84 0.07 140), --err oklch(0.74 0.11 40).

- **Tipografía:** IBM Plex Sans (400/500/600) para la interfaz e IBM Plex Mono (400/500) solo para metadatos (páginas, %, nombres de archivo, atajos). Base 14 px con interlineado 1.5. Tamaños: 11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 26.
- **Radios:** 6 (chips y botones pequeños), 7–8 (botones), 9–10 (tarjetas), 12 (contenedores y modales), 999 (píldoras).
- **Espaciado:** gaps de 2, 4, 6, 8, 10, 12, 14, 18, 22 y 28. Objetivo táctil de 32 px en escritorio y 44 px en móvil.
- **Sombras:** solo en la paleta de comandos (`0 20px 60px rgba(0,0,0,.4)`). En lo demás, bordes de 1 px.

## Assets
Íconos de Lucide (subida, menú). No hay imágenes. Las fuentes vienen de Google Fonts (IBM Plex Sans e IBM Plex Mono).

## Files
- `MeAI v2.dc.html`: prototipo completo con todas las pantallas y estados. El marcado está en `<x-dc>` y la lógica y los datos de ejemplo, en el `<script data-dc-script>` del final.
- `support.js`: runtime necesario para abrir el prototipo en el navegador. No forma parte de la implementación.

## Prompt sugerido para Claude Code
> Lee `design_handoff_meai_interfaz/README.md` y abre `MeAI v2.dc.html` como referencia visual. Reimplementa la interfaz en este repo Next.js con componentes TSX en `components/` (Library, Conversation, EvidencePanel, PdfViewer, CommandPalette), usando los tokens del README como variables CSS en `app/globals.css`. Conecta la subida, el listado, el reprocesado y el borrado de documentos y el chat en streaming a las rutas API existentes. Empieza por el layout de tres paneles y el flujo pregunta → respuesta con citas → evidencia; deja para después las funciones de backend nuevas (espacios, modo Recordar, fragmentos cercanos).
