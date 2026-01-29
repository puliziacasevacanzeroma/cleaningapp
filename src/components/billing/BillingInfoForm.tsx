/**
 * Form Dati di Fatturazione
 * 
 * Componente riutilizzabile per raccogliere i dati di fatturazione.
 * Supporta sia Persona Fisica che Azienda con validazioni real-time.
 * 
 * Uso:
 * - In fase di registrazione proprietario
 * - Nella pagina impostazioni profilo
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BillingFormData,
  BillingValidationErrors,
  BillingType,
  createEmptyBillingFormData,
  validateBillingForm,
  formatFiscalCode,
  formatVatNumber,
  formatSdiCode,
  formatPostalCode,
  formatProvince,
  PROVINCE_ITALIANE,
} from "~/types/billing";

// ==================== PROPS ====================

interface BillingInfoFormProps {
  /** Dati iniziali (per editing) */
  initialData?: Partial<BillingFormData>;
  /** Callback quando i dati cambiano */
  onChange?: (data: BillingFormData, isValid: boolean) => void;
  /** Callback quando il form è submitatto */
  onSubmit?: (data: BillingFormData) => void;
  /** Mostra il pulsante di submit */
  showSubmitButton?: boolean;
  /** Testo del pulsante submit */
  submitButtonText?: string;
  /** Form disabilitato */
  disabled?: boolean;
  /** Mostra errori solo dopo il primo submit */
  showErrorsOnSubmitOnly?: boolean;
  /** Compatto (meno padding) */
  compact?: boolean;
}

// ==================== COMPONENTE ====================

