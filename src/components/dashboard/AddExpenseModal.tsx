import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import { Group, GroupMember, ExpenseLens } from '../../types/flowmoney.ts';
import { uploadReceiptImage } from '../../lib/firebase.ts';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from '../../constants/currencies.ts';
import {
  X,
  ArrowLeft,
  ArrowRight,
  Camera,
  Upload,
  Check,
  Calendar,
  CreditCard,
  Tag,
  User,
  Heart,
  Users,
  Percent,
  Divide,
  Sliders,
  DollarSign,
  AlertCircle,
  FileText,
  Sparkles,
  Loader2,
  RefreshCw,
  Lock,
  Settings2,
  Search,
} from 'lucide-react';
import { ManageCategoriesModal } from '../profile/ManageCategoriesModal.tsx';
import { safeFetchJson } from '../../utils/apiClient.ts';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialGroupId?: string;
}

type SplitMode = 'equal' | 'percentage' | 'exact' | 'full_payer';

const AVAILABLE_CURRENCIES = ['PEN', 'USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP', 'BRL'];

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialGroupId,
}) => {
  const { token, profile, categories, accounts, updateAccountBalance, fetchCategories } = useAuthStore();

  // Paso actual (1: Detalles, 2: Contexto y división)
  const [step, setStep] = useState<1 | 2>(1);

  // Pantalla 1: Detalles
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Fase 6: Autocompletar con escaneo de ticket usando Gemini
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingTicket, setIsAnalyzingTicket] = useState(false);
  const [scanNotice, setScanNotice] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [confidenceLevel, setConfidenceLevel] = useState<'high' | 'medium' | 'low' | null>(null);
  const [preFilledFields, setPreFilledFields] = useState<{
    amount: boolean;
    description: boolean;
    date: boolean;
    category: boolean;
  }>({
    amount: false,
    description: false,
    date: false,
    category: false,
  });

  // Modal / visor de cámara en vivo (MediaDevices)
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Sugerencias de gastos frecuentes
  const [frequentExpenses, setFrequentExpenses] = useState<Array<{ description: string; category_id?: string }>>([]);

  // Pantalla 2: Contexto y división
  const [lens, setLens] = useState<ExpenseLens>('personal');
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [notes, setNotes] = useState<string>('');

  // Miembros incluidos en el split
  const [includedUserIds, setIncludedUserIds] = useState<Set<string>>(new Set());

  // Valores de split personalizados (para porcentajes y montos exactos)
  const [customPercentages, setCustomPercentages] = useState<Record<string, number>>({});
  const [customAmounts, setCustomAmounts] = useState<Record<string, number>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isManageCatOpen, setIsManageCatOpen] = useState(false);

  // Moneda elegible libremente para gastos personales
  const [personalCurrency, setPersonalCurrency] = useState<string>(
    profile?.default_currency || DEFAULT_CURRENCY
  );

  // Determinar grupo activo para fijar la moneda única en contexto de grupo/pareja
  const selectedGroup =
    lens === 'group'
      ? userGroups.find((g) => g.id === selectedGroupId)
      : lens === 'couple'
      ? userGroups.find((g) => g.type === 'couple')
      : null;

  const isGroupContext = lens === 'group' || lens === 'couple';
  const groupCurrency = selectedGroup?.currency;

  // Si es grupo o pareja, la moneda queda estrictamente fijada a la del grupo
  const currency = isGroupContext && groupCurrency ? groupCurrency : personalCurrency;

  // Inicializar defaults
  useEffect(() => {
    if (isOpen) {
      setPersonalCurrency(profile?.default_currency || DEFAULT_CURRENCY);
      setStep(1);
      setAmount('');
      setDescription('');
      setErrorMsg(null);
      setNotes('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setReceiptUrl(null);
      setScanNotice(null);
      setConfidenceLevel(null);
      setIsAnalyzingTicket(false);
      setPreFilledFields({
        amount: false,
        description: false,
        date: false,
        category: false,
      });
      if (initialGroupId) {
        setLens('group');
        setSelectedGroupId(initialGroupId);
      } else {
        setLens('personal');
      }
      setSplitMode('equal');

      if (categories.length > 0 && !categoryId) {
        setCategoryId(categories[0].id);
      }
      // No forzar selección obligatoria de cuenta: el registro de gastos es libre y no depende de fondos ni cuentas
      if (accounts.length > 0 && !accountId) {
        // Mantener opcional sin forzar la primera cuenta
      }

      // Cargar sugerencias de frecuentes
      if (token) {
        fetch('/api/expenses/frequent', {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.frequent) setFrequentExpenses(d.frequent);
          })
          .catch((e) => console.warn(e));

        // Cargar grupos del usuario
        safeFetchJson<{ groups?: Group[] }>('/api/groups')
          .then((d) => {
            if (d?.groups) {
              setUserGroups(d.groups);
              if (d.groups.length > 0) {
                setSelectedGroupId((prev) => {
                  if (prev && d.groups!.some((g) => g.id === prev)) return prev;
                  if (initialGroupId && d.groups!.some((g) => g.id === initialGroupId)) return initialGroupId;
                  return d.groups![0].id;
                });
              }
            }
          })
          .catch((e) => console.warn(e));
      }
    }
  }, [isOpen, initialGroupId, token, categories, accounts]);

  // Sincronizar selección de grupo cuando cambian los grupos disponibles
  useEffect(() => {
    if (userGroups.length > 0) {
      setSelectedGroupId((prev) => {
        if (prev && userGroups.some((g) => g.id === prev)) return prev;
        if (initialGroupId && userGroups.some((g) => g.id === initialGroupId)) return initialGroupId;
        return userGroups[0].id;
      });
    }
  }, [userGroups, initialGroupId]);

  // Escuchar eventos globales de creación de grupo y cambios de datos
  useEffect(() => {
    const handleGroupCreated = (e: any) => {
      const newGrp = e.detail;
      if (newGrp?.id) {
        setUserGroups((prev) => {
          if (prev.some((g) => g.id === newGrp.id)) return prev;
          return [newGrp, ...prev];
        });
        setSelectedGroupId(newGrp.id);
      }
    };
    const handleDataChanged = () => {
      safeFetchJson<{ groups?: Group[] }>('/api/groups')
        .then((d) => {
          if (d?.groups) setUserGroups(d.groups);
        })
        .catch(() => {});
    };
    window.addEventListener('group_created', handleGroupCreated);
    window.addEventListener('flowmoney_data_changed', handleDataChanged);
    return () => {
      window.removeEventListener('group_created', handleGroupCreated);
      window.removeEventListener('flowmoney_data_changed', handleDataChanged);
    };
  }, []);

  // Cargar miembros del grupo cuando cambia selectedGroupId o lens
  useEffect(() => {
    if (!isOpen) return;

    if (lens === 'group' && selectedGroupId) {
      safeFetchJson<{ members?: any[] }>(`/api/groups/${selectedGroupId}/members`)
        .then((d) => {
          if (d?.members && d.members.length > 0) {
            setGroupMembers(d.members);
            const allIds = new Set<string>(d.members.map((m: any) => m.user_id));
            setIncludedUserIds(allIds);

            // Inicializar porcentajes y montos parejos
            initSplitValues(d.members, Number(amount || 0));
          } else {
            const fallbackMembers = [
              {
                id: 'self',
                group_id: selectedGroupId,
                user_id: profile?.id || 'uid',
                role: 'admin' as const,
                joined_at: new Date().toISOString(),
                full_name: profile?.full_name || 'Tú',
                email: profile?.email || '',
              },
            ];
            setGroupMembers(fallbackMembers);
            setIncludedUserIds(new Set([profile?.id || 'uid']));
            initSplitValues(fallbackMembers, Number(amount || 0));
          }
        })
        .catch((e) => {
          console.warn('Error al cargar miembros del grupo:', e);
          const fallbackMembers = [
            {
              id: 'self',
              group_id: selectedGroupId,
              user_id: profile?.id || 'uid',
              role: 'admin' as const,
              joined_at: new Date().toISOString(),
              full_name: profile?.full_name || 'Tú',
              email: profile?.email || '',
            },
          ];
          setGroupMembers(fallbackMembers);
          setIncludedUserIds(new Set([profile?.id || 'uid']));
          initSplitValues(fallbackMembers, Number(amount || 0));
        });
    } else if (lens === 'couple') {
      // Buscar grupo de pareja si existe
      const coupleGrp = userGroups.find((g) => g.type === 'couple');
      if (coupleGrp) {
        safeFetchJson<{ members?: any[] }>(`/api/groups/${coupleGrp.id}/members`)
          .then((d) => {
            if (d?.members && d.members.length > 0) {
              setGroupMembers(d.members);
              const allIds = new Set<string>(d.members.map((m: any) => m.user_id));
              setIncludedUserIds(allIds);
              initSplitValues(d.members, Number(amount || 0));
            } else {
              setMockCoupleMembers();
            }
          })
          .catch(() => setMockCoupleMembers());
      } else {
        setMockCoupleMembers();
      }
    }
  }, [lens, selectedGroupId, isOpen, userGroups, profile]);

  const setMockCoupleMembers = () => {
    const mock = [
      { id: '1', group_id: 'couple', user_id: profile?.id || 'uid', role: 'admin' as const, joined_at: '', full_name: 'Tú' },
      { id: '2', group_id: 'couple', user_id: 'usr_partner_sofia', role: 'member' as const, joined_at: '', full_name: 'Sofía Morales' },
    ];
    setGroupMembers(mock);
    setIncludedUserIds(new Set(mock.map((m) => m.user_id)));
    initSplitValues(mock, Number(amount || 0));
  };

  const initSplitValues = (members: any[], totalAmt: number) => {
    const count = members.length || 1;
    const basePct = Math.floor(100 / count);
    const remainder = 100 - basePct * count;
    const pcts: Record<string, number> = {};
    const amts: Record<string, number> = {};

    members.forEach((m, idx) => {
      pcts[m.user_id] = basePct + (idx < remainder ? 1 : 0);
      amts[m.user_id] = Number((totalAmt / count).toFixed(2));
    });

    setCustomPercentages(pcts);
    setCustomAmounts(amts);
  };

  // Ajuste automático proporcional cuando se modifica el porcentaje de un miembro
  const handlePercentageChange = (userId: string, rawVal: number) => {
    const activeMembers = groupMembers.filter((m) => includedUserIds.has(m.user_id));
    if (activeMembers.length <= 1) {
      setCustomPercentages({ [userId]: 100 });
      return;
    }

    const clampedVal = Math.max(0, Math.min(100, Math.round(rawVal)));
    const otherMembers = activeMembers.filter((m) => m.user_id !== userId);
    const remainingPct = 100 - clampedVal;

    const currentOtherSum = otherMembers.reduce(
      (acc, m) => acc + (customPercentages[m.user_id] ?? 0),
      0
    );

    const updatedPercentages: Record<string, number> = {
      ...customPercentages,
      [userId]: clampedVal,
    };

    if (otherMembers.length === 1) {
      // Si son 2 participantes (ej. pareja o 2 en grupo)
      updatedPercentages[otherMembers[0].user_id] = remainingPct;
    } else {
      // 3 o más participantes: ajuste proporcional a sus pesos actuales
      let distributed = 0;
      otherMembers.forEach((m, idx) => {
        if (idx === otherMembers.length - 1) {
          // El último absorbe el remanente exacto para sumar 100
          updatedPercentages[m.user_id] = Math.max(0, remainingPct - distributed);
        } else {
          const ratio = currentOtherSum > 0
            ? (customPercentages[m.user_id] ?? 0) / currentOtherSum
            : 1 / otherMembers.length;
          const assigned = Math.max(0, Math.round(remainingPct * ratio));
          updatedPercentages[m.user_id] = assigned;
          distributed += assigned;
        }
      });
    }

    setCustomPercentages(updatedPercentages);
  };

  const autoBalancePercentages = () => {
    const activeMembers = groupMembers.filter((m) => includedUserIds.has(m.user_id));
    initSplitValues(activeMembers, Number(amount || 0));
  };

  // Fase 6: Utilidad para convertir File a Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
    });
  };

  // Fase 6: Procesar y escanear imagen de ticket con Gemini AI
  const processReceiptImage = async (file: File) => {
    if (!file) return;

    setReceiptFile(file);
    const localUrl = URL.createObjectURL(file);
    setReceiptPreview(localUrl);

    setIsAnalyzingTicket(true);
    setIsUploadingPhoto(true);
    setScanNotice(null);

    // 1. Subida en paralelo a Firebase Storage (Fase 2)
    uploadReceiptImage(file, profile?.id || 'guest')
      .then((uploadedUrl) => {
        setReceiptUrl(uploadedUrl);
      })
      .catch((err) => {
        console.warn('Error subiendo foto a Firebase Storage:', err);
      })
      .finally(() => {
        setIsUploadingPhoto(false);
      });

    // 2. Extracción de datos con Gemini Multimodal vía backend
    try {
      const base64Data = await fileToBase64(file);
      const json = await safeFetchJson('/api/expenses/scan-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: file.type || 'image/jpeg',
        }),
      });

      if (json && json.success && json.data) {
        const {
          amount: scAmt,
          merchant: scMerch,
          date: scDate,
          suggested_category: scCat,
          confidence: scConf,
        } = json.data;

        const updatedPreFilled = {
          amount: false,
          description: false,
          date: false,
          category: false,
        };

        // Pre-llenar monto
        if (scAmt !== null && scAmt !== undefined && Number(scAmt) > 0) {
          setAmount(Number(scAmt).toFixed(2));
          updatedPreFilled.amount = true;
        }

        // Pre-llenar descripción / comercio
        if (scMerch && typeof scMerch === 'string' && scMerch.trim().length > 0) {
          setDescription(scMerch.trim());
          updatedPreFilled.description = true;
        }

        // Pre-llenar fecha en formato YYYY-MM-DD
        if (scDate && typeof scDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(scDate.trim())) {
          setExpenseDate(scDate.trim());
          updatedPreFilled.date = true;
        }

        // Pre-llenar categoría sugerida buscando coincidencias en las categorías del usuario
        if (scCat && typeof scCat === 'string' && scCat.trim().length > 0) {
          const cleanCat = scCat.trim().toLowerCase();
          const matched =
            categories.find((c) => c.name.toLowerCase() === cleanCat) ||
            categories.find(
              (c) =>
                c.name.toLowerCase().includes(cleanCat) ||
                cleanCat.includes(c.name.toLowerCase())
            );
          if (matched) {
            setCategoryId(matched.id);
            updatedPreFilled.category = true;
          }
        }

        setPreFilledFields(updatedPreFilled);
        const finalConf = scConf || 'low';
        setConfidenceLevel(finalConf);

        if (finalConf === 'high') {
          setScanNotice({
            type: 'success',
            message: `Ticket analizado con alta precisión (${scMerch || 'Comercio identificado'}). Revisa los datos y confirma.`,
          });
        } else if (finalConf === 'medium') {
          setScanNotice({
            type: 'warning',
            message: 'Datos extraídos con precisión media. Revisa los campos resaltados con "Verifica este dato".',
          });
        } else {
          setScanNotice({
            type: 'warning',
            message: 'No pudimos reconocer todos los datos con certeza. Completa los campos vacíos a mano.',
          });
        }
      } else {
        setScanNotice({
          type: 'error',
          message: json.error || 'No se pudo leer el ticket, complétalo manualmente',
        });
        setConfidenceLevel('low');
      }
    } catch (err: any) {
      console.error('Error al escanear ticket:', err);
      setScanNotice({
        type: 'error',
        message: 'No se pudo leer el ticket, complétalo manualmente',
      });
      setConfidenceLevel('low');
    } finally {
      setIsAnalyzingTicket(false);
    }
  };

  // Manejador para el input de cámara móvil
  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processReceiptImage(file);
    }
    e.target.value = '';
  };

  // Manejador para el input de selección de archivo
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processReceiptImage(file);
    }
    e.target.value = '';
  };

  // Limpiar ticket cargado
  const clearReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptUrl(null);
    setScanNotice(null);
    setConfidenceLevel(null);
    setPreFilledFields({
      amount: false,
      description: false,
      date: false,
      category: false,
    });
  };

  // Visor de cámara en vivo con MediaDevices API (opcional para web/desktop)
  const startLiveCamera = async () => {
    try {
      setIsLiveCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn('Cámara en vivo no disponible, usando captura de archivo:', err);
      setIsLiveCameraOpen(false);
      cameraInputRef.current?.click();
    }
  };

  const stopLiveCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
    setIsLiveCameraOpen(false);
  };

  const captureFromLiveVideo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `ticket_scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
          stopLiveCamera();
          processReceiptImage(file);
        }
      }, 'image/jpeg', 0.9);
    }
  };

  // Subir foto de ticket manual
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e);
  };

  const handleNextToStep2 = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setErrorMsg('Por favor ingresa un monto válido mayor a 0');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Por favor ingresa una descripción para el gasto');
      return;
    }
    setErrorMsg(null);
    setStep(2);
  };

  const toggleMemberInclusion = (userId: string) => {
    const next = new Set(includedUserIds);
    if (next.has(userId)) {
      if (next.size > 1) {
        next.delete(userId);
      }
    } else {
      next.add(userId);
    }
    setIncludedUserIds(next);

    const active = groupMembers.filter((m) => next.has(m.user_id));
    initSplitValues(active, Number(amount || 0));
  };

  // Guardar Gasto llamando a POST /api/expenses
  const handleSubmitExpense = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);

    const numAmount = parseFloat(amount);
    const uid = profile?.id || 'uid';

    // Construir los expense_shares si corresponde
    let sharesPayload: Array<{ user_id: string; owed_amount: number; percentage?: number }> = [];

    if (lens !== 'personal') {
      const activeMembers = groupMembers.filter((m) => includedUserIds.has(m.user_id));
      const count = activeMembers.length || 1;

      if (splitMode === 'equal') {
        let accumulatedOwed = 0;
        const equalPct = Number((100 / count).toFixed(2));
        sharesPayload = activeMembers.map((m, idx) => {
          let owedVal: number;
          if (idx === count - 1) {
            owedVal = Number(Math.max(0, numAmount - accumulatedOwed).toFixed(2));
          } else {
            owedVal = Number((numAmount / count).toFixed(2));
            accumulatedOwed += owedVal;
          }
          return {
            user_id: m.user_id,
            owed_amount: owedVal,
            percentage: equalPct,
          };
        });
      } else if (splitMode === 'percentage') {
        const totalPct = activeMembers.reduce((sum, m) => sum + (customPercentages[m.user_id] ?? 0), 0);
        let accumulatedOwed = 0;
        let accumulatedPct = 0;

        sharesPayload = activeMembers.map((m, idx) => {
          const rawPct = customPercentages[m.user_id] ?? 0;
          let finalPct: number;
          let owedVal: number;

          if (idx === count - 1) {
            finalPct = Math.max(0, 100 - accumulatedPct);
            owedVal = Number(Math.max(0, numAmount - accumulatedOwed).toFixed(2));
          } else {
            finalPct = totalPct > 0 ? Math.round((rawPct / totalPct) * 100) : Math.round(100 / count);
            accumulatedPct += finalPct;
            owedVal = Number(((numAmount * finalPct) / 100).toFixed(2));
            accumulatedOwed += owedVal;
          }

          return {
            user_id: m.user_id,
            owed_amount: owedVal,
            percentage: finalPct,
          };
        });
      } else if (splitMode === 'exact') {
        sharesPayload = activeMembers.map((m) => ({
          user_id: m.user_id,
          owed_amount: customAmounts[m.user_id] || 0,
        }));
      } else if (splitMode === 'full_payer') {
        // "Yo pago todo pero cuenta para el presupuesto de ambos": el usuario asume el total
        sharesPayload = [
          {
            user_id: uid,
            owed_amount: numAmount,
            percentage: 100,
          },
        ];
      }
    }

    if (lens === 'group' && (!selectedGroupId || selectedGroupId.trim() === '')) {
      setErrorMsg('Por favor selecciona un grupo para registrar este gasto grupal.');
      setIsSubmitting(false);
      return;
    }

    if (lens !== 'personal' && sharesPayload.length === 0) {
      sharesPayload = [
        {
          user_id: uid,
          owed_amount: numAmount,
          percentage: 100,
        },
      ];
    }

    try {
      const data = await safeFetchJson('/api/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: numAmount,
          currency,
          description: description.trim(),
          expense_date: expenseDate,
          category_id: categoryId || null,
          account_id: accountId ? accountId : null,
          lens,
          group_id: lens === 'group' ? selectedGroupId : lens === 'couple' ? (userGroups.find(g => g.type === 'couple')?.id || null) : null,
          paid_by: uid,
          receipt_url: receiptUrl,
          notes: notes.trim() || null,
          split_type: splitMode,
          shares: sharesPayload,
        }),
      });

      // Notificar a toda la aplicación de que se creó un gasto exitosamente
      window.dispatchEvent(new CustomEvent('expense_created', { detail: data.expense }));
      window.dispatchEvent(new CustomEvent('flowmoney_data_changed'));

      // Actualizar saldo de cuenta de forma reactiva en el store si aplica (permitiendo saldos negativos/sobregiro si aplica)
      if (accountId && uid === (profile?.id || 'uid')) {
        const foundAcc = accounts.find((a) => a.id === accountId);
        if (foundAcc) {
          updateAccountBalance(accountId, Number(foundAcc.current_balance || 0) - numAmount);
        }
      }

      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('[AddExpense Error]:', err);
      setErrorMsg(err.message || 'Error al registrar el gasto. Por favor reintenta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      {/* Contenedor Bottom Sheet */}
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Cabecera del Bottom Sheet */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="p-1.5 -ml-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {step === 1 ? 'Añadir Gasto' : 'Contexto y División'}
              </h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Paso {step} de 2
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start justify-between space-x-2 animate-fade-in shadow-xs">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-500" />
                <div>
                  <p className="font-semibold">{errorMsg}</p>
                  <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                    Recuerda que no es obligatorio contar con cuenta ni saldo para registrar tus transacciones.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-rose-400 hover:text-rose-600 dark:hover:text-rose-200 p-1 font-bold text-sm leading-none"
              >
                ×
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANTALLA 1: DETALLES                                                      */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              {/* Sección Destacada: Escanear Ticket con Gemini (Fase 6) */}
              <div className="bg-gradient-to-br from-indigo-50/90 via-slate-50 to-purple-50/40 dark:from-indigo-950/40 dark:via-slate-900/60 dark:to-purple-950/30 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-600/30">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>Autocompletar escaneando ticket</span>
                        <span className="text-[9px] px-1.5 py-0.2 bg-indigo-100 dark:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 font-extrabold rounded-full">
                          IA
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Foto con cámara o archivo para extraer monto, comercio y fecha
                      </p>
                    </div>
                  </div>
                </div>

                {/* Inputs invisibles para Cámara nativa y Subida de archivos */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                  id="receipt-camera-capture"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="receipt-file-upload"
                />

                {/* Botones de Acción: Escanear Ticket (Destacado) + Subir Foto */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-scan-ticket-camera"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isAnalyzingTicket}
                    className="flex-1 py-2.5 px-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/25 flex items-center justify-center space-x-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Escanear ticket</span>
                  </button>

                  <button
                    type="button"
                    id="btn-scan-ticket-upload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzingTicket}
                    className="py-2.5 px-3.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-400" />
                    <span>Subir foto</span>
                  </button>

                  {/* Botón opcional para visor en vivo si hay webcam */}
                  {typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (
                    <button
                      type="button"
                      title="Abrir visor de cámara en vivo"
                      onClick={startLiveCamera}
                      disabled={isAnalyzingTicket}
                      className="p-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-500" />
                    </button>
                  )}
                </div>

                {/* Estado de Carga: "Analizando ticket..." */}
                {isAnalyzingTicket && (
                  <div className="p-3 bg-white/90 dark:bg-slate-900/90 rounded-xl border border-indigo-200 dark:border-indigo-800/70 flex items-center space-x-3 animate-pulse shadow-sm">
                    {receiptPreview ? (
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-indigo-300 dark:border-indigo-700">
                        <img src={receiptPreview} alt="Ticket en proceso" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0">
                        <Camera className="w-5 h-5 text-indigo-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                          Analizando ticket con Gemini...
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {isUploadingPhoto
                          ? 'Subiendo a Storage y detectando datos con IA...'
                          : 'Extrayendo monto, comercio, fecha y categoría...'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Banner de Resultado del Escaneo (Éxito, Precaución o Error amigable) */}
                {scanNotice && !isAnalyzingTicket && (
                  <div
                    className={`p-2.5 rounded-xl text-xs flex items-start space-x-2.5 animate-fade-in ${
                      scanNotice.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : scanNotice.type === 'warning'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                        : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    {scanNotice.type === 'success' ? (
                      <Check className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <p className="font-semibold text-xs leading-tight">{scanNotice.message}</p>
                        {confidenceLevel && (
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                              confidenceLevel === 'high'
                                ? 'bg-emerald-200 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-100'
                                : confidenceLevel === 'medium'
                                ? 'bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-100'
                                : 'bg-rose-200 dark:bg-rose-900/80 text-rose-900 dark:text-rose-100'
                            }`}
                          >
                            Precisión: {confidenceLevel === 'high' ? 'Alta' : confidenceLevel === 'medium' ? 'Media' : 'Baja'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Previsualización del Ticket Cargado */}
                {receiptPreview && !isAnalyzingTicket && (
                  <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <img
                        src={receiptPreview}
                        alt="Comprobante cargado"
                        className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
                      />
                      <div className="truncate">
                        <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate block">
                          {receiptFile?.name || 'Comprobante escaneado'}
                        </span>
                        <span className="text-[9px] text-slate-400 block truncate">
                          {receiptUrl ? 'Guardado en Storage' : 'Comprobante listo'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      {receiptFile && (
                        <button
                          type="button"
                          onClick={() => processReceiptImage(receiptFile)}
                          className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-bold px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors flex items-center space-x-1"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>Re-analizar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={clearReceipt}
                        className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors"
                        title="Eliminar ticket"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Monto Grande con Teclado Numérico */}
              <div
                className={`bg-slate-50 dark:bg-slate-950/80 p-4 rounded-2xl border text-center space-y-1 transition-all ${
                  preFilledFields.amount && (confidenceLevel === 'medium' || confidenceLevel === 'low')
                    ? 'border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/20'
                    : 'border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-center space-x-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Monto del Gasto
                  </span>
                  {preFilledFields.amount && (confidenceLevel === 'medium' || confidenceLevel === 'low') && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold border border-amber-300 dark:border-amber-700">
                      <AlertCircle className="w-3 h-3" />
                      <span>Verifica este dato</span>
                    </span>
                  )}
                  {preFilledFields.amount && confidenceLevel === 'high' && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-300 dark:border-emerald-700">
                      <Check className="w-3 h-3" />
                      <span>Autocompletado</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-center space-x-2">
                  {isGroupContext ? (
                    <div
                      title={`Moneda fijada por el ${lens === 'couple' ? 'espacio de pareja' : 'grupo'} (${currency})`}
                      className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 select-none shadow-2xs"
                    >
                      <Lock className="w-3 h-3 text-indigo-500 shrink-0" />
                      <span>{currency}</span>
                    </div>
                  ) : (
                    <select
                      id="personal-currency-select"
                      value={personalCurrency}
                      onChange={(e) => setPersonalCurrency(e.target.value)}
                      className="px-2 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-800 dark:text-slate-200 cursor-pointer focus:outline-none shadow-2xs"
                      title="Moneda del gasto personal"
                    >
                      {AVAILABLE_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    autoFocus
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      if (preFilledFields.amount) {
                        setPreFilledFields((prev) => ({ ...prev, amount: false }));
                      }
                    }}
                    className="w-48 text-3xl font-black text-center bg-transparent text-slate-900 dark:text-white border-none outline-none focus:ring-0 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                  />
                </div>

                {isGroupContext && (
                  <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 font-medium">
                    Moneda fijada por el {lens === 'couple' ? 'espacio de pareja' : 'grupo'} ({currency})
                  </p>
                )}

                {/* Accesos rápidos de incremento */}
                <div className="flex justify-center space-x-2 pt-1">
                  {[10, 20, 50, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        const cur = parseFloat(amount) || 0;
                        setAmount((cur + val).toFixed(2));
                        if (preFilledFields.amount) {
                          setPreFilledFields((prev) => ({ ...prev, amount: false }));
                        }
                      }}
                      className="px-2 py-0.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 hover:border-indigo-500 transition-colors"
                    >
                      +{val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción con Autocompletado */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Descripción / Comercio
                  </label>
                  {preFilledFields.description && (confidenceLevel === 'medium' || confidenceLevel === 'low') && (
                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold border border-amber-300 dark:border-amber-700">
                      <AlertCircle className="w-3 h-3" />
                      <span>Verifica este dato</span>
                    </span>
                  )}
                  {preFilledFields.description && confidenceLevel === 'high' && (
                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-300 dark:border-emerald-700">
                      <Check className="w-3 h-3" />
                      <span>Autocompletado</span>
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Ej. Supermercado, Almuerzo, Uber, Cena..."
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (preFilledFields.description) {
                      setPreFilledFields((prev) => ({ ...prev, description: false }));
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 transition-all ${
                    preFilledFields.description && (confidenceLevel === 'medium' || confidenceLevel === 'low')
                      ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-400/30'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                />

                {/* Chips de gastos frecuentes para autocompletar con 1 click */}
                {frequentExpenses.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 font-semibold self-center mr-1">
                      Frecuentes:
                    </span>
                    {frequentExpenses.slice(0, 5).map((fq, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setDescription(fq.description);
                          if (fq.category_id) setCategoryId(fq.category_id);
                          setPreFilledFields((prev) => ({ ...prev, description: false }));
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium transition-colors"
                      >
                        {fq.description}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Categoría (Grid Visual con Iconos) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Categoría
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsManageCatOpen(true)}
                      className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-0.5"
                    >
                      <Settings2 className="w-2.5 h-2.5" />
                      <span>Personalizar</span>
                    </button>
                  </div>
                  {preFilledFields.category && (confidenceLevel === 'medium' || confidenceLevel === 'low') && (
                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold border border-amber-300 dark:border-amber-700">
                      <AlertCircle className="w-3 h-3" />
                      <span>Verifica sugerencia</span>
                    </span>
                  )}
                  {preFilledFields.category && confidenceLevel === 'high' && (
                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-300 dark:border-emerald-700">
                      <Check className="w-3 h-3" />
                      <span>Sugerida por IA</span>
                    </span>
                  )}
                </div>

                {/* Buscador de categorías si hay más de 6 */}
                {categories.filter((c) => c.is_active !== false).length > 6 && (
                  <div className="relative">
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      placeholder="Buscar categoría..."
                      className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                    {categorySearch && (
                      <button
                        type="button"
                        onClick={() => setCategorySearch('')}
                        className="absolute right-2 top-1.5 text-[10px] text-slate-400 hover:text-slate-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto no-scrollbar">
                  {categories
                    .filter((c) => c.is_active !== false)
                    .filter((c) =>
                      categorySearch.trim() === ''
                        ? true
                        : c.name.toLowerCase().includes(categorySearch.toLowerCase().trim())
                    )
                    .map((cat) => {
                      const isSelected = categoryId === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setCategoryId(cat.id);
                            if (preFilledFields.category) {
                              setPreFilledFields((prev) => ({ ...prev, category: false }));
                            }
                          }}
                          className={`p-2 rounded-xl border flex flex-col items-center justify-center space-y-1 transition-all text-center ${
                            isSelected
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-600 ring-1 ring-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                          }`}
                        >
                          <div
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                            style={{
                              backgroundColor: `${cat.color}20`,
                              color: cat.color,
                            }}
                          >
                            {cat.name.slice(0, 1).toUpperCase()}
                          </div>
                          <span className="text-[10px] font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                            {cat.name}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Cuenta de Origen y Fecha */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Cuenta (Opcional)
                    </label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Libre</span>
                  </div>
                  {accounts.length > 0 ? (
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Sin cuenta (Efectivo libre)</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.currency || currency} {Number(acc.current_balance).toFixed(0)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full px-2.5 py-2 text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span className="truncate">Sin cuenta (Libre)</span>
                      <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1 py-0.5 rounded font-bold ml-1">✓ OK</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    No necesitas saldo ni cuentas para registrar gastos.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Fecha
                    </label>
                    {preFilledFields.date && (confidenceLevel === 'medium' || confidenceLevel === 'low') && (
                      <span className="inline-flex items-center space-x-0.5 px-1 py-0.2 rounded text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border border-amber-300 dark:border-amber-700">
                        <AlertCircle className="w-2.5 h-2.5" />
                        <span>Verificar</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => {
                      setExpenseDate(e.target.value);
                      if (preFilledFields.date) {
                        setPreFilledFields((prev) => ({ ...prev, date: false }));
                      }
                    }}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border rounded-xl text-slate-800 dark:text-slate-200 transition-all ${
                      preFilledFields.date && (confidenceLevel === 'medium' || confidenceLevel === 'low')
                        ? 'border-amber-400 dark:border-amber-600 ring-1 ring-amber-400/30'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  />
                </div>
              </div>

              {/* Botón Siguiente */}
              <button
                type="button"
                onClick={handleNextToStep2}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition-colors flex items-center justify-center space-x-2 shadow-md shadow-indigo-600/20 mt-2"
              >
                <span>Continuar a Contexto y División</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* PANTALLA 2: CONTEXTO Y DIVISIÓN                                           */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              {/* Radio Buttons Grandes de Contexto */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ¿Con quién es este gasto?
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setLens('personal')}
                    className={`p-3 rounded-2xl border text-center transition-all ${
                      lens === 'personal'
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 ring-1 ring-indigo-600 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <User className="w-5 h-5 mx-auto mb-1 text-indigo-500" />
                    <span className="block text-xs font-bold">Personal</span>
                    <span className="text-[10px] opacity-75">Solo para mí</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLens('couple')}
                    className={`p-3 rounded-2xl border text-center transition-all ${
                      lens === 'couple'
                        ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-600 ring-1 ring-rose-600 text-rose-700 dark:text-rose-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Heart className="w-5 h-5 mx-auto mb-1 text-rose-500" />
                    <span className="block text-xs font-bold">Pareja</span>
                    <span className="text-[10px] opacity-75">Finanzas mutuas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLens('group')}
                    className={`p-3 rounded-2xl border text-center transition-all ${
                      lens === 'group'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 ring-1 ring-emerald-600 text-emerald-700 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Users className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
                    <span className="block text-xs font-bold">Un Grupo</span>
                    <span className="text-[10px] opacity-75">Viaje o amigos</span>
                  </button>
                </div>
              </div>

              {/* Selector de Grupo (si eligió grupo) */}
              {lens === 'group' && (
                <div className="space-y-1.5 p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Seleccionar Grupo
                  </label>
                  {userGroups.length === 0 ? (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                      <span>No se detectaron grupos activos vinculados.</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const d = await safeFetchJson<{ groups?: Group[] }>('/api/groups');
                          if (d?.groups) setUserGroups(d.groups);
                        }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 font-bold underline flex items-center space-x-1 hover:text-indigo-700"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Recargar</span>
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
                    >
                      {userGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.currency})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Indicador de moneda fija para coherencia de balances */}
              {isGroupContext && (
                <div className="flex items-center space-x-2 px-3.5 py-2.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl text-[11px] text-indigo-800 dark:text-indigo-300">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                  <span>
                    Moneda fija: <strong className="font-black text-indigo-900 dark:text-indigo-200">{currency}</strong> (este gasto se registrará en la moneda oficial del {lens === 'couple' ? 'espacio de pareja' : 'grupo'} para mantener balances exactos).
                  </span>
                </div>
              )}

              {/* Opciones de División (solo si no es personal) */}
              {lens !== 'personal' && (
                <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-950/80 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Modo de División
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      Total: {currency} {parseFloat(amount || '0').toFixed(2)}
                    </span>
                  </div>

                  {/* 4 Modos de división */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSplitMode('equal')}
                      className={`p-2 rounded-xl text-left text-xs font-semibold border transition-all ${
                        splitMode === 'equal'
                          ? 'bg-white dark:bg-slate-800 border-indigo-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'border-transparent text-slate-500 hover:bg-white/50'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <Divide className="w-3.5 h-3.5" />
                        <span>Partes iguales</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSplitMode('percentage');
                        autoBalancePercentages();
                      }}
                      className={`p-2 rounded-xl text-left text-xs font-semibold border transition-all ${
                        splitMode === 'percentage'
                          ? 'bg-white dark:bg-slate-800 border-indigo-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'border-transparent text-slate-500 hover:bg-white/50'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <Percent className="w-3.5 h-3.5" />
                        <span>Por porcentajes</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitMode('exact')}
                      className={`p-2 rounded-xl text-left text-xs font-semibold border transition-all ${
                        splitMode === 'exact'
                          ? 'bg-white dark:bg-slate-800 border-indigo-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'border-transparent text-slate-500 hover:bg-white/50'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Montos exactos</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSplitMode('full_payer')}
                      className={`p-2 rounded-xl text-left text-xs font-semibold border transition-all ${
                        splitMode === 'full_payer'
                          ? 'bg-white dark:bg-slate-800 border-indigo-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'border-transparent text-slate-500 hover:bg-white/50'
                      }`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Yo pago todo</span>
                      </div>
                    </button>
                  </div>

                  {/* Miembros y Participación */}
                  <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">
                        Participantes ({includedUserIds.size} seleccionados):
                      </span>
                      {splitMode === 'percentage' && (
                        <div className="flex items-center space-x-1.5">
                          {(() => {
                            const tot = Array.from(includedUserIds).reduce(
                              (acc, uid) => acc + (customPercentages[uid] ?? 0),
                              0
                            );
                            return (
                              <>
                                <span
                                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                    tot === 100
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 animate-pulse'
                                  }`}
                                >
                                  Total: {tot}%
                                </span>
                                {tot !== 100 && (
                                  <button
                                    type="button"
                                    onClick={autoBalancePercentages}
                                    className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                                  >
                                    Equilibrar
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {groupMembers.map((m) => {
                        const isIncluded = includedUserIds.has(m.user_id);
                        const isMe = m.user_id === profile?.id;
                        const numAmt = parseFloat(amount || '0');
                        const equalShare = isIncluded ? numAmt / (includedUserIds.size || 1) : 0;

                        return (
                          <div
                            key={m.user_id}
                            className={`p-2 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                              isIncluded
                                ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                : 'opacity-50 bg-slate-100 dark:bg-slate-950 border-dashed'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={() => toggleMemberInclusion(m.user_id)}
                                className={`w-4 h-4 rounded flex items-center justify-center border ${
                                  isIncluded
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'border-slate-400'
                                }`}
                              >
                                {isIncluded && <Check className="w-3 h-3" />}
                              </button>
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {m.full_name || 'Miembro'} {isMe && '(Tú)'}
                              </span>
                            </div>

                            {/* Mostrar valor según modo de split */}
                            {isIncluded && (
                              <div>
                                {splitMode === 'equal' && (
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {currency} {equalShare.toFixed(2)}
                                  </span>
                                )}

                                {splitMode === 'percentage' && (
                                  <div className="flex items-center space-x-1.5">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={customPercentages[m.user_id] ?? 0}
                                      onChange={(e) =>
                                        handlePercentageChange(m.user_id, Number(e.target.value))
                                      }
                                      className="w-12 px-1.5 py-0.5 text-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                                    />
                                    <span className="text-xs font-semibold text-slate-500">%</span>
                                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 ml-1">
                                      ({currency} {(((numAmt || 0) * (customPercentages[m.user_id] ?? 0)) / 100).toFixed(2)})
                                    </span>
                                  </div>
                                )}

                                {splitMode === 'exact' && (
                                  <div className="flex items-center space-x-1">
                                    <span className="text-slate-400">{currency}</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={customAmounts[m.user_id] ?? equalShare.toFixed(2)}
                                      onChange={(e) =>
                                        setCustomAmounts({
                                          ...customAmounts,
                                          [m.user_id]: Number(e.target.value),
                                        })
                                      }
                                      className="w-16 px-1.5 py-0.5 text-center bg-slate-50 dark:bg-slate-950 border rounded text-xs font-bold"
                                    />
                                  </div>
                                )}

                                {splitMode === 'full_payer' && (
                                  <span className="text-[11px] text-slate-400 font-medium">
                                    {isMe ? `${currency} ${numAmt.toFixed(2)} (100%)` : '$0.00'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Notas Opcionales */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notas adicionales (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles sobre el gasto, lugar, acuerdo..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white resize-none"
                />
              </div>

              {/* Botón Guardar en Transacción Atómica */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitExpense}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-colors flex items-center justify-center space-x-2 shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Guardando gasto...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Guardar Gasto ({currency} {parseFloat(amount || '0').toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Visor de Cámara en Vivo (MediaDevices) */}
      {isLiveCameraOpen && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 animate-fade-in">
          <div className="w-full max-w-md flex items-center justify-between text-white pt-2">
            <span className="text-xs font-bold flex items-center space-x-2">
              <Camera className="w-4 h-4 text-indigo-400" />
              <span>Apunta al ticket o recibo</span>
            </span>
            <button
              type="button"
              onClick={stopLiveCamera}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative w-full max-w-md aspect-[3/4] bg-slate-900 rounded-3xl overflow-hidden border-2 border-indigo-500/50 shadow-2xl flex items-center justify-center my-auto">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guías visuales del marco del ticket */}
            <div className="absolute inset-6 border-2 border-dashed border-white/60 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
              <div className="flex justify-between text-[10px] text-white/80 font-mono">
                <span>┌ ENCABEZADO</span>
                <span>COMERCIO ┐</span>
              </div>
              <div className="text-center text-[11px] font-semibold text-white/90 bg-black/50 backdrop-blur-xs py-1 px-3 rounded-full mx-auto">
                Alinea el ticket completo dentro del recuadro
              </div>
              <div className="flex justify-between text-[10px] text-white/80 font-mono">
                <span>└ TOTAL / FECHA</span>
                <span>CIERRE ┘</span>
              </div>
            </div>
          </div>

          <div className="w-full max-w-md flex items-center justify-between pb-6 px-4">
            <button
              type="button"
              onClick={stopLiveCamera}
              className="text-xs font-semibold text-slate-300 hover:text-white px-4 py-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={captureFromLiveVideo}
              className="w-16 h-16 rounded-full bg-white border-4 border-indigo-600 shadow-xl flex items-center justify-center active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white">
                <Camera className="w-6 h-6" />
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                stopLiveCamera();
                cameraInputRef.current?.click();
              }}
              className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 px-3 py-2 text-right"
            >
              Archivo
            </button>
          </div>
        </div>
      )}

      {/* Modal para Administrar y Personalizar Categorías directamente desde el registro */}
      <ManageCategoriesModal
        isOpen={isManageCatOpen}
        onClose={() => setIsManageCatOpen(false)}
        onCategoriesChanged={() => {
          fetchCategories();
        }}
      />
    </div>
  );
};
