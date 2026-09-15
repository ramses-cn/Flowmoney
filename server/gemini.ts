/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Integración de Inteligencia Artificial utilizando la biblioteca oficial @google/genai
import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required for receipt scanning');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Modelo por defecto para responder tareas de texto y multimodal rápido
// Corregido (F2): "gemini-3.8-flash" no existe en la API pública de Google.
// Modelos válidos actuales: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash.
// Se elige gemini-2.5-flash como mejor balance costo/calidad para OCR de tickets.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Configuración explícita para OCR determinista (F2 — parámetros faltantes)
const GEMINI_GENERATION_CONFIG = {
  temperature: 0,           // Máximo determinismo para OCR
  topP: 0.1,
  maxOutputTokens: 1024,    // Limita costos y respuestas verbose
};

// Cache LRU simple para evitar re-escaneos billables (F2)
// Máximo 100 imágenes (~10MB en memoria por hash+resultado)
const SCAN_CACHE_MAX = 100;
const scanResultCache = new Map<string, ScannedReceiptData>();
function cacheSet(key: string, value: ScannedReceiptData): void {
  if (scanResultCache.size >= SCAN_CACHE_MAX) {
    const firstKey = scanResultCache.keys().next().value;
    if (firstKey) scanResultCache.delete(firstKey);
  }
  scanResultCache.set(key, value);
}

