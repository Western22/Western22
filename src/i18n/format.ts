/**
 * Fill {placeholders} in a message: format("Hi {name}", { name: "Ama" }).
 * Unknown placeholders are left as-is so a missing value is visible, not silent.
 */
export function format(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
