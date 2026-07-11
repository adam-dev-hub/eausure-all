// app/(auth)/_layout.jsx
import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';

export default function AuthLayout() {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade', // Smooth fade between Login/Register
          contentStyle: {
            backgroundColor: '#0f172a', // <--- PREVENTS WHITE FLASH
          },
        }}
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack>
    </>
  );
}