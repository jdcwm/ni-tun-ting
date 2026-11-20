export interface ParsedContent {
  thinking: string;
  content: string;
}

export function parseThinkingContent(fullText: string): ParsedContent {
  let thinking = '';
  let content = fullText;

  const thinkStart = fullText.indexOf('<think>');
  const thinkEnd = fullText.indexOf('</think>');

  if (thinkStart !== -1) {
    if (thinkEnd !== -1 && thinkEnd > thinkStart) {
      thinking = fullText.substring(thinkStart + 7, thinkEnd).trim();
      content = fullText.substring(thinkEnd + 8).trim();
    } else {
      thinking = fullText.substring(thinkStart + 7).trim();
      content = '';
    }
  }

  return { thinking, content };
}

export function isInThinkingState(fullText: string): boolean {
  const thinkStart = fullText.indexOf('<think>');
  const thinkEnd = fullText.indexOf('</think>');
  return thinkStart !== -1 && thinkEnd === -1;
}

export function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();
}
