# Envío de la fotografía de una factura

El botón **Enviar factura** envía el asunto, el texto y la fotografía seleccionada a la Edge Function `enviar-factura`. La función valida la sesión y la autorización del dispositivo, registra el intento y utiliza Gmail SMTP para enviar el correo.

Después de procesar la foto, la pantalla `invoice-result` reúne el nombre del proveedor, el número de factura y todo el formulario de correo: destinatarios, asunto y mensaje editables, vista de la foto adjunta y estado del envío. La ruta anterior `email-preview` redirige a esta pantalla. El análisis ya no solicita productos, cantidades ni otros detalles; el cambio del extractor se aplica al desplegar nuevamente el backend de `server/`.

La foto viaja directamente como formulario `multipart/form-data`. Este flujo no genera PDF ni utiliza Supabase Storage. El bucket `correo-prueba` de la prueba inicial no es necesario para la aplicación.

| Configuración | Valor |
| --- | --- |
| Proyecto Supabase | `ciouhmiaehqzitfhdpwq` |
| URL pública | `https://ciouhmiaehqzitfhdpwq.supabase.co` |
| Función | `enviar-factura` |
| Remitente | `bodega@autthcomercial.cl` |
| Destinatarios fijos | `Contacto@autthcomercial.cl`, `m.arellano@autthcomercial.cl` |
| SMTP | `smtp.gmail.com`, puerto `465`, TLS |
| Adjunto | Una fotografía JPEG, PNG o WebP, hasta 10 MiB |
| Límite de la aplicación | 50 intentos nuevos en una ventana de 24 horas, entre todos los dispositivos |

Los destinatarios están definidos en `src/config/invoice-email.ts` para mostrarlos en pantalla y en `supabase/functions/enviar-factura/handler.ts` para aplicar la restricción en el servidor. La migración SQL también verifica esos destinatarios al registrar una aceptación completa. Un cambio de destinatarios debe mantener las tres partes coordinadas.

## 1. Credenciales de Google: solamente en Supabase

