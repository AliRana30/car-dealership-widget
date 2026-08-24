/**
 * Structured Query-Understanding Layer
 *
 * Deterministically extracts user constraints from natural language without
 * relying on the LLM to hallucinate or invent values.
 *
 * Domain-agnostic extraction:
 * - Entity Type (course, vehicle, product, service, property, plan)
 * - Exact Entity Name
 * - Category / Domain
 * - Price Boundaries (minPrice, maxPrice, priceRange, supporting $30k, $65,000)
 * - Currency (USD, CAD, EUR, GBP)
 * - Sale / Discount State (onSale: true | false)
 * - Rating Minimum & Boost (minRating e.g. 4.0, 4.5, 5)
 * - Availability (inStock: true | false)
 * - Location / Region
 * - Attributes & Specifications (color, fuelType, transmission, engine, level, format)
 * - Sort Order (price_asc, price_desc, rating_desc, newest)
 * - Quantity (e.g. "top 3", "2 items")
 * - Navigation & Informational Intents
 */

export interface StructuredQueryIntent {
  rawQuery: string;
  normalizedQuery: string;
  entityType?: 'course' | 'vehicle' | 'product' | 'service' | 'property' | 'plan';
  exactEntityName?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  onSale?: boolean; // true = discounted/sale only, false = regular price/no discount
  minRating?: number; // e.g. 4.0
  inStock?: boolean; // true = available/in-stock only
  location?: string;
  attributes: Record<string, string | boolean | number>;
  negativeKeywords: string[];
  sortBy?: 'price_asc' | 'price_desc' | 'rating_desc' | 'newest' | 'relevance';
  quantity?: number;
  intent: 'specific_entity' | 'catalog' | 'comparison' | 'navigation' | 'about' | 'policy' | 'faq' | 'contact' | 'greeting' | 'general';
  comparisonQueries?: string[];
  navigationTarget?: string;
  specificKeywords: string[];
  isInformational: boolean;
}

// ── Domain-Agnostic Vocabulary & Synonyms ──────────────────────────────────────

const ENTITY_TYPE_PATTERNS: Array<{ type: StructuredQueryIntent['entityType']; regex: RegExp }> = [
  {
    type: 'course',
    regex: /\b(?:courses?|programs?|classes?|bootcamps?|trainings?|certifications?|workshops?|lessons?|tutorials?|curriculums?|modules?)\b/i,
  },
  {
    type: 'vehicle',
    regex: /\b(?:cars?|vehicles?|trucks?|suvs?|autos?|automobiles?|sedans?|coupes?|vans?|pickups?|crossovers?|dealership|inventory)\b/i,
  },
  {
    type: 'service',
    regex: /\b(?:services?|solutions?|consultings?|packages?|treatments?|appointments?|consultations?)\b/i,
  },
  {
    type: 'property',
    regex: /\b(?:propert(?:y|ies)|homes?|houses?|apartments?|condos?|estates?|villas?|studios?|rentals?|realty)\b/i,
  },
  {
    type: 'plan',
    regex: /\b(?:plans?|memberships?|subscriptions?|tiers?)\b/i,
  },
  {
    type: 'product',
    regex: /\b(?:products?|items?|goods?|merchandise|wares)\b/i,
  },
];

