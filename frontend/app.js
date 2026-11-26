"use strict";

/* ==========================================
   1. CONFIGURATION
========================================== */

const API_URL = "https://iyaans-cafe-backend.onrender.com/api";

const $ = id => document.getElementById(id);

let menuItems = [];
let orders = [];
let cart = [];

let activeCategory = "All";
let selectedPaymentBill = null;
let currentReceiptOrder = null;
let isSavingOrder = false;

let settings = JSON.parse(
  localStorage.getItem("iyyaans_settings") ||
  JSON.stringify({
    cafeName: "IYYAANS CAFE",
    receiptFooter: "Thank you! Visit Again",
    printerType: "System",
    paperSize: "80mm"
  })
);

let reportRange = {
  type: "today",
  from: localDateString(new Date()),
  to: localDateString(new Date()),
  label: "Showing today's report"
};

let deferredInstallPrompt = null;


/* ==========================================
   2. COMMON FUNCTIONS
========================================== */

function money(amount) {
  return "₹" + Number(amount || 0).toFixed(2);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function openModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove("active");
}

function getDateTime() {
  return new Date().toISOString();
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function orderLocalDate(order) {
  const value = order.createdAt || order.date || order.updatedAt;

  if (!value) return "";

  return localDateString(new Date(value));
}


/* ==========================================
   3. API CONNECTION
========================================== */

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem("adminToken");

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("adminToken");
    window.location.replace("login.html");
    throw new Error("Session expired. Please login again.");
  }

  return response;
}

