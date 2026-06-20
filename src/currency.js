const SYMBOL_TO_CODE = {
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR',
  C$: 'CAD',
  AU$: 'AUD',
  MXN$: 'MXN',
};

const CODE_TO_SYMBOL = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  CAD: 'C$',
  AUD: 'AU$',
  MXN: 'MXN$',
};

const TLD_TO_CODE = {
  'ebay.com': 'USD',
  'ebay.co.uk': 'GBP',
  'ebay.de': 'EUR',
  'ebay.fr': 'EUR',
  'ebay.it': 'EUR',
  'ebay.es': 'EUR',
  'ebay.ca': 'CAD',
  'ebay.com.au': 'AUD',
};

const ALL_CURRENCY_CODES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'MXN'];

let cachedRates = null;
let cacheTimestamp = 0;
const RATES_TTL = 60 * 60 * 1000;

function getDefaultCurrencyCode() {
  const host = window.location.hostname;

  for (const [tld, code] of Object.entries(TLD_TO_CODE)) {
    if (host.endsWith(tld)) {
      return code;
    }
  }

  return 'USD';
}

function getSelectedCurrencyCode() {
  try {
    return localStorage.getItem(CURRENCY_KEY) || getDefaultCurrencyCode();
  } catch {
    return getDefaultCurrencyCode();
  }
}

async function fetchRates() {
  if (cachedRates && Date.now() - cacheTimestamp < RATES_TTL) {
    return cachedRates;
  }

  const conv = await EasyCurrencies.Convert().from('USD').fetch();
  cachedRates = conv.rates;
  cacheTimestamp = Date.now();

  return cachedRates;
}

function convertPrice(price, fromSymbol, toCode, rates) {
  const fromCode = SYMBOL_TO_CODE[fromSymbol] || 'USD';

  if (fromCode === toCode) {
    return price;
  }

  return price * (rates[toCode] / (rates[fromCode] || 1));
}
