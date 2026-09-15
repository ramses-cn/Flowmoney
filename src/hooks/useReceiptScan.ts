/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * useReceiptScan — Hook personalizado para el escaneo de recibos con Gemini.
 *
 * F11 — Refactor: Extrae la lógica de escaneo de tickets del componente
 * AddExpenseModal (1.672 LOC) en un hook reutilizable y testeable.
 *
 * Responsabilidad: gestionar la captura de imagen, subida al backend,
 * parseo de la respuesta OCR, y manejo de estados (loading, error, success).
 */

import { useState, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore.ts';

export interface ScannedReceiptResult {
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  date: string | null;
  suggested_category: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface UseReceiptScanResult {
  isScanning: boolean;
  scanError: string | null;
  scanNotice: { type: 'success' | 'error' | 'info'; message: string } | null;
  confidenceLevel: 'high' | 'medium' | 'low' | null;
  scannedData: Partial<ScannedReceiptResult> | null;
  scanReceipt: (imageBase64: string, mimeType?: string) => Promise<ScannedReceiptResult | null>;
  resetScan: () => void;
}

export function useReceiptScan(): UseReceiptScanResult {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [confidenceLevel, setConfidenceLevel] = useState<'high' | 'medium' | 'low' | null>(null);
  const [scannedData, setScannedData] = useState<Partial<ScannedReceiptResult> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const token = useAuthStore((s) => s.token);

  const scanReceipt = useCallback(async (
    imageBase64: string,
    mimeType: string = 'image/jpeg'
  ): Promise<ScannedReceiptResult | null> => {
    setIsScanning(true);
    setScanError(null);
    setScanNotice(null);
    setConfidenceLevel(null);
    setScannedData(null);

    // Cancelar scans anteriores si las hay
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/expenses/scan-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageBase64,
          mimeType,
        }),
        signal: controller.signal,
      });

      if (response.status === 429) {
        const msg = 'Has alcanzado el límite de escaneos por minuto. Espera unos instantes.';
        setScanError(msg);
        setScanNotice({ type: 'error', message: msg });
        return null;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        const msg = data.error || 'No se pudo analizar el ticket. Completa los datos manualmente.';
        setScanError(msg);
        setScanNotice({ type: 'error', message: msg });
        return null;
      }

      const result: ScannedReceiptResult = data.data;
      setConfidenceLevel(result.confidence);
      setScannedData(result);

      if (result.confidence === 'low') {
        setScanNotice({
          type: 'info',
          message: 'No pudimos leer el ticket con claridad. Completa los datos manualmente.',
        });
      } else if (result.confidence === 'medium') {
        setScanNotice({
          type: 'info',
          message: 'Ticket leído con calidad media. Revisa los datos antes de guardar.',
        });
      } else {
        setScanNotice({
          type: 'success',
          message: 'Ticket analizado correctamente. Revisa y guarda el gasto.',
        });
      }

      return result;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      const msg = err.message || 'Error al procesar el ticket';
      setScanError(msg);
      setScanNotice({ type: 'error', message: msg });
      return null;
    } finally {
      setIsScanning(false);
      abortRef.current = null;
    }
  }, [token]);

  const resetScan = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setIsScanning(false);
    setScanError(null);
    setScanNotice(null);
    setConfidenceLevel(null);
    setScannedData(null);
  }, []);

  return {
    isScanning,
    scanError,
    scanNotice,
    confidenceLevel,
    scannedData,
    scanReceipt,
    resetScan,
  };
}
