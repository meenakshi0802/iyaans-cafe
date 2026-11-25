/* ==========================================
   1. STORAGE
========================================== */

const API_URL = "https://iyaans-cafe-backend.onrender.com/api";
async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("adminToken");

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    localStorage.removeItem("adminToken");
    window.location.href = "login.html";
    throw new Error("Session expired. Please login again.");
  }

  return response;
}

const STORAGE_KEYS = {
  items: "iyyaans_menu_items",
  orders: "iyyaans_orders",
  settings: "iyyaans_settings"
};

function loadData(key, fallback) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (error) {
    console.error("Storage error:", error);
    return fallback;
  }
}

// Items and Orders are loaded from MongoDB
let menuItems = [];
let orders = [];

let settings = loadData(STORAGE_KEYS.settings, {
  cafeName: "IYYAANS CAFE",
  receiptFooter: "Thank you! Visit Again",
  printerType: "System",
  paperSize: "80mm"
});

let cart = [];
let activeCategory = "All";
let selectedPaymentBill = null;
let currentReceiptOrder = null;


/* ==========================================
   2. ELEMENT SELECTOR
========================================== */

const $ = (id) => document.getElementById(id);

const menuGrid = $("menuGrid");
const cartItems = $("cartItems");
const cartPanel = $("cartPanel");
const cartBadge = $("cartBadge");


/* ==========================================
   3. HELPER FUNCTIONS
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

// Only settings are stored in localStorage
function saveData() {
  localStorage.setItem(
    STORAGE_KEYS.settings,
    JSON.stringify(settings)
  );
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function openModal(id) {
  const modal = $(id);

  if (!modal) {
    console.error("Modal not found:", id);
    showToast("Modal not found. Check HTML ID.");
    return;
  }

  modal.classList.add("show");
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove("show");
}

function getDateTime() {
  return new Date().toLocaleString("en-IN");
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

    const targetPage = $(page + "Page");

    if (targetPage) targetPage.classList.add("active");

    const titles = {
      orders: "Orders",
      billing: "Billing",
      reports: "Reports",
      settings: "Settings"
    };

    $("pageTitle").textContent = titles[page] || "Orders";
    $("sidebar").classList.remove("open");

    if (page === "billing") renderBills();
    if (page === "reports") renderReports();
  });
});

/* ==========================================
   ADMIN LOGOUT
========================================== */

$("logoutBtn").addEventListener("click", () => {

  const confirmLogout = confirm("Are you sure you want to logout?");

  if (!confirmLogout) return;

  localStorage.removeItem("adminToken");

  window.location.replace("login.html");

});


/* ==========================================
   5. MOBILE SIDEBAR
========================================== */

$("menuToggle").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});


/* ==========================================
   6. CART OPEN / CLOSE
========================================== */

$("cartToggle").addEventListener("click", () => {
  cartPanel.classList.add("cart-open");
});

$("closeCart").addEventListener("click", () => {
  cartPanel.classList.remove("cart-open");
});


/* ==========================================
   7. MODAL CONTROLS
========================================== */

document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => {
    closeModal(button.dataset.close);
  });
});

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      overlay.classList.remove("show");
    }
  });
});


/* ==========================================
   8. ADD NEW ITEM - MONGODB
========================================== */

// Add Item button
const addItemButton = $("addItemBtn");

if (addItemButton) {
  addItemButton.addEventListener("click", event => {
    event.preventDefault();

    const form = $("itemForm");

    if (form) form.reset();

    openModal("itemModal");
  });
} else {
  console.error("Add Item button not found. Check id='addItemBtn' in HTML.");
}


// Save new item
const itemForm = $("itemForm");

