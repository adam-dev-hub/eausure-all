import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Paho from 'paho-mqtt';
import { useAuth } from './AuthContext';

const MqttContext = createContext();

export const useMqtt = () => {
  return useContext(MqttContext);
};

export const MqttProvider = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [latestData, setLatestData] = useState(null); // the last received telemetry data
  const clientRef = useRef(null);

  const BROKER_URL = process.env.EXPO_PUBLIC_MQTT_BROKER_URL;
  const USERNAME = process.env.EXPO_PUBLIC_MQTT_USERNAME;
  const PASSWORD = process.env.EXPO_PUBLIC_MQTT_PASSWORD;
  const TOPIC = process.env.EXPO_PUBLIC_MQTT_TOPIC || 'water-quality/live-data';

  useEffect(() => {
    // Only connect if the user is authenticated (to filter by userId)
    if (!user || !user.id || !BROKER_URL) return;

    // The broker URL is usually like: wss://<host>:<port>/mqtt
    // paho-mqtt expects host, port, path separately
    // Let's parse it roughly (assuming wss://host:port/path)
    let host = '';
    let port = 443;
    let path = '/mqtt';
    
    try {
      const url = new URL(BROKER_URL);
      host = url.hostname;
      port = parseInt(url.port || (url.protocol === 'wss:' ? '443' : '80'), 10);
      path = url.pathname || '/mqtt';
    } catch (e) {
      console.warn('[MQTT] Error parsing broker URL, fallback to defaults', e);
    }

    const clientId = `app-${user.id}-${Math.floor(Math.random() * 100000)}`;
    const client = new Paho.Client(host, port, path, clientId);

    client.onConnectionLost = (responseObject) => {
      setIsConnected(false);
      console.log('[MQTT] Connection lost:', responseObject.errorMessage);
      // Paho can auto-reconnect if configured, or we can rely on its reconnect logic
    };

    client.onMessageArrived = (message) => {
      try {
        const payload = JSON.parse(message.payloadString);
        // Filter by user ID: only accept data for this user's gateways
        if (payload.userId === user.id) {
          console.log('[MQTT] Received data for node:', payload.nodeId);
          setLatestData(payload);
        }
      } catch (err) {
        console.warn('[MQTT] Failed to parse message:', err);
      }
    };

    const connectOptions = {
      userName: USERNAME,
      password: PASSWORD,
      useSSL: true,
      timeout: 10,
      reconnect: true,
      onSuccess: () => {
        console.log('[MQTT] Connected to broker');
        setIsConnected(true);
        // Subscribe to the global topic (or a user-specific one if we had it)
        client.subscribe(TOPIC, { qos: 1 });
        console.log('[MQTT] Subscribed to:', TOPIC);
      },
      onFailure: (err) => {
        console.log('[MQTT] Connection failed:', err.errorMessage);
        setIsConnected(false);
      }
    };

    console.log('[MQTT] Attempting connection to', host, port, path);
    client.connect(connectOptions);
    clientRef.current = client;

    return () => {
      if (clientRef.current && clientRef.current.isConnected()) {
        clientRef.current.disconnect();
        console.log('[MQTT] Disconnected');
      }
    };
  }, [user]);

  return (
    <MqttContext.Provider value={{ isConnected, latestData }}>
      {children}
    </MqttContext.Provider>
  );
};
