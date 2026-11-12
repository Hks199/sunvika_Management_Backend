/** Shared Total calling formula used by calling sheets and reports. */
export function callingTotal(deleted: number | null, converted: number, interested: number, followUp: number): number | null {
  return deleted === null ? null : deleted + converted + interested + followUp;
}
