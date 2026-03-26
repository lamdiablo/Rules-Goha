/*
  Pinterest iOS ad cleaner for Loon
  Based on uploaded captures and screenshots.

  Covered ad surfaces observed in the capture:
  1) Home feed merchant/product insertions in /v3/feeds/home/
  2) Pin closeup related product modules in /v3/pins/<id>/related/modules/
  3) Shop the Pin / shopping carousel in /v3/visual_search/stela/pins/<id>/module/
  4) Third-party ad config / premiere ad media requests are blocked in plugin rewrite

  Strategy:
  - Request phase: disable force_ads_insertion where present
  - Response phase: strip promoted pins and commerce-heavy insertions while preserving normal pins
*/

function parseJSON(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function hasNonEmpty(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (isObject(v)) return Object.keys(v).length > 0;
  return true;
}

function isPromotedPin(item) {
  if (!isObject(item)) return false;

  if (item.is_promoted === true) return true;
  if (item.is_shopping_ad === true) return true;
  if (item.promoted_is_catalog_carousel_ad === true) return true;
  if (item.promoted_is_lead_ad === true) return true;
  if (item.promoted_is_auto_assembled === true) return true;
  if (item.promoted_is_showcase === true) return true;
  if (item.promoted_is_max_video === true) return true;
  if (item.promoted_is_quiz === true) return true;
  if (item.promoted_is_removable === true) return true;
  if (item.is_downstream_promotion === true) return true;

  if (item.ad_match_reason && item.ad_match_reason !== 0 && item.ad_match_reason !== '0') return true;
  if (hasNonEmpty(item.ad_destination_url)) return true;
  if (hasNonEmpty(item.advertiser_id)) return true;
  if (hasNonEmpty(item.sponsorship)) return true;
  if (hasNonEmpty(item.promoter)) return true;
  if (hasNonEmpty(item.promoted_lead_form)) return true;
  if (hasNonEmpty(item.promoted_quiz_pin_data)) return true;
  if (hasNonEmpty(item.promoted_ios_deep_link)) return true;

  return false;
}

function isCommerceInjection(item) {
  if (!isObject(item)) return false;
  if (item.type !== 'pin') return false;

  var rich = item.rich_summary || item.rich_metadata || {};
  var typeName = rich.type_name || '';
  var hasProducts = Array.isArray(rich.products) && rich.products.length > 0;
  var shoppingFlags = Array.isArray(item.shopping_flags) && item.shopping_flags.length > 0;
  var hasTrackedLink = typeof item.tracked_link === 'string' && /^https?:\/\//.test(item.tracked_link);
  var domain = typeof item.domain === 'string' ? item.domain.toLowerCase() : '';
  var looksMerchantDomain = domain && domain !== 'uploaded by user' && domain !== 'pinterest.com' && domain !== 'pin.it';

  if (typeName === 'product' && (shoppingFlags || hasProducts)) return true;
  if (shoppingFlags && hasTrackedLink && looksMerchantDomain) return true;
  if (hasProducts && hasTrackedLink && looksMerchantDomain) return true;

  return false;
}

function shouldDropHomeItem(item) {
  return isPromotedPin(item) || isCommerceInjection(item);
}

function shouldDropRelatedItem(item) {
  return isPromotedPin(item) || isCommerceInjection(item);
}

function filterList(list, predicate) {
  if (!Array.isArray(list)) return list;
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (predicate(item)) continue;
    out.push(item);
  }
  return out;
}

function cleanHomeFeed(obj) {
  if (!obj || !Array.isArray(obj.data)) return obj;
  obj.data = filterList(obj.data, shouldDropHomeItem);
  return obj;
}

function cleanRelatedModules(obj) {
  if (!obj || !Array.isArray(obj.data)) return obj;
  obj.data = filterList(obj.data, shouldDropRelatedItem);
  return obj;
}

function cleanShoppingCarousel(obj) {
  if (!obj) return obj;
  obj.data = [];
  if ('bookmark' in obj) obj.bookmark = '';
  return obj;
}

function mainResponse() {
  var raw = $response.body || '';
  var obj = parseJSON(raw);
  if (!obj) return $done({});

  var url = ($request && $request.url) || '';
  var endpoint = obj.endpoint_name || '';

  if (endpoint === 'v3_home_feed' || /\/v3\/feeds\/home\//.test(url)) {
    cleanHomeFeed(obj);
  } else if (endpoint === 'v3_related_modules_for_pin' || /\/v3\/pins\/[^/]+\/related\/modules\//.test(url)) {
    cleanRelatedModules(obj);
  } else if (endpoint === 'v3_get_stela_shopping_carousel' || /\/v3\/visual_search\/stela\/pins\/[^/]+\/module\//.test(url)) {
    cleanShoppingCarousel(obj);
  }

  $done({ body: JSON.stringify(obj) });
}

function mainRequest() {
  var url = $request.url || '';
  url = url.replace(/([?&])force_ads_insertion=true\b/g, '$1force_ads_insertion=false');
  $done({ url: url });
}

if (typeof $response !== 'undefined') {
  mainResponse();
} else {
  mainRequest();
}
