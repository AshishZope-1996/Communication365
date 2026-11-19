const campaignApiBase = 'http://127.0.0.1:8001';

const historyState = {
  filter: 'all',
  search: ''
};

let lastCampaignHistory = [];
let campaignConfirmationResolver = null;
let lastModalTrigger = null;

function safeText(value) {
  return String(value ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getFilteredHistory(history) {
  const query = historyState.search.trim().toLowerCase();

  return history.filter((item) => {
    const status = String(item.status || '').toLowerCase();
    const matchesStatus = historyState.filter === 'all'
      || status === historyState.filter
      || (historyState.filter === 'accepted' && status === 'success');
    const haystack = [item.timestamp, item.sent_to, item.campaign_type, item.status, item.error_message].join(' ').toLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    return matchesStatus && matchesSearch;
  });
}

function renderCampaignHistory(body, history) {
  lastCampaignHistory = history;
  const filtered = getFilteredHistory(history);

  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="5">No matching campaign history found.</td></tr>';
    return;
  }

  body.innerHTML = filtered.map((item) => {
    const status = String(item.status || 'UNKNOWN').toUpperCase();
    const statusClass = status.toLowerCase();

    return `
      <tr>
        <td>${safeText(item.timestamp)}</td>
        <td>${safeText(item.sent_to)}</td>
        <td>${safeText(item.campaign_type)}</td>
        <td><span class="status-badge status-${statusClass}">${status}</span></td>
        <td>${safeText(item.error_message || '—')}</td>
      </tr>
    `;
  }).join('');
}

async function fetchCampaignJson(path) {
  const response = await fetch(`${campaignApiBase}${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function setStatusMessage(message, tone = 'info') {
  const statusBox = document.getElementById('campaignStatus');
  if (!statusBox) return;

  statusBox.className = 'status-box';
  statusBox.classList.add(`status-${tone}`);
  statusBox.innerHTML = `<i class="fa-solid ${tone === 'success' ? 'fa-circle-check' : tone === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'}"></i> ${safeText(message)}`;
}

function getSelectedTemplate() {
  const templateSelect = document.getElementById('templateSelect');
  return templateSelect?.selectedOptions?.[0];
}

async function openTemplatePreview() {
  const selected = getSelectedTemplate();
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('emailPreviewFrame');
  const subject = document.getElementById('previewSubject');

  if (!selected?.value || !modal || !frame) {
    setStatusMessage('Choose an email template before opening the preview.', 'error');
    return;
  }

  openWorkspaceModal(modal);
  frame.srcdoc = '<p style="font:16px sans-serif;padding:24px;color:#68738d">Generating a secure preview...</p>';
  if (subject) subject.textContent = document.getElementById('campaignSubject')?.value || selected.dataset.subject || 'Campaign message';
  try {
    const data = await fetchCampaignJson(`/preview?template_id=${encodeURIComponent(selected.value)}`);
    frame.srcdoc = data.html || '<p style="font:16px sans-serif;padding:24px">This template has no preview content.</p>';
  } catch (error) {
    frame.srcdoc = '<p style="font:16px sans-serif;padding:24px;color:#b42318">The template preview is unavailable.</p>';
    setStatusMessage('Unable to load the selected email preview.', 'error');
  }
}

function closeTemplatePreview() {
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('emailPreviewFrame');
  if (modal) modal.hidden = true;
  if (frame) frame.srcdoc = '';
  updateModalScrollLock();
}

function attachPreviewControls() {
  const previewButton = document.getElementById('previewCampaignBtn');
  const closeButton = document.getElementById('closePreviewBtn');
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('emailPreviewFrame');

  previewButton?.addEventListener('click', openTemplatePreview);
  closeButton?.addEventListener('click', closeTemplatePreview);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeTemplatePreview();
  });
  document.querySelectorAll('[data-preview-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-preview-mode]').forEach((item) => item.classList.toggle('active', item === button));
      frame?.classList.remove('preview-tablet', 'preview-mobile');
      if (button.dataset.previewMode !== 'desktop') frame?.classList.add(`preview-${button.dataset.previewMode}`);
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.hidden) closeTemplatePreview();
  });
}

function updateModalScrollLock() {
  const hasOpenModal = document.querySelector('.workspace-modal:not([hidden]), .preview-modal:not([hidden])');
  document.body.classList.toggle('modal-open', Boolean(hasOpenModal));
}

function openWorkspaceModal(modal) {
  if (!modal) return;
  lastModalTrigger = document.activeElement;
  modal.hidden = false;
  updateModalScrollLock();
  modal.querySelector('input, select, textarea, button')?.focus();
}

function closeWorkspaceModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  updateModalScrollLock();
  if (!document.body.classList.contains('modal-open')) lastModalTrigger?.focus();
}

function showToast(message, tone = 'success') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  const icon = tone === 'error' ? 'fa-circle-exclamation' : tone === 'info' ? 'fa-circle-info' : 'fa-circle-check';
  toast.className = `toast-message ${tone}`;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${safeText(message)}</span>`;
  region.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('removing');
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

function attachModalDismissal() {
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeWorkspaceModal(button.closest('.workspace-modal')));
  });
  document.querySelectorAll('.workspace-modal').forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal && modal.id !== 'campaignConfirmModal') closeWorkspaceModal(modal);
    });
  });
  document.addEventListener('keydown', (event) => {
    const activeModal = document.querySelector('.workspace-modal:not([hidden])');
    if (event.key === 'Escape') {
      if (activeModal?.id === 'campaignConfirmModal') {
        finishCampaignConfirmation(false);
      } else if (activeModal) {
        closeWorkspaceModal(activeModal);
      }
      return;
    }
    if (event.key === 'Tab' && activeModal) {
      const focusable = [...activeModal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

function initSidebar() {
  const toggle = document.getElementById('sidebarToggle');
  let savedState = false;
  try {
    savedState = localStorage.getItem('communication360.sidebarCollapsed') === 'true';
  } catch (error) {
    showToast('Navigation will use its default expanded state because browser storage is unavailable.', 'info');
  }
  document.body.classList.toggle('sidebar-collapsed', savedState);
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!savedState));
    toggle.setAttribute('aria-label', savedState ? 'Expand navigation' : 'Collapse navigation');
    toggle.title = savedState ? 'Expand navigation' : 'Collapse navigation';
    toggle.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
      toggle.title = collapsed ? 'Expand navigation' : 'Collapse navigation';
      try {
        localStorage.setItem('communication360.sidebarCollapsed', String(collapsed));
      } catch (error) {
        showToast('Your navigation preference could not be saved in this browser.', 'error');
      }
    });
  }
}

