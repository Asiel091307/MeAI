# Tareas 001: MVP de MeAI

Fuente: [`spec.md`](./spec.md), [`plan.md`](./plan.md) y [`docs/constitution.md`](../../constitution.md). Ejecutar en orden; cada tarea está pensada para **20–30 minutos como máximo**. Si una tarea supera ese tiempo, dividirla antes de implementarla. Cada comportamiento nuevo o corregido necesita al menos una prueba automatizada; las comprobaciones de SQL y pgvector deben usar PostgreSQL real. Los RF indicados corresponden a los requisitos de `spec.md`.

## 1. Base del proyecto y pruebas

- [x] T01. Inicializar la aplicación Next.js con TypeScript y pnpm, manteniendo una sola aplicación modular. **RF: RF-1–RF-9.**
  Hecho cuando: `pnpm dev` inicia una página local sin errores.
- [x] T02. Configurar scripts `lint`, `typecheck` y `test` para la aplicación. **RF: RF-1–RF-9.**
  Hecho cuando: `pnpm lint`, `pnpm typecheck` y `pnpm test` finalizan correctamente en el proyecto recién creado.
- [x] T03. Configurar Vitest y el script `test:integration` separado de las pruebas unitarias. **RF: RF-1–RF-9.**
  Hecho cuando: ambos scripts ejecutan sus respectivas pruebas de ejemplo sin conectarse a servicios externos en las unitarias.
- [x] T04. Configurar PostgreSQL con pgvector en Docker Compose. **RF: RF-1, RF-2, RF-3, RF-7, RF-8, RF-9.**
  Hecho cuando: la base arranca y acepta `CREATE EXTENSION vector`.
- [x] T05. Añadir la aplicación al mismo Docker Compose y configurar variables de entorno sin guardar secretos reales. **RF: RF-1–RF-9.**
  Hecho cuando: la aplicación se inicia desde Compose y se comunica con PostgreSQL.
- [x] T06. Crear el ejecutor de migraciones SQL versionadas y su prueba de integración. **RF: RF-1, RF-2, RF-3, RF-7, RF-8, RF-9.**
  Hecho cuando: una migración de prueba se aplica una sola vez en PostgreSQL real.

## 2. Datos y contratos básicos

- [ ] T07. Crear la migración de `documents` con PDF binario, identidad, nombre, estado y error. **RF: RF-1, RF-2, RF-7.**
  Hecho cuando: una prueba de integración guarda dos PDF idénticos con identificadores distintos y lee sus bytes después.
- [ ] T08. Crear la migración de `document_versions` y la referencia a versión activa. **RF: RF-2, RF-8, RF-9.**
  Hecho cuando: una prueba almacena una versión activa y un intento nuevo sin sustituir la versión activa.
- [ ] T09. Crear la migración de `chunks` con documento, versión, página, posición y texto, sin fijar aún la dimensión vectorial. **RF: RF-1, RF-2, RF-3, RF-4.**
  Hecho cuando: una prueba lee fragmentos con sus referencias de página y versión; no existe aún una dimensión de vector arbitraria.
- [ ] T10. Definir tipos y contratos de persistencia sin importar React ni HTTP. **RF: RF-1, RF-2, RF-3, RF-7, RF-8, RF-9.**
  Hecho cuando: los casos de uso pueden importar la persistencia sin importar `app/` ni componentes.
- [ ] T10a. Definir contratos independientes para embeddings, OCR y generación. **RF: RF-1, RF-3, RF-4, RF-6.**
  Hecho cuando: cada contrato se puede importar desde lógica RAG sin depender de React, HTTP ni un proveedor concreto.
- [ ] T11. Implementar y probar el registro y lectura de PDF en PostgreSQL. **RF: RF-1, RF-7.**
  Hecho cuando: una prueba de integración recupera exactamente el PDF guardado por identificador.
- [ ] T12. Implementar y probar el listado de metadatos sin exponer el PDF binario. **RF: RF-2, RF-7.**
  Hecho cuando: la prueba devuelve nombre, estado y error de cada documento y una lista vacía cuando corresponda.

## 3. Validación e ingestión de PDF

- [ ] T13. Validar tipo PDF y límite de 10 MB antes del registro. **RF: RF-1.**
  Hecho cuando: pruebas rechazan otro formato y archivos mayores de 10 MB con motivos en español sin crear documentos.
- [ ] T14. Justificar en la spec la dependencia para contar páginas y extraer texto; agregarla solo después de su aprobación. **RF: RF-1, RF-2.**
  Hecho cuando: la decisión y la dependencia constan en la spec aprobada antes de instalarla.
- [ ] T15. Contar páginas y rechazar PDF de más de 100 páginas sin registrarlos. **RF: RF-1.**
  Hecho cuando: pruebas cubren 100 páginas aceptadas y 101 rechazadas con mensaje en español.