if (itemForm) {
  itemForm.addEventListener("submit", async event => {
    event.preventDefault();

    const name = $("newItemName").value.trim();
    const price = Number($("newItemPrice").value);
    const category = $("newItemCategory").value.trim();

    if (
      !name ||
      !category ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      showToast("Please enter valid item details");
      return;
    }

    const submitButton = itemForm.querySelector(
      'button[type="submit"]'
    );

    if (submitButton) submitButton.disabled = true;

    try {
      const response = await apiFetch(`${API_URL}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name,
          price,
          category
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to save item");
      }

      const newItem = {
        id: String(data._id),
        name: data.name,
        price: Number(data.price),
        category: data.category
      };

      menuItems.unshift(newItem);

      renderCategories();
      renderMenu();

      closeModal("itemModal");
      itemForm.reset();

      showToast("Item saved to MongoDB!");

    } catch (error) {
      console.error("Add item error:", error);
      showToast("Item not saved. Check backend connection.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
} else {
  console.error("Item form not found. Check id='itemForm' in HTML.");
}


/* ==========================================
   9. RENDER CATEGORIES
========================================== */

function renderCategories() {
  const categories = [
    "All",
    ...new Set(menuItems.map(item => item.category))
  ];

  if (!categories.includes(activeCategory)) {
    activeCategory = "All";
  }

  $("categories").innerHTML = categories.map(category => `
    <button
      class="category-btn ${
        activeCategory === category ? "active" : ""
      }"
      data-category="${escapeHTML(category)}"
    >
      ${escapeHTML(category)}
    </button>
  `).join("");

  document.querySelectorAll(".category-btn").forEach(button => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      renderCategories();
      renderMenu();
    });
  });
}


/* ==========================================
   10. RENDER MENU ITEMS
========================================== */

function renderMenu() {
  const search = $("searchItems").value.toLowerCase().trim();

  const filteredItems = menuItems.filter(item => {
    const matchesCategory =
      activeCategory === "All" ||
      item.category === activeCategory;

    const matchesSearch =
      item.name.toLowerCase().includes(search);

    return matchesCategory && matchesSearch;
  });

  $("menuCount").textContent = `${filteredItems.length} Items`;

  if (filteredItems.length === 0) {
    menuGrid.innerHTML = `
      <div class="no-items">
        No menu items found
      </div>
    `;
    return;
  }

  menuGrid.innerHTML = filteredItems.map(item => `
    <div class="menu-card">
      <div class="food-icon">🍽️</div>

      <h4>${escapeHTML(item.name)}</h4>

      <small>${escapeHTML(item.category)}</small>

      <div class="menu-card-bottom">
        <span class="menu-price">
          ${money(item.price)}
        </span>

        <button
          type="button"
          class="add-cart-btn"
          data-add-cart="${escapeHTML(item.id)}"
        >
          + Add
        </button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-add-cart]").forEach(button => {
    button.addEventListener("click", () => {
      addToCart(button.dataset.addCart);
    });
  });
}


/* ==========================================
   11. SEARCH MENU
========================================== */

$("searchItems").addEventListener("input", renderMenu);


/* ==========================================
   12. ADD ITEM TO CART
========================================== */

function addToCart(itemId) {
  const item = menuItems.find(
    item => String(item.id) === String(itemId)
  );

  if (!item) return;

  const existing = cart.find(
    cartItem => String(cartItem.id) === String(itemId)
  );

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: String(item.id),
      name: item.name,
      price: Number(item.price),
      quantity: 1
    });
  }

  renderCart();
  showToast(item.name + " added to cart");
}


/* ==========================================
   13. CHANGE CART QUANTITY
========================================== */

function changeQuantity(itemId, change) {
  const item = cart.find(
    cartItem => String(cartItem.id) === String(itemId)
  );

  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    cart = cart.filter(
      cartItem => String(cartItem.id) !== String(itemId)
    );
  }

  renderCart();
}


/* ==========================================
   14. CLEAR CART
========================================== */

$("clearCart").addEventListener("click", () => {
  if (cart.length === 0) {
    showToast("Cart is already empty");
    return;
  }

  if (!confirm("Clear all cart items?")) return;

  cart = [];
  $("discountAmount").value = 0;

  renderCart();
  showToast("Cart cleared");
});


/* ==========================================
   15. CART TOTAL CALCULATION
========================================== */

