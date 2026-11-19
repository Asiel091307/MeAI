# Tareas 012: Proveedores configurables y distribución

Fuente: [`spec.md`](./spec.md). Primero los tests, luego el código. Solo el integrador marca `[x]`.

| Carril | Significado |
| --- | --- |
| I | Integrador |
| A | Adaptadores de IA |
| B | Datos |
| C | Distribución |

- [ ] T012-01. **I.** `ai-config`: configuración por `.env`, privacidad y vista pública sin claves. **RF-012-1, RF-012-2.**
- [ ] T012-02. **A.** Embeddings compatibles con OpenAI: lotes, `dimensions` opcional, normalización L2 y validación de tamaño. **RF-012-3.**
- [ ] T012-03. **A.** Generación compatible con OpenAI en streaming, con el prompt, la falta de evidencia y las citas compartidas con Gemini (`grounded-prompt.ts`). **RF-012-3.**
- [ ] T012-04. **B.** Migración 005: vector sin dimensión fija, y modelo y dimensión por versión (los datos existentes quedan como `gemini-embedding-001` y 1536). **RF-012-4.**
- [ ] T012-05. **B.** La búsqueda solo usa versiones del modelo actual, y se cuentan los documentos con otro modelo. **RF-012-4.**
- [ ] T012-06. **B.** `DATABASE_URL` en el pool. **RF-012-5.**
- [ ] T012-07. **C.** Scripts `build` y `start`, y `Dockerfile` de producción sin root con los idiomas de OCR incluidos. **RF-012-6.**
- [ ] T012-08. **C.** `compose.yaml` con la imagen publicada y el perfil `ollama`, plantillas `.env.example` por proveedor y `LICENSE` MIT. **RF-012-5, RF-012-6.**
- [ ] T012-09. **C.** GitHub Actions: CI de tests y publicación de la imagen en GHCR (amd64 y arm64). **RF-012-6.**
- [ ] T012-10. **I.** Fábrica de proveedores conectada al procesamiento y al chat, y `GET /api/settings`. **RF-012-1, RF-012-2.**
- [ ] T012-11. **I.** Pie dinámico de proveedor y privacidad, y avisos de configuración y de reindexado. **RF-012-2, RF-012-4.**
- [ ] T012-12. **I.** `README.md` en inglés y `README.es.md`, con capturas. **RF-012-6.**
- [ ] T012-13. **I.** Verificar `pnpm build`, la imagen de producción de punta a punta y la suite completa.
