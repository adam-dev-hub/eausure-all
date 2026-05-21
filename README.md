<div align="center">
  <img src="eausure_official_logo.svg" alt="Logo officiel EauSûre" width="96" />
</div>

```text
███████╗ █████╗ ██╗   ██╗███████╗██╗   ██╗██████╗ ███████╗
██╔════╝██╔══██╗██║   ██║██╔════╝██║   ██║██╔══██╗██╔════╝
█████╗  ███████║██║   ██║███████╗██║   ██║██████╔╝█████╗
██╔══╝  ██╔══██║██║   ██║╚════██║██║   ██║██╔══██╗██╔══╝
███████╗██║  ██║╚██████╔╝███████║╚██████╔╝██║  ██║███████╗
╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
```

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Vercel%20Blob-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel Blob" />
</div>

# EauSûre Admin API

API minimale d'administration pour EauSure.

Elle expose ces routes utilisées par `Application_Web` pour :
- gérer les utilisateurs ;
- pré-enregistrer les équipements ;
- inspecter, publier et lister les releases firmware.

## Portée

L'écosystème backend d'EauSûre repose sur une **fragmentation fonctionnelle des APIs**. Chaque service couvre un périmètre précis, mais l'ensemble fonctionne de manière complémentaire :
- **Admin API** : administration, pré-enregistrement et gestion des releases firmware ;
- **Hardware API** : opérations techniques liées aux passerelles, nœuds et échanges terrain ;
- **Profile API** : données de profil et informations liées aux utilisateurs ;
- **Auth API** : authentification, identité et sécurité d'accès.

Dans cette architecture, `Application_Admin_API` n'a pas vocation à centraliser toute la logique métier. Elle se concentre sur son rôle d'administration :
- **Utilisateurs** : liste, filtres, mise à jour et note administrateur ;
- **Pré-enregistrement matériel** : passerelles et nœuds avant déploiement ;
- **Firmware** : inspection et versionning de l'inventaire `.bin` et publication des releases.

## Stack

- Express
- MongoDB avec Mongoose sur VM AZUR
- JWT pour l'authentification
- Vercel Blob pour le stockage des binaires
- appel vers `Hardware_API` pour le pré-enregistrement

## Routes exposées

- `GET /api/users`
- `PATCH /api/users/:id`
- `POST /api/provisioning/pre-register`
- `GET /api/provisioning/pre-register`
- `GET /api/fuota/releases`
- `POST /api/fuota/releases/inspect`
- `POST /api/fuota/releases/upload`

## Variables d'environnement

- `MONGO_URI`
- `JWT_SECRET`
- `PORT`
- `CORS_ORIGIN`
- `HARDWARE_API_URL`

## Fonctionnement

### Utilisateurs

`GET /api/users` supporte la pagination et les filtres `role`, `status` et `search`.

`PATCH /api/users/:id` permet de modifier :
- `role`
- `status`
- `adminNotes`

### Pré-enregistrement

`POST /api/provisioning/pre-register` :
- valide `kind` (`gateway` ou `node`) ;
- vérifie la longueur du `deviceSecret` ;
- stocke un hash SHA-256 du secret ;
- transmet ensuite la demande à `Hardware_API`.

### Firmware

`POST /api/fuota/releases/inspect` :
- lit le binaire ;
- tente de détecter la version ;
- propose un auto-incrément si nécessaire ;
- retourne le `md5`, la taille et l'origine de la version retenue.

`POST /api/fuota/releases/upload` :
- prépare le binaire ;
- publie le fichier dans `Vercel Blob`;
- enregistre la release en base.

