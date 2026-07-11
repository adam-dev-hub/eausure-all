// hooks/useOAuth.js
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// Important: Handles browser completion on web/android
WebBrowser.maybeCompleteAuthSession();

const API_URL = 'https://eau-sure-app-auth.vercel.app'; 

export const useOAuth = (showAlert, isRegistration = false) => {
  // isRegistration determines whether to use /register or /login routes
  
  const signInWithGoogle = async () => {
    try {
      // Point to the appropriate route based on mode
      const routePath = isRegistration ? '/register' : '/login';
      const redirectUrl = Linking.createURL(routePath); 
      
      // Use the appropriate backend endpoint
      const endpoint = isRegistration ? 'google/register' : 'google';
      const authUrl = `${API_URL}/api/auth/${endpoint}?redirect_url=${encodeURIComponent(redirectUrl)}`;
      
      // Open the browser
      await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      
      // If successful, the browser redirects to "myapp://[login|register]?token=xyz"
      // The respective screen's useEffect handles the token/error.
      
    } catch (error) {
      console.error('Google OAuth error:', error);
      throw error;
    }
  };

  const signInWithGitHub = async () => {
    try {
      const routePath = isRegistration ? '/register' : '/login';
      const redirectUrl = Linking.createURL(routePath);
      
      const endpoint = isRegistration ? 'github/register' : 'github';
      const authUrl = `${API_URL}/api/auth/${endpoint}?redirect_url=${encodeURIComponent(redirectUrl)}`;

      await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      throw error;
    }
  };

  return {
    signInWithGoogle,
    signInWithGitHub
  };
};