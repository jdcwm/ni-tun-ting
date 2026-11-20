import { AIProvider, WorldBook } from '../types';
import { aiService } from './aiService';

export interface DiagnosticResult {
  id: string;
  name: string;
  description: string;
  status: 'pass' | 'fail' | 'skipped';
  duration: number;
  error?: string;
  suggestion?: string;
}

export interface DiagnosticReport {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  totalDuration: number;
  results: DiagnosticResult[];
  timestamp: number;
}

export const diagnosticService = {
  async runAllDiagnostics(
    provider: AIProvider | null,
    imageProvider: AIProvider | null,
    worldBooks: WorldBook[],
    hasStatusBar: boolean
  ): Promise<DiagnosticReport> {
    const results: DiagnosticResult[] = [];
    const startTime = Date.now();

    results.push(await this.testApiConnection(provider));
    results.push(await this.testStreamingOutput(provider));
    results.push(await this.testImageGeneration(imageProvider));
    results.push(await this.testSummary(provider));
    results.push(await this.testWorldBookTrigger(provider, worldBooks));
    results.push(await this.testStatusBarSystem(hasStatusBar));

    const totalDuration = Date.now() - startTime;
    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    return {
      totalTests: results.length,
      passed,
      failed,
      skipped,
      totalDuration,
      results,
      timestamp: Date.now(),
    };
  },

  async testApiConnection(provider: AIProvider | null): Promise<DiagnosticResult> {
    const startTime = Date.now();
    const id = 'api-connection';
    const name = 'API连接检测';
    const description = '测试当前选中的AI提供商是否能正常连接';

    if (!provider) {
      return {
        id,
        name,
        description,
        status: 'skipped',
        duration: Date.now() - startTime,
        error: '未配置对话AI提供商',
        suggestion: '请在设置中添加并选择一个对话AI提供商',
      };
    }

    try {
      const testMessage = {
        id: 'test-' + Date.now(),
        role: 'user' as const,
        content: 'ping',
        images: [],
        timestamp: Date.now(),
      };
      await aiService.chat(provider, [testMessage], '你是一个测试助手，请只回复"pong"。');
      return {
        id,
        name,
        description,
        status: 'pass',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        id,
        name,
        description,
        status: 'fail',
        duration: Date.now() - startTime,
        error: error?.message || '连接失败',
        suggestion: this.getApiErrorSuggestion(error),
      };
    }
  },

  async testStreamingOutput(provider: AIProvider | null): Promise<DiagnosticResult> {
    const startTime = Date.now();
    const id = 'streaming-output';
    const name = '流式输出检测';
    const description = '测试AI是否支持流式输出';

    if (!provider) {
      return {
        id,
        name,
        description,
        status: 'skipped',
        duration: Date.now() - startTime,
        error: '未配置对话AI提供商',
        suggestion: '请在设置中添加并选择一个对话AI提供商',
      };
    }

    try {
      let receivedChunks = 0;
      const testMessage = {
        id: 'test-stream-' + Date.now(),
        role: 'user' as const,
        content: '说一句话',
        images: [],
        timestamp: Date.now(),
      };

      await aiService.chat(
        provider,
        [testMessage],
        '你是一个测试助手，请用一句话回复。',
        () => {
          receivedChunks++;
        }
      );

      if (receivedChunks > 1) {
        return {
          id,
          name,
          description,
          status: 'pass',
          duration: Date.now() - startTime,
        };
      } else {
        return {
          id,
          name,
          description,
          status: 'fail',
          duration: Date.now() - startTime,
          error: '未检测到流式输出',
          suggestion: '请检查AI提供商是否支持流式输出，或在设置中启用流式输出',
        };
      }
    } catch (error: any) {
      return {
        id,
        name,
        description,
        status: 'fail',
        duration: Date.now() - startTime,
        error: error?.message || '流式输出测试失败',
        suggestion: this.getApiErrorSuggestion(error),
      };
    }
  },

  async testImageGeneration(provider: AIProvider | null): Promise<DiagnosticResult> {
    const startTime = Date.now();
    const id = 'image-generation';
    const name = '图片生成检测';
    const description = '测试图片生成功能是否正常';

    if (!provider) {
      return {
        id,
        name,
        description,
        status: 'skipped',
        duration: Date.now() - startTime,
        error: '未配置图片AI提供商',
        suggestion: '请在设置中添加并选择一个图片AI提供商',
      };
    }

    try {
      const result = await aiService.generateImage(provider, '一张简单的测试图片，纯色背景', '512x512');
      if (result && result.length > 0) {
        return {
          id,
          name,
          description,
          status: 'pass',
          duration: Date.now() - startTime,
        };
      } else {
        return {
          id,
          name,
          description,
          status: 'fail',
          duration: Date.now() - startTime,
          error: '未返回图片',
          suggestion: '请检查图片AI提供商配置是否正确',
        };
      }
    } catch (error: any) {
      return {
        id,
        name,
        description,
        status: 'fail',
        duration: Date.now() - startTime,
        error: error?.message || '图片生成失败',
        suggestion: this.getApiErrorSuggestion(error),
      };
    }
  },

  async testSummary(provider: AIProvider | null): Promise<DiagnosticResult> {
    const startTime = Date.now();
    const id = 'summary';
    const name = '总结功能检测';
    const description = '测试对话总结功能是否正常';

    if (!provider) {
      return {
        id,
        name,
        description,
        status: 'skipped',
        duration: Date.now() - startTime,
        error: '未配置对话AI提供商',
        suggestion: '请在设置中添加并选择一个对话AI提供商',
      };
    }

    try {
      const messages = [
        { id: '1', role: 'user' as const, content: '你好', images: [], timestamp: Date.now() },
        { id: '2', role: 'assistant' as const, content: '你好！有什么我可以帮助你的吗？', images: [], timestamp: Date.now() },
      ];
      const result = await aiService.summarize(provider, messages, '请用一句话总结这段对话');
      if (result && result.content && result.content.length > 0) {
        return {
          id,
          name,
          description,
          status: 'pass',
          duration: Date.now() - startTime,
        };
      } else {
        return {
          id,
          name,
          description,
          status: 'fail',
          duration: Date.now() - startTime,
          error: '总结结果为空',
          suggestion: '请检查AI提供商配置是否支持摘要功能',
        };
      }
    } catch (error: any) {
      return {
        id,
        name,
        description,
        status: 'fail',
        duration: Date.now() - startTime,
        error: error?.message || '总结功能测试失败',
        suggestion: this.getApiErrorSuggestion(error),
      };
    }
  },

  async testWorldBookTrigger(provider: AIProvider | null, worldBooks: WorldBook[]): Promise<DiagnosticResult> {
    const startTime = Date.now();
    const id = 'worldbook-trigger';
    const name = '世界书触发检测';
    const description = '测试世界书配置和关键词触发功能';

    if (!worldBooks || worldBooks.length === 0) {
      return {
        id,
        name,
        description,
        status: 'skipped',
        duration: Date.now() - startTime,
        error: '没有世界书',
        suggestion: '请创建至少一个世界书以进行测试',
      };
    }

    try {
      const activeWorldBook = worldBooks[0];
      const entries = activeWorldBook.entries || [];
      
      if (entries.length === 0) {
        return {
          id,
          name,
          description,
          status: 'skipped',
          duration: Date.now() - startTime,
          error: '世界书没有条目',
          suggestion: '请在世界书中添加至少一个条目',
        };
      }

      const entriesWithKeywords = entries.filter((e) => e.keys && e.keys.length > 0);
      
      if (entriesWithKeywords.length === 0) {
        return {
          id,
          name,
          description,
          status: 'skipped',
          duration: Date.now() - startTime,
          error: '世界书条目没有关键词',
          suggestion: '请为世界书条目添加关键词',
        };
      }

      return {
        id,
        name,
        description,
        status: 'pass',
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        id,
        name,
        description,
        status: 'fail',
        duration: Date.now() - startTime,
        error: error?.message || '世界书触发测试失败',
        suggestion: '请检查世界书配置是否正确',
      };
    }
  },

  async testStatusBarSystem(hasStatusBar: boolean): Promise<DiagnosticResult> {
    const startTime = Date.now();
    const id = 'statusbar-system';
    const name = '状态栏系统检测';
    const description = '测试状态栏系统是否正常';

    try {
      if (hasStatusBar) {
        return {
          id,
          name,
          description,
          status: 'pass',
          duration: Date.now() - startTime,
        };
      } else {
        return {
          id,
          name,
          description,
          status: 'skipped',
          duration: Date.now() - startTime,
          error: '状态栏未启用',
          suggestion: '请在聊天设置中启用状态栏以使用此功能',
        };
      }
    } catch (error: any) {
      return {
        id,
        name,
        description,
        status: 'fail',
        duration: Date.now() - startTime,
        error: error?.message || '状态栏系统测试失败',
        suggestion: '请检查状态栏配置',
      };
    }
  },

  getApiErrorSuggestion(error: any): string {
    const message = error?.message || '';
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('auth')) {
      return 'API密钥无效，请检查并更新你的API密钥';
    }
    if (message.includes('404') || message.includes('not found')) {
      return 'API端点不存在，请检查API地址配置';
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return '触发了速率限制，请稍后再试或升级你的API计划';
    }
    if (message.includes('500') || message.includes('server')) {
      return '服务器内部错误，请稍后再试';
    }
    if (message.includes('timeout') || message.includes('网络')) {
      return '网络连接超时，请检查你的网络连接';
    }
    if (message.includes('quota') || message.includes('余额')) {
      return 'API配额不足，请检查你的账户余额';
    }
    return '请检查API配置是否正确，或查看提供商的文档';
  },

  formatReport(report: DiagnosticReport): string {
    const date = new Date(report.timestamp).toLocaleString('zh-CN');
    let text = `=== AI 对话检测报告 ===\n`;
    text += `检测时间: ${date}\n`;
    text += `总检测项: ${report.totalTests}\n`;
    text += `通过: ${report.passed} | 失败: ${report.failed} | 跳过: ${report.skipped}\n`;
    text += `总耗时: ${(report.totalDuration / 1000).toFixed(2)} 秒\n`;
    text += `\n--- 详细结果 ---\n\n`;

    for (const result of report.results) {
      const statusIcon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
      const statusText = result.status === 'pass' ? '通过' : result.status === 'fail' ? '失败' : '跳过';
      text += `${statusIcon} ${result.name} [${statusText}] (${(result.duration / 1000).toFixed(2)}s)\n`;
      text += `   ${result.description}\n`;
      if (result.error) {
        text += `   错误: ${result.error}\n`;
      }
      if (result.suggestion) {
        text += `   建议: ${result.suggestion}\n`;
      }
      text += `\n`;
    }

    return text;
  },
};
