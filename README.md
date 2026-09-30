# DentAI

Base técnica local del MVP para apoyar el registro de atención en la Clínica Dental CREO (UPCH). La integración con SMILE es externa y se incorporará mediante un adaptador mock; no se presupone API ni acceso al código de SMILE.

## Arquitectura

- `backend/`: API FastAPI, configuración, persistencia/migraciones y servicios desacoplados.
- `frontend/`: interfaz React + TypeScript para el flujo de revisión humana.
- `browser-extension/`: extensión Chrome Manifest V3 para dictado, revisión y autollenado controlado.
- `docs/`: decisiones y documentación del proyecto.

El backend es responsable de las reglas de estado y de impedir la integración hasta que el profesional confirme la información. La interfaz no envía información directamente a SMILE.

## Requisitos locales

- Python 3.11 o superior
- Node.js 20.19 o superior y npm

## Configuración

Copia `.env.example` a `.env` y ajusta los valores locales si hace falta. `.env` está excluido de Git; no guardes credenciales ni datos clínicos reales en este entorno de desarrollo.

## Ejecutar el backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

La API estará en `http://127.0.0.1:8000`; documentación interactiva en `/docs` y salud en `/api/v1/health`.

## Ejecutar el frontend

En otra terminal, desde la raíz:

```powershell
cd frontend
npm install
npm run dev
```

Abrir la URL local mostrada por Vite. Para compilar: `npm run build`.

## Probar la extensión de navegador

La extensión funciona de forma independiente para la demostración local. Consulta la guía completa en [`browser-extension/README.md`](browser-extension/README.md).

```powershell
cd browser-extension
npm test
python -m http.server 8080 --bind 127.0.0.1
```

Después carga `browser-extension/` como extensión descomprimida desde `chrome://extensions` y abre `http://127.0.0.1:8080/demo-form.html`. También se puede probar con el cuadro de búsqueda de Google; la extensión completa los campos pero nunca envía el formulario.

## Pruebas

Desde `backend/`:

```powershell
python -m pytest
```

## Estado de esta iteración

El vertical slice local permite crear una sesión, ingresar una transcripción simulada, procesar y editar datos, confirmar, enviar al mock SMILE y finalizar. El mock solo acepta sesiones confirmadas. La estructuración determinista es demostrativa, no es IA clínica ni debe usarse con información real.

La extensión de navegador ya implementa el flujo local `voz → estructuración → revisión → llenado → log técnico`. Usa reconocimiento en dispositivo cuando Chrome dispone del paquete de español, no lee contraseñas, no persiste transcripciones y no pulsa botones de envío. El acceso real a SMILE y la validación clínica siguen pendientes de autorización del proveedor, mapeo de sus campos y pruebas supervisadas.
