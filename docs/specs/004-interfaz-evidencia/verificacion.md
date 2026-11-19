# Verificación 004: criterios frente a tests (T004-15)

Fecha: 2026-11-18. Fuente: [`spec.md`](./spec.md). Rutas relativas a `tests/`: `u/` = `tests/unit/`, `ui/` = `tests/unit/ui/`, `i/` = `tests/integration/`.

| Requisito | Tests |
| --- | --- |
| RF-004-1 Tres paneles y disposición | `ui/workspace-layout` (regiones, cortes 1180/760, cajón en tablet, cajón y objetivos de 44 px en móvil, ancho 220–640 guardado y restablecido), `ui/ui-testing-setup` |
| RF-004-2 Chips de cita | `ui/evidence-flow` (chips numerados con nombre accesible y tooltip, chip activo, chips en la última línea aunque el modelo termine con salto de línea), `ui/chat-spec-gaps`, `ui/chat-streaming-and-citations` |
| RF-004-3 Panel de evidencia | `ui/evidence-flow` (encabezado y total, "{doc} · p. N", porcentaje de similitud, `aria-current`, tarjeta no disponible tras eliminar), `ui/workspace-layout` (estado vacío) |
| RF-004-4 Visor | `ui/evidence-flow` (iframe con título y `…/file#page=N`, enlace a pestaña nueva, volver, "Ver" en página 1, se cierra si se elimina el documento) |
| RF-004-5 Archivo original | `u/get-document-file`, `u/document-file-route`, `i/document-file-route` |
| RF-004-6 `score` en las citas | `u/citation-score`, `u/chat-answers-route` |
| RF-004-7 Biblioteca | `ui/question-and-upload` (subida múltiple con rechazo por archivo, error y "Reintentar"), `ui/document-*`, `ui/pdf-upload`, `ui/workspace-layout` (pie del plan) |
| RF-004-8 Conversación | `ui/question-and-upload` (pregunta vacía, sin documentos listos, contador, Enter y Shift+Enter, estado vacío), `ui/evidence-flow` (tarjeta "No recuerdo"), `ui/chat-memory`, `ui/server-unreachable` |
| RF-004-9 Paleta | `ui/command-palette` |
| RF-004-10 Arrastrar y soltar | `ui/question-and-upload` |
| RNF-004-4 Imports del cliente | `u/client-imports` (ahora recorre las subcarpetas de `components/`) |

## Revisión manual (2026-11-18)

- **Diseño:** escritorio en tema claro y oscuro, y móvil con la hoja inferior de evidencia, comparados con `design_handoff_meai_interfaz/MeAI v2.dc.html`.
- **App real** (Docker, PostgreSQL y Gemini): pregunta sobre un CV subido → respuesta con 3 chips de cita → tarjetas de evidencia → visor con el PDF original en la página 1.
- **Hallazgo corregido:** Gemini termina su respuesta con un salto de línea, y eso dejaba los chips en una línea aparte. Ahora el texto se recorta al final y hay un test que lo cubre.

## Checks (T004-16)

`pnpm lint`, `pnpm typecheck`, `pnpm test` (279 tests) y `pnpm test:integration` (48 tests, Compose, puerto 3000 y Gemini real) en verde, sin dependencias nuevas en `package.json`.