const STOP_WORDS = new Set([
  'show', 'me', 'the', 'a', 'an', 'what', 'is', 'your', 'tell', 'about',
  'can', 'you', 'give', 'details', 'for', 'of', 'in', 'at', 'with', 'do',
  'have', 'offer', 'available', 'there', 'any', 'how', 'much', 'are', 'i',
  'want', 'to', 'know', 'see', 'find', 'looking', 'get', 'more', 'info',
  'all', 'every', 'list', 'view', 'explore', 'browse', 'something', 'some',
  'course', 'courses', 'product', 'products', 'service', 'services', 'offering',
  'offerings', 'program', 'programs', 'item', 'items', 'class', 'classes',
  'vehicle', 'vehicles', 'car', 'cars', 'truck', 'trucks', 'suv', 'suvs',
  'auto', 'automobile', 'automotive', 'inventory', 'catalog',
  'family', 'offroad', 'suitable', 'conditions', 'winter', 'driving', 'need',
  'not', 'no', 'non', 'without', 'excluding', 'except', 'never',
  'under', 'below', 'less', 'than', 'cheaper', 'max', 'maximum', 'above',
  'over', 'more', 'greater', 'min', 'minimum', 'between', 'and', 'or',
  'budget', 'affordable', 'least', 'most', 'expensive', 'cheapest', 'best',
  'top', 'rated', 'popular', 'price', 'pricing', 'cost', 'costs', 'fee', 'fees',
  'tuition', 'dollar', 'dollars', 'bucks', 'stars', 'star', 'rating', 'ratings',
  'discount', 'discounts', 'discounted', 'sale', 'sales', 'deal', 'deals', 'promo',
  'promos', 'special', 'specials', 'regular', 'priced', 'stock', 'availability', 'reviews', 'review',
  'model', 'models', 'make', 'makes', 'type', 'types', 'kind', 'kinds', 'option', 'options', 'lineup'
]);

