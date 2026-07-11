<div align="center">

<img
  src="eausure_header.svg"
  alt="Logo officiel EauSûre"
/>

<br/>

<img src="https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white" alt="Expo" />
<img src="https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React Native" />
<img src="https://img.shields.io/badge/Expo_Router-000000?style=for-the-badge&logo=expo&logoColor=white" alt="Expo Router" />
<img src="https://img.shields.io/badge/MQTT-660066?style=for-the-badge&logo=eclipsemosquitto&logoColor=white" alt="MQTT" />
<img src="https://img.shields.io/badge/LoRaWAN-0F172A?style=for-the-badge&logoColor=white" alt="LoRaWAN" />

</div>

# EauSûre Mobile

Application mobile EauSûre pour l'exploitation terrain et le suivi temps réel du parc IoT.

Elle permet :
- l'authentification utilisateur ;
- le suivi des mesures d'eau en temps réel ;
- la supervision des gateways et des nœuds ;
- le provisioning BLE et Wi-Fi des passerelles ;
- l'association de nœuds ;
- la configuration matérielle ;
- les alertes locales et le suivi MQTT.

## Portée

L'écosystème EauSûre repose sur une fragmentation fonctionnelle des APIs. `Application_Mobile` s'appuie sur plusieurs services complémentaires :

- **Auth API** : connexion, identité et token d'accès ;
- **Profile API** : profil utilisateur et préférences ;
- **Admin API** : pré-enregistrement et opérations administratives ciblées ;
- **Hardware API** : provisioning, matériel, télémétrie, pairing et commandes terrain.

Dans cette architecture, `Application_Mobile` se concentre sur :
- l'expérience utilisateur mobile ;
- les workflows terrain autour du provisioning et de l'association ;
- la consommation temps réel des données MQTT ;
- la consultation et la configuration du matériel.

## Stack

- Expo 54
- React Native 0.81
- Expo Router
- Expo Secure Store
- Expo Notifications
- Expo Location
- Expo Video
- BLE avec `react-native-ble-plx`
- MQTT avec `paho-mqtt`
- visualisation mobile avec Skia et `react-native-gifted-charts`

## Écrans principaux

- onboarding
- login et register
- tableau de bord temps réel
- télémétrie détaillée
- matériel
- scan / provisioning
- paramètres utilisateur

## APIs consommées

### Authentification

L'application mobile consomme `Application_Auth_API` pour :
- `POST /auth/login`
- `POST /auth/register`
- `GET /auth/me`
- les entrées OAuth et de redirection associées

### Profil

L'application mobile consomme `Application_Profile_API` pour :
- `GET /api/me`
- `PUT /api/me`

### Matériel et télémétrie

L'application mobile consomme `Hardware_API` pour :
- `GET /api/sensor-data`
- `GET /api/sensor-data/latest`
- `GET /api/sensor-data/stats`
- `GET /api/gateways`
- `GET /api/gateways/:gatewayId/nodes`
- `GET /api/gateways/:gatewayId/commands/:commandId`
- `POST /api/gateways/provisioning/session`
- `GET /api/gateways/:gatewayId/pairing/scan`
- `GET /api/gateways/:gatewayId/pairing/session/:sessionId`
- `POST /api/gateways/:gatewayId/pairing/confirm-candidate`
- `POST /api/gateways/:gatewayId/pairing/cancel`
- `PUT /api/gateways/:gatewayId/location`
- `PUT /api/gateways/:gatewayId/nodes/:nodeId/config`
- `DELETE /api/gateways/:gatewayId/nodes/:nodeId`
- `POST /api/gateways/:gatewayId/firmware-update`
- `POST /api/gateways/:gatewayId/nodes/:nodeId/firmware-update`

## Variables d'environnement

Variables nécessaires :
- `EXPO_PUBLIC_AUTH_API_URL`
- `EXPO_PUBLIC_PROFILE_API_URL`
- `EXPO_PUBLIC_ADMIN_API_URL`
- `EXPO_PUBLIC_HARDWARE_API_URL`
- `EXPO_PUBLIC_MAPBOX_TOKEN`
- `EXPO_PUBLIC_MQTT_BROKER_URL`
- `EXPO_PUBLIC_MQTT_USERNAME`
- `EXPO_PUBLIC_MQTT_PASSWORD`
- `EXPO_PUBLIC_MQTT_TOPIC`

## Fonctionnement

### Authentification mobile

Le token utilisateur est :
- obtenu via `Application_Auth_API` ;
- stocké localement avec `Expo Secure Store` ;
- réutilisé ensuite pour les appels profil, matériel et provisioning.

### Temps réel MQTT

Le contexte `MqttContext` :
- ouvre une connexion au broker ;
- s'abonne au topic configuré ;
- reçoit les données live des nœuds ;
- alimente ensuite les vues temps réel de l'application.

### Provisioning passerelle

Le flux de scan :
- démarre une session sécurisée côté `Hardware_API` ;
- échange les informations de provisioning via BLE ;
- transmet les identifiants Wi-Fi et les secrets nécessaires ;
- laisse ensuite la passerelle finaliser son enregistrement cloud.

### Pairing et configuration

L'application mobile permet :
- de scanner les nœuds disponibles ;
- de confirmer un candidat d'association ;
- de suivre la session d'association ;
- de mettre à jour la configuration d'un nœud ;
- de déclencher certaines opérations matérielles ciblées.

### Alertes et notifications

L'application :
- demande la permission de notifications ;
- calcule les alertes locales à partir des mesures ;
- affiche des événements critiques et de supervision ;
- utilise l'icône Android déclarée dans `app.json`.


