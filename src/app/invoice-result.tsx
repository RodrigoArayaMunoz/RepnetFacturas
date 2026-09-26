import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRAND_BLUE = '#087BFF';

const detectedProducts = [
  { code: 'FIL-ACE-001', quantity: 2 },
  { code: 'FIL-AIR-002', quantity: 1 },
  { code: 'PAS-FRE-003', quantity: 1 },
  { code: 'ACE-15W40-004', quantity: 4 },
];

type DetailFieldProps = {
  label: string;
  value: string;
};

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldValueContainer}>
        <Text selectable style={styles.fieldValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function InvoiceResultScreen() {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(16));

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

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.screen}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Volver al inicio"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.dismissTo('/')}
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
        showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity,
              transform: [{ translateY }],
            },
          ]}>
          <View style={styles.detailsCard}>
            <DetailField label="Proveedor" value="Comercial Andes SpA" />
            <View style={styles.divider} />
            <DetailField label="N.º de factura" value="0012345" />
          </View>

          <View style={styles.productsSection}>
            <Text style={styles.productsTitle}>
              Productos detectados ({detectedProducts.length})
            </Text>
            <View style={styles.productsTable}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableHeaderText, styles.codeColumn]}>Código de producto</Text>
                <Text style={[styles.tableHeaderText, styles.quantityColumn]}>Cantidad</Text>
              </View>

              {detectedProducts.map((product, index) => (
                <View
                  key={product.code}
                  style={[
                    styles.tableRow,
                    index < detectedProducts.length - 1 && styles.tableRowBorder,
                  ]}>
                  <Text selectable style={[styles.tableCellText, styles.codeColumn]}>
                    {product.code}
                  </Text>
                  <Text style={[styles.tableCellText, styles.quantityColumn]}>
                    {product.quantity}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/email-preview')}
            style={({ pressed }) => [styles.finishButton, pressed && styles.pressed]}>
            <Text style={styles.finishButtonText}>Finalizar</Text>
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
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 24,
  },
  detailsCard: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 7px 18px rgba(75, 120, 168, 0.10)',
    elevation: 3,
  },
  fieldGroup: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabel: {
    width: 100,
    paddingRight: 10,
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  fieldValueContainer: {
    minHeight: 36,
    flex: 1,
    paddingHorizontal: 11,
    borderRadius: 8,
    justifyContent: 'center',
    backgroundColor: '#F4F7FA',
  },
  fieldValue: {
    color: '#182230',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  divider: {
    height: 1,
    backgroundColor: '#EDF0F4',
  },
  productsSection: {
    marginTop: 16,
  },
  productsTitle: {
    marginBottom: 9,
    color: '#182230',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  productsTable: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DDE4EC',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  tableRow: {
    minHeight: 44,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableHeader: {
    minHeight: 42,
    backgroundColor: '#F1F5F9',
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5EAF0',
  },
  tableHeaderText: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  tableCellText: {
    color: '#263241',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  codeColumn: {
    flex: 1,
    paddingRight: 12,
  },
  quantityColumn: {
    width: 72,
    textAlign: 'center',
  },
  finishButton: {
    minHeight: 54,
    marginTop: 24,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE,
    boxShadow: '0 5px 10px rgba(8, 123, 255, 0.2)',
    elevation: 4,
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
});
