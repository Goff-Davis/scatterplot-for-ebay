function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    const status = document.getElementById('ebay-scatter-status');

    if (status) {
      status.textContent = 'Could not save — storage full or blocked';
    }
  }
}