function attachWorkspaceNavigation() {
  document.querySelectorAll('[data-scroll-target]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth' }));
  });
  const navLinks = [...document.querySelectorAll('.page-nav .nav-link')];
  const setActiveLink = (hash) => {
    navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === hash));
  };
  const updateActiveLink = () => {
    setActiveLink(window.location.hash || '#overview');
  };
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      setActiveLink(link.getAttribute('href'));
    });
  });
  window.addEventListener('hashchange', updateActiveLink);
  updateActiveLink();
  const main = document.querySelector('.app-main');
  const sections = [...document.querySelectorAll('.app-main > section[id]')];
  if (main) {
    main.addEventListener('scroll', () => {
      const bounds = main.getBoundingClientRect();
      const contentTop = bounds.top + (document.querySelector('.topbar')?.offsetHeight || 0);
      const current = sections.reduce((selected, section) => {
        const rect = section.getBoundingClientRect();
        const visible = Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, contentTop));
        return visible >= selected.visible ? { section, visible } : selected;
      }, { section: null, visible: 0 }).section;
      if (current) setActiveLink(`#${current.id}`);
    }, { passive: true });
  }
}

function populateCampaignOptions(data) {
  const typeSelect = document.getElementById('campaignTypeSelect');
  const templateSelect = document.getElementById('templateSelect');
  const subjectInput = document.getElementById('campaignSubject');
  const details = document.getElementById('templateDetails');
  const detailsText = document.getElementById('templateDetailsText');

  if (!typeSelect || !templateSelect || !subjectInput) {
    return;
  }

  typeSelect.innerHTML = '<option value="">Select campaign</option>';
  templateSelect.innerHTML = '<option value="">Select template</option>';
  subjectInput.value = '';
  if (details) details.hidden = true;
  const campaigns = data.campaigns || [];

  campaigns.forEach((campaign) => {
    const option = document.createElement('option');
    option.value = campaign.key;
    option.textContent = campaign.label;
    typeSelect.appendChild(option);
  });

  const templates = data.templates || [];

  const renderTemplates = (campaignType = '') => {
    templateSelect.innerHTML = '<option value="">Select template</option>';
    const filteredTemplates = templates.filter((template) => !campaignType || template.campaign === campaignType);
    templateSelect.disabled = filteredTemplates.length === 0;
    filteredTemplates.forEach((template) => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.label;
      option.dataset.subject = template.subject || '';
      option.dataset.file = template.template || '';
      option.dataset.pdfPath = template.pdfPath || '';
      option.dataset.campaignType = template.campaign || '';
      templateSelect.appendChild(option);
    });
  };

  renderTemplates(typeSelect.value);

  typeSelect.onchange = () => {
    renderTemplates(typeSelect.value);
    subjectInput.value = '';
    if (details) details.hidden = true;
  };

  templateSelect.onchange = () => {
    let selected = templateSelect.selectedOptions[0];
    if (selected?.value) {
      if (!typeSelect.value) {
        const selectedTemplateId = selected.value;
        typeSelect.value = selected.dataset.campaignType || '';
        renderTemplates(typeSelect.value);
        templateSelect.value = selectedTemplateId;
        selected = templateSelect.selectedOptions[0];
      }
      subjectInput.value = selected.dataset.subject || '';
      const attachment = selected.dataset.pdfPath
        ? selected.dataset.pdfPath.split(/[\\/]/).pop()
        : 'No attachment configured';
      if (detailsText) {
        detailsText.textContent = `Template file: ${selected.dataset.file} | Attachment: ${attachment}`;
      }
      if (details) details.hidden = false;
    } else if (details) {
      details.hidden = true;
    }
  };
}

