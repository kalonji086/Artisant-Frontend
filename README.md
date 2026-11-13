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

## Mises à jour de l’application (OTA)

Les versions publiées sur le canal `production` vérifient les mises à jour EAS au démarrage et lorsque l’application revient au premier plan. Une mise à jour JavaScript compatible se télécharge en arrière-plan, sans interrompre la session, puis s’applique au prochain lancement complet de l’application.

Pour publier une mise à jour de contenu ou de code JavaScript sur la production :

```bash
npx eas-cli update --channel production --message "Description de la mise à jour" --environment production
```

Le canal `preview` sert aux builds de test. Testez-y une mise à jour avant de la publier sur `production` :

```bash
npx eas-cli update --channel preview --message "Test de la mise à jour" --environment preview
```

**Première activation :** EAS Update nécessite `expo-updates` dans le binaire installé. Après cette configuration, créez et distribuez une nouvelle build via les boutiques (ou votre canal de distribution interne). Les personnes qui utilisent encore une ancienne build sans EAS Update doivent installer cette build une fois ; les mises à jour OTA fonctionneront ensuite.

Les changements qui nécessitent du code natif — par exemple l’ajout d’un module natif, une permission ou une configuration Android/iOS — requièrent toujours une nouvelle build. L’empreinte (`runtimeVersion: fingerprint`) empêche de distribuer une mise à jour OTA à un binaire natif incompatible.

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
