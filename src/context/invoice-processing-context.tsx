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
import {
  InvoiceMailError,
  sendInvoiceEmail,
  type InvoiceEmailReceipt,
} from '@/services/invoice-mail';
import type { InvoiceData, InvoiceProcessingStatus } from '@/types/invoice';

type InvoiceEmailDraft = {
  subject: string;
  message: string;
};

type InvoiceEmailDelivery = {
  status: 'idle' | 'sending' | 'sent' | 'error' | 'uncertain';
  receipt?: InvoiceEmailReceipt;
  error?: { code: string; message: string; deviceId?: string };
};

function createEmailDraft(invoice: InvoiceData | null): InvoiceEmailDraft {
  const supplierName = invoice?.supplierName ?? 'proveedor no detectado';
  const invoiceNumber = invoice?.invoiceNumber ?? 'sin número';

  return {
    subject: `Recepción Mercadería Factura N.º ${invoiceNumber} - ${supplierName}`,
    message: [
      'Estimados,',
      '',
      `Adjunto factura N.º ${invoiceNumber} de ${supplierName}.`,
      '',
      'Ingresar como parte de entrada de mercadería en el sistema.',
      '',
      'Quedo atento,',
    ].join('\n'),
  };
}

type InvoiceProcessingContextValue = {
  emailDelivery: InvoiceEmailDelivery;
  emailDraft: InvoiceEmailDraft;
  errorMessage: string | null;
  invoice: InvoiceData | null;
  photoUri: string | null;
  processInvoice: () => Promise<InvoiceData>;
  resetInvoice: () => void;
  selectPhoto: (uri: string) => void;
  status: InvoiceProcessingStatus;
  submitInvoiceEmail: () => Promise<void>;
  updateEmailDraft: (changes: Partial<InvoiceEmailDraft>) => void;
};

const InvoiceProcessingContext = createContext<InvoiceProcessingContextValue | null>(null);

