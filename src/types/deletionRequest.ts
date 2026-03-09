/**
 * Tipi per le richieste di cancellazione proprietà
 */

export type DeletionRequestStatus = "pending" | "approved" | "rejected";

export interface DeletionRequest {
  id: string;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  reason: string;
  status: DeletionRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  // Campi compilati dall'admin
  reviewedBy?: string;
  reviewedAt?: Date;
  adminNote?: string;
}

export interface CreateDeletionRequestInput {
  propertyId: string;
  reason: string;
}

export interface ReviewDeletionRequestInput {
  status: "approved" | "rejected";
  adminNote?: string;
}

// Tipo per la risposta API con info espanse
export interface DeletionRequestWithDetails extends DeletionRequest {
  property?: {
    id: string;
    name: string;
    address?: string;
    status: string;
  };
  owner?: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
}