- [ ] T16. Registrar como fallido un PDF dañado o protegido cuyo número de páginas no pueda conocerse. **RF: RF-1, RF-2.**
  Hecho cuando: la prueba conserva el documento con causa legible y sin fragmentos consultables.
- [ ] T17. Extraer texto de PDF digitales conservando la página de cada texto. **RF: RF-1, RF-2.**
  Hecho cuando: una prueba de dos páginas devuelve texto y número de página correctos.
- [ ] T18. Justificar y aprobar en la spec la dependencia y estrategia de OCR para texto impreso en español e inglés. **RF: RF-1, RF-2.**
  Hecho cuando: la spec aprobada identifica la solución OCR y sus dependencias antes de agregarlas.
- [ ] T19. Reconocer texto de una página escaneada en español y otra en inglés, preservando su origen. **RF: RF-1, RF-2.**
  Hecho cuando: pruebas con PDF de ejemplo reconocen texto no vacío y las páginas correctas.
- [ ] T20. Combinar extracción y OCR solo en las páginas que lo necesiten. **RF: RF-1, RF-2.**
  Hecho cuando: una prueba de PDF mixto devuelve texto de todas las páginas en orden.
- [ ] T21. Rechazar la publicación si alguna página queda vacía o ilegible. **RF: RF-2.**
  Hecho cuando: pruebas de PDF vacío, manuscrito no reconocible y PDF parcialmente ilegible dejan el documento fallido sin fragmentos activos.
- [ ] T22. Crear el fragmentador con tamaño y solapamiento recibidos como parámetros; conservar documento, página y posición. **RF: RF-1, RF-3, RF-4.**
  Hecho cuando: pruebas unitarias muestran que los parámetros cambian el resultado y ningún fragmento pierde su origen.

## 4. Proveedores y decisiones bloqueantes

- [ ] T23. Comparar embeddings de OpenAI y Gemini con documentación oficial vigente: nivel gratuito, precio, límites, privacidad, dimensiones y calidad esperada. **RF: RF-1, RF-3.**
  Hecho cuando: una tabla fechada con enlaces oficiales permite comparar ambos proveedores para embeddings.
- [ ] T23a. Comparar generación de OpenAI y Gemini con documentación oficial vigente: nivel gratuito, precio, límites, privacidad y calidad esperada. **RF: RF-4, RF-6.**
  Hecho cuando: una tabla fechada con enlaces oficiales permite comparar ambos proveedores para generación.
- [ ] T24. Presentar la comparación y registrar la elección de proveedor y modelos en una spec aprobada. **RF: RF-3, RF-4, RF-6.**
  Hecho cuando: la spec aprobada identifica por separado embeddings y generación; ninguna integración se implementa antes.
- [ ] T25. Definir y documentar parámetros configurables de fragmentación y cantidad de resultados, con valores predeterminados explícitos. **RF: RF-1, RF-3.**
  Hecho cuando: la spec aprobada describe los valores y una prueba verifica que pueden modificarse por configuración.
- [ ] T26. Añadir una migración del vector con la dimensión del modelo de embeddings aprobado. **RF: RF-1, RF-3.**
  Hecho cuando: PostgreSQL real acepta vectores de esa dimensión y rechaza dimensiones incompatibles.
- [ ] T27. Implementar el adaptador de embeddings elegido con configuración y credenciales por entorno. **RF: RF-1, RF-3.**
  Hecho cuando: una prueba de contrato con proveedor controlado genera un vector válido sin secretos en el repositorio.
- [ ] T28. Generar embeddings para fragmentos y guardarlos en su versión. **RF: RF-1, RF-3.**
  Hecho cuando: una prueba de integración lee los vectores junto con documento, versión y página.

## 5. Estados, publicación y listado

- [ ] T29. Registrar una subida válida como `processing` y conservar duplicados independientes. **RF: RF-1, RF-2.**
  Hecho cuando: la prueba crea dos registros distintos para el mismo PDF y ambos comienzan en `processing`.
- [ ] T30. Publicar atómicamente una versión completa y marcar el documento `available`. **RF: RF-2, RF-3.**
  Hecho cuando: una prueba de integración solo encuentra fragmentos consultables después de publicar toda la versión.
- [ ] T31. Descartar el intento incompleto y registrar una causa comprensible al fallar la ingestión. **RF: RF-2.**
  Hecho cuando: una prueba de fallo deja el documento `failed`, sin contenido parcial disponible.
- [ ] T32. Recuperar al inicio los intentos interrumpidos sin publicar datos parciales. **RF: RF-2, RF-9.**
  Hecho cuando: una prueba de reinicio marca fallido un documento sin versión previa y restaura la versión activa anterior si existía.
