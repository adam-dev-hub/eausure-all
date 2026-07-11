<div align="center">

<img
  src="eausure_header.svg"
  alt="Logo officiel EauSûre"
/>

<br/>

<img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
<img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
<img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
<img src="https://img.shields.io/badge/JWT-111827?style=for-the-badge&logo=jsonwebtokens&logoColor=white" alt="JWT" />

</div>

# EauSûre Profile API

API de profil et de préférences utilisateur pour l'écosystème EauSûre.

Elle est consommée par :
- `Application_Web` pour lire et mettre à jour le profil via une route proxy Next ;
- `Application_Mobile` pour charger et modifier le profil utilisateur directement.

## Portée

L'écosystème backend d'EauSûre repose sur une fragmentation fonctionnelle des APIs. Chaque service couvre un périmètre précis, mais l'ensemble fonctionne de manière complémentaire :
- **Profile API** : profil utilisateur, préférences et fusion des données `users` + `userProfiles` ;
- **Auth API** : authentification, identité, jetons d'accès et OAuth ;
- **Admin API** : administration, pré-enregistrement et gestion des releases firmware ;
- **Hardware API** : opérations techniques liées aux passerelles, nœuds et échanges terrain.

Dans cette architecture, `Application_Profile_API` se concentre sur :
- **lecture du profil enrichi** ;
- **mise à jour du profil et des préférences** ;
- **provisionnement automatique d'un profil vide si nécessaire**.

## Stack

- Express
- MongoDB avec Mongoose
- JWT pour valider le token entrant
- logging applicatif détaillé avec `LOG_LEVEL`

## Consommation de l'API

### Depuis `Application_Web`

Le code de `Application_Web` consomme :
- `GET /api/me`
- `PUT /api/me`

### Depuis `Application_Mobile`

Le code de `Application_Mobile` consomme :
- `GET /api/me`
- `PUT /api/me`

## Variables d'environnement

Variables nécessaires au fonctionnement de base :
- `MONGO_URI`
- `JWT_SECRET`
- `PORT`
- `LOG_LEVEL`

Valeurs attendues pour `LOG_LEVEL` dans le code :
- `debug`
- `info`
- `warn`
- `error`
## Fonctionnement

### Authentification

Toutes les routes sensibles exigent un header :

```http
Authorization: Bearer <token>
```

Le middleware accepte plusieurs identifiants possibles dans le payload JWT :
- `email`
- `id`
- `userId`
- `sub`

Le champ résolu est stocké dans `req.userIdentifier`.

### Route `/api/me`

`GET /api/me` :
- résout d'abord l'utilisateur dans la collection `users` ;
- tente la recherche par email ;
- bascule sur `_id` si nécessaire ;
- charge ensuite le document `userProfiles` ;
- crée un profil vide si absent ;
- retourne une vue fusionnée entre `users` et `userProfiles`.

`PUT /api/me` :
- met à jour certains champs de `users` ;
- met à jour les préférences et le fuseau dans `userProfiles` ;
- retourne ensuite une réponse fusionnée.

Champs utilisateur pris en charge :
- `name`
- `avatar`
- `image`
- `organization`
- `phone`

Préférences prises en charge :
- `preferences.theme`
- `preferences.language`
- `preferences.notifications.*`
- `preferences.units.*`
- `preferences.security.*`
- `timezone`