En el [proyecto de Supabase](https://supabase.com/dashboard/project/ciouhmiaehqzitfhdpwq), abre **Edge Functions → Secrets** y comprueba:

| Secret | Contenido |
| --- | --- |
| `SMTP_USER` | `bodega@autthcomercial.cl` |
| `SMTP_PASS` | La contraseña de aplicación de Google creada para Repnet Facturas |

Si ya existen por la prueba que llegó correctamente, se reutilizan. La nueva función también usa las credenciales internas que Supabase proporciona a sus Edge Functions.

La contraseña de Google, `MAIL_TEST_TOKEN` y las claves `service_role` o `sb_secret_...` deben permanecer fuera de `.env.local`, del código móvil y de EAS. La sección **Authentication → SMTP** de Supabase sirve para correos de autenticación y no configura este envío de facturas.

La función de prueba `probar-correo` debe retirarse cuando termine la configuración: su token apareció en una captura compartida. La función `enviar-factura` no utiliza ese token. No hace falta cambiar la contraseña de Google por esa captura, que no la muestra.

## 2. Crear las tablas y funciones SQL

La migración del repositorio es:

```text
supabase/migrations/202610240001_invoice_mail.sql
```

Crea las tablas administrativas `invoice_mail_devices` y `invoice_mail_deliveries`, las restricciones contra duplicados y las funciones SQL `claim_invoice_mail_delivery` y `settle_invoice_mail_delivery`. Los clientes móviles no tienen permisos para consultar o modificar estas tablas ni para ejecutar esas funciones SQL.

Desde PowerShell, en `C:\RepnetFacturas`, el procedimiento con Supabase CLI es:

```powershell
npx supabase login
npx supabase link --project-ref ciouhmiaehqzitfhdpwq
npx supabase migration list
npx supabase db push --dry-run
```

Revisa que las migraciones pendientes correspondan al cambio que quieres instalar. Después aplica:

```powershell
npx supabase db push
```

Si el administrador prefiere el panel, puede ejecutar el contenido completo de la migración una sola vez en **SQL Editor**. Esa vía requiere coordinar después el historial de migraciones con CLI; no vuelvas a pegarla si las tablas ya existen.

## 3. Habilitar las sesiones anónimas

En el panel de Supabase, abre **Authentication → Sign In / Providers** y habilita **Anonymous Sign-Ins**. El nombre exacto del menú puede variar.

Esto permite identificar cada instalación sin agregar una pantalla de usuario y contraseña. La sesión se crea al pulsar Enviar y se conserva en el dispositivo; abrir la aplicación no envía correos.

Antes de habilitarlo, revisa las políticas del proyecto: los usuarios anónimos de Supabase Auth también pertenecen al rol SQL `authenticated`. Una política que permita acceso a cualquier usuario `authenticated` puede incluirlos. Las políticas que necesiten distinguirlos deben comprobar la condición `is_anonymous` del JWT. [Referencia de Supabase](https://supabase.com/docs/guides/auth/auth-anonymous).

Una sesión anónima **no autoriza** a enviar: el administrador debe aprobar su UUID en `invoice_mail_devices`. No apruebes automáticamente todos los usuarios nuevos ni cualquier identificador recibido.

## 4. Publicar la Edge Function

Desde la raíz del proyecto:

```powershell
npx supabase functions deploy enviar-factura --project-ref ciouhmiaehqzitfhdpwq --no-verify-jwt
```

El repositorio ya configura `verify_jwt = false` para esta función. La función comprueba por sí misma el token de usuario mediante Supabase Auth y después la autorización administrativa del dispositivo. Desactivar la comprobación del gateway no elimina esa validación interna.

Publicar la función no envía correos. Evita ejecutar una llamada de prueba con una sesión ya aprobada: una solicitud válida envía a los dos destinatarios reales.

## 5. Configurar la aplicación y las compilaciones

El archivo local `.env.local` debe contener los datos públicos de conexión, además de la URL actual del servicio que analiza la factura:

```dotenv
EXPO_PUBLIC_API_URL=https://repnet-facturas-api-587494516979.us-central1.run.app
EXPO_PUBLIC_SUPABASE_URL=https://ciouhmiaehqzitfhdpwq.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=PEGA_LA_CLAVE_sb_publishable_DEL_PROYECTO
```

La clave `sb_publishable_...` es pública y no permite enviar por sí sola. El servidor exige una sesión válida y un dispositivo aprobado. Reinicia Metro después de cambiar las variables locales:

```powershell
npx expo start --clear
```

Para compilar con EAS, configura también esas tres variables en **Project settings → Environment variables** del proyecto Expo. Usa visibilidad **Plain text** y selecciónalas para los entornos **preview** y **production**; agrega **development** si utilizas ese perfil. `.env.local` está ignorado por Git y no debe ser la única fuente de configuración para una compilación remota. [Variables de entorno en EAS](https://docs.expo.dev/eas/environment-variables/manage/).

El `eas.json` actual selecciona explícitamente `preview` y `production` en sus respectivos perfiles. Para revisar los valores públicos antes de compilar:

```powershell
npx eas-cli@latest env:list --environment preview
npx eas-cli@latest env:list --environment production
```

Esta integración agrega `expo-secure-store`, un módulo nativo que conserva la sesión del teléfono. Un APK anterior que no lo incluya necesita una **nueva compilación**; recargar JavaScript no añade el módulo. El perfil `preview` actual genera una compilación Android de distribución interna:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Instala el APK resultante antes de autorizar ese teléfono. No hace falta crear ni editar las carpetas `android/` o `ios/`. [SecureStore para SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), [APK con EAS](https://docs.expo.dev/build-reference/apk/).

## 6. Comprobar el código sin enviar correos

Instala las dependencias y ejecuta las comprobaciones desde la raíz:

```powershell
npm ci
npm --prefix supabase ci
npm run lint
npm run typecheck
npm run test:mail
```

`test:mail` prueba almacenamiento de sesiones, autorización, imágenes, duplicados, errores SMTP simulados y permisos SQL en PostgreSQL embebido. También genera un correo MIME con Nodemailer en memoria y comprueba el adjunto. **Estas pruebas no se conectan a Gmail, no usan SMTP y no envían correos a los destinatarios configurados.**

## 7. Autorizar un teléfono

Una vez instalada la aplicación actualizada y publicada la función:

1. En el teléfono, fotografía una factura y llega a la pantalla de correo.
2. Pulsa **Enviar factura**. Mientras la instalación no esté aprobada, el servidor responde **Autoriza este dispositivo** y muestra un UUID. Esa respuesta se produce antes del envío SMTP.
3. Verifica con la persona que utiliza ese teléfono que el identificador procede de esa instalación.
4. En **SQL Editor**, consulta ese usuario. Sustituye el marcador por el UUID que muestra la aplicación:

```sql
select id, is_anonymous, created_at
from auth.users
where id = 'UUID_MOSTRADO_POR_LA_APP'::uuid;
```

5. Si corresponde al dispositivo que quieres autorizar, ejecuta:

```sql
insert into public.invoice_mail_devices (user_id, label, enabled)
values ('UUID_MOSTRADO_POR_LA_APP'::uuid, 'Teléfono de bodega', true)
on conflict (user_id) do update
set label = excluded.label, enabled = true;
```

6. Comprueba la autorización:

```sql
select user_id, label, enabled, created_at
from public.invoice_mail_devices
where user_id = 'UUID_MOSTRADO_POR_LA_APP'::uuid;
```

**El siguiente toque en Volver a intentar ya realiza un envío real a los dos destinatarios.** Hazlo sólo cuando quieras enviar esa factura. No es una prueba de configuración.

Para retirar la autorización de una instalación:

```sql
update public.invoice_mail_devices
set enabled = false
where user_id = 'UUID_DEL_DISPOSITIVO'::uuid;
```

La revocación bloquea nuevos envíos; un envío que ya estaba en curso podría completar. Si se borra la sesión o se reinstala la aplicación y aparece otro UUID, el administrador debe revisar y autorizar esa nueva identidad. No borres usuarios de Auth para intentar recuperar un correo pendiente: sus registros tienen eliminación en cascada y podrías perder la auditoría.

## 8. Qué muestra el botón

- **Enviando…**: solicitud en curso; el botón y el borrador quedan bloqueados.
- **Enviado**: Gmail aceptó el correo para los dos destinatarios y el resultado quedó registrado. Esto no garantiza que todos lo hayan leído ni dónde lo clasificará su buzón.
- **Volver a intentar**: el problema ocurrió antes de un envío confirmado o es un error de validación/configuración; lee el mensaje.
- **Revisar envío**: el resultado es incierto o ya había un intento en curso. El reenvío queda pausado para evitar duplicados.

Para el mismo usuario, la misma imagen binaria se identifica por SHA-256. Una segunda solicitud de una foto ya enviada devuelve su resultado anterior sin enviar otro correo. Editar el asunto no convierte esa foto en un envío nuevo. Fotografiar de nuevo el mismo papel produce otra imagen y puede enviar otro correo: no uses una nueva captura como forma de eludir un resultado incierto.

## 9. Diagnóstico y resultados inciertos

| Código o situación | Acción |
| --- | --- |
| `MAIL_NOT_CONFIGURED` | Revisa las variables públicas del entorno que compiló la aplicación. |
| `ANONYMOUS_SIGNIN_DISABLED` | Comprueba Anonymous Sign-Ins en el proyecto correcto. |
| `DEVICE_NOT_APPROVED` | Revisa el UUID y su fila de autorización; no se envió por esta solicitud. |
| `PHOTO_MISSING` / `PHOTO_REQUIRED` | La fotografía no está disponible; vuelve a capturarla si no existe un envío previo incierto. |
| `INVALID_SUBJECT` / `INVALID_MESSAGE` | Revisa asunto de hasta 300 caracteres y mensaje de hasta 10.000. |
| `IMAGE_TOO_LARGE` / `INVALID_IMAGE` | Revisa tamaño y formato de la fotografía. |
| `INVALID_SESSION` / `AUTH_UNAVAILABLE` | Revisa la sesión y los registros de Auth antes de cambiar autorizaciones. |
| `SERVICE_UNAVAILABLE` | Revisa la migración y los logs de la función; la preparación falló. |
| `DAILY_LIMIT_REACHED` | Se agotaron los 50 intentos en las últimas 24 horas; los intentos inciertos también cuentan. |
| `DELIVERY_IN_PROGRESS` | Existe otro intento con la misma foto; no fuerces otro envío. |
| `DELIVERY_UNCERTAIN` | Revisión administrativa del correo y la auditoría antes de cualquier reintento. |

Para examinar los intentos de un dispositivo, sin modificar nada:

```sql
select id, user_id, image_sha256, status, created_at, completed_at,
       sent_at, smtp_message_id, accepted, rejected, error_code
from public.invoice_mail_deliveries
where user_id = 'UUID_DEL_DISPOSITIVO'::uuid
order by created_at desc
limit 20;
```

Consulta también **Edge Functions → enviar-factura → Logs**. No pegues contraseñas ni tokens en los registros ni en capturas compartidas.

Un error durante SMTP se registra como `uncertain` de forma conservadora. Puede que el correo haya salido aunque el teléfono haya perdido la conexión. Si la base de datos no pudo guardar ese resultado, el registro puede permanecer en `sending`; tampoco permite repetir. Después de diez minutos, una nueva consulta del mismo envío convierte un `sending` antiguo en `uncertain`, sin reenviar.

El administrador debe revisar **Enviados** de `bodega@autthcomercial.cl`, la hora, los destinatarios, el adjunto y, cuando exista, `smtp_message_id`. Los campos `accepted` y `rejected` ayudan a identificar una aceptación parcial. Un `EAUTH` indica un problema de autenticación SMTP; `ETIMEDOUT` o `ESOCKET` requieren revisar la conexión; `RECORDING_FAILED` significa que el servidor de correo aceptó el envío pero falló su registro.

**No borres la fila, no cambies su hash y no cambies su estado para desbloquear el botón.** La función no ofrece reintentos automáticos para estados inciertos. Si se confirma una entrega, conserva y documenta la evidencia; si se verifica que no salió, la recuperación debe diseñarse con el administrador preservando el registro original. Esta guía no incluye una operación de borrado ni de reinicio porque podría duplicar un correo ya enviado.

## Estado de instalación

Estado comprobado el 24 de octubre de 2026:

- Código móvil, función y migración implementados localmente. La conexión pública del proyecto ya está guardada en `.env.local`.
- Pruebas de cliente, sesión, MIME y SQL realizadas sin SMTP. Exportación local de Android, iOS y web completada.
- Las consultas de solo lectura confirmaron los secretos `SMTP_USER` y `SMTP_PASS`, la función de prueba existente y Anonymous Sign-Ins desactivado.
- La revisión automática de permisos rechazó la activación remota por requerir autorización explícita del usuario. No se aplicó la migración, no se habilitaron sesiones anónimas y no se publicó `enviar-factura`.
- También están pendientes la configuración pública en EAS, la compilación actualizada y la aprobación del teléfono. La función de prueba conserva su configuración anterior; debe retirarse o renovar su token con autorización.

Los procedimientos anteriores describen la activación pendiente. No vuelvas a aplicar una migración sin comprobar primero su estado.
