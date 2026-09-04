const QUICK_PRICES = [
    250, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000,
    3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000
];

const PAYMENT_METHODS = ['نقدي', 'حوالة', 'تحويل إلكتروني', 'شبكة/بطاقة', 'آجل'];
const TRANSFER_METHODS = new Set(['حوالة', 'تحويل إلكتروني']);
const STORE = {
    name: 'تخفيضات السعر الأنسب',
    address: 'إب - شارع العدين الثالث، أسفل ملك الأزياء',
    phone: '739302339',
    whatsapp: '967739302339'
};

const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyD22pmmSiXLTrGyXkhUdJfhgV2SE2s3_SQ',
    authDomain: 'takhfidat-pos.firebaseapp.com',
    projectId: 'takhfidat-pos',
    storageBucket: 'takhfidat-pos.firebasestorage.app',
    messagingSenderId: '514374069625',
    appId: '1:514374069625:web:115eac8485fcef60cbd3a8',
    measurementId: 'G-R3PT7J163T'
};

const STORE_ID = 'best-price-main';
const STORAGE_KEYS = {
    invoices: 'best_price_pos_invoices_v3',
    deleted: 'best_price_pos_deleted_v3',
    device: 'best_price_pos_device_v3',
    sequence: 'best_price_pos_sequence_v3',
    migrated: 'best_price_pos_migrated_v3'
};

const state = {
    cart: [],
    invoices: [],
    db: null,
    firebase: null,
    auth: null,
    authApi: null,
    cloudReady: false,
    currentUser: null,
    unsubscribeInvoices: null,
    currentInvoice: null,
    reportInvoices: [],
    confirmResolver: null
};

