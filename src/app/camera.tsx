import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRAND_BLUE = '#087BFF';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type IconButtonProps = {
  accessibilityLabel: string;
  icon: SymbolName;
  onPress: () => void;
};

function IconButton({ accessibilityLabel, icon, onPress }: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <SymbolView name={icon} size={25} tintColor="#FFFFFF" />
    </Pressable>
  );
}

function InvoiceFrame() {
  return (
    <View pointerEvents="none" style={styles.invoiceFrame}>
      <View style={[styles.corner, styles.topLeftCorner]} />
      <View style={[styles.corner, styles.topRightCorner]} />
      <View style={[styles.corner, styles.bottomLeftCorner]} />
      <View style={[styles.corner, styles.bottomRightCorner]} />
    </View>
  );
}

export default function CameraScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const closeCamera = () => router.back();

  const takePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isTakingPicture) {
      return;
    }

    setCameraError(null);
    setIsTakingPicture(true);

    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      setCapturedUri(picture.uri);
    } catch {
      setCameraError('No pudimos tomar la foto. Inténtalo nuevamente.');
    } finally {
      setIsTakingPicture(false);
    }
  };

  const retakePicture = () => {
    setCapturedUri(null);
    setIsCameraReady(false);
    setCameraError(null);
  };

  const toggleCameraFacing = () => {
    setFlashEnabled(false);
    setIsCameraReady(false);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  if (!permission) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar style="light" />
        <ActivityIndicator color="#FFFFFF" size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    const canRequestPermission = permission.canAskAgain;

    return (
      <SafeAreaView style={styles.permissionScreen}>
        <StatusBar style="light" />
        <View style={styles.permissionHeader}>
          <IconButton
            accessibilityLabel="Cerrar cámara"
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            onPress={closeCamera}
          />
        </View>

        <View style={styles.permissionContent}>
          <View style={styles.permissionIcon}>
            <SymbolView
              name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }}
              size={44}
              tintColor="#FFFFFF"
            />
          </View>
          <Text style={styles.permissionTitle}>Permite el acceso a la cámara</Text>
          <Text style={styles.permissionDescription}>
            Necesitamos la cámara para fotografiar tu factura dentro del marco.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={canRequestPermission ? requestPermission : Linking.openSettings}
            style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}>
            <Text style={styles.permissionButtonText}>
              {canRequestPermission ? 'Permitir cámara' : 'Abrir configuración'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isPreviewing = capturedUri !== null;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {isPreviewing ? (
        <Image source={{ uri: capturedUri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
      ) : (
        <CameraView
          ref={cameraRef}
          facing={facing}
          flash={flashEnabled ? 'on' : 'off'}
          mode="picture"
          onCameraReady={() => setIsCameraReady(true)}
          onMountError={() => setCameraError('No pudimos iniciar la cámara.')}
          style={StyleSheet.absoluteFill}
        />
      )}

      <SafeAreaView edges={['top', 'bottom']} style={styles.overlay}>
        <View style={styles.topBar}>
          <IconButton
            accessibilityLabel="Cancelar y cerrar cámara"
            icon={{ ios: 'xmark', android: 'close', web: 'close' }}
            onPress={closeCamera}
          />

          {!isPreviewing && (
            <IconButton
              accessibilityLabel={flashEnabled ? 'Apagar flash' : 'Encender flash'}
              icon={
                flashEnabled
                  ? { ios: 'bolt.fill', android: 'flash_on', web: 'flash_on' }
                  : { ios: 'bolt.slash.fill', android: 'flash_off', web: 'flash_off' }
              }
              onPress={() => setFlashEnabled((enabled) => !enabled)}
            />
          )}
        </View>

        <View style={styles.instructionBadge}>
          <Text style={styles.instructionText}>
            {isPreviewing ? 'Revisa que la factura se vea completa' : 'Ubica la factura dentro del marco'}
          </Text>
        </View>

        <View style={styles.frameArea}>
          <InvoiceFrame />
        </View>

        {cameraError && <Text style={styles.errorText}>{cameraError}</Text>}

        {isPreviewing ? (
          <View style={styles.previewControls}>
            <Pressable
              accessibilityRole="button"
              onPress={retakePicture}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
                size={20}
                tintColor="#FFFFFF"
              />
              <Text style={styles.secondaryButtonText}>Repetir</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={closeCamera}
              style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={20}
                tintColor="#FFFFFF"
              />
              <Text style={styles.confirmButtonText}>Usar foto</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraControls}>
            <View style={styles.controlPlaceholder} />
            <Pressable
              accessibilityLabel="Tomar foto de la factura"
              accessibilityRole="button"
              disabled={!isCameraReady || isTakingPicture}
              onPress={takePicture}
              style={({ pressed }) => [
                styles.shutterOuter,
                (!isCameraReady || isTakingPicture) && styles.shutterDisabled,
                pressed && styles.shutterPressed,
              ]}>
              {isTakingPicture ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
            <IconButton
              accessibilityLabel="Cambiar cámara"
              icon={{
                ios: 'arrow.triangle.2.circlepath.camera',
                android: 'cameraswitch',
                web: 'cameraswitch',
              }}
              onPress={toggleCameraFacing}
            />
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050505',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050505',
  },
  overlay: {
    flex: 1,
  },
  topBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  pressed: {
    opacity: 0.7,
  },
  instructionBadge: {
    alignSelf: 'center',
    maxWidth: '88%',
    marginTop: 2,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(12, 12, 12, 0.78)',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  frameArea: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 16,
  },
  invoiceFrame: {
    flex: 1,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: BRAND_BLUE,
  },
  topLeftCorner: {
    top: 0,
    left: 0,
    borderTopWidth: 5,
    borderLeftWidth: 5,
    borderTopLeftRadius: 8,
  },
  topRightCorner: {
    top: 0,
    right: 0,
    borderTopWidth: 5,
    borderRightWidth: 5,
    borderTopRightRadius: 8,
  },
  bottomLeftCorner: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    borderBottomLeftRadius: 8,
  },
  bottomRightCorner: {
    right: 0,
    bottom: 0,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderBottomRightRadius: 8,
  },
  errorText: {
    alignSelf: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
    borderRadius: 8,
    color: '#FFFFFF',
    backgroundColor: 'rgba(185, 28, 28, 0.9)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cameraControls: {
    height: 118,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  controlPlaceholder: {
    width: 44,
    height: 44,
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: BRAND_BLUE,
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
  },
  shutterDisabled: {
    opacity: 0.55,
  },
  previewControls: {
    minHeight: 118,
    paddingHorizontal: 20,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  secondaryButton: {
    minHeight: 50,
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmButton: {
    minHeight: 50,
    flex: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: '#0B0F16',
  },
  permissionHeader: {
    minHeight: 52,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  permissionContent: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionIcon: {
    width: 82,
    height: 82,
    marginBottom: 24,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 29,
    textAlign: 'center',
  },
  permissionDescription: {
    maxWidth: 330,
    marginTop: 10,
    color: '#B8C0CC',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  permissionButton: {
    minHeight: 52,
    minWidth: 210,
    marginTop: 26,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
