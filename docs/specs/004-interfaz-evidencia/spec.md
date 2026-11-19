# Especificación 004: Interfaz de tres paneles y panel de evidencia

Estado: **aprobada por el usuario el 2026-11-13.**

Forma parte del roadmap "MeAI como memoria externa personal" (004–011). Esta spec convierte la pantalla única del MVP en un espacio de trabajo de tres paneles, donde cada respuesta muestra **de dónde sale**: las fuentes numeradas, su similitud y el PDF abierto en la página citada.

## Contexto y objetivo

Hoy (spec 001) la pantalla apila el formulario de subida, el listado y el chat. Las fuentes aparecen como texto plano debajo de cada respuesta ("Fuente: … — Página N (Fragmento …)"). Para comprobar una respuesta, el usuario tiene que buscar el PDF por su cuenta.

Objetivo: que comprobar una respuesta tome un clic.
- **Biblioteca** (izquierda): subir, listar, reprocesar y eliminar documentos.
- **Conversación** (centro): preguntas y respuestas, con las fuentes numeradas `[1]`, `[2]`… debajo de cada respuesta.
- **Evidencia** (derecha): una tarjeta por fuente de la respuesta seleccionada, con documento, página, similitud y fragmento, y el PDF abierto en la página citada.

## Decisiones tomadas

2026-11-13:
- **Citas `[n]` = fuentes numeradas, por respuesta.** RF-4.2 de la spec 001 (cita por respuesta) no cambia, y tampoco el prompt ni el parser de `gemini-generation.ts`.
- **Visor = `<iframe>` con `#page=N`.** El resaltado del fragmento dentro del PDF con `pdfjs-dist` queda para la spec **004b**.

2026-11-18 (diseño de alta fidelidad en `design_handoff_meai_interfaz/`, entregado aparte y no publicado en el repositorio):
- **El diseño manda en lo visual:** colores, tipografía, medidas, radios y textos son los del handoff. Esta spec se actualizó para coincidir con él.
- **Chips de cita al final de la respuesta.** Tienen el aspecto de los chips del diseño, pero van juntos al final del texto, no frase a frase. Así se respeta la cita por respuesta.
- **Lo que no tiene backend todavía se oculta hasta su spec:** Espacios y modo sensible (008), Historial y Línea de tiempo (005), modo Recordar (007), "No recuerdo" con fragmentos cercanos, aclaración y reformulaciones (006), etapas, resumen y etiquetas (009), "Sobre mí" (010), además de Regenerar, valoraciones, título editable, notas rápidas y preguntas de ejemplo. Nada se simula.
- **Fuentes IBM Plex Sans y Mono con `next/font/google`.** Viene incluido en Next (sin dependencias nuevas), se descarga al construir y la app la sirve; el navegador no contacta con Google.
- **Íconos de Lucide copiados como SVG en línea** (licencia ISC), sin instalar `lucide-react`.

## Usuarios

El mismo de la spec 001: un usuario individual, en local (`127.0.0.1`), sin cuentas.

## Requisitos funcionales

### RF-004-1. Disposición en tres paneles

La pantalla principal deberá mostrar Biblioteca, Conversación y Evidencia.

Criterios de aceptación EARS:

- Cuando el usuario abra MeAI, el sistema deberá mostrar tres regiones con nombre accesible "Biblioteca", "Conversación" y "Evidencia".
- Mientras la ventana mida 1180 px o más, el sistema deberá mostrar las tres en fila: Biblioteca (280 px por defecto), Conversación (el resto) y Evidencia (360 px, abierta).
- Mientras mida entre 760 y 1179 px, el sistema deberá mostrar la Evidencia como un cajón a la derecha (360 px, máx. 90 %) con fondo oscurecido, cerrado hasta que se abra.
- Mientras mida menos de 760 px, el sistema deberá mostrar una columna: la Biblioteca como cajón izquierdo (86 %, máx. 320 px) que abre el botón "Biblioteca", y la Evidencia como hoja inferior (72 % de alto). El objetivo táctil subirá de 32 a 44 px.
- Cuando el usuario arrastre el borde derecho de la Biblioteca, el sistema deberá cambiar su ancho entre 220 y 640 px y guardarlo en `localStorage['meai-libw']`; con doble clic volverá a 280 px. No existe en móvil.
- Cuando el usuario pulse el botón "Biblioteca" o "Evidencia" (o el × de la Evidencia), el sistema deberá mostrar u ocultar ese panel. Al cambiar de tamaño de ventana se restablece su estado por defecto.
- El sistema deberá conservar todo el comportamiento de la spec 001: subir, listar con estados, reprocesar, eliminar con confirmación, chat con streaming, bloqueo de segunda pregunta, memoria solo en la pestaña y citas no disponibles tras eliminar.