function parseNumericPrice(str: string): number | null {
  if (!str) return null;
  const clean = str.trim().toLowerCase().replace(/,/g, '');
  if (clean.endsWith('k')) {
    const num = parseFloat(clean.slice(0, -1));
    return isNaN(num) ? null : num * 1000;
  }
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

// ── Main Query-Understanding Parser ───────────────────────────────────────────

export function understandQuery(rawQuery: string): StructuredQueryIntent {
  const cleanQuery = (rawQuery || '').trim();
  const lower = cleanQuery.toLowerCase();
  const normQuery = lower.replace(/[^a-z0-9]/g, '');

  // 1. Informational & Page Intents
  const isAbout = /(?:about (?:us|the company|your team|you)|who (?:are you|made you|built you)|company mission|our story|company story|team members|founder)/i.test(lower);
  const isPolicy = /(?:policy|policies|terms|privacy|gdpr|refund|cookie|compliance|legal|disclaimer|security|data protection)/i.test(lower);
  const isFaq = /(?:faq|frequently asked|questions|help center)/i.test(lower);
  const isContact = /(?:contact (?:us|team)|reach out|email address|phone number|office location|support team)/i.test(lower);
  const isGreeting = /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|start|help)$/i.test(lower);
  const isNavigation = /\b(?:take me to|navigate to|open the page|go to|open)\b/i.test(lower);

  const isInformational = isAbout || isPolicy || isFaq || isContact;

  // 2. Entity Type Detection (Generic & Domain-Agnostic)
  let entityType: StructuredQueryIntent['entityType'];
  for (const p of ENTITY_TYPE_PATTERNS) {
    if (p.regex.test(lower)) {
      entityType = p.type;
      break;
    }
  }

  // 3. Price Boundaries & Range Parsing (Supporting $30k, $65,000, between X and Y)
  let minPrice: number | undefined;
  let maxPrice: number | undefined;
  let currency: string | undefined;

  if (/\b(?:usd|dollars?|bucks?)\b/i.test(lower) || /\$/.test(lower)) currency = 'USD';
  else if (/\b(?:cad|canadian dollars?)\b/i.test(lower)) currency = 'CAD';
  else if (/\b(?:eur|euros?)\b/i.test(lower) || /€/.test(lower)) currency = 'EUR';
  else if (/\b(?:gbp|pounds?)\b/i.test(lower) || /£/.test(lower)) currency = 'GBP';

  const priceNumPattern = `[0-9,]+(?:\\.[0-9]+)?k?`;

  const betweenMatch = lower.match(new RegExp(`(?:between|from)\\s*\\$?(${priceNumPattern})\\s*(?:and|to|-)\\s*\\$?(${priceNumPattern})`, 'i'));
  if (betweenMatch) {
    const p1 = parseNumericPrice(betweenMatch[1]);
    const p2 = parseNumericPrice(betweenMatch[2]);
    if (p1 !== null && p2 !== null) {
      minPrice = Math.min(p1, p2);
      maxPrice = Math.max(p1, p2);
    }
  }

  if (maxPrice === undefined) {
    const underMatch = lower.match(new RegExp(`(?:under|below|less than|cheaper than|max(?:imum)?|<=?)\\s*\\$?(${priceNumPattern})`, 'i'));
    if (underMatch) {
      const p = parseNumericPrice(underMatch[1]);
      if (p !== null) maxPrice = p;
    }
  }

  if (minPrice === undefined) {
    const overMatch = lower.match(new RegExp(`(?:above|over|more than|greater than|min(?:imum)?|>=?)\\s*\\$?(${priceNumPattern})`, 'i'));
    if (overMatch) {
      const p = parseNumericPrice(overMatch[1]);
      if (p !== null) minPrice = p;
    }
  }

  // 4. Sale / Discount State Extraction
  let onSale: boolean | undefined;
  if (/\b(?:without (?:a )?discount|no discount|not on sale|full price|regular price|regular priced|non-discounted)\b/i.test(lower)) {
    onSale = false;
  } else if (/\b(?:on sale|discounted|with (?:a )?discount|special offer|sale price|deal|on deal|promo|marked down)\b/i.test(lower)) {
    onSale = true;
  }

  // 5. Rating Minimum & Boost
  let minRating: number | undefined;
  const ratingMatch = lower.match(/(?:at least|minimum|min)\s*([1-5](?:\.[0-9])?)\s*(?:stars?|\+|\s*out of 5|\s*rating)?/i) ||
    lower.match(/rated\s*([1-5](?:\.[0-9])?)\s*(?:stars?|\+|\s*out of 5)/i) ||
    lower.match(/([1-5](?:\.[0-9])?)\s*\+\s*stars?/i) ||
    lower.match(/([1-5](?:\.[0-9])?)\s*stars?\s*(?:and|or)\s*(?:above|higher|better)/i);
  if (ratingMatch) {
    const r = parseFloat(ratingMatch[1]);
    if (!isNaN(r)) minRating = r;
  }

  // 6. Availability / In-Stock
  let inStock: boolean | undefined;
  if (/\b(?:in stock|available now|ready to (?:buy|ship|enroll)|on the lot|in inventory)\b/i.test(lower)) {
    inStock = true;
  } else if (/\b(?:out of stock|sold out|backordered|unavailable)\b/i.test(lower)) {
    inStock = false;
  }

  // 7. Sort Order Extraction
  let sortBy: StructuredQueryIntent['sortBy'];
  if (/\b(?:cheapest|lowest price|least expensive|budget friendly|affordable)\b/i.test(lower)) {
    sortBy = 'price_asc';
  } else if (/\b(?:most expensive|highest price|luxury|premium)\b/i.test(lower)) {
    sortBy = 'price_desc';
  } else if (/\b(?:best rated|top rated|highest rated|top reviews|top rated|5 star|best review)\b/i.test(lower)) {
    sortBy = 'rating_desc';
  } else if (/\b(?:newest|latest|new arrivals?|recently added)\b/i.test(lower)) {
    sortBy = 'newest';
  }

  // 8. Quantity Extraction
  let quantity: number | undefined;
  const qtyMatch = lower.match(/\b(?:top|first|show me|list)\s*([1-9]|10)\b/i) ||
    lower.match(/\b([1-9]|10)\s*(?:courses?|products?|cars?|vehicles?|items?|services?)\b/i);
  if (qtyMatch) {
    const q = parseInt(qtyMatch[1], 10);
    if (!isNaN(q)) quantity = q;
  }

  // 9. Attribute & Specification Extraction
  const attributes: Record<string, string | boolean | number> = {};

  // Transmission
  if (/\b(?:automatic|auto trans(?:mission)?)\b/i.test(lower)) attributes.transmission = 'automatic';
  else if (/\b(?:manual|stick shift)\b/i.test(lower)) attributes.transmission = 'manual';

  // Drivetrain / 4x4
  if (/\b(?:4x4|4wd|awd|all-wheel drive|four wheel drive)\b/i.test(lower)) attributes.drivetrain = '4x4';

  // Fuel Type / Engine
  if (/\b(?:plug-in hybrid|phev|4xe)\b/i.test(lower)) attributes.fuelType = 'plug-in hybrid';
  else if (/\b(?:electric|ev|bev)\b/i.test(lower) && !/\bnot electric\b/i.test(lower)) attributes.fuelType = 'electric';
  else if (/\b(?:gas|gasoline|petrol)\b/i.test(lower)) attributes.fuelType = 'gasoline';
  else if (/\b(?:diesel)\b/i.test(lower)) attributes.fuelType = 'diesel';

  if (/\b(?:hemi|v8)\b/i.test(lower)) attributes.engine = 'v8';
  else if (/\b(?:v6)\b/i.test(lower)) attributes.engine = 'v6';

  // Course Level
  if (/\b(?:beginner|introductory|entry-level|starter|fundamentals)\b/i.test(lower)) attributes.level = 'beginner';
  else if (/\b(?:intermediate|mid-level)\b/i.test(lower)) attributes.level = 'intermediate';
  else if (/\b(?:advanced|mastery|expert|pro)\b/i.test(lower)) attributes.level = 'advanced';

  // Delivery / Format
  if (/\b(?:online|remote|self-paced|e-learning)\b/i.test(lower)) attributes.format = 'online';
  else if (/\b(?:in-person|on-campus|classroom)\b/i.test(lower)) attributes.format = 'in-person';

  // 10. Negative Constraints
  const negativeKeywords: string[] = [];
  const negRegex = /\b(?:not|non|no|excluding|without|except)\s+([a-z0-9_-]+)/gi;
  let nMatch: RegExpExecArray | null;
  while ((nMatch = negRegex.exec(lower)) !== null) {
    const word = nMatch[1].toLowerCase();
    if (word && word.length > 2 && !STOP_WORDS.has(word)) {
      negativeKeywords.push(word);
    }
  }

  // 11. Comparison Intent
  let isComparison = false;
  let comparisonQueries: string[] = [];
  const vsMatch = cleanQuery.match(/(.+?)\s+(?:vs\.?|versus|compared to)\s+(.+)/i);
  const compareMatch = cleanQuery.match(/(?:compare|difference between)\s+(.+?)\s+(?:and|with|to)\s+(.+)/i);
  if (vsMatch && vsMatch[1] && vsMatch[2]) {
    isComparison = true;
    comparisonQueries = [vsMatch[1].trim(), vsMatch[2].trim()];
  } else if (compareMatch && compareMatch[1] && compareMatch[2]) {
    isComparison = true;
    comparisonQueries = [compareMatch[1].trim(), compareMatch[2].trim()];
  }

  // 12. Specific Keywords for Text/Attribute Retrieval
  const negSet = new Set(negativeKeywords);
  const specificKeywords = lower
    .split(/[^a-z0-9_-]+/)
    .filter(w => w.length > 2 && !/^\d+k?$/i.test(w) && !STOP_WORDS.has(w) && !negSet.has(w));

  // 13. Intent Determination
  let intent: StructuredQueryIntent['intent'] = 'general';
  if (isGreeting) intent = 'greeting';
  else if (isComparison) intent = 'comparison';
  else if (isNavigation) intent = 'navigation';
  else if (isAbout) intent = 'about';
  else if (isPolicy) intent = 'policy';
  else if (isFaq) intent = 'faq';
  else if (isContact) intent = 'contact';
  else if (entityType || maxPrice !== undefined || minPrice !== undefined || sortBy || onSale !== undefined) intent = 'catalog';

  return {
    rawQuery: cleanQuery,
    normalizedQuery: normQuery,
    entityType,
    category: entityType,
    minPrice,
    maxPrice,
    currency,
    onSale,
    minRating,
    inStock,
    attributes,
    negativeKeywords,
    sortBy,
    quantity,
    intent,
    comparisonQueries: isComparison ? comparisonQueries : undefined,
    specificKeywords,
    isInformational,
  };
}
