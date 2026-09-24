import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const BRAND_BLUE = '#087BFF';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type Benefit = {
  title: string;
  description: string;
  symbol: SymbolName;
};

const benefits: Benefit[] = [
  {
    title: 'Factura completa',
    description: 'Que se vean todos los datos',
    symbol: { ios: 'doc.text', android: 'description', web: 'description' },
  },
  {
    title: 'Buena iluminación',
    description: 'En un lugar bien iluminado',
    symbol: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  },
  {
    title: 'Sin sombras',
    description: 'Evita reflejos y sombras',
    symbol: { ios: 'nosign', android: 'block', web: 'block' },
  },
  {
    title: 'Foto derecha',
    description: 'Mantén la factura derecha',
    symbol: { ios: 'viewfinder', android: 'crop_free', web: 'crop_free' },
  },
];

function BenefitRow({ benefit }: { benefit: Benefit }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.iconContainer}>
        <SymbolView name={benefit.symbol} size={27} tintColor={BRAND_BLUE} />
      </View>
      <View style={styles.benefitCopy}>
        <Text style={styles.benefitTitle}>{benefit.title}</Text>
        <Text style={styles.benefitDescription}>{benefit.description}</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentHeight = Math.max(620, height - insets.top - insets.bottom);

  return (
    <View style={styles.screen}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={require('@/assets/images/invoice-document.png')}
        style={styles.documentArtwork}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={[styles.content, { minHeight: contentHeight }]}>
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel="Repnet.cl, repuestos a un click"
              resizeMode="contain"
              source={require('@/assets/images/repnetsolo_logo.png')}
              style={styles.logo}
            />

            <View style={styles.intro}>
              <Text style={styles.heading}>
                Captura tu{`\n`}factura en{`\n`}
                <Text style={styles.headingAccent}>segundos</Text>
              </Text>
              <Text style={styles.description}>
                Extraemos automáticamente{`\n`}la información y te la enviamos{`\n`}por correo.
              </Text>
            </View>

            <View style={styles.spacer} />

            <View style={styles.benefitsCard}>
              {benefits.map((benefit) => (
                <BenefitRow key={benefit.title} benefit={benefit} />
              ))}
            </View>

            <Pressable
              accessibilityHint="Abre la cámara para capturar una factura"
              accessibilityLabel="Tomar foto"
              accessibilityRole="button"
              onPress={() => router.push('/camera')}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <SymbolView
                name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
                size={24}
                tintColor="#FFFFFF"
              />
              <Text style={styles.buttonText}>Tomar foto</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 440,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  documentArtwork: {
    position: 'absolute',
    top: -15,
    right: -105,
    width: 330,
    height: 495,
    opacity: 0.18,
  },
  logo: {
    width: '88%',
    maxWidth: 340,
    height: 124,
    alignSelf: 'flex-start',
  },
  intro: {
    marginTop: 27,
  },
  heading: {
    color: '#111827',
    fontSize: 50,
    fontWeight: '800',
    lineHeight: 52,
    letterSpacing: -0.5,
  },
  headingAccent: {
    color: BRAND_BLUE,
  },
  description: {
    marginTop: 18,
    color: '#596170',
    fontSize: 16,
    lineHeight: 18,
  },
  spacer: {
    flexGrow: 1,
    minHeight: 18,
  },
  benefitsCard: {
    gap: 2,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    boxShadow: '0 7px 18px rgba(75, 120, 168, 0.12)',
    elevation: 5,
    marginBottom: 50,
  },
  benefitRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  benefitCopy: {
    flex: 1,
  },
  benefitTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  benefitDescription: {
    marginTop: 1,
    color: '#707785',
    fontSize: 11,
    lineHeight: 15,
  },
  button: {
    minHeight: 54,
    marginTop: 18,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: BRAND_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    boxShadow: '0 5px 10px rgba(8, 123, 255, 0.2)',
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
