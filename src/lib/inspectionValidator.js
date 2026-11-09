// /src/lib/inspectionValidator.js
// Reusable inspection submission validation.
// Extracted from InspectionForm.jsx handleSubmit — used BOTH in the form
// (for inline error display) AND in App.jsx handleSubmitInspection (as a
// safety-net guard that blocks submission even if the form is bypassed).
//
// This closes loophole L6: "Validation is client-side only — if the submit
// handler is called directly (bypassing the form), no validation runs."

/**
 * Validate an inspection for submission.
 *
 * Checks:
 *   - Every section has a non-empty observation
 *   - Every section has at least 3 photos
 *   - Every item has a score (not null)
 *   - Items with score ≤ 3 have a non-empty comment + at least 1 photo
 *   - Client manager name is present
 *   - Both signatures (inspector + client) are present
 *
 * @param {object} inspection - must have: items, sections, photosByItem,
 *                               client_mgr_name, inspector_sig, client_sig
 * @returns {{ valid: boolean, errors: Array, summary: string|null }}
 */
export function validateInspectionSubmission(inspection) {
  if (!inspection) {
    return { valid: false, errors: [], summary: "Inspeção inválida (nula)." };
  }

  const errors = [];
  const items = inspection.items || [];
  const sections = inspection.sections || [];
  const photosByItem = inspection.photosByItem || {};

  // If there are no sections/items, the inspection can't be valid
  if (sections.length === 0) {
    return {
      valid: false,
      errors: [{ section: "Estrutura", id: "structure", errors: ["Inspeção sem secções."] }],
      summary: "Inspeção sem secções.",
    };
  }

  sections.forEach((section) => {
    const sItems = items.filter((i) => i.section_id === section.id);
    const secData = sections.find((s) => s.id === section.id) || { observation: "" };
    const secErrors = [];

    // Section observation mandatory
    if (!secData.observation || !String(secData.observation).trim()) {
      secErrors.push("Observação da categoria em falta (obrigatório).");
    }

    // At least 3 photos per section
    const catPhotos = photosByItem[section.id] || [];
    if (catPhotos.length < 3) {
      secErrors.push(`A categoria exige pelo menos 3 fotos (tem ${catPhotos.length}).`);
    }

    // Each item must be scored
    sItems.forEach((item) => {
      if (item.score === null || item.score === undefined) {
        secErrors.push(`Item por responder: "${item.label || item.text}".`);
      } else if (item.score <= 3) {
        // Items with score ≤ 3 need a comment + at least 1 photo
        if (!item.comment || !String(item.comment).trim()) {
          secErrors.push(`Nota em falta para: "${item.label || item.text}" (Score ${item.score}).`);
        }
        const itemPhotos = photosByItem[item.id] || [];
        if (itemPhotos.length < 1) {
          secErrors.push(`1 foto obrigatória para: "${item.label || item.text}" (Score ${item.score}).`);
        }
      }
    });

    if (secErrors.length > 0) {
      errors.push({
        section: section.title || section.name || "Secção",
        id: section.id,
        errors: secErrors,
      });
    }
  });

  // Signatures
  if (!inspection.client_mgr_name || !String(inspection.client_mgr_name).trim()) {
    errors.push({ section: "Assinaturas", id: "sig", errors: ["Nome do Supervisor do Cliente em falta."] });
  }
  if (!inspection.inspector_sig || !inspection.client_sig) {
    errors.push({ section: "Assinaturas", id: "sig", errors: ["Assinaturas não confirmadas."] });
  }

  const totalErrors = errors.reduce((n, s) => n + s.errors.length, 0);
  return {
    valid: errors.length === 0,
    errors,
    summary:
      errors.length === 0
        ? null
        : `${errors.length} secção(ões) com problemas, ${totalErrors} erro(s) total.`,
  };
}

/**
 * Format validation errors as a flat string for toast / alert display.
 * @param {Array} errors - the errors array from validateInspectionSubmission
 * @returns {string}
 */
export function formatValidationErrors(errors) {
  if (!errors || errors.length === 0) return "";
  return errors
    .map((s) => `[${s.section}] ${s.errors.join("; ")}`)
    .join("\n");
}