async function readApiResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Server error: ${response.status}`
    );
  }

  return data;
}

function normalizeList(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data[key])) return data[key];
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.orders)) return data.orders;

  return [];
}


/* ==========================================
   4. NAVIGATION
========================================== */

document.querySelectorAll(".nav-item").forEach(button => {

  button.addEventListener("click", () => {

    const page = button.dataset.page;

    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    document.querySelectorAll(".page").forEach(section => {
      section.classList.remove("active");
    });

    const targetPage = $(`${page}Page`);

    if (targetPage) {
      targetPage.classList.add("active");
    }

    const titles = {
      orders: "Orders",
      billing: "Billing",
      reports: "Reports",
      settings: "Settings"
    };

    if ($("pageTitle")) {
      $("pageTitle").textContent = titles[page] || "Orders";
    }

    $("sidebar")?.classList.remove("open");

    if (page === "billing") renderBills();
    if (page === "reports") renderReports();
  });

});


/* ==========================================
   5. LOGOUT
========================================== */

$("logoutBtn")?.addEventListener("click", () => {

  if (!confirm("Are you sure you want to logout?")) return;

  localStorage.removeItem("adminToken");
  window.location.replace("login.html");

});


/* ==========================================
   6. MOBILE SIDEBAR
========================================== */

$("menuToggle")?.addEventListener("click", () => {
  $("sidebar")?.classList.toggle("open");
});


/* ==========================================
   7. CART OPEN / CLOSE
========================================== */

$("cartToggle")?.addEventListener("click", () => {
  $("cartPanel")?.classList.add("open");
});

$("closeCart")?.addEventListener("click", () => {
  $("cartPanel")?.classList.remove("open");
});


/* ==========================================
   8. MODAL CONTROLS
========================================== */

document.querySelectorAll("[data-close]").forEach(button => {

  button.addEventListener("click", () => {
    closeModal(button.dataset.close);
  });

});

$("addItemBtn")?.addEventListener("click", () => {
  openModal("itemModal");
});


/* ==========================================
   9. ADD NEW MENU ITEM
========================================== */

$("itemForm")?.addEventListener("submit", async event => {

  event.preventDefault();

  const name = $("newItemName").value.trim();
  const price = Number($("newItemPrice").value);
  const category = $("newItemCategory").value.trim();

  if (!name || !category || !Number.isFinite(price) || price < 0) {
    showToast("Enter valid item details");
    return;
  }

  try {

    const response = await apiFetch("/items", {
      method: "POST",
      body: JSON.stringify({
        name,
        price,
        category
      })
    });

    await readApiResponse(response);

    $("itemForm").reset();

    closeModal("itemModal");

    await loadMenuItems();

    showToast("Item added successfully");

  } catch (error) {

    console.error("Add Item Error:", error);
    showToast(error.message || "Failed to add item");

  }

});


/* ==========================================
   10. CATEGORY FILTER
========================================== */

function renderCategories() {

  const container = $("categories");
  if (!container) return;

  const categories = [
    "All",
    ...new Set(menuItems.map(item => item.category).filter(Boolean))
  ];

  container.innerHTML = categories.map(category => `
    <button
      class="category-btn ${activeCategory === category ? "active" : ""}"
      data-category="${escapeHTML(category)}">
      ${escapeHTML(category)}
    </button>
  `).join("");

  container.querySelectorAll("[data-category]").forEach(button => {

    button.addEventListener("click", () => {

      activeCategory = button.dataset.category;

      renderCategories();
      renderMenu();

    });

  });

}


/* ==========================================
   11. DISPLAY MENU
========================================== */

function renderMenu() {

  const grid = $("menuGrid");
  if (!grid) return;

  const search = $("searchItems")?.value.toLowerCase().trim() || "";

  const filtered = menuItems.filter(item => {

    const matchesCategory =
      activeCategory === "All" ||
      item.category === activeCategory;

    const matchesSearch =
      String(item.name || "").toLowerCase().includes(search);

    return matchesCategory && matchesSearch;

  });

  if ($("menuCount")) {
    $("menuCount").textContent = `${filtered.length} Items`;
  }

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="no-items">No menu items found</div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(item => {

    const id = item._id || item.id;

    return `
      <div class="menu-card">

        <div class="menu-card-info">
          <h3>${escapeHTML(item.name)}</h3>
          <p>${escapeHTML(item.category || "")}</p>
          <strong>${money(item.price)}</strong>
        </div>

        <button
          type="button"
          class="add-cart-btn"
          data-add-item="${escapeHTML(id)}">
          + Add
        </button>

      </div>
    `;

  }).join("");

  grid.querySelectorAll("[data-add-item]").forEach(button => {

    button.addEventListener("click", () => {
      addToCart(button.dataset.addItem);
    });

  });

}


/* ==========================================
   12. SEARCH MENU
========================================== */

$("searchItems")?.addEventListener("input", renderMenu);


/* ==========================================
   13. ADD TO CART
========================================== */

function addToCart(id) {

  const item = menuItems.find(
    item => String(item._id || item.id) === String(id)
  );

  if (!item) return;

  const existing = cart.find(
    cartItem => String(cartItem.id) === String(id)
  );

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({
      id: item._id || item.id,
      name: item.name,
      price: Number(item.price),
      quantity: 1
    });
  }

  renderCart();

  showToast(`${item.name} added`);

}


/* ==========================================
   14. CHANGE ITEM QUANTITY
========================================== */

function changeQuantity(id, change) {

  const item = cart.find(
    item => String(item.id) === String(id)
  );

  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    cart = cart.filter(
      cartItem => String(cartItem.id) !== String(id)
    );
  }

  renderCart();

}


/* ==========================================
   15. CLEAR CART
========================================== */

$("clearCart")?.addEventListener("click", () => {

  if (!cart.length) return;

  if (!confirm("Clear all cart items?")) return;

  cart = [];

  renderCart();

});


/* ==========================================
   16. CALCULATE TOTAL
========================================== */

function calculateTotal() {

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const tax = 0;

  const discount = Math.min(
    Math.max(0, Number($("discountAmount")?.value) || 0),
    subtotal + tax
  );

  const total = Math.max(0, subtotal + tax - discount);

  return {
    subtotal,
    tax,
    discount,
    total
  };

}


/* ==========================================
   17. RENDER CART
========================================== */

function renderCart() {

  const container = $("cartItems");
  if (!container) return;

  const count = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  if ($("cartCount")) {
    $("cartCount").textContent = count;
  }

  if ($("cartBadge")) {
    $("cartBadge").textContent = count;
  }

  if (!cart.length) {

    container.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon">🛒</div>
        <h4>Your cart is empty</h4>
        <p>Select items from the menu</p>
      </div>
    `;

  } else {

    container.innerHTML = cart.map(item => `

      <div class="cart-item">

        <div class="cart-item-info">
          <h4>${escapeHTML(item.name)}</h4>
          <p>${money(item.price)} × ${item.quantity}</p>
          <strong>${money(item.price * item.quantity)}</strong>
        </div>

        <div class="quantity-controls">

          <button
            type="button"
            data-quantity-id="${escapeHTML(item.id)}"
            data-change="-1">−</button>

          <span>${item.quantity}</span>

          <button
            type="button"
            data-quantity-id="${escapeHTML(item.id)}"
            data-change="1">+</button>

        </div>

      </div>

    `).join("");

    container.querySelectorAll("[data-quantity-id]").forEach(button => {

      button.addEventListener("click", () => {

        changeQuantity(
          button.dataset.quantityId,
          Number(button.dataset.change)
        );

      });

    });

  }

  const totals = calculateTotal();

  if ($("subtotal")) $("subtotal").textContent = money(totals.subtotal);
  if ($("tax")) $("tax").textContent = money(totals.tax);
  if ($("discountValue")) $("discountValue").textContent = money(totals.discount);
  if ($("total")) $("total").textContent = money(totals.total);

  if ($("saveOrder")) {
    $("saveOrder").disabled = !cart.length || isSavingOrder;
  }

  if ($("savePrint")) {
    $("savePrint").disabled = !cart.length || isSavingOrder;
  }

}


