import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Bell,
  Building2,
  Camera,
  ChevronRight,
  Cpu,
  Download,
  Edit3,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  User,
  Wifi,
  AlertTriangle,
  BookOpen,
  Bug,
  Github,
  ExternalLink,
} from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { DEFAULT_THRESHOLDS } from '../../utils/alertUtils';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { getUserGateways, getGatewayNodes, getGatewayCommandStatus, triggerGatewayFirmwareUpdate, triggerNodeFirmwareUpdate } from '../../api/pairingClient';
import { getActiveFirmwareReleases } from '../../api/adminClient';
import UserAvatar from '../../components/UserAvatar';
import WaterWaveBg from '../../components/WaterWaveBg';
import CustomModal from '../../components/CustomModal';
import {
  loadUpdateTrackingSessions,
  saveUpdateTrackingSessions,
  clearUpdateTrackingSessions,
} from '../../utils/updateTrackingStorage';

const COLORS = {
  background: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  textSub: '#64748b',
  border: '#e2e8f0',
  primary: '#0ea5e9',
  primaryDark: '#0369a1',
  success: '#22c55e',
  successSoft: '#dcfce7',
  warning: '#f59e0b',
  warningSoft: '#fef3c7',
  danger: '#ef4444',
  dangerSoft: '#fee2e2',
};

const HERO_CARD_HEIGHT = 200;
const UPDATE_POLL_MS = 5000;
const UPDATE_POLL_BACKOFF_429_MS = 30000;
const UPDATE_SNAPSHOT_REFRESH_MS = 30000;
const UPDATE_TIMEOUT_MS = 45 * 60 * 1000;
const UPDATE_ACK_TIMEOUT_GATEWAY_MS = 5 * 60 * 1000;
const UPDATE_ACK_TIMEOUT_NODE_MS = 45 * 60 * 1000;
const GATEWAY_UPDATE_APPLY_TIMEOUT_MS = 12 * 60 * 1000;

function compareVersion(current, target) {
  if (!current || !target) return 0;
  if (current === target) return 0;
  const normalize = (value) =>
    String(value)
      .replace(/^v/i, '')
      .split(/[^0-9a-zA-Z]+/)
      .filter(Boolean)
      .map((part) => (Number.isNaN(Number(part)) ? part : Number(part)));

  const a = normalize(current);
  const b = normalize(target);
  const max = Math.max(a.length, b.length);

  for (let i = 0; i < max; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left === right) continue;
    if (typeof left === 'number' && typeof right === 'number') {
      return left < right ? -1 : 1;
    }
    return String(left).localeCompare(String(right));
  }

  return 0;
}

function getInstalledVersion(device) {
  return device?.status?.firmwareVersion || '';
}

function hasPendingUpdate(currentVersion, targetVersion) {
  if (!targetVersion) return false;
  if (!currentVersion) return true;
  return compareVersion(currentVersion, targetVersion) < 0;
}

function buildTrackingKey(targetType, gatewayId, nodeId = null) {
  return targetType === 'gateway'
    ? `gw:${gatewayId}`
    : `node:${gatewayId}:${nodeId}`;
}

