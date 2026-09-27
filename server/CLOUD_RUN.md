# Backend de Repnet en Google Cloud Run

Desplegado y verificado el 27 de septiembre de 2026.

## Servicio publicado

- Proyecto: `repnetfacturas` (`587494516979`).
- Región: `us-central1` (Iowa).
- Servicio: `repnet-facturas-api`.
- URL: https://repnet-facturas-api-587494516979.us-central1.run.app
- Comprobación: https://repnet-facturas-api-587494516979.us-central1.run.app/health
- Consola: https://console.cloud.google.com/run/detail/us-central1/repnet-facturas-api/metrics?project=repnetfacturas

El backend funciona independientemente del computador: no necesita que quede ejecutándose `npm run dev`. La URL base no tiene una página web; para comprobarlo en el navegador, usa `/health`.

## Configuración

- Node.js 24, compilación TypeScript con `npm run build`, inicio con `npm start`.
- Despliegue desde `server/` mediante Cloud Build / Buildpacks.
- 1 CPU, 512 MiB de memoria, concurrencia 4, timeout de 120 segundos.
- Mínimo 0 instancias y máximo configurado 2; CPU asignada durante las solicitudes. La primera solicitud después de un período de inactividad puede tardar más.
- Cuenta de ejecución: `repnet-api-runtime@repnetfacturas.iam.gserviceaccount.com`.
- Cuenta de compilación: `repnet-api-builder@repnetfacturas.iam.gserviceaccount.com`, con el rol `roles/run.builder`.
- `OPENAI_API_KEY` se obtiene desde Secret Manager: secreto `openai-api-key`, versión `1`. Solo la cuenta de ejecución recibió acceso a ese secreto para la aplicación.
- `NODE_ENV=production`; el puerto lo proporciona Cloud Run.

`server/.gcloudignore` permite subir únicamente `package.json`, `package-lock.json`, `tsconfig.json` y `src/`. El archivo `server/.env`, las dependencias locales y los archivos de la app no se suben. Nunca copies la clave de OpenAI a variables `EXPO_PUBLIC_*` ni al código móvil.

## Aplicación móvil

`EXPO_PUBLIC_API_URL` quedó configurada con la URL HTTPS en:

- `.env.local` para desarrollo local (archivo excluido de Git).
- El entorno `preview` del proyecto EAS.
- El entorno `production` del proyecto EAS.

Los perfiles `preview` y `production` de `eas.json` seleccionan explícitamente esos entornos. La app agrega `/api/invoices/analyze` a la URL base.

Para probar en desarrollo, recarga completamente la app. Si conserva la configuración anterior, reinicia Metro desde la raíz:

```powershell
npx expo start --clear
```

Un APK ya instalado conserva la URL que tenía al compilarse. Para distribuir la nueva configuración hace falta generar e instalar otra compilación. No se generó una nueva compilación móvil durante este despliegue.

## Volver a publicar cambios del backend

Desde la raíz del repositorio, con Google Cloud CLI autenticado y las dependencias del backend instaladas:

```powershell
.\server\deploy-cloud-run.ps1
```

El script compila, comprueba qué archivos se subirán y publica una nueva revisión del mismo servicio. Los cambios guardados en el computador no se publican automáticamente. El script presupone que las cuentas de servicio, permisos y secreto ya existen en el proyecto; no crea infraestructura en otros proyectos.

Para renovar la clave, agrega una nueva versión al secreto `openai-api-key` desde Secret Manager y vuelve a desplegar indicando su número, por ejemplo:

```powershell
.\server\deploy-cloud-run.ps1 -SecretVersion 2
```

No elimines versiones antiguas mientras puedan ser necesarias para una reversión. Editar `server/.env` no cambia la clave del servicio publicado.

## Presupuesto y avisos

- Presupuesto: **$5.000 CLP por mes calendario**, limitado al proyecto `repnetfacturas` e incluyendo los créditos aplicables.
- Nombre: `Repnet Facturas - mensual`.
- Avisos de gasto real: 50% ($2.500), 90% ($4.500) y 100% ($5.000).
- Se mantienen los destinatarios predeterminados de Google Cloud: administradores y usuarios de la cuenta de facturación.
- Cuenta de facturación: `01D993-D646D0-FDD62A`.
- ID del presupuesto: `f18f87dc-1dee-4cdb-be13-8258a119ce34`.

**La alerta no es un límite de gasto y no apaga el servicio.** Los avisos pueden llegar con retraso. Escalar a cero y limitar las instancias reduce el consumo, pero no garantiza una factura de $0 ni un máximo de $5.000. Cloud Build, almacenamiento de imágenes y otros servicios del proyecto también pueden generar cargos. El consumo de la API de OpenAI se factura por separado y no está incluido en este presupuesto de Google Cloud.

## Seguridad pendiente antes de distribuir ampliamente

El servicio es accesible públicamente para que la app pueda llamar a la API sin credenciales de Google Cloud. Actualmente el backend no implementa autenticación de usuarios ni límites de solicitudes por usuario: quien conozca la URL puede invocar el análisis y generar consumo. La restricción CORS no impide ese uso.

Antes de una distribución amplia, implementar autenticación verificable en el backend y controles de uso. No resolverlo incorporando una clave secreta fija dentro del APK.

## Verificaciones realizadas

- App: lint y TypeScript sin errores.
- Backend: TypeScript y compilación sin errores.
- `GET /health`: HTTP 200.
- Análisis sin fotografía: HTTP 400 con el mensaje de validación esperado.
- Análisis con `assets/images/invoice-document.png`: HTTP 200 y resultado estructurado con `documentReadable: false`, correctamente identificado como ilustración. Esta prueba verifica la conexión entre Cloud Run y OpenAI; no sustituye una prueba de extracción con una factura real ni una prueba en el teléfono.

Referencias: [despliegue desde código fuente](https://docs.cloud.google.com/run/docs/deploying-source-code), [presupuestos](https://docs.cloud.google.com/billing/docs/how-to/budgets), [variables de entorno de EAS](https://docs.expo.dev/eas/environment-variables/).
