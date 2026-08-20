let container = null;
let toastId = 0;

const STYLES = {
  success: { bg: '#ECFDF5', color: '#065F46', border: '#10B981', icon: '✓' },
  error:   { bg: '#FEF2F2', color: '#991B1B', border: '#EF4444', icon: '✕' },
  warning: { bg: '#FFFBEB', color: '#92400E', border: '#F59E0B', icon: '!' },
  info:    { bg: '#EFF6FF', color: '#1E40AF', border: '#3B82F6', icon: 'i' },
};

function getContainer() {
  if (!container || !document.getElementById('toast-container')) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:80px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:380px;';
    document.body.appendChild(container);
  }
  return container;
}

if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = '@keyframes toastIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes toastOut{from{transform:translateX(0);opacity:1}to{transform:translateX(120%);opacity:0}}.toast-item{animation:toastIn .3s ease forwards}.toast-item.removing{animation:toastOut .3s ease forwards}';
  document.head.appendChild(style);
}

export function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 4000;
  var s = STYLES[type] || STYLES.info;
  var el = document.createElement('div');
  el.className = 'toast-item';
  el.style.cssText = 'background:' + s.bg + ';color:' + s.color + ';border-left:4px solid ' + s.border + ';padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.08);font-size:14px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;gap:10px;pointer-events:auto;cursor:pointer;min-width:280px';
  el.innerHTML = '<div style="width:22px;height:22px;border-radius:50%;background:' + s.border + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;flex-shrink:0">' + s.icon + '</div><div style="flex:1;line-height:1.4">' + message + '</div>';
  el.onclick = function() { removeToast(el); };
  getContainer().appendChild(el);
  var timeoutId = setTimeout(function() { removeToast(el); }, duration);
  el._timeoutId = timeoutId;
  return ++toastId;
}

function removeToast(el) {
  if (!el || !el.parentNode) return;
  clearTimeout(el._timeoutId);
  el.classList.add('removing');
  setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
}

var originalAlert = window.alert;
window.alert = function(message) {
  var msg = String(message || '');
  var lower = msg.toLowerCase();
  var type = 'info';
  if (lower.indexOf('sucesso') >= 0 || lower.indexOf('success') >= 0 || lower.indexOf('criada') >= 0 || lower.indexOf('criado') >= 0 || lower.indexOf('registada') >= 0 || lower.indexOf('enviado') >= 0 || lower.indexOf('salvo') >= 0) type = 'success';
  else if (lower.indexOf('erro') >= 0 || lower.indexOf('error') >= 0 || lower.indexOf('falha') >= 0 || lower.indexOf('incorret') >= 0) type = 'error';
  else if (lower.indexOf('atencao') >= 0 || lower.indexOf('aviso') >= 0 || lower.indexOf('cuidado') >= 0) type = 'warning';
  showToast(msg, type);
};