function getCartTotals() {
  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const tax = 0;

  let discount = Number($("discountAmount").value || 0);

  if (!Number.isFinite(discount) || discount < 0) {
    discount = 0;
  }

  discount = Math.min(discount, subtotal + tax);

  const total = subtotal + tax - discount;

  return {
    subtotal,
    tax,
    discount,
    total
  };
}


/* ==========================================
   16. UPDATE CART TOTAL
========================================== */

function updateCartTotal() {
  const totals = getCartTotals();

  $("subtotal").textContent = money(totals.subtotal);
  $("tax").textContent = money(totals.tax);
  $("discountValue").textContent = money(totals.discount);
  $("total").textContent = money(totals.total);
}


/* ==========================================
   17. DISCOUNT INPUT
========================================== */

$("discountAmount").addEventListener("input", () => {
  updateCartTotal();
});


/* ==========================================
   18. RENDER CART
========================================== */

function renderCart() {
  const totalQuantity = cart.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  $("cartCount").textContent = totalQuantity;
  cartBadge.textContent = totalQuantity;

  if (cart.length === 0) {
    cartItems.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon">🛒</div>
        <h4>Your cart is empty</h4>
        <p>Select items from the menu</p>
      </div>
    `;
  } else {
    cartItems.innerHTML = cart.map(item => `
      <div class="cart-row">
        <div>
          <h4>${escapeHTML(item.name)}</h4>
          <small>${money(item.price)} each</small>

          <div class="quantity-control">
            <button type="button" data-minus="${escapeHTML(item.id)}">
              −
            </button>

            <strong>${item.quantity}</strong>

            <button type="button" data-plus="${escapeHTML(item.id)}">
              +
            </button>
          </div>
        </div>

        <div class="cart-price">
          ${money(item.price * item.quantity)}
        </div>
      </div>
    `).join("");

    document.querySelectorAll("[data-minus]").forEach(button => {
      button.addEventListener("click", () => {
        changeQuantity(button.dataset.minus, -1);
      });
    });

    document.querySelectorAll("[data-plus]").forEach(button => {
      button.addEventListener("click", () => {
        changeQuantity(button.dataset.plus, 1);
      });
    });
  }

  updateCartTotal();
}
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
   20. CREATE ORDER - MONGODB
========================================== */
let isSavingorder = false;
async function createOrder() {

  if (isSavingOrder) {
    showToast("Order is already saving");
    return null;
  }

  if (cart.length === 0) {
    showToast("Please add items first");
    return null;
  }

  isSavingOrder = true;
  const totals = getCartTotals();

  const orderData = {
    billNumber: generateBillNumber(),

    items: cart.map(item => ({
      id: String(item.id),
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity
    })),

    subtotal: totals.subtotal,
    tax: totals.tax,
    discount: totals.discount,
    total: totals.total,

    status: "Unsettled",
    paymentMethod: "",
    cashAmount: 0,
    gpayAmount: 0,

    date: new Date().toISOString(),
    dateText: getDateTime()
  };

  try {
    const response = await apiFetch(`${API_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orderData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Order save failed");
    }

    const order = {
      ...data,
      id: String(data._id)
    };

    orders.unshift(order);

    cart = [];
    $("discountAmount").value = 0;

    renderCart();
    renderBills();
    renderReports();

    return order;

  } catch (error) {
    console.error("Create order error:", error);
    showToast("Order save failed. Check backend.");
    return null;

  } finally {
    isSavingOrder = false;
  }
}


/* ==========================================
   21. SAVE ORDER
========================================== */

$("saveOrder").addEventListener("click", async () => {
  const order = await createOrder();

  if (!order) return;

  cartPanel.classList.remove("cart-open");

  showToast("Order saved! Bill #" + order.billNumber);
});


/* ==========================================
   22. SAVE AND PRINT ORDER
========================================== */

$("savePrint").addEventListener("click", async () => {
  const order = await createOrder();

  if (!order) return;

  cartPanel.classList.remove("cart-open");

  openReceipt(order);

  showToast("Order saved successfully");
});


