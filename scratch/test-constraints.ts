function parsePriceValue(price: any): number | null {
  if (typeof price === 'number') return price;
  if (!price) return null;
  const str = String(price).replace(/,/g, '');
  const m = str.match(/\$?\s*(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

interface QueryConstraints {
  maxPrice?: number;
  minPrice?: number;
  sortByPrice?: 'asc' | 'desc';
  sortByRating?: boolean;
  isAboutQuery: boolean;
  isPolicyQuery: boolean;
  isFaqQuery: boolean;
  isCatalogQuery: boolean;
  specificKeywords: string[];
}

function parseQueryConstraints(query: string): QueryConstraints {
  const lower = query.trim().toLowerCase();
  
  // Price constraints
  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  let sortByPrice: 'asc' | 'desc' | undefined;
  
  const underMatch = lower.match(/(?:under|below|less than|cheaper than|max(?:imum)?|<=?)\s*\$?(\d+)/i);
  if (underMatch) maxPrice = parseFloat(underMatch[1]);

  const overMatch = lower.match(/(?:above|over|more than|greater than|min(?:imum)?|>=?)\s*\$?(\d+)/i);
  if (overMatch) minPrice = parseFloat(overMatch[1]);

  const betweenMatch = lower.match(/between\s*\$?(\d+)\s*(?:and|-|to)\s*\$?(\d+)/i);
  if (betweenMatch) {
    minPrice = parseFloat(betweenMatch[1]);
    maxPrice = parseFloat(betweenMatch[2]);
  }

  if (/(?:cheapest|lowest price|least expensive|budget friendly|affordable)/i.test(lower)) {
    sortByPrice = 'asc';
  } else if (/(?:most expensive|premium|highest price|luxury)/i.test(lower)) {
    sortByPrice = 'desc';
  }

  const sortByRating = /(?:best rated|top rated|highest rated|top reviews|5 star|best courses?|top courses?)/i.test(lower);

  const isAboutQuery = /(?:about|who are you|mission|story|company|founder|developer|background|team|who built)/i.test(lower);
  const isPolicyQuery = /(?:policy|policies|terms|privacy|gdpr|refund|cookie|compliance|legal|disclaimer|security|data protection)/i.test(lower);
  const isFaqQuery = /(?:faq|frequently asked|questions|help|support|contact|reach out|email|phone|address|location)/i.test(lower);
  const isCatalogQuery = /(?:course|courses|product|products|service|services|offering|offerings|class|classes|learn|bootcamp|catalog|pricing|price|cost|tier|buy|book|enroll|show|items?|what do you)/i.test(lower);

  // Stop words to remove for specific keywords
  const stopWords = new Set(['show', 'me', 'the', 'a', 'an', 'what', 'is', 'your', 'tell', 'about', 'can', 'you', 'give', 'details', 'for', 'of', 'in', 'at', 'with', 'course', 'courses', 'product', 'products']);
  const words = lower.split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w));

  return {
    maxPrice,
    minPrice,
    sortByPrice,
    sortByRating,
    isAboutQuery,
    isPolicyQuery,
    isFaqQuery,
    isCatalogQuery,
    specificKeywords: words,
  };
}

console.log('Testing Query Constraints:');
console.log('1. "can you show me the mern sstack course?" ->', parseQueryConstraints('can you show me the mern sstack course?'));
console.log('2. "show me courses under $100" ->', parseQueryConstraints('show me courses under $100'));
console.log('3. "show me your about" ->', parseQueryConstraints('show me your about'));
console.log('4. "what is your policy?" ->', parseQueryConstraints('what is your policy?'));
console.log('5. "what are the best rated courses?" ->', parseQueryConstraints('what are the best rated courses?'));
