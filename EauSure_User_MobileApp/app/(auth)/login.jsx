import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, 
  KeyboardAvoidingView, Platform, ActivityIndicator, 
  ScrollView, StyleSheet, Image 
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Feather } from '@expo/vector-icons'; 
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';


import WaterBackground from '../../components/VideoBackground';
import CustomModal from '../../components/CustomModal';
import Reveal from '../../components/Reveal';
import { useOAuth } from '../../hooks/useOAuth';


export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'error' });
  
  const params = useLocalSearchParams(); 
  const { login, loginWithToken } = useAuth();

  const router = useRouter();
  const oauthHandledRef = useRef(false);

  const showAlert = (title, message, type = 'error') => {
    setModalContent({ title, message, type });
    setModalVisible(true);
  };

  const { signInWithGoogle, signInWithGitHub } = useOAuth(showAlert);

  useFocusEffect(
    useCallback(() => {
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setIsLoading(false);
      setLoadingProvider(null);
      setIsOAuthLoading(false);
      setModalVisible(false);
    }, [])
  );

  useEffect(() => {
    if (!params.error && !params.token) return;
    if (oauthHandledRef.current) return;

    oauthHandledRef.current = true;

    if (params.error) {
      showAlert(
        'Erreur',
        params.error === 'user_not_found'
          ? "Compte inexistant. Veuillez vous inscrire."
          : 'Connexion échouée.',
        'error'
      );
      return;
    }

    if (params.token) {
      setModalContent({
        title: 'Connexion réussie',
        message: 'Ravi de vous revoir sur EauSûre.',
        type: 'success',
        token: params.token,
        nextRoute: '/(tabs)'
      });
      setModalVisible(true);
    }
  }, [params.token, params.error]);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Champs requis', 'Veuillez saisir votre email et votre mot de passe.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        showAlert('Connexion échouée', 'Email ou mot de passe incorrect.');
      } else {
         router.replace('/(tabs)');
      }
    } catch (e) {
      showAlert('Erreur', 'Une erreur technique est survenue.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    oauthHandledRef.current = false;
    setLoadingProvider('google');
    try {
      await signInWithGoogle();
    } catch (error) {
      showAlert('Erreur', 'La connexion avec Google a échoué.');
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGithubLogin = async () => {
    oauthHandledRef.current = false;
    setLoadingProvider('github');
    try {
      await signInWithGitHub();
    } catch (error) {
      showAlert('Erreur', 'La connexion avec GitHub a échoué.');
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}> 
      <WaterBackground />
      <StatusBar style="light" />
      <CustomModal 
        visible={modalVisible}
        title={modalContent.title}
        message={modalContent.message}
        type={modalContent.type}
        onClose={async () => {
          setModalVisible(false);
          router.setParams({ error: null, token: null });
          if (modalContent.token) {
            await loginWithToken(modalContent.token);
            router.replace(modalContent.nextRoute);
          }
        }}
      />
      <SafeAreaView style={{ flex: 1 }}>
        
        <Reveal delay={0}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color="white" />
          </TouchableOpacity>
        </Reveal>

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled" 
          >
            <View style={styles.innerContainer}>
              
              <Reveal delay={100}>
                <View style={styles.header}>
                  {/* Removed SVG Logo, Centered Text */}
                  <Text style={styles.title}>Bienvenue</Text> 
                  <Text style={styles.subtitle}>Connectez-vous à EauSûre</Text>
                </View>
              </Reveal>

              <Reveal delay={200}>
                <View style={styles.form}>
                  <View style={styles.inputContainer}>
                    <Feather name="mail" size={20} color="#E2E8F0" />
                    <TextInput
                      style={styles.input}
                      placeholder="Adresse email"
                      placeholderTextColor="#94A3B8"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Feather name="lock" size={20} color="#E2E8F0" />
                    <TextInput
                      style={styles.input}
                      placeholder="Mot de passe"
                      placeholderTextColor="#94A3B8"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#E2E8F0" />
                    </TouchableOpacity>
                  </View>
                </View>
              </Reveal>

              <Reveal delay={300}>
                <View style={styles.actions}>
                  <TouchableOpacity 
                    style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
                    onPress={handleLogin}
                    disabled={isLoading || isOAuthLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#2563EB" />
                    ) : (
                      <Text style={styles.loginButtonText}>Se connecter</Text>
                    )}
                  </TouchableOpacity>

                  <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OU</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <View style={styles.oauthContainer}>
                    {/* Google Button - Solid White */}
                    <TouchableOpacity 
                      style={[styles.oauthButton, styles.googleButton, isOAuthLoading && styles.oauthButtonDisabled]}
                      onPress={handleGoogleLogin}
                      disabled={isLoading || isOAuthLoading}
                    >
                      {loadingProvider === 'google' ? (
                        <ActivityIndicator color="#000" size="small" />
                      ) : (
                        <>
                          <Image 
                            source={{ uri: 'https://www.freepnglogos.com/uploads/google-logo-png/google-logo-png-suite-everything-you-need-know-about-google-newest-0.png' }} 
                            style={styles.oauthLogo} 
                            resizeMode="contain"
                          />
                          <Text style={styles.googleButtonText}>Google</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* GitHub Button - Solid Black */}
                    <TouchableOpacity 
                      style={[styles.oauthButton, styles.githubButton, isOAuthLoading && styles.oauthButtonDisabled]}
                      onPress={handleGithubLogin}
                      disabled={isLoading || isOAuthLoading}
                    >
                      {loadingProvider === 'github' ? ( 
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <>
                          <Image 
                            source={{ uri: 'https://cdn-icons-png.flaticon.com/512/25/25231.png' }} 
                            style={[styles.oauthLogo, { tintColor: 'white' }]} 
                            resizeMode="contain"
                          />
                          <Text style={styles.githubButtonText}>GitHub</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.signupContainer}>
                    <Text style={styles.signupText}>Pas encore de compte ? </Text>
                    <TouchableOpacity onPress={() => router.push('/register')}>
                      <Text style={styles.signupLink}>Créer un compte</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Reveal>

            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
  backButton: { marginLeft: 20, marginTop: 10 },
  innerContainer: { paddingHorizontal: 32 },
  
  // Header Aligned with Register
  header: { 
    alignItems: 'center', 
    marginBottom: 40 
  },
  title: { 
    fontSize: 32, 
    fontWeight: 'bold', 
    color: '#FFFFFF', 
    marginBottom: 8 // Slight adjustment for spacing
  },
  subtitle: { 
    fontSize: 16, 
    color: '#CBD5E1' 
  },
  
  form: { gap: 16 },
  inputContainer: {
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    borderRadius: 20, 
    paddingHorizontal: 20, 
    height: 60, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.3)'
  },
  input: { 
    flex: 1, 
    marginLeft: 10, 
    color: '#FFF',
    fontSize: 16
  },
  
  actions: { marginTop: 40 },
  loginButton: { 
    backgroundColor: '#FFF', 
    padding: 18, 
    borderRadius: 20, 
    alignItems: 'center' 
  },
  loginButtonDisabled: { opacity: 0.7 },
  loginButtonText: { 
    color: '#2563EB', 
    fontWeight: 'bold', 
    fontSize: 18 
  },
  
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)'
  },
  dividerText: {
    color: '#CBD5E1',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500'
  },
  
  // OAuth Buttons (Solid Colors)
  oauthContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  oauthButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingVertical: 14,
    gap: 10,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
  },
  githubButton: {
    backgroundColor: '#171515',
  },
  oauthButtonDisabled: {
    opacity: 0.7
  },
  googleButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600'
  },
  githubButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600'
  },
  oauthLogo: {
    width: 24,
    height: 24
  },
  
  signupContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    marginTop: 20 
  },
  signupText: { color: '#CBD5E1' },
  signupLink: { 
    color: '#FFF', 
    fontWeight: 'bold' 
  }
});