/* ==========================================
   18. DISCOUNT CHANGE
========================================== */

$("discountAmount")?.addEventListener("input", renderCart);


/* ==========================================
   19. GENERATE BILL NUMBER
========================================== */

function generateBillNumber() {

  const highest = orders.reduce((max, order) => {

    return Math.max(
      max,
      Number(order.billNumber) || 0
    );

  }, 100);

  return String(highest + 1).padStart(4, "0");

}


/* ==========================================
   20. CREATE ORDER
========================================== */

async function createOrder() {

  if (isSavingOrder) return null;

  if (!cart.length) {
    showToast("Please add items first");
    return null;
  }

  const totals = calculateTotal();

  if (totals.total <= 0) {
    showToast("Invalid order total");
    return null;
  }

  isSavingOrder = true;
  renderCart();

  try {

    const orderData = {
      billNumber: generateBillNumber(),

      items: cart.map(item => ({
        itemId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.price * item.quantity
      })),

      subtotal: totals.subtotal,
      tax: totals.tax,
      discount: totals.discount,
      total: totals.total,

      paymentMethod: "Pending",
      paymentStatus: "Pending",
      status: "Pending",

      createdAt: getDateTime()
    };

    const response = await apiFetch("/orders", {
      method: "POST",
      body: JSON.stringify(orderData)
    });

    const savedOrder = await readApiResponse(response);

    cart = [];

    if ($("discountAmount")) {
      $("discountAmount").value = 0;
    }

    renderCart();

    await loadOrders();

    showToast("Order saved successfully");

    return savedOrder.order || savedOrder.data || savedOrder;

  } catch (error) {

    console.error("Save Order Error:", error);
    showToast(error.message || "Failed to save order");

    return null;

  } finally {

    isSavingOrder = false;
    renderCart();

  }

}


/* ==========================================
   21. SAVE ORDER BUTTON
========================================== */

$("saveOrder")?.addEventListener("click", async () => {

  await createOrder();

});


/* ==========================================
   22. SAVE AND PRINT BUTTON
========================================== */

$("savePrint")?.addEventListener("click", async () => {

  const savedOrder = await createOrder();

  if (!savedOrder) return;

  currentReceiptOrder = savedOrder;

  openReceipt(savedOrder);

});
/* ==========================================
   23. DELETE BILL
========================================== */

async function deleteBill(id) {

  if (!confirm("Delete this unsettled bill?")) return;

  try {

    const response = await apiFetch(`/orders/${id}`, {
      method: "DELETE"
    });

    await readApiResponse(response);

    await loadOrders();

    renderBills();

    showToast("Bill deleted successfully");

  } catch (error) {

    console.error("Delete Bill Error:", error);
    showToast(error.message || "Failed to delete bill");

  }

}


/* ==========================================
   24. OPEN PAYMENT
========================================== */

