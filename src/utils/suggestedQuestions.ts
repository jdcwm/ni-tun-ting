export interface SuggestedQuestion {
  text: string;
  raw: string;
}

export const extractSuggestedQuestions = (content: string): { cleanContent: string; questions: SuggestedQuestion[] } => {
  if (!content) return { cleanContent: content || '', questions: [] };

  const questions: SuggestedQuestion[] = [];
  let cleanContent = content;

  const regex = /<suggested_questions>([\s\S]*?)<\/suggested_questions>/gi;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

    for (const line of lines) {
      const m = line.match(/^(?:\d+[.、)）-]\s*|[A-Z][.、)）-]\s*|\-\s+|\*\s+)?(.+)$/);
      if (m && m[1] && m[1].trim().length > 0) {
        const text = m[1].trim();
        if (!questions.some((q) => q.text === text)) {
          questions.push({ text, raw: line });
        }
      }
    }

    cleanContent = cleanContent.replace(match[0], '');
  }

  cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanContent, questions };
};
