import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { INVOICE_EMAIL_RECIPIENTS } from '@/config/invoice-email';
import { useInvoiceProcessing } from '@/context/invoice-processing-context';

const BRAND_BLUE = '#087BFF';

export default function EmailPreviewScreen() {
  const {
    emailDelivery,
    emailDraft,
    photoUri,
    submitInvoiceEmail,
    updateEmailDraft,
  } = useInvoiceProcessing();
  const scrollViewRef = useRef<ScrollView>(null);
  const messageSectionY = useRef(0);
  const focusScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(16));
  const [isDocumentPreviewVisible, setDocumentPreviewVisible] = useState(false);
  const isSending = emailDelivery.status === 'sending';
  const isSent = emailDelivery.status === 'sent';
  const needsReview = emailDelivery.status === 'uncertain';
  const isDraftLocked = isSending || isSent || needsReview;
  const isSendDisabled = isDraftLocked || !photoUri || !emailDraft.subject.trim();
  const needsDeviceApproval = emailDelivery.error?.code === 'DEVICE_NOT_APPROVED';
  const buttonLabel = isSending
    ? 'Enviando…'
    : isSent
      ? 'Enviado'
      : needsReview
        ? 'Revisar envío'
        : emailDelivery.status === 'error'
          ? 'Volver a intentar'
          : 'Enviar factura';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: Platform.OS !== 'web',
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
    Keyboard.dismiss();
    void submitInvoiceEmail();
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
            Se enviará la fotografía de la factura adjunta al correo.
          </Text>

          <View style={styles.section}>
            <Text style={styles.label}>Destinatarios</Text>
            <View style={styles.recipientsCard}>
              <View style={styles.recipientList}>
                {INVOICE_EMAIL_RECIPIENTS.map((recipient) => (
                  <View key={recipient} style={styles.recipientChip}>
                    <Text style={styles.recipientText}>{recipient}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Asunto</Text>
            <TextInput
              accessibilityLabel="Asunto del correo"
              editable={!isDraftLocked}
              maxLength={300}
              onChangeText={(subject) => updateEmailDraft({ subject })}
              placeholder="Escribe un asunto..."
              placeholderTextColor="#9AA4B2"
              selectionColor={BRAND_BLUE}
              style={styles.subjectField}
              value={emailDraft.subject}
            />
          </View>

          <View
            onLayout={({ nativeEvent }) => {
              messageSectionY.current = nativeEvent.layout.y;
            }}
            style={styles.section}>
            <Text style={styles.label}>Mensaje</Text>
            <TextInput
              accessibilityLabel="Mensaje del correo"
              editable={!isDraftLocked}
              maxLength={10000}
              multiline
              onChangeText={(message) => updateEmailDraft({ message })}
              onFocus={revealMessageEditor}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#9AA4B2"
              selectionColor={BRAND_BLUE}
              style={styles.messageField}
              textAlignVertical="top"
              value={emailDraft.message}
            />
          </View>

          <View style={styles.section}>
            <Pressable
              accessibilityLabel="Ver fotografía adjunta"
              accessibilityRole="button"
              hitSlop={8}
              onPress={openDocumentPreview}
              style={({ pressed }) => [styles.documentLink, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                size={20}
                tintColor={BRAND_BLUE}
              />
              <Text style={styles.documentLinkText}>Ver fotografía adjunta</Text>
            </Pressable>
          </View>

          {emailDelivery.status !== 'idle' && (
            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.deliveryCard,
                isSent && styles.deliverySuccess,
                (emailDelivery.status === 'error' || needsReview) && styles.deliveryWarning,
              ]}>
              {isSending && (
                <Text style={styles.deliveryText}>Enviando la fotografía. Espera la confirmación.</Text>
              )}
              {isSent && (
                <>
                  <Text accessibilityRole="header" style={styles.deliveryTitle}>
                    Factura enviada
                  </Text>
                  <Text style={styles.deliveryText}>
                    Gmail aceptó el correo para {emailDelivery.receipt?.recipients.join(', ')}.
                  </Text>
                </>
              )}
              {needsReview && (
                <>
                  <Text accessibilityRole="header" style={styles.deliveryTitle}>
                    Revisa el envío antes de repetirlo
                  </Text>
                  <Text style={styles.deliveryText}>
                    No se pudo confirmar el resultado. Revisa la carpeta Enviados de la cuenta de
                    bodega y contacta al administrador para confirmar si salió. El reenvío está
                    pausado para evitar duplicados.
                  </Text>
                </>
              )}
              {emailDelivery.status === 'error' && (
                <>
                  <Text accessibilityRole="header" style={styles.deliveryTitle}>
                    {needsDeviceApproval ? 'Autoriza este dispositivo' : 'No se pudo enviar'}
                  </Text>
                  {needsDeviceApproval ? (
                    <>
                      <Text style={styles.deliveryText}>
                        Comparte este identificador con el administrador para que autorice este
                        dispositivo en Supabase. Después pulsa «Volver a intentar».
                      </Text>
                      {emailDelivery.error?.deviceId && (
                        <Text selectable style={styles.deviceId}>
                          {emailDelivery.error.deviceId}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.deliveryText}>{emailDelivery.error?.message}</Text>
                  )}
                </>
              )}
            </View>
          )}

          {!photoUri && (
            <Text accessibilityLiveRegion="polite" style={styles.missingPhotoText}>
              Vuelve a la cámara y toma una fotografía antes de enviar.
            </Text>
          )}

          <Pressable
            accessibilityLabel={buttonLabel}
            accessibilityRole="button"
            accessibilityState={{ busy: isSending, disabled: isSendDisabled }}
            disabled={isSendDisabled}
            onPress={sendEmail}
            style={({ pressed }) => [
              styles.sendButton,
              isSent && styles.sentButton,
              isSendDisabled && !isSent && styles.disabledButton,
              pressed && styles.pressed,
            ]}>
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <SymbolView
                name={isSent
                  ? { ios: 'checkmark', android: 'check', web: 'check' }
                  : { ios: 'paperplane.fill', android: 'send', web: 'send' }}
                size={22}
                tintColor="#FFFFFF"
              />
            )}
            <Text style={styles.sendButtonText}>{buttonLabel}</Text>
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
              <Text style={styles.previewTitle}>Fotografía adjunta</Text>
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
  subjectField: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
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
  deliveryCard: {
    marginBottom: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#CFDFF3',
    borderRadius: 11,
    backgroundColor: '#F1F7FF',
    gap: 6,
  },
  deliverySuccess: {
    borderColor: '#B9DEC9',
    backgroundColor: '#EFF9F3',
  },
  deliveryWarning: {
    borderColor: '#E6D4B2',
    backgroundColor: '#FFF9ED',
  },
  deliveryTitle: {
    color: '#1B2533',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  deliveryText: {
    color: '#3F4D5F',
    fontSize: 13,
    lineHeight: 20,
  },
  deviceId: {
    marginTop: 3,
    padding: 10,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    color: '#1B2533',
    fontSize: 13,
    lineHeight: 20,
  },
  missingPhotoText: {
    marginBottom: 12,
    color: '#845C20',
    fontSize: 13,
    lineHeight: 20,
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
  sentButton: {
    backgroundColor: '#21834D',
    boxShadow: '0 5px 10px rgba(33, 131, 77, 0.16)',
  },
  disabledButton: {
    opacity: 0.6,
    elevation: 0,
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
