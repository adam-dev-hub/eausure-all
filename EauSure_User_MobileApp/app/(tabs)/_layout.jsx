import { Tabs } from 'expo-router';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { Activity, Gauge, Home, Scan, Settings } from 'lucide-react-native';

const COLORS = {
  primary: '#0ea5e9',
  primaryDark: '#0369a1',
  inactive: '#64748b',
  surface: '#ffffff',
  shadow: '#0f172a',
};

function StandardTabIcon({ Icon, label, color, focused }) {
  return (
    <View style={styles.standardItem}>
      <Icon size={21} color={focused ? COLORS.primaryDark : color} strokeWidth={focused ? 2.6 : 2.1} />
      <Text style={[styles.standardLabel, focused && styles.standardLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}



export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: Platform.OS === 'ios' ? 86 : 78,
          paddingTop: 11,
          paddingBottom: Platform.OS === 'ios' ? 24 : 14,
          paddingHorizontal: 14,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderColor: '#e2e8f0',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          elevation: 18,
          shadowColor: COLORS.shadow,
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
        },
        tabBarItemStyle: {
          height: 54,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }) => <StandardTabIcon Icon={Home} label="Accueil" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="telemetry"
        options={{
          title: 'Télémétrie',
          tabBarIcon: ({ color, focused }) => <StandardTabIcon Icon={Activity} label="Télém." color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, focused }) => <StandardTabIcon Icon={Scan} label="Scanner" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="materiel"
        options={{
          title: 'Matériel',
          tabBarIcon: ({ color, focused }) => <StandardTabIcon Icon={Gauge} label="Matériel" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Réglages',
          tabBarIcon: ({ color, focused }) => <StandardTabIcon Icon={Settings} label="Réglages" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  standardItem: {
    width: 66,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  standardLabel: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
    color: COLORS.inactive,
    lineHeight: 14,
  },
  standardLabelActive: {
    color: COLORS.primaryDark,
  },

});