/* ==========================================
   23. RENDER BILLING PAGE
========================================== */

function renderBills() {
  const search = $("searchBills").value.toLowerCase().trim();

  // Billing page-la Unsettled bills mattum
  const unsettledOrders = orders.filter(order =>
    order.status === "Unsettled" &&
    String(order.billNumber).toLowerCase().includes(search)
  );

  $("billCount").textContent =
    orders.filter(order => order.status === "Unsettled").length;

  $("unsettledCount").textContent =
    orders.filter(order => order.status === "Unsettled").length;

  $("settledCount").textContent =
    orders.filter(order => order.status === "Settled").length;

  if (unsettledOrders.length === 0) {
    $("billList").innerHTML = `
      <div class="empty-message">
        No pending bills available
      </div>
    `;
    return;
  }

  $("billList").innerHTML = unsettledOrders.map(order => `
    <div class="bill-row">
      <div class="bill-info">
        <strong>Bill #${escapeHTML(order.billNumber)}</strong>
        <small>${escapeHTML(order.dateText || "")}</small>
        <small>
          ${order.items.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
          )} items
        </small>
      </div>

      <div class="bill-actions">
        <span class="bill-amount">
          ${money(order.total)}
        </span>

        <span class="status">Unsettled</span>

        <button type="button" class="small-action"
          data-pay="${escapeHTML(order.id)}">
          Settle
        </button>

        <button type="button" class="small-action"
          data-delete="${escapeHTML(order.id)}">
          Delete
        </button>
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-pay]").forEach(button => {
    button.addEventListener("click", () => {
      openPayment(button.dataset.pay);
    });
  });

  document.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => {
      deleteBill(button.dataset.delete);
    });
  });
}

/* ==========================================
   24. SEARCH BILLS
========================================== */

$("searchBills").addEventListener("input", renderBills);


/* ==========================================
   25. DELETE UNSETTLED BILL - MONGODB
========================================== */

async function deleteBill(orderId) {
  const order = orders.find(item => item.id === orderId);

  if (!order || order.status !== "Unsettled") return;

  if (!confirm("Delete bill #" + order.billNumber + "?")) {
    return;
  }

  try {
    const response = await apiFetch(
      `${API_URL}/orders/${orderId}`,
      {
        method: "DELETE"
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Delete failed");
    }

    orders = orders.filter(item => item.id !== orderId);

    renderBills();
    renderReports();

    showToast("Bill deleted successfully");

  } catch (error) {
    console.error("Delete bill error:", error);
    showToast("Bill delete failed");
  }
}


/* ==========================================
   26. OPEN PAYMENT MODAL
========================================== */

function openPayment(orderId) {
  const order = orders.find(item => item.id === orderId);

  if (!order || order.status !== "Unsettled") return;

  selectedPaymentBill = order;

  $("paymentBillInfo").innerHTML = `
    <div class="content-box">
      <strong>Bill #${escapeHTML(order.billNumber)}</strong>
      <h2>${money(order.total)}</h2>
    </div>
  `;

  $("paymentMethod").value = "Cash";
  $("splitCash").value = "";
  $("splitGpay").value = "";
  $("splitFields").classList.add("hidden");

  openModal("paymentModal");
}


/* ==========================================
   27. PAYMENT METHOD CHANGE
========================================== */

$("paymentMethod").addEventListener("change", () => {
  if ($("paymentMethod").value === "Split") {
    $("splitFields").classList.remove("hidden");
  } else {
    $("splitFields").classList.add("hidden");
  }
});


/* ==========================================
   28. CONFIRM PAYMENT - MONGODB
========================================== */

$("confirmPayment").addEventListener("click", async () => {
  if (!selectedPaymentBill) return;

  const method = $("paymentMethod").value;
  const total = Number(selectedPaymentBill.total);

  let cash = 0;
  let gpay = 0;

  if (method === "Cash") cash = total;
  if (method === "GPay") gpay = total;

  if (method === "Split") {
    cash = Number($("splitCash").value);
    gpay = Number($("splitGpay").value);

    if (
      !Number.isFinite(cash) ||
      !Number.isFinite(gpay) ||
      cash < 0 ||
      gpay < 0 ||
      Math.abs(cash + gpay - total) > 0.01
    ) {
      showToast("Cash + GPay must equal bill total");
      return;
    }

    if (cash === 0 || gpay === 0) {
      showToast("Enter both Cash and GPay amounts");
      return;
    }
  }

  const confirmButton = $("confirmPayment");
  confirmButton.disabled = true;

  try {
    const response = await apiFetch(
      `${API_URL}/orders/${selectedPaymentBill.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: "Settled",
          paymentMethod: method,
          cashAmount: cash,
          gpayAmount: gpay,
          settledAt: new Date().toISOString()
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Payment update failed");
    }

    const updatedOrder = {
      ...data,
      id: String(data._id)
    };

    orders = orders.map(order =>
      order.id === updatedOrder.id ? updatedOrder : order
    );

    closeModal("paymentModal");
    selectedPaymentBill = null;

    renderBills();
    renderReports();

    showToast("Payment settled successfully!");

  } catch (error) {
    console.error("Settlement error:", error);
    showToast("Payment update failed. Try again.");
  } finally {
    confirmButton.disabled = false;
  }
});


