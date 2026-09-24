# AGENTS.md

## Propósito

MeAI es un MVP educativo para aprender cómo funciona un sistema RAG. Debe permitir cargar archivos PDF, indexarlos en PostgreSQL con pgvector y responder preguntas usando únicamente el contexto recuperado.

La prioridad es que cada cambio sea pequeño, comprensible y explicable para una persona con experiencia en desarrollo, pero principiante en RAG.

## Fuente de verdad

- `docs/constitution.md` contiene los principios innegociables del proyecto.
- Cada funcionalidad debe tener una spec aprobada en `docs/specs/` antes de implementarse.
- Si la spec, el código y los tests difieren, se debe detener el cambio y corregir primero la spec.
- No se deben añadir funcionalidades, dependencias o abstracciones que no estén justificadas por una spec.

## Alcance del MVP

- Cargar e indexar archivos PDF.
- Listar los documentos almacenados.
- Eliminar un documento junto con sus fragmentos y embeddings.
- Reindexar documentos existentes.
- Formular preguntas y recibir respuestas mediante streaming.
- Mostrar las páginas o fragmentos utilizados como fuentes.
- Indicar claramente cuando el contexto recuperado no contiene evidencia suficiente.
- No implementar autenticación ni soporte multiusuario en el MVP.

## Stack y arquitectura

- Usar TypeScript, Next.js y pnpm.
- Usar PostgreSQL con la extensión pgvector como única base de datos.
- Ejecutar la aplicación y PostgreSQL mediante Docker Compose.
- Mantener una sola aplicación Next.js modular mientras el alcance no justifique separarla.
- Separar los componentes de interfaz, las rutas HTTP, los casos de uso RAG y el acceso a datos.
- La lógica de ingestión, fragmentación, embeddings, recuperación y generación no debe importar módulos de React ni depender de objetos HTTP.
- Usar SQL directo y migraciones SQL versionadas; no introducir un ORM sin una spec aprobada.
- Guardar en PostgreSQL los PDF, metadatos, fragmentos y embeddings. No usar memoria ni el sistema de archivos como persistencia definitiva.

## Modelos de IA

- OpenAI y Gemini son los proveedores candidatos para embeddings y generación.
- No seleccionar ni cambiar un modelo sin una spec aprobada para esa integración.
- Antes de decidir, consultar documentación oficial vigente y comparar nivel gratuito, precio, límites, privacidad, dimensiones de embeddings y calidad esperada.
- Presentar la comparación al usuario y esperar su decisión antes de implementar el proveedor.
- Configurar proveedor, modelo y credenciales mediante variables de entorno; nunca incluir secretos en el repositorio.
- Mantener separadas las tareas de embeddings y generación para poder elegir el proveedor adecuado para cada una.

## Reglas del RAG

- Conservar la página y el documento de origen en los metadatos de cada fragmento.
- Responder a partir del contexto recuperado y citar las fuentes utilizadas.
- No completar con conocimiento general una respuesta que el documento no respalde.
- Cuando no exista evidencia suficiente, decirlo explícitamente en español.
- Hacer configurables los parámetros experimentales, como tamaño de fragmento, solapamiento y cantidad de resultados, sin ocultar valores predeterminados.

## Flujo de trabajo

1. Leer `docs/constitution.md` y las specs relacionadas.
2. Crear o actualizar la spec en `docs/specs/` con alcance, comportamiento verificable y criterios de aceptación.
3. Esperar aprobación cuando la spec incluya una decisión de producto, arquitectura, dependencia o proveedor de IA.
4. Implementar el cambio mínimo que satisfaga la spec.
5. Añadir o actualizar tests automatizados.
6. Ejecutar formato, lint, comprobación de tipos y tests afectados.
7. Explicar brevemente qué cambió, por qué y cómo se verificó.

## Tests y calidad

- Usar Vitest para tests unitarios y de integración, salvo que una spec justifique otra herramienta.
- Cada comportamiento nuevo o corregido debe incluir al menos un test automatizado.
- Los tests unitarios deben cubrir la lógica RAG sin interfaz, red ni base de datos.
- Los tests de integración deben usar PostgreSQL con pgvector real para validar migraciones, persistencia y búsqueda vectorial.
- No simular PostgreSQL en pruebas cuyo objetivo sea verificar SQL o similitud vectorial.
- Mantener disponibles los scripts `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:integration` cuando se inicialice el proyecto.
- No considerar terminado un cambio si fallan los checks relacionados.

## Idioma y estilo

- Escribir código, identificadores, nombres de archivos técnicos y commits en inglés.
- Escribir interfaz, mensajes para usuarios, documentación y specs en español.
- Preferir nombres explícitos y funciones pequeñas antes que comentarios extensos.
- Explicar conceptos de RAG y decisiones relevantes de forma breve, sin ocultar la implementación detrás de abstracciones innecesarias.