async function loadCampaignCatalog() {
  showLoader('Loading campaign templates...');
  try {
    const response = await fetch(`${campaignApiBase}/campaigns`);
    if (!response.ok) {
      throw new Error(`Catalog request failed with HTTP ${response.status}`);
    }
    const data = await response.json();
    populateCampaignOptions(data);
    setStatusMessage(data.templates?.length ? 'Campaign catalog loaded from the database.' : 'No active templates are configured in the database.', 'info');
  } catch (error) {
    populateCampaignOptions({ campaigns: [], templates: [] });
    setStatusMessage('Unable to load campaign templates from the database. Check the campaign API and database connection.', 'error');
  } finally {
    hideLoader();
  }
}

async function loadCampaignHistory() {
  const body = document.getElementById('historyTableBody');
  if (!body) {
    return;
  }

  try {
    const data = await fetchCampaignJson('/history');
    renderCampaignHistory(body, data?.history || []);
  } catch (error) {
    body.innerHTML = '<tr><td colspan="5">Campaign history is unavailable. Check the API and database connection.</td></tr>';
  }
}

function getStoredRecipients() {
  try {
    return JSON.parse(localStorage.getItem('portalRecipients') || '[]');
  } catch (error) {
    return [];
  }
}

function saveStoredRecipients(recipients) {
  localStorage.setItem('portalRecipients', JSON.stringify(recipients));
}

function validateModalForm(fields, summary) {
  let valid = true;
  fields.forEach(({ input, message, type }) => {
    const value = input.value.trim();
    const error = !value
      ? 'This field is required.'
      : type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? 'Enter a valid email address.'
        : '';
    const group = input.closest('.form-group');
    if (group) group.classList.toggle('has-error', Boolean(error));
    input.setAttribute('aria-invalid', String(Boolean(error)));
    message.textContent = error;
    valid = valid && !error;
  });
  if (summary) summary.hidden = valid;
  return valid;
}

function attachIntakeForm() {
  const modal = document.getElementById('intakeModal');
  const form = document.getElementById('intakeForm');
  const saveButton = document.getElementById('saveIntakeBtn');
  document.getElementById('openIntakeBtn')?.addEventListener('click', () => openWorkspaceModal(modal));
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = [
      { input: document.getElementById('intakeName'), message: document.getElementById('intakeNameError') },
      { input: document.getElementById('intakeEmail'), message: document.getElementById('intakeEmailError'), type: 'email' },
      { input: document.getElementById('intakeGoal'), message: document.getElementById('intakeGoalError') }
    ];
    if (!validateModalForm(fields, document.getElementById('intakeFormError'))) {
      fields.find(({ input }) => input.getAttribute('aria-invalid') === 'true')?.input.focus();
      return;
    }

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Saving...';
    }
    try {
      await sleep(250);
      const stored = JSON.parse(localStorage.getItem('portalIntakeRequests') || '[]');
      if (!Array.isArray(stored)) throw new Error('Stored intake requests are not a list.');
      const values = Object.fromEntries(new FormData(form).entries());
      stored.push({ ...values, submittedAt: new Date().toISOString() });
      localStorage.setItem('portalIntakeRequests', JSON.stringify(stored));
      form.reset();
      fields.forEach(({ input, message }) => {
        input.removeAttribute('aria-invalid');
        input.closest('.form-group')?.classList.remove('has-error');
        message.textContent = '';
      });
      document.getElementById('intakeFormError').hidden = true;
      closeWorkspaceModal(modal);
      showToast('Your intake form has been saved.', 'success');
    } catch (error) {
      showToast('Unable to save the intake form in this browser. Your entries are still available to retry.', 'error');
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.innerHTML = '<i class="fa-solid fa-check"></i> Save intake';
      }
    }
  });
}

