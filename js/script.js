/**
 * PhoneBook Application — script.js
 * Uses JSONPlaceholder (https://jsonplaceholder.typicode.com/users) as the mock API.
 * Since JSONPlaceholder is read-only (POST/PUT/DELETE return fake success responses),
 * we maintain a local state array that mirrors what a real API would provide.
 *
 * Concepts demonstrated:
 *  - Fetch API with async/await
 *  - CRUD operations (Create, Read, Update, Delete)
 *  - Input validation & user-friendly error messages
 *  - Dynamic DOM manipulation without page reloads
 *  - API error handling (network errors, 4xx, 5xx)
 *  - Search & alphabetical filtering
 */

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const API_BASE = 'https://jsonplaceholder.typicode.com/users';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let contacts = [];          // Local mirror of all contacts
let nextId   = 11;          // JSONPlaceholder seeds 10 users; we continue from 11
let editingId = null;       // ID of contact being edited (null = add mode)
let deleteTarget = null;    // ID pending deletion confirmation

// ─────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────
const form          = document.getElementById('contact-form');
const formTitle     = document.getElementById('form-title');
const submitBtn     = document.getElementById('submit-btn');
const submitLabel   = document.getElementById('submit-label');
const cancelBtn     = document.getElementById('cancel-btn');
const nameInput     = document.getElementById('contact-name');
const phoneInput    = document.getElementById('contact-phone');
const emailInput    = document.getElementById('contact-email');
const contactIdInput= document.getElementById('contact-id');
const contactsList  = document.getElementById('contacts-list');
const loader        = document.getElementById('loader');
const emptyState    = document.getElementById('empty-state');
const searchInput   = document.getElementById('search-input');
const alphaFilter   = document.getElementById('alpha-filter');
const contactCount  = document.getElementById('contact-count');
const statusDot     = document.getElementById('status-dot');
const statusLabel   = document.getElementById('status-label');
const toast         = document.getElementById('toast');
const modalOverlay  = document.getElementById('modal-overlay');
const modalMsg      = document.getElementById('modal-msg');
const modalConfirm  = document.getElementById('modal-confirm');
const modalCancel   = document.getElementById('modal-cancel');

// ─────────────────────────────────────────────
// TOAST NOTIFICATION
// ─────────────────────────────────────────────
let toastTimer;
function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

// ─────────────────────────────────────────────
// API STATUS INDICATOR
// ─────────────────────────────────────────────
function setStatus(state) {
  if (state === 'online') {
    statusDot.className = 'status-dot online';
    statusLabel.textContent = 'API connected';
  } else if (state === 'offline') {
    statusDot.className = 'status-dot offline';
    statusLabel.textContent = 'API unreachable';
  } else {
    statusDot.className = 'status-dot';
    statusLabel.textContent = 'Connecting…';
  }
}

// ─────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────

/**
 * Generic fetch wrapper with error handling.
 * Throws a structured error on non-2xx responses.
 */
async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error');
    const err = new Error(`HTTP ${response.status}: ${errorBody}`);
    err.status = response.status;
    throw err;
  }

  // 204 No Content — no body to parse
  if (response.status === 204) return null;
  return response.json();
}

/**
 * Normalize raw API user data into our contact shape.
 */
function normalizeContact(raw) {
  return {
    id:    raw.id,
    name:  raw.name,
    phone: raw.phone || '',
    email: raw.email || '',
  };
}

// ─────────────────────────────────────────────
// CRUD OPERATIONS
// ─────────────────────────────────────────────

/** Fetch all contacts from API */
async function fetchContacts() {
  showLoader(true);
  try {
    const data = await apiFetch(API_BASE);
    contacts = data.map(normalizeContact);
    setStatus('online');
    renderContacts();
  } catch (err) {
    setStatus('offline');
    handleApiError(err, 'Failed to fetch contacts.');
    renderContacts(); // render empty state
  } finally {
    showLoader(false);
  }
}

