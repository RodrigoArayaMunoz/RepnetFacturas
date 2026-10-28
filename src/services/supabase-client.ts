import { createClient, processLock, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';

import { createChunkedSessionStorage } from '@/utils/session-storage';

let client: SupabaseClient | null = null;
let pendingSession: Promise<Session> | null = null;

export class MailSessionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MailSessionError';
  }
}

export function getMailSupabaseConfig() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) ||
      !key?.startsWith('sb_publishable_')) {
    throw new MailSessionError(
      'Falta configurar la conexión pública de Supabase para enviar correos.',
      'MAIL_NOT_CONFIGURED',
    );
  }
  return { url, key };
}

async function createNativeSessionStorage() {
  let SecureStore: typeof import('expo-secure-store');
  try {
    // Older development builds may not include the native module yet.
    // Load it only when sending mail so it cannot prevent routes from loading.
    if (!requireOptionalNativeModule('ExpoSecureStore')) {
      throw new Error('ExpoSecureStore is missing from the installed build');
    }
    SecureStore = await import('expo-secure-store');
    if (!await SecureStore.isAvailableAsync()) {
      throw new Error('SecureStore is unavailable');
    }
  } catch {
    throw new MailSessionError(
      'Actualiza la aplicación instalada para habilitar el envío seguro de correos.',
      'SECURE_STORAGE_UNAVAILABLE',
    );
  }
  return createChunkedSessionStorage({
    getItem: (name) => SecureStore.getItemAsync(name),
    setItem: (name, value) => SecureStore.setItemAsync(name, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    removeItem: (name) => SecureStore.deleteItemAsync(name),
  });
}

async function getClient() {
  if (client) return client;
  const { url, key } = getMailSupabaseConfig();
  const storage = Platform.OS === 'web' ? undefined : await createNativeSessionStorage();

  client = createClient(url, key, {
    auth: {
      storage,
      storageKey: 'repnet-facturas.mail-session.v1',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });
  if (Platform.OS !== 'web' && AppState.currentState !== 'active') {
    client.auth.stopAutoRefresh();
  }
  return client;
}

export async function getMailSession(): Promise<Session> {
  if (pendingSession) return pendingSession;
  pendingSession = (async () => {
    const supabase = await getClient();
    const { data: current, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new MailSessionError(
        'No pudimos recuperar la autorización de este dispositivo. Revisa la conexión e inténtalo otra vez.',
        'SESSION_UNAVAILABLE',
      );
    }
    if (current.session) return current.session;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session) {
      throw new MailSessionError(
        error?.code === 'anonymous_provider_disabled'
          ? 'El administrador debe habilitar las sesiones anónimas en Supabase para autorizar este dispositivo.'
          : 'No pudimos preparar la autorización del dispositivo. Revisa la conexión e inténtalo nuevamente.',
        error?.code === 'anonymous_provider_disabled' ? 'ANONYMOUS_SIGNIN_DISABLED' : 'SESSION_UNAVAILABLE',
      );
    }
    return data.session;
  })();
  try {
    return await pendingSession;
  } finally {
    pendingSession = null;
  }
}

/** The session is created only on demand; mounting the app never sends an email. */
export function manageMailSessionRefresh() {
  if (Platform.OS === 'web') return () => {};
  const subscription = AppState.addEventListener('change', (state) => {
    if (!client) return;
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return () => subscription.remove();
}
