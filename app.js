// ==================== Constants ====================

const DISCOUNT_LEVELS = {
    NONE: { name: 'بدون تخفيف', color: '#28a745', multiplier: 1 },
    SMALL: { name: 'تخفيف صغير', color: '#ffc107', multiplier: 0.9 },
    MEDIUM: { name: 'تخفيف متوسط', color: '#ff9800', multiplier: 0.8 },
    LARGE: { name: 'تخفيف كبير', color: '#f44336', multiplier: 0.7 }
};

const THRESHOLD_QUANTITIES = {
    SMALL: 5,
    MEDIUM: 10,
    LARGE: 20
};

// ==================== State Management ====================

let products = [
    { id: 1, name: 'منتج 1', basePrice: 100, quantity: 0 },
    { id: 2, name: 'منتج 2', basePrice: 150, quantity: 0 },
    { id: 3, name: 'منتج 3', basePrice: 200, quantity: 0 },
    { id: 4, name: 'منتج 4', basePrice: 75, quantity: 0 },
    { id: 5, name: 'منتج 5', basePrice: 120, quantity: 0 }
];

let cartItems = [];

// ==================== Utility Functions ====================

function calculateDiscountLevel(quantity) {
    if (quantity >= THRESHOLD_QUANTITIES.LARGE) {
        return 'LARGE';
    } else if (quantity >= THRESHOLD_QUANTITIES.MEDIUM) {
        return 'MEDIUM';
    } else if (quantity >= THRESHOLD_QUANTITIES.SMALL) {
        return 'SMALL';
    }
    return 'NONE';
}

function calculateFinalPrice(basePrice, quantity) {
    const discountLevel = calculateDiscountLevel(quantity);
    const multiplier = DISCOUNT_LEVELS[discountLevel].multiplier;
    return Math.round(basePrice * multiplier * 100) / 100;
}

function calculateSavings(basePrice, finalPrice, quantity) {
    const savingsPerUnit = basePrice - finalPrice;
    return Math.round(savingsPerUnit * quantity * 100) / 100;
}

function generateInvoiceNumber() {
    return 'INV-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// ==================== LocalStorage Functions ====================

function saveInvoice(invoice) {
    let invoices = JSON.parse(localStorage.getItem('invoices')) || [];
    invoices.push(invoice);
    localStorage.setItem('invoices', JSON.stringify(invoices));
}

function getInvoices() {
    return JSON.parse(localStorage.getItem('invoices')) || [];
}

function deleteInvoice(invoiceId) {
    let invoices = JSON.parse(localStorage.getItem('invoices')) || [];
    invoices = invoices.filter(inv => inv.id !== invoiceId);
    localStorage.setItem('invoices', JSON.stringify(invoices));
}

// ==================== Cart Management ====================

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cartItems.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cartItems.push({
            id: productId,
            name: product.name,
            basePrice: product.basePrice,
            quantity: 1
        });
    }

    updateCartDisplay();
}

function removeFromCart(productId) {
    cartItems = cartItems.filter(item => item.id !== productId);
    updateCartDisplay();
}

function updateQuantity(productId, newQuantity) {
    const item = cartItems.find(item => item.id === productId);
    if (item) {
        if (newQuantity <= 0) {
            removeFromCart(productId);
        } else {
            item.quantity = parseInt(newQuantity);
            updateCartDisplay();
        }
    }
}

function clearCart() {
    cartItems = [];
    updateCartDisplay();
}

// ==================== Display Functions ====================

function updateProductsDisplay() {
    const productsContainer = document.getElementById('products-container');
    productsContainer.innerHTML = '';

    products.forEach(product => {
        const discountLevel = calculateDiscountLevel(product.quantity);
        const finalPrice = calculateFinalPrice(product.basePrice, product.quantity);
        const discountInfo = DISCOUNT_LEVELS[discountLevel];
        const savings = calculateSavings(product.basePrice, finalPrice, product.quantity);

        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.style.borderTopColor = discountInfo.color;

        productCard.innerHTML = `
            <h3>${product.name}</h3>
            <div class="product-info">
                <div class="price-section">
                    <span class="base-price">السعر الأساسي: ${product.basePrice} ريال</span>
                    <span class="final-price" style="color: ${discountInfo.color}">السعر النهائي: ${finalPrice} ريال</span>
                </div>
                <div class="discount-badge" style="background-color: ${discountInfo.color}">
                    ${discountInfo.name}
                </div>
            </div>
            <div class="quantity-control">
                <span class="quantity-label">الكمية:</span>
                <input type="number" min="0" value="${product.quantity}" onchange="updateQuantity(${product.id}, this.value)">
            </div>
            ${savings > 0 ? `<div class="savings-info">توفير: ${savings} ريال</div>` : ''}
            <button class="add-btn" onclick="addToCart(${product.id})">➕ أضف للسلة</button>
        `;

        productsContainer.appendChild(productCard);
    });
}

