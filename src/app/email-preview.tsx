import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRAND_BLUE = '#087BFF';

export default function EmailPreviewScreen() {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(16));
  const [message, setMessage] = useState(
    'Hola,\n\nAdjunto factura N.º 0012345 de Comercial Andes SpA.\n\nProductos detectados: 4\n\nQuedo atento,'
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

  const sendEmail = () => {
    Alert.alert('Correo preparado', 'El envío real se habilitará al conectar el servicio de correo.');
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

      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
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
              <View style={styles.recipientChip}>
                <Text style={styles.recipientText}>compras@repnet.cl</Text>
                <SymbolView
                  name={{ ios: 'xmark', android: 'close', web: 'close' }}
                  size={14}
                  tintColor={BRAND_BLUE}
                />
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
              <Text style={styles.fieldText}>Factura N.º 0012345 - Comercial Andes SpA</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Mensaje</Text>
            <TextInput
              accessibilityLabel="Mensaje del correo"
              multiline
              onChangeText={setMessage}
              placeholder="Escribe un mensaje..."
              placeholderTextColor="#9AA4B2"
              selectionColor={BRAND_BLUE}
              style={styles.messageField}
              textAlignVertical="top"
              value={message}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Documento adjunto</Text>
            <View style={styles.attachmentCard}>
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="Vista previa de la factura"
                resizeMode="cover"
                source={require('@/assets/images/invoice-document.png')}
                style={styles.attachmentThumbnail}
              />
              <View style={styles.attachmentCopy}>
                <Text numberOfLines={1} style={styles.attachmentName}>
                  factura_0012345.jpg
                </Text>
                <Text style={styles.attachmentSize}>245 KB</Text>
              </View>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={18}
                tintColor="#4B5563"
              />
            </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  attachmentCard: {
    minHeight: 70,
    padding: 8,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  attachmentThumbnail: {
    width: 58,
    height: 52,
    borderRadius: 6,
    backgroundColor: '#EDF2F7',
  },
  attachmentCopy: {
    flex: 1,
    paddingHorizontal: 11,
  },
  attachmentName: {
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  attachmentSize: {
    marginTop: 2,
    color: '#7B8491',
    fontSize: 11,
    lineHeight: 15,
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
