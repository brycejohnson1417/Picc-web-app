import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

type TabKey = 'map' | 'accounts' | 'route' | 'calendar' | 'settings';

type Store = {
  id: string;
  notionPageId: string;
  name: string;
  status: string;
  locationAddress: string | null;
  phoneNumber?: string | null;
};

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('map');
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [offlineQueue, setOfflineQueue] = useState<Array<{ storeId: string; noteText: string; happenedAt: string }>>([]);

  useEffect(() => {
    void fetchStores();
  }, []);

  async function fetchStores() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/territory/stores`);
      const payload = await response.json();
      setStores(Array.isArray(payload?.stores) ? payload.stores : []);
    } catch {
      setStores([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitCheckIn(noteText: string, store: Store) {
    const happenedAt = new Date().toISOString();
    try {
      const response = await fetch(`${API_BASE}/api/territory/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: {
            id: store.id,
            notionPageId: store.notionPageId,
            name: store.name,
          },
          mode: 'written',
          noteText,
        }),
      });

      if (!response.ok) {
        throw new Error('request failed');
      }
    } catch {
      setOfflineQueue((prev) => [...prev, { storeId: store.id, noteText, happenedAt }]);
    }
  }

  const filteredStores = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return stores;
    return stores.filter((store) => `${store.name} ${store.locationAddress ?? ''} ${store.status}`.toLowerCase().includes(normalized));
  }, [stores, query]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>PICC Field</Text>
        <Text style={styles.headerMeta}>{offlineQueue.length} queued sync items</Text>
      </View>

      <View style={styles.content}>
        {activeTab === 'map' ? <MapScreen stores={filteredStores} loading={loading} onSelectStore={setSelectedStore} onRefresh={fetchStores} /> : null}
        {activeTab === 'accounts' ? <AccountsScreen stores={filteredStores} query={query} onQuery={setQuery} onSelectStore={setSelectedStore} /> : null}
        {activeTab === 'route' ? <RouteScreen stores={filteredStores.slice(0, 20)} /> : null}
        {activeTab === 'calendar' ? <CalendarScreen /> : null}
        {activeTab === 'settings' ? <SettingsScreen /> : null}
      </View>

      {selectedStore ? <AccountDetailCard store={selectedStore} onClose={() => setSelectedStore(null)} onCheckIn={submitCheckIn} /> : null}

      <View style={styles.tabBar}>
        {([
          ['map', 'Map'],
          ['accounts', 'Accounts'],
          ['route', 'Route'],
          ['calendar', 'Calendar'],
          ['settings', 'Settings'],
        ] as Array<[TabKey, string]>).map(([key, label]) => (
          <Pressable key={key} onPress={() => setActiveTab(key)} style={[styles.tab, activeTab === key ? styles.tabActive : null]}>
            <Text style={[styles.tabLabel, activeTab === key ? styles.tabLabelActive : null]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <StatusBar style="light" />
    </SafeAreaView>
  );
}

function MapScreen({ stores, loading, onSelectStore, onRefresh }: { stores: Store[]; loading: boolean; onSelectStore: (store: Store) => void; onRefresh: () => Promise<void> }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>Map</Text>
      <Text style={styles.sectionSub}>Map rendering and layers are provided by the web territory APIs in this parity build.</Text>
      <Pressable style={styles.primaryBtn} onPress={() => void onRefresh()}>
        <Text style={styles.primaryBtnText}>Refresh Stores</Text>
      </Pressable>
      {loading ? <ActivityIndicator color="#fff" /> : null}
      <ScrollView style={{ marginTop: 12 }}>
        {stores.slice(0, 30).map((store) => (
          <Pressable key={store.id} onPress={() => onSelectStore(store)} style={styles.rowCard}>
            <Text style={styles.rowTitle}>{store.name}</Text>
            <Text style={styles.rowMeta}>{store.locationAddress || 'No address'}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function AccountsScreen({ stores, query, onQuery, onSelectStore }: { stores: Store[]; query: string; onQuery: (value: string) => void; onSelectStore: (store: Store) => void }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>Accounts</Text>
      <TextInput style={styles.input} placeholder="Search accounts" placeholderTextColor="#94a3b8" value={query} onChangeText={onQuery} />
      <ScrollView>
        {stores.map((store) => (
          <Pressable key={store.id} onPress={() => onSelectStore(store)} style={styles.rowCard}>
            <Text style={styles.rowTitle}>{store.name}</Text>
            <Text style={styles.rowMeta}>{store.status}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function RouteScreen({ stores }: { stores: Store[] }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>Route</Text>
      <Text style={styles.sectionSub}>Route optimization service remains active through existing API endpoints.</Text>
      <ScrollView>
        {stores.map((store, index) => (
          <View key={store.id} style={styles.rowCard}>
            <Text style={styles.rowTitle}>{index + 1}. {store.name}</Text>
            <Text style={styles.rowMeta}>{store.locationAddress || 'No address'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function CalendarScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>Calendar</Text>
      <Text style={styles.sectionSub}>Calendar parity scaffold is in place for connected scheduling workflows.</Text>
    </View>
  );
}

function SettingsScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.sectionTitle}>Settings</Text>
      <Text style={styles.sectionSub}>Configuration hooks for map layers, sync, and account preferences.</Text>
    </View>
  );
}

function AccountDetailCard({ store, onClose, onCheckIn }: { store: Store; onClose: () => void; onCheckIn: (noteText: string, store: Store) => Promise<void> }) {
  const [noteText, setNoteText] = useState('');

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{store.name}</Text>
        <Pressable onPress={onClose}><Text style={styles.close}>Close</Text></Pressable>
      </View>
      <Text style={styles.rowMeta}>{store.locationAddress || 'No address'}</Text>
      <TextInput
        style={[styles.input, { marginTop: 10 }]}
        placeholder="Check-in notes"
        placeholderTextColor="#94a3b8"
        value={noteText}
        onChangeText={setNoteText}
      />
      <Pressable style={styles.primaryBtn} onPress={() => void onCheckIn(noteText, store)}>
        <Text style={styles.primaryBtnText}>Check-in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0f1116' },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#1f2430' },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '700' },
  headerMeta: { color: '#9ca3af', marginTop: 4 },
  content: { flex: 1, paddingHorizontal: 14, paddingTop: 12 },
  screen: { flex: 1 },
  sectionTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  sectionSub: { color: '#9ca3af', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#2f3747', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', backgroundColor: '#151923' },
  rowCard: { borderWidth: 1, borderColor: '#2d3442', borderRadius: 10, backgroundColor: '#161b25', padding: 12, marginBottom: 8 },
  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  rowMeta: { color: '#a6b0c2', marginTop: 4 },
  primaryBtn: { marginTop: 10, borderRadius: 10, backgroundColor: '#d13a16', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1f2430', backgroundColor: '#10141d', paddingBottom: 6, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabActive: { backgroundColor: '#1b2231' },
  tabLabel: { color: '#7f8aa3', fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 72, borderRadius: 14, backgroundColor: '#151923', borderWidth: 1, borderColor: '#303a4f', padding: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: '#fff', fontWeight: '700', fontSize: 18 },
  close: { color: '#93c5fd', fontWeight: '600' },
});
