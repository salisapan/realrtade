import { Text, View, StyleSheet } from 'react-native';

export default function Home() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Open loops</Text>
      <Text style={styles.sub}>Share or forward from WhatsApp, Mail, or Messenger to close a loop.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 8 },
  sub: { fontSize: 16, color: '#444' }
});