const $ = id => document.getElementById(id);

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function formatMoney(value) {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0
    }).format(roundMoney(value));
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function safeJsonParse(value, fallback) {
    try {
        const parsed = JSON.parse(value);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function localDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function toDateTimeLocal(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function formatDate(value, includeSeconds = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-EG-u-ca-gregory', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: includeSeconds ? '2-digit' : undefined
    }).format(date);
}

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('ar-EG', {
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function normalizeText(value) {
    return String(value || '').trim().toLocaleLowerCase('ar');
}

function getDeviceId() {
    let id = localStorage.getItem(STORAGE_KEYS.device);
    if (!id) {
        id = Math.random().toString(36).slice(2, 6).toUpperCase();
        localStorage.setItem(STORAGE_KEYS.device, id);
    }
    return id;
}

function generateInvoiceNumber() {
    const day = localDateKey().replaceAll('-', '');
    const sequenceData = safeJsonParse(localStorage.getItem(STORAGE_KEYS.sequence), {});
    sequenceData[day] = (Number(sequenceData[day]) || 0) + 1;
    localStorage.setItem(STORAGE_KEYS.sequence, JSON.stringify(sequenceData));
    return `INV-${day}-${String(sequenceData[day]).padStart(3, '0')}-${getDeviceId()}`;
}

function normalizeItem(item, index = 0) {
    const price = roundMoney(item.price ?? item.unitPrice ?? item.finalPrice ?? item.basePrice);
    const qty = Math.max(1, Number.parseInt(item.qty ?? item.quantity, 10) || 1);
    return {
        id: String(item.id ?? `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`),
        name: String(item.name || item.itemName || item.description || 'ملابس').trim(),
        price,
        qty,
        total: roundMoney(price * qty)
    };
}

function normalizeInvoice(invoice, index = 0) {
    const items = Array.isArray(invoice.items)
        ? invoice.items.map(normalizeItem)
        : [];
    const calculatedTotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
    const total = roundMoney(invoice.total ?? invoice.totalPrice ?? invoice.grandTotal ?? calculatedTotal);
    const rawDate = invoice.date || invoice.createdAt || new Date().toISOString();
    const parsedDate = new Date(rawDate);
    const date = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
    const id = String(invoice.id || invoice.invoiceNo || `LEGACY-${Date.now()}-${index}`);
    const paymentMethod = invoice.paymentMethod || invoice.payment || 'نقدي';

    return {
        id,
        invoiceNo: String(invoice.invoiceNo || id),
        orderNo: String(invoice.orderNo || invoice.saleOrderNo || ''),
        customer: String(invoice.customer || invoice.customerName || 'زبون نقدي'),
        worker: String(invoice.worker || invoice.workerName || 'غير محدد'),
        items,
        total,
        totalQty: Number(invoice.totalQty) || items.reduce((sum, item) => sum + item.qty, 0),
        paymentMethod,
        transferNo: String(invoice.transferNo || invoice.transferNumber || ''),
        transferSender: String(invoice.transferSender || invoice.senderName || ''),
        transferProvider: String(invoice.transferProvider || invoice.transferCompany || ''),
        paid: roundMoney(invoice.paid ?? (paymentMethod === 'آجل' ? 0 : total)),
        remaining: roundMoney(invoice.remaining ?? invoice.balance ?? 0),
        date,
        createdAt: invoice.createdAt || date,
        updatedAt: invoice.updatedAt || date,
        deviceId: invoice.deviceId || 'legacy',
        createdBy: String(invoice.createdBy || ''),
        deleted: Boolean(invoice.deleted),
        pending: Boolean(invoice.pending)
    };
}

function sortInvoices(invoices) {
    return [...invoices].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function loadInvoices() {
    const saved = safeJsonParse(localStorage.getItem(STORAGE_KEYS.invoices), []);
    state.invoices = sortInvoices(Array.isArray(saved) ? saved.map(normalizeInvoice) : []);
}

function migrateLegacyInvoices() {
    if (localStorage.getItem(STORAGE_KEYS.migrated)) return;
    const legacyKeys = ['pos_invoices', 'invoices'];
    const merged = new Map(state.invoices.map(invoice => [invoice.id, invoice]));

    legacyKeys.forEach(key => {
        const oldInvoices = safeJsonParse(localStorage.getItem(key), []);
        if (!Array.isArray(oldInvoices)) return;
        oldInvoices.forEach((invoice, index) => {
            const normalized = normalizeInvoice(invoice, index);
            if (!merged.has(normalized.id)) {
                normalized.pending = true;
                merged.set(normalized.id, normalized);
            }
        });
    });

    state.invoices = sortInvoices([...merged.values()]);
    persistInvoices();
    localStorage.setItem(STORAGE_KEYS.migrated, '1');
}

function persistInvoices() {
    localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(state.invoices));
}

function setSyncStatus(type, text) {
    const status = $('sync-status');
    status.className = `sync-status ${type}`;
    status.querySelector('.status-text').textContent = text;
}

function toast(message, type = 'success') {
    const element = $('toast');
    element.textContent = message;
    element.className = `toast show ${type}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
        element.className = 'toast';
    }, 3000);
}

function showConfirm(message, title = 'تأكيد') {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('confirm-modal').classList.remove('hidden');
    return new Promise(resolve => {
        state.confirmResolver = resolve;
    });
}

function closeConfirm(result) {
    $('confirm-modal').classList.add('hidden');
    if (state.confirmResolver) state.confirmResolver(result);
    state.confirmResolver = null;
}

function initializeForm() {
    $('invoice-no').value = generateInvoiceNumber();
    $('sale-date').value = toDateTimeLocal();
    $('order-no').value = '';
    $('customer-name').value = '';
    $('worker-name').value = state.currentUser?.name || '';
    $('item-name').value = '';
    $('item-price').value = '';
    $('item-qty').value = '1';
    $('payment-method').value = '';
    $('transfer-no').value = '';
    $('transfer-sender').value = '';
    $('transfer-provider').value = '';
    $('paid-amount').value = '0';
    state.cart = [];
    updatePaymentFields();
    renderCart();
}

function renderQuickPrices() {
    $('quick-prices').innerHTML = QUICK_PRICES.map(price => `
        <button type="button" class="quick-price" data-price="${price}">
            ${formatMoney(price)} <small>ريال</small>
        </button>
    `).join('');
}

function addItem(name, price, qty) {
    const cleanName = String(name || '').trim() || 'ملابس';
    const cleanPrice = roundMoney(price);
    const cleanQty = Math.max(1, Number.parseInt(qty, 10) || 1);

    if (cleanPrice <= 0) {
        toast('أدخل سعراً صحيحاً للصنف.', 'error');
        $('item-price').focus();
        return;
    }

    const existing = state.cart.find(item =>
        normalizeText(item.name) === normalizeText(cleanName) && item.price === cleanPrice
    );

    if (existing) {
        existing.qty += cleanQty;
        existing.total = roundMoney(existing.qty * existing.price);
    } else {
        state.cart.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: cleanName,
            price: cleanPrice,
            qty: cleanQty,
            total: roundMoney(cleanPrice * cleanQty)
        });
    }

    $('item-name').value = '';
    $('item-price').value = '';
    $('item-qty').value = '1';
    renderCart();
    toast('تمت إضافة الصنف.');
    $('item-name').focus();
}

function cartTotals() {
    return state.cart.reduce((totals, item) => {
        totals.total += roundMoney(item.price * item.qty);
        totals.qty += item.qty;
        return totals;
    }, { total: 0, qty: 0 });
}

function quantityControl(item) {
    return `
        <div class="qty-control" data-id="${escapeHtml(item.id)}">
            <button type="button" data-cart-action="plus" aria-label="زيادة">+</button>
            <strong>${item.qty}</strong>
            <button type="button" data-cart-action="minus" aria-label="نقص">−</button>
        </div>
    `;
}

function renderCart() {
    const body = $('cart-body');
    const mobile = $('cart-mobile');

    if (!state.cart.length) {
        body.innerHTML = '<tr><td colspan="5" class="table-empty">لم تُضف أصناف إلى الفاتورة بعد.</td></tr>';
        mobile.innerHTML = '<div class="empty-state">ابدأ بإضافة صنف أو اضغط أحد الأسعار السريعة.</div>';
    } else {
        body.innerHTML = state.cart.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${quantityControl(item)}</td>
                <td>${formatMoney(item.price)}</td>
                <td><strong>${formatMoney(item.price * item.qty)}</strong></td>
                <td>
                    <div class="row-actions">
                        <button class="icon-action delete" type="button" data-cart-action="delete" data-id="${escapeHtml(item.id)}" aria-label="حذف">🗑</button>
                    </div>
                </td>
            </tr>
        `).join('');

        mobile.innerHTML = state.cart.map(item => `
            <div class="mobile-item">
                <div class="mobile-item-head">
                    <strong>${escapeHtml(item.name)}</strong>
                    <button class="icon-action delete" type="button" data-cart-action="delete" data-id="${escapeHtml(item.id)}" aria-label="حذف">🗑</button>
                </div>
                <div class="mobile-item-meta">
                    <span>السعر: <b>${formatMoney(item.price)}</b></span>
                    <span>الإجمالي: <b>${formatMoney(item.price * item.qty)}</b></span>
                </div>
                <div style="margin-top:10px">${quantityControl(item)}</div>
            </div>
        `).join('');
    }

    const totals = cartTotals();
    $('cart-count-badge').textContent = `${state.cart.length} صنف`;
    $('summary-lines').textContent = state.cart.length;
    $('summary-qty').textContent = totals.qty;
    $('summary-total').textContent = formatMoney(totals.total);
    updateCreditRemaining();
}

function handleCartAction(event) {
    const button = event.target.closest('[data-cart-action]');
    if (!button) return;
    const wrapper = button.closest('[data-id]');
    const id = button.dataset.id || wrapper?.dataset.id;
    const item = state.cart.find(entry => entry.id === id);
    if (!item) return;

    if (button.dataset.cartAction === 'plus') item.qty += 1;
    if (button.dataset.cartAction === 'minus') item.qty -= 1;
    if (button.dataset.cartAction === 'delete' || item.qty <= 0) {
        state.cart = state.cart.filter(entry => entry.id !== id);
    }
    if (item.qty > 0) item.total = roundMoney(item.price * item.qty);
    renderCart();
}

function updatePaymentFields() {
    const method = $('payment-method').value;
    $('transfer-fields').classList.toggle('hidden', !TRANSFER_METHODS.has(method));
    $('credit-fields').classList.toggle('hidden', method !== 'آجل');
    if (method !== 'آجل') $('paid-amount').value = '0';
    updateCreditRemaining();
}

function updateCreditRemaining() {
    const total = cartTotals().total;
    const paid = Math.max(0, roundMoney($('paid-amount').value));
    $('remaining-amount').textContent = formatMoney(Math.max(0, total - paid));
}

function validateInvoice() {
    if (!$('customer-name').value.trim()) {
        toast('اكتب اسم الزبون.', 'error');
        $('customer-name').focus();
        return false;
    }
    if (!$('worker-name').value) {
        toast('اختر اسم العامل.', 'error');
        $('worker-name').focus();
        return false;
    }
    if (!state.cart.length) {
        toast('أضف صنفاً واحداً على الأقل.', 'error');
        $('item-name').focus();
        return false;
    }
    const payment = $('payment-method').value;
    if (!PAYMENT_METHODS.includes(payment)) {
        toast('اختر طريقة الدفع.', 'error');
        $('payment-method').focus();
        return false;
    }
    if (TRANSFER_METHODS.has(payment) && !$('transfer-no').value.trim()) {
        toast('أدخل رقم الحوالة.', 'error');
        $('transfer-no').focus();
        return false;
    }
    if (payment === 'آجل' && roundMoney($('paid-amount').value) > cartTotals().total) {
        toast('المبلغ المدفوع أكبر من إجمالي الفاتورة.', 'error');
        $('paid-amount').focus();
        return false;
    }
    return true;
}

function buildInvoice() {
    const totals = cartTotals();
    const paymentMethod = $('payment-method').value;
    const paid = paymentMethod === 'آجل'
        ? Math.max(0, roundMoney($('paid-amount').value))
        : totals.total;
    const localDate = $('sale-date').value ? new Date($('sale-date').value) : new Date();
    const date = Number.isNaN(localDate.getTime()) ? new Date().toISOString() : localDate.toISOString();
    const now = new Date().toISOString();
    const invoiceNo = $('invoice-no').value || generateInvoiceNumber();

    return {
        id: invoiceNo,
        invoiceNo,
        orderNo: $('order-no').value.trim(),
        customer: $('customer-name').value.trim(),
        worker: $('worker-name').value,
        items: state.cart.map(item => ({ ...item, total: roundMoney(item.price * item.qty) })),
        total: roundMoney(totals.total),
        totalQty: totals.qty,
        paymentMethod,
        transferNo: TRANSFER_METHODS.has(paymentMethod) ? $('transfer-no').value.trim() : '',
        transferSender: TRANSFER_METHODS.has(paymentMethod) ? $('transfer-sender').value.trim() : '',
        transferProvider: TRANSFER_METHODS.has(paymentMethod) ? $('transfer-provider').value.trim() : '',
        paid,
        remaining: paymentMethod === 'آجل' ? roundMoney(totals.total - paid) : 0,
        date,
        createdAt: now,
        updatedAt: now,
        deviceId: getDeviceId(),
        createdBy: state.currentUser?.uid || '',
        pending: true
    };
}

async function saveCurrentInvoice(printAfter = false) {
    if (!validateInvoice()) return;
    const invoice = buildInvoice();
    state.invoices = sortInvoices([invoice, ...state.invoices.filter(item => item.id !== invoice.id)]);
    persistInvoices();
    renderAllDataViews();
    toast('تم حفظ الفاتورة على الجهاز.');

    if (state.cloudReady) {
        await pushInvoice(invoice);
    }

    if (printAfter) {
        openInvoice(invoice);
        setTimeout(printSelectedInvoice, 120);
    }

    initializeForm();
}

async function startNewInvoice() {
    if (state.cart.length) {
        const approved = await showConfirm('سيتم مسح الأصناف غير المحفوظة. هل تريد المتابعة؟', 'فاتورة جديدة');
        if (!approved) return;
    }
    initializeForm();
    $('customer-name').focus();
}

async function clearCurrentInvoice() {
    if (!state.cart.length) {
        initializeForm();
        return;
    }
    const approved = await showConfirm('هل تريد تفريغ الفاتورة الحالية؟', 'تفريغ الفاتورة');
    if (approved) initializeForm();
}

function accessibleInvoices() {
    if (!state.currentUser || state.currentUser.role === 'admin') return state.invoices;
    return state.invoices.filter(invoice => invoice.createdBy === state.currentUser.uid);
}

function filteredInvoices() {
    const search = normalizeText($('history-search').value);
    const from = $('history-from').value;
    const to = $('history-to').value;
    const payment = $('history-payment').value;

    return accessibleInvoices().filter(invoice => {
        const day = localDateKey(invoice.date);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (payment && invoice.paymentMethod !== payment) return false;
        if (!search) return true;

        const haystack = normalizeText([
            invoice.invoiceNo,
            invoice.orderNo,
            invoice.customer,
            invoice.worker,
            invoice.paymentMethod,
            invoice.transferNo,
            invoice.transferSender,
            invoice.transferProvider,
            ...invoice.items.map(item => item.name)
        ].join(' '));
        return haystack.includes(search);
    });
}

function paymentPill(method) {
    const cssClass = method === 'آجل' ? 'credit' : method === 'نقدي' ? 'cash' : '';
    return `<span class="payment-pill ${cssClass}">${escapeHtml(method)}</span>`;
}

function renderHistory() {
    const invoices = filteredInvoices();
    const totals = invoices.reduce((result, invoice) => {
        result.total += invoice.total;
        result.qty += invoice.totalQty;
        result.remaining += invoice.remaining;
        return result;
    }, { total: 0, qty: 0, remaining: 0 });

    $('history-count').textContent = invoices.length;
    $('history-total').textContent = formatMoney(totals.total);
    $('history-qty').textContent = totals.qty;
    $('history-remaining').textContent = formatMoney(totals.remaining);
    $('history-empty').classList.toggle('hidden', invoices.length > 0);

    $('history-body').innerHTML = invoices.map(invoice => `
        <tr>
            <td><strong>${escapeHtml(invoice.invoiceNo)}</strong>${invoice.pending ? '<br><small>بانتظار المزامنة</small>' : ''}</td>
            <td>${escapeHtml(invoice.customer)}</td>
            <td>${escapeHtml(invoice.worker)}</td>
            <td><strong>${formatMoney(invoice.total)}</strong></td>
            <td>${paymentPill(invoice.paymentMethod)}</td>
            <td>${escapeHtml(formatDate(invoice.date))}</td>
            <td>
                <div class="row-actions">
                    <button class="icon-action" type="button" data-invoice-action="view" data-id="${escapeHtml(invoice.id)}" title="عرض">👁</button>
                    <button class="icon-action" type="button" data-invoice-action="print" data-id="${escapeHtml(invoice.id)}" title="طباعة">🖨</button>
                    ${state.currentUser?.role === 'admin' ? `<button class="icon-action delete" type="button" data-invoice-action="delete" data-id="${escapeHtml(invoice.id)}" title="حذف">🗑</button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');

    $('history-mobile').innerHTML = invoices.map(invoice => `
        <div class="mobile-invoice">
            <div class="mobile-invoice-head">
                <div><strong>${escapeHtml(invoice.invoiceNo)}</strong>${invoice.pending ? '<br><small>بانتظار المزامنة</small>' : ''}</div>
                <strong>${formatMoney(invoice.total)} ريال</strong>
            </div>
            <div class="mobile-invoice-meta">
                <span>الزبون: <b>${escapeHtml(invoice.customer)}</b></span>
                <span>العامل: <b>${escapeHtml(invoice.worker)}</b></span>
                <span>الدفع: ${paymentPill(invoice.paymentMethod)}</span>
                <span>${escapeHtml(formatDate(invoice.date))}</span>
            </div>
            <div class="mobile-invoice-actions">
                <button class="btn btn-light" type="button" data-invoice-action="view" data-id="${escapeHtml(invoice.id)}">عرض</button>
                <button class="btn btn-light" type="button" data-invoice-action="print" data-id="${escapeHtml(invoice.id)}">طباعة</button>
                ${state.currentUser?.role === 'admin' ? `<button class="btn btn-danger-ghost" type="button" data-invoice-action="delete" data-id="${escapeHtml(invoice.id)}">حذف</button>` : ''}
            </div>
        </div>
    `).join('');
}

function receiptMarkup(invoice) {
    const transferDetails = TRANSFER_METHODS.has(invoice.paymentMethod) ? `
        ${invoice.transferNo ? `<span>رقم الحوالة: <b>${escapeHtml(invoice.transferNo)}</b></span>` : ''}
        ${invoice.transferSender ? `<span>المُحوِّل: <b>${escapeHtml(invoice.transferSender)}</b></span>` : ''}
        ${invoice.transferProvider ? `<span>الجهة: <b>${escapeHtml(invoice.transferProvider)}</b></span>` : ''}
    ` : '';

    const creditDetails = invoice.paymentMethod === 'آجل' ? `
        <span>المدفوع: <b>${formatMoney(invoice.paid)} ريال</b></span>
        <span>المتبقي: <b>${formatMoney(invoice.remaining)} ريال</b></span>
    ` : '';

    const whatsappUrl = `https://wa.me/${STORE.whatsapp}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(whatsappUrl)}`;

    return `
        <div class="receipt-brand">
            <h2>${STORE.name}</h2>
            <p>${STORE.address}</p>
            <p>للتواصل: ${STORE.phone}</p>
        </div>
        <div class="receipt-title">فاتورة بيع</div>
        <div class="receipt-info">
            <span>رقم الفاتورة: <b>${escapeHtml(invoice.invoiceNo)}</b></span>
            ${invoice.orderNo ? `<span>طلب البيع: <b>${escapeHtml(invoice.orderNo)}</b></span>` : ''}
            <span>التاريخ: <b>${escapeHtml(formatDate(invoice.date, true))}</b></span>
            <span>الزبون: <b>${escapeHtml(invoice.customer)}</b></span>
            <span>العامل: <b>${escapeHtml(invoice.worker)}</b></span>
        </div>
        <table class="receipt-table">
            <thead><tr><th>الصنف</th><th>ك</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>
                ${invoice.items.map(item => `
                    <tr>
                        <td>${escapeHtml(item.name)}</td>
                        <td>${item.qty}</td>
                        <td>${formatMoney(item.price)}</td>
                        <td>${formatMoney(item.total)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div class="receipt-total"><span>الإجمالي</span><span>${formatMoney(invoice.total)} ريال</span></div>
        <div class="receipt-payment">
            <span>طريقة الدفع: <b>${escapeHtml(invoice.paymentMethod)}</b></span>
            ${transferDetails}
            ${creditDetails}
        </div>
        <div class="receipt-qr">
            <img src="${qrUrl}" alt="واتساب المتجر">
            <span>للتواصل عبر واتساب</span>
        </div>
        <div class="receipt-footer">
            <strong>شكراً لتسوقكم معنا</strong>
            <p>نتمنى أن نراكم قريباً</p>
        </div>
    `;
}

function openInvoice(invoice) {
    state.currentInvoice = invoice;
    $('print-area').innerHTML = receiptMarkup(invoice);
    $('invoice-modal').classList.remove('hidden');
}

function closeInvoiceModal() {
    $('invoice-modal').classList.add('hidden');
}

function printSelectedInvoice() {
    if (!state.currentInvoice) return;
    $('print-area').innerHTML = receiptMarkup(state.currentInvoice);
    document.body.classList.add('print-invoice');
    window.print();
}

function printReport() {
    document.body.classList.add('print-report');
    window.print();
}

async function deleteInvoiceById(id) {
    const invoice = state.invoices.find(item => item.id === id);
    if (!invoice) return;
    const approved = await showConfirm(`حذف الفاتورة ${invoice.invoiceNo} نهائياً؟`, 'حذف فاتورة');
    if (!approved) return;

    state.invoices = state.invoices.filter(item => item.id !== id);
    persistInvoices();
    const deleted = new Set(safeJsonParse(localStorage.getItem(STORAGE_KEYS.deleted), []));
    deleted.add(id);
    localStorage.setItem(STORAGE_KEYS.deleted, JSON.stringify([...deleted]));
    renderAllDataViews();
    toast('تم حذف الفاتورة.');

    if (state.cloudReady) await syncPendingChanges();
}

function handleInvoiceAction(event) {
    const button = event.target.closest('[data-invoice-action]');
    if (!button) return;
    const invoice = state.invoices.find(item => item.id === button.dataset.id);
    if (!invoice) return;

    if (button.dataset.invoiceAction === 'view') openInvoice(invoice);
    if (button.dataset.invoiceAction === 'print') {
        openInvoice(invoice);
        setTimeout(printSelectedInvoice, 100);
    }
    if (button.dataset.invoiceAction === 'delete') deleteInvoiceById(invoice.id);
}

function invoicesForReport() {
    const day = $('report-date').value || localDateKey();
    return accessibleInvoices().filter(invoice => localDateKey(invoice.date) === day);
}

function renderReport() {
    const invoices = invoicesForReport();
    state.reportInvoices = invoices;
    const totals = invoices.reduce((result, invoice) => {
        result.total += invoice.total;
        result.qty += invoice.totalQty;
        result.remaining += invoice.remaining;
        result.payments[invoice.paymentMethod] = (result.payments[invoice.paymentMethod] || 0) + invoice.total;
        return result;
    }, { total: 0, qty: 0, remaining: 0, payments: {} });

    $('report-total').textContent = formatMoney(totals.total);
    $('report-count').textContent = invoices.length;
    $('report-qty').textContent = totals.qty;
    $('report-remaining').textContent = formatMoney(totals.remaining);
    $('report-print-date').textContent = `تاريخ التقرير: ${escapeHtml($('report-date').value)}`;

    $('payment-breakdown').innerHTML = PAYMENT_METHODS.map(method => `
        <div class="payment-box">
            <span>${escapeHtml(method)}</span>
            <strong>${formatMoney(totals.payments[method] || 0)} ريال</strong>
        </div>
    `).join('');

    const merged = new Map();
    invoices.forEach(invoice => invoice.items.forEach(item => {
        const key = `${normalizeText(item.name)}|${item.price}`;
        const current = merged.get(key) || { name: item.name, price: item.price, qty: 0, total: 0 };
        current.qty += item.qty;
        current.total = roundMoney(current.total + item.total);
        merged.set(key, current);
    }));

    const mergedItems = [...merged.values()].sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name), 'ar'));
    $('merged-items-body').innerHTML = mergedItems.length ? mergedItems.map(item => `
        <tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${formatMoney(item.price)}</td><td>${item.qty}</td><td><strong>${formatMoney(item.total)}</strong></td></tr>
    `).join('') : '<tr><td colspan="4" class="table-empty">لا توجد مبيعات في هذا اليوم.</td></tr>';

    $('report-invoices-body').innerHTML = invoices.length ? invoices.map(invoice => `
        <tr>
            <td>${escapeHtml(invoice.invoiceNo)}</td>
            <td>${escapeHtml(invoice.customer)}</td>
            <td>${escapeHtml(invoice.worker)}</td>
            <td>${escapeHtml(invoice.paymentMethod)}</td>
            <td><strong>${formatMoney(invoice.total)}</strong></td>
            <td>${escapeHtml(formatTime(invoice.date))}</td>
        </tr>
    `).join('') : '<tr><td colspan="6" class="table-empty">لا توجد فواتير في هذا اليوم.</td></tr>';
}

function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function exportReportCsv() {
    const invoices = state.reportInvoices;
    if (!invoices.length) {
        toast('لا توجد فواتير لتصديرها في هذا اليوم.', 'error');
        return;
    }

    const rows = [[
        'رقم الفاتورة', 'التاريخ', 'رقم الطلب', 'الزبون', 'العامل',
        'الصنف', 'الكمية', 'سعر الوحدة', 'إجمالي الصنف', 'طريقة الدفع',
        'رقم الحوالة', 'المدفوع', 'المتبقي', 'إجمالي الفاتورة'
    ]];

    invoices.forEach(invoice => invoice.items.forEach(item => rows.push([
        invoice.invoiceNo,
        formatDate(invoice.date),
        invoice.orderNo,
        invoice.customer,
        invoice.worker,
        item.name,
        item.qty,
        item.price,
        item.total,
        invoice.paymentMethod,
        invoice.transferNo,
        invoice.paid,
        invoice.remaining,
        invoice.total
    ])));

    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-sales-${$('report-date').value}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('تم تجهيز ملف التقرير.');
}

function renderAllDataViews() {
    renderHistory();
    renderReport();
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
    document.querySelectorAll('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.view === viewId));
    if (viewId === 'history-view') renderHistory();
    if (viewId === 'report-view') renderReport();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function pushInvoice(invoice) {
    if (!state.cloudReady || !state.firebase || !state.db || !state.currentUser) return false;
    try {
        const { doc, setDoc } = state.firebase;
        const createdBy = invoice.createdBy || state.currentUser.uid;
        const cloudInvoice = { ...invoice, createdBy, pending: false, syncedAt: new Date().toISOString() };
        await setDoc(doc(state.db, 'stores', STORE_ID, 'invoices', invoice.id), cloudInvoice, { merge: true });
        state.invoices = state.invoices.map(item => item.id === invoice.id ? { ...item, createdBy, pending: false } : item);
        persistInvoices();
        renderAllDataViews();
        setSyncStatus('is-online', 'متصل ومحفوظ سحابياً');
        return true;
    } catch (error) {
        console.warn('Cloud save failed:', error);
        setSyncStatus(navigator.onLine ? 'is-error' : 'is-offline', navigator.onLine ? 'تعذر الحفظ السحابي' : 'غير متصل - حفظ محلي');
        return false;
    }
}

async function syncPendingChanges() {
    if (!state.cloudReady || !state.firebase || !state.db || !state.currentUser || !navigator.onLine) return;
    const { doc, updateDoc } = state.firebase;
    setSyncStatus('is-local', 'جارٍ مزامنة البيانات…');

    const deleted = new Set(safeJsonParse(localStorage.getItem(STORAGE_KEYS.deleted), []));
    for (const id of [...deleted]) {
        try {
            await updateDoc(doc(state.db, 'stores', STORE_ID, 'invoices', id), {
                deleted: true,
                deletedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            deleted.delete(id);
        } catch (error) {
            console.warn('Cloud delete failed:', error);
        }
    }
    localStorage.setItem(STORAGE_KEYS.deleted, JSON.stringify([...deleted]));

    const pendingInvoices = state.invoices.filter(item => item.pending && (
        state.currentUser.role === 'admin' || !item.createdBy || item.createdBy === state.currentUser.uid
    ));
    for (const invoice of pendingInvoices) {
        await pushInvoice(invoice);
    }

    if (!deleted.size && !state.invoices.some(item => item.pending)) {
        setSyncStatus('is-online', 'متصل ومزامَن');
    }
}

function mergeCloudInvoices(cloudInvoices, authoritative = false) {
    const deleted = new Set(safeJsonParse(localStorage.getItem(STORAGE_KEYS.deleted), []));
    const merged = new Map();

    const cloudIds = new Set(cloudInvoices.map(invoice => invoice.id));
    state.invoices.forEach(invoice => {
        const canKeepLocal = invoice.pending || !authoritative || cloudIds.has(invoice.id);
        if (!deleted.has(invoice.id) && canKeepLocal) merged.set(invoice.id, invoice);
    });

    cloudInvoices.forEach(invoice => {
        if (!deleted.has(invoice.id)) merged.set(invoice.id, { ...invoice, pending: false });
    });

    state.invoices = sortInvoices([...merged.values()]);
    persistInvoices();
    renderAllDataViews();
}

function showLogin(message = '') {
    document.body.classList.add('auth-pending');
    $('login-message').textContent = message;
    $('login-btn').disabled = false;
    $('login-btn').textContent = 'دخول آمن';
}

function showAuthenticatedApp(profile) {
    state.currentUser = profile;
    document.body.classList.remove('auth-pending');
    $('login-message').textContent = '';
    $('current-user-label').textContent = `${profile.name} — ${profile.role === 'admin' ? 'مدير' : 'كاشير'}`;

    const workerSelect = $('worker-name');
    if (![...workerSelect.options].some(option => option.value === profile.name)) {
        const option = document.createElement('option');
        option.value = profile.name;
        option.textContent = profile.name;
        workerSelect.appendChild(option);
    }
    workerSelect.value = profile.name;
    workerSelect.disabled = profile.role !== 'admin';
    renderAllDataViews();
}

function friendlyAuthError(error) {
    const code = String(error?.code || '');
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    }
    if (code.includes('too-many-requests')) return 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.';
    if (code.includes('network-request-failed')) return 'تعذر الاتصال بالإنترنت.';
    if (code.includes('invalid-email')) return 'صيغة البريد الإلكتروني غير صحيحة.';
    return 'تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً.';
}

async function handleLogin(event) {
    event.preventDefault();
    if (!state.auth || !state.authApi) {
        showLogin('انتظر اكتمال الاتصال بخدمة تسجيل الدخول.');
        return;
    }

    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) {
        showLogin('أدخل البريد الإلكتروني وكلمة المرور.');
        return;
    }

    $('login-btn').disabled = true;
    $('login-btn').textContent = 'جارٍ التحقق…';
    $('login-message').textContent = '';
    try {
        await state.authApi.signInWithEmailAndPassword(state.auth, email, password);
        $('login-password').value = '';
    } catch (error) {
        showLogin(friendlyAuthError(error));
    }
}

async function handleLogout() {
    if (state.cart.length) {
        const approved = await showConfirm('توجد فاتورة غير محفوظة. هل تريد تسجيل الخروج؟', 'تسجيل الخروج');
        if (!approved) return;
    }
    if (state.auth && state.authApi) await state.authApi.signOut(state.auth);
}

async function loadUserProfile(user) {
    const { doc, getDoc } = state.firebase;
    const snapshot = await getDoc(doc(state.db, 'users', user.uid));
    if (!snapshot.exists()) throw new Error('profile-not-found');
    const data = snapshot.data();
    if (data.active !== true) throw new Error('profile-disabled');
    return {
        uid: user.uid,
        email: user.email || '',
        name: String(data.name || user.email?.split('@')[0] || 'مستخدم'),
        role: data.role === 'admin' ? 'admin' : 'cashier'
    };
}

function startInvoicesListener() {
    if (state.unsubscribeInvoices) state.unsubscribeInvoices();
    const { collection, onSnapshot, query, where } = state.firebase;
    const invoicesRef = collection(state.db, 'stores', STORE_ID, 'invoices');
    const invoicesQuery = state.currentUser.role === 'admin'
        ? invoicesRef
        : query(invoicesRef, where('createdBy', '==', state.currentUser.uid));

    state.unsubscribeInvoices = onSnapshot(invoicesQuery, snapshot => {
        const cloudInvoices = snapshot.docs.map((snapshotDoc, index) => normalizeInvoice({
            ...snapshotDoc.data(),
            id: snapshotDoc.id
        }, index)).filter(invoice => !invoice.deleted);
        mergeCloudInvoices(cloudInvoices, !snapshot.metadata.fromCache);
        setSyncStatus(
            snapshot.metadata.fromCache ? 'is-local' : 'is-online',
            snapshot.metadata.fromCache ? 'بيانات محفوظة محلياً' : 'متصل ومزامَن'
        );
        syncPendingChanges();
    }, error => {
        console.warn('Cloud listener failed:', error);
        setSyncStatus('is-error', 'تعذر قراءة البيانات السحابية');
    });
}

async function initializeFirebase() {
    setSyncStatus('is-local', 'جارٍ الاتصال بالسحابة…');
    try {
        const [appModule, firestoreModule, authModule] = await Promise.all([
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
            import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')
        ]);

        const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(FIREBASE_CONFIG);
        let db;
        try {
            db = firestoreModule.initializeFirestore(app, {
                localCache: firestoreModule.persistentLocalCache({
                    tabManager: firestoreModule.persistentMultipleTabManager()
                })
            });
        } catch {
            db = firestoreModule.getFirestore(app);
        }

        state.db = db;
        state.firebase = firestoreModule;
        state.authApi = authModule;
        state.auth = authModule.getAuth(app);
        await authModule.setPersistence(state.auth, authModule.browserLocalPersistence);

        authModule.onAuthStateChanged(state.auth, async user => {
            if (!user) {
                state.cloudReady = false;
                state.currentUser = null;
                if (state.unsubscribeInvoices) state.unsubscribeInvoices();
                state.unsubscribeInvoices = null;
                showLogin();
                return;
            }

            try {
                const profile = await loadUserProfile(user);
                state.cloudReady = true;
                showAuthenticatedApp(profile);
                startInvoicesListener();
                await syncPendingChanges();
            } catch (error) {
                console.warn('User profile unavailable:', error);
                await authModule.signOut(state.auth);
                const message = error.message === 'profile-disabled'
                    ? 'هذا الحساب موقوف. تواصل مع المدير.'
                    : 'لا يوجد ملف مستخدم صالح لهذا الحساب.';
                showLogin(message);
            }
        });
    } catch (error) {
        console.warn('Firebase unavailable:', error);
        state.cloudReady = false;
        setSyncStatus(navigator.onLine ? 'is-error' : 'is-offline', navigator.onLine ? 'تعذر تحميل خدمة الدخول' : 'لا يوجد اتصال بالإنترنت');
        showLogin(navigator.onLine ? 'تعذر تحميل خدمة تسجيل الدخول. أعد فتح الصفحة.' : 'يلزم الاتصال بالإنترنت عند تسجيل الدخول لأول مرة.');
    }
}

function bindEvents() {
    $('login-form').addEventListener('submit', handleLogin);
    $('toggle-password').addEventListener('click', () => {
        const password = $('login-password');
        const showing = password.type === 'text';
        password.type = showing ? 'password' : 'text';
        $('toggle-password').textContent = showing ? 'إظهار' : 'إخفاء';
    });
    $('logout-btn').addEventListener('click', handleLogout);

    document.querySelectorAll('.nav-btn').forEach(button => {
        button.addEventListener('click', () => switchView(button.dataset.view));
    });

    $('quick-prices').addEventListener('click', event => {
        const button = event.target.closest('[data-price]');
        if (!button) return;
        addItem($('item-name').value, button.dataset.price, $('item-qty').value);
    });
    $('add-item-btn').addEventListener('click', () => addItem($('item-name').value, $('item-price').value, $('item-qty').value));
    ['item-name', 'item-price', 'item-qty'].forEach(id => {
        $(id).addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addItem($('item-name').value, $('item-price').value, $('item-qty').value);
            }
        });
    });

    $('cart-body').addEventListener('click', handleCartAction);
    $('cart-mobile').addEventListener('click', handleCartAction);
    $('payment-method').addEventListener('change', updatePaymentFields);
    $('paid-amount').addEventListener('input', updateCreditRemaining);
    $('save-invoice-btn').addEventListener('click', () => saveCurrentInvoice(false));
    $('save-print-btn').addEventListener('click', () => saveCurrentInvoice(true));
    $('new-invoice-btn').addEventListener('click', startNewInvoice);
    $('clear-invoice-btn').addEventListener('click', clearCurrentInvoice);

    ['history-search', 'history-from', 'history-to', 'history-payment'].forEach(id => {
        $(id).addEventListener(id === 'history-search' ? 'input' : 'change', renderHistory);
    });
    $('refresh-invoices-btn').addEventListener('click', () => {
        renderHistory();
        syncPendingChanges();
        toast('تم تحديث قائمة الفواتير.');
    });
    $('history-body').addEventListener('click', handleInvoiceAction);
    $('history-mobile').addEventListener('click', handleInvoiceAction);

    $('report-date').addEventListener('change', renderReport);
    $('export-report-btn').addEventListener('click', exportReportCsv);
    $('print-report-btn').addEventListener('click', printReport);

    $('close-modal-btn').addEventListener('click', closeInvoiceModal);
    $('modal-close-btn').addEventListener('click', closeInvoiceModal);
    $('modal-print-btn').addEventListener('click', printSelectedInvoice);
    $('invoice-modal').addEventListener('click', event => {
        if (event.target === $('invoice-modal')) closeInvoiceModal();
    });
    $('confirm-yes').addEventListener('click', () => closeConfirm(true));
    $('confirm-no').addEventListener('click', () => closeConfirm(false));
    $('confirm-modal').addEventListener('click', event => {
        if (event.target === $('confirm-modal')) closeConfirm(false);
    });

    window.addEventListener('online', () => {
        if (state.cloudReady) syncPendingChanges();
        else if (!state.auth) initializeFirebase();
    });
    window.addEventListener('offline', () => setSyncStatus('is-offline', 'غير متصل - حفظ محلي'));
    window.addEventListener('afterprint', () => {
        document.body.classList.remove('print-invoice', 'print-report');
    });
}

function initializeApp() {
    loadInvoices();
    migrateLegacyInvoices();
    renderQuickPrices();
    $('report-date').value = localDateKey();
    initializeForm();
    bindEvents();
    renderAllDataViews();
    initializeFirebase();
}

document.addEventListener('DOMContentLoaded', initializeApp);