function openPayment(id) {

  const order = orders.find(
    item => String(item._id || item.id) === String(id)
  );

  if (!order) return;

  selectedPaymentBill = order;

  if ($("paymentBillInfo")) {
    $("paymentBillInfo").innerHTML = `
      <h3>Bill #${escapeHTML(order.billNumber || "")}</h3>
      <p>Total: <strong>${money(order.total)}</strong></p>
    `;
  }

  if ($("paymentMethod")) {
    $("paymentMethod").value = "Cash";
  }

  if ($("splitFields")) {
    $("splitFields").classList.add("hidden");
  }

  openModal("paymentModal");

}


/* ==========================================
   25. PAYMENT METHOD CHANGE
========================================== */

$("paymentMethod")?.addEventListener("change", () => {

  const split = $("paymentMethod").value === "Split";

  $("splitFields")?.classList.toggle("hidden", !split);

});


/* ==========================================
   26. CONFIRM PAYMENT
========================================== */

$("confirmPayment")?.addEventListener("click", async () => {

  if (!selectedPaymentBill) return;

  const id = selectedPaymentBill._id || selectedPaymentBill.id;
  const method = $("paymentMethod")?.value;

  const total = Number(selectedPaymentBill.total || 0);

  let paymentData = {
    paymentMethod: method,
    paymentStatus: "Paid",
    status: "Paid"
  };

  if (method === "Split") {

    const cash = Number($("splitCash")?.value || 0);
    const gpay = Number($("splitGpay")?.value || 0);

    if (cash <= 0 || gpay <= 0 || Math.abs(cash + gpay - total) > 0.01) {
      showToast("Split amounts must equal bill total");
      return;
    }

    paymentData.cashAmount = cash;
    paymentData.gpayAmount = gpay;
  }

  try {

    const response = await apiFetch(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(paymentData)
    });

    await readApiResponse(response);

    closeModal("paymentModal");

    selectedPaymentBill = null;

    await loadOrders();

    renderBills();
    renderReports();

    showToast("Payment completed successfully");

  } catch (error) {

    console.error("Payment Error:", error);
    showToast(error.message || "Payment failed");

  }

});


/* ==========================================
   27. REPORT DATE RANGE
========================================== */

function setReportRange(from, to, label, type = "custom") {

  reportRange = {
    type,
    from,
    to,
    label
  };

  if ($("reportRangeLabel")) {
    $("reportRangeLabel").textContent = label;
  }

  renderReports();

}


/* ==========================================
   28. REPORT PRESET RANGE
========================================== */

function applyPresetRange(type) {

  const today = new Date();

  let from = new Date(today);
  let to = new Date(today);
  let label = "";

  if (type === "today") {

    label = "Showing today's report";

  } else if (type === "15days") {

    from.setDate(today.getDate() - 14);
    label = "Showing last 15 days";

  } else if (type === "month") {

    from = new Date(today.getFullYear(), today.getMonth(), 1);
    label = "Showing this month";

  }

  if ($("reportFromDate")) {
    $("reportFromDate").value = localDateString(from);
  }

  if ($("reportToDate")) {
    $("reportToDate").value = localDateString(to);
  }

  if ($("customDateFields")) {
    $("customDateFields").hidden = true;
  }

  setReportRange(
    localDateString(from),
    localDateString(to),
    label,
    type
  );

}


/* ==========================================
   29. REPORT PRESET BUTTONS
========================================== */

document.querySelectorAll("[data-range]").forEach(button => {

  button.addEventListener("click", () => {
    applyPresetRange(button.dataset.range);
  });

});


/* ==========================================
   30. CUSTOM DATE FILTER
========================================== */

$("calendarToggle")?.addEventListener("click", () => {

  if ($("customDateFields")) {
    $("customDateFields").hidden =
      !$("customDateFields").hidden;
  }

});


$("applyReportDates")?.addEventListener("click", () => {

  const from = $("reportFromDate")?.value;
  const to = $("reportToDate")?.value;

  if (!from || !to) {
    showToast("Select both dates");
    return;
  }

  if (from > to) {
    showToast("From date cannot be after To date");
    return;
  }

  setReportRange(
    from,
    to,
    `Showing ${from} to ${to}`,
    "custom"
  );

  if ($("customDateFields")) {
    $("customDateFields").hidden = true;
  }

});


/* ==========================================
   31. GET REPORT ORDERS
========================================== */

function getReportOrders() {

  return orders.filter(order => {

    const date = orderLocalDate(order);

    return (
      date >= reportRange.from &&
      date <= reportRange.to
    );

  });

}


