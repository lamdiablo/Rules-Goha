/*
  Douyin Web ad cleaner for Loon
  Built from the uploaded HAR: www.douyin.com.har

  Covered by this script:
  1) Feed ad items in /aweme/v1/web/tab/feed/
     Observed markers in HAR:
     - is_ads === true
     - raw_ad_data is non-empty
     - ad_aweme_source > 0
  2) Activity pull endpoint /aweme/v1/web/activity/pull/carnival/
     Best-effort suppression of activity popup by forcing push_control_code = 0

  This script is designed for the web feed captured from www.douyin.com.
  It is not validated against the native Douyin iOS app, because the uploaded HAR
  contains web endpoints rather than native-app endpoints.
*/

function parseJSON(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function hasNonEmptyRawAdData(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0 && v.trim() !== '{}';
  return isObject(v);
}

function hasAdMarker(item) {
  if (!isObject(item)) return false;

  if (item.is_ads === true) return true;

  if (typeof item.ad_aweme_source === 'number' && item.ad_aweme_source > 0) {
    return true;
  }

  if (hasNonEmptyRawAdData(item.raw_ad_data)) return true;

  if (item.ad_info || item.ad_data || item.ad_tag) return true;

  return false;
}

function filterAwemeList(list) {
  if (!Array.isArray(list)) return list;
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    if (hasAdMarker(item)) continue;
    out.push(item);
  }
  return out;
}

function cleanFeedResponse(obj) {
  if (!isObject(obj)) return obj;

  if (Array.isArray(obj.aweme_list)) {
    obj.aweme_list = filterAwemeList(obj.aweme_list);
  }

  if (obj.data && Array.isArray(obj.data.aweme_list)) {
    obj.data.aweme_list = filterAwemeList(obj.data.aweme_list);
  }

  return obj;
}

function cleanCarnivalResponse(obj) {
  if (!isObject(obj)) return obj;
  obj.push_control_code = 0;
  if (typeof obj.status_code === 'undefined') obj.status_code = 0;
  if (typeof obj.status_msg === 'undefined' || obj.status_msg === null) obj.status_msg = 'success';
  return obj;
}

(function main() {
  var url = ($request && $request.url) || '';
  var raw = ($response && $response.body) || '';
  var obj = parseJSON(raw);

  if (!obj) {
    $done({});
    return;
  }

  if (/\/aweme\/v1\/web\/tab\/feed\//.test(url)) {
    obj = cleanFeedResponse(obj);
  } else if (/\/aweme\/v1\/web\/activity\/pull\/carnival\//.test(url)) {
    obj = cleanCarnivalResponse(obj);
  }

  $done({ body: JSON.stringify(obj) });
})();
