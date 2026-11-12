# MeAI

MeAI es un MVP educativo de **RAG** (*Retrieval-Augmented Generation*): subes tus PDF, se indexan en PostgreSQL con pgvector, y puedes hacer preguntas que se responden **solo** con lo que dicen tus documentos, citando el documento y la página.

- Lee PDF con texto y PDF escaneados (OCR en español e inglés).
- Divide el texto en fragmentos y guarda el embedding de cada uno, con Gemini `gemini-embedding-001` de 1536 dimensiones.
- Busca los fragmentos más parecidos a tu pregunta con similitud coseno.
- Genera la respuesta con `gemini-3.5-flash-lite`, que aparece poco a poco (*streaming*), con sus fuentes.
- Si tus documentos no contienen la respuesta, lo dice en lugar de inventarla.

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) en ejecución.
- Una clave de la API de Gemini, gratuita en [Google AI Studio](https://aistudio.google.com/) ("Get API key").
- Solo para desarrollo y tests: Node.js 20 o superior y pnpm 10.17.1 (`corepack enable`).

## Puesta en marcha

1. Copia la plantilla de configuración:

   ```bash
   cp .env.example .env
   ```

2. Rellena dos valores en `.env`, sin espacios alrededor del `=`:

   ```
   POSTGRES_PASSWORD=una_contraseña_local
   GEMINI_API_KEY=tu_clave_de_gemini
   ```

   `.env` está en `.gitignore`: nunca se sube al repositorio.

3. Arranca la aplicación y la base de datos:

   ```bash
   docker compose up -d --build
   ```

4. Abre <http://127.0.0.1:3000>.

Al arrancar, la aplicación crea o actualiza sola las tablas de la base de datos. No hace falta ejecutar `pnpm migrate`.

Para apagarla:

```bash
docker compose down
```

Tus documentos se conservan en el volumen de Docker `postgres_data`. `docker compose down -v` los **borra**.

## Cómo se usa

1. **Subir:** elige un PDF (hasta 10 MB y 100 páginas) y pulsa "Subir PDF".
2. **Esperar:** el estado pasa de "En procesamiento" a "Disponible". Los PDF escaneados tardan más por el OCR. Si falla, verás la causa y podrás reintentar o eliminar.
3. **Preguntar:** escribe tu pregunta (hasta 1000 caracteres). Puedes hacer preguntas de seguimiento; la conversación vive solo en la pestaña y se borra al recargar.
4. **Mantener:** puedes reprocesar o eliminar cada documento. Eliminar borra el PDF, sus fragmentos y sus embeddings.

## Privacidad

Con el **nivel gratuito** de Gemini, Google puede usar el texto que se le envía (fragmentos de tus PDF y tus preguntas) para mejorar sus productos. Usa PDF que no sean sensibles. Para documentos personales, activa la facturación en Google AI Studio con la misma clave; en el nivel de pago Google no usa tus datos para entrenar modelos.

El PDF, el texto y los embeddings se guardan solo en tu PostgreSQL local. El OCR se hace en tu máquina.

## Parámetros ajustables

En `.env`; si los dejas vacíos se usan los valores predeterminados.

| Variable | Valor por defecto | Qué controla |
| --- | --- | --- |
| `CHUNK_SIZE` | `1000` | Caracteres por fragmento |
| `CHUNK_OVERLAP` | `200` | Caracteres compartidos entre fragmentos seguidos |
| `RETRIEVAL_TOP_K` | `5` | Fragmentos usados como evidencia en cada respuesta |

Tras cambiarlos, reinicia con `docker compose up -d` y reprocesa los documentos para aplicar el nuevo tamaño.

## Desarrollo y tests

```bash
pnpm install
```

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm test:integration
```

- `pnpm test` ejecuta los tests unitarios: lógica RAG con proveedores simulados e interfaz con happy-dom.
- `pnpm test:integration` usa PostgreSQL con pgvector real en Docker, OCR real y, si existe `GEMINI_API_KEY`, una llamada real a Gemini. Necesita Docker Desktop y el puerto 3000 libre.
- `pnpm migrate` aplica las migraciones a la base de Docker Compose a mano. Es opcional, porque la aplicación ya lo hace al arrancar.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `app/`, `components/` | Interfaz y rutas HTTP (`app/api/`) |
| `src/rag/` | Ingestión (PDF, OCR, fragmentos), búsqueda, respuestas y proveedores de IA |
| `src/documents/` | Casos de uso: registrar, procesar, reprocesar y eliminar |
| `src/db/`, `db/migrations/` | SQL directo y migraciones versionadas |
| `docs/` | Constitución, specs, tareas y verificación del MVP |

Las decisiones del proyecto están en [`docs/specs/`](docs/specs/). La relación entre cada criterio y sus tests está en [`docs/specs/001-meai-mvp/verificacion.md`](docs/specs/001-meai-mvp/verificacion.md).

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| "No se pudo conectar con MeAI…" al subir o preguntar | La app no está en marcha o todavía arranca. Pasa, por ejemplo, si la pestaña seguía abierta tras reiniciar el PC o Docker. Abre Docker Desktop, ejecuta `docker compose up -d`, espera unos segundos y recarga la página. Los contenedores tienen `restart: unless-stopped`, así que vuelven solos cuando Docker arranca. |
| Pulsas "Subir PDF" y la página se recarga sin subir nada | La página aún no terminó de cargar su JavaScript; la primera carga en modo desarrollo tarda unos segundos. Espera a que aparezca el listado de documentos y vuelve a intentarlo. |
| Subir un PDF da error 500 y los logs (`docker compose logs app`) dicen `password authentication failed` | El volumen de la base se creó con otra contraseña: `POSTGRES_PASSWORD` solo se aplica la primera vez. Pon en la base la contraseña de tu `.env`, o borra el volumen con `docker compose down -v` si no tienes datos que conservar. |
| Los documentos quedan "Fallido" con un error de embeddings | Falta `GEMINI_API_KEY`, la clave es inválida o se agotó la cuota gratuita. Revisa `.env`, sin espacios alrededor del `=`, y reinicia. |
| `docker compose up` dice que el puerto 3000 está ocupado | Otro programa usa el puerto. Ciérralo o cambia el puerto en `compose.yaml`. |
| Un PDF escaneado queda "Fallido" con "No se pudo leer texto en la página N" | El OCR no reconoció texto en esa página: manuscrito, imagen borrosa o página en blanco. |