export function BillingInfoForm({
  initialData,
  onChange,
  onSubmit,
  showSubmitButton = false,
  submitButtonText = "Salva",
  disabled = false,
  showErrorsOnSubmitOnly = false,
  compact = false,
}: BillingInfoFormProps) {
  // State
  const [formData, setFormData] = useState<BillingFormData>(() => ({
    ...createEmptyBillingFormData(),
    ...initialData,
  }));
  const [errors, setErrors] = useState<BillingValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Valida e notifica i cambiamenti
  useEffect(() => {
    const validationErrors = validateBillingForm(formData);
    setErrors(validationErrors);
    
    const isValid = Object.keys(validationErrors).length === 0;
    onChange?.(formData, isValid);
  }, [formData, onChange]);

  // Gestisce il cambio di tipo (Persona Fisica / Azienda)
  const handleTypeChange = (type: BillingType) => {
    setFormData(prev => ({ ...prev, type }));
    // Reset touched per i campi specifici del tipo
    setTouched({});
  };

  // Gestisce il cambio di un campo
  const handleChange = useCallback((field: keyof BillingFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Gestisce il blur (campo toccato)
  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // Mostra errore per un campo
  const shouldShowError = (field: keyof BillingValidationErrors): boolean => {
    if (showErrorsOnSubmitOnly) {
      return hasSubmitted && !!errors[field];
    }
    return touched[field] && !!errors[field];
  };

  // Handle submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    
    const validationErrors = validateBillingForm(formData);
    if (Object.keys(validationErrors).length === 0) {
      onSubmit?.(formData);
    }
  };

  // Classi CSS
  const inputClasses = (field: keyof BillingValidationErrors) => `
    w-full px-4 py-3 border rounded-xl transition-colors
    focus:ring-2 focus:ring-sky-500 focus:border-sky-500
    ${shouldShowError(field) ? 'border-red-500 bg-red-50' : 'border-gray-300'}
    ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
  `;

  const labelClasses = "block text-sm font-medium text-gray-700 mb-1";
  const errorClasses = "text-red-500 text-sm mt-1";
  const sectionClasses = compact ? "mb-4" : "mb-6";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* ==================== TIPO FATTURAZIONE ==================== */}
      <div className={sectionClasses}>
        <label className={labelClasses}>Tipo di fatturazione *</label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            type="button"
            onClick={() => !disabled && handleTypeChange("persona_fisica")}
            disabled={disabled}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              formData.type === "persona_fisica"
                ? "border-sky-500 bg-sky-50"
                : "border-gray-200 hover:border-gray-300"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                formData.type === "persona_fisica" ? "border-sky-500" : "border-gray-300"
              }`}>
                {formData.type === "persona_fisica" && (
                  <div className="w-3 h-3 rounded-full bg-sky-500" />
                )}
              </div>
              <div>
                <span className="font-medium text-gray-900">Persona Fisica</span>
                <p className="text-xs text-gray-500">Privato con Codice Fiscale</p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => !disabled && handleTypeChange("azienda")}
            disabled={disabled}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              formData.type === "azienda"
                ? "border-sky-500 bg-sky-50"
                : "border-gray-200 hover:border-gray-300"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                formData.type === "azienda" ? "border-sky-500" : "border-gray-300"
              }`}>
                {formData.type === "azienda" && (
                  <div className="w-3 h-3 rounded-full bg-sky-500" />
                )}
              </div>
              <div>
                <span className="font-medium text-gray-900">Azienda</span>
                <p className="text-xs text-gray-500">Con Partita IVA e SDI</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ==================== PERSONA FISICA ==================== */}
      {formData.type === "persona_fisica" && (
        <div className={`bg-gray-50 rounded-xl p-4 ${sectionClasses}`}>
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Dati Persona Fisica
          </h3>
          
          <div>
            <label className={labelClasses}>Codice Fiscale *</label>
            <input
              type="text"
              value={formData.fiscalCode}
              onChange={(e) => handleChange("fiscalCode", formatFiscalCode(e.target.value))}
              onBlur={() => handleBlur("fiscalCode")}
              placeholder="RSSMRA80A01H501U"
              maxLength={16}
              disabled={disabled}
              className={inputClasses("fiscalCode") + " uppercase"}
            />
            {formData.fiscalCode && formData.fiscalCode.length < 16 && (
              <p className="text-gray-400 text-sm mt-1">{formData.fiscalCode.length}/16 caratteri</p>
            )}
            {shouldShowError("fiscalCode") && (
              <p className={errorClasses}>{errors.fiscalCode}</p>
            )}
          </div>
        </div>
      )}

      {/* ==================== AZIENDA ==================== */}
      {formData.type === "azienda" && (
        <div className={`bg-gray-50 rounded-xl p-4 ${sectionClasses}`}>
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Dati Azienda
          </h3>
          
          <div className="space-y-4">
            {/* Ragione Sociale */}
            <div>
              <label className={labelClasses}>Ragione Sociale *</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) => handleChange("companyName", e.target.value)}
                onBlur={() => handleBlur("companyName")}
                placeholder="Nome Azienda S.r.l."
                disabled={disabled}
                className={inputClasses("companyName")}
              />
              {shouldShowError("companyName") && (
                <p className={errorClasses}>{errors.companyName}</p>
              )}
            </div>

            {/* Partita IVA e SDI */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClasses}>Partita IVA *</label>
                <input
                  type="text"
                  value={formData.vatNumber}
                  onChange={(e) => handleChange("vatNumber", formatVatNumber(e.target.value))}
                  onBlur={() => handleBlur("vatNumber")}
                  placeholder="12345678901"
                  maxLength={11}
                  disabled={disabled}
                  className={inputClasses("vatNumber")}
                />
                {formData.vatNumber && formData.vatNumber.length < 11 && (
                  <p className="text-gray-400 text-sm mt-1">{formData.vatNumber.length}/11 cifre</p>
                )}
                {shouldShowError("vatNumber") && (
                  <p className={errorClasses}>{errors.vatNumber}</p>
                )}
              </div>

              <div>
                <label className={labelClasses}>Codice SDI *</label>
                <input
                  type="text"
                  value={formData.sdiCode}
                  onChange={(e) => handleChange("sdiCode", formatSdiCode(e.target.value))}
                  onBlur={() => handleBlur("sdiCode")}
                  placeholder="A1B2C3D"
                  maxLength={7}
                  disabled={disabled}
                  className={inputClasses("sdiCode") + " uppercase"}
                />
                {formData.sdiCode && formData.sdiCode.length < 7 && (
                  <p className="text-gray-400 text-sm mt-1">{formData.sdiCode.length}/7 caratteri</p>
                )}
                {shouldShowError("sdiCode") && (
                  <p className={errorClasses}>{errors.sdiCode}</p>
                )}
              </div>
            </div>

            {/* Email PEC */}
            <div>
              <label className={labelClasses}>Email PEC *</label>
              <input
                type="email"
                value={formData.pecEmail}
                onChange={(e) => handleChange("pecEmail", e.target.value)}
                onBlur={() => handleBlur("pecEmail")}
                placeholder="azienda@pec.it"
                disabled={disabled}
                className={inputClasses("pecEmail")}
              />
              {shouldShowError("pecEmail") && (
                <p className={errorClasses}>{errors.pecEmail}</p>
              )}
            </div>

            {/* Codice Fiscale Azienda (opzionale) */}
            <div>
              <label className={labelClasses}>
                Codice Fiscale Azienda 
                <span className="text-gray-400 font-normal ml-1">(opzionale)</span>
              </label>
              <input
                type="text"
                value={formData.companyFiscalCode}
                onChange={(e) => handleChange("companyFiscalCode", formatFiscalCode(e.target.value))}
                onBlur={() => handleBlur("companyFiscalCode")}
                placeholder="Se diverso dalla P.IVA"
                maxLength={16}
                disabled={disabled}
                className={inputClasses("companyFiscalCode") + " uppercase"}
              />
              {shouldShowError("companyFiscalCode") && (
                <p className={errorClasses}>{errors.companyFiscalCode}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== INDIRIZZO FATTURAZIONE ==================== */}
      <div className={`bg-gray-50 rounded-xl p-4 ${sectionClasses}`}>
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Indirizzo di Fatturazione
        </h3>

        <div className="space-y-4">
          {/* Via */}
          <div>
            <label className={labelClasses}>Indirizzo (via e numero civico) *</label>
            <input
              type="text"
              value={formData.street}
              onChange={(e) => handleChange("street", e.target.value)}
              onBlur={() => handleBlur("street")}
              placeholder="Via Roma 123"
              disabled={disabled}
              className={inputClasses("street")}
            />
            {shouldShowError("street") && (
              <p className={errorClasses}>{errors.street}</p>
            )}
          </div>

          {/* Città e CAP */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClasses}>Città *</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleChange("city", e.target.value)}
                onBlur={() => handleBlur("city")}
                placeholder="Milano"
                disabled={disabled}
                className={inputClasses("city")}
              />
              {shouldShowError("city") && (
                <p className={errorClasses}>{errors.city}</p>
              )}
            </div>

            <div>
              <label className={labelClasses}>CAP *</label>
              <input
                type="text"
                value={formData.postalCode}
                onChange={(e) => handleChange("postalCode", formatPostalCode(e.target.value))}
                onBlur={() => handleBlur("postalCode")}
                placeholder="20100"
                maxLength={5}
                disabled={disabled}
                className={inputClasses("postalCode")}
              />
              {shouldShowError("postalCode") && (
                <p className={errorClasses}>{errors.postalCode}</p>
              )}
            </div>
          </div>

          {/* Provincia e Paese */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClasses}>Provincia *</label>
              <select
                value={formData.province}
                onChange={(e) => handleChange("province", e.target.value)}
                onBlur={() => handleBlur("province")}
                disabled={disabled}
                className={inputClasses("province")}
              >
                <option value="">Seleziona provincia...</option>
                {PROVINCE_ITALIANE.map((prov) => (
                  <option key={prov.code} value={prov.code}>
                    {prov.code} - {prov.name}
                  </option>
                ))}
              </select>
              {shouldShowError("province") && (
                <p className={errorClasses}>{errors.province}</p>
              )}
            </div>

            <div>
              <label className={labelClasses}>Paese *</label>
              <input
                type="text"
                value={formData.country}
                onChange={(e) => handleChange("country", e.target.value)}
                onBlur={() => handleBlur("country")}
                placeholder="Italia"
                disabled={disabled}
                className={inputClasses("country")}
              />
              {shouldShowError("country") && (
                <p className={errorClasses}>{errors.country}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== SUBMIT BUTTON ==================== */}
      {showSubmitButton && (
        <button
          type="submit"
          disabled={disabled}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
            disabled
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg hover:shadow-xl"
          }`}
        >
          {submitButtonText}
        </button>
      )}
    </form>
  );
}

export default BillingInfoForm;
