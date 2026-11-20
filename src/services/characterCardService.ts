import { Character, TavernAIV2Card, TavernAIV2CardData, CardImportFormat } from '../types';
import { generateId } from '../constants/defaults';

const TAVERN_V2_SPEC = 'chara_card_v2';
const TAVERN_V3_SPEC = 'chara_card_v3';
const TAVERN_V2_SPEC_VERSION = '2.0';

export const characterCardService = {
  detectFormat(jsonData: any): CardImportFormat {
    if (!jsonData) return 'json';
    
    if (jsonData.spec === TAVERN_V2_SPEC && jsonData.data) {
      return 'tavern_v2';
    }
    
    if (jsonData.spec === TAVERN_V3_SPEC && jsonData.data) {
      return 'tavern_v2';
    }
    
    if (jsonData.name && jsonData.description && (jsonData.first_mes || jsonData.greeting)) {
      return 'tavern_v1';
    }
    
    if (jsonData.data && jsonData.data.name) {
      return 'sillytavern';
    }
    
    return 'json';
  },

  buildSystemPromptFromCard(data: any): string {
    const parts: string[] = [];
    
    if (data.description) {
      parts.push(data.description);
    }
    
    if (data.personality) {
      parts.push(`Personality: ${data.personality}`);
    }
    
    if (data.scenario) {
      parts.push(`Scenario: ${data.scenario}`);
    }
    
    if (data.system_prompt) {
      parts.push(data.system_prompt);
    }
    
    if (data.mes_example) {
      parts.push(`Example dialogue:\n${data.mes_example}`);
    }
    
    return parts.join('\n\n');
  },

  importFromTavernV2(card: TavernAIV2Card): Character {
    const data = card.data;
    const systemPrompt = characterCardService.buildSystemPromptFromCard(data);
    return {
      id: generateId(),
      name: data.name || 'Unnamed Character',
      description: data.description || '',
      systemPrompt: systemPrompt,
      greeting: data.first_mes || '',
      messageExample: data.mes_example || '',
      personality: data.personality || '',
      scenario: data.scenario || '',
      firstMessage: data.first_mes || '',
      mesExample: data.mes_example || '',
      creatorNotes: data.creator_notes || '',
      alternateGreetings: data.alternate_greetings || [],
      tags: data.tags || [],
      creator: data.creator || '',
      characterVersion: data.character_version || '1.0',
      avatar: undefined,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worldBookIds: [],
    };
  },

  importFromTavernV1(data: any): Character {
    const systemPrompt = characterCardService.buildSystemPromptFromCard(data);
    return {
      id: generateId(),
      name: data.name || 'Unnamed Character',
      description: data.description || '',
      systemPrompt: systemPrompt,
      greeting: data.first_mes || data.greeting || '',
      messageExample: data.mes_example || data.example_dialogue || '',
      personality: data.personality || '',
      scenario: data.scenario || '',
      firstMessage: data.first_mes || '',
      mesExample: data.mes_example || '',
      tags: data.tags || [],
      creator: data.creator || '',
      avatar: undefined,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worldBookIds: [],
    };
  },

  importFromSillyTavern(data: any): Character {
    const cardData = data.data || data;
    const systemPrompt = characterCardService.buildSystemPromptFromCard(cardData);
    return {
      id: generateId(),
      name: cardData.name || 'Unnamed Character',
      description: cardData.description || '',
      systemPrompt: systemPrompt,
      greeting: cardData.first_mes || cardData.greeting || '',
      messageExample: cardData.mes_example || cardData.example_dialogue || '',
      personality: cardData.personality || '',
      scenario: cardData.scenario || '',
      firstMessage: cardData.first_mes || '',
      mesExample: cardData.mes_example || '',
      creatorNotes: cardData.creator_notes || '',
      alternateGreetings: cardData.alternate_greetings || [],
      tags: cardData.tags || [],
      creator: cardData.creator || '',
      characterVersion: cardData.character_version || '1.0',
      avatar: undefined,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worldBookIds: [],
    };
  },

  importFromJSON(data: any): Character {
    if (!data) {
      throw new Error('Invalid character data');
    }
    
    const format = this.detectFormat(data);
    
    switch (format) {
      case 'tavern_v2':
        return this.importFromTavernV2(data as TavernAIV2Card);
      case 'tavern_v1':
        return this.importFromTavernV1(data);
      case 'sillytavern':
        return this.importFromSillyTavern(data);
      default:
        return {
          id: generateId(),
          name: data.name || data.title || 'Unnamed Character',
          description: data.description || data.personality || '',
          systemPrompt: data.systemPrompt || data.system_prompt || '',
          greeting: data.greeting || data.firstMessage || data.first_mes || '',
          messageExample: data.messageExample || data.mes_example || '',
          tags: data.tags || [],
          avatar: data.avatar || undefined,
          isFavorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          worldBookIds: data.worldBookIds || [],
        };
    }
  },

  exportToTavernV2(character: Character): TavernAIV2Card {
    const data: TavernAIV2CardData = {
      name: character.name,
      description: character.description,
      personality: character.personality || character.systemPrompt || '',
      scenario: character.scenario || '',
      first_mes: character.greeting || character.firstMessage || '',
      mes_example: character.messageExample || character.mesExample || '',
      creator_notes: character.creatorNotes || '',
      system_prompt: character.systemPrompt || '',
      post_history_instructions: '',
      alternate_greetings: character.alternateGreetings || [],
      tags: character.tags || [],
      creator: character.creator || '',
      character_version: character.characterVersion || '1.0',
      extensions: {},
    };

    return {
      spec: TAVERN_V2_SPEC,
      spec_version: TAVERN_V2_SPEC_VERSION,
      data,
    };
  },

  exportToJSON(character: Character, format: CardImportFormat = 'tavern_v2'): string {
    let exportData: any;
    
    switch (format) {
      case 'tavern_v2':
        exportData = this.exportToTavernV2(character);
        break;
      case 'tavern_v1':
        exportData = {
          name: character.name,
          description: character.description,
          personality: character.personality || character.systemPrompt,
          scenario: character.scenario,
          first_mes: character.greeting,
          mes_example: character.messageExample,
          creatorcomment: character.creatorNotes,
          avatar: character.avatar || '',
          talkativeness: '0.5',
          fav: false,
          creation: character.createdAt,
          tags: character.tags,
        };
        break;
      default:
        exportData = character;
    }
    
    return JSON.stringify(exportData, null, 2);
  },

  validateTavernV2Card(card: any): boolean {
    if (!card || typeof card !== 'object') return false;
    if (card.spec !== TAVERN_V2_SPEC) return false;
    if (!card.data || typeof card.data !== 'object') return false;
    if (typeof card.data.name !== 'string') return false;
    return true;
  },

  getCardInfo(jsonData: any): { name: string; description: string; format: CardImportFormat; tags: string[] } {
    const format = this.detectFormat(jsonData);
    let name = 'Unknown';
    let description = '';
    let tags: string[] = [];

    switch (format) {
      case 'tavern_v2':
        name = jsonData.data?.name || 'Unknown';
        description = jsonData.data?.description || '';
        tags = jsonData.data?.tags || [];
        break;
      case 'tavern_v1':
      case 'sillytavern':
        name = jsonData.name || jsonData.data?.name || 'Unknown';
        description = jsonData.description || jsonData.data?.description || '';
        tags = jsonData.tags || jsonData.data?.tags || [];
        break;
      default:
        name = jsonData.name || jsonData.title || 'Unknown';
        description = jsonData.description || '';
        tags = jsonData.tags || [];
    }

    return { name, description, format, tags };
  },

  mergeCharacterData(target: Character, source: Partial<Character>): Character {
    return {
      ...target,
      ...source,
      updatedAt: Date.now(),
    };
  },

  duplicateCharacter(character: Character): Character {
    return {
      ...character,
      id: generateId(),
      name: character.name + ' (Copy)',
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  },
};
