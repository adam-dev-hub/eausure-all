<div align="center">

<img
  src="eausure_header.svg"
  alt="Logo officiel EauSûre"
/>

<br/>

<img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js" />
<img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
<img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
<img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel" />

</div>

# EauSûre Web Admin

Interface web d'administration de l'écosystème EauSûre.

Elle centralise les usages administrateur de la plateforme :
- authentification des administrateurs ;
- supervision du parc passerelles et nœuds ;
- consultation des métriques et statistiques d'évaluation d'efficacité ;
- gestion des utilisateurs ;
- pré-enregistrement du matériel ;
- gestion des releases firmware ;
- consultation de la documentation et des issues GitHub.

## Portée

L'écosystème EauSûre repose sur une fragmentation fonctionnelle des APIs. `Application_Web` n'embarque pas toute la logique métier : elle orchestre plusieurs services spécialisés via des routes proxy Next.js.

- **Auth API** : connexion administrateur et validation d'identité ;
- **Profile API** : lecture et mise à jour du profil administrateur ;
- **Admin API** : gestion des utilisateurs, pré-enregistrement et releases FUOTA ;
- **Hardware API** : supervision des gateways, nœuds, mesures et statistiques ;
- **GitHub API** : consultation des dépôts, fichiers de documentation et tickets techniques.

Dans cette architecture, `Application_Web` se concentre sur :
- l'expérience d'administration ;
- la composition des données issues des APIs ;
- la protection d'accès côté serveur ;
- la présentation des vues de diagnostic, supervision et déploiement.

## Stack

- Next.js 16 avec App Router
- React 19
- TypeScript
- Tailwind CSS
- NextAuth pour la session administrateur
- MongoDB pour les données locales web
- MQTT côté client pour le flux live
- intégration GitHub pour la documentation et les issues

## Écrans principaux

- `/fr/admin/signin`
- `/fr/admin`
- `/fr/admin/supervise-system`
- `/fr/admin/manage-users`
- `/fr/admin/pre-register`
- `/fr/admin/deploy-updates`
- `/fr/admin/diagnose-problems`

## APIs consommées

### Authentification

Le web admin s'appuie sur `Application_Auth_API` pour :
- `POST /auth/login`
- `GET /auth/me`

### Profil

Le web admin consomme `Application_Profile_API` via sa route proxy locale :
- `GET /api/user/me`
- `PATCH /api/user/me`

### Administration

Le web admin consomme `Application_Admin_API` pour :
- `GET /api/users`
- `PATCH /api/users/:id`
- `GET /api/provisioning/pre-register`
- `POST /api/provisioning/pre-register`
- `GET /api/fuota/releases`
- `POST /api/fuota/releases/inspect`
- `POST /api/fuota/releases/upload`

### Matériel et télémétrie

Le web admin consomme `Hardware_API` pour :
- `GET /api/sensor-data`
- `GET /api/sensor-data/latest`
- `GET /api/sensor-data/stats`
- `GET /api/gateways`
- `GET /api/gateways/:gatewayId/nodes`
- `POST /api/gateways/:gatewayId/nodes/:nodeId/measure`

### Diagnostic GitHub

Le web admin interroge l'API GitHub pour :
- lister les dépôts ;
- lire des fichiers de documentation ;
- lister, créer et commenter des issues.

## Variables d'environnement

Variables nécessaires au fonctionnement de base :
- `MONGODB_URI`
- `MONGODB_DB`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AUTH_API_URL` 
- `PROFILE_API_URL` 
- `HARDWARE_API_URL`
- `GITHUB_TOKEN`
- `GITHUB_ORG`
- `MAIL_PROVIDER`
- `MAIL_FROM`
- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `NEXT_PUBLIC_MQTT_BROKER_URL`
- `NEXT_PUBLIC_MQTT_TOPIC`

## Fonctionnement

### Authentification administrateur

L'authentification passe par NextAuth avec un provider `Credentials`.

Au login :
- le web appelle `Application_Auth_API` ;
- récupère un `accessToken` ;
- vérifie que le rôle retourné est bien `admin` ;
- stocke ensuite une session JWT côté web.

### Supervision matérielle

Les pages d'administration interrogent les routes proxy locales `/api/eausure/*`.

Ces routes :
- récupèrent la session administrateur ;
- transmettent le bearer token à `Hardware_API` ;
- normalisent les erreurs avant retour à l'UI.

### Gestion d'utilisateurs et FUOTA

Les pages `manage-users`, `pre-register` et `deploy-updates` passent par les routes proxy locales `/api/admin/*`.

Cette couche :
- protège l'accès côté serveur ;
- relaie les appels à `Application_Admin_API` ;
- évite d'exposer directement les URLs backend à l'interface.

### Diagnostic et documentation

La page `diagnose-problems` s'appuie sur des routes `/api/github/*` pour :
- parcourir des dépôts ;
- lire des fichiers Markdown ;
- suivre les issues techniques.

### Réinitialisation de mot de passe

Le web expose :
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

La demande crée un jeton temporaire en base, puis envoie un email via `Resend` ou `Brevo` selon la configuration.

