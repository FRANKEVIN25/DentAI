# Cobertura del prototipo de extensión

Esta matriz traduce los requisitos de los formatos de constitución y gestión del alcance a la base local implementada. No certifica uso clínico ni integración con SMILE.

| Requisito | Cobertura actual | Evidencia técnica |
| --- | --- | --- |
| RF01 · Capturar audio y convertirlo a texto | Parcial | Web Speech en español, con modo local en dispositivo y entrada manual de respaldo. |
| RF02 · Estructurar el texto en campos | Implementado para el prototipo | Parser clínico determinista con nombre, documento, pieza, síntoma, duración, diagnóstico, tratamiento y observaciones. |
| RF03 · Operar sobre una sesión ya iniciada sin exponer credenciales | Implementado por diseño | La extensión actúa en la pestaña abierta, excluye campos `password` y no solicita ni almacena credenciales. |
| RF04 · Ubicar y completar campos automáticamente | Implementado para formularios HTML | Detección por etiquetas, atributos accesibles, nombre, `id` y `placeholder`; escritura compatible con eventos de formulario. |
| RF05 · Revisar y corregir antes del envío | Implementado | Los valores propuestos son editables y solo se escriben tras confirmación. La extensión nunca envía el formulario. |
| RF06 · Historial de operaciones | Implementado sin datos clínicos | Log local por profesional con fecha, origen, cantidad de campos, resultado, latencia y modo de voz. |
| RF07 · Detectar y notificar fallas | Implementado | Reporta páginas no autorizadas, campos inexistentes, opciones inválidas y cambios de DOM. |
| RF08 · Registro exportable | Implementado | Exportación CSV del log técnico. |
| RNF02 · Respuesta no mayor a 3 segundos | Instrumentado, no certificado | Cada operación registra `durationMs`; falta una campaña de rendimiento representativa. |
| RNF03/RNF04 · Protección de datos y credenciales | Base implementada | Sin persistencia de transcripción/valores; host limitado; modo local predeterminado; no se manipulan contraseñas. |
| RNF05 · Interfaz simple y manos libres | Parcial | Dictado por micrófono y panel persistente; la confirmación final sigue siendo explícita por seguridad. |
| RNF06 · Selectores robustos | Base implementada | Priorización semántica sobre coordenadas o selectores posicionales. Falta validar contra la interfaz real de SMILE. |
| RC01 · Corrección manual ≤10% | Pendiente de validación | Requiere al menos 20 dictados ficticios con terminología odontológica y medición de correcciones. |
| RC02 · Sin duplicados/inconsistencias | Base implementada, pendiente de integración | La escritura es idempotente sobre cada campo; se requieren 10 flujos consecutivos en el sistema autorizado. |

## Pendientes antes de usar SMILE

1. Obtener autorización o no objeción formal de Cibermundo/SmileSoftware.
2. Confirmar el dominio y los términos de uso aplicables.
3. Mapear los campos reales con datos exclusivamente ficticios.
4. Validar el comportamiento en formularios dinámicos, modales y cambios de pantalla.
5. Ejecutar pruebas de precisión, latencia, seguridad y regresión con supervisión odontológica y de TI.
6. Integrar la identidad institucional del usuario; el prototipo usa un nombre local editable para separar operaciones por profesional.