function updateCartDisplay() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartSummary = document.getElementById('cart-summary');

    if (cartItems.length === 0) {
        cartItemsContainer.innerHTML = '<div class="empty-cart">السلة فارغة</div>';
        cartSummary.innerHTML = '';
        updateProductsDisplay();
        return;
    }

    cartItemsContainer.innerHTML = '';
    let totalPrice = 0;
    let totalSavings = 0;
    let totalItems = 0;

    cartItems.forEach(item => {
        const discountLevel = calculateDiscountLevel(item.quantity);
        const finalPrice = calculateFinalPrice(item.basePrice, item.quantity);
        const savings = calculateSavings(item.basePrice, finalPrice, item.quantity);
        const itemTotal = Math.round(finalPrice * item.quantity * 100) / 100;

        totalPrice += itemTotal;
        totalSavings += savings;
        totalItems += item.quantity;

        const discountInfo = DISCOUNT_LEVELS[discountLevel];

        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div class="cart-item-header">
                <h4>${item.name}</h4>
                <span class="discount-badge-small" style="background-color: ${discountInfo.color}">
                    ${discountInfo.name}
                </span>
            </div>
            <div class="cart-item-details">
                <span>السعر الأساسي: ${item.basePrice} ريال</span>
                <span>السعر بعد التخفيف: ${finalPrice} ريال</span>
                <span>الكمية: ${item.quantity}</span>
            </div>
            <div class="cart-item-total">
                الإجمالي: ${itemTotal} ريال
            </div>
            ${savings > 0 ? `<div class="cart-savings">توفير: ${savings} ريال</div>` : ''}
            <div class="cart-item-controls">
                <input type="number" value="${item.quantity}" min="1" onchange="updateQuantity(${item.id}, this.value)">
                <button class="remove-btn" onclick="removeFromCart(${item.id})">حذف</button>
            </div>
        `;

        cartItemsContainer.appendChild(cartItem);
    });

    cartSummary.innerHTML = `
        <div class="summary-item">
            <span>عدد العناصر:</span>
            <strong id="total-items">${totalItems}</strong>
        </div>
        <div class="summary-item">
            <span>الإجمالي النهائي:</span>
            <strong id="total-price" style="color: #1565c0;">${totalPrice.toFixed(2)} ريال</strong>
        </div>
        <div class="summary-item savings">
            <span>إجمالي التوفير:</span>
            <strong id="total-savings" style="color: #4CAF50;">${totalSavings.toFixed(2)} ريال</strong>
        </div>
    `;

    updateProductsDisplay();
}

// ==================== Invoice Functions ====================

function createInvoiceObject() {
    let totalPrice = 0;
    let totalSavings = 0;

    const items = cartItems.map(item => {
        const finalPrice = calculateFinalPrice(item.basePrice, item.quantity);
        const savings = calculateSavings(item.basePrice, finalPrice, item.quantity);
        const itemTotal = Math.round(finalPrice * item.quantity * 100) / 100;

        totalPrice += itemTotal;
        totalSavings += savings;

        return {
            id: item.id,
            name: item.name,
            basePrice: item.basePrice,
            finalPrice: finalPrice,
            quantity: item.quantity,
            itemTotal: itemTotal,
            savings: savings
        };
    });

    return {
        id: generateInvoiceNumber(),
        items: items,
        totalPrice: Math.round(totalPrice * 100) / 100,
        totalSavings: Math.round(totalSavings * 100) / 100,
        date: new Date().toISOString(),
        formattedDate: formatDate(new Date())
    };
}

function completeTransaction() {
    if (cartItems.length === 0) {
        alert('السلة فارغة!');
        return;
    }

    const invoice = createInvoiceObject();
    saveInvoice(invoice);
    printInvoice(invoice);
    clearCart();
    alert('تمت العملية بنجاح! تم حفظ الفاتورة.');
}

function printInvoice(invoice) {
    let printContent = `
        <html dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>الفاتورة</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Arial', sans-serif;
                    margin: 0;
                    padding: 10px;
                    width: 80mm;
                    background: white;
                }
                .receipt {
                    text-align: center;
                    font-size: 11px;
                    line-height: 1.6;
                }
                .header {
                    border-bottom: 2px dashed #000;
                    padding-bottom: 10px;
                    margin-bottom: 10px;
                }
                .header h2 {
                    margin: 0;
                    font-size: 14px;
                    margin-bottom: 5px;
                }
                .header p {
                    margin: 3px 0;
                    font-size: 10px;
                }
                .items {
                    border-bottom: 2px dashed #000;
                    padding: 10px 0;
                    margin: 10px 0;
                    text-align: right;
                }
                .item-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 10px;
                    padding: 4px 0;
                    text-align: right;
                }
                .item-name {
                    font-weight: bold;
                    padding-top: 5px;
                }
                .totals {
                    border-top: 2px dashed #000;
                    padding-top: 10px;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    font-weight: bold;
                    padding: 5px 0;
                    font-size: 11px;
                }
                .total-row span:last-child {
                    color: #28a745;
                }
                .savings-row {
                    color: #4CAF50;
                }
                .footer {
                    margin-top: 15px;
                    font-size: 9px;
                    padding-top: 10px;
                    border-top: 1px dashed #000;
                }
                .footer p {
                    margin: 5px 0;
                }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h2>🛒 فاتورة البيع</h2>
                    <p>نظام تخفيضات السعر الأنسب</p>
                    <p>رقم الفاتورة: ${invoice.id}</p>
                    <p>${invoice.formattedDate}</p>
                </div>
                <div class="items">
    `;

    invoice.items.forEach(item => {
        printContent += `
            <div class="item-name">${item.name}</div>
            <div class="item-row">
                <span>${item.itemTotal} ريال</span>
                <span>×${item.quantity} × ${item.finalPrice}</span>
            </div>
        `;
    });

    printContent += `
                </div>
                <div class="totals">
                    <div class="total-row">
                        <span>${invoice.totalPrice} ريال</span>
                        <span>الإجمالي:</span>
                    </div>
                    <div class="total-row savings-row">
                        <span>${invoice.totalSavings} ريال</span>
                        <span>التوفير:</span>
                    </div>
                </div>
                <div class="footer">
                    <p>شكراً لتعاملكم معنا 🙏</p>
                    <p>نأمل رؤيتكم قريباً</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '', 'width=400,height=600');
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 250);
}

