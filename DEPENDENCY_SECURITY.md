# Parches de seguridad de dependencias

La app conserva Expo SDK 57 y las versiones de sus dependencias compatibles.
Las alertas de npm encontradas el 23 de octubre de 2026 corresponden a dos
vulnerabilidades transitivas. Se aplican parches locales reproducibles; no se
modifican los números de versión ni se desactiva la auditoría.

## Parches

- `decode-uri-component@0.2.2`, utilizado por Expo Router a través de
  `query-string@7.1.3`: se incorpora el algoritmo corregido de la versión 0.5.1
  conservando la interfaz CommonJS y el tratamiento de `+` de la versión
  instalada. Evita el tiempo exponencial al decodificar URLs malformadas.
  [Aviso GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
- `node-forge@1.4.0`, utilizado por las herramientas de Expo: se incorpora la
  validación del número de elementos de `DigestAlgorithm` propuesta en
  [PR upstream #1152](https://github.com/digitalbazaar/forge/pull/1152).
  Es una mitigación local de
  [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), cuya
  corrección todavía no tiene una versión oficial publicada. El PR sigue abierto.

## Instalación y comprobación

`npm install` y `npm ci` ejecutan automáticamente el script `postinstall`, que
comprueba las versiones y el contenido de los módulos antes de aplicar los
parches. Si una actualización cambia esos archivos, la instalación falla con
un mensaje que permite revisar el parche antes de continuar.

```sh
npm run postinstall
npm run test:security
npm run lint
npm run typecheck
npx expo-doctor
npm --prefix server run typecheck
npm audit
npm --prefix server audit
```

Las pruebas de seguridad comprueban los módulos realmente instalados: entradas
de URL válidas y malformadas, rechazo de estructuras RSA manipuladas y aceptación
de firmas válidas. Si se instala con `--ignore-scripts`, es necesario ejecutar
`npm run postinstall` antes de utilizar Expo.

`npm audit` sigue mostrando 3 alertas moderadas y 4 altas porque consulta las
versiones publicadas y no reconoce estos cambios locales. Las siete alertas son
la propagación de las dos vulnerabilidades anteriores, no siete fallos distintos.
El servidor no presentaba vulnerabilidades en su auditoría.

También se revisaron los scripts de instalación de
`@shopify/react-native-skia@2.6.2` (preparación de sus bibliotecas nativas) y
`unrs-resolver@1.12.2` (resolución nativa para ESLint). Sus aprobaciones en
`allowScripts` están limitadas a esas versiones y al proyecto.

## Resultado de la validación

- 7 pruebas de seguridad aprobadas, incluyendo reinstalación, idempotencia y
  saltos de línea LF/CRLF.
- Lint, TypeScript de app y servidor, y las 21 comprobaciones de Expo Doctor
  aprobadas.
- Exportación de los bundles Android, iOS y web completada con los parches activos.
  No se realizó una compilación nativa de EAS ni una prueba en teléfono físico.
- Flujo web probado con cámara simulada: captura, recorte, repetición, error de
  factura ilegible, reintento, resultado y vista previa del adjunto. Sin errores
  ni advertencias de consola; la API de extracción se simuló.
- `/health` del servidor configurado respondió HTTP 200. Auditoría del servidor:
  0 vulnerabilidades. No se enviaron facturas al modelo ni correos reales.

El botón de `email-preview.tsx` ya usa el servicio de correo de Supabase y adjunta
la fotografía. La integración incluye autorización de dispositivos, registro e
idempotencia. Las pruebas generan mensajes MIME en memoria, sin conectarse a
SMTP. La activación remota de esta integración está pendiente de autorización;
estas comprobaciones no envían correos a los destinatarios de la aplicación.

No utilizar `npm audit fix --force` para resolver estos avisos: la propuesta de
npm mezcla una bajada a Expo 44 con un cambio de Router a SDK 58. Cuando los
proveedores publiquen versiones compatibles corregidas, actualizarlas con
`npx expo install`, retirar los parches que ya no sean necesarios y repetir las
comprobaciones de seguridad, tipos, lint y compilación.
