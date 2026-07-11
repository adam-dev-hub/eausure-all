<div align="center">

<img
  src="eausure_header.svg"
  alt="Logo officiel EauSûre"
/>

<br/>

<img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
<img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
<img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
<img src="https://img.shields.io/badge/Passport-1F2937?style=for-the-badge&logo=passport&logoColor=34E27A" alt="Passport" />
<img src="https://img.shields.io/badge/JWT-111827?style=for-the-badge&logo=jsonwebtokens&logoColor=white" alt="JWT" />

</div>

# EauSûre Auth API

API d'authentification et d'identité pour l'écosystème EauSûre.

Elle est consommée par :
- `Application_Web` pour l'authentification via NextAuth ;
- `Application_Mobile` pour la connexion locale, l'inscription, la restauration de session et les entrées OAuth.

## Portée

L'écosystème backend d'EauSûre repose sur une fragmentation fonctionnelle des APIs. Chaque service couvre un périmètre précis, mais l'ensemble fonctionne de manière complémentaire :
- **Auth API** : authentification, identité, jetons d'accès et OAuth ;
- **Profile API** : données de profil et informations utilisateur ;
- **Admin API** : administration, pré-enregistrement et gestion des releases firmware ;
- **Hardware API** : opérations techniques liées aux passerelles, nœuds et échanges terrain.

Dans cette architecture, `Application_Auth_API` se concentre sur son rôle d'identité :
- **Connexion locale** : vérification email/mot de passe et émission du JWT ;
- **Inscription locale** : création de compte utilisateur ;
- **OAuth** : Google et GitHub, en mode login ou register ;
- **Hydratation de session** : récupération du profil à partir du token ;
- **Provisioning token** : génération d'un jeton court pour le provisioning matériel.

## Stack

- Express
- MongoDB avec Mongoose
- JWT pour les jetons d'accès
- Passport pour OAuth Google et GitHub
- bcryptjs pour le hash des mots de passe

## Consommation de l'API

### Depuis `Application_Web`

Le code de `Application_Web` consomme directement :
- `POST /api/auth/login`
- `GET /api/auth/me`

### Depuis `Application_Mobile`

Le code de `Application_Mobile` consomme directement :
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `GET /api/auth/google`
- `GET /api/auth/google/register`
- `GET /api/auth/github`
- `GET /api/auth/github/register`

## Routes exposées

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `GET /api/auth/google/register`
- `GET /api/auth/google/register/callback`
- `GET /api/auth/github`
- `GET /api/auth/github/register`
- `GET /api/auth/github/callback`
- `GET /api/auth/me`
- `POST /api/auth/provisioning-token`
- `GET /`

## Variables d'environnement

Variables nécessaires au fonctionnement de base :
- `MONGO_URI`
- `JWT_SECRET`
- `PORT`

Variables utilisées pour OAuth et les redirections :
- `API_URL`
- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## Fonctionnement

### Connexion locale

`POST /api/auth/login` :
- cherche l'utilisateur par email ;
- vérifie le mot de passe avec `bcryptjs` ;
- met à jour `lastLogin` ;
- retourne un JWT valable `7d`.

### Inscription locale

`POST /api/auth/register` :
- vérifie que l'email n'existe pas déjà ;
- hash le mot de passe ;
- crée un utilisateur local ;
- retourne un succès simple sans token immédiat.

### OAuth

Les stratégies Google et GitHub sont activées seulement si les variables d'environnement correspondantes sont présentes.

Le code distingue deux intentions :
- **login**
- **register**

Pour GitHub, une seule callback est utilisée et le mode est distingué via `state`.

### Hydratation de session

`GET /api/auth/me` :
- exige un header `Authorization: Bearer <token>` ;
- vérifie le JWT ;
- retourne l'utilisateur sans le champ `password`.

### Provisioning token

`POST /api/auth/provisioning-token` :
- exige un utilisateur authentifié ;
- valide `gatewayHardwareId` ;
- génère un JWT court de type `gateway_provisioning` ;
- retourne le token avec `expiresIn`.


