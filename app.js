// === PANTRY WITCH APP ===
// Uses Claude claude-sonnet-4-20250514 for recipe generation

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const STORAGE_KEY = 'pantry-witch-v1';

// ── State ──────────────────────────────────────────────────────────────────
let state = {
  pantry: [],       // { id, name, category, perishable, expiresAt, addedAt }
  recipes: [],      // generated (not saved)
  library: [],      // saved
  activeTab: 'pantry',
  catFilter: 'all',
  libTagFilter: null,
};

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) Object.assign(state, JSON.parse(saved));
  } catch(e) {}
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      pantry: state.pantry,
      library: state.library,
    }));
  } catch(e) {}
}

// ── ID generation ──────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

// ── Category icons ─────────────────────────────────────────────────────────
const CAT_ICONS = {
  produce: '🌿', dairy: '🥛', protein: '🥩',
  pantry: '🫙', spice: '✨', grain: '🌾',
  condiment: '🫒', other: '📦',
};

// ── Days until expiry ──────────────────────────────────────────────────────
function daysUntil(ts) {
  if (!ts) return null;
  return Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
}

// ── Render Pantry ──────────────────────────────────────────────────────────
function renderPantry() {
  const { pantry, catFilter } = state;
  const search = document.getElementById('pantry-search').value.toLowerCase();

  // Category filter buttons
  const cats = ['all', ...new Set(pantry.map(i => i.category))];
  document.getElementById('category-filters').innerHTML = cats.map(c => `
    <button class="cat-filter ${catFilter === c ? 'active' : ''}" data-cat="${c}">
      ${c === 'all' ? '✦ All' : (CAT_ICONS[c] || '') + ' ' + c}
    </button>
  `).join('');

  // Filter items
  let items = pantry.filter(i => {
    if (catFilter !== 'all' && i.category !== catFilter) return false;
    if (search && !i.name.toLowerCase().includes(search)) return false;
    return true;
  });

  // Sort: expired → expiring → normal
  items.sort((a, b) => {
    const da = daysUntil(a.expiresAt);
    const db = daysUntil(b.expiresAt);
    if (da !== null && db !== null) return da - db;
    if (da !== null) return -1;
    if (db !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  const list = document.getElementById('pantry-list');
  const empty = document.getElementById('pantry-empty');

  if (!items.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = items.map(item => {
    const days = daysUntil(item.expiresAt);
    let expiryClass = '', expiryText = '';
    let cardClass = '';
    if (days !== null) {
      if (days <= 0) { expiryClass = 'danger'; expiryText = 'Expired!'; cardClass = 'expired'; }
      else if (days <= 2) { expiryClass = 'warn'; expiryText = `${days}d left`; cardClass = 'expiring-soon'; }
      else { expiryText = `${days}d left`; }
    }
    return `
      <div class="pantry-item ${cardClass}" data-id="${item.id}">
        <button class="item-remove" data-id="${item.id}" title="Remove">✕</button>
        <div class="item-top">
          <span class="item-name">${esc(item.name)}</span>
          <span class="item-cat">${CAT_ICONS[item.category] || ''} ${item.category}</span>
        </div>
        ${expiryText ? `<span class="item-expiry ${expiryClass}">⏳ ${expiryText}</span>` : ''}
      </div>
    `;
  }).join('');

  // Perishable alerts
  const alertItems = pantry.filter(i => i.expiresAt && daysUntil(i.expiresAt) <= 3);
  const alertsBox = document.getElementById('perishable-alerts');
  if (alertItems.length) {
    alertsBox.classList.remove('hidden');
    document.getElementById('alerts-list').innerHTML = alertItems.map(i => {
      const d = daysUntil(i.expiresAt);
      const label = d <= 0 ? 'Expired' : d === 1 ? 'Tomorrow' : `${d} days`;
      const cls = d <= 1 ? '' : 'soon';
      return `<div class="alert-item"><span>${esc(i.name)}</span><span class="alert-badge ${cls}">${label}</span></div>`;
    }).join('');
  } else {
    alertsBox.classList.add('hidden');
  }
}

// ── Add pantry item ────────────────────────────────────────────────────────
function addPantryItem() {
  const name = document.getElementById('item-name').value.trim();
  if (!name) return;
  const category = document.getElementById('item-category').value;
  const perishable = document.getElementById('item-perishable').checked;
  const days = parseInt(document.getElementById('item-days').value) || 7;
  const expiresAt = perishable ? Date.now() + days * 86400000 : null;

  state.pantry.push({ id: uid(), name, category, perishable, expiresAt, addedAt: Date.now() });
  document.getElementById('item-name').value = '';
  document.getElementById('item-perishable').checked = false;
  document.getElementById('expiry-group').classList.add('hidden');
  saveState();
  renderPantry();
}

// ── Generate Recipe ────────────────────────────────────────────────────────
const LOADING_MSGS = [
  'The witch is consulting the pantry…',
  'Sorting herbs by moonlight…',
  'Channeling what needs to be used up…',
  'Something good is coming together…',
];

async function generateRecipe() {
  if (!state.pantry.length) {
    alert('Add some ingredients first.');
    return;
  }

  const overlay = document.getElementById('loading');
  const loadingText = document.getElementById('loading-text');
  overlay.classList.remove('hidden');

  let msgIdx = 0;
  loadingText.textContent = LOADING_MSGS[0];
  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % LOADING_MSGS.length;
    loadingText.textContent = LOADING_MSGS[msgIdx];
  }, 2000);

  // Prioritize expiring items
  const expiringItems = state.pantry.filter(i => i.expiresAt && daysUntil(i.expiresAt) <= 3);
  const allItems = state.pantry.map(i => {
    const d = daysUntil(i.expiresAt);
    return `${i.name} (${i.category}${d !== null ? `, expires in ${Math.max(0,d)} days` : ''})`;
  }).join(', ');

  const urgentNote = expiringItems.length
    ? `PRIORITIZE USING: ${expiringItems.map(i => i.name).join(', ')} (expiring soon).`
    : '';

  const prompt = `You are a creative recipe generator. The user has these ingredients on hand:
${allItems}

${urgentNote}

Generate ONE complete recipe they can make from these (or most of them). The recipe should feel rustic, home-cooked, and delicious — think farmhouse kitchen, not restaurant.

Respond ONLY with a valid JSON object (no markdown, no backticks) with this exact structure:
{
  "title": "Recipe name",
  "description": "One enticing sentence describing the dish",
  "servings": "number of servings",
  "prepTime": "e.g. 10 minutes",
  "cookTime": "e.g. 30 minutes",
  "difficulty": "Easy | Medium | Challenging",
  "tags": {
    "genre": ["e.g. Italian", "Comfort Food", "Vegetarian"],
    "weather": ["e.g. Cold Day", "Summer", "Any Season"],
    "situation": ["e.g. Weeknight Dinner", "Impressive Guest Meal", "Hangover Food"]
  },
  "ingredients": ["1 cup butter", "2 cloves garlic, minced"],
  "steps": ["Step one instruction", "Step two instruction"],
  "note": "One tip, variation, or witch's hint (optional, or null)"
}`;

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const recipe = JSON.parse(clean);
    recipe.id = uid();
    recipe.generatedAt = Date.now();

    state.recipes.unshift(recipe);
    clearInterval(msgInterval);
    overlay.classList.add('hidden');
    openRecipeModal(recipe);
    renderRecipesTab();
    switchTab('recipes');
  } catch (err) {
    clearInterval(msgInterval);
    overlay.classList.add('hidden');
    console.error(err);
    alert('Something went wrong conjuring the recipe. Check your API key or try again.');
  }
}

// ── Recipe Card HTML ───────────────────────────────────────────────────────
function recipeCardHTML(recipe, forShare = false) {
  const allTags = [
    ...(recipe.tags?.genre || []).map(t => `<span class="tag">${esc(t)}</span>`),
    ...(recipe.tags?.weather || []).map(t => `<span class="tag weather">☁ ${esc(t)}</span>`),
    ...(recipe.tags?.situation || []).map(t => `<span class="tag situation">◆ ${esc(t)}</span>`),
  ].join('');

  return `
    <div class="recipe-card">
      <div class="recipe-card-header">
        <div class="recipe-card-title">${esc(recipe.title)}</div>
        <div class="recipe-card-sub">${esc(recipe.description)}</div>
        <div class="recipe-card-tags">${allTags}</div>
      </div>
      <div class="recipe-meta">
        <div class="meta-item"><span class="meta-label">Serves</span><span class="meta-value">${esc(recipe.servings)}</span></div>
        <div class="meta-item"><span class="meta-label">Prep</span><span class="meta-value">${esc(recipe.prepTime)}</span></div>
        <div class="meta-item"><span class="meta-label">Cook</span><span class="meta-value">${esc(recipe.cookTime)}</span></div>
        <div class="meta-item"><span class="meta-label">Difficulty</span><span class="meta-value">${esc(recipe.difficulty)}</span></div>
      </div>
      <div class="recipe-section-title">Ingredients</div>
      <ul class="ingredients-list">${recipe.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
      <div class="recipe-section-title">Method</div>
      <ol class="steps-list">${recipe.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${recipe.note ? `<div class="recipe-note">🌿 ${esc(recipe.note)}</div>` : ''}
    </div>
  `;
}

// ── Modal ──────────────────────────────────────────────────────────────────
let modalRecipe = null;

function openRecipeModal(recipe) {
  modalRecipe = recipe;
  document.getElementById('modal-card').innerHTML = recipeCardHTML(recipe);
  document.getElementById('recipe-modal').classList.remove('hidden');

  const inLibrary = state.library.some(r => r.id === recipe.id);
  const saveBtn = document.getElementById('modal-save');
  saveBtn.textContent = inLibrary ? '✓ Saved' : 'Save to Library';
  saveBtn.disabled = inLibrary;
}

function closeModal() {
  document.getElementById('recipe-modal').classList.add('hidden');
  modalRecipe = null;
}

// ── Render tabs ────────────────────────────────────────────────────────────
function renderRecipesTab() {
  const container = document.getElementById('recipes-container');
  if (!state.recipes.length) {
    container.innerHTML = `<div class="empty-state"><span>🌙</span><p>Head to your pantry and conjure a recipe first.</p></div>`;
    return;
  }
  container.innerHTML = `<div class="recipe-grid">${state.recipes.map(r => recipeThumbnailHTML(r)).join('')}</div>`;
}

function renderLibraryTab() {
  const container = document.getElementById('library-container');
  const empty = document.getElementById('library-empty');
  const search = document.getElementById('library-search').value.toLowerCase();

  let items = state.library;
  if (state.libTagFilter) {
    items = items.filter(r => {
      const allTags = [...(r.tags?.genre||[]), ...(r.tags?.weather||[]), ...(r.tags?.situation||[])];
      return allTags.some(t => t.toLowerCase() === state.libTagFilter.toLowerCase());
    });
  }
  if (search) {
    items = items.filter(r => r.title.toLowerCase().includes(search) || r.description.toLowerCase().includes(search));
  }

  // Build tag filter buttons
  const allTags = [...new Set(state.library.flatMap(r => [
    ...(r.tags?.genre||[]), ...(r.tags?.weather||[]), ...(r.tags?.situation||[])
  ]))];
  document.getElementById('tag-filters').innerHTML = allTags.map(t => `
    <button class="tag-filter-btn ${state.libTagFilter === t ? 'active' : ''}" data-tag="${esc(t)}">${esc(t)}</button>
  `).join('');

  if (!items.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  container.innerHTML = items.map(r => recipeThumbnailHTML(r)).join('');
}

function recipeThumbnailHTML(r) {
  const tags = [
    ...(r.tags?.genre || []).map(t => `<span class="tag">${esc(t)}</span>`),
    ...(r.tags?.weather || []).map(t => `<span class="tag weather">☁ ${esc(t)}</span>`),
    ...(r.tags?.situation || []).map(t => `<span class="tag situation">◆ ${esc(t)}</span>`),
  ].join('');
  return `
    <div class="recipe-thumb" data-recipe-id="${r.id}">
      <div class="recipe-thumb-title">${esc(r.title)}</div>
      <div class="recipe-tags">${tags}</div>
      <div class="recipe-thumb-desc">${esc(r.description)}</div>
    </div>
  `;
}

// ── Sharing ────────────────────────────────────────────────────────────────
function buildShareText(recipe) {
  const tags = [
    ...(recipe.tags?.genre||[]),
    ...(recipe.tags?.weather||[]),
    ...(recipe.tags?.situation||[]),
  ].join(' · ');

  return `🌿 ${recipe.title}

${recipe.description}

${tags ? `Tags: ${tags}\n` : ''}Serves ${recipe.servings} · Prep ${recipe.prepTime} · Cook ${recipe.cookTime} · ${recipe.difficulty}

INGREDIENTS
${recipe.ingredients.map(i => `• ${i}`).join('\n')}

METHOD
${recipe.steps.map((s, i) => `${i+1}. ${s}`).join('\n')}
${recipe.note ? `\n🌿 ${recipe.note}` : ''}

Made with The Pantry Witch`;
}

function shareViaText(recipe) {
  const text = encodeURIComponent(buildShareText(recipe));
  window.open(`sms:?body=${text}`);
}

function shareViaEmail(recipe) {
  const subject = encodeURIComponent(`Recipe: ${recipe.title}`);
  const body = encodeURIComponent(buildShareText(recipe));
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
  if (tab === 'pantry') renderPantry();
  if (tab === 'recipes') renderRecipesTab();
  if (tab === 'library') renderLibraryTab();
}

// ── Escape HTML ────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event delegation ───────────────────────────────────────────────────────
document.addEventListener('click', e => {
  // Tab buttons
  if (e.target.matches('.tab-btn')) { switchTab(e.target.dataset.tab); return; }

  // Category filter
  if (e.target.matches('.cat-filter')) {
    state.catFilter = e.target.dataset.cat;
    renderPantry();
    return;
  }

  // Remove pantry item
  if (e.target.matches('.item-remove')) {
    state.pantry = state.pantry.filter(i => i.id !== e.target.dataset.id);
    saveState();
    renderPantry();
    return;
  }

  // Generate recipe
  if (e.target.matches('#generate-btn') || e.target.closest('#generate-btn')) {
    generateRecipe();
    return;
  }

  // Open recipe modal from thumb
  if (e.target.closest('.recipe-thumb')) {
    const id = e.target.closest('.recipe-thumb').dataset.recipeId;
    const recipe = [...state.recipes, ...state.library].find(r => r.id === id);
    if (recipe) openRecipeModal(recipe);
    return;
  }

  // Modal close
  if (e.target.matches('.modal-close') || e.target.matches('.modal-overlay')) { closeModal(); return; }

  // Save to library
  if (e.target.matches('#modal-save') && modalRecipe) {
    if (!state.library.some(r => r.id === modalRecipe.id)) {
      state.library.unshift(modalRecipe);
      saveState();
      renderLibraryTab();
    }
    e.target.textContent = '✓ Saved';
    e.target.disabled = true;
    return;
  }

  // Share via text
  if (e.target.matches('#modal-share-text') && modalRecipe) { shareViaText(modalRecipe); return; }

  // Share via email
  if (e.target.matches('#modal-share-email') && modalRecipe) { shareViaEmail(modalRecipe); return; }

  // Generate new recipe
  if (e.target.matches('#modal-generate-new')) { closeModal(); generateRecipe(); return; }

  // Library tag filter
  if (e.target.matches('.tag-filter-btn')) {
    const tag = e.target.dataset.tag;
    state.libTagFilter = state.libTagFilter === tag ? null : tag;
    renderLibraryTab();
    return;
  }
});

// Add item button
document.getElementById('add-item-btn').addEventListener('click', addPantryItem);
document.getElementById('item-name').addEventListener('keydown', e => { if (e.key === 'Enter') addPantryItem(); });

// Perishable checkbox
document.getElementById('item-perishable').addEventListener('change', e => {
  document.getElementById('expiry-group').classList.toggle('hidden', !e.target.checked);
});

// Pantry search
document.getElementById('pantry-search').addEventListener('input', renderPantry);
document.getElementById('library-search').addEventListener('input', renderLibraryTab);

// ── Boot ───────────────────────────────────────────────────────────────────
loadState();
renderPantry();
renderLibraryTab();
