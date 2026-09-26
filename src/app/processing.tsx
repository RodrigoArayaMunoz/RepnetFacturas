import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRAND_BLUE = '#087BFF';
const SUCCESS_GREEN = '#10A56A';
const PROCESSING_DURATION = 5000;
const RING_SIZE = 190;
const RING_STROKE = 12;
const RING_SEGMENTS = 96;

type ProcessingStep = {
  title: string;
  processingDescription: string;
  completedDescription: string;
};

const processingSteps: ProcessingStep[] = [
  {
    title: 'Detectando documento',
    processingDescription: 'Analizando imagen...',
    completedDescription: 'Documento detectado',
  },
  {
    title: 'Extrayendo información',
    processingDescription: 'Leyendo datos de la factura...',
    completedDescription: 'Información extraída',
  },
  {
    title: 'Identificando productos',
    processingDescription: 'Reconociendo ítems y cantidades...',
    completedDescription: 'Productos identificados',
  },
  {
    title: 'Validando montos',
    processingDescription: 'Verificando totales...',
    completedDescription: 'Montos validados',
  },
];

type StepState = 'completed' | 'active' | 'pending';

function ProgressRing({ progress }: { progress: number }) {
  const segments = useMemo(() => Array.from({ length: RING_SEGMENTS }), []);
  const center = RING_SIZE / 2;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const segmentWidth = (2 * Math.PI * radius) / RING_SEGMENTS + 1.2;
  const activeSegments = Math.round(progress * RING_SEGMENTS);

  return (
    <View
      accessibilityLabel={`Procesamiento ${Math.round(progress * 100)} por ciento`}
      accessibilityRole="progressbar"
      style={styles.progressRing}>
      {segments.map((_, index) => {
        const angle = (index / RING_SEGMENTS) * Math.PI * 2;
        const rotation = (index / RING_SEGMENTS) * 360;

        return (
          <View
            key={index}
            style={[
              styles.ringSegment,
              {
                width: segmentWidth,
                left: center + radius * Math.sin(angle) - segmentWidth / 2,
                top: center - radius * Math.cos(angle) - RING_STROKE / 2,
                backgroundColor: index < activeSegments ? BRAND_BLUE : '#E8F2FC',
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
          />
        );
      })}

      <View style={styles.logoWindow}>
        <View style={styles.logoCrop}>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="Símbolo de Repnet"
            resizeMode="contain"
            source={require('@/assets/images/repnetsolo_logo.png')}
            style={styles.ringLogo}
          />
        </View>
      </View>
    </View>
  );
}

function StepMarker({ state }: { state: StepState }) {
  if (state === 'completed') {
    return (
      <View style={[styles.stepMarker, styles.completedMarker]}>
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={15}
          tintColor="#FFFFFF"
          weight="bold"
        />
      </View>
    );
  }

  if (state === 'active') {
    return (
      <View style={[styles.stepMarker, styles.activeMarker]}>
        <View style={styles.activeMarkerCenter} />
      </View>
    );
  }

  return <View style={[styles.stepMarker, styles.pendingMarker]} />;
}

function StepRow({
  index,
  isLast,
  step,
  state,
}: {
  index: number;
  isLast: boolean;
  step: ProcessingStep;
  state: StepState;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepTimeline}>
        <StepMarker state={state} />
        {!isLast && (
          <View
            style={[
              styles.timelineLine,
              state === 'completed' && styles.completedTimelineLine,
            ]}
          />
        )}
      </View>
      <View style={styles.stepCopy}>
        <Text
          accessibilityLabel={`Paso ${index + 1}: ${step.title}`}
          style={[styles.stepTitle, state === 'pending' && styles.pendingText]}>
          {step.title}
        </Text>
        <Text style={[styles.stepDescription, state === 'pending' && styles.pendingText]}>
          {state === 'completed' ? step.completedDescription : step.processingDescription}
        </Text>
      </View>
    </View>
  );
}

export default function ProcessingScreen() {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [entranceOpacity] = useState(() => new Animated.Value(0));
  const [entranceTranslateY] = useState(() => new Animated.Value(18));
  const [successScale] = useState(() => new Animated.Value(0.92));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(entranceTranslateY, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();

    const startedAt = Date.now();
    const interval = setInterval(() => {
      const nextProgress = Math.min((Date.now() - startedAt) / PROCESSING_DURATION, 1);
      setProgress(nextProgress);

      if (nextProgress >= 1) {
        clearInterval(interval);
        setIsComplete(true);
        Animated.spring(successScale, {
          damping: 10,
          mass: 0.7,
          stiffness: 130,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [entranceOpacity, entranceTranslateY, successScale]);

  useEffect(() => {
    if (!isComplete) {
      return;
    }

    const resultTimeout = setTimeout(() => {
      router.replace('/invoice-result');
    }, 1500);

    return () => clearTimeout(resultTimeout);
  }, [isComplete]);

  const completedSteps = isComplete
    ? processingSteps.length
    : Math.min(processingSteps.length - 1, Math.floor(progress * processingSteps.length));

  const getStepState = (index: number): StepState => {
    if (index < completedSteps || isComplete) {
      return 'completed';
    }

    return index === completedSteps ? 'active' : 'pending';
  };

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.content,
            {
              opacity: entranceOpacity,
              transform: [{ translateY: entranceTranslateY }],
            },
          ]}>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="Repnet.cl, repuestos a un click"
            resizeMode="contain"
            source={require('@/assets/images/repnetsolo_logo.png')}
            style={styles.headerLogo}
          />

          <View style={styles.headingBlock}>
            <Text accessibilityLiveRegion="polite" style={styles.heading}>
              {isComplete ? 'Factura Procesada' : 'Procesando\ntu factura'}
            </Text>
            <Text style={styles.description}>
              {isComplete
                ? 'La información de tu factura fue verificada correctamente.'
                : 'Estamos extrayendo la información del documento. Esto puede tomar unos segundos.'}
            </Text>
          </View>

          <View style={styles.progressArea}>
            <ProgressRing progress={progress} />
            <Text style={styles.progressLabel}>{Math.round(progress * 100)}%</Text>
          </View>

          <View style={styles.steps}>
            {processingSteps.map((step, index) => (
              <StepRow
                index={index}
                isLast={index === processingSteps.length - 1}
                key={step.title}
                state={getStepState(index)}
                step={step}
              />
            ))}
          </View>

          {isComplete && (
            <Animated.View style={[styles.successArea, { transform: [{ scale: successScale }] }]}>
              <View style={styles.successMessage}>
                <SymbolView
                  name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
                  size={25}
                  tintColor={SUCCESS_GREEN}
                />
                <Text style={styles.successMessageText}>Factura Procesada</Text>
              </View>
            </Animated.View>
          )}
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
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 440,
    minHeight: '100%',
    paddingHorizontal: 22,
    paddingTop: 2,
    paddingBottom: 24,
  },
  headerLogo: {
    width: '88%',
    maxWidth: 340,
    height: 124,
    alignSelf: 'center',
  },
  headingBlock: {
    marginTop: 6,
  },
  heading: {
    color: '#111827',
    fontSize: 37,
    fontWeight: '800',
    lineHeight: 39,
    letterSpacing: -0.6,
  },
  description: {
    maxWidth: 350,
    marginTop: 10,
    color: '#697386',
    fontSize: 15,
    lineHeight: 21,
  },
  progressArea: {
    marginTop: 20,
    alignItems: 'center',
  },
  progressRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSegment: {
    position: 'absolute',
    height: RING_STROKE,
    borderRadius: RING_STROKE / 2,
  },
  logoWindow: {
    width: 116,
    height: 116,
    overflow: 'hidden',
    borderRadius: 58,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 18px rgba(8, 123, 255, 0.10)',
    elevation: 3,
  },
  logoCrop: {
    width: 82,
    height: 116,
    overflow: 'hidden',
  },
  ringLogo: {
    position: 'absolute',
    left: -21,
    width: 319,
    height: 116,
  },
  progressLabel: {
    marginTop: 7,
    color: BRAND_BLUE,
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  steps: {
    marginTop: 18,
  },
  stepRow: {
    minHeight: 58,
    flexDirection: 'row',
  },
  stepTimeline: {
    width: 34,
    alignItems: 'center',
  },
  stepMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  completedMarker: {
    backgroundColor: BRAND_BLUE,
  },
  activeMarker: {
    borderWidth: 3,
    borderColor: '#9DCCFF',
  },
  activeMarkerCenter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND_BLUE,
  },
  pendingMarker: {
    borderWidth: 2,
    borderColor: '#C7D0DB',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 34,
    backgroundColor: '#D6DEE8',
  },
  completedTimelineLine: {
    backgroundColor: BRAND_BLUE,
  },
  stepCopy: {
    flex: 1,
    paddingLeft: 8,
    paddingBottom: 12,
  },
  stepTitle: {
    color: '#1A2433',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  stepDescription: {
    marginTop: 1,
    color: '#667085',
    fontSize: 12,
    lineHeight: 16,
  },
  pendingText: {
    color: '#8A94A3',
  },
  successArea: {
    marginTop: 4,
  },
  successMessage: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#EAF9F2',
  },
  successMessageText: {
    color: '#08764C',
    fontSize: 15,
    fontWeight: '800',
  },
});
