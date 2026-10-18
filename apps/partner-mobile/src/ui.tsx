import { ApiError } from '@flower-man/api-client';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = { brand: '#b5446e', ink: '#1f2328', muted: '#6b7280', line: '#e7e2dc', bg: '#faf8f5', ok: '#1a7f37', bad: '#cf222e' };

export function Screen({ title, onBack, children, scroll = true, right }: { title: string; onBack?: () => void; children: ReactNode; scroll?: boolean; right?: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {onBack ? <Pressable onPress={onBack} hitSlop={12}><Text style={styles.back}>‹ Back</Text></Pressable> : <View style={{ width: 48 }} />}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={{ minWidth: 48, alignItems: 'flex-end' }}>{right}</View>
      </View>
      {scroll ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, kind === 'secondary' && styles.buttonSecondary, kind === 'danger' && styles.buttonDanger, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[styles.buttonText, kind === 'secondary' && { color: colors.ink }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Card({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>{children}</Pressable>
  ) : (
    <View style={styles.card}>{children}</View>
  );
}

export const Muted = ({ children }: { children: ReactNode }) => <Text style={{ color: colors.muted }}>{children}</Text>;
export const Strong = ({ children }: { children: ReactNode }) => <Text style={{ fontWeight: '700', color: colors.ink }}>{children}</Text>;
export const Body = ({ children }: { children: ReactNode }) => <Text style={{ color: colors.ink }}>{children}</Text>;
export const Loading = () => <ActivityIndicator color={colors.brand} style={{ marginTop: 32 }} />;

export function Pill({ label }: { label: string }) {
  return <Text style={styles.pill}>{label.replaceAll('_', ' ')}</Text>;
}

/** Runs an async action and shows API errors to the user. */
export async function attempt(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    Alert.alert('Flower Man', error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.');
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', color: colors.ink, flex: 1, textAlign: 'center' },
  back: { color: colors.brand, fontSize: 16, width: 48 },
  content: { padding: 16, gap: 12 },
  button: { backgroundColor: colors.brand, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  buttonDanger: { backgroundColor: colors.bad },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  label: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 16, color: colors.ink },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.line, gap: 4 },
  pill: { alignSelf: 'flex-start', backgroundColor: '#f3e3ea', color: colors.brand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 12, overflow: 'hidden' },
});
