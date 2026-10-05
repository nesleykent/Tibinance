// Asset routing stays separate from the world selection within Tibia Coin.
const picker = document.getElementById('asset');
const asset = new URLSearchParams(location.search).get('asset') === 'tibia-token' ? 'tibia-token' : 'tibia-coin';
picker.value = asset;
picker.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('asset', picker.value);
  url.searchParams.delete('world');
  url.searchParams.delete('side');
  url.searchParams.delete('view');
  location.assign(url);
});
// A module that cannot be fetched (a dropped connection) would otherwise leave the page loading forever.
try {
  await import(asset === 'tibia-token' ? './tibia-token-markets.js?v=20261004-events' : './markets.js?v=20261004-events');
} catch (error) {
  console.error(error);
  const status = document.getElementById('status');
  status.hidden = false;
  status.textContent = 'Markets could not be loaded. Reload the page to try again.';
  document.getElementById('market').setAttribute('aria-busy', 'false');
}
