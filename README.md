# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Error de inicio: `Cannot find native module 'ExpoSecureStore'`

El APK instalado se compiló antes de añadir `expo-secure-store`. Los avisos de
rutas sin `default export` y el error de `ErrorBoundary` pueden ser consecuencia
de ese mismo fallo al importar las pantallas.

La app carga ahora el almacenamiento seguro al solicitar la sesión para enviar
un correo, de modo que su ausencia no impide abrir las pantallas. Para habilitar
el envío seguro en Android, genera e instala una nueva compilación de desarrollo:

```bash
npx eas-cli@latest build --platform android --profile development
```

Después de instalar el APK resultante, inicia Metro y conecta la app:

```bash
npx expo start --dev-client --clear
```

Recargar JavaScript o limpiar la caché no añade módulos nativos al APK. No hace
falta crear ni editar `android/` o `ios/` manualmente. Consulta la
[documentación de Expo sobre recompilar el cliente](https://docs.expo.dev/develop/development-builds/use-development-builds/#rebuild-a-development-build)
y la [configuración del correo](docs/EMAIL_SETUP.md).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