### RF-004-2. Chips de cita al final de la respuesta

Cada respuesta con fuentes deberá mostrarlas como chips numerados y seleccionables.

Criterios de aceptación EARS:

- Cuando una respuesta termine con fuentes, el sistema deberá mostrar al final del texto un chip por fuente, numerado `1`, `2`… en el orden recibido, con el tooltip "{documento} · p. {n}" y el nombre accesible "Fuente {n}: {documento}, página {p}".
- Cuando el usuario pulse un chip, el sistema deberá abrir la Evidencia, seleccionar esa respuesta y resaltar la tarjeta del chip; el chip activo se mostrará con fondo de acento.
- Cuando termine una respuesta nueva con fuentes, el sistema deberá seleccionarla y mostrar sus tarjetas.
- Si la respuesta no tiene fuentes (falta de evidencia, error o cancelación), el sistema no deberá mostrar chips para ella.

### RF-004-3. Panel de evidencia

El panel de Evidencia deberá mostrar las fuentes de la respuesta seleccionada.

Criterios de aceptación EARS:

- Mientras haya una respuesta seleccionada con fuentes, el sistema deberá mostrar el encabezado "Evidencia de esta respuesta", el total ("3 fragmentos") y una tarjeta por fuente con: número, "{documento} · p. {n}", una barra de similitud con su porcentaje (`score` × 100, redondeado, por ejemplo "87%"), el texto del fragmento y el botón "Abrir en el documento".
- La tarjeta resaltada (por un chip) llevará borde de acento y `aria-current="true"`.
- Mientras no haya ninguna respuesta con fuentes, el sistema deberá mostrar "Aquí verás los fragmentos de tus documentos en los que se apoya cada respuesta.".
- Si el documento de una fuente fue eliminado, su tarjeta mostrará "Fuente no disponible (documento eliminado)", con el fragmento recibido en su momento y sin el botón "Abrir en el documento".

### RF-004-4. Visor del PDF en la página citada

El sistema deberá mostrar el PDF original abierto en la página de la fuente.

Criterios de aceptación EARS:

- Cuando el usuario pulse "Abrir en el documento", el sistema deberá sustituir la lista de evidencia por el visor: botón "← Volver a la evidencia", la línea "{documento} · p. {n}" y un `<iframe>` con título "Documento {nombre}, página {n}" y origen `/api/documents/{documentId}/file#page={page}`, sobre el fondo de página del diseño.
- Cuando el usuario elija "Ver" en el menú de un documento, el sistema deberá abrir el visor en la página 1.
- El visor ofrecerá también el enlace "Abrir el PDF en una pestaña nueva" a la misma dirección.

### RF-004-5. Descarga del PDF original

El sistema deberá servir los bytes originales de un documento guardado.

Criterios de aceptación EARS:

