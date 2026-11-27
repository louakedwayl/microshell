# minishell

minishell est une application mobile Expo pour ouvrir un terminal SSH vers ses propres VPS, avec un explorateur/éditeur de fichiers local et une interface sombre inspirée d’Oh My Zsh.

## État actuel

- Expo SDK 58 pour iOS et Android.
- Connexion SSH native avec terminal PTY, redimensionnement, mot de passe ou clé privée.
- Vérification interactive de l’empreinte de clé hôte. Une clé modifiée est refusée par défaut.
- Identifiants conservés uniquement dans SecureStore quand l’utilisateur choisit de les mémoriser.
- Fichiers locaux persistants dans le dossier Documents de l’app, éditeur UTF-8 limité à 512 Ko.
- Le moteur Linux local, `apt`/`sudo` et Oh My Zsh embarqué sont encore la prochaine étape. L’interface ne simule pas un shell local.

## Développement

```sh
npm install
npm run typecheck
node --import tsx --test tests/files.test.ts tests/profiles.test.ts
npx expo start
```

Le module SSH natif n’est pas disponible dans Expo Go. Utiliser un development build :

```sh
npx expo install expo-dev-client
eas build --platform android --profile development
eas build --platform ios --profile development
```

La connexion SSH utilise `@osuki-dev/react-native-ssh` et nécessite une reconstruction native après son installation. Le composant web affiche l’interface mais refuse explicitement les connexions SSH.

## Limites importantes

Le terminal actuel envoie les commandes au VPS connecté. Il ne prétend pas fournir un Linux local tant que le moteur d’émulation et sa persistance n’ont pas été validés sur iOS et Android. Les fichiers locaux de l’app ne sont pas automatiquement ceux du VPS : le transfert SFTP sera ajouté avec une vérification de chemin et de conflit.
