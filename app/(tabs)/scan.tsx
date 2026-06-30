import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useIsFocused } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

type HealthStatus = 'healthy' | 'mild' | 'serious' | 'critical';

interface ScanResult {
  name: string;
  species: string;
  status: HealthStatus;
  issues: string[];
  fixPlan: string[];
}

type Phase = 'camera' | 'analyzing' | 'result';

const STATUS_CONFIG: Record<HealthStatus, { label: string; color: string; bg: string }> = {
  healthy:  { label: 'Healthy',  color: Colors.primary, bg: '#0B2A14' },
  mild:     { label: 'Mild',     color: Colors.warning, bg: '#2E1E00' },
  serious:  { label: 'Serious',  color: Colors.serious, bg: '#2E1200' },
  critical: { label: 'Critical', color: Colors.danger,  bg: '#2E0808' },
};

const HEALTH_MAP: Record<HealthStatus, number> = {
  healthy: 100,
  mild: 70,
  serious: 40,
  critical: 15,
};

async function callAnalyzeEdge(base64: string, mediaType: string): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke('analyze-plant', {
    body: { image: base64, mediaType },
  });
  if (error) throw new Error(error.message ?? 'Edge function error');
  if (!data || typeof data !== 'object') throw new Error('Invalid response from analysis service');
  if ('error' in data) throw new Error((data as { error: string }).error);
  return data as ScanResult;
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [xpTotal, setXpTotal] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const runAnalysis = useCallback(async (uri: string, base64: string, mediaType: string) => {
    setPhotoUri(uri);
    setPhase('analyzing');
    setAnalyzeError(null);
    setResult(null);
    setSaved(false);
    setXpTotal(null);

    try {
      const scanResult = await callAnalyzeEdge(base64, mediaType);
      setResult(scanResult);
      setPhase('result');

      // Award +30 XP — fire and forget, doesn't block the result screen
      supabase
        .rpc('increment_xp', { xp_amount: 30 })
        .then(({ data }) => setXpTotal(typeof data === 'number' ? data : 30))
        .catch(() => setXpTotal(30));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      setAnalyzeError(msg);
      setPhase('camera');
    }
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) {
        setAnalyzeError('Failed to capture photo. Please try again.');
        return;
      }
      await runAnalysis(photo.uri, photo.base64, 'image/jpeg');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not capture photo.';
      setAnalyzeError(msg);
    }
  }, [runAnalysis]);

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access in Settings to pick a plant photo.',
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      base64: true,
      quality: 0.5,
      allowsEditing: false,
    });

    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    if (!asset.base64) {
      setAnalyzeError('Could not read image data. Please try a different photo.');
      return;
    }

    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType =
      asset.mimeType && supportedTypes.includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';

    await runAnalysis(asset.uri, asset.base64, mediaType);
  }, [runAnalysis]);

  const handleSaveToGarden = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Not authenticated');

      const { error } = await supabase.from('plants').insert({
        user_id: userData.user.id,
        name: result.name,
        species: result.species,
        level: 1,
        xp: 0,
        health_percent: HEALTH_MAP[result.status],
        last_watered: null,
      });

      if (error) throw new Error(error.message);
      setSaved(true);
      setTimeout(() => router.replace('/(tabs)'), 1200);
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Could not save plant. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [result, router]);

  const resetScan = useCallback(() => {
    setPhase('camera');
    setPhotoUri(null);
    setResult(null);
    setAnalyzeError(null);
    setXpTotal(null);
    setSaved(false);
  }, []);

  // ─── Permission loading ────────────────────────────────────────────────────
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  // ─── Permission denied ─────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.permissionWrap}>
          <Ionicons name="camera-outline" size={64} color={Colors.primary} style={{ opacity: 0.8 }} />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionBody}>
            PlantPal needs camera access to scan and identify your plants.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Analyzing ─────────────────────────────────────────────────────────────
  if (phase === 'analyzing') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.analyzingWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.analyzingPhoto} resizeMode="cover" />
          ) : null}
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.analyzingTitle}>Analyzing your plant…</Text>
            <Text style={styles.analyzingSubtitle}>Powered by Claude AI</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Result ────────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const cfg = STATUS_CONFIG[result.status];
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Photo + XP banner */}
          <View style={styles.resultPhotoWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.resultPhoto} resizeMode="cover" />
            ) : null}
            {xpTotal !== null ? (
              <View style={styles.xpBanner}>
                <Ionicons name="star" size={13} color={Colors.xp} />
                <Text style={styles.xpBannerText}>+30 XP earned!</Text>
              </View>
            ) : null}
          </View>

          {/* Identity */}
          <View style={styles.identityCard}>
            <Text style={styles.plantName}>{result.name}</Text>
            <Text style={styles.plantSpecies}>{result.species}</Text>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
              <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          {/* Issues */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {result.issues.length > 0 ? 'Issues Detected' : 'Plant Health'}
            </Text>
            {result.issues.length > 0 ? (
              result.issues.map((issue, i) => (
                <View key={i} style={styles.listRow}>
                  <Ionicons name="alert-circle" size={15} color={Colors.warning} style={styles.listIcon} />
                  <Text style={styles.listText}>{issue}</Text>
                </View>
              ))
            ) : (
              <View style={styles.listRow}>
                <Ionicons name="checkmark-circle" size={15} color={Colors.primary} style={styles.listIcon} />
                <Text style={[styles.listText, { color: Colors.primary }]}>
                  No issues detected — your plant is thriving!
                </Text>
              </View>
            )}
          </View>

          {/* Fix plan */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {result.status === 'healthy' ? 'Care Tips' : '3-Step Fix Plan'}
            </Text>
            {result.fixPlan.map((step, i) => (
              <View key={i} style={styles.fixRow}>
                <View style={styles.fixNum}>
                  <Text style={styles.fixNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.fixText}>{step}</Text>
              </View>
            ))}
          </View>

          {/* Actions */}
          <TouchableOpacity
            style={[styles.primaryBtn, styles.saveBtn, saved && styles.saveBtnDone]}
            onPress={handleSaveToGarden}
            disabled={saving || saved}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : saved ? (
              <>
                <Ionicons name="checkmark-circle" size={19} color={Colors.textPrimary} />
                <Text style={styles.primaryBtnText}>Saved to Garden!</Text>
              </>
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={19} color={Colors.textPrimary} />
                <Text style={styles.primaryBtnText}>Save to Garden</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={resetScan} activeOpacity={0.7}>
            <Ionicons name="scan-outline" size={17} color={Colors.primary} />
            <Text style={styles.secondaryBtnText}>Scan Another Plant</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Camera viewfinder ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cameraWrap}>
        <Text style={styles.title}>Scan Plant</Text>
        <Text style={styles.subtitle}>Point at a plant and tap the button to identify it</Text>

        {analyzeError ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
            <Text style={styles.errorText}>{analyzeError}</Text>
          </View>
        ) : null}

        <View style={styles.viewfinder}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            active={isFocused}
          />
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} activeOpacity={0.85}>
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>

        <Text style={styles.orText}>— or —</Text>

        <TouchableOpacity style={styles.libraryBtn} onPress={handlePickImage} activeOpacity={0.7}>
          <Ionicons name="image-outline" size={19} color={Colors.primary} />
          <Text style={styles.libraryBtnText}>Choose from Library</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Permission screen ──────────────────────────────────────────────────────
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  permissionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Analyzing screen ──────────────────────────────────────────────────────
  analyzingWrap: { flex: 1 },
  analyzingPhoto: { width: '100%', height: '100%' },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,40,24,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  analyzingTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  analyzingSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary },

  // ── Result screen ─────────────────────────────────────────────────────────
  resultContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  resultPhotoWrap: {
    width: '100%',
    height: 220,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    position: 'relative',
  },
  resultPhoto: { width: '100%', height: '100%' },
  xpBanner: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.xp,
  },
  xpBannerText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.xp },

  identityCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  plantName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  plantSpecies: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: FontSize.sm, fontWeight: '600' },

  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  listIcon: { marginTop: 1 },
  listText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  fixRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  fixNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  fixNumText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.background },
  fixText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  saveBtn: { marginTop: Spacing.sm },
  saveBtnDone: { backgroundColor: Colors.primaryDark },

  // ── Camera screen ─────────────────────────────────────────────────────────
  cameraWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#2D1010',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
    width: '100%',
    marginBottom: Spacing.sm,
  },
  errorText: { flex: 1, fontSize: FontSize.sm, color: Colors.danger },

  viewfinder: {
    width: '100%',
    flex: 1,
    maxHeight: 340,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.primary,
    position: 'relative',
    backgroundColor: Colors.surface,
    marginBottom: Spacing.lg,
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: Colors.primary,
    borderWidth: 3,
  },
  cornerTL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
  },
  orText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },

  // ── Shared ────────────────────────────────────────────────────────────────
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    width: '100%',
  },
  primaryBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
    width: '100%',
  },
  secondaryBtnText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },

  libraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  libraryBtnText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: '600' },
});