function describeTrackingSession(session, installedVersion) {
  if (!session) {
    return null;
  }

  if (installedVersion && installedVersion === session.targetVersion) {
    return {
      badgeLabel: 'Mise à jour réussie',
      badgeTone: 'success',
      actionLabel: 'Version appliquée',
      actionDisabled: true,
      statusNote: `Version ${installedVersion} installée avec succès.`,
      terminal: true,
    };
  }

  if (session.state === 'failed' || session.state === 'expired') {
    return {
      badgeLabel: session.state === 'expired' ? 'Délai dépassé' : 'Échec',
      badgeTone: 'warning',
      actionLabel: 'Relancer la mise à jour',
      actionDisabled: false,
      statusNote: session.message || 'La mise à jour n’a pas abouti.',
      terminal: true,
    };
  }

  if (session.state === 'acked') {
    return {
      badgeLabel: 'Transfert en cours',
      badgeTone: 'neutral',
      actionLabel: 'Traitement en cours',
      actionDisabled: true,
      statusNote: session.message || (
        session.targetType === 'gateway'
          ? 'Firmware téléchargé — redémarrage passerelle imminent.'
          : 'Image sur la passerelle — transfert LoRa FUOTA sur les prochains cycles.'
      ),
      terminal: false,
    };
  }

  if (session.state === 'sent') {
    return {
      badgeLabel: 'Attente passerelle',
      badgeTone: 'neutral',
      actionLabel: 'Suivi en cours',
      actionDisabled: true,
      statusNote: session.message || 'La commande a été envoyée. Attente de confirmation par la passerelle.',
      terminal: false,
    };
  }

  return {
    badgeLabel: 'File d’attente',
    badgeTone: 'neutral',
    actionLabel: 'Préparation',
    actionDisabled: true,
    statusNote: session.message || 'La mise à jour est en cours de préparation.',
    terminal: false,
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const { logout, user } = useAuth();
  const { profile, updateProfile, loading: profileLoading, fetchProfile } = useProfile();
  const [editing, setEditing] = useState(false);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingFirmware, setRefreshingFirmware] = useState(false);
  const [loadingFirmware, setLoadingFirmware] = useState(true);
  const [triggeringKey, setTriggeringKey] = useState(null);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({ message: '', type: 'success' });

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    organization: '',
    email: '',
    avatar: '',
    push: true,
    criticalOnly: false,
    thresholds: { ...DEFAULT_THRESHOLDS },
  });
  const [firmwareState, setFirmwareState] = useState({
    gateways: [],
    nodes: [],
    latestGatewayRelease: null,
    latestNodeRelease: null,
  });
  const [updateTracking, setUpdateTracking] = useState({});
  const [trackingHydrated, setTrackingHydrated] = useState(false);
  const [selectedHardwareType, setSelectedHardwareType] = useState(null);
  const [heroCardWidth, setHeroCardWidth] = useState(0);
  const lastFirmwareSnapshotAtRef = useRef(0);
  const trackingPollTimerRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const persisted = await loadUpdateTrackingSessions();
      if (!active) return;
      setUpdateTracking(persisted);
      setTrackingHydrated(true);
      console.log('[Settings][Firmware][TrackingRestore]', persisted);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!trackingHydrated || selectedHardwareType) return;
    const activeSessions = Object.values(updateTracking).filter((session) => session && !session.terminal);
    const preferredType = activeSessions[0]?.targetType || null;
    if (preferredType) {
      setSelectedHardwareType(preferredType);
    }
  }, [trackingHydrated, updateTracking, selectedHardwareType]);

  useEffect(() => {
    void saveUpdateTrackingSessions(updateTracking);
  }, [updateTracking]);

  const hasChanges = useMemo(() => {
    if (!profile) return false;
    const initialName = profile.name || '';
    const initialPhone = profile.phone || '';
    const initialOrganization = profile.organization || '';
    const initialAvatar = profile.avatar || profile.image || '';
    const initialPush = profile.preferences?.notifications?.push ?? true;
    const initialCriticalOnly = profile.preferences?.notifications?.criticalOnly ?? false;
    const initialThresholds = profile.preferences?.alertThresholds ?? DEFAULT_THRESHOLDS;

    return (
      formData.name !== initialName ||
      formData.phone !== initialPhone ||
      formData.organization !== initialOrganization ||
      formData.avatar !== initialAvatar ||
      formData.push !== initialPush ||
      formData.criticalOnly !== initialCriticalOnly ||
      JSON.stringify(formData.thresholds) !== JSON.stringify({ ...DEFAULT_THRESHOLDS, ...initialThresholds })
    );
  }, [formData, profile]);

  const showModal = (message, type = 'success') => {
    setModalContent({ message, type });
    setModalVisible(true);
  };

  const dismissUpdateTracking = (key, reason = 'Suivi abandonné manuellement.') => {
    setUpdateTracking((prev) => {
      const session = prev[key];
      if (!session) return prev;
      return {
        ...prev,
        [key]: {
          ...session,
          state: 'expired',
          message: reason,
          updatedAt: Date.now(),
          terminal: true,
        },
      };
    });
  };

  useEffect(() => {
    if (!profile) return;

    setFormData({
      name: profile.name || '',
      phone: profile.phone || '',
      organization: profile.organization || '',
      email: profile.email || '',
      avatar: profile.avatar || profile.image || '',
      push: profile.preferences?.notifications?.push ?? true,
      criticalOnly: profile.preferences?.notifications?.criticalOnly ?? false,
      thresholds: { ...DEFAULT_THRESHOLDS, ...(profile.preferences?.alertThresholds ?? {}) },
    });
  }, [profile]);

  const fetchFirmwareSnapshot = async () => {
    const [gatewaysRes, releasesRes] = await Promise.all([
      getUserGateways(),
      getActiveFirmwareReleases(),
    ]);

    const gateways = gatewaysRes?.success ? gatewaysRes.data || [] : [];
    const releases = releasesRes?.success ? releasesRes.data || [] : [];
    const latestGatewayRelease = releases.find((release) => release.platform === 'gateway');
    const latestNodeRelease = releases.find((release) => release.platform === 'node');

    console.log('[Settings][Firmware][Raw]', {
      gatewaysCount: gateways.length,
      releasesCount: releases.length,
      latestGatewayRelease: latestGatewayRelease
        ? {
          version: latestGatewayRelease.version,
          channel: latestGatewayRelease.channel,
          status: latestGatewayRelease.status,
        }
        : null,
      latestNodeRelease: latestNodeRelease
        ? {
          version: latestNodeRelease.version,
          channel: latestNodeRelease.channel,
          status: latestNodeRelease.status,
        }
        : null,
    });

    const nodeGroups = await Promise.all(
      gateways.map(async (gateway) => {
        const nodesRes = await getGatewayNodes(gateway._id);
        const nodes = nodesRes?.success ? nodesRes.data || [] : [];
        return nodes.map((node) => ({
          ...node,
          gatewayDbId: gateway._id,
          gatewayName: gateway.name || gateway.gatewayId,
        }));
      })
    );

    return {
      gateways,
      nodes: nodeGroups.flat(),
      latestGatewayRelease: latestGatewayRelease || null,
      latestNodeRelease: latestNodeRelease || null,
    };
  };

  const loadFirmwareState = async () => {
    setLoadingFirmware(true);
    try {
      const snapshot = await fetchFirmwareSnapshot();
      setFirmwareState(snapshot);
      lastFirmwareSnapshotAtRef.current = Date.now();

      console.log('[Settings][Firmware][Mapped]', {
        gateways: snapshot.gateways.map((gateway) => ({
          id: gateway._id,
          gatewayId: gateway.gatewayId,
          name: gateway.name,
          firmwareVersion: gateway.status?.firmwareVersion || '',
        })),
        nodes: snapshot.nodes.map((node) => ({
          nodeId: node.nodeId,
          gatewayDbId: node.gatewayDbId,
          gatewayName: node.gatewayName,
          firmwareVersion: node.status?.firmwareVersion || '',
        })),
      });
    } catch (error) {
      console.error('[Settings][Firmware]', error);
      Alert.alert('Erreur', 'Impossible de charger l’état des mises à jour.');
    } finally {
      setLoadingFirmware(false);
    }
  };

  useEffect(() => {
    void loadFirmwareState();
  }, []);

  const handleAvatarChange = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const dataUri = asset.base64
          ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;
        setFormData((prev) => ({ ...prev, avatar: dataUri }));
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible de charger l'image");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const result = await updateProfile({
      name: formData.name,
      phone: formData.phone,
      organization: formData.organization,
      avatar: formData.avatar,
      image: formData.avatar,
      preferences: {
        notifications: {
          push: formData.push,
          criticalOnly: formData.criticalOnly,
        },
        alertThresholds: formData.thresholds,
      },
    });

    setSaving(false);
    if (result.success) {
      setEditing(false);
      showModal('Votre profil a été mis à jour avec succès.', 'success');
      await fetchProfile?.();
    } else {
      showModal(result.error || 'Impossible de mettre à jour le profil.', 'error');
    }
  };

  const handleFirmwareRefresh = async () => {
    setRefreshingFirmware(true);
    try {
      await loadFirmwareState();
    } finally {
      setRefreshingFirmware(false);
    }
  };

  const handleGatewayUpdate = async (gateway) => {
    if (!trackingHydrated) {
      Alert.alert('Veuillez patienter', "Le suivi des mises à jour est encore en cours d'initialisation.");
      return;
    }

    const release = firmwareState.latestGatewayRelease;
    if (!release) {
      Alert.alert('Information', 'Aucune release gateway active disponible.');
      return;
    }

    const key = `gw:${gateway._id}`;
    const existingSession = updateTracking[key];
    if (existingSession && !existingSession.terminal) {
      Alert.alert('Mise à jour en cours', 'Une session OTA est déjà active pour cette passerelle.');
      return;
    }

    setTriggeringKey(key);
    try {
      const response = await triggerGatewayFirmwareUpdate(gateway._id, {
        url: release.url,
        version: release.version,
        md5: release.md5,
        size: release.size,
      });
      const commandId = response?.data?.commandId;
      setUpdateTracking((prev) => ({
        ...prev,
        [key]: {
          commandId,
          targetType: 'gateway',
          gatewayId: gateway._id,
          nodeId: null,
          targetVersion: release.version,
          state: response?.data?.mqttPublished ? 'sent' : 'pending',
          message: 'Commande OTA envoyée à la passerelle.',
          startedAt: Date.now(),
          updatedAt: Date.now(),
          ackDeadlineAt: Date.now() + UPDATE_ACK_TIMEOUT_GATEWAY_MS,
          applyDeadlineAt: Date.now() + GATEWAY_UPDATE_APPLY_TIMEOUT_MS,
          terminal: false,
        },
      }));
      showModal(`La mise à jour de ${gateway.name || gateway.gatewayId} a été déclenchée.`, 'success');
    } catch (error) {
      showModal(error?.response?.data?.message || 'Impossible de déclencher la mise à jour gateway.', 'error');
    } finally {
      setTriggeringKey(null);
    }
  };

  const handleNodeUpdate = async (node) => {
    if (!trackingHydrated) {
      Alert.alert('Veuillez patienter', "Le suivi des mises à jour est encore en cours d'initialisation.");
      return;
    }

    const release = firmwareState.latestNodeRelease;
    if (!release) {
      Alert.alert('Information', 'Aucune release node active disponible.');
      return;
    }

    const key = `node:${node.gatewayDbId}:${node.nodeId}`;
    const existingSession = updateTracking[key];
    if (existingSession && !existingSession.terminal) {
      Alert.alert('Mise à jour en cours', 'Une session FUOTA est déjà active pour ce nœud.');
      return;
    }

    setTriggeringKey(key);
    try {
      const response = await triggerNodeFirmwareUpdate(node.gatewayDbId, node.nodeId, {
        url: release.url,
        version: release.version,
        md5: release.md5,
        size: release.size,
      });
      const commandId = response?.data?.commandId;
      setUpdateTracking((prev) => ({
        ...prev,
        [key]: {
          commandId,
          targetType: 'node',
          gatewayId: node.gatewayDbId,
          nodeId: node.nodeId,
          targetVersion: release.version,
          state: response?.data?.mqttPublished ? 'sent' : 'pending',
          message: 'Commande FUOTA envoyée à la passerelle.',
          startedAt: Date.now(),
          updatedAt: Date.now(),
          ackDeadlineAt: Date.now() + UPDATE_ACK_TIMEOUT_NODE_MS,
          applyDeadlineAt: Date.now() + Math.max(
            ((node.config?.measureInterval || 1800) * 1000) * 3 + 300000,
            20 * 60 * 1000,
          ),
          terminal: false,
        },
      }));
      showModal(`La mise à jour du nœud ${node.nodeId} a été déclenchée.`, 'success');
    } catch (error) {
      showModal(error?.response?.data?.message || 'Impossible de déclencher la mise à jour du nœud.', 'error');
    } finally {
      setTriggeringKey(null);
    }
  };

  useEffect(() => {
    const activeSessions = Object.entries(updateTracking).filter(([, session]) => session && !session.terminal);
    if (activeSessions.length === 0) {
      if (trackingPollTimerRef.current) {
        clearTimeout(trackingPollTimerRef.current);
        trackingPollTimerRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;

    const poll = async () => {
      let nextDelayMs = UPDATE_POLL_MS;
      try {
        const now = Date.now();
        const shouldRefreshSnapshot =
          !lastFirmwareSnapshotAtRef.current ||
          now - lastFirmwareSnapshotAtRef.current >= UPDATE_SNAPSHOT_REFRESH_MS;

        let snapshot = firmwareState;
        if (shouldRefreshSnapshot) {
          snapshot = await fetchFirmwareSnapshot();
          if (cancelled) return;
          setFirmwareState(snapshot);
          lastFirmwareSnapshotAtRef.current = Date.now();
        }

        const gatewayMap = new Map(snapshot.gateways.map((gateway) => [String(gateway._id), gateway]));
        const nodeMap = new Map(snapshot.nodes.map((node) => [`${node.gatewayDbId}:${node.nodeId}`, node]));

        const updates = {};

        for (const [key, session] of activeSessions) {
          const now = Date.now();
          let installedVersion = '';
          if (session.targetType === 'gateway') {
            installedVersion = getInstalledVersion(gatewayMap.get(String(session.gatewayId)));
          } else {
            installedVersion = getInstalledVersion(nodeMap.get(`${session.gatewayId}:${session.nodeId}`));
          }

          if (installedVersion && installedVersion === session.targetVersion) {
            updates[key] = {
              ...session,
              state: 'succeeded',
              message: `Version ${installedVersion} appliquée avec succès.`,
              updatedAt: Date.now(),
              terminal: true,
            };
            continue;
          }

          if (installedVersion && session.targetVersion &&
              compareVersion(installedVersion, session.targetVersion) >= 0) {
            updates[key] = {
              ...session,
              state: 'succeeded',
              message: `Version ${installedVersion} déjà installée (hors suivi commande).`,
              updatedAt: Date.now(),
              terminal: true,
            };
            continue;
          }

          if (!session.commandId) {
            updates[key] = session;
            continue;
          }

          if (['pending', 'sent'].includes(session.state) && session.ackDeadlineAt && now > session.ackDeadlineAt) {
            updates[key] = {
              ...session,
              state: 'expired',
              message: 'La passerelle n’a pas confirmé la réception de la commande dans le délai prévu.',
              updatedAt: now,
              terminal: true,
            };
            continue;
          }

          if (session.state === 'acked' && session.applyDeadlineAt && now > session.applyDeadlineAt) {
            updates[key] = {
              ...session,
              state: 'expired',
              message: session.targetType === 'node'
                ? 'Le nœud n’a pas appliqué la mise à jour avant la fin de son cycle attendu.'
                : 'La passerelle n’a pas appliqué la mise à jour dans le délai prévu.',
              updatedAt: now,
              terminal: true,
            };
            continue;
          }

          try {
            const commandRes = await getGatewayCommandStatus(session.gatewayId, session.commandId);
            const command = commandRes?.data || {};
            const nextState = command.status || session.state;
            const defaultMessage = nextState === 'acked'
              ? session.targetType === 'gateway'
                ? 'Firmware téléchargé — la passerelle va redémarrer pour appliquer la mise à jour.'
                : 'Transfert FUOTA terminé côté passerelle — le nœud applique la version au prochain cycle.'
              : nextState === 'failed'
                ? command?.payload?.failReason || session.message || 'La passerelle a signalé un échec FUOTA.'
              : nextState === 'sent'
                ? 'La commande a été publiée vers la passerelle.'
                : nextState === 'pending'
                  ? 'La commande est en file d’attente.'
                  : session.message;

            updates[key] = {
              ...session,
              state: nextState,
              message: defaultMessage,
              updatedAt: now,
              terminal: ['failed', 'expired'].includes(nextState),
            };
          } catch (error) {
            if (error?.response?.status === 429) {
              nextDelayMs = Math.max(nextDelayMs, UPDATE_POLL_BACKOFF_429_MS);
            }
            if (error?.response?.status === 404) {
              updates[key] = {
                ...session,
                state: 'expired',
                message: 'Commande introuvable côté cloud — le suivi a été clôturé.',
                updatedAt: now,
                terminal: true,
              };
              continue;
            }
            const age = now - session.startedAt;
            updates[key] = age > UPDATE_TIMEOUT_MS
              ? {
                ...session,
                state: 'expired',
                message: 'Le suivi a expiré avant confirmation de la mise à jour.',
                updatedAt: now,
                terminal: true,
              }
              : session;
          }
        }

        if (!cancelled && Object.keys(updates).length > 0) {
          setUpdateTracking((prev) => {
            const next = { ...prev };
            for (const [key, value] of Object.entries(updates)) {
              next[key] = value;
            }
            return next;
          });
        }
      } catch (error) {
        if (error?.response?.status === 429) {
          nextDelayMs = Math.max(nextDelayMs, UPDATE_POLL_BACKOFF_429_MS);
        }
        console.log('[Settings][Firmware][TrackingPoll]', error?.message || error);
      } finally {
        if (!cancelled) {
          trackingPollTimerRef.current = setTimeout(() => {
            void poll();
          }, nextDelayMs);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (trackingPollTimerRef.current) {
        clearTimeout(trackingPollTimerRef.current);
        trackingPollTimerRef.current = null;
      }
    };
  }, [updateTracking, firmwareState]);

  const firmwareSummary = useMemo(() => {
    const targetGatewayVersion = firmwareState.latestGatewayRelease?.version || '';
    const targetNodeVersion = firmwareState.latestNodeRelease?.version || '';
    const hasGatewayTarget = !!targetGatewayVersion;
    const hasNodeTarget = !!targetNodeVersion;

    const gatewayOutdated = hasGatewayTarget
      ? firmwareState.gateways.filter((gateway) => hasPendingUpdate(getInstalledVersion(gateway), targetGatewayVersion)).length
      : null;
    const nodeOutdated = hasNodeTarget
      ? firmwareState.nodes.filter((node) => hasPendingUpdate(getInstalledVersion(node), targetNodeVersion)).length
      : null;

    const gatewayCurrent = hasGatewayTarget
      ? firmwareState.gateways.filter((gateway) => {
        const installedVersion = getInstalledVersion(gateway);
        return installedVersion && !hasPendingUpdate(installedVersion, targetGatewayVersion);
      }).length
      : null;
    const nodeCurrent = hasNodeTarget
      ? firmwareState.nodes.filter((node) => {
        const installedVersion = getInstalledVersion(node);
        return installedVersion && !hasPendingUpdate(installedVersion, targetNodeVersion);
      }).length
      : null;

    return {
      hasGatewayTarget,
      hasNodeTarget,
      gatewayOutdated,
      nodeOutdated,
      gatewayCurrent,
      nodeCurrent,
    };
  }, [firmwareState]);

  const activeTrackingCount = useMemo(
    () => Object.values(updateTracking).filter((session) => session && !session.terminal).length,
    [updateTracking]
  );

  const visibleHardware = selectedHardwareType === 'gateway'
    ? firmwareState.gateways
    : selectedHardwareType === 'node'
      ? firmwareState.nodes
      : [];

  useEffect(() => {
    console.log('[Settings][Firmware][Summary]', {
      selectedHardwareType,
      latestGatewayVersion: firmwareState.latestGatewayRelease?.version || null,
      latestNodeVersion: firmwareState.latestNodeRelease?.version || null,
      gatewayCurrent: firmwareSummary.gatewayCurrent,
      gatewayOutdated: firmwareSummary.gatewayOutdated,
      nodeCurrent: firmwareSummary.nodeCurrent,
      nodeOutdated: firmwareSummary.nodeOutdated,
    });
  }, [firmwareState, firmwareSummary, selectedHardwareType]);

  const handleHeroCardLayout = (event) => {
    const nextWidth = event?.nativeEvent?.layout?.width || 0;
    if (nextWidth && nextWidth !== heroCardWidth) {
      setHeroCardWidth(nextWidth);
    }
  };

  if (profileLoading || !profile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CustomModal
        visible={modalVisible}
        message={modalContent.message}
        type={modalContent.type}
        onClose={() => setModalVisible(false)}
      />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoWrapper}>
              <Image source={require('../../assets/branding/logo.png')} style={styles.logoIcon} resizeMode="cover" />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.appName}>EauSûre</Text>
              <Text style={styles.appSlogan}>Paramètres</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.systemsPill}>
              <View style={[styles.systemsPillDot, { backgroundColor: '#8b5cf6' }]} />
              <Text style={styles.systemsPillText}>
                {firmwareState.nodes.length} Système{firmwareState.nodes.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.backHeaderBtn} 
              onPress={() => router.canGoBack() ? router.back() : router.push('/')} 
              activeOpacity={0.8}
            >
              <ArrowLeft size={20} color="#0f172a" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard} onLayout={handleHeroCardLayout}>
          {heroCardWidth > 0 && (
            <WaterWaveBg
              width={heroCardWidth}
              height={HERO_CARD_HEIGHT}
            />
          )}
          <View style={styles.heroCardOverlay}>
            <View style={styles.heroCardRow}>
              <View style={styles.avatarWrap}>
                <UserAvatar uri={formData.avatar} name={formData.name || user?.name} size={84} borderColor="#ffffff" />
                <TouchableOpacity style={styles.avatarEdit} onPress={handleAvatarChange}>
                  <Camera size={14} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={styles.heroInfoWrap}>
                <Text style={styles.heroName}>{formData.name || 'Utilisateur'}</Text>
                
                <View style={styles.heroDetailsGrid}>
                  <View style={styles.heroDetailItem}>
                    <Mail size={14} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.heroDetailText} numberOfLines={1}>{formData.email}</Text>
                  </View>
                  {formData.phone ? (
                    <View style={styles.heroDetailItem}>
                      <Phone size={14} color="rgba(255,255,255,0.75)" />
                      <Text style={styles.heroDetailText} numberOfLines={1}>{formData.phone}</Text>
                    </View>
                  ) : null}
                  {formData.organization ? (
                    <View style={styles.heroDetailItem}>
                      <Building2 size={14} color="rgba(255,255,255,0.75)" />
                      <Text style={styles.heroDetailText} numberOfLines={1}>{formData.organization}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.heroDivider} />

                <Text style={styles.heroStatsText}>
                  {firmwareState.gateways.length} passerelle{firmwareState.gateways.length !== 1 ? 's' : ''}  •  {firmwareState.nodes.length} nœud{firmwareState.nodes.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <SectionTitle icon={User} title="Profil" compact />
            {editing ? (
              <TouchableOpacity 
                style={[styles.saveButton, (!hasChanges || saving) && styles.saveButtonDisabled]} 
                onPress={() => void handleSave()} 
                disabled={!hasChanges || saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={16} color="#fff" />}
                <Text style={styles.saveButtonText}>{saving ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.inlineAction} onPress={() => setEditing(true)}>
                <Edit3 size={15} color={COLORS.primaryDark} />
                <Text style={styles.inlineActionText}>Modifier</Text>
              </TouchableOpacity>
            )}
          </View>
          <FieldRow icon={User} label="Nom complet" value={formData.name} editable={editing} onChangeText={(text) => setFormData((prev) => ({ ...prev, name: text }))} />
          <FieldRow icon={Phone} label="Téléphone" value={formData.phone} editable={editing} onChangeText={(text) => setFormData((prev) => ({ ...prev, phone: text }))} />
          <FieldRow icon={Building2} label="Organisation" value={formData.organization} editable={editing} onChangeText={(text) => setFormData((prev) => ({ ...prev, organization: text }))} />
          <StaticRow icon={User} label="Email" value={formData.email || 'Non renseigné'} />
        </View>

        <View style={styles.card}>
          <SectionTitle icon={Bell} title="Préférences de notification" />
          <ToggleRow icon={Smartphone} label="Notifications push" value={!!formData.push} onValueChange={() => setFormData((prev) => ({ ...prev, push: !prev.push }))} disabled={!editing} />
          <ToggleRow icon={Bell} label="Alertes critiques uniquement" value={!!formData.criticalOnly} onValueChange={() => setFormData((prev) => ({ ...prev, criticalOnly: !prev.criticalOnly }))} disabled={!editing} />
        </View>

        {/* ── Seuils d'alertes ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <SectionTitle icon={AlertTriangle} title="Seuils d'alertes" compact />
            {editingThresholds ? (
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={async () => {
                  setSaving(true);
                  const result = await updateProfile({
                    preferences: {
                      notifications: {
                        push: formData.push,
                        criticalOnly: formData.criticalOnly,
                      },
                      alertThresholds: formData.thresholds,
                    },
                  });
                  setSaving(false);
                  if (result.success) {
                    setEditingThresholds(false);
                    showModal('Seuils mis à jour avec succès.', 'success');
                    await fetchProfile?.();
                  } else {
                    showModal(result.error || 'Impossible de sauvegarder les seuils.', 'error');
                  }
                }}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={16} color="#fff" />}
                <Text style={styles.saveButtonText}>{saving ? '...' : 'Enregistrer'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.inlineAction} onPress={() => setEditingThresholds(true)}>
                <Edit3 size={15} color={COLORS.primaryDark} />
                <Text style={styles.inlineActionText}>Modifier</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionText}>
            Une alerte est déclenchée dès qu'une valeur dépasse ces limites.
          </Text>

          {[
            { key: 'phMin',      label: 'pH minimum',          unit: '',    step: 0.1, min: 0,   max: 14   },
            { key: 'phMax',      label: 'pH maximum',          unit: '',    step: 0.1, min: 0,   max: 14   },
            { key: 'tdsMax',     label: 'TDS maximum',         unit: ' ppm', step: 50, min: 0,   max: 5000 },
            { key: 'turbScore',  label: 'Turbidité score min', unit: '/10', step: 1,   min: 0,   max: 10   },
            { key: 'tempMin',    label: 'Température min',     unit: '°C',  step: 1,   min: -10, max: 50   },
            { key: 'tempMax',    label: 'Température max',     unit: '°C',  step: 1,   min: -10, max: 50   },
            { key: 'batteryMin', label: 'Batterie minimum',    unit: '%',   step: 5,   min: 0,   max: 100  },
          ].map(({ key, label, unit, step, min, max }, index, arr) => (
            <View key={key} style={[styles.thresholdRow, index === arr.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.thresholdLabel}>{label}</Text>
              <View style={styles.thresholdControls}>
                <TouchableOpacity
                  style={[styles.thresholdBtn, !editingThresholds && styles.thresholdBtnDisabled]}
                  disabled={!editingThresholds}
                  onPress={() => setFormData(prev => ({
                    ...prev,
                    thresholds: {
                      ...prev.thresholds,
                      [key]: Math.max(min, parseFloat((prev.thresholds[key] - step).toFixed(2))),
                    },
                  }))}
                >
                  <Text style={[styles.thresholdBtnText, !editingThresholds && { color: COLORS.textSub }]}>−</Text>
                </TouchableOpacity>
                <Text style={styles.thresholdValue}>
                  {formData.thresholds[key]}{unit}
                </Text>
                <TouchableOpacity
                  style={[styles.thresholdBtn, !editingThresholds && styles.thresholdBtnDisabled]}
                  disabled={!editingThresholds}
                  onPress={() => setFormData(prev => ({
                    ...prev,
                    thresholds: {
                      ...prev.thresholds,
                      [key]: Math.min(max, parseFloat((prev.thresholds[key] + step).toFixed(2))),
                    },
                  }))}
                >
                  <Text style={[styles.thresholdBtnText, !editingThresholds && { color: COLORS.textSub }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {editingThresholds && (
            <TouchableOpacity
              style={styles.resetThresholdsBtn}
              onPress={() => setFormData(prev => ({ ...prev, thresholds: { ...DEFAULT_THRESHOLDS } }))}
            >
              <Text style={styles.resetThresholdsBtnText}>Réinitialiser les valeurs par défaut</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <SectionTitle icon={Download} title="Mises à jour firmware" compact />
            <TouchableOpacity style={styles.inlineAction} onPress={() => void handleFirmwareRefresh()}>
              {refreshingFirmware ? <ActivityIndicator size="small" color={COLORS.primaryDark} /> : <RefreshCw size={15} color={COLORS.primaryDark} />}
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionText}>
            Vous pouvez déclencher l’OTA de votre gateway ou la FUOTA de vos nœuds depuis l’application.
          </Text>

          {!trackingHydrated ? (
            <View style={styles.firmwareTrackingBanner}>
              <ActivityIndicator size="small" color={COLORS.primaryDark} />
              <Text style={styles.firmwareTrackingBannerText}>Restauration du suivi des mises à jour...</Text>
            </View>
          ) : activeTrackingCount > 0 ? (
            <TouchableOpacity
              style={styles.firmwareTrackingBanner}
              onPress={() => {
                Alert.alert(
                  'Réinitialiser le suivi',
                  'Clôturer toutes les mises à jour en cours dans l’application ? (Cela n’annule pas une commande déjà envoyée à la passerelle.)',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Réinitialiser',
                      style: 'destructive',
                      onPress: async () => {
                        setUpdateTracking({});
                        await clearUpdateTrackingSessions();
                      },
                    },
                  ],
                );
              }}
            >
              <ShieldCheck size={15} color={COLORS.primaryDark} />
              <Text style={styles.firmwareTrackingBannerText}>
                {activeTrackingCount} mise{activeTrackingCount > 1 ? 's' : ''} à jour en cours de suivi — toucher pour réinitialiser
              </Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.summaryRow}>
            <SummaryPill label="Gateway cible" value={firmwareState.latestGatewayRelease?.version || 'N/A'} tone="blue" />
            <SummaryPill label="Nœuds cible" value={firmwareState.latestNodeRelease?.version || 'N/A'} tone="green" />
          </View>

          <View style={styles.summaryRow}>
            <SummaryPill label="Gateways à jour" value={firmwareSummary.gatewayCurrent == null ? 'N/A' : String(firmwareSummary.gatewayCurrent)} tone="green" />
            <SummaryPill label="Nœuds à jour" value={firmwareSummary.nodeCurrent == null ? 'N/A' : String(firmwareSummary.nodeCurrent)} tone="green" />
          </View>

          <View style={styles.summaryRow}>
            <SummaryPill label="Gateways obsolètes" value={firmwareSummary.gatewayOutdated == null ? 'N/A' : String(firmwareSummary.gatewayOutdated)} tone="amber" />
            <SummaryPill label="Nœuds obsolètes" value={firmwareSummary.nodeOutdated == null ? 'N/A' : String(firmwareSummary.nodeOutdated)} tone="amber" />
          </View>

          <View style={styles.hardwareSelector}>
            <TouchableOpacity
              style={[styles.selectorChip, selectedHardwareType === 'gateway' && styles.selectorChipActive]}
              onPress={() => setSelectedHardwareType((prev) => (prev === 'gateway' ? null : 'gateway'))}
            >
              <Wifi size={15} color={selectedHardwareType === 'gateway' ? '#ffffff' : COLORS.primaryDark} />
              <Text style={[styles.selectorChipText, selectedHardwareType === 'gateway' && styles.selectorChipTextActive]}>
                Passerelles
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectorChip, selectedHardwareType === 'node' && styles.selectorChipActive]}
              onPress={() => setSelectedHardwareType((prev) => (prev === 'node' ? null : 'node'))}
            >
              <Cpu size={15} color={selectedHardwareType === 'node' ? '#ffffff' : COLORS.primaryDark} />
              <Text style={[styles.selectorChipText, selectedHardwareType === 'node' && styles.selectorChipTextActive]}>
                Nœuds
              </Text>
            </TouchableOpacity>
          </View>

          {loadingFirmware ? (
            <View style={styles.loadingFirmware}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingFirmwareText}>Chargement des mises à jour...</Text>
            </View>
          ) : !selectedHardwareType ? (
            <EmptyState text="Sélectionnez un type de matériel pour vérifier sa version et déclencher une mise à jour." />
          ) : (
            <>
              <Text style={styles.subsectionTitle}>
                {selectedHardwareType === 'gateway' ? 'Passerelles' : 'Nœuds de mesure'}
              </Text>
              {visibleHardware.length === 0 ? (
                <EmptyState text={selectedHardwareType === 'gateway' ? 'Aucune gateway liée à ce compte.' : 'Aucun nœud lié à ce compte.'} />
              ) : (
                selectedHardwareType === 'gateway' ? visibleHardware.map((gateway) => {
                  const target = firmwareState.latestGatewayRelease?.version || '';
                  const installedVersion = getInstalledVersion(gateway);
                  const current = installedVersion || 'Inconnue';
                  const outdated = hasPendingUpdate(installedVersion, target);
                  const key = `gw:${gateway._id}`;
                  const tracking = updateTracking[key];
                  const trackingUi = describeTrackingSession(tracking, installedVersion);
                  const hasRelease = !!target;
                  const badgeLabel = !hasRelease
                    ? 'Aucune release'
                    : !installedVersion
                      ? 'Version inconnue'
                      : outdated
                        ? 'Mise à jour disponible'
                        : 'À jour';
                  const badgeTone = !hasRelease || !installedVersion
                    ? 'neutral'
                    : outdated
                      ? 'warning'
                      : 'success';
                  const actionLabel = !hasRelease
                    ? 'Aucune release'
                    : outdated
                      ? 'Mettre à jour'
                      : 'Version actuelle';
                  const effectiveBadgeLabel = trackingUi?.badgeLabel || badgeLabel;
                  const effectiveBadgeTone = trackingUi?.badgeTone || badgeTone;
                  const effectiveActionLabel = trackingUi?.actionLabel || actionLabel;
                  const effectiveActionDisabled = trackingUi
                    ? trackingUi.actionDisabled
                    : (!trackingHydrated || !hasRelease || !outdated || triggeringKey === key);

                  return (
                    <DeviceCard
                      key={gateway._id || gateway.gatewayId}
                      icon={Wifi}
                      title={gateway.name || gateway.gatewayId}
                      subtitle={`Version actuelle: ${current}`}
                      statusNote={trackingUi?.statusNote || null}
                      badgeLabel={effectiveBadgeLabel}
                      badgeTone={effectiveBadgeTone}
                      actionLabel={effectiveActionLabel}
                      actionDisabled={effectiveActionDisabled}
                      onAction={() => void handleGatewayUpdate(gateway)}
                      actionLoading={triggeringKey === key}
                    />
                  );
                }) : visibleHardware.map((node) => {
                  const target = firmwareState.latestNodeRelease?.version || '';
                  const installedVersion = getInstalledVersion(node);
                  const current = installedVersion || 'Inconnue';
                  const outdated = hasPendingUpdate(installedVersion, target);
                  const key = `node:${node.gatewayDbId}:${node.nodeId}`;
                  const tracking = updateTracking[key];
                  const trackingUi = describeTrackingSession(tracking, installedVersion);
                  const hasRelease = !!target;
                  const badgeLabel = !hasRelease
                    ? 'Aucune release'
                    : !installedVersion
                      ? 'Version inconnue'
                      : outdated
                        ? 'FUOTA disponible'
                        : 'À jour';
                  const badgeTone = !hasRelease || !installedVersion
                    ? 'neutral'
                    : outdated
                      ? 'warning'
                      : 'success';
                  const actionLabel = !hasRelease
                    ? 'Aucune release'
                    : outdated
                      ? 'Lancer FUOTA'
                      : 'Version actuelle';
                  const effectiveBadgeLabel = trackingUi?.badgeLabel || badgeLabel;
                  const effectiveBadgeTone = trackingUi?.badgeTone || badgeTone;
                  const effectiveActionLabel = trackingUi?.actionLabel || actionLabel;
                  const effectiveActionDisabled = trackingUi
                    ? trackingUi.actionDisabled
                    : (!trackingHydrated || !hasRelease || !outdated || triggeringKey === key);
                  const trackingActive = tracking && !tracking.terminal;

                  return (
                    <DeviceCard
                      key={`${node.gatewayDbId}:${node.nodeId}`}
                      icon={Cpu}
                      title={node.nodeId}
                      subtitle={`${node.gatewayName} • Version actuelle: ${current}`}
                      statusNote={trackingUi?.statusNote || null}
                      badgeLabel={effectiveBadgeLabel}
                      badgeTone={effectiveBadgeTone}
                      actionLabel={effectiveActionLabel}
                      actionDisabled={effectiveActionDisabled}
                      onAction={() => void handleNodeUpdate(node)}
                      actionLoading={triggeringKey === key}
                      secondaryActionLabel={trackingActive ? 'Abandonner le suivi' : null}
                      onSecondaryAction={trackingActive
                        ? () => dismissUpdateTracking(key)
                        : null}
                    />
                  );
                })
              )}
            </>
          )}
        </View>

        {/* ── Documentation & Support ── */}
        <View style={styles.card}>
          <SectionTitle icon={BookOpen} title="Documentation & Support" />

          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => WebBrowser.openBrowserAsync('https://github.com/EauSure')}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#f0fdf4' }]}>
              <Github size={16} color="#15803d" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Documentation</Text>
              <Text style={styles.staticValue}>github.com/EauSure</Text>
            </View>
            <ExternalLink size={15} color={COLORS.textSub} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            activeOpacity={0.7}
            onPress={() => WebBrowser.openBrowserAsync('https://github.com/EauSure/issues/new')}
          >
            <View style={[styles.rowIcon, { backgroundColor: '#fef2f2' }]}>
              <Bug size={16} color={COLORS.danger} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Signaler un problème</Text>
              <Text style={styles.staticValue}>Ouvrir un ticket GitHub</Text>
            </View>
            <ExternalLink size={15} color={COLORS.textSub} />
          </TouchableOpacity>
        </View>

        {/* ── Développeur ── */}
        <TouchableOpacity
          style={styles.devCard}
          activeOpacity={0.8}
          onPress={() => WebBrowser.openBrowserAsync('https://github.com/adam-dev-hub')}
        >
          <View style={styles.devLeft}>
            <View style={styles.devAvatar}>
              <Github size={22} color="#fff" />
            </View>
            <View>
              <Text style={styles.devName}>Adam Farjeoui</Text>
              <Text style={styles.devRole}>Développeur de l'application</Text>
              <Text style={styles.devHandle}>@adam-dev-hub</Text>
            </View>
          </View>
          <ExternalLink size={16} color={COLORS.textSub} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={18} color={COLORS.danger} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
          <ChevronRight size={16} color={COLORS.danger} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ icon: Icon, title, compact = false }) {
  return (
    <View style={[styles.sectionTitleRow, compact && styles.sectionTitleRowCompact]}>
      <View style={styles.sectionIcon}>
        <Icon size={18} color={COLORS.primaryDark} />
      </View>
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}

function FieldRow({ icon: Icon, label, value, editable, onChangeText }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon size={16} color={COLORS.primaryDark} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <TextInput
          style={[styles.input, !editable && styles.inputDisabled]}
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          placeholder={label}
          placeholderTextColor={COLORS.textSub}
        />
      </View>
    </View>
  );
}

