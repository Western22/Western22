import type { Messages, ErrorKey } from "@/i18n/messages/en";

/** Renders a translated error under a field or at the top of a form. */
export function FormError({ errorKey, errors }: { errorKey?: ErrorKey; errors: Messages["errors"] }) {
  if (!errorKey) return null;
  return (
    <p role="alert" className="text-destructive text-sm">
      {errors[errorKey]}
    </p>
  );
}
