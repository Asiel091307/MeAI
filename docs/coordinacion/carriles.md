# Trabajo en paralelo: carriles A y B

Dos agentes avanzan el MVP a la vez sin pisarse:

| Carril | Agente | Rama | Carpeta (worktree) | Foco |
| --- | --- | --- | --- | --- |
| A | Claude Code | `carril-a/ingestion-datos` | `../rag-carril-a` | Ingestión, persistencia, vectores y búsqueda SQL |
| B | Antigravity | `carril-b/consulta-ui` | `../rag-carril-b` | Decisión de IA, rutas HTTP, interfaz, respuestas y chat |

**Integrador:** la sesión de Claude Code en la carpeta principal `rag`, sobre la rama `main`. Solo el integrador hace merge a `main`.

Estas reglas complementan `AGENTS.md` y `docs/constitution.md`; no las sustituyen.

## 1. Dueños de archivos

Cada carril modifica solo lo suyo. Para cambiar un archivo del otro carril o uno compartido, se pide al integrador.

- **Carril A:** `src/rag/ingestion/`, `src/documents/`, `src/db/`, `db/migrations/`, `src/rag/retrieval/` (consultas SQL), `tests/helpers/pdf-fixtures.ts`, y sus tests.
- **Carril B:** `app/`, `components/`, `app/api/`, `src/rag/answering/`, los proveedores de generación en `src/rag/providers/`, `docs/specs/002-proveedores-ia/`, y sus tests.
- **Compartidos (solo el integrador):** `docs/specs/001-meai-mvp/tasks.md`, `docs/specs/001-meai-mvp/spec.md`, `AGENTS.md`, `docs/constitution.md`, este archivo, `package.json`, `pnpm-lock.yaml`, `src/db/contracts.ts`, `src/rag/retrieval/contracts.ts`.

## 2. Contratos primero

Los tipos que cruzan carriles los escribe el integrador en `main` antes de que un carril los use. Los carriles solo los importan.

- `src/db/contracts.ts`: persistencia de documentos, versiones y fragmentos.
- `src/rag/retrieval/contracts.ts` (antes de la fase 3): resultado de búsqueda `RetrievedChunk { chunkId, documentId, page, text, score }`.

## 3. Tareas, specs y dependencias

- **`tasks.md`:** solo el integrador marca `[x]`, al hacer merge. Cada carril avisa "T__ lista" con el resultado de sus tests.
- **Decisión de IA (T23, T23a, T24):** va en una spec nueva, `docs/specs/002-proveedores-ia/spec.md`, no en `001-meai-mvp/spec.md`. T24 se detiene hasta que el usuario apruebe.
- **Dependencias nuevas:** primero se justifican en una spec y el usuario las aprueba. Solo se añade una a la vez, a través del integrador, y el otro carril hace rebase después.
- **Migraciones:** solo el carril A crea archivos en `db/migrations/`. Así no se repiten números.

## 4. Tests

- Cada carril corre `pnpm lint`, `pnpm typecheck`, `pnpm test` y los tests de integración de su tarea.
- Los tests que usan Docker Compose o el puerto 3000 los corre **solo el integrador**, antes de cada merge: `app`, `compose-app`, `database`, `migrations` y `*-migration`. Dos carpetas a la vez chocan en ese puerto.

## 5. Listo para merge

Una tarea solo pasa a `main` si cumple todo esto:

- No hay `test.only`, `describe.only` ni tests omitidos sin motivo.
- No hay archivos de depuración (`scratch`) ni archivos nuevos en la raíz del repo.
- No hay secretos; `.env` sigue fuera de git.
- `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan, igual que los tests de la tarea.
- Solo se tocaron archivos del propio carril.

## 6. Sincronía

1. Tras cada merge a `main`, el otro carril ejecuta `git rebase main` antes de seguir.
2. Cada carpeta necesita su propio `.env` (copiado de la carpeta principal) y ejecutar `pnpm install --frozen-lockfile`.
3. La primera prueba de OCR en una carpeta nueva descarga los idiomas en `.cache/tesseract`.

## 7. Reparto por fases

| Fase | Carril A — Claude | Carril B — Antigravity |
| --- | --- | --- |
| 1 (ahora, sin decisión de IA) | T20 → T21 → T22 → T29 → T54 → T54a | T23 + T23a → T24 (se detiene hasta que el usuario apruebe) · T38 · T39 · T34 |
| Bloqueo de B | — | La interfaz (T35, T35a, T36, T47…) necesita una librería de tests de interfaz: proponerla en spec y esperar aprobación. |
| 2 (después de T24) | T25 · T26 · T27 · T28 · T30 · T31 · T32 | T33 · T35 · T35a · T36 · T37 · T43 · T44 |
| 3 | T40 · T41 · T42 · T55 · T59 · T60 · T61 · T62 | T45 · T46 · T47–T53a · T56 · T57 · T58 · T63 · T63a · T64 |
| 4 (integrador) | T65 · T65a · T66 · T66a | — |

**Sincronías obligatorias del integrador:**
- Antes de la fase 2: spec 002 aprobada y publicada en `main`.
- Antes de la fase 3: `src/rag/retrieval/contracts.ts` publicado en `main`.
