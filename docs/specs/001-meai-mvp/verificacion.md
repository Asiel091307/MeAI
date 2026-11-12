# Verificación 001: criterios de aceptación frente a tests (T66)

Fecha: 2026-11-11. Fuente: [`spec.md`](./spec.md). Rutas relativas a `tests/`: `u/` es `tests/unit/`, `ui/` es `tests/unit/ui/` e `i/` es `tests/integration/`.

Reglas aplicadas (de `AGENTS.md`):
- Lo que depende de SQL o pgvector se verifica con PostgreSQL real (`i/`).
- La interfaz se verifica con tests de interfaz (`ui/`).
- La lógica RAG puede usar proveedores simulados.

**Resultado:** todos los RF, RNF y casos límite tienen al menos un test automatizado aplicable. Los huecos que encontró la revisión se cerraron con tests nuevos. Dos de esos tests destaparon bugs reales, ya corregidos:
- El listado no mostraba el error de un reprocesamiento fallido sobre un documento disponible.
- Las rutas de listado y reprocesamiento devolvían un 500 vacío si fallaba la base de datos.

## Requisitos funcionales

| RF | Criterios | Tests principales |
| --- | --- | --- |
| RF-1 Incorporación | Límites de 10 MB y 100 páginas, rechazo en español sin registrar; texto por página; OCR en español e inglés; dañado o protegido queda `failed`; duplicados independientes | `u/pdf-upload-validation`, `u/register-document`, `u/documents-post-route`, `u/pdf-text-extraction`, `u/pdf-page-texts`, `i/scanned-pdf-ocr`, `i/mixed-pdf-ocr`, `i/register-document`, `i/failed-documents-routes`, `i/mvp-upload-and-ask` |
| RF-2 Estado | `processing` excluido de consultas; `available` solo si todas las páginas son legibles; ilegible, vacío, interrumpido o con fallo de embeddings termina `failed` sin contenido; un `failed` se puede reintentar o eliminar | `u/readable-pages`, `u/process-document`, `i/process-document-pipeline`, `i/mixed-pdf-failure`, `i/document-publication`, `i/startup-recovery`, `i/chunk-search`, `ui/document-list`, `ui/document-list-spec-gaps` |
| RF-3 Consulta | Pregunta vacía o de más de 1000 caracteres rechazada (servidor e interfaz); búsqueda en todos los documentos disponibles; exclusión de los no disponibles; sin documentos no se consulta; un fallo de búsqueda se puede reintentar | `u/question-validation`, `u/search-question`, `u/chat-answers-route`, `u/chat-route-closing`, `i/chunk-search`, `i/multi-document-search`, `ui/chat-spec-gaps` |
| RF-4 Respuestas fundamentadas | Solo evidencia recuperada; **cita por respuesta** (documento y página de cada fuente, ver la decisión de RF-4.2 en `spec.md`); citas inventadas descartadas; sin evidencia, mensaje explícito sin citas; varios documentos con fuentes distinguidas | `u/gemini-generation`, `u/grounded-answer`, `u/citation-validation`, `u/multi-document-answer`, `i/mvp-upload-and-ask`, `ui/chat-streaming-and-citations`, `ui/chat-spec-gaps` |
| RF-5 Conversación | Seguimiento con historial que vuelve a buscar evidencia vigente; memoria solo en la pestaña; una pregunta activa a la vez (409 en el servidor, controles deshabilitados en la interfaz); prioridad documental; citas de documentos eliminados marcadas como no disponibles | `u/conversation-context`, `u/active-question-guard`, `u/dependent-query-cancellation`, `ui/chat-memory`, `ui/chat-spec-gaps`, `ui/home-page-wiring` |
| RF-6 Progresivo | Texto que llega antes del evento final; indicador de operación en curso; un fallo retira el texto parcial y permite reintentar | `u/gemini-generation`, `u/chat-answers-route`, `ui/chat-streaming-and-citations`, `ui/chat-spec-gaps` |
| RF-7 Listado | Cada documento con su estado, sin binarios; cambios de estado sin recargar; estado vacío que invita a subir | `i/document-list`, `u/documents-route`, `ui/document-list`, `ui/document-status-transitions`, `i/mvp-upload-and-ask` |
| RF-8 Eliminación | Confirmación previa; borrado atómico de PDF, versiones, fragmentos y vectores; cancelación de respuestas que dependen del documento; un borrado fallido no se muestra como hecho | `ui/document-delete`, `i/document-delete`, `i/delete-document`, `u/documents-delete-route`, `u/chat-route-closing`, `i/mvp-delete-and-reprocess` |
| RF-9 Reprocesamiento | 202 y exclusión mientras corre; solo la versión nueva al terminar; si falla, se restaura la anterior; un `failed` sigue `failed` con la causa nueva; cancelación de respuestas que dependen del documento | `i/document-reprocessing`, `u/reprocess-document`, `u/documents-reprocess-route`, `u/chat-route-closing`, `ui/document-reprocess`, `ui/document-list-spec-gaps`, `i/mvp-delete-and-reprocess` |

