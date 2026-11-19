# Especificación 012: Proveedores de IA configurables y distribución

Estado: **aprobada por el usuario el 2026-11-18** (plan "MeAI descargable por cualquiera").

## Contexto y objetivo

MeAI funciona (specs 001–004), pero solo para quien tenga una clave de Gemini, y se instala en modo desarrollo. El objetivo es que **cualquier persona pueda descargarlo y usarlo con su propia base de datos y su propio proveedor de IA**, y que el proyecto pueda mostrarse en un CV: licencia abierta, tests visibles en CI y una imagen lista para usar.

Se numera 012 para no cambiar las referencias de la spec 004 a las specs 005–011 del roadmap.

## Decisiones (2026-11-18)

1. **Proveedores:** Gemini y un adaptador **compatible con OpenAI**, que sirve para OpenAI, Ollama (local y gratis), LM Studio, OpenRouter, Groq y cualquier servicio que implemente `/embeddings` y `/chat/completions`. Embeddings y generación se eligen por separado.
2. **Dimensión de vector configurable:** cada versión de un documento guarda el modelo y la dimensión con que se indexó. Cambiar de modelo de embeddings obliga a reprocesar los documentos, y la app avisa.
3. **Configuración por `.env`,** con plantillas por proveedor. La app muestra el proveedor activo, su privacidad y si falta alguna variable. **Las claves nunca llegan al navegador.**
4. **Distribución:** `next build` en producción, imagen publicada en GitHub Container Registry por GitHub Actions y CI que corre los tests en cada push.
5. **README bilingüe** (inglés principal, español enlazado) y **licencia MIT**.

## Requisitos funcionales

### RF-012-1. Configuración de proveedores

Criterios de aceptación EARS:

- El sistema deberá leer por separado la configuración de embeddings y de generación:
  - `EMBEDDING_PROVIDER` y `GENERATION_PROVIDER`: `gemini` (predeterminado) u `openai-compatible`;
  - `EMBEDDING_MODEL` y `GENERATION_MODEL`;
  - `EMBEDDING_DIMENSIONS`;
  - `EMBEDDING_BASE_URL` y `GENERATION_BASE_URL`;
  - `EMBEDDING_API_KEY` y `GENERATION_API_KEY`.
- Si no se indica una clave específica, el sistema deberá usar `GEMINI_API_KEY` con `gemini` y `OPENAI_API_KEY` con `openai-compatible`. Si no se indica una URL, usará `OPENAI_BASE_URL` o la del proveedor.
- Valores predeterminados:
  - **Gemini:** `gemini-embedding-001` con 1536 dimensiones y `gemini-3.5-flash-lite`.
  - **Compatible OpenAI:** `text-embedding-3-small` (dimensión nativa del modelo) y `gpt-4o-mini`, en `https://api.openai.com/v1`.
- Si una variable tiene un valor inválido (proveedor desconocido, dimensión que no es un entero positivo, URL mal formada), el sistema deberá detenerse con un error que nombre la variable.
- Si falta una clave obligatoria, el sistema no deberá fallar al arrancar: lo indicará como variable faltante. La clave es obligatoria en Gemini y en servicios externos; es opcional en servicios locales.

### RF-012-2. Privacidad visible

Criterios de aceptación EARS:

- El sistema deberá clasificar cada proveedor según su privacidad:
  - `local`: la URL apunta a `localhost`, `127.0.0.1`, `host.docker.internal` u `ollama`;
  - `free` o `paid`: Gemini, según `GEMINI_TIER` (predeterminado `free`);
  - `external`: cualquier otro servicio.
- `GET /api/settings` deberá devolver el proveedor, el modelo, la dimensión, la privacidad, las variables que faltan y cuántos documentos se indexaron con otro modelo, **sin ninguna clave**.
- El pie de la Biblioteca deberá mostrar "{proveedor} · {modelo}" y un punto: verde (local o de pago), ámbar (gratuito o externo) o terracota (falta configuración), con un tooltip de privacidad en español.
- Si faltan variables, la interfaz deberá mostrar "Falta configurar {variables} en .env.".

### RF-012-3. Adaptador compatible con OpenAI

Criterios de aceptación EARS:

