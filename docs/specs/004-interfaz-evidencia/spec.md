# Especificación 004: Interfaz de tres paneles y panel de evidencia

Estado: **aprobada por el usuario el 2026-11-13.**

Forma parte del roadmap "MeAI como memoria externa personal" (004–011). Esta spec convierte la pantalla única del MVP en un espacio de trabajo de tres paneles, donde cada respuesta muestra **de dónde sale**: las fuentes numeradas, su similitud y el PDF abierto en la página citada.

## Contexto y objetivo

Hoy (spec 001) la pantalla apila el formulario de subida, el listado y el chat. Las fuentes aparecen como texto plano debajo de cada respuesta ("Fuente: … — Página N (Fragmento …)"). Para comprobar una respuesta, el usuario tiene que buscar el PDF por su cuenta.

Objetivo: que comprobar una respuesta tome un clic.
- **Biblioteca** (izquierda): subir, listar, reprocesar y eliminar documentos.
- **Conversación** (centro): preguntas y respuestas, con las fuentes numeradas `[1]`, `[2]`… debajo de cada respuesta.
- **Evidencia** (derecha): una tarjeta por fuente de la respuesta seleccionada, con documento, página, similitud y fragmento, y el PDF abierto en la página citada.

## Decisiones tomadas (2026-11-13)

- **Citas `[n]` = fuentes numeradas.** Se numeran las fuentes que ya acompañan a cada respuesta. **No** se añaden marcadores dentro del texto. RF-4.2 de la spec 001 (cita por respuesta) no cambia, y tampoco el prompt ni el parser de `gemini-generation.ts`.
- **Visor = `<iframe>` con `#page=N`.** Se usa el visor de PDF integrado del navegador. El resaltado del fragmento con `pdfjs-dist` queda para la spec **004b**.
- **Sin dependencias nuevas.** Layout con CSS Grid y estilos propios (un CSS en `app/`). Sin librerías de componentes ni de estilos.

## Usuarios

El mismo de la spec 001: un usuario individual, en local (`127.0.0.1`), sin cuentas.

## Requisitos funcionales

### RF-004-1. Disposición en tres paneles

La pantalla principal deberá mostrar Biblioteca, Conversación y Evidencia como tres regiones identificables.

Criterios de aceptación EARS:

- Cuando el usuario abra MeAI, el sistema deberá mostrar tres regiones con nombre accesible "Biblioteca", "Conversación" y "Evidencia", en ese orden de izquierda a derecha.
- Mientras el ancho de la ventana sea menor de 1024 px, el sistema deberá apilar las regiones en vertical (Biblioteca, Conversación, Evidencia) sin desplazamiento horizontal.
- El sistema deberá conservar todo el comportamiento de la spec 001 que hoy está en la pantalla única: subir, listar con estados, reprocesar, eliminar con confirmación, chat con streaming, bloqueo de segunda pregunta, memoria solo en la pestaña y citas no disponibles tras eliminar.

### RF-004-2. Fuentes numeradas en la conversación

Cada respuesta con fuentes deberá mostrarlas numeradas y seleccionables.

Criterios de aceptación EARS:

- Cuando una respuesta termine con fuentes, el sistema deberá mostrarlas debajo de la respuesta como botones `[1]`, `[2]`… en el orden recibido, cada uno con el nombre del documento y la página.
- Cuando el usuario pulse una fuente `[n]`, el sistema deberá seleccionar esa respuesta y la tarjeta `n` en el panel de Evidencia.
- Cuando termine una respuesta nueva con fuentes, el sistema deberá seleccionarla y mostrar sus tarjetas, con la `[1]` seleccionada.
- Si la respuesta no tiene fuentes (falta de evidencia, error o cancelación), el sistema no deberá mostrar números de fuente para ella.

### RF-004-3. Panel de evidencia

El panel de Evidencia deberá mostrar las fuentes de la respuesta seleccionada.

Criterios de aceptación EARS:

- Mientras haya una respuesta seleccionada, el sistema deberá mostrar una tarjeta por fuente, con: número `[n]`, nombre del documento, página, similitud y el texto del fragmento.
- El sistema deberá mostrar la similitud como el `score` de la búsqueda (similitud coseno) con dos decimales y coma decimal, por ejemplo "Similitud: 0,87".
- Cuando el usuario seleccione una tarjeta, el sistema deberá marcarla como seleccionada de forma accesible (`aria-current` o `aria-selected`) y mostrar su PDF en el visor.
- Mientras no haya ninguna respuesta con fuentes, el sistema deberá mostrar el texto "Aquí verás las fuentes de cada respuesta." en lugar de tarjetas.
- Si el documento de una fuente fue eliminado, el sistema deberá mostrar su tarjeta como "Fuente no disponible (documento eliminado)", con el fragmento recibido en su momento y sin visor.

### RF-004-4. Visor del PDF en la página citada

El sistema deberá mostrar el PDF original abierto en la página de la fuente seleccionada.

Criterios de aceptación EARS:

- Cuando se seleccione una fuente disponible, el sistema deberá mostrar un `<iframe>` con título "Documento {nombre}, página {n}" y origen `/api/documents/{documentId}/file#page={page}`.
- Cuando cambie la fuente seleccionada, el sistema deberá actualizar el visor a su documento y su página.
- Si el navegador no puede mostrar PDF dentro de la página, el sistema deberá ofrecer el enlace "Abrir el PDF en una pestaña nueva" a la misma dirección.

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

## Requisitos no funcionales

- RNF-004-1. Sin dependencias nuevas: CSS Grid y estilos propios; el visor usa el del navegador.
- RNF-004-2. Todo el texto visible y los mensajes de error estarán en español (RNF-1).
- RNF-004-3. Accesibilidad básica: regiones con nombre, fuentes `[n]` como botones con nombre accesible ("Fuente 1: {documento}, página {n}"), foco visible y orden de tabulación Biblioteca → Conversación → Evidencia.
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