/* ==========================================
   29. REPORTS
========================================== */

function renderReports() {
  const today = new Date().toDateString();

  const todayOrders = orders.filter(order =>
    new Date(order.date).toDateString() === today
  );

  const settledOrders = todayOrders.filter(
    order => order.status === "Settled"
  );

  const pendingOrders = todayOrders.filter(
    order => order.status === "Unsettled"
  );

  const sales = settledOrders.reduce(
    (sum, order) => sum + Number(order.total),
    0
  );

  $("reportSales").textContent = money(sales);
  $("reportOrders").textContent = todayOrders.length;
  $("reportSettled").textContent = settledOrders.length;
  $("reportPending").textContent = pendingOrders.length;

  const cash = settledOrders.reduce(
    (sum, order) => sum + Number(order.cashAmount || 0),
    0
  );

  const gpay = settledOrders.reduce(
    (sum, order) => sum + Number(order.gpayAmount || 0),
    0
  );

  const split = settledOrders
    .filter(order => order.paymentMethod === "Split")
    .reduce((sum, order) => sum + Number(order.total), 0);

  $("paymentSummary").innerHTML = `
    <div class="payment-line">
      <span>Cash</span>
      <strong>${money(cash)}</strong>
    </div>

    <div class="payment-line">
      <span>GPay / UPI</span>
      <strong>${money(gpay)}</strong>
    </div>

    <div class="payment-line">
      <span>Split Payment</span>
      <strong>${money(split)}</strong>
    </div>
  `;

  if (todayOrders.length === 0) {
    $("reportTransactions").innerHTML = `
      <div class="empty-message">
        No transactions available today
      </div>
    `;
  } else {
    $("reportTransactions").innerHTML =
      todayOrders.map(order => `
        <div class="bill-row">
          <div class="bill-info">
            <strong>Bill #${escapeHTML(order.billNumber)}</strong>
            <small>${escapeHTML(order.dateText || "")}</small>
          </div>

          <div class="bill-actions">
            <span class="bill-amount">
              ${money(order.total)}
            </span>

            <span class="status">
              ${escapeHTML(order.status)}
            </span>
          </div>
        </div>
      `).join("");
  }
}


/* ==========================================
   30. REFRESH REPORTS
========================================== */

$("refreshReports").addEventListener("click", () => {
  renderReports();
  showToast("Reports updated");
});


/* ==========================================
   31. BUSINESS SETTINGS
========================================== */

function loadSettings() {
  $("cafeName").value = settings.cafeName;
  $("receiptFooter").value = settings.receiptFooter;
  $("printerType").value = settings.printerType;
  $("paperSize").value = settings.paperSize;
}

