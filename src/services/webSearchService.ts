export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface WebSearchProvider {
  id: string;
  name: string;
  description: string;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
}

export const WEB_SEARCH_PROVIDERS: WebSearchProvider[] = [
  {
    id: 'tavily',
    name: 'Tavily',
    description: '专为AI设计的搜索API，搜索质量高，有免费额度',
    requiresApiKey: true,
    apiKeyUrl: 'https://tavily.com',
  },
  {
    id: 'serpapi',
    name: 'SerpAPI',
    description: '支持多种搜索引擎的API服务',
    requiresApiKey: true,
    apiKeyUrl: 'https://serpapi.com',
  },
  {
    id: 'google',
    name: 'Google Custom Search',
    description: 'Google自定义搜索API',
    requiresApiKey: true,
    apiKeyUrl: 'https://developers.google.com/custom-search',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    description: '免费搜索，无需API Key（有频率限制）',
    requiresApiKey: false,
  },
  {
    id: 'custom',
    name: '自定义API',
    description: '自定义搜索API端点',
    requiresApiKey: true,
  },
];

export const webSearchService = {
  getProviders(): WebSearchProvider[] {
    return WEB_SEARCH_PROVIDERS;
  },

  async search(
    query: string,
    provider: string = 'tavily',
    apiKey: string = '',
    maxResults: number = 5,
    customBaseUrl?: string
  ): Promise<WebSearchResult[]> {
    if (!query.trim()) return [];

    try {
      switch (provider) {
        case 'tavily':
          return await this.searchWithTavily(query, apiKey, maxResults);
        case 'serpapi':
          return await this.searchWithSerpAPI(query, apiKey, maxResults);
        case 'google':
          return await this.searchWithGoogle(query, apiKey, maxResults);
        case 'duckduckgo':
          return await this.searchWithDuckDuckGo(query, maxResults);
        case 'custom':
          return await this.searchWithCustom(query, apiKey, customBaseUrl || '');
        default:
          return await this.searchWithTavily(query, apiKey, maxResults);
      }
    } catch (error) {
      console.error('搜索失败:', error);
      return [];
    }
  },

  formatResults(results: WebSearchResult[]): string {
    if (results.length === 0) {
      return '（未找到相关搜索结果）';
    }
    const lines = results.map((r, i) => {
      return `[${i + 1}] ${r.title}\n    ${r.url}\n    ${r.content}`;
    });
    return lines.join('\n\n');
  },

  async searchWithTavily(
    query: string,
    apiKey: string,
    maxResults: number = 5
  ): Promise<WebSearchResult[]> {
    if (!apiKey) {
      throw new Error('Tavily API Key 未配置');
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API错误: ${response.status}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || r.href || '',
      content: r.content || r.snippet || '',
      score: r.score,
    }));

    return results.slice(0, maxResults);
  },

  async searchWithSerpAPI(
    query: string,
    apiKey: string,
    maxResults: number = 5
  ): Promise<WebSearchResult[]> {
    if (!apiKey) {
      throw new Error('SerpAPI Key 未配置');
    }

    const response = await fetch(
      `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=${maxResults}&engine=google`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`SerpAPI错误: ${response.status}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = (data.organic_results || [])
      .slice(0, maxResults)
      .map((r: any) => ({
        title: r.title || '',
        url: r.link || '',
        content: r.snippet || '',
      }));

    return results;
  },

  async searchWithGoogle(
    query: string,
    apiKey: string,
    maxResults: number = 5
  ): Promise<WebSearchResult[]> {
    if (!apiKey) {
      throw new Error('Google API Key 未配置');
    }

    const cx = '000000000000000000000:abcdefghijk';
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cx}&num=${maxResults}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      throw new Error(`Google API错误: ${response.status}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = (data.items || [])
      .slice(0, maxResults)
      .map((r: any) => ({
        title: r.title || '',
        url: r.link || '',
        content: r.snippet || '',
      }));

    return results;
  },

  async searchWithDuckDuckGo(
    query: string,
    maxResults: number = 5
  ): Promise<WebSearchResult[]> {
    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`DuckDuckGo错误: ${response.status}`);
      }

      const data = await response.json();
      const results: WebSearchResult[] = [];

      if (data.AbstractText) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL || '',
          content: data.AbstractText,
        });
      }

      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, maxResults)) {
          if (topic.FirstURL && topic.Text) {
            results.push({
              title: topic.Text?.split(' - ')[0] || query,
              url: topic.FirstURL,
              content: topic.Text,
            });
          }
        }
      }

      return results.slice(0, maxResults);
    } catch {
      return [];
    }
  },

  async searchWithCustom(
    query: string,
    apiKey: string,
    baseUrl: string
  ): Promise<WebSearchResult[]> {
    if (!baseUrl) {
      throw new Error('自定义API地址未配置');
    }

    const response = await fetch(`${baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`自定义API错误: ${response.status}`);
    }

    const data = await response.json();
    const results: WebSearchResult[] = (data.results || data.items || [])
      .slice(0, 10)
      .map((r: any) => ({
        title: r.title || '',
        url: r.url || r.link || '',
        content: r.content || r.snippet || '',
      }));

    return results;
  },
};
