/** Builds a safe WhatsApp deep link from the centrally configured Travel Corner channel. */
export function buildWhatsAppUrl(phoneNumber: string | null | undefined, message: string) {
  const digits = phoneNumber?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  const internationalNumber = digits.startsWith("0") ? `2${digits}` : digits;
  return `https://wa.me/${internationalNumber}?text=${encodeURIComponent(message)}`;
}