- [ ] T33. Exponer `POST /api/documents` con validaciones y respuestas acordes al resultado del registro. **RF: RF-1, RF-2.**
  Hecho cuando: pruebas de ruta comprueban `201` para registro y `400` para formato o límites inválidos.
- [ ] T34. Exponer `GET /api/documents` sin binarios y con estado actualizado. **RF: RF-2, RF-7.**
  Hecho cuando: pruebas de ruta devuelven lista vacía o documentos con estado y error vigentes.
- [ ] T35. Mostrar la selección y subida de un PDF. **RF: RF-1.**
  Hecho cuando: una prueba de interfaz selecciona un PDF y envía la solicitud de registro.
- [ ] T35a. Mostrar el listado de documentos y el estado vacío. **RF: RF-7.**
  Hecho cuando: la interfaz muestra los documentos recibidos o invita a subir el primero si la lista está vacía.
- [ ] T36. Reflejar las transiciones `processing` → `available`/`failed` y mostrar causas en español. **RF: RF-2, RF-7.**
  Hecho cuando: una prueba de interfaz observa cambios de estado sin recargar la página.
- [ ] T37. Verificar persistencia del PDF y los metadatos tras reiniciar la aplicación. **RF: RF-1, RF-7.**
  Hecho cuando: una prueba de integración reinicia la app y vuelve a leer el documento desde PostgreSQL.

## 6. Consulta semántica y respuestas fundamentadas

- [ ] T38. Validar preguntas vacías, de solo espacios o de más de 1000 caracteres. **RF: RF-3.**
  Hecho cuando: pruebas unitarias rechazan esas entradas antes de llamar a embeddings o búsqueda.
- [ ] T39. Impedir consultas cuando no haya documentos disponibles. **RF: RF-3.**
  Hecho cuando: una prueba devuelve un mensaje en español sin invocar búsqueda.
- [ ] T40. Consultar con pgvector los fragmentos más cercanos únicamente de versiones activas `available`. **RF: RF-3, RF-9.**
  Hecho cuando: una prueba en PostgreSQL real ordena resultados por similitud y excluye documentos `processing` y `failed`.
- [ ] T41. Adjuntar id de fragmento, documento y página a cada resultado de búsqueda. **RF: RF-3, RF-4.**
  Hecho cuando: una prueba de integración recupera las tres referencias junto con cada texto.
- [ ] T42. Detener la respuesta al fallar la búsqueda y devolver un error recuperable. **RF: RF-3, RF-6.**
  Hecho cuando: una prueba verifica que el generador no se invoca y la pregunta puede reintentarse.
- [ ] T43. Responder explícitamente en español cuando no hay evidencia suficiente, sin citas ni datos externos. **RF: RF-4.**
  Hecho cuando: pruebas de contexto irrelevante no producen afirmaciones documentales ni citas.
- [ ] T44. Implementar el adaptador de generación aprobado con instrucciones de usar solo evidencia recuperada. **RF: RF-4.**
  Hecho cuando: una prueba de contrato comprueba que la petición solo incluye fragmentos vigentes y la pregunta.
- [ ] T45. Validar citas por afirmación contra los identificadores recuperados. **RF: RF-4.**
  Hecho cuando: pruebas aceptan citas a fuentes reales y rechazan citas inventadas.
- [ ] T46. Probar una respuesta que combina varios documentos sin confundir páginas ni fuentes. **RF: RF-4.**
  Hecho cuando: cada afirmación documental de la prueba apunta al documento y página que la sustentan.

## 7. Chat y streaming

- [ ] T47. Conservar mensajes solo en memoria de la pestaña y descartarlos al recargar. **RF: RF-5.**
  Hecho cuando: una prueba de interfaz conserva el historial entre turnos y lo pierde tras recargar.
- [ ] T48. Contextualizar preguntas de seguimiento con el historial, sin utilizarlo como evidencia. **RF: RF-3, RF-4, RF-5.**
  Hecho cuando: la prueba resuelve una referencia anterior pero vuelve a buscar fragmentos vigentes.
- [ ] T49. Bloquear una segunda pregunta desde que comienza la búsqueda hasta que termina o falla la respuesta. **RF: RF-5.**
  Hecho cuando: una prueba rechaza el segundo envío durante ambas fases y permite enviarlo al finalizar.
- [ ] T50. Exponer `POST /api/chat/answers` con validación y eventos de estado, texto provisional y resultado final. **RF: RF-3, RF-4, RF-6.**
  Hecho cuando: una prueba de contrato distingue eventos progresivos de respuesta final y errores.
- [ ] T51. Mostrar los eventos de texto progresivamente e indicar operación en curso. **RF: RF-6.**
  Hecho cuando: una prueba de interfaz ve texto antes del evento final y un indicador mientras se genera.
