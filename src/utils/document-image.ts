import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

const MAX_DOCUMENT_LONG_EDGE = 2400;
const JPEG_QUALITY = 94;

const SCAN_COLOR_MATRIX = [
  0.287, 0.966, 0.097, 0, -0.03,
  0.287, 0.966, 0.097, 0, -0.03,
  0.287, 0.966, 0.097, 0, -0.03,
  0, 0, 0, 1, 0,
];

export type Size = {
  height: number;
  width: number;
};

export type LayoutRect = Size & {
  x: number;
  y: number;
};

type CapturedPhoto = Size & {
  uri: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Maps a guide rectangle from CameraView coordinates to the underlying photo.
 * CameraView fills its bounds like `cover`, so part of the sensor image can be
 * outside the screen even though takePictureAsync saves the complete frame.
 */
export function calculateDocumentCrop(
  image: Size,
  preview: Size,
  frame: LayoutRect,
): LayoutRect {
  if (
    image.width <= 0 ||
    image.height <= 0 ||
    preview.width <= 0 ||
    preview.height <= 0 ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    throw new Error('No fue posible calcular el recorte de la factura.');
  }

  const coverScale = Math.max(
    preview.width / image.width,
    preview.height / image.height,
  );
  const renderedWidth = image.width * coverScale;
  const renderedHeight = image.height * coverScale;
  const hiddenLeft = (renderedWidth - preview.width) / 2;
  const hiddenTop = (renderedHeight - preview.height) / 2;

  const originX = clamp(
    Math.floor((frame.x + hiddenLeft) / coverScale),
    0,
    image.width - 1,
  );
  const originY = clamp(
    Math.floor((frame.y + hiddenTop) / coverScale),
    0,
    image.height - 1,
  );
  const width = clamp(
    Math.ceil(frame.width / coverScale),
    1,
    image.width - originX,
  );
  const height = clamp(
    Math.ceil(frame.height / coverScale),
    1,
    image.height - originY,
  );

  return { x: originX, y: originY, width, height };
}

async function cropToGuide(
  photo: CapturedPhoto,
  preview: Size,
  frame: LayoutRect,
) {
  const crop = calculateDocumentCrop(photo, preview, frame);
  const manipulator = ImageManipulator.manipulate(photo.uri);

  manipulator.crop({
    originX: crop.x,
    originY: crop.y,
    width: crop.width,
    height: crop.height,
  });

  const longEdge = Math.max(crop.width, crop.height);

  if (longEdge > MAX_DOCUMENT_LONG_EDGE) {
    const scale = MAX_DOCUMENT_LONG_EDGE / longEdge;
    manipulator.resize({
      width: Math.round(crop.width * scale),
      height: Math.round(crop.height * scale),
    });
  }

  const renderedImage = await manipulator.renderAsync();
  return renderedImage.saveAsync({ compress: 0.98, format: SaveFormat.JPEG });
}

async function applyScanFilter(uri: string) {
  const encodedData = await Skia.Data.fromURI(uri);
  const sourceImage = Skia.Image.MakeImageFromEncoded(encodedData);

  if (!sourceImage) {
    encodedData.dispose();
    throw new Error('No fue posible abrir la imagen recortada.');
  }

  const width = sourceImage.width();
  const height = sourceImage.height();
  const surface = Skia.Surface.MakeOffscreen(width, height);

  if (!surface) {
    sourceImage.dispose();
    encodedData.dispose();
    throw new Error('No fue posible preparar el filtro de escaneo.');
  }

  const paint = Skia.Paint();
  const colorFilter = Skia.ColorFilter.MakeMatrix(SCAN_COLOR_MATRIX);
  let snapshot: ReturnType<typeof surface.makeImageSnapshot> | null = null;

  try {
    paint.setAntiAlias(true);
    paint.setDither(true);
    paint.setColorFilter(colorFilter);

    const canvas = surface.getCanvas();
    const bounds = Skia.XYWHRect(0, 0, width, height);
    canvas.clear(Skia.Color('#FFFFFF'));
    canvas.drawImageRectCubic(sourceImage, bounds, bounds, 0, 0.5, paint);
    surface.flush();

    snapshot = surface.makeImageSnapshot();
    const jpegBytes = snapshot.encodeToBytes(ImageFormat.JPEG, JPEG_QUALITY);
    const output = new File(
      Paths.cache,
      `factura-escaneada-${Date.now()}-${Math.round(Math.random() * 1_000_000)}.jpg`,
    );
    output.create();
    output.write(jpegBytes);
    return output.uri;
  } finally {
    snapshot?.dispose();
    colorFilter.dispose();
    paint.dispose();
    surface.dispose();
    sourceImage.dispose();
    encodedData.dispose();
  }
}

export async function processDocumentPhoto(
  photo: CapturedPhoto,
  preview: Size,
  frame: LayoutRect,
) {
  const croppedImage = await cropToGuide(photo, preview, frame);

  if (Platform.OS === 'web') {
    return croppedImage.uri;
  }

  try {
    const scannedUri = await applyScanFilter(croppedImage.uri);

    try {
      new File(croppedImage.uri).delete();
    } catch {
      // The cache can clean up the intermediate crop later.
    }

    return scannedUri;
  } catch {
    // Cropping is the essential correction. Keep that usable result if a
    // device cannot allocate the native surface required by the scan filter.
    return croppedImage.uri;
  }
}
