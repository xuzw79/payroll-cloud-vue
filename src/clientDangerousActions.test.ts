import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVue = readFileSync("src/App.vue", "utf8");
const sesVue = readFileSync("src/components/SesManagement.vue", "utf8");

assert.match(
  appVue,
  /v-if="canEditEmployees && employeeForm\.id"[^>]*@click="deleteEmployee"/,
  "社員の非表示ボタンは既存社員選択時だけ表示する"
);

assert.match(
  appVue,
  /v-if="canEditUsers && userForm\.id"[^>]*@click="deactivateUser"/,
  "ユーザー停止ボタンは既存ユーザー選択時だけ表示する"
);

assert.match(
  sesVue,
  /v-if="canEditSes && customerForm\.id"[^>]*@click="deleteCustomer"/,
  "取引先の非表示ボタンは既存取引先選択時だけ表示する"
);

assert.match(
  sesVue,
  /v-if="canEditSes && contractForm\.id"[^>]*@click="deleteContract"/,
  "契約の非表示ボタンは既存契約選択時だけ表示する"
);

console.log("clientDangerousActions tests passed");