export function InvoiceProcessingProvider({ children }: PropsWithChildren) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [status, setStatus] = useState<InvoiceProcessingStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<InvoiceEmailDraft>(() => createEmailDraft(null));
  const [emailDelivery, setEmailDelivery] = useState<InvoiceEmailDelivery>({ status: 'idle' });
  const emailDraftRef = useRef(emailDraft);
  const emailDeliveryRef = useRef(emailDelivery);
  const selectedPhotoRef = useRef<string | null>(null);
  const inFlightEmail = useRef<Promise<void> | null>(null);
  const inFlightRequest = useRef<Promise<InvoiceData> | null>(null);
  const selectionVersion = useRef(0);

  const clearEmail = useCallback(() => {
    const draft = createEmailDraft(null);
    const delivery: InvoiceEmailDelivery = { status: 'idle' };
    emailDraftRef.current = draft;
    emailDeliveryRef.current = delivery;
    inFlightEmail.current = null;
    setEmailDraft(draft);
    setEmailDelivery(delivery);
  }, []);

  const selectPhoto = useCallback((uri: string) => {
    selectionVersion.current += 1;
    selectedPhotoRef.current = uri;
    inFlightRequest.current = null;
    clearEmail();
    setPhotoUri(uri);
    setInvoice(null);
    setErrorMessage(null);
    setStatus('ready');
  }, [clearEmail]);

  const resetInvoice = useCallback(() => {
    selectionVersion.current += 1;
    selectedPhotoRef.current = null;
    inFlightRequest.current = null;
    clearEmail();
    setPhotoUri(null);
    setInvoice(null);
    setErrorMessage(null);
    setStatus('idle');
  }, [clearEmail]);

  const updateEmailDraft = useCallback((changes: Partial<InvoiceEmailDraft>) => {
    if (['sending', 'sent', 'uncertain'].includes(emailDeliveryRef.current.status)) {
      return;
    }

    const draft = { ...emailDraftRef.current, ...changes };
    emailDraftRef.current = draft;
    setEmailDraft(draft);
  }, []);

  const submitInvoiceEmail = useCallback((): Promise<void> => {
    if (['sending', 'sent', 'uncertain'].includes(emailDeliveryRef.current.status)) {
      return inFlightEmail.current ?? Promise.resolve();
    }

    const selectedPhoto = selectedPhotoRef.current;
    if (!selectedPhoto) {
      const delivery: InvoiceEmailDelivery = {
        status: 'error',
        error: { code: 'PHOTO_REQUIRED', message: 'Toma una fotografía antes de enviar la factura.' },
      };
      emailDeliveryRef.current = delivery;
      setEmailDelivery(delivery);
      return Promise.resolve();
    }

    const sending: InvoiceEmailDelivery = { status: 'sending' };
    emailDeliveryRef.current = sending;
    setEmailDelivery(sending);
    const version = selectionVersion.current;
    const draft = emailDraftRef.current;
    const request = (async () => {
      try {
        const receipt = await sendInvoiceEmail({ photoUri: selectedPhoto, ...draft });
        if (selectionVersion.current === version) {
          const delivery: InvoiceEmailDelivery = { status: 'sent', receipt };
          emailDeliveryRef.current = delivery;
          setEmailDelivery(delivery);
        }
      } catch (error) {
        if (selectionVersion.current === version) {
          const mailError = error instanceof InvoiceMailError ? error : null;
          const code = mailError?.code ?? 'SEND_FAILED';
          const delivery: InvoiceEmailDelivery = {
            status: ['DELIVERY_UNCERTAIN', 'DELIVERY_IN_PROGRESS'].includes(code)
              ? 'uncertain'
              : 'error',
            error: {
              code,
              message: error instanceof Error ? error.message : 'No pudimos enviar el correo.',
              deviceId: mailError?.deviceId,
            },
          };
          emailDeliveryRef.current = delivery;
          setEmailDelivery(delivery);
        }
      } finally {
        if (selectionVersion.current === version) {
          inFlightEmail.current = null;
        }
      }
    })();
    inFlightEmail.current = request;
    return request;
  }, []);

  const processInvoice = useCallback(() => {
    if (!photoUri) {
      const error = new InvoiceApiError('No hay una fotografía seleccionada para procesar.');
      setErrorMessage(error.message);
      setStatus('error');
      return Promise.reject(error);
    }

    if (inFlightRequest.current) {
      return inFlightRequest.current;
    }

    setErrorMessage(null);
    setStatus('processing');

    const version = selectionVersion.current;
    const request = (async () => {
      try {
        const extractedInvoice = await analyzeInvoice(photoUri);

        if (selectionVersion.current !== version) {
          throw new InvoiceApiError('La fotografía seleccionada cambió. Vuelve a procesarla.');
        }

        if (!extractedInvoice.documentReadable) {
          throw new InvoiceApiError(
            'No pudimos identificar una factura legible. Toma otra foto con buena luz y el documento completo.',
          );
        }

        setInvoice(extractedInvoice);
        const draft = createEmailDraft(extractedInvoice);
        emailDraftRef.current = draft;
        setEmailDraft(draft);
        setStatus('success');
        return extractedInvoice;
      } catch (error) {
        if (selectionVersion.current === version) {
          const message =
            error instanceof Error
              ? error.message
              : 'Ocurrió un error inesperado al procesar la factura.';

          setInvoice(null);
          setErrorMessage(message);
          setStatus('error');
        }
        throw error;
      } finally {
        if (selectionVersion.current === version) {
          inFlightRequest.current = null;
        }
      }
    })();
    inFlightRequest.current = request;
    return request;
  }, [photoUri]);

  const value = useMemo(
    () => ({
      emailDelivery,
      emailDraft,
      errorMessage,
      invoice,
      photoUri,
      processInvoice,
      resetInvoice,
      selectPhoto,
      status,
      submitInvoiceEmail,
      updateEmailDraft,
    }),
    [
      emailDelivery,
      emailDraft,
      errorMessage,
      invoice,
      photoUri,
      processInvoice,
      resetInvoice,
      selectPhoto,
      status,
      submitInvoiceEmail,
      updateEmailDraft,
    ],
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