/** Add a new contact via POST */
async function createContact(payload) {
  setFormBusy(true);
  try {
    const data = await apiFetch(API_BASE, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // JSONPlaceholder returns id=11 for all POSTs; we assign a unique local ID
    const newContact = { ...payload, id: nextId++ };
    contacts.unshift(newContact);
    renderContacts();
    resetForm();
    showToast(`✓ ${newContact.name} added successfully.`, 'success');
  } catch (err) {
    handleApiError(err, 'Failed to add contact. Please try again.');
  } finally {
    setFormBusy(false);
  }
}

/** Update an existing contact via PUT */
async function updateContact(id, payload) {
  setFormBusy(true);
  try {
    await apiFetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ id, ...payload }),
    });
    // Update local state
    contacts = contacts.map(c => c.id === id ? { id, ...payload } : c);
    renderContacts();
    resetForm();
    showToast(`✓ ${payload.name} updated.`, 'success');
  } catch (err) {
    handleApiError(err, 'Failed to update contact. Please try again.');
  } finally {
    setFormBusy(false);
  }
}

/** Delete a contact via DELETE */
async function deleteContact(id) {
  try {
    await apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    const removed = contacts.find(c => c.id === id);
    contacts = contacts.filter(c => c.id !== id);
    renderContacts();
    showToast(`✓ ${removed?.name ?? 'Contact'} deleted.`, 'success');
  } catch (err) {
    handleApiError(err, 'Failed to delete contact. Please try again.');
  }
}

// ─────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────
function handleApiError(err, fallbackMsg) {
  let userMessage = fallbackMsg;

  if (!navigator.onLine) {
    userMessage = 'No internet connection. Please check your network.';
  } else if (err.name === 'TypeError') {
    // fetch() threw — network-level failure
    userMessage = 'Network error. Could not reach the server.';
  } else if (err.status === 404) {
    userMessage = 'Resource not found (404). The contact may have been removed.';
  } else if (err.status === 500) {
    userMessage = 'Server error (500). Please try again later.';
  } else if (err.status >= 400 && err.status < 500) {
    userMessage = `Request error (${err.status}). Please check your input.`;
  }

  showToast(`✗ ${userMessage}`, 'error');
  console.error('[PhoneBook API Error]', err);
}

// ─────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────
const VALIDATORS = {
  name(val) {
    if (!val.trim()) return 'Name is required.';
    if (val.trim().length < 2) return 'Name must be at least 2 characters.';
    if (val.trim().length > 60) return 'Name must be under 60 characters.';
    return '';
  },
  phone(val) {
    if (!val.trim()) return 'Phone number is required.';
    // Allow +, digits, spaces, dashes, parens; min 7 digits
    const digits = val.replace(/\D/g, '');
    if (digits.length < 7) return 'Enter a valid phone number (min 7 digits).';
    if (digits.length > 15) return 'Phone number too long (max 15 digits).';
    if (!/^[\d\s\+\-\(\)]+$/.test(val.trim())) return 'Invalid characters in phone number.';
    return '';
  },
  email(val) {
    if (!val.trim()) return 'Email address is required.';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val.trim())) return 'Enter a valid email address.';
    return '';
  },
};

function validateForm() {
  const errors = {
    name:  VALIDATORS.name(nameInput.value),
    phone: VALIDATORS.phone(phoneInput.value),
    email: VALIDATORS.email(emailInput.value),
  };

  document.getElementById('error-name').textContent  = errors.name;
  document.getElementById('error-phone').textContent = errors.phone;
  document.getElementById('error-email').textContent = errors.email;

  nameInput.classList.toggle('invalid', !!errors.name);
  phoneInput.classList.toggle('invalid', !!errors.phone);
  emailInput.classList.toggle('invalid', !!errors.email);

  return !errors.name && !errors.phone && !errors.email;
}

// Clear individual field error on input
function clearFieldError(input, errorId) {
  input.classList.remove('invalid');
  document.getElementById(errorId).textContent = '';
}

nameInput.addEventListener('input',  () => clearFieldError(nameInput,  'error-name'));
phoneInput.addEventListener('input', () => clearFieldError(phoneInput, 'error-phone'));
emailInput.addEventListener('input', () => clearFieldError(emailInput, 'error-email'));

// ─────────────────────────────────────────────
// FORM LOGIC
// ─────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const payload = {
    name:  nameInput.value.trim(),
    phone: phoneInput.value.trim(),
    email: emailInput.value.trim(),
  };

  if (editingId !== null) {
    await updateContact(editingId, payload);
  } else {
    await createContact(payload);
  }
});

cancelBtn.addEventListener('click', resetForm);

