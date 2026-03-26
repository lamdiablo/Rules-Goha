/*
  X / x.com Web ad cleaner for Loon
  Targets observed in uploaded HARs:
  - /i/api/graphql/.../HomeTimeline
  - /i/api/graphql/.../TweetDetail
  - /i/api/1.1/promoted_content/log.json (blocked in plugin rewrite)

  Key observed ad marker in HARs:
  - content.itemContent.promotedMetadata
  - entryId containing "promoted-tweet-"
*/

function safeParse(str) {
  try { return JSON.parse(str); } catch (e) { return null; }
}

function hasPromotedMetadata(node) {
  if (!node || typeof node !== 'object') return false;

  if (typeof node.entryId === 'string' && node.entryId.indexOf('promoted-') !== -1) {
    return true;
  }

  if (node.promotedMetadata || node.promoted_metadata) {
    return true;
  }

  if (node.itemContent && (node.itemContent.promotedMetadata || node.itemContent.promoted_metadata)) {
    return true;
  }

  if (node.content && node.content.itemContent && (node.content.itemContent.promotedMetadata || node.content.itemContent.promoted_metadata)) {
    return true;
  }

  if (node.item && node.item.itemContent && (node.item.itemContent.promotedMetadata || node.item.itemContent.promoted_metadata)) {
    return true;
  }

  return false;
}

function cleanModuleItems(items) {
  if (!Array.isArray(items)) return items;
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (hasPromotedMetadata(it)) continue;
    if (it && it.item && hasPromotedMetadata(it.item)) continue;
    out.push(it);
  }
  return out;
}

function cleanEntries(entries) {
  if (!Array.isArray(entries)) return entries;
  var out = [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || typeof entry !== 'object') {
      out.push(entry);
      continue;
    }

    if (hasPromotedMetadata(entry)) {
      continue;
    }

    if (entry.content && entry.content.items && Array.isArray(entry.content.items)) {
      entry.content.items = cleanModuleItems(entry.content.items);
      if (entry.content.items.length === 0) {
        continue;
      }
    }

    out.push(entry);
  }

  return out;
}

function cleanInstructions(instructions) {
  if (!Array.isArray(instructions)) return instructions;

  for (var i = 0; i < instructions.length; i++) {
    var ins = instructions[i];
    if (!ins || typeof ins !== 'object') continue;

    if (Array.isArray(ins.entries)) {
      ins.entries = cleanEntries(ins.entries);
    }

    if (Array.isArray(ins.moduleItems)) {
      ins.moduleItems = cleanModuleItems(ins.moduleItems);
    }
  }

  return instructions;
}

function cleanPayload(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  try {
    if (obj.data && obj.data.home && obj.data.home.home_timeline_urt) {
      cleanInstructions(obj.data.home.home_timeline_urt.instructions);
    }
  } catch (e) {}

  try {
    if (obj.data && obj.data.threaded_conversation_with_injections_v2) {
      cleanInstructions(obj.data.threaded_conversation_with_injections_v2.instructions);
    }
  } catch (e) {}

  try {
    if (obj.data && obj.data.search_by_raw_query && obj.data.search_by_raw_query.search_timeline && obj.data.search_by_raw_query.search_timeline.timeline) {
      cleanInstructions(obj.data.search_by_raw_query.search_timeline.timeline.instructions);
    }
  } catch (e) {}

  try {
    if (obj.data && obj.data.explore && obj.data.explore.timeline) {
      cleanInstructions(obj.data.explore.timeline.instructions);
    }
  } catch (e) {}

  return obj;
}

var raw = $response.body || '';
var data = safeParse(raw);
if (!data) {
  $done({});
} else {
  var cleaned = cleanPayload(data);
  $done({ body: JSON.stringify(cleaned) });
}