## Requisitos no funcionales

| RNF | Tests principales |
| --- | --- |
| RNF-1 Español | `u/api-error-messages-spanish`, `u/api-repository-failures` y los tests de interfaz |
| RNF-2 Evidencia identificable | `u/citation-validation`, `ui/chat-streaming-and-citations`, `i/mvp-upload-and-ask` |
| RNF-3 Sin estados parciales | `i/chunk-repository`, `i/document-publication`, `i/process-document-pipeline`, `i/delete-document`, `ui/chat-streaming-and-citations` |
| RNF-4 Estados distinguibles | `ui/document-list`, `ui/document-status-transitions` |
| RNF-5 Persistencia tras reiniciar | `i/app-restart-persistence`, `i/startup-recovery` |
| RNF-6 Tests por comportamiento | Proceso (T66a): la suite completa debe pasar antes de integrar |
| RNF-7 Privacidad | `u/processing-failure-privacy`, `u/documents-route`, `i/document-list`, `u/client-imports` |
| RNF-8 Operación en curso | `ui/chat-streaming-and-citations`, `ui/document-status-transitions` |
| RNF-9 Historial efímero | `ui/chat-memory`, `i/app-restart-persistence` |

## Casos límite

Los 11 casos límite tienen tests:
- Dañado o protegido: `i/failed-documents-routes`.
- Vacío o manuscrito: `u/readable-pages`, `i/process-document-pipeline`.
- PDF mixto con una página ilegible: `i/mixed-pdf-failure`.
- Duplicados: `i/register-document`.
- Documento citado y luego eliminado: `ui/chat-spec-gaps`, `ui/home-page-wiring`.
- Preguntas inválidas o sin respaldo: `u/question-validation`, `u/grounded-answer`, `ui/chat-spec-gaps`.
- Varios documentos: `i/multi-document-search`, `ui/chat-spec-gaps`.
- Sin documentos aunque haya historial: `u/chat-route-closing`, `ui/chat-spec-gaps`.
- Interrupciones: `i/startup-recovery`, `ui/chat-streaming-and-citations`.
- Reprocesamiento: `i/document-reprocessing`.
- Segunda pregunta durante otra: `u/active-question-guard`, `ui/chat-spec-gaps`.

## Límites conocidos (no bloqueantes)

- **Calidad del modelo real:** que Gemini no use conocimiento externo (RF-4.1) y que priorice los documentos sobre el historial (RF-5.5) se fija en las instrucciones y se prueba con un generador simulado. Un test determinista no puede garantizar el comportamiento del modelo real.
- **Citas:** la cita es por respuesta, no frase a frase (decisión del usuario del 2026-11-11).
- **Escenarios simulados:** el OCR real se prueba con PDF sintéticos, y el manuscrito ilegible se simula con un OCR que devuelve ruido. La recarga de pestaña se simula desmontando y montando el componente; no hay tests en un navegador real.
- **Embeddings de Gemini:** el test de humo `i/gemini-embeddings.smoke` solo corre si existe `GEMINI_API_KEY`.
