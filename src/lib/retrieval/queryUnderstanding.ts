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
  make?: string;
  model?: string;
  bodyStyle?: string;
  year?: number;
  category?: string;
  condition?: 'new' | 'used' | 'cpo';
  minPrice?: number;
  maxPrice?: number;
  maxMileage?: number;
  minYear?: number;
  maxYear?: number;
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
    regex: /\b(?:services?|solutions?|consultings?|packages?|treatments?|appointments?|consultations?|freelancers?|freelance|talent|contractors?)\b/i,
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
  'model', 'models', 'make', 'makes', 'type', 'types', 'kind', 'kinds', 'option', 'options', 'lineup',
  'which', 'where', 'who', 'when', 'why', 'whose', 'whom', 'provides', 'provided', 'providing', 'provide',
  'offers', 'offered', 'offering', 'teach', 'teaches', 'teaching', 'learn', 'learning', 'study',
  'enroll', 'enrolling', 'enrollment', 'information', 'please', 'suggest', 'recommend', 'recommendation',
  'recommendations', 'available', 'availability', 'immediate', 'immediately', 'now', 'currently', 'current',
  'join', 'joining', 'open', 'openings', 'active', 'listed', 'ready', 'accepting'
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

  // 1. Informational & Page Intents (Semantic Targets)
  const isAbout = /\b(?:about(?:-us|\s+us|\s+the\s+company|\s+page|\s+your\s+team|\s+you)?|who\s+(?:are\s+you|made\s+you|built\s+you|we\s+are)|company\s+mission|our\s+story|company\s+story|team\s+members|founder|leadership)\b/i.test(lower);
  const isPolicy = /\b(?:policies|policy|terms(?:\s+and\s+conditions|\s+of\s+service|\s+of\s+use)?|privacy(?:\s+policy)?|gdpr|refund(?:\s+policy)?|cookie(?:\s+policy)?|compliance|legal(?:\s+notice)?|disclaimer|security|data\s+protection)\b/i.test(lower);
  const isFaq = /\b(?:faqs?|frequently\s+asked(?:\s+questions)?|questions\s+and\s+answers|q\s*(?:and|&)\s*a|help\s+center)\b/i.test(lower);
  const isContact = /\b(?:contact(?:\s+us|\s+team|\s+page|\s+info)?|reach\s+out|email\s+address|phone\s+number|office\s+location|support\s+team|support)\b/i.test(lower);
  const isGreeting = /^(?:hi|hello|hey|greetings|good\s*(?:morning|afternoon|evening)|howdy|sup|welcome|start|help)(?:\s+(?:there|everyone|team|bot|assistant|friend|all))?[!.]*$/i.test(lower.trim());
  const isNavigation = /\b(?:take\s+me\s+to|navigate\s+to|open\s+the\s+page|go\s+to|redirect\s+to)\b/i.test(lower);

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
  if (/\b(?:out of stock|sold out|backordered|unavailable|closed|no longer available|not listed)\b/i.test(lower)) {
    inStock = false;
  } else if (
    /\b(?:available|available now|currently available|immediate enrollment|for immediate enrollment|enroll in|open for enrollment|are open|can join|join now|ready to (?:buy|ship|enroll|join)|on the lot|in inventory|in stock|instock|active|listed)\b/i.test(lower)
  ) {
    inStock = true;
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

  // Condition Extraction (NEW vs USED vs CPO)
  let condition: StructuredQueryIntent['condition'];
  if (/\b(?:cpo|certified pre-owned|certified used|certified)\b/i.test(lower)) {
    condition = 'cpo';
  } else if (/\b(?:brand new|new vehicles?|new cars?|new inventory|new models?|new)\b/i.test(lower) && !/\bwhat(?:'s| is) new\b/i.test(lower)) {
    condition = 'new';
  } else if (/\b(?:pre-owned|used vehicles?|used cars?|used inventory|second hand|used)\b/i.test(lower)) {
    condition = 'used';
  }

  // Mileage Bounds (for USED inventory)
  let maxMileage: number | undefined;
  const mileageMatch = lower.match(/(?:under|below|less than|max(?:imum)?|<=?)\s*([0-9,]+k?)\s*(?:miles|mi|kms?|kilometers?)/i) ||
    lower.match(/([0-9,]+k?)\s*(?:miles|mi)\s*(?:or less|max|maximum)/i);
  if (mileageMatch) {
    const m = parseNumericPrice(mileageMatch[1]);
    if (m !== null) maxMileage = m;
  } else if (/\blow mileage\b/i.test(lower)) {
    maxMileage = 40000;
  }

  // Year Bounds
  let minYear: number | undefined;
  let maxYear: number | undefined;
  let exactYear: number | undefined;
  const yearMatch = lower.match(/\b(20[1-3][0-9])\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (/\b(?:newer than|after|from)\s*20[1-3][0-9]\b/i.test(lower) || /\b20[1-3][0-9]\s*(?:or newer|\+)\b/i.test(lower)) {
      minYear = y;
    } else if (/\b(?:older than|before)\s*20[1-3][0-9]\b/i.test(lower)) {
      maxYear = y;
    } else {
      exactYear = y;
      attributes.year = y;
    }
  }

  // Body Style Normalization (SUV, Truck, Sedan, Coupe, Van, Convertible, Hatchback, Wagon)
  let structuredBodyStyle: string | undefined;
  if (/\b(?:suvs?|sport utility(?: vehicle)?|crossovers?|cuvs?)\b/i.test(lower)) {
    structuredBodyStyle = 'SUV';
    attributes.bodyStyle = 'SUV';
    entityType = 'vehicle';
  } else if (/\b(?:trucks?|pickups?|pickup trucks?|crew cab|quad cab|regular cab)\b/i.test(lower)) {
    structuredBodyStyle = 'Truck';
    attributes.bodyStyle = 'Truck';
    entityType = 'vehicle';
  } else if (/\b(?:sedans?|saloons?|4-door(?: car)?|four[- ]door)\b/i.test(lower)) {
    structuredBodyStyle = 'Sedan';
    attributes.bodyStyle = 'Sedan';
    entityType = 'vehicle';
  } else if (/\b(?:coupes?|2-door(?: car)?|two[- ]door)\b/i.test(lower)) {
    structuredBodyStyle = 'Coupe';
    attributes.bodyStyle = 'Coupe';
    entityType = 'vehicle';
  } else if (/\b(?:vans?|minivans?)\b/i.test(lower)) {
    structuredBodyStyle = 'Van';
    attributes.bodyStyle = 'Van';
    entityType = 'vehicle';
  } else if (/\b(?:convertibles?|cabriolets?|roadsters?|soft top)\b/i.test(lower)) {
    structuredBodyStyle = 'Convertible';
    attributes.bodyStyle = 'Convertible';
    entityType = 'vehicle';
  } else if (/\b(?:hatchbacks?|5-door)\b/i.test(lower)) {
    structuredBodyStyle = 'Hatchback';
    attributes.bodyStyle = 'Hatchback';
    entityType = 'vehicle';
  } else if (/\b(?:wagons?|station wagon)\b/i.test(lower)) {
    structuredBodyStyle = 'Wagon';
    attributes.bodyStyle = 'Wagon';
    entityType = 'vehicle';
  }

  // Make & Model Structured Extraction
  const KNOWN_MAKES: Record<string, string> = {
    'jeep': 'Jeep',
    'ram': 'Ram',
    'dodge': 'Dodge',
    'chrysler': 'Chrysler',
    'ford': 'Ford',
    'chevrolet': 'Chevrolet',
    'chevy': 'Chevrolet',
    'gmc': 'GMC',
    'toyota': 'Toyota',
    'honda': 'Honda',
    'hyundai': 'Hyundai',
    'kia': 'Kia',
    'nissan': 'Nissan',
    'subaru': 'Subaru',
    'mazda': 'Mazda',
    'volkswagen': 'Volkswagen',
    'vw': 'Volkswagen',
    'bmw': 'BMW',
    'mercedes': 'Mercedes-Benz',
    'mercedes-benz': 'Mercedes-Benz',
    'audi': 'Audi',
    'lexus': 'Lexus',
    'acura': 'Acura',
    'volvo': 'Volvo',
    'porsche': 'Porsche',
    'tesla': 'Tesla',
    'genesis': 'Genesis',
    'buick': 'Buick',
    'cadillac': 'Cadillac',
    'lincoln': 'Lincoln',
    'infiniti': 'Infiniti',
    'mitsubishi': 'Mitsubishi',
  };

  const KNOWN_MODELS: Record<string, { model: string; make?: string }> = {
    'grand cherokee': { model: 'Grand Cherokee', make: 'Jeep' },
    'cherokee': { model: 'Cherokee', make: 'Jeep' },
    'wrangler': { model: 'Wrangler', make: 'Jeep' },
    'compass': { model: 'Compass', make: 'Jeep' },
    'gladiator': { model: 'Gladiator', make: 'Jeep' },
    'renegade': { model: 'Renegade', make: 'Jeep' },
    'grand wagoneer': { model: 'Grand Wagoneer', make: 'Jeep' },
    'wagoneer': { model: 'Wagoneer', make: 'Jeep' },
    '1500': { model: '1500', make: 'Ram' },
    '2500': { model: '2500', make: 'Ram' },
    '3500': { model: '3500', make: 'Ram' },
    'promaster': { model: 'ProMaster', make: 'Ram' },
    'durango': { model: 'Durango', make: 'Dodge' },
    'charger': { model: 'Charger', make: 'Dodge' },
    'challenger': { model: 'Challenger', make: 'Dodge' },
    'hornet': { model: 'Hornet', make: 'Dodge' },
    'pacifica': { model: 'Pacifica', make: 'Chrysler' },
    'grand caravan': { model: 'Grand Caravan', make: 'Chrysler' },
    'voyager': { model: 'Voyager', make: 'Chrysler' },
    '300': { model: '300', make: 'Chrysler' },
    'f-150': { model: 'F-150', make: 'Ford' },
    'f150': { model: 'F-150', make: 'Ford' },
    'mustang mach-e': { model: 'Mustang Mach-E', make: 'Ford' },
    'mach-e': { model: 'Mustang Mach-E', make: 'Ford' },
    'mustang': { model: 'Mustang', make: 'Ford' },
    'explorer': { model: 'Explorer', make: 'Ford' },
    'escape': { model: 'Escape', make: 'Ford' },
    'edge': { model: 'Edge', make: 'Ford' },
    'expedition': { model: 'Expedition', make: 'Ford' },
    'bronco sport': { model: 'Bronco Sport', make: 'Ford' },
    'bronco': { model: 'Bronco', make: 'Ford' },
    'ranger': { model: 'Ranger', make: 'Ford' },
    'maverick': { model: 'Maverick', make: 'Ford' },
    'silverado': { model: 'Silverado', make: 'Chevrolet' },
    'equinox': { model: 'Equinox', make: 'Chevrolet' },
    'tahoe': { model: 'Tahoe', make: 'Chevrolet' },
    'suburban': { model: 'Suburban', make: 'Chevrolet' },
    'colorado': { model: 'Colorado', make: 'Chevrolet' },
    'traverse': { model: 'Traverse', make: 'Chevrolet' },
    'blazer': { model: 'Blazer', make: 'Chevrolet' },
    'corvette': { model: 'Corvette', make: 'Chevrolet' },
    'camaro': { model: 'Camaro', make: 'Chevrolet' },
    'sierra': { model: 'Sierra', make: 'GMC' },
    'yukon': { model: 'Yukon', make: 'GMC' },
    'canyon': { model: 'Canyon', make: 'GMC' },
    'terrain': { model: 'Terrain', make: 'GMC' },
    'acadia': { model: 'Acadia', make: 'GMC' },
    'rav4': { model: 'RAV4', make: 'Toyota' },
    'camry': { model: 'Camry', make: 'Toyota' },
    'corolla': { model: 'Corolla', make: 'Toyota' },
    'highlander': { model: 'Highlander', make: 'Toyota' },
    'tacoma': { model: 'Tacoma', make: 'Toyota' },
    'tundra': { model: 'Tundra', make: 'Toyota' },
    '4runner': { model: '4Runner', make: 'Toyota' },
    'sienna': { model: 'Sienna', make: 'Toyota' },
    'prius': { model: 'Prius', make: 'Toyota' },
    'cr-v': { model: 'CR-V', make: 'Honda' },
    'crv': { model: 'CR-V', make: 'Honda' },
    'civic': { model: 'Civic', make: 'Honda' },
    'accord': { model: 'Accord', make: 'Honda' },
    'pilot': { model: 'Pilot', make: 'Honda' },
    'hr-v': { model: 'HR-V', make: 'Honda' },
    'hrv': { model: 'HR-V', make: 'Honda' },
    'ridgeline': { model: 'Ridgeline', make: 'Honda' },
    'passport': { model: 'Passport', make: 'Honda' },
    'odyssey': { model: 'Odyssey', make: 'Honda' },
    'elantra': { model: 'Elantra', make: 'Hyundai' },
    'sonata': { model: 'Sonata', make: 'Hyundai' },
    'tucson': { model: 'Tucson', make: 'Hyundai' },
    'santa fe': { model: 'Santa Fe', make: 'Hyundai' },
    'palisade': { model: 'Palisade', make: 'Hyundai' },
    'kona': { model: 'Kona', make: 'Hyundai' },
    'ioniq 5': { model: 'Ioniq 5', make: 'Hyundai' },
    'ioniq 6': { model: 'Ioniq 6', make: 'Hyundai' },
    'venue': { model: 'Venue', make: 'Hyundai' },
    'santa cruz': { model: 'Santa Cruz', make: 'Hyundai' },
    'sportage': { model: 'Sportage', make: 'Kia' },
    'telluride': { model: 'Telluride', make: 'Kia' },
    'sorento': { model: 'Sorento', make: 'Kia' },
    'forte': { model: 'Forte', make: 'Kia' },
    'k5': { model: 'K5', make: 'Kia' },
    'soul': { model: 'Soul', make: 'Kia' },
    'seltos': { model: 'Seltos', make: 'Kia' },
    'carnival': { model: 'Carnival', make: 'Kia' },
    'ev6': { model: 'EV6', make: 'Kia' },
    'ev9': { model: 'EV9', make: 'Kia' },
    'rogue': { model: 'Rogue', make: 'Nissan' },
    'altima': { model: 'Altima', make: 'Nissan' },
    'sentra': { model: 'Sentra', make: 'Nissan' },
    'pathfinder': { model: 'Pathfinder', make: 'Nissan' },
    'frontier': { model: 'Frontier', make: 'Nissan' },
    'murano': { model: 'Murano', make: 'Nissan' },
    'armada': { model: 'Armada', make: 'Nissan' },
    'outback': { model: 'Outback', make: 'Subaru' },
    'forester': { model: 'Forester', make: 'Subaru' },
    'crosstrek': { model: 'Crosstrek', make: 'Subaru' },
    'ascent': { model: 'Ascent', make: 'Subaru' },
    'impreza': { model: 'Impreza', make: 'Subaru' },
    'wrx': { model: 'WRX', make: 'Subaru' },
    'cx-5': { model: 'CX-5', make: 'Mazda' },
    'cx-50': { model: 'CX-50', make: 'Mazda' },
    'cx-90': { model: 'CX-90', make: 'Mazda' },
    'cx-30': { model: 'CX-30', make: 'Mazda' },
    'mazda3': { model: 'Mazda3', make: 'Mazda' },
    'mazda6': { model: 'Mazda6', make: 'Mazda' },
  };

  let structuredMake: string | undefined;
  let structuredModel: string | undefined;

  // 1. Check for make
  for (const [makeKey, canonicalMake] of Object.entries(KNOWN_MAKES)) {
    const makeRegex = new RegExp(`\\b${makeKey}\\b`, 'i');
    if (makeRegex.test(lower)) {
      structuredMake = canonicalMake;
      attributes.make = canonicalMake;
      entityType = 'vehicle';
      break;
    }
  }

  // 2. Check for model (longest model names checked first)
  const sortedModelKeys = Object.keys(KNOWN_MODELS).sort((a, b) => b.length - a.length);
  for (const modelKey of sortedModelKeys) {
    const escapedModel = modelKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const modelRegex = new RegExp(`\\b${escapedModel}\\b`, 'i');
    if (modelRegex.test(lower)) {
      const match = KNOWN_MODELS[modelKey];
      structuredModel = match.model;
      attributes.model = match.model;
      if (!structuredMake && match.make) {
        structuredMake = match.make;
        attributes.make = match.make;
      }
      entityType = 'vehicle';
      break;
    }
  }

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
  const vsMatch = cleanQuery.match(/(?:compare\s+|difference between\s+)?(.+?)\s+(?:vs\.?|versus|compared to)\s+(.+)/i);
  const compareMatch = cleanQuery.match(/(?:compare|difference between)\s+(.+?)\s+(?:and|with|to)\s+(.+)/i);
  if (vsMatch && vsMatch[1] && vsMatch[2]) {
    isComparison = true;
    const q1 = vsMatch[1].replace(/^(?:compare|difference between)\s+/i, '').trim();
    const q2 = vsMatch[2].replace(/\s+(?:and|also)\s+.*$/i, '').trim();
    comparisonQueries = [q1, q2];
  } else if (compareMatch && compareMatch[1] && compareMatch[2]) {
    isComparison = true;
    comparisonQueries = [compareMatch[1].trim(), compareMatch[2].trim()];
  }

  // 12. Specific Keywords for Text/Attribute Retrieval
  const negSet = new Set(negativeKeywords);
  const specificKeywords = lower
    .split(/[^a-z0-9_-]+/)
    .filter(w => w.length > 2 && !/^\d+k?$/i.test(w) && !STOP_WORDS.has(w) && !negSet.has(w));

  // 13. Intent Determination based on Semantic Target (not leading verb)
  let intent: StructuredQueryIntent['intent'] = 'general';
  if (isGreeting) {
    intent = 'greeting';
  } else if (isComparison) {
    intent = 'comparison';
  } else if (isFaq) {
    intent = 'faq';
  } else if (isPolicy) {
    intent = 'policy';
  } else if (isAbout) {
    intent = 'about';
  } else if (isContact) {
    intent = 'contact';
  } else if (isNavigation) {
    intent = 'navigation';
  } else if (entityType || maxPrice !== undefined || minPrice !== undefined || condition || maxMileage !== undefined || sortBy || onSale !== undefined || inStock !== undefined) {
    intent = 'catalog';
  } else if (/\b(?:show|list|display|find|give\s+me|all|every|browse|explore|catalog|inventory|offerings?|what (?:do )?you have|what have you got|what(?:'s| is) in stock)\b/i.test(lower)) {
    intent = 'catalog';
  }

  return {
    rawQuery: cleanQuery,
    normalizedQuery: normQuery,
    entityType,
    make: structuredMake,
    model: structuredModel,
    bodyStyle: structuredBodyStyle,
    year: exactYear,
    category: entityType,
    condition,
    minPrice,
    maxPrice,
    maxMileage,
    minYear,
    maxYear,
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
