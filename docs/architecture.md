# Arquitectura inicial

DentAI se organiza como un monorepo con una API FastAPI y una interfaz React + TypeScript. El backend conserva las reglas del flujo clínico y los adaptadores de servicios externos; el frontend permite revisar y confirmar antes de cualquier integración.

La demostración de automatización vive en `browser-extension/` como una extensión Chrome Manifest V3. En esta etapa opera sin backend: mantiene la transcripción y los valores clínicos solo en memoria, exige revisión antes de escribir en la página y almacena únicamente metadatos técnicos del resultado.

## Límites de esta etapa

- El backend conserva servicios mock para Speech-to-Text y SMILE; la extensión añade dictado Web Speech y automatización DOM para el entorno de prueba.
- El mock SMILE solo puede ejecutarse para una sesión confirmada.
- No se carga ni almacena audio. El modo de voz local usa el paquete en dispositivo del navegador.
- No se envían datos clínicos a sistemas externos.
- Los eventos de auditoría guardan identificadores, transición y fecha, no texto clínico.

## Próximos módulos

- `users`: identidad local mínima del profesional.
- `sessions`: sesión clínica, estados y auditoría.
- `transcription`: contrato de Speech-to-Text y mock.
- `clinical_data`: estructura JSON revisable.
- `integrations`: contrato y mock para SMILE.

## Entidades implementadas

- `User`: identidad local mínima por nombre visible.
- `ClinicalSession`: usuario, estado y marcas de tiempo del flujo.
- `AudioRecord`: referencia y metadatos de audio, sin almacenar bytes.
- `Transcription`: texto ingresado por el mock.
- `ClinicalData`: estructura JSON revisable.
- `AuditEvent`: tipo, fecha y metadatos técnicos sin transcripción.

## Regla de confirmación

La edición solo se acepta en `REVIEW`. La confirmación cambia el estado a `CONFIRMED`; el servicio de integración rechaza cualquier otro estado. La sesión solo pasa a `COMPLETED` después del evento `SMILE_SYNC_COMPLETED`.

En la extensión, la misma barrera se aplica en el cliente: el parser solo genera propuestas editables. El script de contenido recibe valores únicamente después de `Confirmar y rellenar` y nunca ejecuta el envío del formulario.

## Extensión de navegador

- `sidepanel.html/js/css`: dictado, revisión y confirmación en un panel persistente.
- `lib/field-mapper.js`: parser demostrativo y mapeo por etiquetas semánticas.
- `content-script.js`: detección y escritura de campos, con eventos `input`/`change` compatibles con formularios modernos.
- `service-worker.js`: apertura del panel lateral desde el icono de la extensión.
- `demo-form.html`: formulario clínico ficticio para pruebas reproducibles.

Los permisos de host están limitados a Google y al entorno local. Cuando se autorice SMILE se debe agregar su origen exacto, registrar sus etiquetas reales y repetir pruebas de seguridad, regresión y términos de uso.

## Rutas iniciales

- `POST /api/v1/sessions`
- `GET /api/v1/sessions/{id}`
- `POST /api/v1/sessions/{id}/transcription`
- `POST /api/v1/sessions/{id}/process`
- `PATCH /api/v1/sessions/{id}/clinical-data`
- `POST /api/v1/sessions/{id}/confirm`
- `POST /api/v1/sessions/{id}/cancel`
- `POST /api/v1/sessions/{id}/smile-sync`
- `POST /api/v1/sessions/{id}/complete`
