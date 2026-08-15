import fs from 'fs';
import path from 'path';

export interface PublicApiEntry {
  name: string;
  link: string;
  description: string;
  auth: string;
  https: boolean;
  cors: string;
  category: string;
}

class PublicApiRepository {
  private apis: PublicApiEntry[] = [];
  private categories: string[] = [];
  private isLoaded = false;

  constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      const filePath = path.join(process.cwd(), 'data', 'public_apis.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        this.apis = JSON.parse(raw);
        this.categories = Array.from(new Set(this.apis.map(a => a.category))).sort();
        this.isLoaded = true;
        console.log(`[PublicApiRepo] Loaded ${this.apis.length} public APIs across ${this.categories.length} categories.`);
      }
    } catch (err) {
      console.error('[PublicApiRepo] Failed to load public APIs:', err);
    }
  }

  public getAll(): PublicApiEntry[] {
    return this.apis;
  }

  public getCategories(): string[] {
    return this.categories;
  }

  public count(): number {
    return this.apis.length;
  }

  public search(query: string, category?: string, limit = 20): PublicApiEntry[] {
    let results = this.apis;

    if (category && category !== 'all' && category !== 'All') {
      const catLower = category.toLowerCase();
      results = results.filter(a => a.category.toLowerCase() === catLower);
    }

    if (query && query.trim()) {
      const tokens = query.toLowerCase().trim().split(/\s+/);
      results = results.filter(api => {
        const fullText = `${api.name} ${api.description} ${api.category} ${api.auth}`.toLowerCase();
        return tokens.every(t => fullText.includes(t));
      });
    }

    return results.slice(0, limit);
  }

  public getCategorySummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const api of this.apis) {
      summary[api.category] = (summary[api.category] || 0) + 1;
    }
    return summary;
  }

  public findRelatedToEnvironmentalOrData(keyword: string): PublicApiEntry[] {
    const kw = keyword.toLowerCase();
    return this.apis.filter(a => {
      const t = `${a.name} ${a.description} ${a.category}`.toLowerCase();
      return t.includes(kw);
    });
  }
}

export const publicApisRepo = new PublicApiRepository();
