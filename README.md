# DentAI

Extensión Chrome Manifest V3 para completar formularios web mediante voz. El objetivo es integrarla posteriormente con SMILE sobre una sesión ya autorizada, sin acceder a credenciales ni enviar formularios automáticamente.

El repositorio contiene únicamente:

- `browser-extension/`: asistente lateral, reconocimiento de voz, detección y llenado de campos.
- `browser-extension/demo-form.html`: formulario clínico ficticio para pruebas locales.

## Ejecutar el formulario de prueba

```powershell
cd C:\Users\USER\Desktop\DentIA\browser-extension
python -m http.server 8080 --bind 127.0.0.1
```

Después abre:

```text
http://127.0.0.1:8080/demo-form.html
```

## Cargar la extensión en Chrome

1. Abre `chrome://extensions`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona `C:\Users\USER\Desktop\DentIA\browser-extension`.
5. Abre el formulario de prueba y el panel lateral de DentAI.

Después de modificar código, pulsa **Recargar** en la tarjeta de DentAI y actualiza el formulario con `Ctrl + R`.

## Modo guiado por voz

1. Pulsa **Iniciar guía** una vez.
2. Di el nombre del campo, por ejemplo: **“Nombre del paciente”**.
3. Dicta únicamente su valor.
4. Di **“Confirmar”** o **“Corregir”**.
5. Continúa con otro campo o di **“Siguiente campo”**.
6. Di **“Finalizar registro”** para detener la escucha.

## Verificación técnica

```powershell
cd C:\Users\USER\Desktop\DentIA\browser-extension
npm test
npm run check
```

Este proyecto es un prototipo. Usa solamente datos ficticios hasta contar con autorización, mapeo y validación formal para SMILE.
