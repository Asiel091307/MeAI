# Plan técnico 001: MVP de MeAI

## Base y límites

Este plan desarrolla `spec.md` y se subordina a `docs/constitution.md` y `AGENTS.md`. El producto es una aplicación web de consulta de PDF personales. Se implementará en TypeScript con Next.js modular, pnpm, PostgreSQL y pgvector; Docker Compose ejecutará la aplicación y la base de datos. La interfaz y los mensajes al usuario estarán en español; identificadores y código, en inglés. Cada dependencia adicional y cada cambio de comportamiento se justificará primero en la spec. **Cobertura: RF-1 a RF-9.**

## Estructura de módulos y dependencias

| Módulo propuesto | Responsabilidad | RF |
| --- | --- | --- |
| `app/` y `components/` | Pantallas de documentos y chat; confirmar eliminación, representar estados, citas y respuesta progresiva; mantener el historial solo en la pestaña actual. | RF-1, RF-2, RF-5, RF-6, RF-7, RF-8, RF-9 |
| `app/api/` | Validar entradas, adaptar solicitudes y emitir respuestas o eventos; no contener lógica RAG ni consultas SQL. | RF-1 a RF-9 |
| `src/rag/ingestion/` | Validar PDF, extraer texto por página, reconocer páginas escaneadas, fragmentar y preparar una versión completa antes de publicarla. | RF-1, RF-2, RF-9 |
| `src/rag/retrieval/` | Obtener la representación semántica de la pregunta, recuperar fragmentos de documentos disponibles y conservar referencias de origen. | RF-3, RF-4, RF-5 |
| `src/rag/answering/` | Construir respuestas fundamentadas, asociar afirmaciones con fuentes verificables, gestionar falta de evidencia y transmitir la respuesta. | RF-4, RF-5, RF-6 |
| `src/rag/providers/` | Contratos separados para embeddings, reconocimiento cuando aplique y generación; las implementaciones concretas requieren decisión aprobada. | RF-1, RF-3, RF-4, RF-6 |
| `src/documents/` | Casos de uso de registro, listado, estados, eliminación, reintento y reprocesamiento; coordinar operaciones en curso. | RF-1, RF-2, RF-7, RF-8, RF-9 |
| `src/db/` y `db/migrations/` | Consultas SQL y migraciones versionadas para PDF, metadatos, versiones, fragmentos y vectores; transacciones de publicación y borrado. | RF-1, RF-2, RF-3, RF-7, RF-8, RF-9 |

Las dependencias apuntan desde interfaz y rutas hacia casos de uso, y desde estos hacia contratos de persistencia y proveedores. Ingestión, recuperación y generación no importan React ni objetos HTTP. No habrá una segunda base de datos, ORM, almacenamiento definitivo en archivos ni servicio de colas para el MVP. **Cobertura: RF-1 a RF-9.**

## Modelo de datos y persistencia

Migraciones SQL explícitas: `documents` guarda identidad, nombre, PDF binario, estado (`processing`, `available`, `failed`), error legible y referencia a la versión activa; `document_versions` representa intentos de procesamiento y permite conservar la versión previa durante un reprocesamiento; `chunks` guarda texto, documento, versión, página y posición, más el vector de pgvector. Identificadores únicos distinguen PDF con nombre o contenido idéntico. La dimensión del vector se fijará en una migración **después** de aprobar el modelo de embeddings; todos los fragmentos y preguntas consultables usarán dimensiones compatibles. No se persistirán conversaciones: solo vivirán en la pestaña. **Cobertura: RF-1, RF-2, RF-3, RF-5, RF-7, RF-8, RF-9.**

Ejemplo JSON **ilustrativo de un documento ya procesado**, no un formato de almacenamiento ni un vector de dimensión definitiva:

```json
{
  "document": {
    "id": "doc-01",
    "name": "notas.pdf",
    "status": "available",
    "error": null,
    "activeVersionId": "ver-01",
    "pageCount": 2,
    "pdfBytes": "contenido binario almacenado en PostgreSQL; omitido del ejemplo"
  },
  "version": { "id": "ver-01", "documentId": "doc-01", "status": "complete" },
  "chunks": [
    {
      "id": "chunk-01",
      "documentId": "doc-01",
      "versionId": "ver-01",
      "page": 1,
      "position": 1,
      "text": "La solicitud se presenta en septiembre.",
      "embedding": [0.12, -0.03, 0.41]
    }
  ]
}
```

El PDF se guarda como binario en PostgreSQL, no como la cadena del ejemplo. Cada fragmento conserva su página aunque se procesen páginas escaneadas y páginas con texto extraíble en el mismo PDF. La eliminación retira el PDF y todas sus versiones, fragmentos, vectores y metadatos asociados en una operación atómica. **Cobertura: RF-1, RF-2, RF-4, RF-8.**

## Flujos y algoritmo (pseudocódigo conceptual)

### Incorporar o reprocesar un PDF — RF-1, RF-2, RF-8, RF-9