// ==================== Invoice History ====================

function showInvoices() {
    const invoices = getInvoices();
    const modal = document.getElementById('invoices-modal');
    const invoicesList = document.getElementById('invoices-list');

    if (invoices.length === 0) {
        invoicesList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">لا توجد فواتير محفوظة</p>';
        modal.style.display = 'block';
        return;
    }

    invoicesList.innerHTML = '';

    invoices.reverse().forEach(invoice => {
        const invoiceDiv = document.createElement('div');
        invoiceDiv.className = 'invoice-item';
        invoiceDiv.innerHTML = `
            <div class="invoice-header">
                <div>
                    <strong>${invoice.id}</strong>
                    <div class="invoice-date">${invoice.formattedDate}</div>
                </div>
                <div class="invoice-amount">${invoice.totalPrice} ريال</div>
            </div>
            <div>عدد المنتجات: ${invoice.items.length}</div>
            <div style="color: #4CAF50; margin-top: 5px;">توفير: ${invoice.totalSavings} ريال</div>
            <div class="invoice-actions">
                <button class="print-invoice-btn" onclick="printSavedInvoice('${invoice.id}')">🖨️ طباعة</button>
                <button class="delete-invoice-btn" onclick="deleteAndRefresh('${invoice.id}')">🗑️ حذف</button>
            </div>
        `;
        invoicesList.appendChild(invoiceDiv);
    });

    modal.style.display = 'block';
}

function printSavedInvoice(invoiceId) {
    const invoices = getInvoices();
    const invoice = invoices.find(inv => inv.id === invoiceId);

    if (invoice) {
        printInvoice(invoice);
    }
}

function deleteAndRefresh(invoiceId) {
    if (confirm('هل تريد حذف هذه الفاتورة؟')) {
        deleteInvoice(invoiceId);
        showInvoices();
    }
}

function closeInvoices() {
    document.getElementById('invoices-modal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('invoices-modal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// ==================== Initialize App ====================

document.addEventListener('DOMContentLoaded', function() {
    updateProductsDisplay();
    updateCartDisplay();
});
