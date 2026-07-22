<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Plus, Save, Search, Trash2 } from "lucide-vue-next";

type SesSubMenu = "customers" | "projects" | "revenue" | "partnerCosts" | "profit";

type Customer = {
  id: string;
  name: string;
  code?: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  address?: string | null;
  invoiceNumber?: string | null;
  closingDay?: number | null;
  paymentSiteDays?: number | null;
  memo?: string | null;
};

const props = defineProps<{ canEditSes: boolean }>();
const emit = defineEmits<{ message: [value: string] }>();

const subMenus: { key: SesSubMenu; label: string; description: string }[] = [
  { key: "customers", label: "取引先管理", description: "顧客・協力会社の基本情報を管理します。" },
  { key: "projects", label: "案件・契約管理", description: "月額請負額、契約期間、作業者、顧客を管理します。" },
  { key: "revenue", label: "月次売上入力", description: "社員別・案件別の毎月売上を登録します。" },
  { key: "partnerCosts", label: "外注費入力", description: "協力会社への月額支払を登録します。" },
  { key: "profit", label: "個人別利益", description: "売上、給与、外注費から利益を確認します。" }
];

const activeSubMenu = ref<SesSubMenu>("customers");
const loading = ref(false);
const query = ref("");
const customers = ref<Customer[]>([]);
const selectedCustomerId = ref("");

const activeMenuInfo = computed(() => subMenus.find((menu) => menu.key === activeSubMenu.value) || subMenus[0]);

const customerForm = reactive({
  id: "",
  name: "",
  code: "",
  contactName: "",
  email: "",
  phone: "",
  postalCode: "",
  address: "",
  invoiceNumber: "",
  closingDay: null as number | null,
  paymentSiteDays: null as number | null,
  memo: ""
});

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "include",
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "通信に失敗しました" }));
    throw new Error(error.message || "通信に失敗しました");
  }
  return response.json();
}

function resetCustomerForm() {
  Object.assign(customerForm, {
    id: "",
    name: "",
    code: "",
    contactName: "",
    email: "",
    phone: "",
    postalCode: "",
    address: "",
    invoiceNumber: "",
    closingDay: null,
    paymentSiteDays: null,
    memo: ""
  });
  selectedCustomerId.value = "";
}

function applyCustomer(customer?: Customer) {
  if (!customer) {
    resetCustomerForm();
    return;
  }
  Object.assign(customerForm, {
    id: customer.id,
    name: customer.name,
    code: customer.code || "",
    contactName: customer.contactName || "",
    email: customer.email || "",
    phone: customer.phone || "",
    postalCode: customer.postalCode || "",
    address: customer.address || "",
    invoiceNumber: customer.invoiceNumber || "",
    closingDay: customer.closingDay ?? null,
    paymentSiteDays: customer.paymentSiteDays ?? null,
    memo: customer.memo || ""
  });
  selectedCustomerId.value = customer.id;
}

async function refreshCustomers() {
  loading.value = true;
  try {
    customers.value = await request<Customer[]>(`/customers?q=${encodeURIComponent(query.value)}`);
  } finally {
    loading.value = false;
  }
}

async function saveCustomer() {
  if (!props.canEditSes) return;
  const method = customerForm.id ? "PUT" : "POST";
  const path = customerForm.id ? `/customers/${customerForm.id}` : "/customers";
  const customer = await request<Customer>(path, { method, body: JSON.stringify(customerForm) });
  emit("message", "取引先を保存しました");
  await refreshCustomers();
  applyCustomer(customer);
}

async function deleteCustomer() {
  if (!props.canEditSes || !customerForm.id || !confirm("この取引先を非表示にしますか？")) return;
  await request(`/customers/${customerForm.id}`, { method: "DELETE" });
  emit("message", "取引先を非表示にしました");
  resetCustomerForm();
  await refreshCustomers();
}

onMounted(refreshCustomers);
</script>

<template>
  <div class="ses-workspace">
    <nav class="sub-menu" aria-label="SES管理メニュー">
      <button
        v-for="menu in subMenus"
        :key="menu.key"
        :class="{ active: activeSubMenu === menu.key }"
        @click="activeSubMenu = menu.key"
      >
        {{ menu.label }}
      </button>
    </nav>

    <section v-if="activeSubMenu === 'customers'" class="panel">
      <div class="panel-head">
        <h2>取引先管理</h2>
        <button v-if="canEditSes" @click="applyCustomer()"><Plus :size="16" />追加</button>
      </div>
      <div class="ses-layout">
        <div class="ses-list">
          <div class="filter-row ses-search">
            <label>取引先検索<input v-model="query" placeholder="会社名・コード・担当者" @keyup.enter="refreshCustomers" /></label>
            <button class="primary" @click="refreshCustomers"><Search :size="16" />検索</button>
          </div>
          <button
            v-for="customer in customers"
            :key="customer.id"
            class="employee-item"
            :class="{ active: customer.id === selectedCustomerId }"
            @click="applyCustomer(customer)"
          >
            <strong>{{ customer.name }}</strong>
            <span>{{ customer.code || "コードなし" }} / {{ customer.contactName || "担当者未設定" }}</span>
          </button>
          <div v-if="!customers.length" class="empty">
            {{ loading ? "読込中..." : "取引先が登録されていません。" }}
          </div>
        </div>

        <div class="form-grid">
          <label>取引先名<input v-model="customerForm.name" /></label>
          <label>取引先コード<input v-model="customerForm.code" /></label>
          <label>担当者<input v-model="customerForm.contactName" /></label>
          <label>メール<input v-model="customerForm.email" type="email" /></label>
          <label>電話番号<input v-model="customerForm.phone" /></label>
          <label>郵便番号<input v-model="customerForm.postalCode" /></label>
          <label class="wide">住所<input v-model="customerForm.address" /></label>
          <label>インボイス番号<input v-model="customerForm.invoiceNumber" /></label>
          <label>締日<input v-model.number="customerForm.closingDay" type="number" min="1" max="31" /></label>
          <label>支払サイト日数<input v-model.number="customerForm.paymentSiteDays" type="number" min="0" /></label>
          <label class="wide">メモ<input v-model="customerForm.memo" /></label>
          <div class="form-actions full">
            <button v-if="canEditSes" @click="deleteCustomer"><Trash2 :size="16" />非表示</button>
            <button v-if="canEditSes" class="primary" @click="saveCustomer"><Save :size="16" />取引先保存</button>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="panel">
      <div class="panel-head"><h2>{{ activeMenuInfo.label }}</h2></div>
      <div class="ses-cards">
        <div>
          <strong>{{ activeMenuInfo.label }}</strong>
          <span>{{ activeMenuInfo.description }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