1. Comprobar que el archivo es PDF y no supera 10 MB; rechazar sin registrarlo en caso contrario.
2. Intentar contar páginas: si supera 100, rechazar sin conservarlo; si no se puede contar por daño o protección, registrar el documento como fallido y explicar el motivo.
3. Si es nuevo, asignar un identificador independiente incluso si nombre o contenido coinciden con otro PDF. Si es un reintento o reprocesamiento, conservar el PDF y, si la hay, la versión activa anterior.
4. Marcar el documento como `processing` y excluirlo de nuevas consultas. Para cada página, extraer texto o reconocer texto impreso escaneado en español/inglés; si alguna queda sin texto legible, fallar el intento completo sin publicar fragmentos parciales.
5. Si todas las páginas tienen texto, fragmentar conservando página y posición; generar representaciones semánticas y preparar una nueva versión íntegra.
6. Antes de publicar, comprobar que el documento no se eliminó. En una transacción, publicar la nueva versión como única activa y marcar el documento `available`.
7. Si el intento falla: descartar la versión incompleta; en un reprocesamiento de documento antes disponible, restaurar su versión anterior y avisar del fallo; en otro caso marcar `failed` y permitir reintentar o eliminar. Si el proceso se interrumpe, al reiniciar se trata como fallo: se restaura la versión anterior si existía o se marca el documento `failed`, sin publicar datos parciales.

### Preguntar y responder — RF-3, RF-4, RF-5, RF-6

1. Rechazar texto vacío, de solo espacios o de más de 1000 caracteres; rechazar una segunda pregunta mientras hay otra en búsqueda o generación; si no hay documentos disponibles, pedir que se procese uno.
2. Interpretar referencias de seguimiento con el historial de la pestaña, sin tratar respuestas anteriores como evidencia; ignorar contenido asociado con documentos eliminados. Obtener la representación semántica de la pregunta contextualizada.
3. Recuperar por similitud fragmentos únicamente de versiones activas de documentos `available`; cada resultado conserva documento, página e identificador de fragmento. Si la búsqueda falla, informar y permitir reintentar sin generar respuesta.
4. Si los fragmentos no respaldan la pregunta, responder que no hay información suficiente, sin completar con conocimiento externo ni presentar citas de una respuesta inexistente.
5. Si la respaldan, solicitar una respuesta basada exclusivamente en esos fragmentos; transmitir texto progresivamente y presentar citas asociadas a afirmaciones documentales solo si sus identificadores corresponden a los fragmentos recuperados.
6. Si falla la generación o se elimina/reprocesa un documento del que depende la operación, cancelar, retirar el texto parcial como respuesta válida, informar del fallo y permitir reintentar. Al recargar o cerrar la pestaña, descartar el historial; los mensajes anteriores visibles durante la sesión conservan una cita marcada como no disponible si su documento se eliminó.

## Contratos de interfaz y operaciones web

Contratos propuestos para la aplicación; formatos y rutas pueden ajustarse sin cambiar el comportamiento de `spec.md`. Los errores se muestran en español y no exponen detalles internos. La sesión de chat es de la pestaña y no requiere cuenta. **Cobertura: RF-1 a RF-9.**

| Acción / contrato propuesto | Entrada | Resultado y errores observables | RF |
| --- | --- | --- | --- |
| `POST /api/documents` | PDF, hasta 10 MB y 100 páginas. | `201` con id y estado `processing` o `failed` si el daño/protección impide contar páginas; `400` si no es PDF o excede límites. Un fallo posterior actualiza el documento registrado a `failed` con causa. | RF-1, RF-2 |
| `GET /api/documents` | Sin entrada. | `200` con id, nombre, estado y error legible de cada documento; lista vacía con indicación para subir el primero. | RF-2, RF-7 |
| `DELETE /api/documents/:id` | Id y confirmación previa en la interfaz. | `204` tras borrado completo; `404` si no existe; error si el borrado no se completó. Cancela consultas dependientes y marca citas históricas como no disponibles. | RF-5, RF-8 |
| `POST /api/documents/:id/reprocess` | Id de documento disponible o fallido. | `202` con estado `processing`; `404` si no existe; al fallar, vuelve la versión anterior disponible cuando exista. | RF-2, RF-9 |
| `POST /api/chat/answers` | Pregunta (1–1000 caracteres) e historial de la pestaña. | Flujo de eventos con estado, texto provisional, respuesta final y citas válidas; error recuperable o respuesta explícita de falta de evidencia. Rechaza consultas simultáneas y consultas sin documentos disponibles. | RF-3, RF-4, RF-5, RF-6 |

Errores de validación: `400`; conflicto por consulta simultánea: `409`; ausencia de documento: `404`; fallos internos o de proveedores: respuesta de error legible y posibilidad de reintento. El contenido provisional del flujo nunca se presenta como respuesta final tras un fallo. El historial enviado por el cliente se usa solo para comprender referencias: se cotejan sus referencias con documentos aún disponibles y siempre se recupera evidencia vigente para responder. **Cobertura: RF-3, RF-4, RF-5, RF-6, RF-8, RF-9.**