- **Embeddings:** el sistema deberá llamar a `POST {base}/embeddings` con `model` e `input` en lotes, enviar `dimensions` solo si se configuró, normalizar cada vector (L2) y comprobar que todos tienen la misma dimensión, y la configurada si existe.
- **Generación:** el sistema deberá llamar a `POST {base}/chat/completions` con `stream: true`, emitir el texto conforme llega (eventos SSE `choices[0].delta.content` hasta `[DONE]`) y aplicar las mismas reglas que Gemini: mismas instrucciones de evidencia, respuesta explícita sin evidencia y citas `[FUENTES: …]` validadas contra los fragmentos.
- La clave se enviará como `Authorization: Bearer {clave}` solo si existe. Ningún error mostrará la clave.

### RF-012-4. Embeddings de dimensión variable

Criterios de aceptación EARS:

- La base deberá aceptar vectores de cualquier dimensión en `chunks.embedding`, y cada versión de documento deberá guardar `embedding_model` y `embedding_dimensions`.
- La búsqueda deberá considerar solo las versiones indexadas con el modelo y la dimensión actuales; los documentos con otro modelo no deben romper la consulta.
- Si hay documentos disponibles indexados con otro modelo, el sistema deberá avisar: "{n} documentos se indexaron con otro modelo de embeddings. Reprocésalos para poder consultarlos.".
- Los documentos indexados antes de esta spec quedan registrados como `gemini-embedding-001` con 1536 dimensiones.

### RF-012-5. Base de datos propia

Criterios de aceptación EARS:

- Por defecto, Docker Compose deberá crear un PostgreSQL con pgvector local, con la contraseña de `.env` (spec 001).
- Si existe `DATABASE_URL`, el sistema deberá conectarse a esa base. Esto sirve a quien tenga su propio PostgreSQL 15+ con la extensión `vector`, y la app aplicará las migraciones al arrancar.

### RF-012-6. Distribución

Criterios de aceptación EARS:

- El proyecto deberá tener los scripts `build` (`next build`) y `start` (`next start`), y la imagen Docker deberá ejecutar la versión de producción con un usuario sin privilegios, incluyendo los idiomas de OCR para funcionar sin red.
- Al hacer push a `main` o una etiqueta `v*`, GitHub Actions deberá publicar la imagen `ghcr.io/asiel091307/meai` para `linux/amd64` y `linux/arm64`.
- En cada push y pull request, GitHub Actions deberá ejecutar lint, typecheck, los tests unitarios y los de integración.
- Bastará con `compose.yaml` y un `.env` para arrancar la imagen publicada. El perfil opcional `ollama` deberá levantar Ollama para usar IA 100 % local.
- El repositorio deberá incluir `LICENSE` (MIT), `README.md` en inglés y `README.es.md` en español, con el inicio rápido por proveedor, la privacidad y el aviso de que MeAI es de un solo usuario y sin autenticación, por lo que no debe exponerse a internet.

## Fuera de alcance

- Una pantalla para introducir claves desde la interfaz (se configura en `.env`).
- Proveedores con API propia no compatible con OpenAI, como Anthropic o Cohere, salvo a través de un servicio compatible.
- Usuarios, autenticación y despliegue público.
- Migrar automáticamente los vectores de un modelo a otro: se reprocesa.

## Tests

- **Unitarios:**
  - `ai-config`: valores predeterminados por proveedor, atajos de clave y URL, errores que nombran la variable, variables que faltan, privacidad, y que la vista pública no contenga claves.
  - Adaptadores compatibles con OpenAI, con `fetch` simulado: petición, lotes, dimensiones, streaming, citas, falta de evidencia y errores sin la clave.
  - Generador de Gemini tras extraer el prompt compartido (regresión).
  - Interfaz: pie dinámico y avisos.
- **Integración** (PostgreSQL real):
  - dimensiones mezcladas (768 y 1536) sin error;
  - búsqueda solo en el modelo actual;
  - conteo de documentos con otro modelo;
  - `DATABASE_URL`;
  - `/api/settings` sin claves.
- **Distribución:** `pnpm build` en verde y la imagen de producción probada de punta a punta con Gemini y, si se aprueba la descarga de modelos, con Ollama.
