'use strict';
fetch('tools.json').then(response => {
  if (!response.ok) throw new Error('Tool catalog unavailable');
  return response.json();
}).then(tools => {
  const buttons = [...document.querySelectorAll('[data-tool]')];
  for (const button of buttons) button.addEventListener('click', () => {
    const tool = tools.find(item => item.id === button.dataset.tool);
    if (!tool) return;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelector('#tool-number').textContent = `${String(tools.indexOf(tool) + 1).padStart(2, '0')} / ${tool.category.toUpperCase()}`;
    document.querySelector('#tool-name').textContent = tool.name;
    document.querySelector('#tool-description').textContent = tool.description;
    document.querySelector('#tool-features').replaceChildren(...tool.features.map(feature => { const li = document.createElement('li'); li.textContent = feature; return li; }));
    const image = document.querySelector('#tool-image'); image.src = `screenshots/${tool.id}/editor.png`; image.alt = `${tool.name} actual editing workspace`;
    const link = document.querySelector('#tool-link'); link.href = `tools/${tool.id}/`; link.textContent = `Meet ${tool.name} ↗`;
  });
}).catch(() => { document.querySelector('.tool-tabs').hidden = true; });
document.querySelector('#copy-command')?.addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(document.querySelector('.code-block code').textContent);
    status.textContent = 'Setup commands copied.';
    document.querySelector('#copy-command').textContent = 'Copied';
  } catch { status.textContent = 'Select the commands above and copy them from your browser.'; }
});
