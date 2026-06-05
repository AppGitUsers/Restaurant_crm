# Restaurant CRM

Full-stack restaurant billing and management system.
**Stack:** Django 4.2 + DRF + PostgreSQL (backend) · React 18 + Vite + Tailwind (frontend)
**Theme:** Teal + Gold + White

---

## Project Structure

```
restaurant_crm/
├── backend/
│   ├── config/           # Django settings, urls, wsgi
│   ├── apps/
│   │   ├── accounts/     # JWT auth, CustomUser, ADMIN / BILLER roles
│   │   ├── menu/         # FoodType, FoodItem, Ingredient, RecipeIngredient
│   │   ├── inventory/    # Stock, Vendor, VendorInvoice, InvoicePayment (installments)
│   │   ├── billing/      # Order, OrderItem — signals → finance + inventory
│   │   ├── finance/      # Transaction, Expense, DailyReport
│   │   ├── staff/        # Employee, Shift, Attendance, StaffPayment
│   │   ├── customers/    # Customer, Visit — auto-tagged HIGH/MEDIUM/LOW/NEW
│   │   └── dashboard/    # Aggregated summary endpoint
│   ├── utils/
│   │   └── pdf_generator.py   # ReportLab bill PDF (teal + gold)
│   ├── media/
│   ├── manage.py
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── auth/         # LoginPage (admin) · BillerLogin (isolated)
        │   ├── dashboard/    # KPIs, charts, top items/customers
        │   ├── menu/         # Food items, categories, ingredients + recipe modal
        │   ├── inventory/    # Stock, vendor invoices (installments), vendors
        │   ├── billing/      # Billing board + cart + bill receipt PDF
        │   ├── finance/      # Income/expense overview + charts
        │   ├── staff/        # Employees, attendance calendar, payroll
        │   └── customers/    # Customer list + visit history
        ├── components/
        │   ├── layout/       # AdminLayout, BillerLayout, Sidebar, Topbar
        │   └── ui/           # Modal, Spinner, KpiCard, StatusBadge, SearchBar…
        ├── api/              # Axios client + all API functions
        ├── store/            # Zustand: authStore, cartStore
        └── main.jsx
```

---

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Copy and fill env
cp .env.example .env
# Edit .env: set DB_NAME, DB_USER, DB_PASSWORD, SECRET_KEY

# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE restaurant_crm;"

# Run migrations
python manage.py makemigrations accounts menu inventory billing finance staff customers dashboard
python manage.py migrate

# Create superuser (ADMIN role)
python manage.py createsuperuser

# Start server
python manage.py runserver
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:5173

---

## User Roles

| Role   | Access                              | Login URL       |
|--------|-------------------------------------|-----------------|
| ADMIN  | All dashboards                      | /login          |
| BILLER | Billing dashboard only              | /biller-login   |

Create biller users via Django admin or the Users page (admin only).

---

## Key Flows

### Billing → Finance + Inventory
1. Biller adds items to cart → confirms order → pays
2. On PAID: inventory stock is reduced per recipe ingredients
3. Finance gets INCOME transaction auto-created
4. Customer visit is recorded (if phone provided)
5. Menu `makeable_count` recalculated for all items

### Vendor Invoice → Inventory
1. Admin creates vendor invoice with items
2. Mark as "Received" → stock quantities increase
3. Add payments (installments) → finance EXPENSE auto-created
4. Invoice status: UNPAID → PARTIAL → PAID

### Recipe → Makeable Count
- Each FoodItem has RecipeIngredients (ingredient + qty per serving)
- `makeable_count = min(floor(stock / required_qty) for each ingredient)`
- Shown on menu cards for both admin and billers
- Red "Out of Stock" overlay when makeable_count = 0

---

## Environment Variables

```env
SECRET_KEY=your-secret-key
DEBUG=True
DB_NAME=restaurant_crm
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

---

## API Endpoints

| Module    | Base URL           |
|-----------|--------------------|
| Auth      | /api/auth/         |
| Menu      | /api/menu/         |
| Inventory | /api/inventory/    |
| Billing   | /api/billing/      |
| Finance   | /api/finance/      |
| Staff     | /api/staff/        |
| Customers | /api/customers/    |
| Dashboard | /api/dashboard/    |

Full browsable API: http://localhost:8000/api/

---

## Build Order Completed

1. ✅ accounts — JWT auth, roles, biller isolation
2. ✅ menu + inventory — data foundation, stock calculator
3. ✅ billing — order flow, signals to finance + inventory
4. ✅ finance — transaction tracking, expense management
5. ✅ staff — employees, attendance calendar, payroll
6. ✅ customers — visit tracking, frequency tags
7. ✅ dashboard — aggregated KPIs and charts