/* ==========================================
   32. BUILD REPORT DATA
========================================== */

function buildReportData() {

  const filtered = getReportOrders();

  const settled = filtered.filter(order =>
    order.paymentStatus === "Paid" ||
    order.paymentStatus === "Settled" ||
    order.status === "Paid" ||
    order.status === "Settled"
  );

  const pending = filtered.filter(order =>
    !settled.includes(order)
  );

  const sales = settled.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0
  );

  const cash = settled.reduce((sum, order) => {

    if (order.paymentMethod === "Cash") {
      return sum + Number(order.total || 0);
    }

    if (order.paymentMethod === "Split") {
      return sum + Number(order.cashAmount || 0);
    }

    return sum;

  }, 0);

  const gpay = settled.reduce((sum, order) => {

    if (order.paymentMethod === "GPay") {
      return sum + Number(order.total || 0);
    }

    if (order.paymentMethod === "Split") {
      return sum + Number(order.gpayAmount || 0);
    }

    return sum;

  }, 0);

  return {
    filtered,
    settled,
    pending,
    sales,
    cash,
    gpay
  };

}


/* ==========================================
   33. RENDER REPORTS
========================================== */

function renderReports() {

  const data = buildReportData();

  if ($("reportSales")) {
    $("reportSales").textContent = money(data.sales);
  }

  if ($("reportOrders")) {
    $("reportOrders").textContent = data.filtered.length;
  }

  if ($("reportSettled")) {
    $("reportSettled").textContent = data.settled.length;
  }

  if ($("reportPending")) {
    $("reportPending").textContent = data.pending.length;
  }

  if ($("paymentSummary")) {

    $("paymentSummary").innerHTML = `
      <div class="payment-line">
        <span>Cash</span>
        <strong>${money(data.cash)}</strong>
      </div>

      <div class="payment-line">
        <span>GPay / UPI</span>
        <strong>${money(data.gpay)}</strong>
      </div>

      <div class="payment-line">
        <span>Split Payment</span>
        <strong>${money(
          data.settled
            .filter(order => order.paymentMethod === "Split")
            .reduce((sum, order) => sum + Number(order.total || 0), 0)
        )}</strong>
      </div>
    `;

  }

  if ($("reportTransactions")) {

    if (!data.filtered.length) {

      $("reportTransactions").innerHTML = `
        <div class="empty-message">No transactions available</div>
      `;

    } else {

      $("reportTransactions").innerHTML = data.filtered.map(order => `

        <div class="transaction-row">

          <div>
            <strong>Bill #${escapeHTML(order.billNumber || "")}</strong>
            <p>${escapeHTML(orderLocalDate(order))}</p>
          </div>

          <div>
            <strong>${money(order.total)}</strong>
            <p>${escapeHTML(order.paymentMethod || "Pending")}</p>
          </div>

        </div>

      `).join("");

    }

  }

}


/* ==========================================
   34. REFRESH REPORTS
========================================== */

$("refreshReports")?.addEventListener("click", async () => {

  await loadOrders();
  renderReports();

  showToast("Reports refreshed");

});


/* ==========================================
   35. PRINT REPORT
========================================== */

$("printReport")?.addEventListener("click", () => {

  const data = buildReportData();

  const rows = data.filtered.map(order => `
    <tr>
      <td>${escapeHTML(order.billNumber || "")}</td>
      <td>${escapeHTML(orderLocalDate(order))}</td>
      <td>${escapeHTML(order.paymentMethod || "Pending")}</td>
      <td>${money(order.total)}</td>
    </tr>
  `).join("");

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    showToast("Allow popups to print report");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>IYYAANS CAFE Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 25px; }
        h2, p { text-align: center; }
        .summary { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 9px; text-align: left; }
      </style>
    </head>
    <body>
      <h2>IYYAANS CAFE</h2>
      <p>${escapeHTML(reportRange.label)}</p>

      <div class="summary">
        <p>Total Sales: ${money(data.sales)}</p>
        <p>Total Orders: ${data.filtered.length}</p>
        <p>Settled Bills: ${data.settled.length}</p>
        <p>Pending Bills: ${data.pending.length}</p>
      </div>

      <table>
        <thead>
          <tr>
            <th>Bill</th>
            <th>Date</th>
            <th>Payment</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <script>
        window.onload = () => window.print();
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();

});


