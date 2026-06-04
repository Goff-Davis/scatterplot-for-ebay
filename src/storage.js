function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
}
