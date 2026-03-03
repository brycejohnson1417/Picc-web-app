import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, Text, View } from 'react-native';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#13151a' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>PICC Field</Text>
        <Text style={{ color: '#b8beca', fontSize: 16, marginTop: 8, textAlign: 'center' }}>
          Native shell scaffolded. Feature parity screens are implemented in Agent 4.
        </Text>
      </View>
      <StatusBar style="light" />
    </SafeAreaView>
  );
}