/* ==========================================
   36. SETTINGS
========================================== */

function saveData() {

  localStorage.setItem(
    "iyyaans_settings",
    JSON.stringify(settings)
  );

}

function loadSettings() {

  if ($("cafeName")) {
    $("cafeName").value = settings.cafeName || "IYYAANS CAFE";
  }

  if ($("receiptFooter")) {
    $("receiptFooter").value =
      settings.receiptFooter || "Thank you! Visit Again";
  }

  if ($("printerType")) {
    $("printerType").value = settings.printerType || "System";
  }

  if ($("paperSize")) {
    $("paperSize").value = settings.paperSize || "80mm";
  }

}


/* ==========================================
   37. SAVE BUSINESS SETTINGS
========================================== */

$("saveSettings")?.addEventListener("click", () => {

  settings.cafeName =
    $("cafeName")?.value.trim() || "IYYAANS CAFE";

  settings.receiptFooter =
    $("receiptFooter")?.value.trim() || "Thank you! Visit Again";

  saveData();

  showToast("Settings saved");

});


/* ==========================================
   38. SAVE PRINTER SETTINGS
========================================== */

$("savePrinter")?.addEventListener("click", () => {

  settings.printerType = $("printerType")?.value || "System";
  settings.paperSize = $("paperSize")?.value || "80mm";

  saveData();

  showToast("Printer settings saved");

});


/* ==========================================
   39. OPEN RECEIPT
========================================== */

function openReceipt(order) {

  currentReceiptOrder = order;

  const cafeName = settings.cafeName || "IYYAANS CAFE";

  const footer = settings.receiptFooter || "Thank you! Visit Again";

  if ($("receiptDetails")) {

    const items = order.items || [];

    $("receiptDetails").innerHTML = `

      <div class="receipt-center">
        <h2>${escapeHTML(cafeName)}</h2>
        <p>Bill: ${escapeHTML(order.billNumber || "")}</p>
      </div>

      <hr>

      ${items.map(item => `
        <div class="receipt-line">
          <span>
            ${escapeHTML(item.name)}
            × ${Number(item.quantity || 1)}
          </span>
          <strong>${money(
            Number(item.price || 0) * Number(item.quantity || 1)
          )}</strong>
        </div>
      `).join("")}

      <hr>

      <div class="receipt-line">
        <span>Subtotal</span>
        <strong>${money(order.subtotal)}</strong>
      </div>

      <div class="receipt-line">
        <span>Tax</span>
        <strong>${money(order.tax)}</strong>
      </div>

      <div class="receipt-line">
        <span>Discount</span>
        <strong>${money(order.discount)}</strong>
      </div>

      <div class="receipt-line">
        <strong>Total</strong>
        <strong>${money(order.total)}</strong>
      </div>

      <hr>

      <p class="receipt-center">${escapeHTML(footer)}</p>

    `;

  }

  openModal("receiptModal");

}


/* ==========================================
   40. PRINT RECEIPT
========================================== */

$("printReceipt")?.addEventListener("click", () => {

  if (!currentReceiptOrder) return;

  const content = $("receiptContent");

  if (!content) return;

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    showToast("Allow popups to print receipt");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>IYYAANS CAFE Receipt</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          width: ${settings.paperSize === "58mm" ? "58mm" : "80mm"};
          margin: 0 auto;
          padding: 8px;
          font-size: 12px;
        }
        .receipt-center { text-align: center; }
        .receipt-line {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin: 7px 0;
        }
        hr { border: 0; border-top: 1px dashed #000; }
        @media print {
          body { width: auto; }
        }
      </style>
    </head>
    <body>
      ${content.innerHTML}
      <script>
        window.onload = () => window.print();
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();

});


/* ==========================================
   41. DATE DISPLAY
========================================== */

if ($("dateText")) {

  $("dateText").textContent =
    new Date().toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });

}


/* ==========================================
   42. LOAD MENU ITEMS
========================================== */

async function loadMenuItems() {

  try {

    const response = await apiFetch("/items");

    const data = await readApiResponse(response);

    menuItems = normalizeList(data, "items");

    renderCategories();
    renderMenu();

  } catch (error) {

    console.error("Load Menu Error:", error);
    showToast(error.message || "Failed to load menu");

  }

}


