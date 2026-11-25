export function purchaseConfirmReady(input: {
  termsAccepted: boolean;
  jurisdictionConfirmed: boolean;
}): boolean {
  return input.termsAccepted && input.jurisdictionConfirmed;
}
