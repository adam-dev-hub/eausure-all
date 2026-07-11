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


export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState(null);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [postSuccessRoute, setPostSuccessRoute] = useState(null);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'error' });

  const params = useLocalSearchParams();
  const { register, loginWithToken } = useAuth(); 
  const router = useRouter();
  const oauthHandledRef = useRef(false);

  const showAlert = (title, message, type = 'error') => {
    setModalContent({ title, message, type });
    setModalVisible(true);
  };

  const { signInWithGoogle, signInWithGitHub } = useOAuth(showAlert, true);

  useFocusEffect(
    useCallback(() => {
      setName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setIsLoading(false);
      setLoadingProvider(null);
      setIsOAuthLoading(false);
      setModalVisible(false);
    }, [])
  );

  const getPasswordScore = (pass) => {
  if (!pass) return 0;

  let score = 0;

  const hasMin = /[a-z]/.test(pass);
  const hasMaj = /[A-Z]/.test(pass);
  const hasNumber = /[0-9]/.test(pass);
  const hasSymbol = /[^A-Za-z0-9]/.test(pass);

  const length = pass.length;

  // --- LEVEL 1 (Weak / Rouge) ---
  if (length >= 6) {
    score = 1;
  }

  // --- LEVEL 2 (Medium / Jaune) ---
  if (
    length >= 8 &&
    (hasNumber || hasSymbol) &&
    (hasMin || hasMaj)
  ) {
    score = 2;
  }

  // --- LEVEL 3 (Strong / Vert) ---
  if (
    length >= 10 &&
    hasNumber &&
    hasSymbol &&
    hasMin &&
    hasMaj
  ) {
    score = 3;
  }

  return score;
};


  const score = getPasswordScore(password);
  const isPasswordWeak = score < 2; // Block if score is 0 or 1 (only Red)
  // -----------------------------

  useEffect(() => {
    if (!params.error && !params.token) return;
    if (oauthHandledRef.current) return;
    oauthHandledRef.current = true;

    if (params.error) {
      if (params.error === 'user_already_exists') {
        showAlert('Compte existant', "Ce compte existe déjà. Veuillez vous connecter.", 'error');
      } else {
        showAlert('Erreur', "L'inscription a échoué.", 'error');
      }
      return;
    }

    if (params.token) {
      handleOAuthSuccess(params.token);
    }
  }, [params.error, params.token]);

  const handleOAuthSuccess = async (token) => {
    setModalContent({
      title: "Compte créé",
      message: "Bienvenue sur EauSûre ! Votre compte a été créé avec succès.",
      type: "success",
      token,
      nextRoute: '/(tabs)'
    });
    setModalVisible(true);
  };

  const handleRegister = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email || !password) {
      showAlert('Attention', 'Veuillez remplir tous les champs.');
      return;
    }

    if (!emailRegex.test(email)) {
      showAlert('Email invalide', 'Veuillez entrer une adresse email valide.');
      return;
    }

    if (isPasswordWeak) {
      showAlert('Mot de passe faible', 'Le mot de passe est trop faible. Ajoutez des chiffres ou des symboles pour passer au niveau supérieur.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await register(email, password, name);
      if (result.success) {
          setPostSuccessRoute('/login');
          setModalContent({
            title: "Compte créé",
            message: "Votre compte a été créé. Veuillez vous connecter.",
            type: "success"
          });
          setModalVisible(true);
        } else {
        const emailTaken = result.msg?.toLowerCase().includes('already exists') || 
                           result.msg?.toLowerCase().includes('utilisé');
        showAlert(emailTaken ? 'Email déjà pris' : 'Erreur', emailTaken ? 'Cette email est déjà enregistrée.' : result.msg);
      }
    } catch (e) {
      showAlert('Erreur', 'Connexion impossible au serveur.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    oauthHandledRef.current = false;
    setLoadingProvider('google');
    try {
      await signInWithGoogle();
    } catch (error) {
      showAlert('Erreur', "L'inscription Google a échoué.");
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleGithubRegister = async () => {
    oauthHandledRef.current = false;
    setLoadingProvider('github');
    try {
      await signInWithGitHub();
    } catch (error) {
      showAlert('Erreur', "L'inscription GitHub a échoué.");
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
          if (modalContent.type === 'success' && postSuccessRoute) {
            router.replace(postSuccessRoute);
          }
        }}
      />
      <SafeAreaView style={{ flex: 1 }}>
        
        <Reveal delay={0}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color="white" />
          </TouchableOpacity>
        </Reveal>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.innerContainer}>
              
              <Reveal delay={100}>
                <View style={styles.header}>
                  <Text style={styles.title}>Inscription</Text> 
                  <Text style={styles.subtitle}>Rejoignez le réseau EauSûre</Text>
                </View>
              </Reveal>

              <Reveal delay={200}>
                <View style={styles.form}>
                  <View style={styles.inputContainer}>
                    <Feather name="user" size={20} color="#E2E8F0" />
                    <TextInput
                      style={styles.input}
                      placeholder="Nom complet"
                      placeholderTextColor="#94A3B8"
                      value={name}
                      onChangeText={setName}
                    />
                  </View>

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
                    
                    {/* Mac Style Dots Indicator */}
                    {password.length > 0 && (
                      <View style={styles.macDotsContainer}>
                        {/* Red Dot (Weak) */}
                        <View style={[
                          styles.macDot, 
                          score >= 1 ? { backgroundColor: '#FF5F57', borderColor: '#FF5F57' } : styles.macDotInactive
                        ]} />
                        
                        {/* Yellow Dot (Medium) */}
                        <View style={[
                          styles.macDot, 
                          score >= 2 ? { backgroundColor: '#FEBC2E', borderColor: '#FEBC2E' } : styles.macDotInactive
                        ]} />
                        
                        {/* Green Dot (Strong) */}
                        <View style={[
                          styles.macDot, 
                          score >= 3 ? { backgroundColor: '#28C840', borderColor: '#28C840' } : styles.macDotInactive
                        ]} />
                      </View>
                    )}

                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                      <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#E2E8F0" />
                    </TouchableOpacity>
                  </View>
                </View>
              </Reveal>

              <Reveal delay={300}>
                <View style={styles.actions}>
                  <TouchableOpacity 
                    // Visual disable if password is weak (Score < 2)
                    style={[
                      styles.registerButton, 
                      (isLoading || (password.length > 0 && isPasswordWeak)) && styles.registerButtonDisabled
                    ]}
                    onPress={handleRegister}
                    // Functional disable
                    disabled={isLoading || isOAuthLoading || (password.length > 0 && isPasswordWeak)}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#2563EB" />
                    ) : (
                      <Text style={styles.registerButtonText}>S'inscrire</Text>
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
                      onPress={handleGoogleRegister}
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
                      onPress={handleGithubRegister}
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

                  <View style={styles.loginContainer}>
                    <Text style={styles.loginText}>Déjà inscrit ? </Text>
                    <TouchableOpacity onPress={() => router.push('/login')}>
                      <Text style={styles.loginLink}>Se connecter</Text>
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
  header: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#FFFFFF' },
  subtitle: { fontSize: 16, color: '#CBD5E1', marginTop: 8 },
  form: { gap: 16 },
  
  // Input Styles
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
  
  // Mac-Style Dots Styles
  macDotsContainer: {
    flexDirection: 'row',
    gap: 6, // Spacing between dots
    marginRight: 12,
    alignItems: 'center'
  },
  macDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent' // Default filled state has no border
  },
  macDotInactive: {
    backgroundColor: 'rgba(255,255,255,0.1)', // Subtle empty state
    borderColor: 'rgba(255,255,255,0.3)' // Thin border when empty
  },

  actions: { marginTop: 40 },
  registerButton: { 
    backgroundColor: '#FFF', 
    padding: 18, 
    borderRadius: 20, 
    alignItems: 'center' 
  },
  registerButtonText: { 
    color: '#2563EB', 
    fontWeight: 'bold', 
    fontSize: 18 
  },
  registerButtonDisabled: { opacity: 0.5 }, // Greyed out state
  
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
  
  // OAuth Button Styles
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
  
  loginContainer: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    marginTop: 20 
  },
  loginText: { color: '#CBD5E1' },
  loginLink: { 
    color: '#FFF', 
    fontWeight: 'bold' 
  }
});