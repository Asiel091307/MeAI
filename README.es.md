# MeAI

[![CI](https://github.com/Asiel091307/MeAI/actions/workflows/ci.yml/badge.svg)](https://github.com/Asiel091307/MeAI/actions/workflows/ci.yml)
[![Imagen](https://github.com/Asiel091307/MeAI/actions/workflows/release.yml/badge.svg)](https://github.com/Asiel091307/MeAI/pkgs/container/meai)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)

**Pregunta a tus propios PDF y recibe respuestas basadas solo en ellos, con la página de donde salen.**

MeAI es una aplicación **RAG** (*Retrieval-Augmented Generation*) pequeña y legible, hecha para aprender cómo funciona un RAG de principio a fin. Subes tus PDF, MeAI los indexa en PostgreSQL con pgvector, y cada respuesta se escribe solo a partir de los fragmentos recuperados. La respuesta aparece poco a poco y trae citas que puedes abrir. Si tus documentos no contienen la respuesta, lo dice en lugar de inventarla.

Usa tu propia base de datos y tu propio proveedor de IA: **Gemini**, **OpenAI**, **Ollama 100 % local** o cualquier servicio compatible con OpenAI (OpenRouter, Groq, LM Studio…).

[Read in English](README.md)

![MeAI: biblioteca, conversación con citas y panel de evidencia](docs/images/meai-workspace.png)

## Qué hace

- Lee PDF con texto y PDF escaneados (OCR sin conexión, en español e inglés).
- Divide el texto en fragmentos de tamaño y solapamiento configurables, guarda un embedding por fragmento y busca por similitud coseno en pgvector.
- Responde en *streaming* con citas por página, un panel de evidencia con los fragmentos exactos y su similitud, y un visor de PDF integrado.
- Si los documentos no respaldan una respuesta, dice explícitamente que no hay evidencia suficiente.
- Permite reprocesar o eliminar documentos. Al eliminar uno se borran juntos el PDF, sus fragmentos y sus embeddings.
- Los embeddings y la generación pueden usar proveedores distintos. La app muestra el proveedor activo y su nivel de privacidad.

## Inicio rápido (imagen publicada)

Solo necesitas [Docker](https://docs.docker.com/get-docker/). No hace falta Node.js ni clonar el repositorio.

```bash
mkdir meai && cd meai
curl -fsSLo compose.yaml https://raw.githubusercontent.com/Asiel091307/MeAI/main/deploy/compose.yaml
curl -fsSLo .env https://raw.githubusercontent.com/Asiel091307/MeAI/main/.env.example
```

En Windows (PowerShell), usa `curl.exe` en lugar de `curl`.

Edita `.env`: pon una `POSTGRES_PASSWORD` y elige **un** proveedor (el archivo trae plantillas listas para descomentar). Después:

```bash
docker compose up -d
```

Abre <http://127.0.0.1:3000>. Las tablas se crean solas en el primer arranque. Para probarlo enseguida, sube el PDF ficticio [`docs/demo/huerto-comunitario.pdf`](docs/demo/huerto-comunitario.pdf) y pregunta, por ejemplo, *¿Cada cuánto debo regar los tomates?*

- **Apagar:** `docker compose down`. Tus documentos se conservan en el volumen `postgres_data`; `down -v` los **borra**.
- **Actualizar a la última versión:** `docker compose pull`, luego `docker compose up -d`.

### Elige tu proveedor de IA

| Opción | Qué poner en `.env` | Privacidad |
| --- | --- | --- |
| **Gemini** (predeterminado) | `GEMINI_API_KEY`, gratis en [Google AI Studio](https://aistudio.google.com/apikey) | En el nivel gratuito, Google puede usar el texto enviado (fragmentos y preguntas) para mejorar sus productos. Con facturación activa (`GEMINI_TIER=paid`), no lo usa. |
| **OpenAI** | `EMBEDDING_PROVIDER=openai-compatible`, `GENERATION_PROVIDER=openai-compatible` y `OPENAI_API_KEY` | El texto se envía a OpenAI según sus condiciones. |
| **Ollama, 100 % local** | Opción 3 de `.env.example`, luego `docker compose --profile ollama up -d` y descargar los dos modelos | Nada sale de tu equipo. Los modelos pequeños necesitan unos 4 GB de RAM. |
| **Otro compatible con OpenAI** | `GENERATION_BASE_URL`, `GENERATION_API_KEY` y `GENERATION_MODEL` (y lo mismo para embeddings) | Depende del servicio. |

Embeddings y generación se configuran por separado (`EMBEDDING_*` y `GENERATION_*`). Por ejemplo, puedes calcular los embeddings en local con Ollama y responder con Gemini.

El pie de la Biblioteca muestra el proveedor y un punto de color:

- **Verde:** proveedor local o de pago.
- **Ámbar:** nivel gratuito o servicio externo.
- **Terracota:** falta una clave.

Si cambias el modelo de embeddings o sus dimensiones, los vectores anteriores dejan de ser comparables. MeAI solo busca en los documentos indexados con el modelo actual y te avisa de cuántos hay que **reprocesar**.

### Tu propio PostgreSQL

Define `DATABASE_URL=postgresql://usuario:contraseña@host:5432/basedatos` para usar tu PostgreSQL 15+ con la extensión `vector`. MeAI aplica sus migraciones al arrancar.

> **Un solo usuario y sin autenticación.** MeAI no tiene inicio de sesión. Mantenlo en `127.0.0.1` (los archivos de Compose ya lo hacen) y no lo expongas a internet.

## Desde el código fuente

```bash
git clone https://github.com/Asiel091307/MeAI.git && cd MeAI
cp .env.example .env   # pon POSTGRES_PASSWORD y tu proveedor
docker compose up -d --build
```

Para desarrollar necesitas Node.js 20 o superior y pnpm 10.17.1 (actívalo con `corepack enable`):

| Comando | Qué hace |
| --- | --- |
| `pnpm install` | Instala las dependencias |
| `pnpm dev` | Next.js en modo desarrollo (necesita el servicio `db`) |
| `pnpm lint`, `pnpm typecheck` | Comprobaciones estáticas |
| `pnpm test` | Tests unitarios: la lógica RAG con proveedores simulados y la interfaz con happy-dom |
| `pnpm test:integration` | PostgreSQL con pgvector real en Docker y OCR real. Si existe `GEMINI_API_KEY`, también hace una llamada real a Gemini. Necesita el puerto 3000 libre |
| `pnpm build`, `pnpm start` | Compila y sirve la versión de producción |

## Cómo funciona

```
PDF ──► texto por página (pdf.js, o OCR con Tesseract) ──► fragmentos (tamaño / solapamiento)
    ──► embeddings ──► PostgreSQL + pgvector

Pregunta ──► embedding ──► top-K fragmentos más cercanos (coseno) ──► prompt con evidencia
         ──► respuesta en streaming + citas [FUENTES: …] validadas ──► interfaz
```

| Carpeta | Contenido |
| --- | --- |
| `app/`, `components/` | Interfaz de Next.js y rutas HTTP finas (`app/api/`) |
| `src/rag/` | Ingestión (PDF, OCR, fragmentos), búsqueda, respuestas y proveedores de IA |
| `src/documents/` | Casos de uso: registrar, procesar, reprocesar y eliminar |
| `src/db/`, `db/migrations/` | SQL directo y migraciones versionadas |
| `docs/` | Constitución, specs y tareas |

La lógica RAG nunca importa React ni objetos HTTP. Cada proveedor es un adaptador de `fetch` detrás de una interfaz pequeña (`EmbeddingProvider`, `AnswerGenerator`). Cada funcionalidad empezó como una spec en [`docs/specs/`](docs/specs/), con criterios de aceptación y los tests escritos antes que el código.

### Parámetros ajustables

| Variable | Valor por defecto | Qué controla |
| --- | --- | --- |
| `CHUNK_SIZE` | `1000` | Caracteres por fragmento |
| `CHUNK_OVERLAP` | `200` | Caracteres compartidos entre fragmentos seguidos |
| `RETRIEVAL_TOP_K` | `5` | Fragmentos usados como evidencia en cada respuesta |

Si cambias el tamaño de fragmento, reprocesa los documentos.

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| "No se pudo conectar con MeAI…" | La app no está en marcha o todavía arranca. Abre Docker, ejecuta `docker compose up -d`, espera unos segundos y recarga. Los contenedores vuelven solos cuando Docker arranca (`restart: unless-stopped`). |
| El pie dice "Falta configurar … en .env." | Falta la clave del proveedor elegido. Añádela a `.env` y ejecuta `docker compose up -d`. |
| Error 500 y los logs (`docker compose logs app`) dicen `password authentication failed` | El volumen se creó con otra contraseña, porque `POSTGRES_PASSWORD` solo se aplica la primera vez. Recupera la contraseña original o borra el volumen con `docker compose down -v` si no tienes datos que conservar. |
| Los documentos quedan "Fallido" con un error de embeddings | La clave es inválida, se agotó la cuota o el modelo no existe en ese servicio. Revisa `.env` (sin espacios alrededor del `=`). |
| "N documentos se indexaron con otro modelo de embeddings" | Cambiaste el modelo o la dimensión de embeddings. Reprocesa esos documentos. |
| El puerto 3000 está ocupado | Otro programa lo usa. Ciérralo o cambia el puerto en `compose.yaml`. |
| Un PDF escaneado queda "Fallido" con "No se pudo leer texto en la página N" | El OCR no reconoció texto en esa página: manuscrito, imagen borrosa o página en blanco. |

## Licencia

[MIT](LICENSE)
