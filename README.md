<div align="center">

<img
  src="eausure_header.svg"
  alt="Logo officiel EauSûre"
/>

<br/>

<img src="https://img.shields.io/badge/IoT-0F172A?style=for-the-badge&logo=raspberrypi&logoColor=white" alt="IoT" />
<img src="https://img.shields.io/badge/Embedded-1D4ED8?style=for-the-badge&logo=espressif&logoColor=white" alt="Embedded" />
<img src="https://img.shields.io/badge/Web-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Web" />
<img src="https://img.shields.io/badge/Mobile-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="Mobile" />
<img src="https://img.shields.io/badge/System%20Engineering-334155?style=for-the-badge&logo=autodesk&logoColor=white" alt="System Engineering" />

</div>

# EauSûre

Écosystème IoT de surveillance intelligente de la qualité de l'eau.

L'organisation regroupe les différents sous-systèmes de la solution :
- firmware embarqué du nœud de mesure et de la passerelle ;
- APIs fragmentées par responsabilité métier ;
- application mobile terrain ;
- interface web d'administration ;
- conception électronique, mécanique et modélisation système ;
- documentation technique et rapport d'ingénierie.

## Portée

EauSûre est conçu comme une plateforme complète, allant du matériel embarqué jusqu'aux interfaces de supervision.

- **Nœud de mesure** : acquisition des paramètres de qualité de l'eau, détection d'événements et communication LoRa sécurisée ;
- **Passerelle IoT** : jonction entre le terrain, le cloud, MQTT et les applications clientes ;
- **Backend fragmenté** : authentification, profil, administration, télémétrie et orchestration matérielle ;
- **Applications clientes** : usage mobile sur le terrain et supervision administrateur sur le web ;
- **Conception système** : SysML, PCB, modélisation 3D et documentation de projet.

## Dépôts principaux

- `EauSure_Firmware` : firmware du nœud de mesure et de la passerelle ;
- `EauSure_User_MobileApp` : application mobile terrain ;
- `EauSure_Admin_Dashboard_Website` : portail web d'administration ;
- `EauSure_Hardware_API` : orchestration matérielle et télémétrie ;
- `EauSure_Admin_API` : administration, pré-enregistrement et releases firmware ;
- `EauSure_Auth_API` : authentification et identité ;
- `EauSure_Profile_API` : profil utilisateur ;
- `EauSure_PCB` : conception électronique ;
- `EauSure_3D` : conception mécanique.

## Rapport

- PDF du rapport d'ingénierie : [Consulter le rapport EauSûre]([https://1drv.ms/b/c/14e06c77a7dac468/IQCNwBGUbkDMTaTTdn0Hem94AVIdE5QvMWrk3accX1DUpic?e=Vb73pf])

## Architecture

- **Terrain** : nœud de mesure + passerelle ;
- **Communication** : LoRa, BLE, Wi-Fi, MQTT, HTTPS ;
- **Cloud** : APIs spécialisées, base de données, stockage firmware ;
- **Clients** : application mobile et portail web administrateur.

## Stack

- ESP32 / FreeRTOS
- LoRa / BLE / Wi-Fi / MQTT
- Node.js / Express / TypeScript
- Next.js / React Native / Expo
- MongoDB
- KiCad / Fusion 360 / SysML / PlantUML

## Finalité

L'objectif d'EauSûre est de proposer une chaîne cohérente de surveillance de la qualité de l'eau, couvrant :
- la mesure embarquée ;
- la communication sécurisée ;
- la supervision en temps réel ;
- la maintenance et les mises à jour distantes ;
- la traçabilité technique de bout en bout.
