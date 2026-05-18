# EauSure Admin API

API dédiée à l’administration web:
- support technique: tickets + chat
- pré-enregistrement des équipements
- gestion utilisateurs et rôles
- releases et déploiements FUOTA
- statistiques agrégées avec garde-fous de confidentialité

## Variables d'environnement

- `MONGO_URI`
- `JWT_SECRET`
- `PORT` facultatif
- `CORS_ORIGIN` facultatif
- `HARDWARE_API_URL` ex: `https://eau-sure-api.vercel.app`
- `AUTH_API_URL` facultatif
- `PROFILE_API_URL` facultatif
- `STATS_MIN_GROUP_SIZE` défaut `5`
- `STATS_COUNT_ROUNDING` défaut `5`
- `STATS_PERCENT_ROUNDING` défaut `5`

## Endpoints principaux

- `GET /api/health`
- `GET /api/users`
- `PATCH /api/users/:id`
- `POST /api/provisioning/pre-register`
- `GET /api/provisioning/pre-register`
- `GET /api/tickets`
- `POST /api/tickets`
- `GET /api/tickets/mine`
- `PATCH /api/tickets/:id`
- `DELETE /api/tickets/:id`
- `POST /api/chat/request`
- `GET /api/chat/mine`
- `GET /api/chat/waiting`
- `GET /api/chat/active`
- `GET /api/chat/admin`
- `POST /api/chat/accept`
- `POST /api/chat/moderate`
- `POST /api/chat/send`
- `POST /api/chat/typing`
- `POST /api/chat/reply`
- `GET /api/fuota/releases`
- `POST /api/fuota/releases`
- `PATCH /api/fuota/releases/:id`
- `GET /api/fuota/deployments`
- `POST /api/fuota/deploy`
- `GET /api/stats/overview`
- `POST /api/stats/snapshots/collect`
- `GET /api/stats/snapshots`

## Confidentialité des statistiques

Les stats exposées ici suivent trois règles:
- pas d'identifiant utilisateur ni de texte brut de support dans les agrégats
- masquage des groupes avec cardinalité `< STATS_MIN_GROUP_SIZE`
- arrondi des comptes et pourcentages pour réduire la ré-identification

## Lancement local

```bash
cd Application_Admin_API
npm install
npm run dev
```
