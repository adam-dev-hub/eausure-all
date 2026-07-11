import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { X } from 'lucide-react-native';

const { height: screenHeight } = Dimensions.get('window');

// ── Metric interpretation helpers ──────────────────────────────────────────────

function interpretRSSI(rssi) {
  if (rssi === undefined || rssi === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (rssi > -50) return { status: 'excellent', color: '#22c55e', desc: 'Signal excellent. Le nœud est très proche de la passerelle.' };
  if (rssi > -60) return { status: 'bon', color: '#22c55e', desc: 'Bon signal. Communication fiable.' };
  if (rssi > -70) return { status: 'correct', color: '#f59e0b', desc: 'Signal correct. Le nœud est à distance moyenne de la passerelle.' };
  if (rssi > -80) return { status: 'faible', color: '#f59e0b', desc: 'Signal faible. Le nœud approche la limite de couverture LoRa.' };
  if (rssi > -90) return { status: 'très faible', color: '#ef4444', desc: 'Signal très faible. Le nœud est à l\'extrémité de la zone de couverture LoRa. Risque de perte de paquets.' };
  return { status: 'critique', color: '#ef4444', desc: 'Signal critique. Communication instable. Rapprocher le nœud de la passerelle.' };
}

function interpretSNR(snr) {
  if (snr === undefined || snr === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (snr > 7) return { status: 'excellent', color: '#22c55e', desc: 'Rapport signal/bruit excellent. Aucune interférence détectée.' };
  if (snr > 3) return { status: 'bon', color: '#22c55e', desc: 'Bon rapport signal/bruit. Communication claire.' };
  if (snr > 0) return { status: 'acceptable', color: '#f59e0b', desc: 'Rapport signal/bruit acceptable. Légères interférences possibles.' };
  return { status: 'dégradé', color: '#ef4444', desc: 'Rapport signal/bruit dégradé. Interférences radio significatives.' };
}

function interpretPH(ph) {
  if (ph === undefined || ph === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (ph >= 6.5 && ph <= 8.5) return { status: 'idéal', color: '#22c55e', desc: `pH ${ph.toFixed(2)} — Dans la plage idéale (6.5–8.5). Eau potable.` };
  if (ph >= 5.5 && ph < 6.5) return { status: 'acide', color: '#f59e0b', desc: `pH ${ph.toFixed(2)} — Légèrement acide. Surveillance recommandée.` };
  if (ph > 8.5 && ph <= 9.5) return { status: 'basique', color: '#f59e0b', desc: `pH ${ph.toFixed(2)} — Légèrement basique. Surveillance recommandée.` };
  if (ph < 5.5) return { status: 'très acide', color: '#ef4444', desc: `pH ${ph.toFixed(2)} — Eau très acide. Non potable sans traitement.` };
  return { status: 'très basique', color: '#ef4444', desc: `pH ${ph.toFixed(2)} — Eau très basique. Non potable sans traitement.` };
}

function interpretTDS(tds) {
  if (tds === undefined || tds === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (tds < 150) return { status: 'excellent', color: '#22c55e', desc: `${tds} ppm — Eau très pure, faible minéralisation.` };
  if (tds < 300) return { status: 'bon', color: '#22c55e', desc: `${tds} ppm — Bonne qualité. Minéralisation normale.` };
  if (tds < 500) return { status: 'acceptable', color: '#f59e0b', desc: `${tds} ppm — Acceptable. Minéralisation modérée.` };
  if (tds < 1000) return { status: 'élevé', color: '#f59e0b', desc: `${tds} ppm — Minéralisation élevée. Goût possible.` };
  return { status: 'critique', color: '#ef4444', desc: `${tds} ppm — Très élevé. Eau potentiellement non potable.` };
}

function interpretTurbidity(score) {
  if (score === undefined || score === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (score >= 8) return { status: 'limpide', color: '#22c55e', desc: `Score ${score}/10 — Eau limpide. Aucune particule en suspension détectée.` };
  if (score >= 5) return { status: 'légèrement trouble', color: '#f59e0b', desc: `Score ${score}/10 — Eau légèrement trouble. Particules en suspension détectées.` };
  if (score >= 3) return { status: 'trouble', color: '#f59e0b', desc: `Score ${score}/10 — Eau trouble. Filtration recommandée.` };
  return { status: 'très trouble', color: '#ef4444', desc: `Score ${score}/10 — Eau très trouble. Non potable sans traitement.` };
}

function interpretTempWater(temp) {
  if (temp === undefined || temp === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (temp >= 10 && temp <= 25) return { status: 'normal', color: '#22c55e', desc: `${temp.toFixed(1)}°C — Plage normale (10–25°C). Conditions favorables.` };
  if (temp > 25 && temp <= 35) return { status: 'chaud', color: '#f59e0b', desc: `${temp.toFixed(1)}°C — Eau chaude. Peut favoriser la prolifération bactérienne.` };
  if (temp < 10) return { status: 'froid', color: '#3b82f6', desc: `${temp.toFixed(1)}°C — Eau froide. Conditions hivernales.` };
  return { status: 'très chaud', color: '#ef4444', desc: `${temp.toFixed(1)}°C — Température excessive. Risque sanitaire.` };
}

function interpretTempMPU(temp) {
  if (temp === undefined || temp === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (temp >= 20 && temp <= 55) return { status: 'normal', color: '#22c55e', desc: `${temp.toFixed(1)}°C — Plage normale du MPU6050 (20–55°C). Fonctionnement correct.` };
  if (temp > 55 && temp <= 70) return { status: 'chaud', color: '#f59e0b', desc: `${temp.toFixed(1)}°C — Module chaud. Vérifier la ventilation du boîtier.` };
  return { status: 'critique', color: '#ef4444', desc: `${temp.toFixed(1)}°C — Température hors plage. Risque de dysfonctionnement capteur.` };
}

function interpretTempESP(temp) {
  if (temp === undefined || temp === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  if (temp >= 15 && temp <= 50) return { status: 'normal', color: '#22c55e', desc: `${temp.toFixed(1)}°C — Plage normale ESP32-S3 (15–50°C). Fonctionnement optimal.` };
  if (temp > 50 && temp <= 65) return { status: 'chaud', color: '#f59e0b', desc: `${temp.toFixed(1)}°C — ESP32 chaud. Charge CPU élevée ou ventilation insuffisante.` };
  if (temp > 65) return { status: 'surchauffe', color: '#ef4444', desc: `${temp.toFixed(1)}°C — Surchauffe ESP32. Risque de throttling ou redémarrage.` };
  return { status: 'froid', color: '#3b82f6', desc: `${temp.toFixed(1)}°C — Température basse. Fonctionnement normal.` };
}

function interpretBattery(pct, voltage) {
  if (pct === undefined || pct === null) return { status: 'unknown', color: '#94a3b8', desc: 'Donnée indisponible' };
  const vStr = voltage ? ` (${voltage.toFixed(2)}V)` : '';
  if (pct > 50) return { status: 'bon', color: '#22c55e', desc: `${pct}%${vStr} — Niveau de charge confortable. Autonomie suffisante.` };
  if (pct > 20) return { status: 'moyen', color: '#f59e0b', desc: `${pct}%${vStr} — Niveau moyen. Prévoir un remplacement dans les prochaines semaines.` };
  return { status: 'critique', color: '#ef4444', desc: `${pct}%${vStr} — Batterie critique. Remplacement urgent recommandé.` };
}

// ── JSON-style renderer ────────────────────────────────────────────────────────

function JsonLine({ indent = 0, keyName, value, valueColor, children }) {
  const pad = '  '.repeat(indent);
  return (
    <View style={jsonStyles.line}>
      <Text style={jsonStyles.code}>
        <Text style={jsonStyles.indent}>{pad}</Text>
        {keyName && <><Text style={jsonStyles.key}>"{keyName}"</Text><Text style={jsonStyles.punct}>: </Text></>}
        {value !== undefined && <Text style={[jsonStyles.value, valueColor && { color: valueColor }]}>{value}</Text>}
        {children}
      </Text>
    </View>
  );
}

function JsonBlock({ indent = 0, keyName, children }) {
  const pad = '  '.repeat(indent);
  return (
    <View>
      <Text style={jsonStyles.code}>
        <Text style={jsonStyles.indent}>{pad}</Text>
        {keyName && <><Text style={jsonStyles.key}>"{keyName}"</Text><Text style={jsonStyles.punct}>: </Text></>}
        <Text style={jsonStyles.punct}>{'{'}</Text>
      </Text>
      {children}
      <Text style={jsonStyles.code}>
        <Text style={jsonStyles.indent}>{pad}</Text>
        <Text style={jsonStyles.punct}>{'}'}</Text>
      </Text>
    </View>
  );
}

function MetricEntry({ indent, keyName, value, unit, interpretation }) {
  return (
    <View style={jsonStyles.metricWrap}>
      <JsonLine indent={indent} keyName={keyName} value={`${value}${unit ? ' ' + unit : ''}`} valueColor={interpretation.color} />
      <View style={[jsonStyles.descRow, { marginLeft: indent * 14 + 16 }]}>
        <View style={[jsonStyles.statusDot, { backgroundColor: interpretation.color }]} />
        <Text style={jsonStyles.descText}>{interpretation.desc}</Text>
      </View>
    </View>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export default function NodeDetailModal({ visible, onClose, node, gateway, latestData }) {
  if (!visible || !latestData) return null;

  const d = latestData;
  const rssiInterp = interpretRSSI(d.signal?.rssi);
  const snrInterp = interpretSNR(d.signal?.snr);
  const phInterp = interpretPH(d.ph?.value);
  const tdsInterp = interpretTDS(d.tds?.value);
  const turbInterp = interpretTurbidity(d.turbidity?.score);
  const tempWaterInterp = interpretTempWater(d.temperature?.water);
  const tempMpuInterp = interpretTempMPU(d.temperature?.mpu);
  const tempEspInterp = interpretTempESP(d.temperature?.esp32);
  const battInterp = interpretBattery(d.battery?.percentage, d.battery?.voltage);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Détail Mesure</Text>
              <Text style={styles.subtitle}>
                {new Date(d.timestamp || d.receivedAt).toLocaleString('fr-FR')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* JSON content */}
          <ScrollView style={styles.codeContainer} showsVerticalScrollIndicator={false}>
            <View style={jsonStyles.codeBlock}>
              <Text style={jsonStyles.code}><Text style={jsonStyles.punct}>{'{'}</Text></Text>

              {/* Identity */}
              <JsonBlock indent={1} keyName="identité">
                <JsonLine indent={2} keyName="nœud" value={`"${node?.name || node?.nodeId || 'Inconnu'}"`} valueColor="#b35309" />
                <JsonLine indent={2} keyName="nodeId" value={`"${node?.nodeId || '--'}"`} valueColor="#b35309" />
                <JsonLine indent={2} keyName="passerelle" value={`"${gateway?.name || gateway?.gatewayName || 'Gateway'}"`} valueColor="#b35309" />
                <JsonLine indent={2} keyName="horodatage" value={`"${new Date(d.timestamp || d.receivedAt).toLocaleString('fr-FR')}"`} valueColor="#b35309" />
              </JsonBlock>

              {/* Signal */}
              <View style={jsonStyles.sectionSpacer} />
              <JsonBlock indent={1} keyName="signal_lora">
                <JsonLine indent={2} keyName="rssi" value={`${d.signal?.rssi ?? '--'} dBm`} valueColor={rssiInterp.color} />
                <JsonLine indent={2} keyName="rssi_état" value={`"${rssiInterp.status}"`} valueColor={rssiInterp.color} />
                <JsonLine indent={2} keyName="rssi_description" value={`"${rssiInterp.desc}"`} valueColor="#64748b" />
                <JsonLine indent={2} keyName="snr" value={`${d.signal?.snr?.toFixed(1) ?? '--'} dB`} valueColor={snrInterp.color} />
                <JsonLine indent={2} keyName="snr_état" value={`"${snrInterp.status}"`} valueColor={snrInterp.color} />
                <JsonLine indent={2} keyName="snr_description" value={`"${snrInterp.desc}"`} valueColor="#64748b" />
              </JsonBlock>

              {/* Water quality */}
              <View style={jsonStyles.sectionSpacer} />
              <JsonBlock indent={1} keyName="qualité_eau">
                <JsonLine indent={2} keyName="pH" value={`${d.ph?.value?.toFixed(2) ?? '--'}`} valueColor={phInterp.color} />
                <JsonLine indent={2} keyName="pH_score" value={`${d.ph?.score ?? '--'}/10`} valueColor={phInterp.color} />
                <JsonLine indent={2} keyName="pH_description" value={`"${phInterp.desc}"`} valueColor="#64748b" />
                <JsonLine indent={2} keyName="tds" value={`${d.tds?.value ?? '--'} ppm`} valueColor={tdsInterp.color} />
                <JsonLine indent={2} keyName="tds_score" value={`${d.tds?.score ?? '--'}/10`} valueColor={tdsInterp.color} />
                <JsonLine indent={2} keyName="tds_description" value={`"${tdsInterp.desc}"`} valueColor="#64748b" />
                <JsonLine indent={2} keyName="turbidité_score" value={`${d.turbidity?.score ?? '--'}/10`} valueColor={turbInterp.color} />
                <JsonLine indent={2} keyName="turbidité_tension" value={`${d.turbidity?.voltage?.toFixed(2) ?? '--'} V`} valueColor="#475569" />
                <JsonLine indent={2} keyName="turbidité_description" value={`"${turbInterp.desc}"`} valueColor="#64748b" />
              </JsonBlock>

              {/* Temperature */}
              <View style={jsonStyles.sectionSpacer} />
              <JsonBlock indent={1} keyName="températures">
                <JsonLine indent={2} keyName="eau" value={`${d.temperature?.water?.toFixed(1) ?? '--'} °C`} valueColor={tempWaterInterp.color} />
                <JsonLine indent={2} keyName="eau_description" value={`"${tempWaterInterp.desc}"`} valueColor="#64748b" />
                <JsonLine indent={2} keyName="mpu6050" value={`${d.temperature?.mpu?.toFixed(1) ?? '--'} °C`} valueColor={tempMpuInterp.color} />
                <JsonLine indent={2} keyName="mpu6050_description" value={`"${tempMpuInterp.desc}"`} valueColor="#64748b" />
                <JsonLine indent={2} keyName="esp32_s3" value={`${d.temperature?.esp32?.toFixed(1) ?? '--'} °C`} valueColor={tempEspInterp.color} />
                <JsonLine indent={2} keyName="esp32_s3_description" value={`"${tempEspInterp.desc}"`} valueColor="#64748b" />
              </JsonBlock>

              {/* Battery */}
              <View style={jsonStyles.sectionSpacer} />
              <JsonBlock indent={1} keyName="batterie">
                <JsonLine indent={2} keyName="niveau" value={`${d.battery?.percentage ?? '--'}%`} valueColor={battInterp.color} />
                <JsonLine indent={2} keyName="tension" value={`${d.battery?.voltage?.toFixed(2) ?? '--'} V`} valueColor="#475569" />
                <JsonLine indent={2} keyName="courant" value={`${d.battery?.current ?? 0} mA`} valueColor="#475569" />
                <JsonLine indent={2} keyName="batterie_description" value={`"${battInterp.desc}"`} valueColor="#64748b" />
              </JsonBlock>

              {/* Event */}
              {d.event?.type && d.event.type !== 'None' && (
                <>
                  <View style={jsonStyles.sectionSpacer} />
                  <JsonBlock indent={1} keyName="événement">
                    <JsonLine indent={2} keyName="type" value={`"${d.event.type}"`} valueColor="#dc2626" />
                    {d.event.accelG && <JsonLine indent={2} keyName="accélération" value={`${d.event.accelG.toFixed(2)} G`} valueColor="#f59e0b" />}
                    {d.event.dynAccelG && <JsonLine indent={2} keyName="dynamique" value={`${d.event.dynAccelG.toFixed(2)} G`} valueColor="#f59e0b" />}
                    <JsonLine indent={2} keyName="événement_description" value={`"Mouvement brusque détecté. Possible chute dans le puits."`} valueColor="#64748b" />
                  </JsonBlock>
                </>
              )}

              <Text style={jsonStyles.code}><Text style={jsonStyles.punct}>{'}'}</Text></Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: screenHeight * 0.85, paddingBottom: 30 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontFamily: 'Ubuntu_700Bold', fontSize: 18, color: '#0f172a' },
  subtitle: { fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#64748b', marginTop: 3 },
  closeBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  codeContainer: { paddingHorizontal: 16, paddingTop: 12 },
});

const jsonStyles = StyleSheet.create({
  codeBlock: { paddingBottom: 20 },
  line: { paddingVertical: 1.5 },
  code: { fontFamily: 'monospace', fontSize: 12.5, lineHeight: 19 },
  indent: { color: 'transparent' },
  key: { color: '#0369a1' },
  punct: { color: '#334155' },
  value: { color: '#b35309' },
  sectionSpacer: { height: 6 },
  metricWrap: { marginBottom: 4 },
  descRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3, paddingRight: 16 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  descText: { fontFamily: 'Ubuntu_400Regular', fontSize: 11, color: '#64748b', lineHeight: 16, flex: 1 },
});
