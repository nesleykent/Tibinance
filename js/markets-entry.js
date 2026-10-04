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
await import(asset === 'tibia-token' ? './tibia-token-markets.js?v=20261004-chart-first' : './markets.js?v=20261004-chart-first');