export interface ScannedReceiptData {
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  date: string | null;
  suggested_category: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Fase 6: Analiza multimodalmente la foto de un ticket o recibo de compra con Gemini 2.5 Flash.
 * Extrae: amount, currency, merchant, date, suggested_category y confidence.
 * Si no logra leer con claridad, devuelve confidence: "low" y campos null en vez de inventar valores.
 *
 * Mejoras aplicadas (F2):
 * - Modelo corregido a gemini-2.5-flash (configurable via GEMINI_MODEL).
 * - Parámetros temperature=0, maxOutputTokens=1024 para OCR determinista y costo controlado.
 * - Retry exponencial con backoff ante 429/5xx de Google (máximo 2 reintentos).
 * - Cache simple LRU por hash de imagen para evitar re-escaneos billables.
 */
export async function scanReceiptWithGemini(
  base64Data: string,
  mimeType: string = 'image/jpeg'
): Promise<ScannedReceiptData> {
  try {
    const prompt = `Analiza con extrema precisión este ticket de compra, recibo o comprobante financiero.
Extrae la información clave del comprobante.
Devuelve ÚNICAMENTE un objeto JSON estricto con la siguiente estructura exacta:
{
  "amount": number | null,
  "currency": string | null,
  "merchant": string | null,
  "date": "YYYY-MM-DD" | null,
  "suggested_category": string | null,
  "confidence": "high" | "medium" | "low"
}

Reglas estrictas de extracción:
1. amount: Monto numérico total final a pagar (ejemplo: 24.50, 150.00). Si no se puede determinar con certeza, devuelve null. No incluyas signos de moneda ni strings.
2. currency: Código ISO de 3 letras de la moneda (ejemplos: USD, EUR, MXN, PEN, COP, CLP, ARS). Si no se puede determinar, devuelve null.
3. merchant: Nombre del comercio, establecimiento, tienda o restaurante emisor del ticket (ej: "Supermercados Metro", "Starbucks", "Farmacias del Ahorro"). Si no es legible o identificable, devuelve null.
4. date: Fecha del comprobante en formato "YYYY-MM-DD" (ejemplo: 2026-03-09). Si no es legible, devuelve null.
5. suggested_category: Debe ser EXACTAMENTE una de las siguientes 8 categorías por defecto según el tipo de productos o comercio:
   - "Comida" (supermercados, restaurantes, cafeterías, delivery, tiendas de abarrotes)
   - "Transporte" (gasolina, combustible, peajes, taxis, Uber, pasajes)
   - "Ocio" (bares, cines, espectáculos, entretenimiento, discotecas)
   - "Casa" (servicios del hogar, muebles, ferretería, limpieza, suministros)
   - "Salud" (farmacias, medicamentos, consultas médicas, dentistas)
   - "Compras" (ropa, calzado, electrónica, centros comerciales)
   - "Suscripciones" (software, streaming, servicios recurrentes)
   - "Otros" (cualquier otro gasto)
   Si no puedes inferir ninguna con razonable certeza, devuelve null.
6. confidence:
   - "high": El ticket es completamente nítido y se leen claramente el total y el nombre del comercio.
   - "medium": Se leyeron datos pero la imagen tiene alguna zona borrosa, inclinada o dudosa.
   - "low": La imagen es ilegible, muy borrosa, cortada, o no parece un comprobante.
7. CRÍTICO: Si no logras leer el ticket con claridad, devuelve confidence: "low" y los campos que no pudiste determinar como null, en vez de inventar valores. NUNCA inventes números ni comercios inexistentes.`;

    const imagePart = {
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: base64Data,
      },
    };

    const textPart = {
      text: prompt,
    };

    const geminiCall = () => getAiClient().models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts: [imagePart, textPart] },
      config: {
        systemInstruction:
          'Eres un sistema OCR inteligente y extractor especializado de comprobantes de pago y tickets de compra. Responde ÚNICAMENTE en JSON válido con el esquema solicitado sin markdown envolvente ni texto adicional.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, nullable: true },
            currency: { type: Type.STRING, nullable: true },
            merchant: { type: Type.STRING, nullable: true },
            date: { type: Type.STRING, nullable: true },
            suggested_category: { type: Type.STRING, nullable: true },
            confidence: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          },
          required: ['confidence'],
        },
        // Parámetros de generación deterministas (F2)
        temperature: GEMINI_GENERATION_CONFIG.temperature,
        topP: GEMINI_GENERATION_CONFIG.topP,
        maxOutputTokens: GEMINI_GENERATION_CONFIG.maxOutputTokens,
      },
    });

    // Cache simple por hash de imagen (F2 — evita re-escaneo billable)
    const crypto = await import('crypto');
    const imageHash = crypto.createHash('sha256').update(base64Data).digest('hex').slice(0, 32);
    const cached = scanResultCache.get(imageHash);
    if (cached) {
      // Cache hit: mover al final para LRU
      scanResultCache.delete(imageHash);
      scanResultCache.set(imageHash, cached);
      return cached;
    }

    // Timeout de 25 segundos para resguardar la experiencia del usuario
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), 25000);
    });

    // Retry exponencial con backoff ante 429/5xx (F2)
    let lastError: any = null;
    let response: any = null;
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await Promise.race([geminiCall(), timeoutPromise]);
        break;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err || '').toLowerCase();
        const isRetryable = msg.includes('429') || msg.includes('rate') ||
                            msg.includes('503') || msg.includes('500') ||
                            msg.includes('timeout') || msg.includes('unavailable');
        if (!isRetryable || attempt === MAX_RETRIES) break;
        const backoffMs = Math.pow(2, attempt) * 500 + Math.random() * 250; // 500-750ms, 1000-1500ms
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
    if (!response) {
      throw lastError || new Error('Gemini no respondió tras reintentos');
    }

    const text = response.text;
    if (!text) {
      throw new Error('Respuesta vacía de Gemini');
    }

    const parsed = JSON.parse(text.trim());

    // Validar y normalizar
    const result: ScannedReceiptData = {
      amount: typeof parsed.amount === 'number' && !isNaN(parsed.amount) && parsed.amount > 0 ? parsed.amount : null,
      currency: typeof parsed.currency === 'string' && parsed.currency.trim().length > 0 ? parsed.currency.trim().toUpperCase() : null,
      merchant: typeof parsed.merchant === 'string' && parsed.merchant.trim().length > 0 ? parsed.merchant.trim() : null,
      date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date.trim()) ? parsed.date.trim() : null,
      suggested_category: typeof parsed.suggested_category === 'string' && parsed.suggested_category.trim().length > 0 ? parsed.suggested_category.trim() : null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
    };

    // Guardar en cache (F2) — sólo si confidence != 'low' para no cachear fallos
    if (result.confidence !== 'low') {
      cacheSet(imageHash, result);
    }

    return result;
  } catch (error: any) {
    console.error('[Gemini scanReceiptWithGemini Error]:', error);
    throw error;
  }
}