function resetForm() {
  editingId = null;
  form.reset();
  contactIdInput.value = '';
  formTitle.textContent = 'Add Contact';
  submitLabel.textContent = 'Add Contact';
  submitBtn.querySelector('.btn-icon').textContent = '+';
  cancelBtn.style.display = 'none';
  // Clear validation states
  ['name', 'phone', 'email'].forEach(f => {
    document.getElementById(`error-${f}`).textContent = '';
    document.getElementById(`contact-${f}`).classList.remove('invalid');
  });
}

function populateFormForEdit(contact) {
  editingId = contact.id;
  nameInput.value  = contact.name;
  phoneInput.value = contact.phone;
  emailInput.value = contact.email;
  contactIdInput.value = contact.id;
  formTitle.textContent = 'Edit Contact';
  submitLabel.textContent = 'Save Changes';
  submitBtn.querySelector('.btn-icon').textContent = '✎';
  cancelBtn.style.display = 'inline-flex';
  nameInput.focus();
}

function setFormBusy(busy) {
  submitBtn.disabled = busy;
  submitLabel.textContent = busy
    ? (editingId ? 'Saving…' : 'Adding…')
    : (editingId ? 'Save Changes' : 'Add Contact');
}

// ─────────────────────────────────────────────
// SEARCH & FILTER
// ─────────────────────────────────────────────
function getFilteredContacts() {
  const query  = searchInput.value.trim().toLowerCase();
  const range  = alphaFilter.value;

  return contacts.filter(c => {
    // Text search
    const matchSearch = !query || c.name.toLowerCase().includes(query);
    // Alpha filter
    let matchAlpha = true;
    if (range) {
      const firstChar = c.name.trim()[0]?.toUpperCase() ?? '';
      const [start, end] = range.split('-');
      matchAlpha = firstChar >= start && firstChar <= end;
    }
    return matchSearch && matchAlpha;
  });
}

searchInput.addEventListener('input', renderContacts);
alphaFilter.addEventListener('change', renderContacts);

// ─────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────
function renderContacts() {
  const filtered = getFilteredContacts();
  contactCount.textContent = `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`;

  contactsList.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';
  const query = searchInput.value.trim();

  filtered.forEach(contact => {
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.dataset.id = contact.id;

    const initials = contact.name
      .split(' ')
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const highlightedName = highlight(contact.name, query);

    card.innerHTML = `
      <div class="contact-info">
        <div class="contact-name">
          <span class="contact-avatar">${initials}</span>${highlightedName}
        </div>
        <div class="contact-phone">📞 ${escapeHtml(contact.phone)}</div>
        <div class="contact-email">✉ ${escapeHtml(contact.email)}</div>
      </div>
      <div class="contact-actions">
        <button class="btn-icon-only btn-edit" title="Edit contact" aria-label="Edit ${escapeHtml(contact.name)}">✎</button>
        <button class="btn-icon-only btn-delete" title="Delete contact" aria-label="Delete ${escapeHtml(contact.name)}">✕</button>
      </div>
    `;

    card.querySelector('.btn-edit').addEventListener('click', () => {
      populateFormForEdit(contact);
      // On mobile, scroll to form
      document.querySelector('.panel-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    card.querySelector('.btn-delete').addEventListener('click', () => {
      openDeleteModal(contact);
    });

    contactsList.appendChild(card);
  });
}

/** Highlight matching search text */
function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeRegex(query);
  const regex = new RegExp(`(${escaped})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showLoader(show) {
  loader.style.display = show ? 'flex' : 'none';
  if (show) emptyState.style.display = 'none';
}

// ─────────────────────────────────────────────
// DELETE MODAL
// ─────────────────────────────────────────────
function openDeleteModal(contact) {
  deleteTarget = contact.id;
  modalMsg.textContent = `Are you sure you want to delete "${contact.name}"? This action cannot be undone.`;
  modalOverlay.style.display = 'flex';
}

function closeDeleteModal() {
  deleteTarget = null;
  modalOverlay.style.display = 'none';
}

modalConfirm.addEventListener('click', async () => {
  if (deleteTarget === null) return;
  const id = deleteTarget;
  closeDeleteModal();
  await deleteContact(id);
});

modalCancel.addEventListener('click', closeDeleteModal);

// Close modal on overlay click
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeDeleteModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.style.display !== 'none') {
    closeDeleteModal();
  }
});

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  fetchContacts();
});