function attachRecipientForm() {
  const modal = document.getElementById('recipientModal');
  const form = document.getElementById('recipientForm');
  document.querySelector('[data-action="recipient"]')?.addEventListener('click', () => openWorkspaceModal(modal));
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = [
      { input: document.getElementById('recipientName'), message: document.getElementById('recipientNameError') },
      { input: document.getElementById('recipientEmail'), message: document.getElementById('recipientEmailError'), type: 'email' }
    ];
    if (!validateModalForm(fields, document.getElementById('recipientFormError'))) {
      fields.find(({ input }) => input.getAttribute('aria-invalid') === 'true')?.input.focus();
      return;
    }
    const name = fields[0].input.value.trim();
    const email = fields[1].input.value.trim();
    const recipients = getStoredRecipients();
    if (recipients.some((entry) => entry.email.toLowerCase() === email.toLowerCase())) {
      fields[1].message.textContent = 'This email is already in your recipient list.';
      fields[1].input.setAttribute('aria-invalid', 'true');
      fields[1].input.closest('.form-group')?.classList.add('has-error');
      document.getElementById('recipientFormError').hidden = false;
      fields[1].input.focus();
      return;
    }
    try {
      recipients.push({ name, email });
      saveStoredRecipients(recipients);
      form.reset();
      fields.forEach(({ input, message }) => {
        input.removeAttribute('aria-invalid');
        input.closest('.form-group')?.classList.remove('has-error');
        message.textContent = '';
      });
      document.getElementById('recipientFormError').hidden = true;
      closeWorkspaceModal(modal);
      showToast(`Saved ${name} to the local recipient list.`, 'success');
    } catch (error) {
      showToast('Unable to save this recipient in your browser.', 'error');
    }
  });
}

function finishCampaignConfirmation(confirmed) {
  const modal = document.getElementById('campaignConfirmModal');
  closeWorkspaceModal(modal);
  const resolve = campaignConfirmationResolver;
  campaignConfirmationResolver = null;
  resolve?.(confirmed);
}

function requestCampaignConfirmation(message) {
  const modal = document.getElementById('campaignConfirmModal');
  const messageElement = document.getElementById('campaignConfirmMessage');
  if (messageElement) messageElement.textContent = message;
  openWorkspaceModal(modal);
  return new Promise((resolve) => {
    campaignConfirmationResolver = resolve;
  });
}

function attachCampaignConfirmation() {
  document.getElementById('cancelCampaignConfirm')?.addEventListener('click', () => finishCampaignConfirmation(false));
  document.getElementById('approveCampaignConfirm')?.addEventListener('click', () => finishCampaignConfirmation(true));
}

function exportHistoryCsv() {
  const rows = [[ 'Time', 'Recipient', 'Campaign', 'Status', 'Message' ], ...lastCampaignHistory.map((item) => [
    item.timestamp || '',
    item.sent_to || '',
    item.campaign_type || '',
    item.status || '',
    item.error_message || ''
  ])];

  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'campaign-history.csv';
  link.click();
  URL.revokeObjectURL(url);
  setStatusMessage('Campaign history exported to CSV.', 'success');
}

