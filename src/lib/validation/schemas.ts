/**
 * ============================================================
 * API VALIDATION SCHEMAS — Zod schemas per tutte le API route
 * ============================================================
 *
 * PROBLEMA RISOLTO:
 * Zero validazione degli input nelle API. I dati dal body della
 * richiesta venivano usati direttamente senza sanitizzazione,
 * esponendo a crash, injection e comportamenti imprevedibili.
 *
 * UTILIZZO:
 *   const result = SchemaName.safeParse(await req.json());
 *   if (!result.success) {
 *     return NextResponse.json(
 *       { error: "Input non valido", details: result.error.flatten() },
 *       { status: 400 }
 *     );
 *   }
 *   const data = result.data; // typed & sanitized
 * ============================================================
 */

import { z } from "zod";
import { NextResponse } from "next/server";

// ─── Helpers riutilizzabili ───────────────────────────────────────────────────

const nonEmptyString = z.string().trim().min(1, "Campo obbligatorio");
const email = z.string().trim().toLowerCase().email("Email non valida");
const isoDateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?)?$/,
  "Data non valida (formato ISO 8601 atteso)"
);
const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Orario non valido (formato HH:MM)");
const positiveNumber = z.number().nonnegative("Il valore deve essere >= 0");
const firestoreId = z.string().trim().min(1).max(128);

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  name: nonEmptyString.max(100, "Nome troppo lungo"),
  email,
  phone: z
    .string()
    .trim()
    .regex(/^[+\d\s\-().]{6,20}$/, "Numero di telefono non valido"),
  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri")
    .max(128, "Password troppo lunga"),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email,
  password: nonEmptyString,
});
export type LoginInput = z.infer<typeof LoginSchema>;

// ─── PROPRIETÀ ────────────────────────────────────────────────────────────────

export const PropertyCreateSchema = z.object({
  name: nonEmptyString.max(200, "Nome proprietà troppo lungo"),
  address: nonEmptyString.max(500, "Indirizzo troppo lungo"),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(10).optional(),
  postalCode: z.string().trim().max(10).optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(20).optional(),
  maxGuests: z.number().int().min(1).max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
  icalUrl: z.string().url("URL iCal non valido").optional().or(z.literal("")),
});
export type PropertyCreateInput = z.infer<typeof PropertyCreateSchema>;

export const PropertyUpdateSchema = PropertyCreateSchema.partial();
export type PropertyUpdateInput = z.infer<typeof PropertyUpdateSchema>;

// ─── PULIZIE ─────────────────────────────────────────────────────────────────

export const CleaningCreateSchema = z.object({
  propertyId: firestoreId,
  scheduledDate: isoDateString,
  scheduledTime: timeString.default("10:00"),
  guestsCount: z.number().int().min(0).max(100).default(2),
  notes: z.string().trim().max(2000).optional().default(""),
  operatorId: firestoreId.optional(),
  operatorName: z.string().trim().max(100).optional(),
  operators: z
    .array(
      z.object({
        id: firestoreId,
        name: z.string().trim().max(100),
      })
    )
    .max(10)
    .optional()
    .default([]),
  bookingSource: z.string().trim().max(100).optional(),
  bookingId: z.string().trim().max(200).optional(),
  type: z.enum(["CLEANING", "LINEN", "CHECKIN", "CHECKOUT", "MAINTENANCE"]).default("CLEANING"),
});
export type CleaningCreateInput = z.infer<typeof CleaningCreateSchema>;