/* ==========================================
   43. LOAD ORDERS
========================================== */

async function loadOrders() {

  try {

    const response = await apiFetch("/orders");

    const data = await readApiResponse(response);

    orders = normalizeList(data, "orders");

    renderBills();
    renderReports();

  } catch (error) {

    console.error("Load Orders Error:", error);
    showToast(error.message || "Failed to load orders");

  }

}


/* ==========================================
   44. RENDER BILLS
========================================== */

function renderBills() {

  const container = $("billList");

  if (!container) return;

  const search = $("searchBills")?.value.toLowerCase().trim() || "";

  const filtered = orders.filter(order =>
    String(order.billNumber || "").toLowerCase().includes(search)
  );

  const settled = orders.filter(order =>
    order.paymentStatus === "Paid" ||
    order.paymentStatus === "Settled" ||
    order.status === "Paid" ||
    order.status === "Settled"
  );

  const pending = orders.filter(order => !settled.includes(order));

  if ($("billCount")) $("billCount").textContent = orders.length;
  if ($("unsettledCount")) $("unsettledCount").textContent = pending.length;
  if ($("settledCount")) $("settledCount").textContent = settled.length;

  if (!filtered.length) {

    container.innerHTML = `
      <div class="empty-message">No bills available</div>
    `;

    return;

  }

  container.innerHTML = filtered.map(order => {

    const id = order._id || order.id;
    const isSettled = settled.includes(order);

    return `
      <div class="bill-card">

        <div class="bill-info">
          <h3>Bill #${escapeHTML(order.billNumber || "")}</h3>
          <p>${escapeHTML(orderLocalDate(order))}</p>
          <strong>${money(order.total)}</strong>
          <span>${isSettled ? "Settled" : "Pending"}</span>
        </div>

        <div class="bill-actions">

          ${!isSettled ? `
            <button
              type="button"
              data-pay-bill="${escapeHTML(id)}">
              Settle
            </button>

            <button
              type="button"
              data-delete-bill="${escapeHTML(id)}">
              Delete
            </button>
          ` : ""}

          <button
            type="button"
            data-print-bill="${escapeHTML(id)}">
            Receipt
          </button>

        </div>

      </div>
    `;

  }).join("");

  container.querySelectorAll("[data-pay-bill]").forEach(button => {

    button.addEventListener("click", () => {
      openPayment(button.dataset.payBill);
    });

  });

  container.querySelectorAll("[data-delete-bill]").forEach(button => {

    button.addEventListener("click", () => {
      deleteBill(button.dataset.deleteBill);
    });

  });

  container.querySelectorAll("[data-print-bill]").forEach(button => {

    button.addEventListener("click", () => {

      const order = orders.find(item =>
        String(item._id || item.id) === String(button.dataset.printBill)
      );

      if (order) openReceipt(order);

    });

  });

}


/* ==========================================
   45. SEARCH BILLS
========================================== */

$("searchBills")?.addEventListener("input", renderBills);


/* ==========================================
   46. PWA INSTALL
========================================== */

window.addEventListener("beforeinstallprompt", event => {

  event.preventDefault();

  deferredInstallPrompt = event;

  if ($("installAppBtn")) {
    $("installAppBtn").hidden = false;
  }

});


$("installAppBtn")?.addEventListener("click", async () => {

  if (!deferredInstallPrompt) {
    showToast("Install option is not available");
    return;
  }

  deferredInstallPrompt.prompt();

  const choice = await deferredInstallPrompt.userChoice;

  if (choice.outcome === "accepted") {
    showToast("App installation started");
  }

  deferredInstallPrompt = null;

  $("installAppBtn").hidden = true;

});


window.addEventListener("appinstalled", () => {

  deferredInstallPrompt = null;

  if ($("installAppBtn")) {
    $("installAppBtn").hidden = true;
  }

  showToast("IYYAANS CAFE installed");

});


/* ==========================================
   47. INITIALIZE APP
========================================== */

async function initializeApp() {

  loadSettings();

  renderCart();

  applyPresetRange("today");

  await loadMenuItems();

  await loadOrders();

}
initializeApp();