async function sendCampaign() {
  const typeSelect = document.getElementById('campaignTypeSelect');
  const templateSelect = document.getElementById('templateSelect');
  const subjectInput = document.getElementById('campaignSubject');
  const sendButton = document.getElementById('sendCampaignBtn');

  if (!typeSelect?.value || !templateSelect?.value || !subjectInput?.value.trim()) {
    setStatusMessage('Choose a campaign type and template, and provide an email subject.', 'error');
    return;
  }

  const campaignName = typeSelect.options[typeSelect.selectedIndex]?.textContent || typeSelect.value;
  const templateName = templateSelect.options[templateSelect.selectedIndex]?.textContent || 'selected template';
  const confirmed = await requestCampaignConfirmation(`Submit "${subjectInput.value.trim()}" using ${templateName} for ${campaignName}?`);
  if (!confirmed) {
    return;
  }

  if (sendButton) sendButton.disabled = true;
  showLoader('Sending campaign...');
  try {
    const response = await fetch(`${campaignApiBase}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateSelect.value,
        subject: subjectInput.value.trim()
      })
    });

    const result = await response.json();
    if (response.ok && result?.success) {
      setStatusMessage(`The email provider accepted ${result.accepted} submission(s). This does not confirm delivery.`, 'success');
      await loadCampaignHistory();
    } else {
      setStatusMessage(result?.error || 'The campaign could not be submitted.', 'error');
    }
  } catch (error) {
    setStatusMessage('The campaign API could not be reached. No campaign was queued or sent.', 'error');
  } finally {
    hideLoader();
    if (sendButton) sendButton.disabled = false;
  }
}

function attachHistoryFilters() {
  const searchInput = document.getElementById('campaignSearchInput');
  const statusButtons = document.querySelectorAll('[data-status-filter]');
  const body = document.getElementById('historyTableBody');

  if (searchInput) {
    searchInput.addEventListener('input', (event) => {
      historyState.search = event.target.value;
      if (body) {
        renderCampaignHistory(body, lastCampaignHistory);
      }
    });
  }

  statusButtons.forEach((button) => {
    button.addEventListener('click', () => {
      historyState.filter = button.dataset.statusFilter || 'all';
      statusButtons.forEach((item) => item.classList.toggle('active', item === button));
      if (body) {
        renderCampaignHistory(body, lastCampaignHistory);
      }
    });
  });
}

function attachQuickActions() {
  const actionButtons = document.querySelectorAll('[data-action]');

  actionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;

      if (action === 'export') {
        exportHistoryCsv();
      }

      if (action === 'reports') {
        const statusInput = document.getElementById('campaignSearchInput');
        if (statusInput) {
          statusInput.focus();
          statusInput.value = 'success';
          historyState.search = 'success';
          renderCampaignHistory(document.getElementById('historyTableBody'), lastCampaignHistory);
        }
        setStatusMessage('Showing recent successful campaign delivery summaries.', 'success');
      }
    });
  });
}

function resetCampaignForm() {
  const typeSelect = document.getElementById('campaignTypeSelect');
  const templateSelect = document.getElementById('templateSelect');
  const subjectInput = document.getElementById('campaignSubject');

  if (typeSelect) typeSelect.value = '';
  if (templateSelect) templateSelect.value = '';
  if (subjectInput) subjectInput.value = '';
  setStatusMessage('Campaign form reset and ready for a new launch.', 'info');
}

function focusCampaignForm() {
  const formPanel = document.getElementById('createCampaignTitle');
  const campaignType = document.getElementById('campaignTypeSelect');

  if (formPanel) {
    formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (campaignType) {
    campaignType.focus();
  }

  setStatusMessage('Add a new campaign and choose a template to launch.', 'info');
}

window.addEventListener('DOMContentLoaded', async () => {
  await initPortalData();
  initSidebar();
  attachModalDismissal();
  attachIntakeForm();
  attachRecipientForm();
  attachCampaignConfirmation();
  await loadCampaignCatalog();
  await loadCampaignHistory();
  attachHistoryFilters();
  attachQuickActions();
  attachPreviewControls();
  attachWorkspaceNavigation();

  const sendButton = document.getElementById('sendCampaignBtn');
  const refreshButton = document.getElementById('refreshHistoryBtn');
  const newCampaignButton = document.getElementById('newCampaignPresetBtn');
  const addCampaignButton = document.getElementById('addCampaignBtn');

  if (sendButton) {
    sendButton.addEventListener('click', sendCampaign);
  }

  if (refreshButton) {
    refreshButton.addEventListener('click', loadCampaignHistory);
  }

  if (newCampaignButton) {
    newCampaignButton.addEventListener('click', resetCampaignForm);
  }

  if (addCampaignButton) {
    addCampaignButton.addEventListener('click', focusCampaignForm);
  }
});

