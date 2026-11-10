# Especificación 002: Proveedores y modelos de IA para embeddings y generación (T23, T23a, T24)

## Contexto y alcance

Esta especificación documenta la evaluación comparativa entre **OpenAI** y **Google Gemini** para las dos tareas de inteligencia artificial del MVP de MeAI, manteniendo ambas responsabilidades estrictamente separadas conforme a [`AGENTS.md`](../../../AGENTS.md) y [`docs/constitution.md`](../../constitution.md):

1. **Embeddings (`EmbeddingProvider`, RF-1, RF-3):** transformar fragmentos de documentos PDF y preguntas del usuario en vectores numéricos para almacenarlos y consultarlos por similitud semántica en PostgreSQL con `pgvector`.
2. **Generación (`AnswerGenerator`, RF-4, RF-6):** redactar respuestas en español en modo streaming utilizando **únicamente** los fragmentos recuperados como evidencia y citando sus identificadores (`chunkId`).

- **Fecha de consulta de documentación oficial:** `2026-11-08`
- **Estado de la decisión (T24):** **Aprobada por el usuario el `2026-11-09`.**

---

## 1. Comparación de proveedores para Embeddings (T23 — RF-1, RF-3)

**Fecha de comparación:** `2026-11-08`

| Criterio | OpenAI (`text-embedding-3-small`) | OpenAI (`text-embedding-3-large`) | Google Gemini (`gemini-embedding-001`) | Google Gemini (`gemini-embedding-2`) |
| --- | --- | --- | --- | --- |
| **Nivel gratuito (Free Tier)** | **No dispone** de nivel gratuito permanente; requiere cuenta con saldo prepago (Tier 1 tras \$5 USD de recarga mínima). | **No dispone** de nivel gratuito permanente; requiere saldo prepago (Tier 1+). | **Sí (Google AI Studio Free Tier):** sin coste (`Free of charge`) y sin tarjeta de crédito para desarrollo/prototipado. | **Sí (Google AI Studio Free Tier):** sin coste (`Free of charge`) para entrada de texto en nivel estándar. |
| **Precio (Paid Tier, estándar)** | **\$0.02 USD** / 1M tokens de entrada (\$0.01 / 1M en Batch API). | **\$0.13 USD** / 1M tokens de entrada (\$0.065 / 1M en Batch API). | **\$0.15 USD** / 1M tokens de entrada (\$0.075 / 1M en Batch API). | **\$0.20 USD** / 1M tokens de texto (\$0.10 / 1M en Batch API). |
| **Límites de entrada y tasa** | Máx. **8,192 tokens** por entrada. Tier 1: ~500–3,000 RPM y 1,000,000 TPM (escala automáticamente de Tier 1 a Tier 5 según gasto acumulado). | Máx. **8,192 tokens** por entrada. Tier 1: ~500–3,000 RPM y 1,000,000 TPM. | Máx. **2,048 tokens** por entrada. Cuotas dinámicas por proyecto en AI Studio (RPM/TPM/RPD más restrictivos en Free Tier; ampliados al vincular facturación en Paid Tier). | Máx. **8,192 tokens** por entrada (multimodal). Cuotas por nivel de uso en Google AI Studio. |
| **Privacidad y uso de datos** | **Privado por defecto en la API:** OpenAI **no** utiliza los datos enviados por API para entrenar modelos (salvo opt-in explícito). Retención máxima de 30 días para monitoreo de abuso. | **Privado por defecto en la API:** no se usa para entrenar modelos. Retención de seguridad de hasta 30 días. | **Depende del nivel:** en **Free Tier**, Google **sí** puede usar entradas/salidas y revisores humanos para mejorar productos. En **Paid Tier**, Google **no** utiliza los datos para entrenar modelos. | **Depende del nivel:** en **Free Tier**, se usa para mejorar productos; en **Paid Tier**, **no** se usa para entrenar modelos. |
| **Dimensiones del vector** | **1,536** por defecto (configurable mediante Matryoshka representation, p. ej. 512 o 1,536, ya normalizado). | **3,072** por defecto (configurable de 256 a 3,072; `pgvector` indexa con HNSW/IVFFlat vectores `vector(d)` de hasta 2,000 dimensiones en precisión simple). | Flexible de **128 a 3,072** (`outputDimensionality`; recomendadas: **768**, **1,536** o **3,072**). Dimensiones `< 3072` requieren normalización L2 manual. Soporta `taskType` (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`). | Flexible de **128 a 3,072** (recomendadas: **768**, **1,536** o **3,072**). Normaliza automáticamente dimensiones truncadas `< 3072`. |
| **Calidad esperada (ES / EN)** | Alta calidad multilingüe (MIRACL y MTEB sólidos en español e inglés), latencia baja y excelente relación calidad/precio para fragmentos de texto de hasta 8k tokens. | Muy alta precisión semántica multilingüe; mayor coste de almacenamiento y cómputo si se usan 3,072 dimensiones. | Muy alta calidad en recuperación asimétrica multilingüe gracias a `taskType` específico para documentos y preguntas; el límite de 2,048 tokens sobra para los fragmentos del MVP. | Excelente calidad multilingüe y ventana de 8,192 tokens; orientado también a entradas multimodales que MeAI ya resuelve localmente con extracción + OCR. |

### Enlaces oficiales verificados (Embeddings — `2026-11-08`)

- **OpenAI — Guía y modelos de Embeddings:** https://platform.openai.com/docs/guides/embeddings y https://platform.openai.com/docs/models#embeddings
- **OpenAI — Precios oficiales de API:** https://platform.openai.com/docs/pricing
- **OpenAI — Límites de tasa (Rate Limits / Usage Tiers):** https://platform.openai.com/docs/guides/rate-limits
- **OpenAI — Privacidad de datos empresariales y de API:** https://openai.com/enterprise-privacy/ y https://platform.openai.com/docs/models#how-we-use-your-data
- **Google Gemini — Guía de Embeddings y versiones (`gemini-embedding-001` / `gemini-embedding-2`):** https://ai.google.dev/gemini-api/docs/embeddings y https://ai.google.dev/gemini-api/docs/models#gemini-embedding
- **Google Gemini — Precios oficiales (Free Tier vs. Paid Tier):** https://ai.google.dev/gemini-api/docs/pricing
- **Google Gemini — Límites de tasa (Rate Limits):** https://ai.google.dev/gemini-api/docs/rate-limits
- **Google Gemini — Términos de servicio y privacidad de datos:** https://ai.google.dev/gemini-api/terms

---

## 2. Comparación de proveedores para Generación (T23a — RF-4, RF-6)

**Fecha de comparación:** `2026-11-08`

| Criterio | OpenAI (`gpt-4o-mini`) | OpenAI (`gpt-4.1-mini`) | Google Gemini (`gemini-2.5-flash` / `gemini-3.5-flash-lite`) | Google Gemini (`gemini-3.8-flash`) |
| --- | --- | --- | --- | --- |
| **Nivel gratuito (Free Tier)** | **No dispone** de nivel gratuito permanente; requiere saldo prepago (Tier 1+). | **No dispone** de nivel gratuito permanente; requiere saldo prepago (Tier 1+). | **Sí (Google AI Studio Free Tier):** entrada y salida sin coste (`Free of charge`) con cuotas por minuto/día. *(Nota oficial: en proyectos nuevos Google recomienda `gemini-3.5-flash-lite` o `gemini-3.8-flash` frente a la familia 2.5).* | **Sí (Google AI Studio Free Tier):** entrada y salida sin coste (`Free of charge`) en modo estándar. |
| **Precio (Paid Tier, estándar por 1M tokens)** | Entrada: **\$0.15 USD** (caché: \$0.075). Salida: **\$0.60 USD**. | Entrada: **\$0.40 USD** (caché: \$0.10). Salida: **\$1.60 USD**. | Entrada: **\$0.30 USD** (texto). Salida: **\$2.50 USD** (incluye tokens de razonamiento). *(Variante `gemini-2.5-flash-lite`: \$0.10 entrada / \$0.40 salida).* | Entrada: **\$0.75 USD** hasta 2026-12-31 (\$1.50 desde 2027-01-01). Salida: **\$3.75 USD** hasta 2026-12-31 (\$7.50 desde 2027-01-01). |
| **Límites de contexto y tasa** | Ventana de **128,000 tokens**, salida máx. **16,384 tokens**. Tier 1: ~500 RPM / 200,000+ TPM. Soporta streaming SSE nativo. | Ventana de **1,047,576 tokens** (~1M), salida máx. **32,768 tokens**. Tier 1: ~500 RPM / 200,000+ TPM. Soporta streaming SSE nativo. | Ventana de **1,048,576 tokens** (1M), salida máx. **65,536 tokens**. Límites dinámicos en AI Studio por proyecto (Free Tier con tope diario RPD; Paid Tier con RPM/TPM ampliados). Soporta streaming nativo. | Ventana de **1,048,576 tokens** (1M), salida máx. **65,536 tokens**. Límites dinámicos por nivel en AI Studio. Soporta streaming nativo. |
| **Privacidad y uso de datos** | **Privado por defecto en la API:** no se usa para entrenar modelos de OpenAI. Retención máxima de 30 días para seguridad. | **Privado por defecto en la API:** no se usa para entrenar modelos de OpenAI. Retención máxima de 30 días para seguridad. | **Depende del nivel:** en **Free Tier**, los prompts y respuestas **sí** se usan para mejorar productos de Google (incompatible con RNF-7 si se suben PDF personales sensibles sin facturación). En **Paid Tier**, **no** se usan para entrenar modelos. | **Depende del nivel:** en **Free Tier**, **sí** se usa para mejorar productos; en **Paid Tier**, **no** se usa para entrenar modelos. |
| **Calidad esperada para RAG fundamentado y citas (RF-4, RF-6)** | Excelente seguimiento de instrucciones negativas («responde solo con el contexto»), baja latencia de primer token en streaming y formato fiable de citas por `chunkId` en español. | Mayor fidelidad en seguimiento de instrucciones estrictas y menor tasa de alucinación al combinar múltiples documentos (RF-4), con latencia muy baja en streaming. | Muy buena adherencia al contexto recuperado, velocidad alta en streaming y excelente redacción en español; permite ajustar el razonamiento para priorizar baja latencia en chat. | Máxima capacidad de razonamiento y fidelidad a restricciones complejas entre los modelos Flash actuales, aunque con mayor coste por token en Paid Tier. |

### Enlaces oficiales verificados (Generación — `2026-11-08`)

- **OpenAI — Modelos (`gpt-4o-mini`, `gpt-4.1-mini`) y capacidades:** https://platform.openai.com/docs/models
- **OpenAI — Precios oficiales:** https://platform.openai.com/docs/pricing
- **OpenAI — Streaming de respuestas:** https://platform.openai.com/docs/guides/streaming-responses
- **OpenAI — Límites de tasa (Rate Limits):** https://platform.openai.com/docs/guides/rate-limits
- **OpenAI — Privacidad de datos en la API:** https://openai.com/enterprise-privacy/
- **Google Gemini — Modelos disponibles (`gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`):** https://ai.google.dev/gemini-api/docs/models
- **Google Gemini — Generación de texto y streaming:** https://ai.google.dev/gemini-api/docs/text-generation
- **Google Gemini — Precios oficiales:** https://ai.google.dev/gemini-api/docs/pricing
- **Google Gemini — Límites de tasa (Rate Limits):** https://ai.google.dev/gemini-api/docs/rate-limits
- **Google Gemini — Términos de servicio y privacidad:** https://ai.google.dev/gemini-api/terms

---

## 3. Síntesis y opciones para decisión del usuario (T24)

Conforme a [`AGENTS.md`](../../../AGENTS.md), las tareas de **embeddings** (`src/rag/providers/embeddings.ts`) y **generación** (`src/rag/providers/generation.ts`) están desacopladas mediante interfaces independientes, por lo que pueden asignarse al mismo proveedor o a proveedores distintos:

1. **Opción A — Todo Google Gemini (ideal si se prioriza nivel gratuito para aprender y experimentar sin coste):**
   - **Embeddings:** `gemini-embedding-001` (o `gemini-embedding-2`) con dimensión **768** o **1536**.
   - **Generación:** `gemini-3.5-flash-lite` (o `gemini-2.5-flash` / `gemini-3.8-flash`).
   - *Ventaja:* permite ejecutar todo el MVP gratis con una sola `GEMINI_API_KEY` en Google AI Studio.
   - *Advertencia de privacidad (RNF-7):* en el nivel gratuito de Google AI Studio, Google puede utilizar el contenido enviado para mejorar sus productos; si se van a cargar PDF personales confidenciales, debe usarse un proyecto con facturación habilitada (Paid Tier) o elegir OpenAI.
2. **Opción B — Todo OpenAI (ideal si se prioriza privacidad por defecto en API y mínimo coste de embeddings en pago por uso):**
   - **Embeddings:** `text-embedding-3-small` con dimensión **1536** (\$0.02 / 1M tokens).
   - **Generación:** `gpt-4o-mini` (\$0.15 / \$0.60 por 1M tokens) o `gpt-4.1-mini` (\$0.40 / \$1.60 por 1M tokens).
   - *Ventaja:* privacidad garantizada por defecto en la API (no entrena con datos del usuario), coste por millón de tokens de embeddings 7.5× menor que en el nivel de pago de Gemini y excelente velocidad en streaming con una sola `OPENAI_API_KEY`.
   - *Desventaja:* no tiene nivel gratuito permanente (requiere cuenta con saldo prepago).
3. **Opción C — Híbrida (un proveedor para embeddings y otro para generación):**
   - Gracias a la separación entre `EmbeddingProvider` y `AnswerGenerator`, se puede combinar cualquiera de las opciones anteriores (por ejemplo, embeddings con OpenAI `text-embedding-3-small` y generación con Gemini, o viceversa).

---

## 4. Comportamiento verificable y configuración por entorno

Una vez aprobada la elección por el usuario:

- La configuración de proveedores, modelos y credenciales se leerá exclusivamente de variables de entorno (`.env` / `compose.yaml`), sin almacenar claves ni secretos en el repositorio:
  - `EMBEDDING_PROVIDER` (`openai` | `gemini`)
  - `EMBEDDING_MODEL` (p. ej., `text-embedding-3-small` o `gemini-embedding-001`)
  - `EMBEDDING_DIMENSIONS` (p. ej., `1536` o `768`, acorde con la migración de `pgvector` en T26)
  - `GENERATION_PROVIDER` (`openai` | `gemini`)
  - `GENERATION_MODEL` (p. ej., `gpt-4o-mini`, `gpt-4.1-mini`, `gemini-3.5-flash-lite` o `gemini-3.8-flash`)
  - `OPENAI_API_KEY` y/o `GEMINI_API_KEY` según los proveedores elegidos.
- Para evitar dependencias innecesarias (principio 1 de [`docs/constitution.md`](../../constitution.md)), los adaptadores podrán invocar los endpoints HTTP REST oficiales mediante `fetch` nativo de Node 20 o mediante el SDK oficial si el usuario lo aprueba expresamente en esta spec.

### Criterios de aceptación EARS

- **CA-1 (T23):** Cuando se consulte esta especificación, el documento deberá incluir una tabla comparativa fechada con enlaces oficiales vigentes de OpenAI y Google Gemini para embeddings que cubra nivel gratuito, precio, límites, privacidad, dimensiones y calidad esperada.
- **CA-2 (T23a):** Cuando se consulte esta especificación, el documento deberá incluir una tabla comparativa fechada con enlaces oficiales vigentes de OpenAI y Google Gemini para generación que cubra nivel gratuito, precio, límites, privacidad y calidad esperada.
- **CA-3 (T24):** Mientras el usuario no apruebe explícitamente la elección de proveedor y modelo para embeddings y para generación, el sistema no deberá implementar ningún adaptador concreto ni fijar la dimensión vectorial en las migraciones.
- **CA-4 (T24):** Cuando el usuario apruebe la elección, esta especificación deberá registrar por separado el proveedor, modelo y dimensión de embeddings y el proveedor y modelo de generación antes de pasar a T26, T27 y T44.

---

## 5. Registro de decisión (T24)

- **Proveedor y modelo de embeddings:** Google Gemini — `gemini-embedding-001` (`EMBEDDING_PROVIDER=gemini`, `EMBEDDING_MODEL=gemini-embedding-001`).
- **Dimensión vectorial (`pgvector`):** `1536` dimensiones (`EMBEDDING_DIMENSIONS=1536`), aplicando normalización L2 sobre el vector devuelto cuando `outputDimensionality < 3072` y utilizando `taskType` (`RETRIEVAL_DOCUMENT` al indexar fragmentos y `RETRIEVAL_QUERY` al consultar preguntas).
- **Proveedor y modelo de generación:** Google Gemini — `gemini-3.5-flash-lite` (`GENERATION_PROVIDER=gemini`, `GENERATION_MODEL=gemini-3.5-flash-lite`). Elegido por el usuario por ser gratuito en el Free Tier y el más rápido de las opciones comparadas. El modelo sigue siendo configurable por entorno, pero cualquier cambio requiere actualizar esta spec.
- **Cliente de integración:** `fetch` nativo de Node 20 contra la API REST oficial de Google Gemini (`https://generativelanguage.googleapis.com/v1beta/models/...`), sin añadir nuevas dependencias a `package.json`.
- **Modalidad de coste y privacidad:** Nivel gratuito (Free Tier) de Google AI Studio (\$0.00 USD), aceptado por el usuario. **Riesgo aceptado (RNF-7):** en el Free Tier, Google puede usar el contenido enviado (fragmentos de los PDF y preguntas) para mejorar sus productos, con posible revisión humana. Por eso este MVP debe usarse con PDF no sensibles. Para documentos personales confidenciales, activar la facturación (Paid Tier) con la misma `GEMINI_API_KEY`; en ese nivel Google no usa los datos para entrenar modelos.
- **Estado:** **Aprobada por el usuario el `2026-11-09`.**