- Cuando se pida `GET /api/documents/{id}/file` de un documento existente, el sistema deberá responder `200` con exactamente los bytes guardados en `pdf_bytes`, `Content-Type: application/pdf`, `Content-Disposition: inline` con el nombre del archivo, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`.
- Si el id no existe o no es un UUID, el sistema deberá responder `404` con un mensaje en español, sin consultar la base en el caso del UUID inválido.
- Si la base de datos falla, el sistema deberá responder `500` con un mensaje en español, sin detalles internos.
- El sistema deberá servir el archivo de cualquier documento existente, sea cual sea su estado: el PDF es del usuario y verlo no lo hace consultable.

### RF-004-6. Similitud en las citas

Cada cita resuelta deberá llevar la similitud con que se recuperó su fragmento.

Criterios de aceptación EARS:

- Cuando el servidor resuelva las citas de una respuesta, cada `ResolvedCitation` del evento `final` deberá incluir `score`: el mismo valor que devolvió `searchSimilar` para ese fragmento.
- El sistema no deberá alterar el orden ni el filtrado de las citas: solo se citan fuentes realmente recuperadas (RF-4.2).

### RF-004-7. Biblioteca

Criterios de aceptación EARS:

- El sistema deberá mostrar el logo "MeAI", el botón "Buscar…" con el atajo "Ctrl+K" (abre la paleta), el botón "Subir documentos" ("PDF hasta 10 MB · o arrástralos aquí") con selección múltiple, la lista de documentos y el pie "Gemini · plan gratuito" con el tooltip de privacidad del diseño (spec 002).
- Cada documento se mostrará como tarjeta: chip "PDF", nombre en mono con elipsis, fecha de alta ("14 mar 2025") y botón "Más acciones" (⋯) con Ver, Reprocesar y Eliminar. Su estado será accesible como texto ("Disponible", "En procesamiento", "Fallido").
- Mientras un documento esté en procesamiento, su tarjeta mostrará la barra de progreso y "Procesando…" (las etapas detalladas llegan con la spec 009).
- Si un documento tiene error, su tarjeta mostrará el error en un chip terracota y el botón "Reintentar" (reprocesa). Un documento disponible con error (reprocesamiento fallido, RF-9.4) mostrará también el chip.
- Cuando el usuario elija Eliminar, el sistema deberá pedir confirmación en línea: "¿Eliminar este documento? Se borran el PDF, sus fragmentos y sus embeddings. No se puede deshacer.", con los botones Eliminar y Cancelar.
- Cuando el usuario suba varios archivos, el sistema deberá enviarlos uno a uno a `POST /api/documents` y mostrar el motivo de cada rechazo con el nombre del archivo.

### RF-004-8. Conversación

Criterios de aceptación EARS:

- El encabezado mostrará el botón "Biblioteca", el título (la primera pregunta, o "Nueva conversación") y el botón "Evidencia".
- Mientras no haya mensajes, el sistema deberá mostrar "¿Qué necesitas recordar?" y "Respondo solo con lo que dicen tus documentos, y te muestro dónde lo dice."; si no hay documentos, además la zona "Arrastra tus documentos aquí" con el botón "Elegir archivos".
- La pregunta del usuario aparecerá en burbuja a la derecha; mientras se busca o genera, el estado ("Buscando evidencia…") y el texto provisional llevarán el cursor parpadeante del diseño.
- Una respuesta terminada mostrará las acciones "Copiar" y "Ver evidencia".
- Cuando la respuesta indique falta de evidencia (RF-4.3), el sistema deberá mostrar la tarjeta "No encontré esto con seguridad en tus documentos." / "Prefiero decírtelo antes que inventar una respuesta.", con el enlace "Subir un documento que lo contenga". Sin citas (las sugerencias llegan con la spec 006).
- La barra de entrada tendrá un área de texto autoajustable (máx. 1000 caracteres), el contador "0/1000", "Adjuntar" (sube archivos) y el botón "Enviar". Enter envía y Shift+Enter hace salto de línea.
- Si el campo está vacío, el sistema deberá mostrar "Escribe una pregunta para consultar tus documentos." sin consultar al servidor; si no hay documentos disponibles, "Todavía no hay documentos listos. Sube uno para empezar."

### RF-004-9. Paleta de comandos

Criterios de aceptación EARS:

- Cuando el usuario pulse Ctrl+K (o ⌘+K) o el botón "Buscar…", el sistema deberá abrir la paleta "Buscar documentos, espacios o acciones…"; Ctrl+K de nuevo o Esc la cierran.
- La paleta ofrecerá "Nueva conversación" (grupo Acción) y cada documento (grupo Documento, abre el visor), filtrados por el texto escrito; si nada coincide, "Nada coincide con esa búsqueda.".

### RF-004-10. Arrastrar y soltar

Criterios de aceptación EARS:

- Mientras el usuario arrastre archivos sobre la ventana, el sistema deberá mostrar el aviso "Suelta para agregar a tus documentos".
- Cuando los suelte, el sistema deberá subirlos como en RF-004-7.

## Requisitos no funcionales

- RNF-004-1. Sin dependencias nuevas: estilos propios en `app/globals.css` con los tokens del diseño (tema claro por defecto y oscuro con `prefers-color-scheme`), IBM Plex con `next/font/google`, íconos SVG en línea; el visor usa el del navegador.
- RNF-004-2. Todo el texto visible y los mensajes de error estarán en español (RNF-1).
- RNF-004-3. Accesibilidad básica: regiones con nombre, chips como botones con nombre accesible ("Fuente 1: {documento}, página {n}"), foco visible (`outline 2px` de acento) y estados de documento legibles por lectores de pantalla.
- RNF-004-4. Ningún componente del cliente importará código de servidor; lo vigila `tests/unit/client-imports.test.ts`.
- RNF-004-5. `chat-panel.tsx` (248 líneas) se dividirá en componentes pequeños, de no más de unas 120 líneas cada uno: formulario de pregunta, lista de mensajes, mensaje y fuentes numeradas. La lógica de streaming se separa de la presentación.
- RNF-004-6. Privacidad (RNF-7): el PDF solo se sirve a petición del usuario y la aplicación sigue escuchando solo en `127.0.0.1`.

## Casos límite

- Una respuesta sin evidencia ("no contiene información suficiente") no cambia la selección ni muestra tarjetas nuevas.
- Una respuesta con dos fuentes del mismo documento y páginas distintas muestra dos tarjetas, y cada una abre su página.
- Si se elimina el documento de la tarjeta seleccionada, la tarjeta pasa a "no disponible" y el visor desaparece sin error.
- Recargar la página vacía Conversación y Evidencia: la memoria sigue siendo de la pestaña (spec 001, RF-5) hasta la spec 005.
- Un nombre de archivo con acentos o comillas se sirve con `Content-Disposition` correctamente codificado (`filename*=UTF-8''…`).

## Fuera de alcance

- Resaltar el texto del fragmento dentro del PDF y el visor con `pdfjs-dist`: spec 004b.
- Marcadores de cita dentro del texto de la respuesta (cita por frase).
- Historial persistente (005), búsqueda híbrida y "No recuerdo" (006), modo Recordar (007), espacios (008), resúmenes (009), "Sobre mí" (010) y otros formatos (011).
- Cambiar el contenido o el formato de las respuestas de Gemini.

## Contratos y cambios técnicos

| Cambio | Archivo | Quién |
| --- | --- | --- |
| `AnswerSource` añade `score: number` | `src/rag/providers/generation.ts` | **Integrador** (contrato compartido) |
| `ResolvedCitation` añade `score: number`, y `resolveCitations` lo copia | `src/rag/answering/citation-validation.ts` | **Integrador** (tipo que cruza al cliente por el SSE) |
| `toAnswerSource` pasa `score` | `src/rag/retrieval/to-answer-source.ts` | Carril A |
| Caso de uso `getDocumentFile(id, documents)` → `{ status: 'found', name, bytes } \| { status: 'not_found' }`, con la comprobación de UUID | `src/documents/get-document-file.ts` | Carril A |
| Ruta `GET /api/documents/[id]/file` (fina: traduce el caso de uso a HTTP) | `app/api/documents/[id]/file/route.ts` y su handler | Carril B |
| Layout de tres paneles y estado de la selección | `app/page.tsx`, `app/globals.css` (nuevo), `app/layout.tsx` (importar el CSS) | Carril B |
| Partir el chat y nuevos componentes | `components/chat/*`, `components/evidence/evidence-panel.tsx`, `evidence-card.tsx`, `pdf-viewer.tsx`, `components/library/*` (mover el panel actual) | Carril B |
| Tests existentes que importan los componentes movidos | `tests/unit/ui/*` | Carril B |
| Esta spec, `tasks` de la 004, `carriles.md` si cambian los dueños | `docs/` | **Integrador** |

## Tests

Primero los tests, luego el código. Los de interfaz usan `// @vitest-environment happy-dom` (spec 003).

| Test | Nivel | Verifica |
| --- | --- | --- |
| `i/document-file-route.test.mjs` | Integración, PostgreSQL real | `200` con los bytes idénticos y las cabeceras de RF-004-5; `404` para id inexistente e id no UUID; nombre con acentos codificado |
| `u/get-document-file.test.ts` | Unitario | `found` / `not_found`; un id no UUID no llama al repositorio |
| `u/document-file-route.test.ts` | Unitario de ruta | `500` en español sin detalles cuando el repositorio falla |
| `u/citation-score.test.ts` | Unitario | `toAnswerSource` y `resolveCitations` conservan `score`; las citas inventadas siguen descartándose |
| `u/chat-answers-route.test.ts` (ampliado) | Unitario de ruta | El evento `final` lleva `score` en cada cita |
| `ui/three-panel-layout.test.tsx` | Interfaz | Tres regiones con nombre y en orden; el estado vacío de Evidencia |
| `ui/evidence-selection.test.tsx` | Interfaz | Fuentes `[1]` `[2]` como botones; pulsar `[2]` selecciona su tarjeta y cambia el `src` del iframe a `…/file#page=N`; una respuesta nueva selecciona `[1]`; "Similitud: 0,87" |
| `ui/evidence-deleted-source.test.tsx` | Interfaz | Documento eliminado → tarjeta "no disponible", sin iframe |
| `ui/home-page-wiring.test.tsx` (ampliado) | Interfaz | Eliminar en Biblioteca marca la tarjeta de Evidencia como no disponible |
| Todos los `ui/*` actuales | Interfaz | Siguen en verde tras partir los componentes (regresión de la spec 001) |
| `u/client-imports.test.ts` | Unitario | Sigue en verde con los nuevos componentes |

Se ampliará `verificacion.md` (o se creará una propia de la 004) relacionando cada RF-004 con sus tests.

## Criterios de finalización

- La pantalla muestra Biblioteca, Conversación y Evidencia, y se apila en vertical bajo 1024 px.
- Cada respuesta con fuentes las numera, y pulsar `[n]` muestra su tarjeta y el PDF en la página citada.
- `GET /api/documents/{id}/file` devuelve los bytes exactos, con las cabeceras de RF-004-5.
- Las citas llevan `score` de punta a punta: búsqueda → SSE → tarjeta.
- Lint, typecheck, `pnpm test` y `pnpm test:integration` en verde, sin dependencias nuevas.
