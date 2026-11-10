# Especificación 003: Librería de pruebas de interfaz de usuario para MeAI (T35, T35a, T36, T47…)

## Contexto y necesidad

El MVP de MeAI incluye pruebas automatizadas de interfaz de usuario para:
- Selección y subida de archivos PDF con validación y estados (T35, RF-1).
- Listado de documentos y presentación del estado vacío con invitación en español (T35a, RF-7).
- Transiciones de estado en vivo (`processing` → `available` / `failed`) sin recargar la página (T36, RF-2, RF-7).
- Historial de chat en memoria de la pestaña y presentación progresiva de respuestas (T47, T51, RF-5, RF-6).
- Confirmación de borrado en interfaz (T56, RF-8) y reprocesamiento (T63a, RF-9).

`docs/coordinacion/carriles.md` establece como bloqueo del carril B:
> *"La interfaz (T35, T35a, T36, T47…) necesita una librería de tests de interfaz: proponerla en spec y esperar aprobación."*

Conforme a la Constitución (Principio 1 y 4) y `AGENTS.md`, cada nueva dependencia debe justificarse en una spec antes de incorporarse.

---

## Comparación técnica de opciones (consultada el 2026-11-09)

| Criterio | Opción 1: `@testing-library/react` + `happy-dom` (Recomendada) | Opción 2: `@testing-library/react` + `jsdom` | Opción 3: `@playwright/test` (E2E en navegador real) |
| --- | --- | --- | --- |
| **Nivel de prueba** | Pruebas de componentes de React e integración de interfaz en memoria Node.js. | Pruebas de componentes en memoria Node.js. | Pruebas End-to-End con instancias reales de navegadores (Chromium / Firefox / WebKit). |
| **Integración con Vitest** | **Nativa y directa:** Vitest soporta `environment: 'happy-dom'` de forma nativa. | Soportada vía `environment: 'jsdom'`. | Requiere un ejecutor separado (`playwright test`), otro archivo de configuración y orquestación externa. |
| **Velocidad y recursos** | **Extremadamente rápida y ligera:** `happy-dom` inicia en milisegundos y consume mínima memoria. | Rápida, pero con mayor peso y parsing más lento de DOM/CSS que `happy-dom`. | Lenta y pesada: arranca binarios de navegador, requiriendo 1–2 GB de descarga y riesgo de timeouts en CI / Docker. |
| **Descargas / Binarios nativos de SO** | **Ninguna:** paquetes puros JavaScript/TypeScript sin binarios de navegador. | **Ninguna:** JavaScript puro. | **Exige descargar navegadores:** ~500 MB – 1 GB de binarios de Chromium/Firefox; problemas de compatibilidad en entornos sin display/X11. |
| **Soporte de React 19 y Next.js** | Completo para componentes cliente (`'use client'`), formularios, eventos de teclado/ratón y llamadas asíncronas con `act()` y `waitFor()`. | Completo. | Completo. |
| **Cobertura de RF-1, RF-2, RF-7** | Permite simular selección de archivos (`fireEvent.change`), renderizado de listas, actualización de estados reactivos y aserciones accesibles por roles/textos. | Similar a opción 1. | Similar, pero levantando la aplicación completa en puerto local. |

---

## Propuesta

Se propone añadir como **únicas dependencias de desarrollo (`devDependencies`)**:
1. **`@testing-library/react`** (versión compatible con React 19): para renderizar componentes de interfaz y consultar elementos por roles accesibles, etiquetas y textos visibles.
2. **`happy-dom`**: para proveer el entorno de DOM virtual ligero en Vitest (`environment: 'happy-dom'`).
3. **`@testing-library/user-event`** (opcional): para simular interacciones realistas de usuario como selección de archivos en inputs `<input type="file" />`.

### Plan de integración (a realizar por el integrador en `main` tras aprobación)
1. El integrador añade las dependencias a `devDependencies` en `package.json` de `main`.
2. El carril B ejecuta `git rebase main` y `pnpm install --frozen-lockfile`.
3. El carril B implementa los componentes de interfaz en `components/` y `app/` junto con sus pruebas en `tests/unit/ui/`.

---

## Estado

**Pendiente de aprobación del usuario.**

