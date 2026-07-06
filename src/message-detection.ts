export function mentionsDevAssist(text: string): boolean {
  return text.toLowerCase().includes("@dev-assist");
}

export function isPublishCommand(text: string): boolean {
  return text.toLowerCase().includes("@dev-assist publish");
}
