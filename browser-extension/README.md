# Extensión local DentAI

Prototipo Manifest V3 para demostrar el flujo definido en los documentos del proyecto:

1. Captura voz en español o acepta una transcripción manual.
2. Detecta campos editables de la página activa.
3. Estructura el dictado con un parser clínico local y propone valores.
4. Obliga a revisar los valores antes de escribirlos.
5. Completa los campos sin enviar el formulario.
6. Registra solo metadatos técnicos; no almacena audio, transcripción ni valores clínicos.

## Modo guiado solo por voz

El modo predeterminado completa un campo cada vez y evita depender de una frase larga:

1. Pulsa **Iniciar guía** una sola vez.
2. Di el nombre visible del campo, por ejemplo **“Nombre del paciente”**.
3. Cuando el campo quede resaltado, dicta únicamente el valor.
4. Di **“Confirmar”** para escribirlo o **“Corregir”** para repetirlo.
5. Di el nombre de otro campo o **“Siguiente campo”**.
6. Di **“Finalizar registro”** para detener la escucha.

El DNI se valida con ocho dígitos, la pieza dental se comprueba con numeración FDI y los desplegables solo aceptan opciones existentes. Los resultados provisionales del reconocimiento nunca se escriben. El modo **Dictado completo** sigue disponible para observaciones o pruebas por lotes.

## Alcance actual

- Compatible con Google Search, formularios web convencionales bajo `google.com` y páginas servidas desde `localhost` o `127.0.0.1`.
- No lee ni almacena contraseñas.
- No pulsa botones de envío.
- No requiere el backend para la demostración.
- El parser es determinista y demostrativo; todavía no es un modelo clínico validado.
- El reconocimiento local usa la capacidad en dispositivo de Chrome 139+ y puede requerir instalar una vez el paquete de español. El modo en línea es opcional y debe usarse solo con datos ficticios.

Google Docs usa una superficie de edición no convencional y no forma parte de esta prueba. Google Search y Google Forms sí son objetivos válidos para el prototipo.

## Instalar en Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la carpeta `browser-extension`.
5. Fija DentAI en la barra y pulsa su icono para abrir el panel lateral.

Tras cambiar archivos, pulsa **Actualizar** en la tarjeta de la extensión y recarga la página de prueba.

## Si el dictado no escucha

1. Actualiza la extensión desde `chrome://extensions` y vuelve a abrir su panel.
2. Regresa al formulario local; el micrófono no puede probarse desde una pestaña `chrome://settings`.
3. Pulsa **Probar micrófono**. DentAI mostrará sobre el formulario el botón **Permitir y probar micrófono**.
4. Pulsa ese botón y elige **Permitir** en el aviso de Chrome; habla durante dos segundos.
5. La barra debe moverse y el panel debe mostrar **Micrófono listo**.
6. Pulsa **Dictar** y no empieces a hablar hasta ver **Audio activo**.

El permiso pertenece a la página visible (`http://127.0.0.1:8080` durante la prueba), no al panel interno de la extensión. Si aparece **Micrófono bloqueado**, usa **Abrir ajustes** o el icono junto a la dirección y permite el micrófono para esa página. En Windows también debe estar habilitado en **Configuración → Privacidad y seguridad → Micrófono**.

El indicador permite distinguir estos casos:

- **Permiso concedido, sin sonido**: Chrome abre el dispositivo, pero no recibe volumen; revisa el botón de silencio o el micrófono predeterminado.
- **Micrófono ocupado**: cierra temporalmente Zoom, Teams u otra aplicación que esté usando el dispositivo.
- **El servicio de voz no respondió**: cambia entre modo local y modo en línea, o reinicia Chrome.
- **No se detectaron palabras**: espera a que aparezca **Audio activo** y habla más cerca del micrófono.

## Prueba local recomendada

Desde esta carpeta ejecuta:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Abre `http://127.0.0.1:8080/demo-form.html`, abre DentAI y dicta o pega:

> Paciente Ana Torres, DNI 12345678, pieza 26, síntoma dolor, duración tres días, diagnóstico caries profunda, tratamiento restauración con resina, observaciones paciente ficticio.

Pulsa **Preparar llenado**, revisa los valores y finalmente **Confirmar y rellenar**. Los campos completados se resaltan y el formulario no se envía.

## Prueba rápida en Google

1. Abre `https://www.google.com/`.
2. Abre DentAI.
3. Escribe o dicta `buscar clínica dental creo`.
4. Revisa la propuesta y pulsa **Confirmar y rellenar**.

La extensión completa el cuadro de búsqueda, pero no ejecuta la búsqueda.

## Verificación técnica

```powershell
npm test
npm run check
```

## Adaptación futura a SMILE

Cuando exista acceso autorizado, agrega el dominio exacto de SMILE a `host_permissions` y `content_scripts.matches`. Después registra aliases de las etiquetas reales en `lib/field-mapper.js`. La automatización ya se basa primero en etiquetas accesibles, nombres y atributos semánticos, no en posiciones visuales rígidas.

Antes de una prueba real se debe obtener autorización de Cibermundo/SmileSoftware, validar sus términos de uso y sustituir el parser demostrativo por un componente clínico evaluado con datos ficticios y supervisión odontológica.
