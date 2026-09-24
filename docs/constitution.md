# Constitución de MeAI
1. **Stack mínimo:** PostgreSQL con pgvector será la única base de datos; toda dependencia adicional deberá justificarse en la spec.
2. **Spec antes que código:** ninguna funcionalidad se implementará sin una spec vigente; todo cambio funcional actualizará primero su spec.
3. **Lógica separada:** la ingestión, recuperación y generación del RAG no dependerán de componentes de interfaz ni de rutas HTTP.
4. **Tests obligatorios:** cada comportamiento nuevo o corregido tendrá al menos un test automatizado; la suite deberá pasar antes de integrar cambios.
5. **Persistencia real:** documentos, fragmentos, embeddings y metadatos se almacenarán en PostgreSQL; no se dependerá de memoria ni archivos locales.
6. **Idioma consistente:** código, nombres técnicos y commits estarán en inglés; interfaz, mensajes de usuario y documentación estarán en español.
