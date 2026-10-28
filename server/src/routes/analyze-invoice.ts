import { Router } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { invoiceSchema } from '../schemas/invoice.js';

const router = Router();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('La factura debe ser una imagen JPEG, PNG o WebP.'));
      return;
    }

    callback(null, true);
  },
});

router.post(
  '/analyze',
  upload.single('invoice'),
  async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({
          message: 'Debes enviar una fotografía en el campo invoice.',
        });
        return;
      }

      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        throw new Error('OPENAI_API_KEY no está configurada.');
      }

      const openai = new OpenAI({ apiKey });
      const encodedImage = request.file.buffer.toString('base64');
      const imageDataUrl =
        `data:${request.file.mimetype};base64,${encodedImage}`;

      const openaiResponse = await openai.responses.parse({
        model: 'gpt-6-sol',
        store: false,
        reasoning: {
          effort: 'low',
        },
        input: [
          {
            role: 'system',
            content: [
              'Eres un extractor de datos de facturas chilenas.',
              'Transcribe únicamente información visible.',
              'Nunca inventes ni completes caracteres ilegibles.',
              'Si un valor no puede leerse con claridad, devuelve null.',
              'Conserva exactamente guiones, puntos y ceros iniciales.',
              'Extrae solo el nombre del proveedor emisor y el número de factura.',
              'No extraigas productos, cantidades, precios, totales ni otros detalles.',
              'Agrega advertencias solo si el proveedor o el número de factura están incompletos o son dudosos.',
              'Si la imagen no corresponde a una factura, documentReadable debe ser false.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  'Extrae de esta factura:',
                  '- nombre del proveedor',
                  '- número de factura',
                ].join('\n'),
              },
              {
                type: 'input_image',
                image_url: imageDataUrl,
                detail: 'original',
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(invoiceSchema, 'invoice'),
        },
      });

      const invoice = openaiResponse.output_parsed;

      if (!invoice) {
        response.status(422).json({
          message: 'El modelo no pudo generar un resultado estructurado.',
        });
        return;
      }

      response.json(invoice);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
