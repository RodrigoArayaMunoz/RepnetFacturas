import 'dotenv/config';

import cors from 'cors';
import express, {
    type ErrorRequestHandler,
} from 'express';
import multer from 'multer';
import OpenAI from 'openai';

import analyzeInvoiceRouter from './routes/analyze-invoice.js';

const port = Number(process.env.PORT ?? 3000);
const allowedOrigin =
  process.env.ALLOWED_ORIGIN ?? 'http://localhost:8081';

const app = express();

app.disable('x-powered-by');

app.use(
  cors({
    origin: allowedOrigin,
  }),
);

app.use(express.json({ limit: '1mb' }));

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'repnet-invoice-api',
  });
});

app.use('/api/invoices', analyzeInvoiceRouter);

const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Ocurrió un error inesperado.';

  console.error('Error procesando la factura:', error);

  if (error instanceof multer.MulterError) {
    response.status(400).json({
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'La fotografía supera el máximo de 10 MB.'
          : 'No fue posible recibir la fotografía.',
    });
    return;
  }

  if (message.includes('JPEG, PNG o WebP')) {
    response.status(400).json({ message });
    return;
  }

  if (error instanceof OpenAI.APIConnectionError) {
    response.status(503).json({
      message:
        'No fue posible conectar con OpenAI. Revisa la conexión, el proxy o los certificados del servidor.',
    });
    return;
  }

  if (error instanceof OpenAI.AuthenticationError) {
    response.status(502).json({
      message:
        'OpenAI rechazó la credencial configurada. Revisa OPENAI_API_KEY en server/.env.',
    });
    return;
  }

  if (error instanceof OpenAI.RateLimitError) {
    response.status(429).json({
      message:
        'OpenAI rechazó temporalmente la solicitud por límite de uso o saldo disponible.',
    });
    return;
  }

  if (error instanceof OpenAI.APIError) {
    response.status(502).json({
      message: `OpenAI no pudo procesar la solicitud (${error.status ?? 'sin código HTTP'}).`,
    });
    return;
  }

  response.status(500).json({
    message: 'No fue posible procesar la factura.',
  });
};

app.use(errorHandler);

app.listen(port, '0.0.0.0', () => {
  console.log(`Repnet Invoice API disponible en http://localhost:${port}`);
});