export const CleaningUpdateSchema = z.object({
  scheduledDate: isoDateString.optional(),
  scheduledTime: timeString.optional(),
  guestsCount: z.number().int().min(0).max(100).optional(),
  status: z
    .enum(["pending", "PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .optional(),
  notes: z.string().trim().max(2000).optional(),
  operatorId: firestoreId.optional().nullable(),
  operatorName: z.string().trim().max(100).optional().nullable(),
  operators: z
    .array(z.object({ id: firestoreId, name: z.string().trim().max(100) }))
    .max(10)
    .optional(),
  linenConfigModified: z.boolean().optional(),
  removeCustomLinenConfig: z.boolean().optional(),
});
export type CleaningUpdateInput = z.infer<typeof CleaningUpdateSchema>;

// ─── COMPLETAMENTO PULIZIA ────────────────────────────────────────────────────

const RatingScoresSchema = z.object({
  cleanliness: z.number().int().min(1).max(5),
  checkoutPunctuality: z.number().int().min(1).max(5),
  generalCondition: z.number().int().min(1).max(5),
  damages: z.number().int().min(1).max(5),
});

const PropertyRatingSchema = z.object({
  scores: RatingScoresSchema,
  operatorNotes: z.string().trim().max(2000).optional(),
  publicNotes: z.string().trim().max(2000).optional(),
  damagePhotoIds: z.array(z.string().max(500)).max(50).optional().default([]),
});

const IssueInputSchema = z.object({
  category: nonEmptyString.max(100),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: nonEmptyString.max(200),
  description: z.string().trim().max(2000).default(""),
  location: z.string().trim().max(200).optional(),
  photoIds: z.array(z.string().max(500)).max(50).optional().default([]),
  estimatedCost: positiveNumber.optional(),
});

const ExtraChargeSchema = z.object({
  type: nonEmptyString.max(100),
  description: nonEmptyString.max(500),
  amount: z.number().positive("L'importo deve essere positivo").max(100_000),
  chargeToOwner: z.boolean().optional().default(false),
  chargeToGuest: z.boolean().optional().default(false),
  issueId: firestoreId.optional(),
});

export const CompleteCleaningSchema = z.object({
  operatorNotes: z.string().trim().max(2000).optional(),
  rating: PropertyRatingSchema.optional(),
  issues: z.array(IssueInputSchema).max(50).optional().default([]),
  extraCharges: z.array(ExtraChargeSchema).max(50).optional().default([]),
  photoIds: z.array(z.string().max(500)).max(200).optional().default([]),
  photosCount: z.number().int().min(0).max(500).optional(),
  // notifyOnly mode (non altera stato pulizia)
  notifyOnly: z.boolean().optional(),
  emailOnly: z.boolean().optional(),
  operatorName: z.string().trim().max(100).optional(),
  hasProductRequest: z.boolean().optional(),
  productCount: z.number().int().min(0).optional(),
});
export type CompleteCleaningInput = z.infer<typeof CompleteCleaningSchema>;

// ─── INVENTARIO ───────────────────────────────────────────────────────────────

export const InventoryItemSchema = z.object({
  name: nonEmptyString.max(200),
  category: nonEmptyString.max(100),
  unit: z.string().trim().max(50).optional().default("pz"),
  quantity: z.number().int().min(0).max(1_000_000),
  minQuantity: z.number().int().min(0).max(1_000_000).optional().default(0),
  sellPrice: positiveNumber.optional().default(0),
  notes: z.string().trim().max(1000).optional(),
});
export type InventoryItemInput = z.infer<typeof InventoryItemSchema>;

export const UpdateQuantitySchema = z.object({
  itemId: firestoreId,
  quantity: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().max(500).optional(),
});
export type UpdateQuantityInput = z.infer<typeof UpdateQuantitySchema>;

// ─── ORDINI BIANCHERIA ────────────────────────────────────────────────────────

export const OrderItemSchema = z.object({
  id: firestoreId,
  name: z.string().trim().max(200),
  quantity: z.number().int().min(1).max(10_000),
});

export const CreateOrderSchema = z.object({
  propertyId: firestoreId,
  cleaningId: firestoreId.optional(),
  scheduledDate: isoDateString,
  items: z.array(OrderItemSchema).min(1, "Almeno un articolo richiesto").max(200),
  notes: z.string().trim().max(2000).optional(),
  riderId: firestoreId.optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "IN_DELIVERY", "DELIVERED", "CANCELLED"]),
  riderId: firestoreId.optional().nullable(),
  notes: z.string().trim().max(1000).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

// ─── PAGAMENTI ────────────────────────────────────────────────────────────────

export const CreatePaymentSchema = z.object({
  ownerId: firestoreId,
  amount: z.number().positive("L'importo deve essere positivo").max(1_000_000),
  method: z.enum(["BANK_TRANSFER", "CASH", "CARD", "OTHER"]),
  notes: z.string().trim().max(1000).optional(),
  referenceMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Formato mese non valido (YYYY-MM)")
    .optional(),
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

// ─── UTENTI (admin) ───────────────────────────────────────────────────────────

export const UpdateUserSchema = z.object({
  name: nonEmptyString.max(100).optional(),
  email: email.optional(),
  phone: z.string().trim().max(20).optional(),
  role: z
    .enum(["ADMIN", "PROPRIETARIO", "OPERATORE_PULIZIE", "RIDER"])
    .optional(),
  status: z.enum(["ACTIVE", "PENDING", "PENDING_CONTRACT", "SUSPENDED"]).optional(),
  password: z.string().min(8).max(128).optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

// ─── SERVICE TYPES ────────────────────────────────────────────────────────────

export const ServiceTypeSchema = z.object({
  name: nonEmptyString.max(200),
  description: z.string().trim().max(1000).optional(),
  basePrice: positiveNumber,
  holidayMultiplier: z.number().min(1).max(5).optional().default(1),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colore esadecimale non valido")
    .optional(),
  active: z.boolean().optional().default(true),
});
export type ServiceTypeInput = z.infer<typeof ServiceTypeSchema>;


// ─── SCHEMA GENERICI PER ROUTE RIMANENTI ──────────────────────────────────────

export const IdOnlySchema = z.object({
  id: firestoreId.optional(),
  itemId: firestoreId.optional(),
  orderId: firestoreId.optional(),
}).passthrough();

export const GenericBodySchema = z.object({}).passthrough();

export const SessionCreateSchema = z.object({
  id: nonEmptyString,
  email: email,
  role: nonEmptyString,
}).passthrough();

export const ApprovalEmailSchema = z.object({
  type: nonEmptyString,
  userEmail: email,
  userName: nonEmptyString,
}).passthrough();

export const DeletionRequestSchema = z.object({
  propertyId: firestoreId,
  reason: nonEmptyString.min(3).max(2000),
});

export const DeletionActionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminNote: z.string().trim().max(2000).optional(),
});

export const NotificationActionSchema = z.object({
  action: nonEmptyString,
  adminId: firestoreId.optional(),
  note: z.string().trim().max(2000).optional(),
}).passthrough();

export const PushSendSchema = z.object({
  title: nonEmptyString.max(200),
  body: nonEmptyString.max(1000),
  recipientId: firestoreId.optional().nullable(),
  recipientRole: z.string().max(50).optional(),
  data: z.record(z.any()).optional(),
});

export const GhostCleaningActionSchema = z.object({
  action: z.enum(["complete", "cancel", "complete_all", "cancel_all"]),
  cleaningIds: z.array(firestoreId).optional(),
}).passthrough();

export const OrderUrgencySchema = z.object({
  urgency: z.enum(["normal", "urgent"]),
  userRole: z.string().max(50).optional(),
}).passthrough();

export const OrderPriceSchema = z.object({
  newPrice: z.number().optional(),
  reason: z.string().trim().max(500).optional(),
  reset: z.boolean().optional(),
}).passthrough();

export const OrderItemsUpdateSchema = z.object({
  items: z.array(z.any()).min(1),
  forceUpdate: z.boolean().optional(),
}).passthrough();

export const BookingGuestsSchema = z.object({
  adults: z.number().int().min(0).max(100).optional(),
  children: z.number().int().min(0).max(100).optional(),
  infants: z.number().int().min(0).max(100).optional(),
  guestsCount: z.number().int().min(0).max(100).optional(),
}).passthrough();

export const UserCreateSchema = z.object({
  name: nonEmptyString.max(100),
  surname: z.string().trim().max(100).optional(),
  email: email,
  phone: z.string().trim().max(30).optional(),
  role: z.enum(["ADMIN", "PROPRIETARIO", "OPERATORE_PULIZIE", "RIDER"]),
  password: z.string().min(8).max(128),
}).passthrough();

export const UserUpdateSchema = z.object({
  name: z.string().trim().max(100).optional(),
  surname: z.string().trim().max(100).optional(),
  email: email.optional(),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(["ADMIN", "PROPRIETARIO", "OPERATORE_PULIZIE", "RIDER"]).optional(),
  status: z.enum(["ACTIVE", "PENDING", "PENDING_CONTRACT", "SUSPENDED"]).optional(),
  password: z.string().min(8).max(128).optional(),
  action: z.string().optional(),
}).passthrough();

export const ContractAcceptSchema = z.object({
  fullName: nonEmptyString.min(3).max(200),
  fiscalCode: nonEmptyString.max(20),
  signatureImage: nonEmptyString,
  consents: z.record(z.boolean()).optional(),
  geolocation: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).optional(),
}).passthrough();

// ─── HELPER per gestione errori di validazione ────────────────────────────────

// ─── ASSEGNAZIONE ─────────────────────────────────────────────────────────────

export const AssignOperatorSchema = z.object({
  operatorId: firestoreId,
});
export type AssignOperatorInput = z.infer<typeof AssignOperatorSchema>;

export const AssignRiderSchema = z.object({
  riderId: firestoreId,
  riderName: z.string().trim().max(100).optional(),
});
export type AssignRiderInput = z.infer<typeof AssignRiderSchema>;

// ─── SPOSTAMENTO / CANCELLAZIONE PULIZIA ──────────────────────────────────────

export const MoveCleaningSchema = z.object({
  newDate: isoDateString,
  newTime: timeString.optional(),
  reason: z.string().trim().max(1000).optional(),
});
export type MoveCleaningInput = z.infer<typeof MoveCleaningSchema>;

export const CancelCleaningSchema = z.object({
  reason: nonEmptyString.min(3, "Il motivo deve avere almeno 3 caratteri").max(1000),
});
export type CancelCleaningInput = z.infer<typeof CancelCleaningSchema>;

// ─── CONSEGNA ORDINI ──────────────────────────────────────────────────────────

export const DeliverOrderSchema = z.object({
  withPickup: z.boolean().optional().default(false),
  pickupStatus: z.array(z.any()).optional().default([]),
  pickupNote: z.string().trim().max(1000).optional().default(""),
  pickupFromOrders: z.array(z.string()).optional().default([]),
  deliveryNote: z.string().trim().max(1000).optional().default(""),
  actualItems: z.array(z.any()).optional(),
}).passthrough();
export type DeliverOrderInput = z.infer<typeof DeliverOrderSchema>;

// ─── PAGAMENTI (con action discriminator) ─────────────────────────────────────

export const PaymentActionSchema = z.object({
  action: z.string().optional(),
  proprietarioId: firestoreId.optional(),
  proprietarioName: z.string().trim().max(200).optional(),
  month: z.string().optional(),
  year: z.string().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  type: z.string().max(100).optional(),
  method: z.string().max(100).optional(),
  note: z.string().trim().max(2000).optional(),
  totalDue: z.union([z.string(), z.number()]).optional(),
  totalPaid: z.union([z.string(), z.number()]).optional(),
  paymentId: firestoreId.optional(),
}).passthrough();
export type PaymentActionInput = z.infer<typeof PaymentActionSchema>;

// ─── PRENOTAZIONI ─────────────────────────────────────────────────────────────

export const BookingCreateSchema = z.object({
  propertyId: firestoreId,
  checkIn: isoDateString,
  checkOut: isoDateString,
  guests: z.number().int().min(1).max(100).optional(),
  guestName: z.string().trim().max(200).optional(),
  guestEmail: z.string().trim().max(200).optional(),
  guestPhone: z.string().trim().max(50).optional(),
  source: z.string().trim().max(100).optional().default("manual"),
  notes: z.string().trim().max(2000).optional(),
}).passthrough();
export type BookingCreateInput = z.infer<typeof BookingCreateSchema>;

// ─── APPROVAZIONE PROPRIETÀ ───────────────────────────────────────────────────

export const ApprovePropertySchema = z.object({
  status: z.string().max(50).optional(),
});
export type ApprovePropertyInput = z.infer<typeof ApprovePropertySchema>;


// ─── HELPER per gestione errori di validazione ────────────────────────────────

/**
 * Valida il body della request con lo schema fornito.
 * Ritorna i dati tipizzati oppure una NextResponse di errore 400.
 *
 * @example
 * const validated = await validateBody(req, CleaningCreateSchema);
 * if (validated instanceof Response) return validated;
 * // validated è ora CleaningCreateInput tipizzato
 */
export async function validateBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T
): Promise<z.infer<T> | Response> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body della richiesta non valido (JSON malformato)" }, { status: 400 });
  }

  const result = schema.safeParse(rawBody);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Dati non validi",
        details: result.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  return result.data;
}