- [ ] T52. Retirar el texto parcial como respuesta válida al fallar o interrumpirse la generación. **RF: RF-6.**
  Hecho cuando: una prueba muestra error y opción de reintento sin respuesta final parcial.
- [ ] T53. Mostrar cada cita con documento y página o fragmento. **RF: RF-4.**
  Hecho cuando: una prueba de interfaz identifica la fuente correspondiente a cada afirmación documental.
- [ ] T53a. Priorizar documentos vigentes sobre historial contradictorio. **RF: RF-4, RF-5.**
  Hecho cuando: una prueba de lógica ignora afirmaciones históricas que carecen de respaldo documental actual.

## 8. Eliminación y reprocesamiento

- [ ] T54. Eliminar PDF, versiones, fragmentos, embeddings y metadatos en una transacción. **RF: RF-8.**
  Hecho cuando: una prueba en PostgreSQL real confirma que no quedan datos asociados al documento borrado.
- [ ] T54a. Comprobar la reversión completa de un borrado fallido. **RF: RF-8.**
  Hecho cuando: una prueba en PostgreSQL real provoca un fallo y confirma que el PDF y todos sus datos siguen intactos.
- [ ] T55. Exponer `DELETE /api/documents/:id` con `204`, `404` y error de borrado apropiados. **RF: RF-8.**
  Hecho cuando: pruebas de ruta distinguen los tres resultados sin dar por completado un borrado fallido.
- [ ] T56. Pedir confirmación antes de borrar y actualizar el listado solo tras éxito. **RF: RF-7, RF-8.**
  Hecho cuando: una prueba de interfaz cancela la confirmación sin borrar y muestra un error si el borrado falla.
- [ ] T57. Marcar como no disponibles las citas visibles de documentos eliminados. **RF: RF-5, RF-8.**
  Hecho cuando: la prueba conserva mensajes anteriores pero invalida sus citas y no reutiliza el contenido borrado.
- [ ] T58. Cancelar una búsqueda o generación dependiente al eliminar su documento. **RF: RF-6, RF-8.**
  Hecho cuando: una prueba descarta texto provisional, avisa al usuario y evita una respuesta final con el documento borrado.
- [ ] T59. Iniciar el reprocesamiento de documentos disponibles o fallidos y excluirlos de nuevas consultas. **RF: RF-2, RF-3, RF-9.**
  Hecho cuando: una prueba observa `processing` y cero resultados del documento durante el intento.
- [ ] T60. Publicar solo la nueva versión completa tras reprocesar correctamente. **RF: RF-9.**
  Hecho cuando: una prueba de integración encuentra únicamente fragmentos de la versión nueva activa.
- [ ] T61. Restaurar la versión anterior si falla el reprocesamiento de uno disponible. **RF: RF-2, RF-9.**
  Hecho cuando: una prueba conserva consultable la versión previa completa e informa del fallo.
- [ ] T62. Mantener fallido, con causa, un documento fallido cuyo reintento también falla. **RF: RF-2, RF-9.**
  Hecho cuando: una prueba verifica estado `failed` y ningún fragmento consultable.
- [ ] T63. Exponer `POST /api/documents/:id/reprocess`. **RF: RF-2, RF-9.**
  Hecho cuando: pruebas de ruta cubren `202` para disponible o fallido y `404` para un id inexistente.
- [ ] T63a. Mostrar la acción de reprocesar documentos disponibles o fallidos. **RF: RF-2, RF-9.**
  Hecho cuando: una prueba de interfaz inicia el reintento y refleja el estado `processing`.
- [ ] T64. Cancelar consultas o respuestas dependientes cuando empiece un reprocesamiento. **RF: RF-6, RF-9.**
  Hecho cuando: una prueba descarta texto parcial, avisa al usuario y no publica respuesta basada en la versión anterior.

## 9. Cierre del MVP

- [ ] T65. Probar subida y consulta con fuentes usando PostgreSQL y pgvector reales. **RF: RF-1, RF-2, RF-3, RF-4, RF-6, RF-7.**
  Hecho cuando: una prueba de integración sube un PDF y consulta sus fragmentos con documento y página correctos.
- [ ] T65a. Probar eliminación y reprocesamiento sobre documentos persistidos. **RF: RF-2, RF-3, RF-5, RF-8, RF-9.**
  Hecho cuando: las pruebas de integración confirman que un documento borrado no reaparece y que solo la versión completa activa puede consultarse.
- [ ] T66. Revisar los criterios de aceptación de `spec.md` frente a las pruebas existentes. **RF: RF-1–RF-9.**
  Hecho cuando: cada RF tiene al menos una prueba automatizada aplicable y los casos límite de la spec están cubiertos.
- [ ] T66a. Ejecutar formato, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:integration`. **RF: RF-1–RF-9.**
  Hecho cuando: todos los comandos terminan correctamente sobre la implementación final.
