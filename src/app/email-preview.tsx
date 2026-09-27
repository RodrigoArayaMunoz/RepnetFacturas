import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInvoiceProcessing } from '@/context/invoice-processing-context';

const BRAND_BLUE = '#087BFF';
const RECIPIENTS = ['Contacto@autthcomercial.cl', 'm.arellano@autthcomercial.cl'];

export default function EmailPreviewScreen() {
  const { invoice, photoUri } = useInvoiceProcessing();
  const scrollViewRef = useRef<ScrollView>(null);
  const messageSectionY = useRef(0);
  const focusScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(16));
  const [isDocumentPreviewVisible, setDocumentPreviewVisible] = useState(false);
  const supplierName = invoice?.supplierName ?? 'proveedor no detectado';
  const invoiceNumber = invoice?.invoiceNumber ?? 'sin número';
  const [message, setMessage] = useState(() =>
    [
      'Estimados,',
      '',
      `Adjunto factura N.º ${invoiceNumber} de ${supplierName}.`,
      '',
      `Ingresar como parte de entrada de mercadería en el sistema.`,
      '',
      'Quedo atento,',
    ].join('\n'),
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  useEffect(
    () => () => {
      if (focusScrollTimer.current) {
        clearTimeout(focusScrollTimer.current);
      }
    },
    [],
  );

  const revealMessageEditor = () => {
    if (focusScrollTimer.current) {
      clearTimeout(focusScrollTimer.current);
    }

    focusScrollTimer.current = setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        animated: true,
        y: Math.max(messageSectionY.current - 12, 0),
      });
    }, 300);
  };

  const sendEmail = () => {
    Alert.alert('Correo preparado', 'El envío real se habilitará al conectar el servicio de correo.');
  };

  const openDocumentPreview = () => {
    Keyboard.dismiss();
    setDocumentPreviewVisible(true);
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver al detalle de la factura"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={24}
            tintColor="#1A2433"
            weight="semibold"
          />
        </Pressable>

        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel="Repnet.cl, repuestos a un click"
          resizeMode="contain"
          source={require('@/assets/images/repnetsolo_logo.png')}
          style={styles.headerLogo}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}>
        <ScrollView
          ref={scrollViewRef}
          alwaysBounceVertical={false}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}>
          <Animated.View
            style={[
              styles.content,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}>
          <Text style={styles.description}>
            La factura y su información serán enviadas por correo electrónico.
          </Text>

          <View style={styles.section}>
            <Text style={styles.label}>Destinatarios</Text>
            <View style={styles.recipientsCard}>
              <View style={styles.recipientList}>
                {RECIPIENTS.map((recipient) => (
                  <View key={recipient} style={styles.recipientChip}>
                    <Text style={styles.recipientText}>{recipient}</Text>
                    <SymbolView
                      name={{ ios: 'xmark', android: 'close', web: 'close' }}
                      size={14}
                      tintColor={BRAND_BLUE}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.addRecipientRow}>
                <Text style={styles.placeholderText}>Agregar destinatario...</Text>
                <SymbolView
                  name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
                  size={20}
                  tintColor="#5D6878"
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Asunto</Text>
            <View style={styles.singleLineField}>
              <Text style={styles.fieldText}>
                Recepción Mercadería Factura N.º {invoiceNumber} - {supplierName}
              </Text>
            </View>
          </View>

          <View
            onLayout={({ nativeEvent }) => {
              messageSectionY.current = nativeEvent.layout.y;
            }}
            style={styles.section}>
            <Text style={styles.label}>Mensaje</Text>
            <TextInput
              accessibilityLabel="Mensaje del correo"
              multiline
              onChangeText={setMessage}
              onFocus={revealMessageEditor}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#9AA4B2"
              selectionColor={BRAND_BLUE}
              style={styles.messageField}
              textAlignVertical="top"
              value={message}
            />
          </View>

          <View style={styles.section}>
            <Pressable
              accessibilityLabel="Ver documento adjunto"
              accessibilityRole="button"
              hitSlop={8}
              onPress={openDocumentPreview}
              style={({ pressed }) => [styles.documentLink, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                size={20}
                tintColor={BRAND_BLUE}
              />
              <Text style={styles.documentLinkText}>Ver Documento Adjunto</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={sendEmail}
            style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
            <SymbolView
              name={{ ios: 'paperplane.fill', android: 'send', web: 'send' }}
              size={22}
              tintColor="#FFFFFF"
            />
            <Text style={styles.sendButtonText}>Enviar correo</Text>
          </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        onRequestClose={() => setDocumentPreviewVisible(false)}
        statusBarTranslucent
        transparent
        visible={isDocumentPreviewVisible}>
        <View style={styles.previewBackdrop}>
          <SafeAreaView
            accessibilityViewIsModal
            edges={['top', 'right', 'bottom', 'left']}
            style={styles.previewSafeArea}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Documento adjunto</Text>
              <Pressable
                accessibilityLabel="Cerrar vista del documento"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setDocumentPreviewVisible(false)}
                style={({ pressed }) => [styles.previewCloseButton, pressed && styles.pressed]}>
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={24}
                  tintColor="#FFFFFF"
                  weight="semibold"
                />
              </Pressable>
            </View>

            <View style={styles.previewImageFrame}>
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="Fotografía del documento adjunto"
                resizeMode="contain"
                source={photoUri ? { uri: photoUri } : require('@/assets/images/invoice-document.png')}
                style={styles.previewImage}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    width: '100%',
    maxWidth: 440,
    height: 74,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 178,
    height: 65,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 18,
  },
  description: {
    maxWidth: 360,
    marginBottom: 15,
    color: '#687386',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginBottom: 13,
  },
  label: {
    marginBottom: 6,
    color: '#1B2533',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  recipientsCard: {
    padding: 8,
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  recipientChip: {
    minHeight: 32,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E5F1FF',
  },
  recipientList: {
    alignItems: 'flex-start',
    gap: 6,
  },
  recipientText: {
    color: BRAND_BLUE,
    fontSize: 13,
    fontWeight: '700',
  },
  addRecipientRow: {
    minHeight: 38,
    marginTop: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E7ED',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  placeholderText: {
    color: '#9AA4B2',
    fontSize: 13,
  },
  singleLineField: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 10,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  fieldText: {
    color: '#273344',
    fontSize: 13,
    lineHeight: 18,
  },
  messageField: {
    minHeight: 160,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: '#273344',
    fontSize: 13,
    lineHeight: 19,
  },
  documentLink: {
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  documentLinkText: {
    color: BRAND_BLUE,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 16, 28, 0.94)',
  },
  previewSafeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  previewHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  previewCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  previewImageFrame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  sendButton: {
    minHeight: 54,
    marginTop: 2,
    paddingHorizontal: 24,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: BRAND_BLUE,
    boxShadow: '0 5px 10px rgba(8, 123, 255, 0.2)',
    elevation: 4,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
});
