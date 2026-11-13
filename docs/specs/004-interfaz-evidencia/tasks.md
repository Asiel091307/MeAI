# Tareas 004: Interfaz de tres paneles y panel de evidencia

Fuente: [`spec.md`](./spec.md), [`docs/constitution.md`](../../constitution.md) y [`docs/coordinacion/carriles.md`](../../coordinacion/carriles.md). Cada tarea está pensada para **20–30 minutos como máximo**. Primero los tests, luego el código. Solo el integrador marca `[x]`, al integrar en `main`.

Columna **Carril**: **I** = integrador (archivos compartidos), **A** = datos y casos de uso, **B** = rutas e interfaz.

## 1. Contratos (integrador, antes que nada)

- [x] T004-01. **I.** Añadir `score: number` a `AnswerSource` (`src/rag/providers/generation.ts`) y a `ResolvedCitation` (`src/rag/answering/citation-validation.ts`); `resolveCitations` lo copia. Ajustar los fakes de los tests que construyen esos tipos. **RF-004-6.**
  Hecho cuando: un test unitario comprueba que `resolveCitations` conserva `score` y sigue descartando ids inventados; typecheck y `pnpm test` en verde.

## 2. Datos y casos de uso (carril A)

- [x] T004-02. **A.** `toAnswerSource` pasa `score` del `RetrievedChunk`. **RF-004-6.**
  Hecho cuando: `u/citation-score.test.ts` verifica que el `score` de la búsqueda llega intacto al `AnswerSource`.
- [x] T004-03. **A.** Caso de uso `getDocumentFile(id, documents)` en `src/documents/get-document-file.ts`: devuelve `found` (con nombre y bytes) o `not_found`; un id no UUID no llama al repositorio. **RF-004-5.**
  Hecho cuando: `u/get-document-file.test.ts` cubre los dos resultados y el UUID inválido.

## 3. Ruta del archivo (carril B; depende de T004-03)

- [x] T004-04. **B.** `GET /api/documents/[id]/file`: `200` con bytes, `Content-Type: application/pdf`, `Content-Disposition: inline; filename*=UTF-8''…`, `X-Content-Type-Options: nosniff` y `Cache-Control: no-store`; `404` y `500` en español. **RF-004-5.**
  Hecho cuando: `u/document-file-route.test.ts` cubre `404`/`500` y `i/document-file-route.test.mjs` (PostgreSQL real) comprueba los bytes idénticos, las cabeceras y un nombre con acentos.
- [x] T004-05. **B.** El evento `final` del chat lleva `score` en cada cita. **RF-004-6.**
  Hecho cuando: `u/chat-answers-route.test.ts` ampliado lo comprueba de punta a punta (búsqueda simulada → SSE).

## 4. Partir la conversación (carril B)

- [ ] T004-06. **B.** Separar la lógica de streaming de `chat-panel.tsx` en un hook (`components/chat/use-chat-answers.ts`) sin cambiar su comportamiento. **RNF-004-5.**
  Hecho cuando: todos los `ui/chat-*` y `ui/home-page-wiring` actuales siguen en verde sin cambiar sus aserciones.
- [ ] T004-07. **B.** Dividir la presentación en `components/chat/question-form.tsx`, `message-list.tsx` y `message-item.tsx`, de no más de unas 120 líneas cada uno. **RNF-004-5.**
  Hecho cuando: los mismos tests siguen en verde y `u/client-imports.test.ts` pasa.
- [ ] T004-08. **B.** Fuentes numeradas: botones `[1]`, `[2]`… con nombre accesible "Fuente n: {documento}, página {p}" (`components/chat/numbered-sources.tsx`); sin números si no hay fuentes. **RF-004-2.**
  Hecho cuando: `ui/evidence-selection.test.tsx` comprueba los botones y su nombre accesible; una respuesta sin evidencia no muestra números.

## 5. Panel de evidencia (carril B)

- [ ] T004-09. **B.** `components/evidence/evidence-card.tsx`: número, documento, página, "Similitud: 0,87" (dos decimales, coma decimal) y fragmento; variante "Fuente no disponible (documento eliminado)". **RF-004-3.**
  Hecho cuando: los tests de interfaz verifican el formato de la similitud y la variante no disponible.
- [ ] T004-10. **B.** `components/evidence/pdf-viewer.tsx`: `<iframe>` con título "Documento {nombre}, página {n}" y `src` `/api/documents/{id}/file#page={n}`, más el enlace "Abrir el PDF en una pestaña nueva". **RF-004-4.**
  Hecho cuando: un test de interfaz comprueba el título, el `src` y el enlace.
- [ ] T004-11. **B.** `components/evidence/evidence-panel.tsx`: tarjetas de la respuesta seleccionada, tarjeta seleccionada marcada (`aria-current`), visor solo para fuentes disponibles y estado vacío "Aquí verás las fuentes de cada respuesta.". **RF-004-3, RF-004-4.**
  Hecho cuando: `ui/evidence-deleted-source.test.tsx` y el estado vacío pasan.

## 6. Composición en tres paneles (carril B)

- [ ] T004-12. **B.** `app/page.tsx`: tres regiones con nombre accesible (Biblioteca, Conversación y Evidencia) y el estado de selección (respuesta y fuente) elevado a la página; una respuesta nueva con fuentes selecciona la `[1]`; pulsar `[n]` selecciona su tarjeta. Mover el panel de documentos a `components/library/`. **RF-004-1, RF-004-2.**
  Hecho cuando: `ui/three-panel-layout.test.tsx` y `ui/evidence-selection.test.tsx` (pulsar `[2]` cambia la tarjeta y el `src` del iframe) pasan.
- [ ] T004-13. **B.** `app/globals.css` (nuevo, importado en `app/layout.tsx`): CSS Grid de tres columnas, apilado en vertical bajo 1024 px, foco visible. Sin librerías. **RF-004-1, RNF-004-1, RNF-004-3.**
  Hecho cuando: un test comprueba que la página importa el CSS y que las regiones llevan las clases del grid; la revisión manual a 1280 px y a 800 px no muestra desplazamiento horizontal.
- [ ] T004-14. **B.** Eliminar un documento en Biblioteca marca su tarjeta de Evidencia como no disponible y quita el visor. **RF-004-3.**
  Hecho cuando: `ui/home-page-wiring.test.tsx` ampliado lo verifica.

## 7. Cierre (integrador)

- [ ] T004-15. **I.** Relacionar cada RF-004 con sus tests (`verificacion.md` de la 004) y revisar a mano en la app real: subir un PDF, preguntar, pulsar `[n]` y ver la página correcta en el visor.
  Hecho cuando: todos los RF-004 tienen al menos un test y la revisión manual se documenta.
- [ ] T004-16. **I.** Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:integration`.
  Hecho cuando: todos terminan en verde sin dependencias nuevas en `package.json`.

## Dependencias y paralelismo

```
T004-01 (I) ──┬──▶ T004-02 (A) ──▶ T004-05 (B)
              │
              ├──▶ T004-03 (A) ──▶ T004-04 (B)
              │
              └──▶ T004-06 → T004-07 → T004-08 (B) ──▶ T004-09 → T004-10 → T004-11 ──▶ T004-12 → T004-13 → T004-14 ──▶ T004-15 → T004-16 (I)
```

- Tras T004-01, el carril A (T004-02 y T004-03) y el carril B (T004-06 a T004-11) pueden avanzar en paralelo.
- T004-04 espera a T004-03, y T004-05 espera a T004-02.