$("saveSettings").addEventListener("click", () => {
  settings.cafeName =
    $("cafeName").value.trim() || "IYYAANS CAFE";

  settings.receiptFooter =
    $("receiptFooter").value.trim();

  saveData();

  showToast("Business settings saved");
});


/* ==========================================
   32. PRINTER SETTINGS
========================================== */

$("savePrinter").addEventListener("click", () => {
  settings.printerType = $("printerType").value;
  settings.paperSize = $("paperSize").value;

  saveData();

  showToast("Printer settings saved");
});


/* ==========================================
   33. RECEIPT PREVIEW
========================================== */

function openReceipt(order) {
  currentReceiptOrder = order;

  const itemsHTML = order.items.map(item => `
    <div class="receipt-item">
      <span>
        ${escapeHTML(item.name)} x ${item.quantity}
      </span>

      <strong>
        ${money(item.price * item.quantity)}
      </strong>
    </div>
  `).join("");

  $("receiptContent").innerHTML = `
    <div class="receipt-center">
      <h2>${escapeHTML(settings.cafeName)}</h2>
      <p>Bill Receipt</p>
      <p>${escapeHTML(order.dateText || "")}</p>
    </div>

    <div class="receipt-line"></div>

    <p>Bill No: ${escapeHTML(order.billNumber)}</p>

    <div class="receipt-line"></div>

    ${itemsHTML}

    <div class="receipt-line"></div>

    <div class="receipt-item">
      <span>Subtotal</span>
      <strong>${money(order.subtotal)}</strong>
    </div>

    <div class="receipt-item">
      <span>Tax</span>
      <strong>${money(order.tax)}</strong>
    </div>

    <div class="receipt-item">
      <span>Discount</span>
      <strong>${money(order.discount || 0)}</strong>
    </div>

    <div class="receipt-line"></div>

    <div class="receipt-item">
      <strong>TOTAL</strong>
      <strong>${money(order.total)}</strong>
    </div>

    <div class="receipt-line"></div>

    <div class="receipt-center">
      <p>${escapeHTML(settings.receiptFooter)}</p>
    </div>
  `;

  openModal("receiptModal");
}


/* ==========================================
   34. PRINT RECEIPT
========================================== */

$("printReceipt").addEventListener("click", () => {
  if (!currentReceiptOrder) return;

  window.print();
});


/* ==========================================
   35. DATE DISPLAY
========================================== */

$("dateText").textContent = new Date().toLocaleDateString(
  "en-IN",
  {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }
);


/* ==========================================
   36. LOAD DATA FROM MONGODB
========================================== */

// Load menu items
async function loadMenuItems() {
  try {
    const response = await apiFetch(`${API_URL}/items`);

    if (!response.ok) {
      throw new Error("Unable to fetch menu items");
    }

    const data = await response.json();

    menuItems = data.map(item => ({
      id: String(item._id),
      name: item.name,
      price: Number(item.price),
      category: item.category
    }));

    console.log("Menu items loaded from MongoDB:", menuItems.length);

  } catch (error) {
    console.error("Menu loading error:", error);
    showToast("Menu loading failed. Check backend.");
  }
}


// Load orders
async function loadOrders() {
  try {
    const response = await apiFetch(`${API_URL}/orders`);

    if (!response.ok) {
      throw new Error("Unable to load orders");
    }

    const data = await response.json();

    orders = data.map(order => ({
      ...order,
      id: String(order._id)
    }));

    console.log("Orders loaded from MongoDB:", orders.length);

  } catch (error) {
    console.error("Order loading error:", error);
    showToast("Orders loading failed. Check backend.");
  }
}


/* ==========================================
   37. INITIALIZE APPLICATION
========================================== */

async function initializeApp() {
  await loadMenuItems();
  await loadOrders();

  renderCategories();
  renderMenu();
  renderCart();
  renderBills();
  renderReports();
  loadSettings();

  $("discountAmount").value = 0;

  cartPanel.classList.remove("cart-open");

  console.log("IYYAANS CAFE POS Ready!");
}

initializeApp();