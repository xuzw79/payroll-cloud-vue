import { filterActiveMembersForPeriod, memberActiveInPeriod, type PeriodMember } from "./sesPeriod.js";

export type PartnerCostContract<TMember extends PeriodMember> = {
  members: TMember[];
};

export type PartnerCostRecord = {
  period: string;
  contractMember?: PeriodMember | null;
};

export type PartnerCostRepairRecord = PartnerCostRecord & {
  id: string;
  contractId: string;
  contractMemberId?: string | null;
  employeeId?: string | null;
  externalMemberId?: string | null;
  title: string;
  updatedAt?: string | Date | null;
};

export function activePartnerCostRows<TContract extends PartnerCostContract<TMember>, TMember extends PeriodMember>(
  contracts: TContract[],
  period: string
) {
  return contracts.flatMap((contract) =>
    filterActiveMembersForPeriod(contract.members, period).map((member) => ({ contract, member }))
  );
}

export function filterActivePartnerCostsForOwnPeriod<TCost extends PartnerCostRecord>(costs: TCost[]) {
  return costs.filter((cost) => cost.contractMember && memberActiveInPeriod(cost.contractMember, cost.period));
}

export function partnerCostDefaultAmount(unitPrice: number, taxIncluded?: boolean | null, taxRate = 0.1) {
  const amount = Number(unitPrice || 0);
  return taxIncluded ? amount : Math.round(amount * (1 + taxRate));
}

function repairGroupKey(cost: PartnerCostRepairRecord) {
  const memberKey = cost.employeeId
    ? `employee:${cost.employeeId}`
    : cost.externalMemberId
      ? `external:${cost.externalMemberId}`
      : `none:${cost.title}`;
  return [cost.period, cost.contractId, memberKey, cost.title].join("|");
}

function updatedTime(cost: PartnerCostRepairRecord) {
  if (!cost.updatedAt) return 0;
  const value = typeof cost.updatedAt === "string" ? cost.updatedAt : cost.updatedAt.toISOString();
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function planPartnerCostRepair(costs: PartnerCostRepairRecord[]) {
  const groups = new Map<string, PartnerCostRepairRecord[]>();
  for (const cost of costs) {
    const items = groups.get(repairGroupKey(cost)) || [];
    items.push(cost);
    groups.set(repairGroupKey(cost), items);
  }

  const keepIds: string[] = [];
  const deactivateIds: string[] = [];
  let changedGroupCount = 0;

  for (const group of groups.values()) {
    const activeForPeriod = group.filter((cost) => cost.contractMember && memberActiveInPeriod(cost.contractMember, cost.period));
    if (!activeForPeriod.length) {
      deactivateIds.push(...group.map((cost) => cost.id));
      changedGroupCount += group.length ? 1 : 0;
      continue;
    }

    const [keeper, ...duplicates] = [...activeForPeriod].sort((a, b) => updatedTime(b) - updatedTime(a));
    keepIds.push(keeper.id);
    const inactiveForPeriod = group.filter((cost) => !activeForPeriod.some((active) => active.id === cost.id));
    const groupDeactivateIds = [...duplicates, ...inactiveForPeriod].map((cost) => cost.id);
    if (groupDeactivateIds.length) changedGroupCount += 1;
    deactivateIds.push(...groupDeactivateIds);
  }

  return {
    scannedCount: costs.length,
    keepIds,
    deactivateIds,
    changedGroupCount
  };
}