## Decisiones técnicas y alternativas descartadas

| Decisión y motivo | Alternativa descartada y motivo | RF |
| --- | --- | --- |
| Una aplicación Next.js modular con rutas finas y lógica RAG aislada reduce piezas sin acoplar interfaz y negocio. | Frontend y API independientes: más despliegue y mantenimiento para este MVP. | RF-1 a RF-9 |
| PostgreSQL con pgvector, migraciones SQL versionadas y consultas explícitas: hace visible el aprendizaje de persistencia y similitud. | JSON/archivos u otra base para vectores: incumple persistencia única; ORM: añade abstracción sin necesidad acordada. | RF-1, RF-2, RF-3, RF-7, RF-8, RF-9 |
| Extracción de texto por página y reconocimiento solo de páginas escaneadas: cubre PDF mixtos sin reprocesar imágenes innecesariamente. | Usar solo texto extraíble: no cubre escaneados; reconocer todas las páginas: añade trabajo innecesario. La dependencia concreta para reconocimiento se justificará en la spec antes de añadirse. | RF-1, RF-2 |
| Versiones completas y cambio atómico de versión activa: permiten fallo sin datos parciales y recuperación de la anterior. | Sobrescribir directamente los fragmentos activos: arriesga pérdida de datos y respuestas inconsistentes. | RF-2, RF-3, RF-8, RF-9 |
| Historial efímero en la pestaña, con búsqueda nueva en cada turno: respeta la sesión y evita convertir respuestas previas en fuentes. | Persistir conversaciones o reutilizar citas anteriores como evidencia: contradice alcance y trazabilidad de respuestas. | RF-3, RF-4, RF-5 |
| Flujo progresivo de respuesta con resultado final distinguible del texto provisional: posibilita streaming sin conservar una respuesta fallida. | Esperar siempre la respuesta completa: incumple presentación progresiva. | RF-4, RF-6 |

**Decisión pendiente antes de implementar integraciones de IA:** comparar con documentación oficial vigente OpenAI y Gemini para embeddings y generación (nivel gratuito, precio, límites, privacidad, dimensiones y calidad), presentar resultados y esperar la elección del usuario; registrar la decisión en una spec aprobada. No se fija aquí proveedor, modelo, dimensión, parámetros de fragmentación ni dependencia de OCR. Los parámetros experimentales deberán explicitarse y poder ajustarse cuando se concrete la integración; secretos por variables de entorno. **Cobertura: RF-1, RF-3, RF-4, RF-6.**

## Estrategia de pruebas y comprobación

Vitest para pruebas unitarias de lógica sin interfaz, red ni base; pruebas de integración contra PostgreSQL con pgvector real y migraciones efectivas. Proveedores externos se simulan en pruebas de reglas de negocio; la búsqueda SQL, transacciones y persistencia vectorial nunca se simulan al validarlas. Incluir pruebas automatizadas para cada comportamiento nuevo o corregido, correr la suite completa antes de integrar y ejecutar también lint y comprobación de tipos. **Cobertura: RF-1 a RF-9.**

| Prueba principal | Nivel | RF |
| --- | --- | --- |
| Rechazo de no PDF, más de 10 MB o 100 páginas; PDF idénticos independientes; texto, escaneos en español/inglés y PDF mixto. | Unitario e integración | RF-1 |
| Estados durante procesamiento, PDF dañado/protegido/vacío o parcialmente ilegible, interrupción y reintento sin publicar fragmentos parciales. | Unitario e integración | RF-2 |
| Preguntas vacías y de más de 1000 caracteres; sin documentos; exclusión de `processing`/`failed`; orden de similitud con pgvector y fallo de búsqueda. | Unitario e integración real | RF-3 |
| Respuestas con soporte en uno o varios documentos y citas por afirmación; ausencia de evidencia sin citas ni conocimiento externo. | Unitario con proveedor controlado | RF-4 |
| Seguimiento en pestaña, recarga que borra historial, pregunta simultánea rechazada y citas históricas no disponibles tras eliminación. | Unitario e integración de contrato | RF-5 |
| Eventos progresivos, cierre exitoso, error durante generación y cancelación sin respuesta parcial válida. | Unitario e integración de flujo | RF-6 |
| Listado vacío, documentos duplicados, transiciones de estados y persistencia de documentos después de reiniciar la aplicación. | Integración real | RF-7 |
| Confirmación en interfaz, borrado atómico de PDF/versiones/fragmentos/vectores, fallo de borrado y cancelación de consulta dependiente. | Unitario e integración real | RF-8 |
| Exclusión durante reprocesamiento, publicación de versión nueva completa, recuperación de versión anterior al fallar y documento fallido que sigue fallido. | Unitario e integración real | RF-9 |

Comprobación final: todos los RF deben tener al menos una prueba automatizada de su comportamiento, los datos documentales deben sobrevivir al reinicio y ninguna operación fallida debe hacer consultable una versión incompleta. **Cobertura: RF-1 a RF-9.**
