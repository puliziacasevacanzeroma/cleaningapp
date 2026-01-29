"use client";
/**
 * WRAPPER per ADMIN - Importa PropertyCreationModal con mode="admin"
 */
import PropertyCreationModal from "~/components/shared/PropertyCreationModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  proprietari: { id: string; name: string | null; email: string | null }[];
}

export function CreaProprietaModal({ isOpen, onClose, proprietari }: Props) {
  return (
    <PropertyCreationModal
      isOpen={isOpen}
      onClose={onClose}
      mode="admin"
      proprietari={proprietari}
    />
  );
}