function StaticRow({ icon: Icon, label, value }) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, styles.rowIconMuted]}>
        <Icon size={16} color={COLORS.textSub} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.staticValue}>{value}</Text>
      </View>
    </View>
  );
}

function ToggleRow({ icon: Icon, label, value, onValueChange, disabled }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon size={16} color={COLORS.primaryDark} />
      </View>
      <View style={styles.toggleContent}>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#cbd5e1', true: '#7dd3fc' }}
        thumbColor={value ? COLORS.primaryDark : '#f8fafc'}
      />
    </View>
  );
}

function SummaryPill({ label, value, tone }) {
  const backgroundColor = tone === 'green'
    ? COLORS.successSoft
    : tone === 'amber'
      ? COLORS.warningSoft
      : tone === 'slate'
        ? '#e2e8f0'
        : '#e0f2fe';
  const color = tone === 'green'
    ? '#15803d'
    : tone === 'amber'
      ? '#b45309'
      : tone === 'slate'
        ? '#475569'
        : '#0369a1';
  return (
    <View style={[styles.summaryPill, { backgroundColor }]}>
      <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function DeviceCard({
  icon: Icon,
  title,
  subtitle,
  statusNote,
  badgeLabel,
  badgeTone,
  actionLabel,
  actionDisabled,
  actionLoading,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) {
  const badgeStyle = badgeTone === 'warning'
    ? styles.badgeWarning
    : badgeTone === 'neutral'
      ? styles.badgeNeutral
      : styles.badgeSuccess;
  const badgeTextStyle = badgeTone === 'warning'
    ? styles.badgeWarningText
    : badgeTone === 'neutral'
      ? styles.badgeNeutralText
      : styles.badgeSuccessText;

  return (
    <View style={styles.deviceCard}>
      <View style={styles.deviceHeader}>
        <View style={styles.deviceIcon}>
          <Icon size={18} color={COLORS.primaryDark} />
        </View>
        <View style={styles.deviceContent}>
          <Text style={styles.deviceTitle}>{title}</Text>
          <Text style={styles.deviceSubtitle}>{subtitle}</Text>
          {statusNote ? <Text style={styles.deviceStatusNote}>{statusNote}</Text> : null}
        </View>
        <View style={[styles.badge, badgeStyle]}>
          <Text style={[styles.badgeText, badgeTextStyle]}>{badgeLabel}</Text>
        </View>
      </View>
      <TouchableOpacity style={[styles.deviceButton, actionDisabled && styles.deviceButtonDisabled]} onPress={onAction} disabled={actionDisabled}>
        {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.deviceButtonText}>{actionLabel}</Text>}
      </TouchableOpacity>
      {secondaryActionLabel && onSecondaryAction ? (
        <TouchableOpacity style={styles.deviceSecondaryButton} onPress={onSecondaryAction}>
          <Text style={styles.deviceSecondaryButtonText}>{secondaryActionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function EmptyState({ text }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    backgroundColor: '#ffffff',
    paddingBottom: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 10,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoWrapper: {
    width: 40,
    height: 40,
    backgroundColor: '#e0f2fe',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoIcon: {
    width: 60,
    height: 60,
  },
  headerTextWrap: {
    justifyContent: 'center',
  },
  appName: {
    fontFamily: 'Ubuntu_700Bold',
    color: COLORS.text,
    fontSize: 18,
  },
  appSlogan: {
    fontSize: 10,
    fontFamily: 'Ubuntu_500Medium',
    color: '#0ea5e9',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  headerBadgeText: {
    fontFamily: 'Ubuntu_500Medium',
    color: COLORS.primaryDark,
    fontSize: 13,
  },
  backHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  systemsPill: {
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  systemsPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  systemsPillText: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 13,
    color: '#6d28d9',
  },
  saveButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontFamily: 'Ubuntu_500Medium',
    color: '#ffffff',
  },
  saveButtonDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
    gap: 16,
    paddingTop: 16,
  },
  heroCard: {
    borderRadius: 26,
    minHeight: HERO_CARD_HEIGHT,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  heroCardOverlay: {
    minHeight: HERO_CARD_HEIGHT,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  heroCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    width: '100%',
    paddingHorizontal: 10,
  },
  heroInfoWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  heroName: {
    fontFamily: 'Ubuntu_700Bold',
    color: '#ffffff',
    fontSize: 21,
    marginBottom: 4,
  },
  heroDetailsGrid: {
    gap: 5,
    marginTop: 4,
  },
  heroDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  heroDetailText: {
    fontFamily: 'Ubuntu_400Regular',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13.5,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 10,
    width: '90%',
  },
  heroStatsText: {
    fontFamily: 'Ubuntu_700Bold',
    color: '#ffffff',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionTitleRowCompact: {
    marginBottom: 0,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleText: {
    fontFamily: 'Ubuntu_700Bold',
    color: COLORS.text,
    fontSize: 18,
  },
  sectionText: {
    fontFamily: 'Ubuntu_400Regular',
    color: COLORS.textSub,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconMuted: {
    backgroundColor: '#f1f5f9',
  },
  rowContent: {
    flex: 1,
  },
  toggleContent: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    fontFamily: 'Ubuntu_500Medium',
    color: COLORS.text,
    fontSize: 14,
  },
  input: {
    marginTop: 4,
    fontFamily: 'Ubuntu_400Regular',
    color: COLORS.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  inputDisabled: {
    opacity: 0.65,
  },
  staticValue: {
    marginTop: 4,
    fontFamily: 'Ubuntu_400Regular',
    color: COLORS.textSub,
    fontSize: 15,
  },
  inlineAction: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  hardwareSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  selectorChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  selectorChipActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  selectorChipText: {
    fontFamily: 'Ubuntu_500Medium',
    color: COLORS.primaryDark,
    fontSize: 13,
  },
  selectorChipTextActive: {
    color: '#ffffff',
  },
  summaryPill: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryLabel: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 12,
  },
  summaryValue: {
    marginTop: 6,
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 18,
  },
  loadingFirmware: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  loadingFirmwareText: {
    fontFamily: 'Ubuntu_400Regular',
    color: COLORS.textSub,
  },
  firmwareTrackingBanner: {
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  firmwareTrackingBannerText: {
    flex: 1,
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 13,
    color: COLORS.primaryDark,
  },
  subsectionTitle: {
    marginTop: 10,
    marginBottom: 10,
    fontFamily: 'Ubuntu_700Bold',
    color: COLORS.text,
    fontSize: 15,
  },
  deviceCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceContent: {
    flex: 1,
  },
  deviceTitle: {
    fontFamily: 'Ubuntu_700Bold',
    color: COLORS.text,
    fontSize: 15,
  },
  deviceSubtitle: {
    marginTop: 4,
    fontFamily: 'Ubuntu_400Regular',
    color: COLORS.textSub,
    fontSize: 13,
  },
  deviceStatusNote: {
    marginTop: 6,
    fontFamily: 'Ubuntu_400Regular',
    color: COLORS.primaryDark,
    fontSize: 12,
    lineHeight: 16,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeWarning: {
    backgroundColor: COLORS.warningSoft,
  },
  badgeSuccess: {
    backgroundColor: COLORS.successSoft,
  },
  badgeNeutral: {
    backgroundColor: '#e2e8f0',
  },
  badgeText: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
  },
  badgeWarningText: {
    color: '#b45309',
  },
  badgeSuccessText: {
    color: '#15803d',
  },
  badgeNeutralText: {
    color: '#475569',
  },
  deviceButton: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  deviceButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  deviceButtonText: {
    color: '#ffffff',
    fontFamily: 'Ubuntu_500Medium',
  },
  deviceSecondaryButton: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  deviceSecondaryButtonText: {
    color: COLORS.danger,
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 13,
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  emptyStateText: {
    textAlign: 'center',
    color: COLORS.textSub,
    fontFamily: 'Ubuntu_400Regular',
  },
  logoutButton: {
    backgroundColor: COLORS.dangerSoft,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  logoutText: {
    flex: 1,
    marginLeft: 12,
    fontFamily: 'Ubuntu_700Bold',
    color: COLORS.danger,
    fontSize: 15,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSub,
    fontFamily: 'Ubuntu_400Regular',
  },

  // ── Liens documentation ──
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },

  // ── Carte développeur ──
  devCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  devLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  devAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  devName: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 15,
    color: COLORS.text,
  },
  devRole: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 12,
    color: COLORS.textSub,
    marginTop: 2,
  },
  devHandle: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 1,
  },

  // ── Seuils d'alertes ──
  thresholdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  thresholdLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Ubuntu_500Medium',
    color: COLORS.text,
  },
  thresholdControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thresholdBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdBtnDisabled: {
    backgroundColor: COLORS.border,
  },
  thresholdBtnText: {
    fontSize: 18,
    color: '#fff',
    fontFamily: 'Ubuntu_700Bold',
    lineHeight: 22,
  },
  thresholdValue: {
    minWidth: 60,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: 'Ubuntu_700Bold',
    color: COLORS.text,
  },
  resetThresholdsBtn: {
    marginTop: 14,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  resetThresholdsBtnText: {
    fontSize: 13,
    fontFamily: 'Ubuntu_500Medium',
    color: COLORS.danger,
  },
});
