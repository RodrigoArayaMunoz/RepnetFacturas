import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { analyzeInvoice, InvoiceApiError } from '@/services/invoice-api';
import type { InvoiceData, InvoiceProcessingStatus } from '@/types/invoice';

type InvoiceProcessingContextValue = {
  errorMessage: string | null;
  invoice: InvoiceData | null;
  photoUri: string | null;
  processInvoice: () => Promise<InvoiceData>;
  resetInvoice: () => void;
  selectPhoto: (uri: string) => void;
  status: InvoiceProcessingStatus;
};

const InvoiceProcessingContext = createContext<InvoiceProcessingContextValue | null>(null);

export function InvoiceProcessingProvider({ children }: PropsWithChildren) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [status, setStatus] = useState<InvoiceProcessingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRequest = useRef<Promise<InvoiceData> | null>(null);

  const selectPhoto = useCallback((uri: string) => {
    setPhotoUri(uri);
    setInvoice(null);
    setErrorMessage(null);
    setStatus('ready');
  }, []);

  const resetInvoice = useCallback(() => {
    inFlightRequest.current = null;
    setPhotoUri(null);
    setInvoice(null);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  const processInvoice = useCallback(async () => {
    if (!photoUri) {
      const error = new InvoiceApiError('No hay una fotografía seleccionada para procesar.');
      setErrorMessage(error.message);
      setStatus('error');
      throw error;
    }

    if (inFlightRequest.current) {
      return inFlightRequest.current;
    }

    setErrorMessage(null);
    setStatus('processing');

    const request = analyzeInvoice(photoUri);
    inFlightRequest.current = request;

    try {
      const extractedInvoice = await request;

      if (!extractedInvoice.documentReadable) {
        throw new InvoiceApiError(
          'No pudimos identificar una factura legible. Toma otra foto con buena luz y el documento completo.',
        );
      }

      setInvoice(extractedInvoice);
      setStatus('success');
      return extractedInvoice;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Ocurrió un error inesperado al procesar la factura.';

      setInvoice(null);
      setErrorMessage(message);
      setStatus('error');
      throw error;
    } finally {
      inFlightRequest.current = null;
    }
  }, [photoUri]);

  const value = useMemo(
    () => ({
      errorMessage,
      invoice,
      photoUri,
      processInvoice,
      resetInvoice,
      selectPhoto,
      status,
    }),
    [errorMessage, invoice, photoUri, processInvoice, resetInvoice, selectPhoto, status],
  );

  return (
    <InvoiceProcessingContext.Provider value={value}>
      {children}
    </InvoiceProcessingContext.Provider>
  );
}

export function useInvoiceProcessing() {
  const context = useContext(InvoiceProcessingContext);

  if (!context) {
    throw new Error('useInvoiceProcessing debe usarse dentro de InvoiceProcessingProvider.');
  }

  return context;
}
