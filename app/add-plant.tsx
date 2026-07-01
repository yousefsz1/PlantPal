import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type WateringFreq = 'daily' | 'weekly' | 'monthly';
type SunlightLevel = 'low' | 'medium' | 'bright';

const WATERING_OPTIONS: { value: WateringFreq; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'daily',   label: 'Daily',   icon: 'water-outline'    },
  { value: 'weekly',  label: 'Weekly',  icon: 'calendar-outline' },
  { value: 'monthly', label: 'Monthly', icon: 'moon-outline'     },
];

const SUNLIGHT_OPTIONS: { value: SunlightLevel; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'low',    label: 'Low Light', icon: 'cloud-outline'        },
  { value: 'medium', label: 'Medium',    icon: 'partly-sunny-outline' },
  { value: 'bright', label: 'Bright',    icon: 'sunny-outline'        },
];

// ─── Pill picker ──────────────────────────────────────────────────────────────

function PillPicker<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={pill.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[pill.btn, active && pill.btnActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}
            disabled={disabled}
          >
            <Ionicons
              name={opt.icon}
              size={13}
              color={active ? Colors.background : Colors.textMuted}
            />
            <Text style={[pill.label, active && pill.labelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pill = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.xs },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  label: { fontSize: FontSize.xs, fontWeight: '500', color: Colors.textMuted },
  labelActive: { color: Colors.background, fontWeight: '700' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AddPlantScreen() {
  const router = useRouter();

  const [name, setName]       = useState('');
  const [species, setSpecies] = useState('');
  const [watering, setWatering] = useState<WateringFreq>('weekly');
  const [sunlight, setSunlight] = useState<SunlightLevel>('medium');
  const [notes, setNotes]     = useState('');

  const [identifying, setIdentifying] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [identifyErr, setIdentifyErr] = useState<string | null>(null);
  const [saveErr, setSaveErr]         = useState<string | null>(null);

  const speciesRef = useRef<TextInput>(null);
  const notesRef   = useRef<TextInput>(null);

  const busy       = saving || identifying;
  const canSave    = name.trim().length > 0 && !busy;
  const canIdentify = (species.trim().length > 0 || name.trim().length > 0) && !busy;

  // ── AI identify ─────────────────────────────────────────────────────────────
  const handleIdentify = useCallback(async () => {
    const query = species.trim() || name.trim();
    if (!query) return;

    setIdentifying(true);
    setIdentifyErr(null);

    try {
      const { data, error } = await supabase.functions.invoke('identify-plant', {
        body: { query },
      });

      if (error) throw new Error(error.message ?? 'Identify failed');
      if (!data || data.error) throw new Error(data?.error ?? 'Could not identify plant');

      if (typeof data.name === 'string' && data.name) setName(data.name);
      if (typeof data.species === 'string' && data.species) setSpecies(data.species);
    } catch (err) {
      setIdentifyErr(
        err instanceof Error ? err.message : 'Identification failed. Please try again.',
      );
    } finally {
      setIdentifying(false);
    }
  }, [species, name]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    setSaveErr(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error('Not authenticated');

      const { error } = await supabase.from('plants').insert({
        user_id: userData.user.id,
        name: name.trim(),
        species: species.trim() || null,
        watering_frequency: watering,
        sunlight,
        notes: notes.trim() || null,
        level: 1,
        xp: 0,
        health_percent: 100,
        last_watered: null,
      });

      if (error) throw new Error(error.message);

      // Award 50 XP — fire-and-forget, never blocks navigation
      supabase.rpc('increment_xp', { xp_amount: 50 }).catch(() => {});

      router.back();
    } catch (err) {
      setSaveErr(
        err instanceof Error ? err.message : 'Failed to save plant. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }, [name, species, watering, sunlight, notes, router]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.closeBtn}
            disabled={busy}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add Plant</Text>
          <TouchableOpacity
            style={[s.headerSaveBtn, !canSave && s.headerSaveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <Text style={s.headerSaveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Plant name ── */}
          <View style={s.group}>
            <Text style={s.label}>
              Plant Name <Text style={s.required}>*</Text>
            </Text>
            <View style={s.inputRow}>
              <Ionicons name="leaf-outline" size={17} color={Colors.textMuted} />
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. My Monstera"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                returnKeyType="next"
                editable={!busy}
                onSubmitEditing={() => speciesRef.current?.focus()}
              />
            </View>
          </View>

          {/* ── Species + Identify ── */}
          <View style={s.group}>
            <Text style={s.label}>Species</Text>
            <View style={s.speciesRow}>
              <View style={[s.inputRow, { flex: 1 }]}>
                <Ionicons name="search-outline" size={17} color={Colors.textMuted} />
                <TextInput
                  ref={speciesRef}
                  style={s.input}
                  value={species}
                  onChangeText={(v) => { setSpecies(v); setIdentifyErr(null); }}
                  placeholder="e.g. spiky green thing"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!busy}
                  onSubmitEditing={() => notesRef.current?.focus()}
                />
              </View>
              <TouchableOpacity
                style={[s.identifyBtn, !canIdentify && s.identifyBtnDisabled]}
                onPress={handleIdentify}
                disabled={!canIdentify}
                activeOpacity={0.82}
              >
                {identifying ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <>
                    <Ionicons
                      name="color-wand-outline"
                      size={13}
                      color={canIdentify ? Colors.background : Colors.textMuted}
                    />
                    <Text style={[s.identifyBtnText, !canIdentify && s.identifyBtnTextOff]}>
                      Identify
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {identifyErr ? (
              <View style={s.inlineErr}>
                <Ionicons name="alert-circle-outline" size={13} color={Colors.danger} />
                <Text style={s.inlineErrText}>{identifyErr}</Text>
              </View>
            ) : (
              <Text style={s.helper}>Not sure? Type anything and tap Identify</Text>
            )}
          </View>

          {/* ── Watering frequency ── */}
          <View style={s.group}>
            <Text style={s.label}>Watering Frequency</Text>
            <PillPicker
              options={WATERING_OPTIONS}
              value={watering}
              onChange={setWatering}
              disabled={busy}
            />
          </View>

          {/* ── Sunlight ── */}
          <View style={s.group}>
            <Text style={s.label}>Sunlight Needs</Text>
            <PillPicker
              options={SUNLIGHT_OPTIONS}
              value={sunlight}
              onChange={setSunlight}
              disabled={busy}
            />
          </View>

          {/* ── Notes ── */}
          <View style={s.group}>
            <Text style={s.label}>
              Notes <Text style={s.optional}>(optional)</Text>
            </Text>
            <View style={[s.inputRow, s.notesWrap]}>
              <TextInput
                ref={notesRef}
                style={[s.input, s.notesInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Location, quirks, reminders…"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!busy}
              />
            </View>
          </View>

          {/* ── Save error ── */}
          {saveErr ? (
            <View style={s.saveErr}>
              <Ionicons name="alert-circle-outline" size={15} color={Colors.danger} />
              <Text style={s.saveErrText}>{saveErr}</Text>
            </View>
          ) : null}

          {/* ── Primary save button ── */}
          <TouchableOpacity
            style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={19} color={Colors.textPrimary} />
                <Text style={s.saveBtnText}>Save Plant</Text>
                <View style={s.xpPill}>
                  <Ionicons name="star" size={11} color={Colors.background} />
                  <Text style={s.xpPillText}>+50 XP</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSaveBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveBtnDisabled: { opacity: 0.38 },
  headerSaveBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.background },

  // ── Form ─────────────────────────────────────────────────────────────────────
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  group: { marginBottom: Spacing.lg },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: 6, marginLeft: 2 },
  required: { color: Colors.danger },
  optional: { color: Colors.textMuted, fontWeight: '400' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    padding: 0,
  },

  // ── Species row ───────────────────────────────────────────────────────────
  speciesRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },

  identifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.md,
    minWidth: 88,
    justifyContent: 'center',
  },
  identifyBtnDisabled: { backgroundColor: Colors.surfaceElevated },
  identifyBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.background },
  identifyBtnTextOff: { color: Colors.textMuted },

  helper: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 6, marginLeft: 2 },
  inlineErr: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  inlineErrText: { fontSize: FontSize.xs, color: Colors.danger, flex: 1 },

  // ── Notes ─────────────────────────────────────────────────────────────────
  notesWrap: { alignItems: 'flex-start', paddingVertical: Spacing.sm },
  notesInput: { minHeight: 76, textAlignVertical: 'top' },

  // ── Save error ────────────────────────────────────────────────────────────
  saveErr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#2D1010',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.danger,
    marginBottom: Spacing.md,
  },
  saveErrText: { flex: 1, fontSize: FontSize.sm, color: Colors.danger },

  // ── Save button ───────────────────────────────────────────────────────────
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
  },
  saveBtnDisabled: { opacity: 0.42 },
  saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.xp,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginLeft: 2,
  },
  xpPillText: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.background },
});
