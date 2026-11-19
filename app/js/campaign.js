const campaignApiBase = 'http://127.0.0.1:8001';

const historyState = {
  filter: 'all',
  search: ''
};

let lastCampaignHistory = [];

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

  modal.hidden = false;
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

function attachWorkspaceNavigation() {
  document.querySelectorAll('[data-scroll-target]').forEach((button) => {
    button.addEventListener('click', () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth' }));
  });
  document.querySelectorAll('.page-nav .nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.page-nav .nav-link').forEach((item) => item.classList.toggle('active', item === link));
    });
  });
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

function addRecipientFromPrompt() {
  const name = window.prompt('Recipient name');
  if (!name) return;
  const email = window.prompt('Recipient email');
  if (!email) return;

  const recipients = getStoredRecipients();
  const normalized = { name: name.trim(), email: email.trim() };

  if (!normalized.name || !normalized.email) {
    setStatusMessage('Recipient details are incomplete.', 'error');
    return;
  }

  const exists = recipients.some((entry) => entry.email.toLowerCase() === normalized.email.toLowerCase());
  if (!exists) {
    recipients.push(normalized);
    saveStoredRecipients(recipients);
  }

  setStatusMessage(`Saved ${normalized.name} to the local recipient list.`, 'success');
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
  if (!window.confirm(`Submit "${subjectInput.value.trim()}" using ${templateName} for ${campaignName}?`)) {
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

      if (action === 'recipient') {
        addRecipientFromPrompt();
      }

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

