import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import type { Plant } from '../../types/database';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';

function XPBar({ value, max = 1000 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <View style={styles.xpBarBg}>
      <View style={[styles.xpBarFill, { width: `${pct}%` }]} />
    </View>
  );
}

function PlantCard({ name, species, level, xp, health_percent }: Plant) {
  return (
    <View style={styles.plantCard}>
      <View style={styles.plantIconWrapper}>
        <Ionicons name="leaf" size={28} color={Colors.primary} />
      </View>
      <View style={styles.plantInfo}>
        <View style={styles.plantRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.plantName}>{name}</Text>
            {species ? <Text style={styles.plantSpecies}>{species}</Text> : null}
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>Lv {level}</Text>
          </View>
        </View>
        <Text style={styles.healthLabel}>Health {health_percent}%</Text>
        <XPBar value={xp} max={level * 200} />
        <Text style={styles.xpText}>{xp} XP</Text>
      </View>
    </View>
  );
}

function EmptyGarden({ onAddFirst }: { onAddFirst: () => void }) {
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="leaf-outline" size={72} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>Your garden is empty</Text>
      <Text style={styles.emptySubtitle}>
        Add your first plant to start earning XP and levelling up your garden.
      </Text>
      <TouchableOpacity style={styles.addFirstBtn} onPress={onAddFirst}>
        <Ionicons name="add" size={20} color={Colors.textPrimary} />
        <Text style={styles.addFirstBtnText}>Add First Plant</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function GardenScreen() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalXP = plants.reduce((sum, p) => sum + p.xp, 0);

  const fetchPlants = useCallback(async () => {
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('plants')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setPlants(data ?? []);
    }
  }, []);

  useEffect(() => {
    fetchPlants().finally(() => setLoading(false));
  }, [fetchPlants]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPlants();
    setRefreshing(false);
  }, [fetchPlants]);

  const handleAddFirst = () => {
    // TODO: navigate to add-plant screen
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, !loading && plants.length === 0 && styles.contentCentered]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good morning 🌱</Text>
            <Text style={styles.title}>My Garden</Text>
          </View>
          <TouchableOpacity style={styles.addBtn}>
            <Ionicons name="add" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="trophy" size={20} color={Colors.xp} />
            <Text style={styles.statValue}>{totalXP.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="leaf" size={20} color={Colors.primary} />
            <Text style={styles.statValue}>{plants.length}</Text>
            <Text style={styles.statLabel}>Plants</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="flame" size={20} color={Colors.warning} />
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
        </View>

        {/* Plant list / states */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="warning-outline" size={32} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchPlants}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : plants.length === 0 ? (
          <EmptyGarden onAddFirst={handleAddFirst} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Your Plants</Text>
            {plants.map((p) => (
              <PlantCard key={p.id} {...p} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  contentCentered: { flexGrow: 1 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  greeting: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  title: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted },

  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  plantCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  plantIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plantInfo: { flex: 1, gap: 4 },
  plantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  plantName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  plantSpecies: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  levelBadge: {
    backgroundColor: Colors.primaryDark,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },
  healthLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  xpBarBg: {
    height: 4,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: 2,
  },
  xpBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radius.full },
  xpText: { fontSize: FontSize.xs, color: Colors.textMuted },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },

  errorContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    gap: Spacing.sm,
  },
  errorText: { fontSize: FontSize.sm, color: Colors.danger, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
  },
  retryText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 40,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  addFirstBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
});
