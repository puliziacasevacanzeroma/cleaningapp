"use client";
/**
 * WRAPPER per PROPRIETARIO - Importa PropertyCreationModal con mode="owner"
 * SENZA step prezzo - il prezzo lo inserisce l'admin quando approva
 */
import { useAuth } from "~/lib/firebase/AuthContext";
import PropertyCreationModal from "~/components/shared/PropertyCreationModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreaProprietaOwnerModal({ isOpen, onClose, onSuccess }: Props) {
  const { user } = useAuth();
  
  return (
    <PropertyCreationModal
      isOpen={isOpen}
      onClose={onClose}
      onSuccess={onSuccess}
      mode="owner"
      currentUser={user ? { id: user.uid, name: user.displayName, email: user.email } : undefined}
    />
  );
}
